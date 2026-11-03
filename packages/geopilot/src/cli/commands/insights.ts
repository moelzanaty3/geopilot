import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXIT, usage } from '../../core/errors.ts';
import { canonicalJson } from '../../core/hash.ts';
import { loadRun, type LoadedRun } from '../../cache/runs.ts';
import { statusLabel, validateReferences, validateSchema, type InsightsDoc, type ValidationResult } from '../../insights/validate.ts';
import { renderMarkdown, sortedFindings } from '../../report/render.ts';
import { renderPretty, renderJson, FORMATS, type Format } from '../../report/render.ts';
import type { Report } from '../../types.ts';
import { GLOBAL_FLAGS, INSIGHTS_FLAGS, parseArgs } from '../args.ts';
import { cacheFor, gitRoot, loadFor, resolveCwd, type Deps } from '../context.ts';

function readJson(path: string): unknown {
  if (!existsSync(path)) throw usage(`${path} does not exist`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw usage(`${path} is not valid JSON: ${(e as Error).message}`);
  }
}

function validateFile(file: string, runId: string | undefined, cwd: string, deps: Deps, p: Parameters<typeof loadFor>[1]): { doc: InsightsDoc | null; result: ValidationResult; run: LoadedRun | null } {
  const { doc, errors } = validateSchema(readJson(file));
  if (!doc) return { doc: null, result: { schemaErrors: errors, results: [], evidenceAvailable: false }, run: null };
  const loaded = loadFor(cwd, p, deps.env);
  const root = gitRoot(cwd);
  const cache = cacheFor(root, cwd, loaded, deps.env);
  const id = runId ?? doc.basedOn.runId;
  let run: LoadedRun | null = null;
  try {
    run = loadRun(cache, id);
  } catch {
    run = null;
  }
  return { doc, result: validateReferences(doc, run, root), run };
}

export async function insightsCommand(argv: readonly string[], deps: Deps): Promise<number> {
  const p = parseArgs(argv, [...GLOBAL_FLAGS, ...INSIGHTS_FLAGS]);
  if (p.positionals[0] !== 'validate') throw usage('insights takes validate <file> [--run <id>]');
  const file = p.positionals[1];
  if (!file) throw usage('insights validate needs a file, usually .geo/insights.json');
  const cwd = resolveCwd(p, deps);
  const { result } = validateFile(resolve(cwd, file), p.str.get('run'), cwd, deps, p);
  const json = (p.multi.get('format') ?? []).includes('json');
  if (json) deps.io.out(canonicalJson(result));
  else {
    if (result.schemaErrors.length > 0) deps.io.out(`L1 schema: invalid\n  ${result.schemaErrors.join('\n  ')}\n`);
    else {
      deps.io.out('L1 schema: valid\n');
      if (!result.evidenceAvailable) deps.io.out('L2 references: no retained run evidence (was the scan run with --no-cache?). URL and finding references are unchecked.\n');
      for (const r of result.results) deps.io.out(`  ${r.id.padEnd(16)} ${r.kind.padEnd(14)} ${statusLabel(r.status)}${r.reasons.length ? `: ${r.reasons.join('; ')}` : ''}\n`);
      deps.io.out('L3 semantic quality is a human/model evaluation; it never affects readiness or gates.\n');
    }
  }
  if (result.schemaErrors.length > 0 || result.results.some((r) => r.status === 'reference_invalid')) return EXIT.gate;
  if (!result.evidenceAvailable || result.results.some((r) => r.status === 'unchecked')) return EXIT.incomplete;
  return EXIT.ok;
}

export interface Merged {
  readonly schemaVersion: 'geo-merged/v1';
  readonly report: Report;
  readonly insights: InsightsDoc | null;
  readonly validation: ValidationResult | null;
  readonly sections: {
    readonly verifiedEngineFindings: readonly string[];
    readonly agentRecommendations: readonly string[];
    readonly hypothesesToValidate: readonly string[];
  };
  readonly disclaimer: string;
}

