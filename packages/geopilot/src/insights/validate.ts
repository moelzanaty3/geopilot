import { execFileSync } from 'node:child_process';
import { parseHtml, type Element } from '../html/parse.ts';
import type { LoadedRun } from '../cache/runs.ts';

// geo-insights/v1 validation (spec 8.1). L1 is structure; L2 resolves every
// reference against the cited commit and the retained run. "valid_references"
// means the evidence resolved — never that the recommendation is right.

export type InsightKind = 'recommendation' | 'hypothesis';

export interface InsightEvidence {
  readonly type: 'file' | 'url' | 'finding' | 'note';
  readonly path?: string;
  readonly lines?: { readonly start: number; readonly end: number };
  readonly quote?: string;
  readonly url?: string;
  readonly selector?: string;
  readonly fingerprint?: string;
  readonly detail?: string;
}

export interface Insight {
  readonly id: string;
  readonly kind: InsightKind;
  readonly category: string;
  readonly title: string;
  readonly description: string;
  readonly evidence: readonly InsightEvidence[];
  readonly related: { readonly fingerprints: readonly string[]; readonly routes: readonly string[]; readonly files: readonly string[]; readonly insights: readonly string[] };
  readonly conflictsWith: readonly string[];
  readonly confidence: 'low' | 'medium' | 'high';
  readonly priority: 'low' | 'medium' | 'high';
  readonly effort: 'small' | 'medium' | 'large';
  readonly expectedBenefit: string;
  readonly suggestedAction: string;
  readonly fixClass: 'contextual' | 'editorial' | 'unsupported';
  readonly approvalRequired: boolean;
  readonly verification: 'V2' | 'V4' | 'none';
  readonly uncertainty: string;
}

export interface InsightsDoc {
  readonly schemaVersion: 'geo-insights/v1';
  readonly producer: { readonly host: string; readonly model: string; readonly skillVersion: string };
  readonly basedOn: { readonly runId: string; readonly reportSha256: string; readonly gitCommit: string | null };
  readonly insights: readonly Insight[];
}

export type RefStatus = 'valid_references' | 'reference_invalid' | 'stale' | 'duplicate_exact' | 'unchecked';

export interface InsightResult {
  readonly id: string;
  readonly kind: InsightKind;
  readonly status: RefStatus;
  readonly reasons: readonly string[];
}

