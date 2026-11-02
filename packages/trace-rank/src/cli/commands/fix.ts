import { EXIT, GeoError, usage } from '../../core/errors.ts';
import { canonicalJson } from '../../core/hash.ts';
import { loadRun, runDir } from '../../cache/runs.ts';
import { scan } from '../../scan.ts';
import { planAll, type BlockedFix, type FixProposal } from '../../fix/plan.ts';
import { unifiedDiff } from '../../fix/diff.ts';
import { applyFixes, currentV1, loadBefore, readManifest, rollback, verifyApplied, type ChangeReport, type Rescanner, type VerifyAuthority } from '../../fix/apply.ts';
import { isLoopbackUrl } from '../../net/address.ts';
import type { GeoConfig } from '../../config/config.ts';
import type { Palette } from '../../core/tty.ts';
import { subjectKey } from '../../types.ts';
import { FIX_FLAGS, GLOBAL_FLAGS, parseArgs, type Parsed } from '../args.ts';
import { cacheFor, currentBranch, defaultBranch, dirtyFiles, gitRoot, loadFor, resolveCwd, type Deps } from '../context.ts';
import { runScan } from './scan.ts';

function printProposal(f: FixProposal, c: Palette): string {
  const lines: string[] = [];
  lines.push(`${c.bold(f.fixId)}  ${f.class === 'safe' ? c.green('safe') : c.yellow('guarded')}  ${f.title}`);
  lines.push(`  ${c.dim('rule')} ${f.ruleId} ${f.subCheck}   ${c.dim('subjects')} ${f.subjects.map(subjectKey).join(', ')}`);
  lines.push(`  ${c.dim('provenance')} ${f.provenance.level} — ${f.provenance.reason}`);
  lines.push(`  ${c.dim('requires')} ${f.required} verification${f.required === 'V4' ? ' (a server GEO starts after the write: configure fix.serve and pass --serve)' : ''}`);
  if (f.affectedRoutes.length > 1) lines.push(`  ${c.dim('affects')} ${f.affectedRoutes.join(', ')}`);
  for (const pc of f.preconditions) lines.push(`  ${c.green('✓')} ${pc.check} ${c.dim(`(${pc.detail})`)}`);
  for (const ch of f.changes) {
    for (const l of unifiedDiff(ch.path, ch.before, ch.after).trimEnd().split('\n')) {
      lines.push(`    ${l.startsWith('+') && !l.startsWith('+++') ? c.green(l) : l.startsWith('-') && !l.startsWith('---') ? c.red(l) : c.dim(l)}`);
    }
  }
  if (f.alternative) lines.push(`  ${c.dim('alternative')} ${f.alternative}`);
  return lines.join('\n');
}

function printBlocked(b: BlockedFix, c: Palette): string {
  const failing = b.preconditions.filter((p) => !p.ok);
  return `${c.dim(`${b.variant} not offered for ${subjectKey(b.subject)}:`)} ${failing.map((p) => `${p.check} (${p.detail})`).join('; ')}`;
}

function printChange(r: ChangeReport, c: Palette): string {
  const tag = r.outcome === 'verified' ? c.green('verified') : r.outcome === 'rolled_back' ? c.red('rolled back') : c.yellow('applied, unverified');
  const lines = [`${c.bold(r.fixId)}  ${tag}  ${r.ruleId} ${r.subjects.join(', ')}`];
  lines.push(`  ${c.dim('files')} ${r.files.map((f) => `${f.path}${f.created ? ' (created)' : ''} ±${f.linesChanged}`).join(', ')}`);
  lines.push(`  ${c.dim('condition')} ${r.conditionBefore} → ${r.conditionAfter}   ${c.dim('verification')} required ${r.verification.required}, achieved ${r.verification.achieved ?? 'none'}`);
  for (const ch of r.verification.checks) {
    const mark = ch.status === 'pass' ? c.green('pass') : ch.status === 'fail' ? c.red('FAIL') : c.dim('----');
    lines.push(`    ${ch.level} ${mark} ${ch.detail}`);
  }
  lines.push(`  ${c.dim('runtime_observation')} ${r.runtime_observation}  ${c.dim('source_freshness')} ${r.source_freshness}${r.freshness_basis ? ` (${r.freshness_basis})` : ''}  ${c.dim('rule_outcome')} ${r.rule_outcome}`);
  if (r.newAffectedFindings.length) lines.push(`  ${c.red('new findings')} ${r.newAffectedFindings.join('; ')}`);
  return lines.join('\n');
}

