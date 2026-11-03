import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { canonicalJson, sha256 } from '../core/hash.ts';
import { redact } from '../core/redact.ts';
import { parseModule } from '../frameworks/ast.ts';
import { parseHtml } from '../html/parse.ts';
import { parseRobots } from '../robots/robots.ts';
import { clusterPath } from '../rules/context.ts';
import { subjectKey, type Evaluation, type Report, type Subject } from '../types.ts';
import { VARIANTS, type FixProposal, type VerificationLevel } from './plan.ts';
import { startServe } from './serve.ts';

export type Outcome = 'verified' | 'applied_unverified' | 'rolled_back';
export type CheckStatus = 'pass' | 'fail' | 'not_run';

export interface Check {
  readonly level: VerificationLevel;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface ChangeReport {
  readonly fixId: string;
  readonly variant: string;
  readonly class: string;
  readonly ruleId: string;
  readonly subjects: readonly string[];
  readonly fingerprints: readonly string[];
  readonly files: readonly { readonly path: string; readonly linesChanged: number; readonly created: boolean }[];
  readonly conditionBefore: string;
  readonly conditionAfter: string;
  readonly newAffectedFindings: readonly string[];
  readonly verification: { readonly required: VerificationLevel; readonly achieved: VerificationLevel | null; readonly checks: readonly Check[] };
  readonly runtime_observation: 'changed' | 'unchanged' | 'unavailable';
  readonly source_freshness: 'confirmed' | 'unconfirmed';
  readonly freshness_basis: string | null;
  readonly rule_outcome: 'pass' | 'fail' | 'not_evaluated' | 'error';
  readonly runtime_unavailable: string | null;
  readonly outcome: Outcome;
  readonly snapshot: string;
}

export interface Rescanner {
  /** Repo-only re-scan of the working tree as it is on disk now. */
  repo(): Promise<Report>;
  /** URL-only scan of specific URLs (no crawl). */
  urls(urls: readonly string[]): Promise<Report>;
}

export interface VerifyAuthority {
  readonly commands: readonly (readonly string[])[];
  readonly serve: { readonly command: readonly string[]; readonly url: string; readonly readyTimeoutSeconds: number } | null;
  /** A server the developer runs. Observation only: never confirms freshness. */
  readonly observeUrl: string | null;
  readonly runtimeTimeoutSeconds: number;
}

export interface ManifestEntry {
  readonly fixId: string;
  readonly outcome: Outcome;
  readonly proposal: Pick<FixProposal, 'variant' | 'ruleId' | 'subCheck' | 'subjects' | 'required' | 'affectedRoutes' | 'fingerprints' | 'class' | 'title'>;
  readonly files: readonly { readonly path: string; readonly existedBefore: boolean; readonly beforeHash: string | null; readonly afterHash: string; readonly snapshot: string | null }[];
  readonly lastWriteMs: number;
}

export interface Manifest {
  readonly runId: string;
  readonly appliedAt: string;
  readonly fixes: ManifestEntry[];
}

const LEVEL_ORDER: readonly VerificationLevel[] = ['V1', 'V2', 'V3', 'V4'];

function manifestPath(runDir: string): string {
  return join(runDir, 'fix', 'manifest.json');
}

export function readManifest(runDir: string): Manifest | null {
  const p = manifestPath(runDir);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Manifest) : null;
}

function writeManifest(runDir: string, m: Manifest): void {
  mkdirSync(join(runDir, 'fix'), { recursive: true });
  writeFileSync(manifestPath(runDir), canonicalJson(m));
}

function v1(path: string, content: string): Check {
  if (/\.(tsx?|jsx?|mjs|cjs|mts|cts)$/.test(path)) {
    const r = parseModule(path, content);
    return 'error' in r ? { level: 'V1', status: 'fail', detail: `${path}: ${r.error.split('\n')[0]}` } : { level: 'V1', status: 'pass', detail: `${path} parses` };
  }
  if (/robots\.txt$/.test(path)) {
    const r = parseRobots(content);
    return r.invalidLines.length === 0 ? { level: 'V1', status: 'pass', detail: `${path} parses` } : { level: 'V1', status: 'fail', detail: `${path}: invalid lines ${r.invalidLines.join(', ')}` };
  }
  if (/\.html?$/.test(path)) {
    const doc = parseHtml(content);
    return doc.elements.some((e) => e.name === 'html') ? { level: 'V1', status: 'pass', detail: `${path} parses` } : { level: 'V1', status: 'fail', detail: `${path}: no <html> element after edit` };
  }
  return { level: 'V1', status: 'pass', detail: `${path}: no parser for this type; byte check only` };
}

