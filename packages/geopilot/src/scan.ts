import type { GeoConfig } from './config/config.ts';
import { crawl, defaultFetcher, type Fetcher, type UrlEvidence } from './collect/crawl.ts';
import { isLoopbackUrl, isPublicAddress, bareHost } from './net/address.ts';
import { isIP } from 'node:net';
import { openRepo } from './repo/reader.ts';
import { detectFramework } from './repo/detect.ts';
import { buildGroups, globMatch, includedPath, loadRepoModel, type RepoModel, type ScanContext } from './rules/context.ts';
import { runRules } from './rules/evaluate.ts';
import { score } from './scoring/score.ts';
import { DISCLAIMER, RULESET_VERSION, SCORING_VERSION, TOOL_NAME, TOOL_VERSION } from './core/version.ts';
import { newRunId } from './core/hash.ts';
import { planFixes, type FixProposal } from './fix/plan.ts';
import type { Evaluation, FrameworkInfo, Report, RouteInfo, RuleId, SuppressedFinding } from './types.ts';

export interface ScanOptions {
  readonly repoPath: string | null;
  readonly urls: readonly string[];
  readonly config: GeoConfig;
  readonly configHash: string;
  readonly maxPages?: number;
  readonly maxDepth?: number;
  readonly followExternal?: boolean;
  readonly ignoreRobots?: boolean;
  readonly only?: readonly RuleId[];
  readonly skip?: readonly RuleId[];
  readonly fetcher?: Fetcher;
  readonly now?: () => Date;
}

export interface ScanResult {
  readonly report: Report;
  readonly context: ScanContext;
  readonly fixes: readonly FixProposal[];
  /** Raw HTML of fetched pages, for the bounded DOM snapshots the cache keeps. */
  readonly snapshots: ReadonlyMap<string, string>;
}

const NO_FRAMEWORK: FrameworkInfo = {
  id: 'unknown',
  state: 'unknown',
  version: null,
  confidence: 'low',
  capabilityTier: { urlAudit: 'T0', repo: null, provenance: null, fixes: null },
  evidence: ['no repository was scanned'],
};

function isExplicitLocal(url: string): boolean {
  const u = new URL(url);
  if (isLoopbackUrl(u)) return true;
  const host = bareHost(u.hostname);
  return isIP(host) !== 0 && !isPublicAddress(host);
}

function applySuppressions(config: GeoConfig, evaluations: Evaluation[], now: Date, notices: string[]): { evaluations: Evaluation[]; suppressed: SuppressedFinding[] } {
  const suppressed: SuppressedFinding[] = [];
  const today = now.toISOString().slice(0, 10);
  const active = config.suppress.filter((s) => {
    if (s.expires !== null && s.expires < today) {
      notices.push(`suppression for ${s.rule} on ${s.routes.join(', ')} expired on ${s.expires}; its findings are active again`);
      return false;
    }
    return true;
  });
  const out = evaluations.map((e) => {
    const route = e.subject.kind === 'routeGroup' ? e.subject.route : '/';
    const matching = active.filter((s) => s.rule === e.ruleId && s.routes.some((g) => globMatch(g, route)));
    if (matching.length === 0 || e.findings.length === 0) return e;
    for (const f of e.findings) suppressed.push({ fingerprint: f.fingerprint, ruleId: f.ruleId, reason: matching[0]!.reason, expires: matching[0]!.expires });
    // The evaluation keeps its status: human judgement never changes readiness.
    return { ...e, findings: [] };
  });
  return { evaluations: out, suppressed };
}