function configuredCommand(config: GeoConfig, value: string): readonly string[] | null {
  return config.fix.verifyCommands.find((cmd) => cmd.join(' ') === value.trim()) ?? null;
}

async function authority(p: Parsed, deps: Deps, config: GeoConfig): Promise<VerifyAuthority> {
  const io = deps.io;
  const commands: (readonly string[])[] = [];
  const requested = p.multi.get('verify-cmd') ?? [];
  for (const v of requested) {
    const cmd = configuredCommand(config, v);
    if (!cmd) throw usage(`--verify-cmd "${v}" is not one of the commands in fix.verifyCommands`, 'GEO runs only exact owner-configured commands; it never infers them from package scripts.');
    commands.push(cmd);
  }
  if (requested.length === 0 && config.fix.verifyCommands.length > 0) {
    if (io.interactive) {
      for (const cmd of config.fix.verifyCommands) if (await io.confirm(`Run configured verify command \`${cmd.join(' ')}\`?`)) commands.push(cmd);
    } else if (deps.env.GEO_ALLOW_VERIFY_COMMAND === '1') commands.push(...config.fix.verifyCommands);
  }
  let serve: VerifyAuthority['serve'] = null;
  const s = config.fix.serve;
  if (p.bool.has('serve') && (!s.command || !s.url)) throw usage('--serve needs fix.serve.command and fix.serve.url in geo.config.json');
  if (s.command && s.url) {
    const authorised = p.bool.has('serve') || (io.interactive ? await io.confirm(`Start \`${s.command.join(' ')}\` (no shell) and observe ${s.url} for V4?`) : deps.env.GEO_ALLOW_SERVE_COMMAND === '1');
    if (authorised) serve = { command: s.command, url: s.url, readyTimeoutSeconds: s.readyTimeoutSeconds };
  }
  const urls = p.multi.get('url') ?? [];
  const observeUrl = urls.find((u) => {
    try {
      return isLoopbackUrl(new URL(u));
    } catch {
      return false;
    }
  }) ?? null;
  return { commands, serve, observeUrl, runtimeTimeoutSeconds: config.fix.runtimeTimeoutSeconds };
}

function rescanner(repoPath: string, config: GeoConfig, deps: Deps): Rescanner {
  return {
    repo: async () => (await scan({ repoPath, urls: [], config, configHash: 'rescan', ...(deps.now ? { now: deps.now } : {}) })).report,
    urls: async (urls) => (await scan({ repoPath: null, urls, config, configHash: 'rescan', maxPages: urls.length + 2, maxDepth: 0, ...(deps.fetcher ? { fetcher: deps.fetcher } : {}), ...(deps.now ? { now: deps.now } : {}) })).report,
  };
}

function exitFor(reports: readonly ChangeReport[]): number {
  if (reports.some((r) => r.outcome === 'rolled_back')) return EXIT.rolledBack;
  if (reports.some((r) => r.outcome === 'applied_unverified')) return EXIT.unverified;
  return EXIT.ok;
}

function hintFor(reports: readonly ChangeReport[], runId: string): string {
  const lines: string[] = [];
  if (reports.some((r) => r.outcome === 'applied_unverified')) {
    lines.push(`Some fixes are applied but not verified to their required level. Re-check later with: trace-rank fix --verify ${runId} --serve`);
    if (reports.some((r) => r.runtime_unavailable === 'not_configured')) lines.push('Configure fix.serve with a from-source dev command (for example ["pnpm", "next", "dev", "--port", "3100"]); a command that serves stale prebuilt output defeats the freshness check.');
  }
  if (reports.some((r) => r.outcome !== 'rolled_back')) lines.push(`Undo with: trace-rank fix --rollback ${runId}`);
  return lines.join('\n');
}