function findEvaluations(report: Report, ruleId: string, subjects: readonly Subject[]): Evaluation[] {
  const keys = new Set(subjects.map(subjectKey));
  return report.evaluations.filter((e) => e.ruleId === ruleId && keys.has(subjectKey(e.subject)));
}

function subCheckStatus(evals: readonly Evaluation[], subCheck: string): 'pass' | 'fail' | 'not_run' {
  if (evals.length === 0) return 'not_run';
  const statuses = evals.map((e) => e.subChecks.find((s) => s.id === subCheck)?.status ?? 'not_run');
  if (statuses.some((s) => s === 'fail')) return 'fail';
  if (statuses.every((s) => s === 'pass')) return 'pass';
  return 'not_run';
}

function affectedKeys(p: Pick<FixProposal, 'subjects' | 'affectedRoutes'>): Set<string> {
  return new Set([...p.subjects.map(subjectKey), ...p.affectedRoutes.map((r) => `route:${r}`), 'site']);
}

function newFindings(before: Report, after: Report, p: Pick<FixProposal, 'subjects' | 'affectedRoutes'>): string[] {
  const keys = affectedKeys(p);
  const old = new Set(before.evaluations.flatMap((e) => e.findings.map((f) => f.fingerprint)));
  return after.evaluations
    .filter((e) => keys.has(subjectKey(e.subject)))
    .flatMap((e) => e.findings.filter((f) => f.evidenceQuality !== 'inferred' && !old.has(f.fingerprint)).map((f) => `${f.ruleId} ${f.fingerprint}: ${f.message}`));
}

function runCommand(argv: readonly string[], cwd: string, timeoutSeconds: number): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    execFile(argv[0]!, argv.slice(1), { cwd, timeout: timeoutSeconds * 1000, shell: false, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      const tail = redact(`${stdout}${stderr}`).trim().split('\n').slice(-5).join(' | ').slice(0, 300);
      resolve({ ok: !err, detail: `${argv.join(' ')} → ${err ? `failed (${(err as NodeJS.ErrnoException).code ?? 'exit'})` : 'exit 0'}${tail ? `: ${tail}` : ''}` });
    });
  });
}

function signature(r: Report, path: string): string | null {
  const ev = r.evaluations.find((e) => e.sampledUrls?.some((u) => new URL(u).pathname === path));
  if (!ev) return null;
  return sha256(canonicalJson(r.evaluations.filter((e) => e.sampledUrls?.some((u) => new URL(u).pathname === path)).map((e) => ({ r: e.ruleId, s: e.status, c: e.subChecks }))));
}

function urlsFor(origin: string, p: Pick<FixProposal, 'affectedRoutes' | 'ruleId'>): string[] {
  const routes = p.affectedRoutes.filter((r) => !r.includes('[')).slice(0, 10);
  const paths = p.ruleId === 'GEO-011' ? ['/'] : routes.length ? routes : ['/'];
  return [...new Set(paths)].map((r) => new URL(r, origin).href);
}

function runtimeSubject(p: Pick<FixProposal, 'subjects'>, s: Subject): Subject {
  return s.kind === 'routeGroup' ? { kind: 'routeGroup', route: clusterPath(s.route) } : s;
}

export interface VerifyInput {
  readonly proposal: ManifestEntry['proposal'];
  readonly lastWriteMs: number;
  readonly before: Report;
  readonly after: Report;
  readonly authority: VerifyAuthority;
  readonly repoRoot: string;
  readonly rescan: Rescanner;
  readonly priorRuntime: Report | null;
  readonly v1Checks: readonly Check[];
}

export interface VerifyResult {
  readonly checks: Check[];
  readonly achieved: VerificationLevel | null;
  readonly outcome: Outcome;
  readonly conditionAfter: string;
  readonly newAffected: string[];
  readonly runtime_observation: ChangeReport['runtime_observation'];
  readonly source_freshness: ChangeReport['source_freshness'];
  readonly freshness_basis: string | null;
  readonly rule_outcome: ChangeReport['rule_outcome'];
  readonly runtime_unavailable: string | null;
}