export async function scan(opts: ScanOptions): Promise<ScanResult> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now();
  const t0 = Date.now();
  const config = opts.config;
  const notices: string[] = [];

  let repo: RepoModel | null = null;
  let framework: FrameworkInfo = NO_FRAMEWORK;
  if (opts.repoPath !== null) {
    const reader = openRepo(opts.repoPath);
    framework = detectFramework(reader, config.framework);
    repo = loadRepoModel(reader, framework);
    if (reader.truncated) notices.push('the repository has more files than the scan limit; some were not read');
    if (repo.next) for (const e of repo.next.parseErrors) notices.push(`could not parse ${e.file}: ${e.reason.split('\n')[0]}`);
    if (framework.id === 'generic' || framework.id === 'unknown') notices.push(`framework ${framework.state === 'unknown' ? 'not identified' : 'is not mapped to source'}: repository findings are limited to T1 (no exact provenance, no automatic fixes)`);
  }

  let url: UrlEvidence | null = null;
  if (opts.urls.length > 0) {
    const origins = new Set(opts.urls.map((u) => new URL(u).origin));
    if (origins.size > 1) notices.push(`only the first origin is crawled per scan; ${[...origins].slice(1).join(', ')} ignored for link discovery`);
    const explicitHosts = new Set(opts.urls.map((u) => new URL(u).hostname));
    const local = opts.urls.every(isExplicitLocal);
    const maxPages = opts.maxPages ?? config.crawl.maxPages ?? (local ? 200 : 25);
    const extraPaths = ['/llms.txt', ...(config.profile === 'app' ? ['/.well-known/apple-app-site-association', '/.well-known/assetlinks.json'] : [])];
    url = await crawl({
      targets: opts.urls,
      maxPages,
      maxDepth: opts.maxDepth ?? config.crawl.maxDepth,
      followExternal: opts.followExternal ?? false,
      ignoreRobots: opts.ignoreRobots ?? false,
      include: (p) => includedPath(config, p),
      extraPaths,
      fetcher: opts.fetcher ?? defaultFetcher({ explicitHosts }),
    });
    notices.push(...url.notes);
    if (opts.ignoreRobots) notices.push('--ignore-robots was set for this named target; robots.txt rules were not applied to GEO’s own requests');
    if (url.robots.result.status !== null && url.robots.result.status >= 500 && !opts.ignoreRobots) {
      notices.push('robots.txt answered 5xx, so GEO treated the site as disallowed and fetched no pages (RFC 9309). Re-run with --ignore-robots for a named target you own to evaluate pages anyway.');
    }
    if (config.crawl.render === 'always') notices.push('--render always was requested, but this release ships no renderer; render-dependent rules are not evaluated');
  }

  const groups = buildGroups(config, url, repo);
  const ctx: ScanContext = { config, url, repo, groups, rendererAvailable: false, now: startedAt };
  const { evaluations: raw, informational } = runRules(ctx, opts.only ? new Set(opts.only) : null, new Set(opts.skip ?? []));
  const fixes = repo ? planFixes(ctx, raw) : [];
  const withFixes = raw.map((e) => ({
    ...e,
    findings: e.findings.map((f) => ({ ...f, fixes: fixes.filter((x) => x.fingerprints.includes(f.fingerprint)).map((x) => ({ fixId: x.fixId, variant: x.variant, class: x.class })) })),
  }));
  const { evaluations, suppressed } = applySuppressions(config, withFixes, startedAt, notices);
  const s = score(evaluations);

  const routes: RouteInfo[] = groups.map((g) => ({
    route: g.route,
    urls: g.urls,
    files: g.next ? [g.next.pageFile, ...g.next.layoutFiles] : g.static ? [g.static.file] : [],
    dynamic: g.next?.dynamic ?? g.route.includes('['),
  }));
  const snapshots = new Map<string, string>();
  if (url) for (const p of url.pages.values()) if (p.isHtml) snapshots.set(p.url, p.result.body);

  const report: Report = {
    schemaVersion: 'geo-report/v1',
    tool: { name: TOOL_NAME, version: TOOL_VERSION, rulesetVersion: RULESET_VERSION, scoringVersion: SCORING_VERSION },
    run: {
      id: newRunId(startedAt),
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - t0,
      targets: [...(opts.repoPath !== null ? [opts.repoPath] : []), ...opts.urls],
      mode: url && repo ? 'mixed' : url ? 'url' : 'repo',
      configHash: opts.configHash,
      gitCommit: repo?.reader.gitCommit ?? null,
      profile: config.profile,
      ignoreRobots: opts.ignoreRobots ?? false,
    },
    framework,
    routes,
    evaluations,
    informational,
    readiness: s.readiness,
    coverage: s.coverage,
    confidence: s.confidence,
    assessmentScope: s.assessmentScope,
    suppressed,
    notices,
    baseline: null,
    disclaimer: DISCLAIMER,
  };
  return { report, context: ctx, fixes, snapshots };
}