async function verifyRun(p: Parsed, deps: Deps, runId: string): Promise<number> {
  const cwd = resolveCwd(p, deps);
  const loaded = loadFor(cwd, p, deps.env);
  const root = gitRoot(cwd) ?? cwd;
  const cache = cacheFor(root, cwd, loaded, deps.env);
  const dir = runDir(cache, runId);
  const manifest = readManifest(dir);
  if (!manifest) throw usage(`run ${runId} has no applied fixes in ${cache}`);
  const auth = await authority(p, deps, loaded.config);
  const rs = rescanner(root, loaded.config, deps);
  const reports: ChangeReport[] = [];
  const after = await rs.repo();
  for (const entry of manifest.fixes.filter((f) => f.outcome !== 'rolled_back')) {
    const before = loadBefore(dir, entry.fixId) ?? after;
    const result = await verifyApplied({ proposal: entry.proposal, lastWriteMs: entry.lastWriteMs, before, after, authority: auth, repoRoot: root, rescan: rs, priorRuntime: loadRun(cache, runId)?.report ?? null, v1Checks: currentV1(root, entry) });
    // --verify never rewrites source: a failed check is reported, not rolled back.
    reports.push({
      fixId: entry.fixId,
      variant: entry.proposal.variant,
      class: entry.proposal.class,
      ruleId: entry.proposal.ruleId,
      subjects: entry.proposal.subjects.map(subjectKey),
      fingerprints: entry.proposal.fingerprints,
      files: entry.files.map((f) => ({ path: f.path, linesChanged: 0, created: !f.existedBefore })),
      conditionBefore: 'fail',
      conditionAfter: result.conditionAfter,
      newAffectedFindings: result.newAffected,
      verification: { required: entry.proposal.required, achieved: result.achieved, checks: result.checks },
      runtime_observation: result.runtime_observation,
      source_freshness: result.source_freshness,
      freshness_basis: result.freshness_basis,
      rule_outcome: result.rule_outcome,
      runtime_unavailable: result.runtime_unavailable,
      outcome: result.outcome === 'rolled_back' ? 'applied_unverified' : result.outcome,
      snapshot: dir,
    });
    if (result.outcome === 'rolled_back') deps.io.err(`${entry.fixId}: a check failed. The change is still applied; roll it back with trace-rank fix --rollback ${runId}\n`);
  }
  if ((p.multi.get('format') ?? []).includes('json')) deps.io.out(canonicalJson({ runId, changes: reports }));
  else for (const r of reports) deps.io.out(`${printChange(r, deps.io.color)}\n\n`);
  const failed = reports.some((r) => r.verification.checks.some((c) => c.status === 'fail'));
  return failed ? EXIT.gate : exitFor(reports);
}

async function rollbackRun(p: Parsed, deps: Deps, runId: string): Promise<number> {
  const cwd = resolveCwd(p, deps);
  const loaded = loadFor(cwd, p, deps.env);
  const root = gitRoot(cwd) ?? cwd;
  const dir = runDir(cacheFor(root, cwd, loaded, deps.env), runId);
  const check = rollback(root, dir, true);
  if (check.conflicts.length > 0) {
    deps.io.err(`rollback refused:\n  ${check.conflicts.join('\n  ')}\nGEO never overwrites later edits. Resolve these files by hand.\n`);
    return EXIT.gate;
  }
  const ok = p.bool.has('yes') || (await deps.io.confirm(`Restore the snapshots from ${runId}?`));
  if (!ok) throw usage('rollback needs confirmation: answer the prompt or pass --yes');
  const done = rollback(root, dir, false);
  deps.io.out(done.restored.length ? `restored ${done.restored.join(', ')}\n` : 'nothing to roll back\n');
  return EXIT.ok;
}