/** V1–V4 for one applied fix (spec 12.2–12.4). Pure decision logic over the evidence it gathers. */
export async function verifyApplied(input: VerifyInput): Promise<VerifyResult> {
  const p = input.proposal;
  const checks: Check[] = [...input.v1Checks];
  const v2Status = subCheckStatus(findEvaluations(input.after, p.ruleId, p.subjects), p.subCheck);
  const newAffected = newFindings(input.before, input.after, p);
  if (v2Status === 'fail') checks.push({ level: 'V2', status: 'fail', detail: `${p.ruleId} ${p.subCheck} still fails on the affected subject` });
  else if (newAffected.length > 0) checks.push({ level: 'V2', status: 'fail', detail: `new finding on an affected subject: ${newAffected[0]}` });
  else if (v2Status === 'pass') checks.push({ level: 'V2', status: 'pass', detail: `${p.ruleId} ${p.subCheck} passes; no new affected findings` });
  else checks.push({ level: 'V2', status: 'not_run', detail: `${p.ruleId} ${p.subCheck} cannot be evaluated statically after the change (it disappeared into not_evaluated); that is unverified, not success` });

  const a = input.authority;
  if (a.commands.length === 0) checks.push({ level: 'V3', status: 'not_run', detail: 'no verify command was authorised for this run' });
  else {
    for (const cmd of a.commands) {
      const r = await runCommand(cmd, input.repoRoot, a.runtimeTimeoutSeconds);
      checks.push({ level: 'V3', status: r.ok ? 'pass' : 'fail', detail: r.detail });
    }
  }

  let runtime_observation = 'unavailable' as ChangeReport['runtime_observation'];
  let source_freshness: ChangeReport['source_freshness'] = 'unconfirmed';
  let freshness_basis: string | null = null;
  let rule_outcome = 'not_evaluated' as ChangeReport['rule_outcome'];
  let runtime_unavailable: string | null = null;
  const observe = async (origin: string): Promise<Report> => {
    const report = await input.rescan.urls(urlsFor(origin, p));
    const evals = findEvaluations(report, p.ruleId, p.subjects.map((s) => runtimeSubject(p, s)));
    const st = subCheckStatus(evals, p.subCheck);
    rule_outcome = st === 'pass' ? 'pass' : st === 'fail' ? 'fail' : evals.some((e) => e.status === 'error') ? 'error' : 'not_evaluated';
    if (input.priorRuntime) {
      const path = new URL(urlsFor(origin, p)[0]!).pathname;
      const before = signature(input.priorRuntime, path);
      const after = signature(report, path);
      runtime_observation = before === null || after === null ? 'unavailable' : before === after ? 'unchanged' : 'changed';
    }
    return report;
  };
  if (a.serve) {
    const handle = await startServe(a.serve.command, a.serve.url, input.repoRoot, a.serve.readyTimeoutSeconds, input.lastWriteMs);
    if ('unavailable' in handle) {
      runtime_unavailable = handle.unavailable;
      checks.push({ level: 'V4', status: 'not_run', detail: `runtime_unavailable: ${handle.unavailable} — ${handle.detail}` });
    } else {
      try {
        const report = await observe(handle.origin);
        source_freshness = handle.startedAt > input.lastWriteMs ? 'confirmed' : 'unconfirmed';
        freshness_basis = source_freshness === 'confirmed' ? 'process_started_after_write' : null;
        const regress = newFindings(input.priorRuntime ?? report, report, p);
        if (source_freshness !== 'confirmed') {
          runtime_unavailable = 'freshness_unconfirmed';
          checks.push({ level: 'V4', status: 'not_run', detail: 'runtime_unavailable: freshness_unconfirmed' });
        } else if (rule_outcome === 'pass' && (input.priorRuntime === null || regress.length === 0)) {
          checks.push({ level: 'V4', status: 'pass', detail: `${p.ruleId} ${p.subCheck} passes on ${handle.origin}, served by a process GEO started after the write` });
        } else if (rule_outcome === 'fail' || regress.length > 0) {
          checks.push({ level: 'V4', status: 'fail', detail: rule_outcome === 'fail' ? `${p.ruleId} ${p.subCheck} still fails on a confirmed-fresh runtime` : `new runtime finding: ${regress[0]}` });
        } else {
          checks.push({ level: 'V4', status: 'not_run', detail: `${p.ruleId} ${p.subCheck} could not be evaluated on the runtime (${rule_outcome})` });
        }
      } finally {
        await handle.stop();
      }
    }
  } else if (a.observeUrl) {
    await observe(new URL(a.observeUrl).origin);
    runtime_unavailable = 'freshness_unconfirmed';
    checks.push({ level: 'V4', status: 'not_run', detail: `observed ${a.observeUrl} (rule ${rule_outcome}), but GEO did not start that server, so freshness is unconfirmed. Configure fix.serve and pass --serve for V4.` });
  } else {
    runtime_unavailable = 'not_configured';
    checks.push({ level: 'V4', status: 'not_run', detail: 'runtime_unavailable: no serve command authorised (configure fix.serve and pass --serve)' });
  }

  const failed = checks.some((c) => c.status === 'fail');
  let achieved: VerificationLevel | null = null;
  for (const lvl of LEVEL_ORDER) if (checks.some((c) => c.level === lvl && c.status === 'pass') && !checks.some((c) => c.level === lvl && c.status === 'fail')) achieved = lvl;
  if (!checks.some((c) => c.level === 'V1' && c.status === 'pass')) achieved = null;
  const meets = achieved !== null && LEVEL_ORDER.indexOf(achieved) >= LEVEL_ORDER.indexOf(p.required) && (p.required !== 'V4' || checks.some((c) => c.level === 'V4' && c.status === 'pass')) && (p.required !== 'V2' || checks.some((c) => (c.level === 'V2' || c.level === 'V4') && c.status === 'pass'));
  const outcome: Outcome = failed ? 'rolled_back' : meets ? 'verified' : 'applied_unverified';
  return {
    checks,
    achieved,
    outcome,
    conditionAfter: v2Status === 'pass' ? 'pass' : v2Status === 'fail' ? 'fail' : rule_outcome === 'pass' ? 'pass (runtime)' : 'not_evaluated',
    newAffected,
    runtime_observation,
    source_freshness,
    freshness_basis,
    rule_outcome,
    runtime_unavailable,
  };
}

