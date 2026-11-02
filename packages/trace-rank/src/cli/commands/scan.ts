import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXIT, usage } from '../../core/errors.ts';
import { printableConfig, type GeoConfig } from '../../config/config.ts';
import { saveRun } from '../../cache/runs.ts';
import { findRule } from '../../rules/catalogue.ts';
import { scan, type ScanResult } from '../../scan.ts';
import type { RuleId, Severity } from '../../types.ts';
import { intFlag, parseArgs, GLOBAL_FLAGS, SCAN_FLAGS, type Parsed } from '../args.ts';
import { cacheFor, emit, loadFor, resolveCwd, type Deps } from '../context.ts';

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1, info: 0 };

function ruleList(values: readonly string[] | undefined, flag: string): RuleId[] | undefined {
  if (!values) return undefined;
  return values.flatMap((v) => v.split(',')).map((id) => {
    const meta = findRule(id.trim());
    if (!meta) throw usage(`--${flag} ${id}: unknown rule id`, 'Run trace-rank rules for the catalogue.');
    return meta.id;
  });
}

function normaliseUrlArg(u: string): string {
  try {
    const url = new URL(u);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('scheme');
    return url.href;
  } catch {
    throw usage(`${u} is not an http(s) URL`);
  }
}

export interface ScanInvocation {
  readonly result: ScanResult;
  readonly cache: string | null;
  readonly cwd: string;
  readonly repoPath: string | null;
  readonly config: GeoConfig;
}

/** Shared by `scan` and `fix`: resolve targets, load config, run, cache. */
export async function runScan(p: Parsed, deps: Deps, forceRepo = false): Promise<ScanInvocation> {
  const cwd = resolveCwd(p, deps);
  const positional = p.positionals[0];
  const urls = [...(p.multi.get('url') ?? [])].map(normaliseUrlArg);
  let repoPath: string | null = null;
  if (positional && /^https?:\/\//i.test(positional)) urls.unshift(normaliseUrlArg(positional));
  else if (positional) {
    repoPath = resolve(cwd, positional);
    if (!existsSync(repoPath) || !statSync(repoPath).isDirectory()) throw usage(`${positional} is not a directory or an http(s) URL`);
  } else if (urls.length === 0 || forceRepo) repoPath = cwd;
  if (p.positionals.length > 1) throw usage('scan takes one path or URL; pass more URLs with --url');
  if (p.bool.has('ignore-robots') && urls.length === 0) throw usage('--ignore-robots only applies to an explicitly named URL target');
  const loaded = loadFor(repoPath ?? cwd, p, deps.env);
  let config = loaded.config;
  const render = p.str.get('render');
  if (render !== undefined) {
    if (!['auto', 'always', 'never'].includes(render)) throw usage('--render must be auto, always or never');
    config = { ...config, crawl: { ...config.crawl, render: render as GeoConfig['crawl']['render'] } };
  }
  const routes = p.multi.get('routes');
  if (routes) config = { ...config, routes: { ...config.routes, include: routes.flatMap((r) => r.split(',')) } };
  if (p.str.has('baseline')) throw usage('--baseline is not available in this release', 'Baselines ship in Phase 3.');
  const result = await scan({
    repoPath,
    urls,
    config,
    configHash: loaded.hash,
    ...(intFlag(p, 'max-pages', 1, 200) === undefined ? {} : { maxPages: intFlag(p, 'max-pages', 1, 200)! }),
    ...(intFlag(p, 'max-depth', 0, 10) === undefined ? {} : { maxDepth: intFlag(p, 'max-depth', 0, 10)! }),
    followExternal: p.bool.has('follow-external'),
    ignoreRobots: p.bool.has('ignore-robots'),
    ...(ruleList(p.multi.get('rule'), 'rule') ? { only: ruleList(p.multi.get('rule'), 'rule')! } : {}),
    ...(ruleList(p.multi.get('skip-rule'), 'skip-rule') ? { skip: ruleList(p.multi.get('skip-rule'), 'skip-rule')! } : {}),
    ...(deps.fetcher ? { fetcher: deps.fetcher } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  });
  let cache: string | null = null;
  if (!p.bool.has('no-cache')) {
    cache = cacheFor(repoPath, cwd, loaded, deps.env);
    saveRun(cache, result.report, result.snapshots);
  }
  return { result, cache, cwd, repoPath, config };
}

export async function scanCommand(argv: readonly string[], deps: Deps): Promise<number> {
  const p = parseArgs(argv, [...GLOBAL_FLAGS, ...SCAN_FLAGS]);
  if (p.bool.has('print-config')) {
    const cwd = resolveCwd(p, deps);
    deps.io.out(printableConfig(loadFor(cwd, p, deps.env).config));
    return EXIT.ok;
  }
  const failOn = p.str.get('fail-on');
  if (failOn !== undefined && !(failOn in SEVERITY_RANK)) throw usage('--fail-on must be high, medium, low or info');
  const minReadiness = intFlag(p, 'min-readiness', 0, 100);
  const { result, cache, cwd, config } = await runScan(p, deps);
  const r = result.report;
  emit(r, p, deps, cwd);
  if (cache && !p.bool.has('quiet')) deps.io.err(deps.io.errColor.dim(`run ${r.run.id} cached in ${cache}\n`));

  const gateFailOn = (failOn as Severity | undefined) ?? config.thresholds.failOn;
  const gateMin = minReadiness ?? config.thresholds.minReadiness;
  let code: number = EXIT.ok;
  if (gateFailOn) {
    const hits = r.evaluations.flatMap((e) => e.findings).filter((f) => f.evidenceQuality !== 'inferred' && SEVERITY_RANK[f.severity] >= SEVERITY_RANK[gateFailOn]);
    if (hits.length > 0) {
      deps.io.err(`gate: ${hits.length} finding(s) at or above ${gateFailOn}\n`);
      code = EXIT.gate;
    }
  }
  if (gateMin !== null && gateMin !== undefined) {
    if (r.readiness.value === null || r.readiness.display === 'insufficient_evidence') {
      deps.io.err(`gate: readiness is unavailable (insufficient evidence), so --min-readiness ${gateMin} cannot pass\n`);
      code = EXIT.gate;
    } else if (r.readiness.value < gateMin) {
      deps.io.err(`gate: readiness ${Math.round(r.readiness.value)} is below ${gateMin}\n`);
      code = EXIT.gate;
    }
  }
  if (code === EXIT.ok && p.bool.has('fail-on-incomplete') && (r.assessmentScope.assessment === 'incomplete' || r.coverage < config.thresholds.minCoverage)) {
    deps.io.err(`gate: assessment is ${r.assessmentScope.assessment} with ${Math.round(r.coverage)}% coverage (minimum ${config.thresholds.minCoverage}%)\n`);
    code = EXIT.incomplete;
  }
  return code;
}