export interface ValidationResult {
  readonly schemaErrors: readonly string[];
  readonly results: readonly InsightResult[];
  readonly evidenceAvailable: boolean;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export function validateSchema(raw: unknown): { doc: InsightsDoc | null; errors: string[] } {
  const e: string[] = [];
  if (!isObj(raw)) return { doc: null, errors: ['document must be a JSON object'] };
  if (raw.schemaVersion !== 'geo-insights/v1') e.push('schemaVersion must be "geo-insights/v1"');
  const prod = raw.producer;
  if (!isObj(prod) || typeof prod.host !== 'string' || typeof prod.model !== 'string' || typeof prod.skillVersion !== 'string') e.push('producer needs host, model and skillVersion strings');
  const based = raw.basedOn;
  if (!isObj(based) || typeof based.runId !== 'string' || typeof based.reportSha256 !== 'string' || !(based.gitCommit === null || typeof based.gitCommit === 'string')) e.push('basedOn needs runId, reportSha256 and gitCommit (string or null)');
  if (!Array.isArray(raw.insights)) e.push('insights must be an array');
  const ids = new Set<string>();
  (Array.isArray(raw.insights) ? raw.insights : []).forEach((ins, i) => {
    const at = `insights[${i}]`;
    if (!isObj(ins)) return e.push(`${at} must be an object`);
    if (typeof ins.id !== 'string' || !ins.id) e.push(`${at}.id is required`);
    else if (ids.has(ins.id)) e.push(`${at}.id ${ins.id} is duplicated`);
    else ids.add(ins.id);
    if (ins.kind === 'verified') e.push(`${at}.kind "verified" is not allowed: agent output is a recommendation or a hypothesis, never a verified result`);
    else if (ins.kind !== 'recommendation' && ins.kind !== 'hypothesis') e.push(`${at}.kind must be recommendation or hypothesis`);
    for (const k of ['category', 'title', 'description', 'expectedBenefit', 'suggestedAction', 'uncertainty']) if (typeof ins[k] !== 'string') e.push(`${at}.${k} must be a string`);
    if (!['low', 'medium', 'high'].includes(String(ins.confidence))) e.push(`${at}.confidence must be low, medium or high`);
    if (!['low', 'medium', 'high'].includes(String(ins.priority))) e.push(`${at}.priority must be low, medium or high`);
    if (!['small', 'medium', 'large'].includes(String(ins.effort))) e.push(`${at}.effort must be small, medium or large`);
    if (!['contextual', 'editorial', 'unsupported'].includes(String(ins.fixClass))) e.push(`${at}.fixClass must be contextual, editorial or unsupported (safe/guarded fixes are engine fixes)`);
    if (typeof ins.approvalRequired !== 'boolean') e.push(`${at}.approvalRequired must be a boolean`);
    if (!['V2', 'V4', 'none'].includes(String(ins.verification))) e.push(`${at}.verification must be V2, V4 or none`);
    if (!isStrArr(ins.conflictsWith)) e.push(`${at}.conflictsWith must be an array of insight ids`);
    const rel = ins.related;
    if (!isObj(rel) || !isStrArr(rel.fingerprints) || !isStrArr(rel.routes) || !isStrArr(rel.files) || !isStrArr(rel.insights)) e.push(`${at}.related needs fingerprints, routes, files and insights arrays`);
    if (!Array.isArray(ins.evidence) || ins.evidence.length === 0) e.push(`${at}.evidence needs at least one item`);
    else
      ins.evidence.forEach((ev, j) => {
        const eat = `${at}.evidence[${j}]`;
        if (!isObj(ev)) return e.push(`${eat} must be an object`);
        if (ev.type === 'file') {
          if (typeof ev.path !== 'string') e.push(`${eat}.path is required for file evidence`);
          if (ev.lines !== undefined && !(isObj(ev.lines) && Number.isInteger(ev.lines.start) && Number.isInteger(ev.lines.end) && (ev.lines.start as number) >= 1 && (ev.lines.end as number) >= (ev.lines.start as number))) e.push(`${eat}.lines must be { start, end } with 1 <= start <= end`);
        } else if (ev.type === 'url') {
          if (typeof ev.url !== 'string') e.push(`${eat}.url is required for url evidence`);
        } else if (ev.type === 'finding') {
          if (typeof ev.fingerprint !== 'string') e.push(`${eat}.fingerprint is required for finding evidence`);
        } else if (ev.type !== 'note') e.push(`${eat}.type must be file, url, finding or note`);
      });
  });
  return { doc: e.length === 0 ? (raw as unknown as InsightsDoc) : null, errors: e };
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/** A deliberately small selector engine: compound selectors (tag, #id, .class, [attr], [attr=value]); for descendant selectors only the last compound is matched. */
export function matchesSelector(elements: readonly Element[], selector: string): boolean {
  const last = selector.trim().split(/\s+|>/).filter(Boolean).pop() ?? '';
  const m = /^([a-z][a-z0-9-]*)?((?:#[\w-]+|\.[\w-]+|\[[^\]]+\])*)$/i.exec(last);
  if (!m) return false;
  const tag = m[1]?.toLowerCase();
  const parts = m[2]!.match(/#[\w-]+|\.[\w-]+|\[[^\]]+\]/g) ?? [];
  return elements.some((el) => {
    if (tag && el.name !== tag) return false;
    for (const part of parts) {
      if (part.startsWith('#') && el.attrs.get('id') !== part.slice(1)) return false;
      if (part.startsWith('.') && !(el.attrs.get('class') ?? '').split(/\s+/).includes(part.slice(1))) return false;
      if (part.startsWith('[')) {
        const am = /^\[\s*([\w:-]+)\s*(?:([~|^$*]?=)\s*["']?([^"'\]]*)["']?)?\s*\]$/.exec(part);
        if (!am) return false;
        const v = el.attrs.get(am[1]!.toLowerCase());
        if (v === undefined) return false;
        if (am[2] === '=' && v !== am[3]) return false;
        if (am[2] === '~=' && !v.split(/\s+/).includes(am[3]!)) return false;
        if (am[2] === '*=' && !v.includes(am[3]!)) return false;
        if (am[2] === '^=' && !v.startsWith(am[3]!)) return false;
        if (am[2] === '$=' && !v.endsWith(am[3]!)) return false;
      }
    }
    return true;
  });
}

export function validateReferences(doc: InsightsDoc, run: LoadedRun | null, repoRoot: string | null): ValidationResult {
  const results: InsightResult[] = [];
  const seen = new Map<string, string>();
  const ids = new Set(doc.insights.map((i) => i.id));
  const fps = new Set(run?.report.evaluations.flatMap((e) => e.findings.map((f) => f.fingerprint)) ?? []);
  const fetched = new Set(run?.report.routes.flatMap((r) => r.urls) ?? []);
  const reportStale = run !== null && run.reportSha256 !== doc.basedOn.reportSha256;
  const commit = doc.basedOn.gitCommit;
  for (const ins of doc.insights) {
    const reasons: string[] = [];
    let stale = reportStale;
    let unchecked = false;
    if (reportStale) reasons.push('report hash differs from basedOn.reportSha256');
    const key = JSON.stringify([ins.kind, norm(ins.title), norm(ins.description), ins.evidence]);
    if (seen.has(key)) {
      results.push({ id: ins.id, kind: ins.kind, status: 'duplicate_exact', reasons: [`same as ${seen.get(key)}`] });
      continue;
    }
    seen.set(key, ins.id);
    for (const ref of [...ins.related.insights, ...ins.conflictsWith]) if (!ids.has(ref)) reasons.push(`unknown insight id ${ref}`);
    for (const fp of ins.related.fingerprints) if (run && !fps.has(fp)) reasons.push(`fingerprint ${fp} is not in run ${doc.basedOn.runId}`);
    for (const ev of ins.evidence) {
      if (ev.type === 'finding') {
        if (!run) unchecked = true;
        else if (!fps.has(ev.fingerprint!)) reasons.push(`fingerprint ${ev.fingerprint} is not in run ${doc.basedOn.runId}`);
      } else if (ev.type === 'url') {
        if (!run) {
          unchecked = true;
          continue;
        }
        if (!fetched.has(ev.url!)) {
          reasons.push(`${ev.url} was not fetched in run ${doc.basedOn.runId}`);
          continue;
        }
        if (ev.selector) {
          const html = run.dom.get(ev.url!);
          if (html === undefined) unchecked = true;
          else if (!matchesSelector(parseHtml(html).elements, ev.selector)) reasons.push(`selector ${ev.selector} matches nothing in the retained snapshot of ${ev.url}`);
        }
      } else if (ev.type === 'file') {
        if (!repoRoot || !commit) {
          unchecked = true;
          continue;
        }
        const content = git(repoRoot, ['show', `${commit}:${ev.path}`]);
        if (content === null) {
          reasons.push(`${ev.path} does not exist at ${commit.slice(0, 12)}`);
          continue;
        }
        const lines = content.split('\n');
        if (ev.lines && ev.lines.end > lines.length) {
          reasons.push(`${ev.path} has ${lines.length} lines at ${commit.slice(0, 12)}; cited ${ev.lines.start}-${ev.lines.end}`);
          continue;
        }
        if (ev.quote) {
          const span = ev.lines ? lines.slice(ev.lines.start - 1, ev.lines.end).join('\n') : content;
          if (!norm(span).includes(norm(ev.quote))) reasons.push(`quote not found in ${ev.path}${ev.lines ? `:${ev.lines.start}-${ev.lines.end}` : ''}`);
        }
        if (git(repoRoot, ['diff', '--quiet', commit, '--', ev.path!]) === null) {
          stale = true;
          reasons.push(`${ev.path} changed since ${commit.slice(0, 12)}`);
        }
      }
    }
    const invalid = reasons.some((r) => !/changed since|report hash/.test(r));
    const status: RefStatus = invalid ? 'reference_invalid' : stale ? 'stale' : unchecked ? 'unchecked' : 'valid_references';
    results.push({ id: ins.id, kind: ins.kind, status, reasons });
  }
  return { schemaErrors: [], results, evidenceAvailable: run !== null };
}

export function statusLabel(s: RefStatus): string {
  return s === 'valid_references' ? 'evidence resolved' : s.replace('_', ' ');
}