function countChangedLines(before: string | null, after: string): number {
  const a = (before ?? '').split('\n');
  const b = after.split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return Math.max(b.length - i - j, a.length - i - j);
}

export interface ApplyInput {
  readonly proposals: readonly FixProposal[];
  readonly repoRoot: string;
  readonly runDir: string;
  readonly runId: string;
  readonly before: Report;
  readonly priorRuntime: Report | null;
  readonly authority: VerifyAuthority;
  readonly rescan: Rescanner;
}

function restore(repoRoot: string, files: ManifestEntry['files'], snapshots: ReadonlyMap<string, string | null>): void {
  for (const f of files) {
    const abs = join(repoRoot, f.path);
    const before = snapshots.get(f.path) ?? null;
    if (!f.existedBefore) rmSync(abs, { force: true });
    else if (before !== null) writeFileSync(abs, before);
  }
}

/** Snapshot, splice, verify, and roll back only the fix whose check failed. */
export async function applyFixes(input: ApplyInput): Promise<ChangeReport[]> {
  const reports: ChangeReport[] = [];
  const manifest: Manifest = readManifest(input.runDir) ?? { runId: input.runId, appliedAt: new Date().toISOString(), fixes: [] };
  for (const p of input.proposals) {
    const snapDir = join(input.runDir, 'fix', p.fixId);
    const before = await input.rescan.repo();
    mkdirSync(snapDir, { recursive: true });
    writeFileSync(join(snapDir, 'before.json'), canonicalJson(before));
    const snaps = new Map<string, string | null>();
    const files: ManifestEntry['files'][number][] = [];
    for (const c of p.changes) {
      const abs = join(input.repoRoot, c.path);
      const existed = existsSync(abs);
      const current = existed ? readFileSync(abs, 'utf8') : null;
      if ((current === null ? null : sha256(current)) !== c.beforeHash) throw new Error(`${c.path} changed since the fix was planned; re-run the dry run`);
      snaps.set(c.path, current);
      let snapshot: string | null = null;
      if (current !== null) {
        snapshot = join(snapDir, 'files', c.path);
        mkdirSync(dirname(snapshot), { recursive: true });
        writeFileSync(snapshot, current);
      }
      files.push({ path: c.path, existedBefore: existed, beforeHash: c.beforeHash, afterHash: sha256(c.after), snapshot });
    }
    // Multi-file fixes are atomic: a failed write restores what was written.
    const written: string[] = [];
    try {
      for (const c of p.changes) {
        const abs = join(input.repoRoot, c.path);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, c.after);
        written.push(c.path);
      }
    } catch (e) {
      restore(input.repoRoot, files.filter((f) => written.includes(f.path)), snaps);
      throw e;
    }
    const lastWriteMs = Math.max(...p.changes.map((c) => statSync(join(input.repoRoot, c.path)).mtimeMs), Date.now());
    const v1Checks = p.changes.map((c) => v1(c.path, c.after));
    const after = await input.rescan.repo();
    const result = await verifyApplied({ proposal: p, lastWriteMs, before, after, authority: input.authority, repoRoot: input.repoRoot, rescan: input.rescan, priorRuntime: input.priorRuntime, v1Checks });
    if (result.outcome === 'rolled_back') restore(input.repoRoot, files, snaps);
    const entry: ManifestEntry = {
      fixId: p.fixId,
      outcome: result.outcome,
      proposal: { variant: p.variant, ruleId: p.ruleId, subCheck: p.subCheck, subjects: p.subjects, required: p.required, affectedRoutes: p.affectedRoutes, fingerprints: p.fingerprints, class: p.class, title: p.title },
      files,
      lastWriteMs,
    };
    manifest.fixes.push(entry);
    writeManifest(input.runDir, manifest);
    reports.push({
      fixId: p.fixId,
      variant: p.variant,
      class: p.class,
      ruleId: p.ruleId,
      subjects: p.subjects.map(subjectKey),
      fingerprints: p.fingerprints,
      files: p.changes.map((c) => ({ path: c.path, linesChanged: countChangedLines(c.before, c.after), created: c.before === null })),
      conditionBefore: 'fail',
      conditionAfter: result.conditionAfter,
      newAffectedFindings: result.newAffected,
      verification: { required: p.required, achieved: result.achieved, checks: result.checks },
      runtime_observation: result.runtime_observation,
      source_freshness: result.source_freshness,
      freshness_basis: result.freshness_basis,
      rule_outcome: result.rule_outcome,
      runtime_unavailable: result.runtime_unavailable,
      outcome: result.outcome,
      snapshot: snapDir,
    });
  }
  return reports;
}