export async function fixCommand(argv: readonly string[], deps: Deps): Promise<number> {
  const p = parseArgs(argv, [...GLOBAL_FLAGS, ...FIX_FLAGS]);
  const verifyId = p.str.get('verify');
  const rollbackId = p.str.get('rollback');
  if (verifyId && rollbackId) throw usage('--verify and --rollback cannot be combined');
  if (verifyId) return verifyRun(p, deps, verifyId);
  if (rollbackId) return rollbackRun(p, deps, rollbackId);
  if (p.bool.has('no-cache') && p.bool.has('apply')) throw usage('--apply needs the run cache for snapshots and rollback; drop --no-cache');

  const inv = await runScan(p, deps, true);
  const { result, repoPath, config } = inv;
  if (!repoPath) throw usage('fix needs a repository');
  const c = deps.io.color;
  const plan = planAll(result.context, result.report.evaluations);
  const only = new Set((p.multi.get('rule') ?? []).flatMap((r) => r.split(',')).map((r) => r.trim().toUpperCase()));
  const proposals = plan.proposals.filter((f) => only.size === 0 || only.has(f.ruleId));
  const json = (p.multi.get('format') ?? []).includes('json');
  if (!p.bool.has('apply')) {
    if (json) deps.io.out(canonicalJson({ runId: result.report.run.id, proposals, blocked: plan.blocked, disclaimer: result.report.disclaimer }));
    else {
      deps.io.out(proposals.length === 0 ? 'No closed-list fix applies to the current findings.\n' : `${proposals.length} fix${proposals.length === 1 ? '' : 'es'} available (dry run — nothing was written)\n\n`);
      for (const f of proposals) deps.io.out(`${printProposal(f, c)}\n\n`);
      for (const b of plan.blocked.filter((x) => only.size === 0 || only.has(x.variant))) deps.io.out(`${printBlocked(b, c)}\n`);
      if (proposals.length > 0) deps.io.out(`\nApply safe fixes with: trace-rank fix --apply\nApprove a guarded fix with: trace-rank fix --apply --approve <fixId>\n`);
      deps.io.out(c.dim(`\n${result.report.disclaimer}\n`));
    }
    return EXIT.ok;
  }

  // Every approval is settled before the first byte is written.
  const approveIds = new Set(p.multi.get('approve') ?? []);
  for (const id of approveIds) if (!proposals.some((f) => f.fixId === id)) throw usage(`--approve ${id} does not name an available fix`, 'Run trace-rank fix (dry run) to list fix ids.');
  const selected: FixProposal[] = [];
  const skippedGuarded: string[] = [];
  for (const f of proposals) {
    if (f.class === 'safe') {
      selected.push(f);
      continue;
    }
    if (approveIds.has(f.fixId)) selected.push(f);
    else if (deps.io.interactive) {
      deps.io.out(`${printProposal(f, c)}\n`);
      if (await deps.io.confirm(`Apply guarded fix ${f.fixId}?`)) selected.push(f);
    } else if (only.size > 0) {
      // The user asked for this rule's fix by name: a missing approval is an error, raised before any write.
      throw usage(`guarded fix ${f.fixId} needs explicit approval`, `Pass --approve ${f.fixId}. --yes never approves a guarded fix.`);
    } else {
      skippedGuarded.push(f.fixId);
    }
  }
  for (const id of skippedGuarded) deps.io.err(`skipped guarded fix ${id}: approve it with --approve ${id} (--yes never approves a guarded fix)\n`);
  if (selected.length === 0) {
    deps.io.out('Nothing to apply.\n');
    return EXIT.ok;
  }
  const targets = selected.flatMap((f) => f.changes.map((ch) => ch.path));
  const dirty = dirtyFiles(repoPath, targets);
  if (dirty.length > 0 && !p.bool.has('allow-dirty')) throw usage(`target files have uncommitted changes: ${dirty.join(', ')}`, 'Commit or stash them, or pass --allow-dirty.');
  const branch = currentBranch(repoPath);
  const def = defaultBranch(repoPath) ?? (branch === 'main' || branch === 'master' ? branch : null);
  if (branch !== null && branch === def && !p.bool.has('yes') && !(await deps.io.confirm(`You are on the default branch ${branch}. Apply here anyway?`))) {
    throw usage(`refusing to apply on the default branch ${branch} without confirmation`, 'Switch to a feature branch, or confirm with --yes.');
  }
  const auth = await authority(p, deps, config);
  if (!inv.cache) throw new GeoError('internal', 'run cache unavailable');
  const reports = await applyFixes({
    proposals: selected,
    repoRoot: repoPath,
    runDir: runDir(inv.cache, result.report.run.id),
    runId: result.report.run.id,
    before: result.report,
    priorRuntime: result.report.run.mode === 'repo' ? null : result.report,
    authority: auth,
    rescan: rescanner(repoPath, config, deps),
  });
  if (json) deps.io.out(canonicalJson({ runId: result.report.run.id, changes: reports, disclaimer: result.report.disclaimer }));
  else {
    for (const r of reports) deps.io.out(`${printChange(r, c)}\n\n`);
    const hint = hintFor(reports, result.report.run.id);
    if (hint) deps.io.out(`${hint}\n`);
    deps.io.out(c.dim(`${result.report.disclaimer}\n`));
  }
  return exitFor(reports);
}