function renderMerged(m: Merged): string {
  const lines = [renderMarkdown(m.report), '## Agent recommendations', ''];
  const status = new Map(m.validation?.results.map((r) => [r.id, r]) ?? []);
  const show = (kind: 'recommendation' | 'hypothesis'): void => {
    const items = (m.insights?.insights ?? []).filter((i) => i.kind === kind && status.get(i.id)?.status !== 'stale' && status.get(i.id)?.status !== 'duplicate_exact');
    if (items.length === 0) lines.push('None.');
    for (const i of items) lines.push(`- **${i.title}** (${i.confidence} confidence; ${statusLabel(status.get(i.id)?.status ?? 'unchecked')}): ${i.description} — _${i.suggestedAction}_`);
    lines.push('');
  };
  show('recommendation');
  lines.push('## Hypotheses to validate', '');
  show('hypothesis');
  lines.push('_Agent output is not an engine result. "Evidence resolved" means the cited files and URLs exist as cited, not that the recommendation is correct._', '');
  return lines.join('\n');
}

export async function reportCommand(argv: readonly string[], deps: Deps): Promise<number> {
  const p = parseArgs(argv, [...GLOBAL_FLAGS, ...INSIGHTS_FLAGS]);
  const sub = p.positionals[0];
  const cwd = resolveCwd(p, deps);
  const output = (p.multi.get('output') ?? [])[0];
  const format = ((p.multi.get('format') ?? [])[0] ?? (output?.endsWith('.json') ? 'json' : 'markdown')) as Format;
  if (!(FORMATS as readonly string[]).includes(format)) throw usage(`unknown --format ${format}`);
  const write = (text: string): void => {
    if (output) writeFileSync(resolve(cwd, output), text);
    else deps.io.out(text);
  };
  if (sub === 'convert') {
    const file = p.positionals[1];
    if (!file) throw usage('report convert needs a saved report.json');
    const report = readJson(resolve(cwd, file)) as Report;
    if (report.schemaVersion !== 'geo-report/v1') throw usage(`${file} is not a geo-report/v1 document`);
    write(format === 'json' ? renderJson(report) : format === 'markdown' ? renderMarkdown(report) : renderPretty(report, deps.io.color));
    return EXIT.ok;
  }
  if (sub === 'merge') {
    const reportFile = p.positionals[1];
    const insightsFile = p.positionals[2];
    if (!reportFile) throw usage('report merge needs <report.json> [insights.json]');
    const report = readJson(resolve(cwd, reportFile)) as Report;
    if (report.schemaVersion !== 'geo-report/v1') throw usage(`${reportFile} is not a geo-report/v1 document`);
    let doc: InsightsDoc | null = null;
    let validation: ValidationResult | null = null;
    if (insightsFile) {
      const v = validateFile(resolve(cwd, insightsFile), p.str.get('run') ?? report.run.id, cwd, deps, p);
      doc = v.doc;
      validation = v.result;
      if (!doc) throw usage(`${insightsFile} fails L1 schema validation: ${v.result.schemaErrors[0]}`);
    }
    const merged: Merged = {
      schemaVersion: 'geo-merged/v1',
      report,
      insights: doc,
      validation,
      sections: {
        verifiedEngineFindings: sortedFindings(report).filter((x) => x.finding.evidenceQuality !== 'inferred').map((x) => x.finding.fingerprint),
        agentRecommendations: (doc?.insights ?? []).filter((i) => i.kind === 'recommendation').map((i) => i.id),
        hypothesesToValidate: (doc?.insights ?? []).filter((i) => i.kind === 'hypothesis').map((i) => i.id),
      },
      disclaimer: report.disclaimer,
    };
    write(format === 'json' ? canonicalJson(merged) : renderMerged(merged));
    return EXIT.ok;
  }
  throw usage('report takes merge or convert');
}