export interface RollbackResult {
  readonly restored: string[];
  readonly conflicts: string[];
}

/** Restore snapshots, refusing any file edited after the fix run (spec 12.4.6). */
export function rollback(repoRoot: string, runDir: string, dryRun: boolean): RollbackResult {
  const m = readManifest(runDir);
  if (!m) return { restored: [], conflicts: ['no fix manifest in this run'] };
  const live = m.fixes.filter((f) => f.outcome !== 'rolled_back');
  const conflicts: string[] = [];
  for (const f of live) {
    for (const file of f.files) {
      const abs = join(repoRoot, file.path);
      const current = existsSync(abs) ? sha256(readFileSync(abs, 'utf8')) : null;
      if (current !== file.afterHash) conflicts.push(`${file.path} was changed after ${f.fixId} was applied`);
    }
  }
  if (conflicts.length > 0 || dryRun) return { restored: [], conflicts };
  const restored: string[] = [];
  for (const f of live) {
    for (const file of f.files) {
      const abs = join(repoRoot, file.path);
      if (!file.existedBefore) rmSync(abs, { force: true });
      else writeFileSync(abs, readFileSync(file.snapshot!, 'utf8'));
      restored.push(file.path);
    }
  }
  writeManifest(runDir, { ...m, fixes: m.fixes.map((f) => (f.outcome === 'rolled_back' ? f : { ...f, outcome: 'rolled_back' as const })) });
  return { restored, conflicts };
}

export function loadBefore(runDir: string, fixId: string): Report | null {
  const p = join(runDir, 'fix', fixId, 'before.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Report) : null;
}

export function currentV1(repoRoot: string, entry: ManifestEntry): Check[] {
  return entry.files.map((f) => {
    const abs = join(repoRoot, f.path);
    if (!existsSync(abs)) return { level: 'V1' as const, status: 'fail' as const, detail: `${f.path} no longer exists` };
    return v1(f.path, readFileSync(abs, 'utf8'));
  });
}

export function variantRequired(variant: keyof typeof VARIANTS): VerificationLevel {
  return VARIANTS[variant].required;
}
