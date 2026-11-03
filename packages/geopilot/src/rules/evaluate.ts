import type { PageObservation } from '../collect/crawl.ts';
import { normaliseUrl } from '../collect/crawl.ts';
import { blocksIndexing, headFacts, lineOf, parseDirectives, parseHtml, restrictsSnippets, type Directives, type HeadFacts } from '../html/parse.ts';
import { evaluate as robotsEvaluate, parseRobots, type ParsedRobots } from '../robots/robots.ts';
import { crawlersFor } from '../robots/crawlers.ts';
import { parseSitemap } from '../sitemap/sitemap.ts';
import { snippet } from '../core/redact.ts';
import { capLevel, provenanceCaps, resolveMetaKey, type ResolvedKey } from '../frameworks/nextjs-app/analyze.ts';
import { lineCol, type StaticValue } from '../frameworks/ast.ts';
import type { Evaluation, Evidence, InformationalObservation, Provenance, RuleId, Subject } from '../types.ts';
import { fail, finalize, notApplicable, notRun, pass, type FindingDraft, type SubOutcome } from './finalize.ts';
import type { RouteGroup, ScanContext } from './context.ts';

const SITE: Subject = { kind: 'site' };
const URL_ONLY: Provenance = { level: 'unmapped', locations: [], reason: 'URL-only scan: no repository was supplied, so no source is claimed' };
const SEARCH_AGENTS = new Set(['*', 'robots', 'googlebot', 'bingbot']);

// ---------------------------------------------------------------- helpers

function pagesOf(ctx: ScanContext, g: RouteGroup): PageObservation[] {
  if (!ctx.url) return [];
  return g.urls.map((u) => ctx.url!.pages.get(u)).filter((p): p is PageObservation => p !== undefined);
}

function reachable(p: PageObservation): boolean {
  return p.result.error === null && p.result.status !== null;
}

function genericProvenance(ctx: ScanContext): Provenance {
  if (!ctx.repo) return URL_ONLY;
  return { level: 'unmapped', locations: [], reason: `framework ${ctx.repo.framework.id} has no verified source mapping (T1); the agent may investigate` };
}

function httpEvidence(p: PageObservation, detail: string): Evidence {
  return { kind: 'http', url: p.url, ...(p.result.status === null ? {} : { status: p.result.status }), detail };
}

/** X-Robots-Tag: comma-separated, where `agent:` starts a new scope. */
export function parseXRobotsTag(value: string): Directives[] {
  const out: Directives[] = [];
  let agent = '*';
  let current: string[] = [];
  const flush = (): void => {
    if (current.length) out.push(parseDirectives(current.join(','), agent));
    current = [];
  };
  for (const raw of value.split(',')) {
    const m = /^\s*([a-z0-9_-]+)\s*:\s*(.*)$/i.exec(raw);
    if (m && !/^(max-snippet|max-image-preview|max-video-preview|unavailable_after)$/i.test(m[1]!)) {
      flush();
      agent = m[1]!.toLowerCase();
      current.push(m[2]!);
    } else current.push(raw);
  }
  flush();
  return out;
}

function metaDirectives(facts: HeadFacts): Directives[] {
  return facts.robots.map((r) => parseDirectives(r.content, r.name === 'robots' ? '*' : r.name));
}

function relevant(d: Directives): boolean {
  return SEARCH_AGENTS.has(d.agent);
}

/** Robots directives a Next.js metadata `robots` value produces, when it is static. */
function nextRobots(value: StaticValue): { noindex: boolean; nosnippet: boolean } | null {
  if (value.kind === 'string') {
    const d = parseDirectives(value.value);
    return { noindex: blocksIndexing(d), nosnippet: restrictsSnippets(d) };
  }
  if (value.kind !== 'object' || value.dynamicKeys) return null;
  const read = (obj: Extract<StaticValue, { kind: 'object' }>): { noindex: boolean; nosnippet: boolean } | null => {
    let noindex = false;
    let nosnippet = false;
    for (const [k, p] of obj.props) {
      const v = p.value;
      if (v.kind === 'dynamic') return null;
      if (k === 'index' && v.kind === 'boolean' && !v.value) noindex = true;
      if (k === 'nosnippet' && v.kind === 'boolean' && v.value) nosnippet = true;
      if (k === 'max-snippet' && v.kind === 'number' && v.value === 0) nosnippet = true;
    }
    return { noindex, nosnippet };
  };
  const top = read(value);
  if (!top) return null;
  const gb = value.props.get('googleBot');
  if (gb) {
    if (gb.value.kind === 'string') {
      const d = parseDirectives(gb.value.value);
      top.noindex ||= blocksIndexing(d);
      top.nosnippet ||= restrictsSnippets(d);
    } else if (gb.value.kind === 'object') {
      const inner = read(gb.value);
      if (!inner) return null;
      top.noindex ||= inner.noindex;
      top.nosnippet ||= inner.nosnippet;
    } else return null;
  }
  return top;
}

function provenanceFromKey(ctx: ScanContext, g: RouteGroup, r: ResolvedKey, concern: 'html' | 'headers' | 'files'): Provenance {
  const caps = ctx.repo?.next ? provenanceCaps(ctx.repo.next, g.next, concern) : [];
  const level = capLevel(r.level, caps);
  return { level, locations: r.locations, reason: caps.length > 0 && level !== r.level ? `${r.reason}; downgraded: ${caps.join('; ')}` : r.reason };
}

interface RepoRobots {
  readonly state: 'literal' | 'absent' | 'dynamic';
  readonly file: string | null;
  readonly parsed: ParsedRobots | null;
  readonly text: string | null;
  readonly reason: string;
}

function repoRobots(ctx: ScanContext): RepoRobots | null {
  const repo = ctx.repo;
  if (!repo) return null;
  if (repo.next) {
    const n = repo.next;
    if (n.robots.appCode) return { state: 'dynamic', file: n.robots.appCode, parsed: null, text: null, reason: `${n.robots.appCode} generates robots.txt at runtime` };
    if (n.middleware) return { state: 'dynamic', file: n.middleware, parsed: null, text: null, reason: `${n.middleware} may serve or rewrite /robots.txt` };
    const file = n.robots.appTxt ?? n.robots.publicTxt;
    if (n.robots.appTxt && n.robots.publicTxt) return { state: 'dynamic', file, parsed: null, text: null, reason: 'both app/robots.txt and public/robots.txt exist; which one is served is ambiguous' };
    if (file) {
      const text = repo.reader.read(file);
      return text === null ? { state: 'dynamic', file, parsed: null, text: null, reason: `${file} could not be read` } : { state: 'literal', file, parsed: parseRobots(text), text, reason: `literal ${file}` };
    }
    return { state: 'absent', file: null, parsed: null, text: null, reason: 'no robots.txt source in the repository' };
  }
  if (repo.static) {
    const file = repo.static.robotsFile;
    if (!file) return { state: 'absent', file: null, parsed: null, text: null, reason: 'no robots.txt in the site root' };
    const text = repo.reader.read(file);
    return text === null ? { state: 'dynamic', file, parsed: null, text: null, reason: `${file} could not be read` } : { state: 'literal', file, parsed: parseRobots(text), text, reason: `literal ${file}` };
  }
  return null;
}

function urlRobots(ctx: ScanContext): { usable: boolean; parsed: ParsedRobots | null; status: number | null } | null {
  if (!ctx.url) return null;
  const r = ctx.url.robots.result;
  if (r.error || r.status === null || r.status >= 500) return { usable: false, parsed: null, status: r.status };
  if (r.status >= 400) return { usable: true, parsed: parseRobots(''), status: r.status };
  return { usable: true, parsed: ctx.url.robots.parsed, status: r.status };
}

function robotsFileProvenance(ctx: ScanContext): Provenance {
  const rr = repoRobots(ctx);
  if (!rr) return genericProvenance(ctx);
  if (rr.state === 'literal') {
    const caps = ctx.repo?.next ? provenanceCaps(ctx.repo.next, null, 'files') : [];
    return { level: capLevel('exact', caps), locations: [{ file: rr.file! }], reason: caps.length ? `${rr.reason}; downgraded: ${caps.join('; ')}` : rr.reason };
  }
  if (rr.state === 'absent') return { level: 'candidate', locations: [], reason: rr.reason };
  return { level: 'file', locations: rr.file ? [{ file: rr.file }] : [], reason: rr.reason };
}

function samplePaths(ctx: ScanContext): string[] {
  const paths = new Set<string>(['/']);
  for (const g of ctx.groups) {
    if (g.urls[0]) paths.add(new URL(g.urls[0]).pathname);
    else if (!g.route.includes('[')) paths.add(g.route);
    else paths.add(g.route.replace(/\[\[?\.{0,3}[^\]]+\]\]?/g, 'x'));
  }
  return [...paths].sort().slice(0, 50);
}

// ---------------------------------------------------------------- GEO-013

function geo013(ctx: ScanContext): Evaluation[] {
  const outcomes: SubOutcome[] = [];
  const prov = robotsFileProvenance(ctx);
  if (ctx.url) {
    const r = ctx.url.robots.result;
    if (r.error) {
      // A network failure is missing evidence about the site, not evidence of
      // a broken robots.txt: the whole target may simply be unreachable.
      return [{ ...finalize(ctx.config, 'GEO-013', SITE, [notRun('reachability', 'unreachable')]), status: 'error', statusReason: 'unreachable' }];
    } else if (r.status !== null && r.status >= 500) {
      outcomes.push(fail('reachability', [{ subCheck: 'reachability', message: `robots.txt answered ${r.status}; crawlers treat a 5xx as a complete disallow`, evidence: [{ kind: 'http', url: ctx.url.robots.url, status: r.status, detail: 'server error on /robots.txt' }], provenance: prov, anchor: '5xx', capReason: 'GEO-013: robots.txt answered 5xx' }]));
    } else outcomes.push(pass('reachability'));
    if (r.status !== null && r.status >= 200 && r.status < 300) {
      const ct = (r.headers['content-type'] ?? '').toLowerCase();
      const size = r.bytes;
      if (size > 500 * 1024) {
        outcomes.push(fail('parse_size', [{ subCheck: 'parse_size', message: `robots.txt is ${size} bytes; crawlers stop reading at 500 KiB`, evidence: [{ kind: 'robots', url: ctx.url.robots.url, detail: `${size} bytes` }], provenance: prov, anchor: 'size' }]));
      } else if (ct.includes('html') || /^\s*<(!doctype|html)/i.test(r.body)) {
        outcomes.push(fail('parse_size', [{ subCheck: 'parse_size', message: 'robots.txt serves HTML instead of plain-text rules', evidence: [{ kind: 'robots', url: ctx.url.robots.url, header: `content-type: ${ct}`, snippet: snippet(r.body.slice(0, 200)), detail: 'HTML body' }], provenance: prov, anchor: 'html' }]));
      } else outcomes.push(pass('parse_size'));
    } else outcomes.push(notApplicable('parse_size', 'no robots.txt body was served'));
  } else {
    outcomes.push(notRun('reachability', 'needs_url'));
    const rr = repoRobots(ctx);
    if (!rr) outcomes.push(notRun('parse_size', 'needs_url'));
    else if (rr.state === 'literal') {
      const bytes = Buffer.byteLength(rr.text!, 'utf8');
      if (bytes > 500 * 1024) outcomes.push(fail('parse_size', [{ subCheck: 'parse_size', message: `${rr.file} is ${bytes} bytes; crawlers stop reading at 500 KiB`, evidence: [{ kind: 'source', file: rr.file!, detail: `${bytes} bytes` }], provenance: prov, anchor: 'size' }]));
      else if (/^\s*<(!doctype|html)/i.test(rr.text!)) outcomes.push(fail('parse_size', [{ subCheck: 'parse_size', message: `${rr.file} contains HTML, not robots rules`, evidence: [{ kind: 'source', file: rr.file!, detail: 'HTML content' }], provenance: prov, anchor: 'html' }]));
      else outcomes.push(pass('parse_size'));
    } else if (rr.state === 'absent') outcomes.push(notApplicable('parse_size', 'no robots.txt source; a 404 means no rules'));
    else outcomes.push(notRun('parse_size', 'dynamic_source'));
  }
  return [finalize(ctx.config, 'GEO-013', SITE, outcomes)];
}

// ---------------------------------------------------------------- GEO-009

function geo009(ctx: ScanContext, info: InformationalObservation[]): Evaluation[] {
  const policy = ctx.config.policy.aiSearchCrawlers;
  let robots: ParsedRobots | null = null;
  let sourceNote = '';
  const ur = urlRobots(ctx);
  if (ur) {
    if (!ur.usable) {
      const ev = finalize(ctx.config, 'GEO-009', SITE, [notRun('search_access', 'unreachable')]);
      return [ctx.url!.robots.result.error ? { ...ev, status: 'error', statusReason: 'unreachable' } : ev];
    }
    robots = ur.parsed ?? parseRobots('');
    sourceNote = ur.status !== null && ur.status >= 400 ? `robots.txt answered ${ur.status}: no rules apply` : 'served robots.txt';
  } else {
    const rr = repoRobots(ctx);
    if (!rr) return [finalize(ctx.config, 'GEO-009', SITE, [notRun('search_access', 'needs_url')])];
    if (rr.state === 'dynamic') return [finalize(ctx.config, 'GEO-009', SITE, [notRun('search_access', 'dynamic_source')])];
    robots = rr.parsed ?? parseRobots('');
    sourceNote = rr.reason;
  }
  const paths = samplePaths(ctx);
  // Training crawlers and user-triggered fetchers are reported, never scored.
  const trainingPolicy = ctx.config.policy.aiTrainingCrawlers;
  for (const c of [...crawlersFor('training'), ...crawlersFor('user_triggered')]) {
    const blocked = paths.filter((p) => !robotsEvaluate(robots, c.token, p).allowed);
    const state = blocked.length === 0 ? 'allowed on all sampled paths' : blocked.length === paths.length ? 'blocked on all sampled paths' : `blocked on ${blocked.length} of ${paths.length} sampled paths`;
    const note = c.purpose === 'training'
      ? trainingPolicy === 'undecided' ? ' (training-crawler policy is undecided; no recommendation is made)' : ` (declared policy: ${trainingPolicy})`
      : c.honoursRobots ? '' : `; ${c.operator} documents that this user-triggered fetcher may not follow robots.txt`;
    info.push({ ruleId: 'GEO-009', message: `${c.token} (${c.operator}, ${c.purpose.replace('_', '-')}): ${state}${note}`, evidence: [{ kind: 'robots', detail: sourceNote }] });
  }
  if (policy === 'undecided') return [finalize(ctx.config, 'GEO-009', SITE, [notApplicable('search_access', 'policy_undecided')])];
  const prov = robotsFileProvenance(ctx);
  const drafts: FindingDraft[] = [];
  for (const c of crawlersFor('search')) {
    const decisions = paths.map((p) => ({ p, d: robotsEvaluate(robots, c.token, p) }));
    const wrong = decisions.filter(({ d }) => (policy === 'allow' ? !d.allowed : d.allowed));
    if (wrong.length === 0) continue;
    const siteWide = policy === 'allow' && !robotsEvaluate(robots, c.token, '/').allowed;
    const first = wrong[0]!;
    drafts.push({
      subCheck: 'search_access',
      anchor: siteWide ? `${c.token}:site` : c.token,
      message:
        policy === 'allow'
          ? `${c.token} (${c.operator} search) is ${siteWide ? 'blocked site-wide' : `blocked on ${wrong.length} of ${paths.length} sampled paths`}, but policy.aiSearchCrawlers is allow`
          : `${c.token} (${c.operator} search) is allowed on ${wrong.length} sampled paths, but policy.aiSearchCrawlers is block`,
      evidence: [{ kind: 'robots', detail: `${sourceNote}; e.g. ${first.p}${first.d.rule ? ` matched "${first.d.rule.allow ? 'Allow' : 'Disallow'}: ${first.d.rule.pattern}" (line ${first.d.rule.line}, ${first.d.group} group)` : ' matched no rule'}` }],
      provenance: prov,
      ...(siteWide ? { capReason: `GEO-009: ${c.token} is blocked site-wide against declared policy` } : {}),
    });
  }
  return [finalize(ctx.config, 'GEO-009', SITE, [drafts.length ? fail('search_access', drafts) : pass('search_access')])];
}

// ---------------------------------------------------------------- GEO-014

function routeRobotsDisallow(robots: ParsedRobots, path: string): { token: string; rule: string; line: number } | null {
  for (const token of ['Googlebot', 'Bingbot']) {
    const d = robotsEvaluate(robots, token, path);
    if (!d.allowed) return { token, rule: d.rule ? `Disallow: ${d.rule.pattern}` : 'disallow', line: d.rule?.line ?? 0 };
  }
  return null;
}

function representativePath(g: RouteGroup): string {
  return g.urls[0] ? new URL(g.urls[0]).pathname : g.route.replace(/\[\[?\.{0,3}[^\]]+\]\]?/g, 'x');
}

interface RepoMetaRead {
  readonly state: 'value' | 'absent' | 'unknown';
  readonly value: StaticValue | null;
  readonly provenance: Provenance;
}

function readRepoKey(ctx: ScanContext, g: RouteGroup, key: string, concern: 'html' | 'headers' | 'files'): RepoMetaRead | null {
  const repo = ctx.repo;
  if (!repo) return null;
  if (repo.next && g.next) {
    const r = resolveMetaKey(repo.next, g.next, key);
    const provenance = provenanceFromKey(ctx, g, r, concern);
    if (r.missing) return { state: 'absent', value: null, provenance };
    if (r.value && r.value.kind !== 'dynamic') return { state: 'value', value: r.value, provenance };
    return { state: 'unknown', value: null, provenance };
  }
  return null;
}

function staticPageProv(file: string, line: number | null, reason: string): Provenance {
  return { level: 'exact', locations: [line ? { file, line } : { file }], reason };
}

function geo014(ctx: ScanContext): Evaluation[] {
  const out: Evaluation[] = [];
  const ur = urlRobots(ctx);
  const rr = repoRobots(ctx);
  for (const g of ctx.groups) {
    const subject: Subject = { kind: 'routeGroup', route: g.route };
    if (ctx.url) {
      if (!(g.listed || g.linked)) {
        out.push(finalize(ctx.config, 'GEO-014', subject, [notApplicable('http_status', 'not_in_scope')]));
        continue;
      }
    } else if (g.listed === false) {
      out.push(finalize(ctx.config, 'GEO-014', subject, [notApplicable('http_status', 'not_in_scope')]));
      continue;
    }
    const outcomes: SubOutcome[] = [];
    const pages = pagesOf(ctx, g);
    const reach = pages.filter(reachable);
    const prov = ctx.url ? genericProvenance(ctx) : URL_ONLY;
    let quality: 'direct' | 'partial' = 'direct';
    if (ctx.url && pages.length > 0 && reach.length === 0) {
      out.push({ ...finalize(ctx.config, 'GEO-014', subject, [notRun('http_status', 'unreachable')]), status: 'error', statusReason: 'unreachable' });
      continue;
    }
    if (ctx.url && reach.length < pages.length) quality = 'partial';
    const metaRead = readRepoKey(ctx, g, 'robots', 'headers');
    const repoMetaProv = (fallback: Provenance): Provenance => (metaRead ? metaRead.provenance : g.static ? staticPageProv(g.static.file, null, `literal markup in ${g.static.file}`) : fallback);

    // http_status
    if (ctx.url && reach.length > 0) {
      const bad = reach.filter((p) => p.result.status !== 200);
      outcomes.push(bad.length ? fail('http_status', bad.map((p) => ({ subCheck: 'http_status', anchor: new URL(p.url).pathname, message: `${p.url} answers ${p.result.status}${p.result.redirects.length ? ` after ${p.result.redirects.length} redirect(s)` : ''}`, evidence: [httpEvidence(p, `final URL ${p.result.finalUrl}`)], provenance: prov }))) : pass('http_status'));
    } else outcomes.push(notRun('http_status', 'needs_url'));

    // meta_noindex
    if (ctx.url && reach.length > 0) {
      const hits = reach.filter((p) => p.facts && metaDirectives(p.facts).some((d) => relevant(d) && blocksIndexing(d)));
      outcomes.push(hits.length ? fail('meta_noindex', hits.map((p) => ({ subCheck: 'meta_noindex', anchor: new URL(p.url).pathname, message: `${new URL(p.url).pathname} carries a robots noindex meta tag`, evidence: [{ kind: 'html', url: p.url, selector: 'meta[name=robots]', snippet: snippet(p.facts!.robots.map((r) => `${r.name}: ${r.content}`).join('; ')), detail: 'noindex in robots meta' }], provenance: repoMetaProv(prov) }))) : pass('meta_noindex'));
    } else if (metaRead) {
      if (metaRead.state === 'unknown') outcomes.push(notRun('meta_noindex', 'dynamic_source'));
      else if (metaRead.state === 'absent') outcomes.push(pass('meta_noindex'));
      else {
        const r = nextRobots(metaRead.value!);
        if (r === null) outcomes.push(notRun('meta_noindex', 'dynamic_source'));
        else if (r.noindex) outcomes.push(fail('meta_noindex', [{ subCheck: 'meta_noindex', message: `${g.route} sets robots noindex in its metadata`, evidence: [{ kind: 'source', file: metaRead.provenance.locations[0]?.file ?? '', ...(metaRead.provenance.locations[0]?.line ? { line: metaRead.provenance.locations[0].line } : {}), detail: 'metadata.robots blocks indexing' }], provenance: metaRead.provenance }]));
        else outcomes.push(pass('meta_noindex'));
      }
    } else if (g.static) {
      const facts = g.static.facts;
      if (g.static.scriptTouches.has('robots')) outcomes.push(notRun('meta_noindex', 'dynamic_source'));
      else if (metaDirectives(facts).some((d) => relevant(d) && blocksIndexing(d))) {
        const el = g.static.doc.elements.find((e) => e.name === 'meta' && /robots|googlebot|bingbot/i.test(e.attrs.get('name') ?? ''));
        outcomes.push(fail('meta_noindex', [{ subCheck: 'meta_noindex', message: `${g.route} carries a literal robots noindex meta tag`, evidence: [{ kind: 'source', file: g.static.file, ...(el ? { line: lineOf(g.static.doc.source, el.start) } : {}), detail: 'noindex in robots meta' }], provenance: staticPageProv(g.static.file, el ? lineOf(g.static.doc.source, el.start) : null, 'literal robots meta') }]));
      } else outcomes.push(pass('meta_noindex'));
    } else outcomes.push(notRun('meta_noindex', 'needs_url'));

    // header_noindex
    if (ctx.url && reach.length > 0) {
      const hits = reach.filter((p) => parseXRobotsTag(p.result.headers['x-robots-tag'] ?? '').some((d) => relevant(d) && blocksIndexing(d)));
      outcomes.push(hits.length ? fail('header_noindex', hits.map((p) => ({ subCheck: 'header_noindex', anchor: new URL(p.url).pathname, message: `${new URL(p.url).pathname} sends X-Robots-Tag: ${p.result.headers['x-robots-tag']}`, evidence: [{ kind: 'http', url: p.url, header: `x-robots-tag: ${p.result.headers['x-robots-tag']}`, detail: 'noindex header' }], provenance: ctx.repo?.next ? { level: 'candidate', locations: [...(ctx.repo.next.middleware ? [{ file: ctx.repo.next.middleware }] : []), ...(ctx.repo.next.nextConfig ? [{ file: ctx.repo.next.nextConfig.file }] : [])], reason: 'response header; set by middleware, next.config headers() or the host' } : prov }))) : pass('header_noindex'));
    } else outcomes.push(notRun('header_noindex', 'needs_url'));

    // robots_disallow
    const path = representativePath(g);
    if (ur) {
      if (!ur.usable) outcomes.push(notRun('robots_disallow', 'unreachable'));
      else {
        const hit = routeRobotsDisallow(ur.parsed ?? parseRobots(''), path);
        outcomes.push(hit ? fail('robots_disallow', [{ subCheck: 'robots_disallow', message: `robots.txt disallows ${hit.token} from ${path}`, evidence: [{ kind: 'robots', url: ctx.url!.robots.url, line: hit.line, detail: hit.rule }], provenance: robotsFileProvenance(ctx) }]) : pass('robots_disallow'));
      }
    } else if (rr) {
      if (rr.state === 'dynamic') outcomes.push(notRun('robots_disallow', 'dynamic_source'));
      else {
        const hit = routeRobotsDisallow(rr.parsed ?? parseRobots(''), path);
        outcomes.push(hit ? fail('robots_disallow', [{ subCheck: 'robots_disallow', message: `${rr.file} disallows ${hit.token} from ${path}`, evidence: [{ kind: 'source', file: rr.file!, line: hit.line, detail: hit.rule }], provenance: robotsFileProvenance(ctx) }]) : pass('robots_disallow'));
      }
    } else outcomes.push(notRun('robots_disallow', 'needs_url'));

    out.push(finalize(ctx.config, 'GEO-014', subject, outcomes, { quality, ...(ctx.url ? { sampledUrls: g.urls } : {}) }));
  }
  return out;
}

// ---------------------------------------------------------------- GEO-015

function canonicalFromRepo(ctx: ScanContext, g: RouteGroup): { state: 'value' | 'absent' | 'unknown'; url: string | null; relative: boolean; provenance: Provenance } | null {
  const alt = readRepoKey(ctx, g, 'alternates', 'html');
  if (alt) {
    if (alt.state !== 'value') return { state: alt.state, url: null, relative: false, provenance: alt.provenance };
    const v = alt.value!;
    if (v.kind !== 'object') return { state: 'unknown', url: null, relative: false, provenance: alt.provenance };
    const c = v.props.get('canonical');
    if (!c) return v.dynamicKeys ? { state: 'unknown', url: null, relative: false, provenance: alt.provenance } : { state: 'absent', url: null, relative: false, provenance: { ...alt.provenance, level: alt.provenance.level === 'exact' ? 'absent' : alt.provenance.level } };
    let raw: string | null = null;
    if (c.value.kind === 'string') raw = c.value.value;
    else if (c.value.kind === 'object' && c.value.props.get('url')?.value.kind === 'string') raw = (c.value.props.get('url')!.value as { value: string }).value;
    if (raw === null) return { state: 'unknown', url: null, relative: false, provenance: alt.provenance };
    const prov: Provenance = { ...alt.provenance, locations: [{ file: alt.provenance.locations[0]?.file ?? '', ...lineCol(c.node) }] };
    if (/^https?:\/\//i.test(raw)) return { state: 'value', url: raw, relative: false, provenance: prov };
    const base = readRepoKey(ctx, g, 'metadataBase', 'html');
    if (base?.state === 'value' && base.value?.kind === 'string') {
      try {
        return { state: 'value', url: new URL(raw, base.value.value).href, relative: false, provenance: prov };
      } catch {
        return { state: 'unknown', url: null, relative: true, provenance: prov };
      }
    }
    if (base && base.state === 'unknown') return { state: 'unknown', url: null, relative: true, provenance: prov };
    return { state: 'value', url: raw, relative: true, provenance: prov };
  }
  if (g.static) {
    const el = g.static.doc.elements.find((e) => e.name === 'link' && /\bcanonical\b/i.test(e.attrs.get('rel') ?? ''));
    if (g.static.scriptTouches.has('canonical')) return { state: 'unknown', url: null, relative: false, provenance: { level: 'unmapped', locations: [{ file: g.static.file }], reason: 'a script on the page may set the canonical' } };
    if (!el) return { state: 'absent', url: null, relative: false, provenance: { level: 'absent', locations: [{ file: g.static.file }], reason: `no <link rel=canonical> in ${g.static.file}` } };
    const href = el.attrs.get('href') ?? '';
    return { state: 'value', url: href, relative: !/^https?:\/\//i.test(href), provenance: staticPageProv(g.static.file, lineOf(g.static.doc.source, el.start), 'literal canonical link') };
  }
  return null;
}

function geo015(ctx: ScanContext): Evaluation[] {
  const out: Evaluation[] = [];
  const origin = ctx.config.site.origin;
  for (const g of ctx.groups) {
    const subject: Subject = { kind: 'routeGroup', route: g.route };
    const pages = pagesOf(ctx, g);
    const reach = pages.filter((p) => reachable(p) && p.result.status === 200 && p.facts);
    if (ctx.url && pages.length > 0 && pages.every((p) => !reachable(p))) {
      out.push({ ...finalize(ctx.config, 'GEO-015', subject, [notRun('canonical_present', 'unreachable')]), status: 'error', statusReason: 'unreachable' });
      continue;
    }
    if (ctx.url && g.urls.length === 0 && !ctx.repo) continue;
    const repoCanon = canonicalFromRepo(ctx, g);
    const prov = repoCanon?.provenance ?? genericProvenance(ctx);
    const outcomes: SubOutcome[] = [];
    let observed: { url: string; canonical: string }[] = [];
    if (ctx.url && reach.length > 0) {
      const drafts: FindingDraft[] = [];
      for (const p of reach) {
        const c = p.facts!.canonical;
        const path = new URL(p.url).pathname;
        if (c.length === 0) drafts.push({ subCheck: 'canonical_present', anchor: path, message: `${path} has no canonical link`, evidence: [{ kind: 'html', url: p.url, selector: 'link[rel=canonical]', detail: 'absent' }], provenance: prov });
        else if (new Set(c).size > 1) drafts.push({ subCheck: 'canonical_present', anchor: path, message: `${path} declares ${c.length} different canonicals`, evidence: [{ kind: 'html', url: p.url, selector: 'link[rel=canonical]', snippet: snippet(c.join(' | ')), detail: 'conflicting canonicals' }], provenance: prov });
        else if (!/^https?:\/\//i.test(c[0]!)) drafts.push({ subCheck: 'canonical_present', anchor: path, message: `${path} has a relative canonical (${c[0]})`, evidence: [{ kind: 'html', url: p.url, selector: 'link[rel=canonical]', snippet: snippet(c[0]!), detail: 'relative URL' }], provenance: prov });
        else observed.push({ url: p.url, canonical: c[0]! });
      }
      outcomes.push(drafts.length ? fail('canonical_present', drafts) : pass('canonical_present'));
    } else if (repoCanon) {
      if (repoCanon.state === 'unknown') outcomes.push(notRun('canonical_present', 'dynamic_source'));
      else if (repoCanon.state === 'absent') outcomes.push(fail('canonical_present', [{ subCheck: 'canonical_present', message: `${g.route} declares no canonical`, evidence: [{ kind: 'source', file: prov.locations[0]?.file ?? '', detail: 'no alternates.canonical in the metadata chain' }], provenance: prov }]));
      else if (repoCanon.relative) outcomes.push(fail('canonical_present', [{ subCheck: 'canonical_present', message: `${g.route} declares a relative canonical (${repoCanon.url}) with no literal metadataBase`, evidence: [{ kind: 'source', file: prov.locations[0]?.file ?? '', ...(prov.locations[0]?.line ? { line: prov.locations[0].line } : {}), detail: 'relative canonical' }], provenance: prov }]));
      else {
        outcomes.push(pass('canonical_present'));
        observed = [{ url: g.route, canonical: repoCanon.url! }];
      }
    } else outcomes.push(notRun('canonical_present', 'needs_url'));

    if (!origin) outcomes.push(notRun('declared_origin', 'origin_not_declared'));
    else if (observed.length === 0) outcomes.push(outcomes[0]!.status === 'fail' ? notApplicable('declared_origin', 'not_in_scope') : notRun('declared_origin', 'dynamic_source'));
    else {
      const off = observed.filter((o) => new URL(o.canonical).origin !== origin);
      outcomes.push(off.length ? fail('declared_origin', off.map((o) => ({ subCheck: 'declared_origin', anchor: o.url, message: `canonical ${o.canonical} is not on the declared origin ${origin}`, evidence: [{ kind: ctx.url ? 'html' : 'source', ...(ctx.url ? { url: o.url } : {}), detail: `canonical origin ${new URL(o.canonical).origin}` }], provenance: prov }))) : pass('declared_origin'));
    }

    if (!ctx.url) outcomes.push(notRun('target_indexable', 'needs_url'));
    else if (observed.length === 0) outcomes.push(notApplicable('target_indexable', 'not_in_scope'));
    else {
      const drafts: FindingDraft[] = [];
      for (const o of observed) {
        const target = normaliseUrl(o.canonical);
        const obs = target ? ctx.url.pages.get(target)?.result ?? ctx.url.extras.get(target) : undefined;
        if (!obs) continue;
        const doc = obs.status === 200 ? parseHtml(obs.body) : null;
        const noindex = doc ? metaDirectives(headFacts(doc)).some((d) => relevant(d) && blocksIndexing(d)) || parseXRobotsTag(obs.headers['x-robots-tag'] ?? '').some((d) => relevant(d) && blocksIndexing(d)) : false;
        if (obs.status !== 200 || noindex) {
          drafts.push({ subCheck: 'target_indexable', anchor: o.url, message: `canonical target ${o.canonical} ${obs.status !== 200 ? `answers ${obs.status ?? obs.error?.code}` : 'is noindex'}`, evidence: [{ kind: 'http', url: o.canonical, ...(obs.status === null ? {} : { status: obs.status }), detail: obs.status !== 200 ? 'non-200 canonical target' : 'noindex canonical target' }], provenance: prov });
        }
      }
      const checked = observed.filter((o) => {
        const t = normaliseUrl(o.canonical);
        return t !== null && (ctx.url!.pages.has(t) || ctx.url!.extras.has(t));
      });
      if (drafts.length) outcomes.push(fail('target_indexable', drafts));
      else if (checked.length === observed.length) outcomes.push(pass('target_indexable'));
      else outcomes.push(notRun('target_indexable', 'not_in_scope'));
    }
    out.push(finalize(ctx.config, 'GEO-015', subject, outcomes, { quality: ctx.url && reach.length < pages.length ? 'partial' : 'direct', ...(ctx.url ? { sampledUrls: g.urls } : {}) }));
  }
  return out;
}

// ---------------------------------------------------------------- GEO-011

function geo011(ctx: ScanContext): Evaluation[] {
  const outcomes: SubOutcome[] = [];
  const repo = ctx.repo;
  const sitemapProv = (): Provenance => {
    if (repo?.next) {
      const n = repo.next;
      const files = [...n.sitemap.publicXml, ...(n.sitemap.appXml ? [n.sitemap.appXml] : []), ...n.sitemap.appCode];
      if (files.length === 0) return { level: n.middleware ? 'candidate' : 'absent', locations: [{ file: `${n.appDir}/sitemap.ts` }], reason: n.middleware ? `no sitemap source, but ${n.middleware} could serve one` : 'no sitemap source in public/ or the app directory' };
      if (n.sitemap.appCode.length > 0) return { level: 'file', locations: n.sitemap.appCode.map((file) => ({ file })), reason: 'sitemap is generated by code' };
      return { level: capLevel('exact', provenanceCaps(n, null, 'files')), locations: files.map((file) => ({ file })), reason: 'literal sitemap file' };
    }
    if (repo?.static) {
      return repo.static.sitemapFiles.length ? { level: 'exact', locations: repo.static.sitemapFiles.map((file) => ({ file })), reason: 'literal sitemap file' } : { level: 'absent', locations: [], reason: 'no sitemap file in the site root' };
    }
    return genericProvenance(ctx);
  };
  if (ctx.url) {
    const valid = ctx.url.sitemaps.filter((s) => s.parsed && s.parsed.kind !== 'invalid' && s.parsed.errors.length === 0);
    const fetched = ctx.url.sitemaps.filter((s) => s.result.status === 200);
    const answered = ctx.url.sitemaps.filter((s) => s.result.status !== null);
    if (answered.length === 0) {
      // Nothing answered (network failure, or robots.txt unavailable so GEO did not fetch): no evidence either way.
      return [{ ...finalize(ctx.config, 'GEO-011', SITE, [notRun('sitemap_valid', 'unreachable')]), status: 'error', statusReason: 'unreachable' }];
    }
    if (valid.length > 0) outcomes.push(pass('sitemap_valid'));
    else if (fetched.length > 0) {
      outcomes.push(fail('sitemap_valid', fetched.map((s) => ({ subCheck: 'sitemap_valid', anchor: s.url, message: `${s.url} does not parse as a sitemap: ${s.parsed?.errors[0] ?? 'invalid'}`, evidence: [{ kind: 'sitemap', url: s.url, detail: s.parsed?.errors.join('; ') ?? 'invalid' }], provenance: sitemapProv() }))));
    } else {
      outcomes.push(fail('sitemap_valid', [{ subCheck: 'sitemap_valid', message: 'no sitemap was found (none referenced from robots.txt, and /sitemap.xml is not served)', evidence: ctx.url.sitemaps.map((s) => ({ kind: 'sitemap' as const, url: s.url, ...(s.result.status === null ? {} : { status: s.result.status }), detail: s.result.error?.message ?? `status ${s.result.status}` })), provenance: sitemapProv() }]));
    }
    const ur = urlRobots(ctx)!;
    if (!ur.usable) outcomes.push(notRun('discoverable', 'unreachable'));
    else if ((ur.parsed?.sitemaps.length ?? 0) > 0) outcomes.push(pass('discoverable'));
    else outcomes.push(fail('discoverable', [{ subCheck: 'discoverable', message: 'robots.txt has no Sitemap: line', evidence: [{ kind: 'robots', url: ctx.url.robots.url, detail: ur.status !== null && ur.status >= 400 ? `robots.txt answered ${ur.status}` : 'no Sitemap directive' }], provenance: robotsFileProvenance(ctx) }]));
    const listed = ctx.url.sitemapUrls.map((u) => ctx.url!.pages.get(normaliseUrl(u) ?? u)).filter((p): p is PageObservation => p !== undefined);
    if (ctx.url.sitemapUrls.length === 0) outcomes.push(notApplicable('listed_accessible', 'not_in_scope'));
    else if (listed.length === 0) outcomes.push(notRun('listed_accessible', 'not_in_scope'));
    else {
      const bad = listed.filter((p) => p.result.status !== 200);
      outcomes.push(bad.length ? fail('listed_accessible', bad.slice(0, 20).map((p) => ({ subCheck: 'listed_accessible', anchor: p.url, message: `sitemap lists ${p.url}, which answers ${p.result.status ?? p.result.error?.code}`, evidence: [httpEvidence(p, 'listed in sitemap')], provenance: sitemapProv() }))) : pass('listed_accessible'));
    }
  } else if (repo && (repo.next || repo.static)) {
    const prov = sitemapProv();
    if (prov.level === 'file') outcomes.push(notRun('sitemap_valid', 'dynamic_source'));
    else if (prov.level === 'absent' || prov.locations.length === 0) {
      outcomes.push(fail('sitemap_valid', [{ subCheck: 'sitemap_valid', message: 'the repository has no sitemap source', evidence: [{ kind: 'source', detail: prov.reason }], provenance: prov }]));
    } else if (prov.level === 'candidate') outcomes.push(notRun('sitemap_valid', 'dynamic_source'));
    else {
      const bad = prov.locations.map((l) => ({ file: l.file, parsed: parseSitemap(repo.reader.read(l.file) ?? '') })).filter((x) => x.parsed.kind === 'invalid' || x.parsed.errors.length > 0);
      outcomes.push(bad.length ? fail('sitemap_valid', bad.map((b) => ({ subCheck: 'sitemap_valid', anchor: b.file, message: `${b.file} does not parse as a sitemap: ${b.parsed.errors[0]}`, evidence: [{ kind: 'source', file: b.file, detail: b.parsed.errors.join('; ') }], provenance: prov }))) : pass('sitemap_valid'));
    }
    const rr = repoRobots(ctx)!;
    if (rr.state === 'dynamic') outcomes.push(notRun('discoverable', 'dynamic_source'));
    else if (rr.state === 'literal' && rr.parsed!.sitemaps.length > 0) outcomes.push(pass('discoverable'));
    else outcomes.push(fail('discoverable', [{ subCheck: 'discoverable', message: rr.state === 'absent' ? 'no robots.txt source, so no Sitemap: line' : `${rr.file} has no Sitemap: line`, evidence: [{ kind: 'source', ...(rr.file ? { file: rr.file } : {}), detail: rr.reason }], provenance: robotsFileProvenance(ctx) }]));
    outcomes.push(notRun('listed_accessible', 'needs_url'));
  } else {
    outcomes.push(notRun('sitemap_valid', 'needs_url'), notRun('discoverable', 'needs_url'), notRun('listed_accessible', 'needs_url'));
  }
  return [finalize(ctx.config, 'GEO-011', SITE, outcomes)];
}

// ---------------------------------------------------------------- GEO-012

function nonEmptyTitle(v: StaticValue): boolean | null {
  if (v.kind === 'string') return v.value.trim().length > 0;
  if (v.kind === 'object') {
    for (const k of ['absolute', 'default']) {
      const p = v.props.get(k);
      if (p && p.value.kind === 'string') return p.value.value.trim().length > 0;
      if (p && p.value.kind === 'dynamic') return null;
    }
    return v.dynamicKeys ? null : false;
  }
  if (v.kind === 'null') return false;
  return null;
}

function geo012(ctx: ScanContext): Evaluation[] {
  const out: Evaluation[] = [];
  const next = ctx.repo?.next ?? null;
  for (const g of ctx.groups) {
    const subject: Subject = { kind: 'routeGroup', route: g.route };
    const pages = pagesOf(ctx, g);
    const reach = pages.filter((p) => reachable(p) && p.result.status === 200 && p.facts);
    if (ctx.url && pages.length > 0 && reach.length === 0) {
      out.push({ ...finalize(ctx.config, 'GEO-012', subject, [notRun('title', 'unreachable')]), status: 'error', statusReason: 'unreachable' });
      continue;
    }
    if (ctx.url && pages.length === 0 && !ctx.repo) continue;
    const outcomes: SubOutcome[] = [];
    const langProv = (): Provenance => {
      if (next) {
        const caps = provenanceCaps(next, g.next, 'html');
        if (!next.rootLayout || !next.html) return { level: 'unmapped', locations: next.rootLayout ? [{ file: next.rootLayout }] : [], reason: 'root layout renders no literal <html> element' };
        const loc = { file: next.rootLayout, ...lineCol(next.html.node) };
        if (next.html.hasSpread) return { level: 'candidate', locations: [loc], reason: '<html> spreads props; lang may come from them' };
        const base: Provenance = next.html.lang === null
          ? { level: 'absent', locations: [loc], reason: `<html> in ${next.rootLayout} has no lang attribute` }
          : next.html.lang.kind === 'literal'
            ? { level: 'exact', locations: [{ file: next.rootLayout, ...lineCol(next.html.lang.node) }], reason: `literal lang on <html> in ${next.rootLayout}` }
            : { level: 'file', locations: [{ file: next.rootLayout, ...lineCol(next.html.lang.node) }], reason: 'lang is computed' };
        const level = capLevel(base.level, caps);
        return level === base.level ? base : { ...base, level, reason: `${base.reason}; downgraded: ${caps.join('; ')}` };
      }
      if (g.static) {
        const el = g.static.doc.elements.find((e) => e.name === 'html');
        if (g.static.scriptTouches.has('lang')) return { level: 'unmapped', locations: [{ file: g.static.file }], reason: 'a script on the page may set lang' };
        if (!el) return { level: 'candidate', locations: [{ file: g.static.file }], reason: 'no literal <html> element' };
        return { level: el.attrs.has('lang') ? 'exact' : 'absent', locations: [{ file: g.static.file, line: lineOf(g.static.doc.source, el.start) }], reason: el.attrs.has('lang') ? 'literal lang' : `<html> in ${g.static.file} has no lang attribute` };
      }
      return genericProvenance(ctx);
    };
    const keyProv = (key: 'title' | 'description'): Provenance => {
      const r = readRepoKey(ctx, g, key, 'html');
      if (r) return r.provenance;
      if (g.static) {
        const el = key === 'title' ? g.static.doc.elements.find((e) => e.name === 'title') : g.static.doc.elements.find((e) => e.name === 'meta' && (e.attrs.get('name') ?? '').toLowerCase() === 'description');
        if (g.static.scriptTouches.has(key)) return { level: 'unmapped', locations: [{ file: g.static.file }], reason: `a script on the page may set the ${key}` };
        return el ? staticPageProv(g.static.file, lineOf(g.static.doc.source, el.start), `literal ${key}`) : { level: 'absent', locations: [{ file: g.static.file }], reason: `no ${key} in ${g.static.file}` };
      }
      return genericProvenance(ctx);
    };
    if (ctx.url && reach.length > 0) {
      const check = (id: 'title' | 'description' | 'lang', get: (f: HeadFacts) => string | null, label: string, prov: () => Provenance): SubOutcome => {
        const bad = reach.filter((p) => !(get(p.facts!) ?? '').trim());
        return bad.length ? fail(id, bad.map((p) => ({ subCheck: id, anchor: new URL(p.url).pathname, message: `${new URL(p.url).pathname} has no ${label}`, evidence: [{ kind: 'html', url: p.url, selector: id === 'lang' ? 'html[lang]' : id === 'title' ? 'title' : 'meta[name=description]', detail: 'missing or empty' }], provenance: prov() }))) : pass(id);
      };
      outcomes.push(check('title', (f) => f.title, 'title', () => keyProv('title')));
      outcomes.push(check('description', (f) => f.description, 'meta description', () => keyProv('description')));
      outcomes.push(check('lang', (f) => f.lang, 'lang attribute on <html>', langProv));
    } else if (next && g.next) {
      for (const key of ['title', 'description'] as const) {
        const r = readRepoKey(ctx, g, key, 'html')!;
        if (r.state === 'unknown') outcomes.push(notRun(key, 'dynamic_source'));
        else {
          const ok = r.state === 'value' ? (key === 'title' ? nonEmptyTitle(r.value!) : r.value!.kind === 'string' && r.value!.value.trim().length > 0) : false;
          if (ok === null) outcomes.push(notRun(key, 'dynamic_source'));
          else outcomes.push(ok ? pass(key) : fail(key, [{ subCheck: key, message: `${g.route} has no ${key === 'title' ? 'title' : 'meta description'} in its metadata chain`, evidence: [{ kind: 'source', file: r.provenance.locations[0]?.file ?? g.next.pageFile, detail: r.provenance.reason }], provenance: r.provenance }]));
        }
      }
      const lp = langProv();
      if (lp.level === 'exact' || (next.html?.lang?.kind === 'literal')) outcomes.push(next.html!.lang!.kind === 'literal' && (next.html!.lang as { value: string }).value.trim() ? pass('lang') : fail('lang', [{ subCheck: 'lang', message: 'root <html> has an empty lang', evidence: [{ kind: 'source', file: next.rootLayout!, detail: 'empty lang' }], provenance: lp }]));
      else if (next.html && next.html.lang === null && !next.html.hasSpread) outcomes.push(fail('lang', [{ subCheck: 'lang', message: `root <html> in ${next.rootLayout} has no lang attribute`, evidence: [{ kind: 'source', file: next.rootLayout!, line: lp.locations[0]?.line ?? 1, detail: 'no lang attribute' }], provenance: lp }]));
      else outcomes.push(notRun('lang', 'dynamic_source'));
    } else if (g.static) {
      const f = g.static.facts;
      for (const [id, value, label] of [['title', f.title, 'title'], ['description', f.description, 'meta description'], ['lang', f.lang, 'lang attribute on <html>']] as const) {
        const touched = g.static.scriptTouches.has(id);
        if ((value ?? '').trim()) outcomes.push(pass(id));
        else if (touched) outcomes.push(notRun(id, 'dynamic_source'));
        else {
          const prov = id === 'lang' ? langProv() : keyProv(id);
          outcomes.push(fail(id, [{ subCheck: id, message: `${g.static.file} has no ${label}`, evidence: [{ kind: 'source', file: g.static.file, ...(prov.locations[0]?.line ? { line: prov.locations[0].line } : {}), detail: 'missing or empty' }], provenance: prov }]));
        }
      }
    } else outcomes.push(notRun('title', 'needs_url'), notRun('description', 'needs_url'), notRun('lang', 'needs_url'));
    out.push(finalize(ctx.config, 'GEO-012', subject, outcomes, { quality: ctx.url && reach.length < pages.length ? 'partial' : 'direct', ...(ctx.url ? { sampledUrls: g.urls } : {}) }));
  }
  return out;
}

// ---------------------------------------------------------------- GEO-016

function geo016(ctx: ScanContext): Evaluation[] {
  const out: Evaluation[] = [];
  for (const g of ctx.groups) {
    const subject: Subject = { kind: 'routeGroup', route: g.route };
    if (g.route === '/') {
      out.push(finalize(ctx.config, 'GEO-016', subject, [notApplicable('server_link', 'entry_route')]));
      continue;
    }
    if (!ctx.url) {
      out.push(finalize(ctx.config, 'GEO-016', subject, [notRun('server_link', 'needs_url')]));
      continue;
    }
    const pages = pagesOf(ctx, g);
    if (pages.length === 0) {
      out.push(finalize(ctx.config, 'GEO-016', subject, [notRun('server_link', 'not_in_scope')]));
      continue;
    }
    if (pages.every((p) => !reachable(p))) {
      out.push({ ...finalize(ctx.config, 'GEO-016', subject, [notRun('server_link', 'unreachable')]), status: 'error', statusReason: 'unreachable' });
      continue;
    }
    const linked = pages.some((p) => [...(ctx.url!.inbound.get(p.url) ?? [])].some((from) => from !== p.url));
    out.push(
      finalize(ctx.config, 'GEO-016', subject, [
        linked
          ? pass('server_link')
          : fail('server_link', [{ subCheck: 'server_link', message: `no crawled page links to ${g.route} in its server HTML`, evidence: [{ kind: 'html', url: pages[0]!.url, detail: `discovered via ${pages[0]!.via}; ${ctx.url.pages.size} pages crawled` }], provenance: genericProvenance(ctx) }]),
      ], { sampledUrls: g.urls }),
    );
  }
  return out;
}

// ---------------------------------------------------------------- GEO-017

function geo017(ctx: ScanContext): Evaluation[] {
  const out: Evaluation[] = [];
  const allow = ctx.config.policy.aiSearchCrawlers === 'allow';
  for (const g of ctx.groups) {
    const subject: Subject = { kind: 'routeGroup', route: g.route };
    if (!allow) {
      out.push(finalize(ctx.config, 'GEO-017', subject, [notApplicable('snippet_meta', 'policy_undecided')]));
      continue;
    }
    const pages = pagesOf(ctx, g);
    const reach = pages.filter((p) => reachable(p) && p.result.status === 200);
    if (ctx.url && pages.length > 0 && reach.length === 0) {
      out.push({ ...finalize(ctx.config, 'GEO-017', subject, [notRun('snippet_meta', 'unreachable')]), status: 'error', statusReason: 'unreachable' });
      continue;
    }
    if (ctx.url && pages.length === 0 && !ctx.repo) continue;
    const outcomes: SubOutcome[] = [];
    const metaRead = readRepoKey(ctx, g, 'robots', 'headers');
    if (ctx.url && reach.length > 0) {
      const hits = reach.filter((p) => p.facts && metaDirectives(p.facts).some((d) => relevant(d) && restrictsSnippets(d)));
      outcomes.push(hits.length ? fail('snippet_meta', hits.map((p) => ({ subCheck: 'snippet_meta', anchor: new URL(p.url).pathname, message: `${new URL(p.url).pathname} restricts snippets (nosnippet / max-snippet:0) while policy allows AI search`, evidence: [{ kind: 'html', url: p.url, selector: 'meta[name=robots]', snippet: snippet(p.facts!.robots.map((r) => r.content).join('; ')), detail: 'snippet restriction' }], provenance: metaRead?.provenance ?? genericProvenance(ctx) }))) : pass('snippet_meta'));
      const hh = reach.filter((p) => parseXRobotsTag(p.result.headers['x-robots-tag'] ?? '').some((d) => relevant(d) && restrictsSnippets(d)));
      outcomes.push(hh.length ? fail('snippet_header', hh.map((p) => ({ subCheck: 'snippet_header', anchor: new URL(p.url).pathname, message: `${new URL(p.url).pathname} sends a snippet-restricting X-Robots-Tag`, evidence: [{ kind: 'http', url: p.url, header: `x-robots-tag: ${p.result.headers['x-robots-tag']}`, detail: 'snippet restriction' }], provenance: genericProvenance(ctx) }))) : pass('snippet_header'));
    } else if (ctx.repo?.next && g.next && metaRead) {
      if (metaRead.state === 'unknown') outcomes.push(notRun('snippet_meta', 'dynamic_source'));
      else if (metaRead.state === 'absent') outcomes.push(pass('snippet_meta'));
      else {
        const r = nextRobots(metaRead.value!);
        if (r === null) outcomes.push(notRun('snippet_meta', 'dynamic_source'));
        else outcomes.push(r.nosnippet ? fail('snippet_meta', [{ subCheck: 'snippet_meta', message: `${g.route} restricts snippets in metadata.robots while policy allows AI search`, evidence: [{ kind: 'source', file: metaRead.provenance.locations[0]?.file ?? '', detail: 'nosnippet or max-snippet: 0' }], provenance: metaRead.provenance }]) : pass('snippet_meta'));
      }
      const n = ctx.repo.next;
      const headerSources = [...(n.middleware ? [n.middleware] : []), ...(n.nextConfig?.keys.includes('headers') ? [n.nextConfig.file] : [])];
      outcomes.push(headerSources.length ? notRun('snippet_header', 'dynamic_source') : pass('snippet_header'));
    } else if (g.static) {
      const hit = metaDirectives(g.static.facts).some((d) => relevant(d) && restrictsSnippets(d));
      outcomes.push(g.static.scriptTouches.has('robots') ? notRun('snippet_meta', 'dynamic_source') : hit ? fail('snippet_meta', [{ subCheck: 'snippet_meta', message: `${g.static.file} restricts snippets while policy allows AI search`, evidence: [{ kind: 'source', file: g.static.file, detail: 'nosnippet or max-snippet:0' }], provenance: staticPageProv(g.static.file, null, 'literal robots meta') }]) : pass('snippet_meta'));
      outcomes.push(notRun('snippet_header', 'needs_url'));
    } else outcomes.push(notRun('snippet_meta', 'needs_url'), notRun('snippet_header', 'needs_url'));
    out.push(finalize(ctx.config, 'GEO-017', subject, outcomes, { quality: ctx.url && reach.length < pages.length ? 'partial' : 'direct', ...(ctx.url ? { sampledUrls: g.urls } : {}) }));
  }
  return out;
}

// ---------------------------------------------------------------- GEO-003

function geo003(ctx: ScanContext): Evaluation[] {
  const out: Evaluation[] = [];
  for (const g of ctx.groups) {
    const subject: Subject = { kind: 'routeGroup', route: g.route };
    if (ctx.url && g.urls.length > 0) {
      out.push(finalize(ctx.config, 'GEO-003', subject, [notRun('server_text_ratio', 'renderer_unavailable')]));
      continue;
    }
    if (g.next) {
      // Repo-only evidence is inferred and never scored (spec 9).
      const findings: FindingDraft[] = g.next.clientPage
        ? [{ subCheck: 'server_text_ratio', message: `${g.next.pageFile} is a client component ("use client"); its primary content may be absent from server HTML`, evidence: [{ kind: 'source', file: g.next.pageFile, line: 1, detail: '"use client" directive' }], provenance: { level: 'file', locations: [{ file: g.next.pageFile, line: 1 }], reason: 'page module is a client component' } }]
        : [];
      out.push(finalize(ctx.config, 'GEO-003', subject, [findings.length ? fail('server_text_ratio', findings) : pass('server_text_ratio')], { quality: 'inferred' }));
      continue;
    }
    if (g.static) {
      out.push(finalize(ctx.config, 'GEO-003', subject, [pass('server_text_ratio')], { quality: 'inferred' }));
      continue;
    }
    out.push(finalize(ctx.config, 'GEO-003', subject, [notRun('server_text_ratio', ctx.url ? 'renderer_unavailable' : 'needs_url')]));
  }
  return out;
}

// ---------------------------------------------------------------- GEO-004

const REQUIRED: Record<string, readonly (string | readonly string[])[]> = {
  Article: ['headline'],
  NewsArticle: ['headline'],
  BlogPosting: ['headline'],
  Product: ['name', ['offers', 'review', 'aggregateRating']],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
  Recipe: ['name', 'image'],
  Event: ['name', 'startDate', 'location'],
  JobPosting: ['title', 'datePosted', 'description', 'hiringOrganization', 'jobLocation'],
  LocalBusiness: ['name', 'address'],
  Review: ['itemReviewed', 'author'],
  VideoObject: ['name', 'thumbnailUrl', 'uploadDate'],
  SoftwareApplication: ['name'],
};

function jsonLdNodes(value: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if ('@type' in o) out.push(o);
      if (Array.isArray(o['@graph'])) (o['@graph'] as unknown[]).forEach(visit);
    }
  };
  visit(value);
  return out;
}

function checkJsonLd(blocks: readonly string[]): { parseErrors: string[]; missing: string[]; nodes: Record<string, unknown>[] } {
  const parseErrors: string[] = [];
  const missing: string[] = [];
  const nodes: Record<string, unknown>[] = [];
  blocks.forEach((raw, i) => {
    try {
      const parsed = JSON.parse(raw) as unknown;
      for (const node of jsonLdNodes(parsed)) {
        nodes.push(node);
        const types = (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).filter((t): t is string => typeof t === 'string');
        for (const type of types) {
          for (const req of REQUIRED[type] ?? []) {
            const alts = typeof req === 'string' ? [req] : req;
            if (!alts.some((k) => node[k] !== undefined && node[k] !== null && node[k] !== '')) missing.push(`${type} block ${i + 1} lacks ${alts.join(' or ')}`);
          }
        }
      }
    } catch (e) {
      parseErrors.push(`block ${i + 1}: ${(e as Error).message}`);
    }
  });
  return { parseErrors, missing, nodes };
}

function geo004(ctx: ScanContext, info: InformationalObservation[]): Evaluation[] {
  const out: Evaluation[] = [];
  for (const g of ctx.groups) {
    const subject: Subject = { kind: 'routeGroup', route: g.route };
    const pages = pagesOf(ctx, g).filter((p) => reachable(p) && p.facts);
    let blocks: { raw: string; where: string; file?: string; line?: number }[] = [];
    let prov: Provenance = genericProvenance(ctx);
    if (ctx.url && pages.length > 0) {
      blocks = pages.flatMap((p) => p.facts!.jsonLd.map((b) => ({ raw: b.raw, where: p.url })));
    } else if (g.static) {
      blocks = g.static.facts.jsonLd.map((b) => ({ raw: b.raw, where: g.static!.file, file: g.static!.file, line: lineOf(g.static!.doc.source, b.offset) }));
      prov = { level: 'exact', locations: blocks[0]?.line ? [{ file: g.static.file, line: blocks[0].line }] : [{ file: g.static.file }], reason: 'literal JSON-LD script' };
    } else if (g.next && ctx.repo) {
      const files = [g.next.pageFile, ...g.next.layoutFiles];
      const withLd = files.filter((f) => (ctx.repo!.reader.read(f) ?? '').includes('application/ld+json'));
      if (withLd.length > 0) {
        out.push(finalize(ctx.config, 'GEO-004', subject, [notRun('parses', 'dynamic_source'), notRun('required_properties', 'dynamic_source')]));
        continue;
      }
      out.push(finalize(ctx.config, 'GEO-004', subject, [notApplicable('parses', 'no_jsonld')]));
      continue;
    } else if (!ctx.url) {
      out.push(finalize(ctx.config, 'GEO-004', subject, [notRun('parses', 'needs_url')]));
      continue;
    } else {
      continue;
    }
    if (blocks.length === 0) {
      out.push(finalize(ctx.config, 'GEO-004', subject, [notApplicable('parses', 'no_jsonld')]));
      continue;
    }
    const r = checkJsonLd(blocks.map((b) => b.raw));
    if (ctx.config.profile === 'app' && r.nodes.some((n) => ['SoftwareApplication', 'MobileApplication'].includes(String(n['@type'])))) {
      info.push({ ruleId: 'GEO-102', message: `${g.route} declares SoftwareApplication / MobileApplication structured data`, evidence: [{ kind: 'html', detail: blocks[0]!.where }] });
    }
    const ev = (detail: string): Evidence => (blocks[0]!.file ? { kind: 'source', file: blocks[0]!.file, ...(blocks[0]!.line ? { line: blocks[0]!.line } : {}), detail } : { kind: 'html', url: blocks[0]!.where, selector: 'script[type="application/ld+json"]', detail });
    out.push(
      finalize(ctx.config, 'GEO-004', subject, [
        r.parseErrors.length ? fail('parses', [{ subCheck: 'parses', message: `JSON-LD on ${g.route} does not parse: ${r.parseErrors[0]}`, evidence: [ev(r.parseErrors.join('; '))], provenance: prov }]) : pass('parses'),
        r.missing.length ? fail('required_properties', [{ subCheck: 'required_properties', message: `JSON-LD on ${g.route}: ${r.missing[0]}${r.missing.length > 1 ? ` (and ${r.missing.length - 1} more)` : ''}`, evidence: [ev(r.missing.join('; '))], provenance: prov }]) : r.parseErrors.length && r.nodes.length === 0 ? notApplicable('required_properties', 'not_in_scope') : pass('required_properties'),
      ], ctx.url ? { sampledUrls: g.urls } : {}),
    );
  }
  return out;
}

// ---------------------------------------------------------------- GEO-002

function geo002(ctx: ScanContext): Evaluation[] {
  return ctx.groups.map((g) => finalize(ctx.config, 'GEO-002', { kind: 'routeGroup', route: g.route }, [notRun('axe_subset', ctx.url && g.urls.length > 0 ? 'renderer_unavailable' : 'needs_url')]));
}

// ---------------------------------------------------------------- GEO-101

function geo101(ctx: ScanContext): Evaluation[] {
  const c = ctx.config;
  if (c.profile !== 'app') return [finalize(c, 'GEO-101', SITE, [notApplicable('aasa', 'web_profile')])];
  if (!c.appLinks.ios && !c.appLinks.android) return [finalize(c, 'GEO-101', SITE, [notApplicable('aasa', 'not_in_scope')])];
  if (!ctx.url) return [finalize(c, 'GEO-101', SITE, [c.appLinks.ios ? notRun('aasa', 'needs_url') : notApplicable('aasa', 'not_in_scope'), c.appLinks.android ? notRun('assetlinks', 'needs_url') : notApplicable('assetlinks', 'not_in_scope')])];
  const get = (path: string) => ctx.url!.extras.get(new URL(path, ctx.url!.origin).href);
  const outcomes: SubOutcome[] = [];
  const prov = genericProvenance(ctx);
  const check = (id: 'aasa' | 'assetlinks', path: string, verify: (json: unknown) => string | null): SubOutcome => {
    const r = get(path);
    if (!r) return notRun(id, 'not_in_scope');
    const url = new URL(path, ctx.url!.origin).href;
    const problem = (msg: string): SubOutcome => fail(id, [{ subCheck: id, message: `${path}: ${msg}`, evidence: [{ kind: 'http', url, ...(r.status === null ? {} : { status: r.status }), detail: msg }], provenance: prov }]);
    if (r.error) return problem(r.error.message);
    if (r.redirects.length > 0) return problem('is served through a redirect; it must be served directly');
    if (r.status !== 200) return problem(`answers ${r.status}`);
    if (!(r.headers['content-type'] ?? '').includes('json')) return problem(`content-type is ${r.headers['content-type'] ?? 'missing'}, not application/json`);
    let json: unknown;
    try {
      json = JSON.parse(r.body);
    } catch {
      return problem('is not valid JSON');
    }
    const v = verify(json);
    return v ? problem(v) : pass(id);
  };
  if (c.appLinks.ios) {
    const ids = c.appLinks.ios.appIds;
    outcomes.push(check('aasa', '/.well-known/apple-app-site-association', (json) => {
      const details = ((json as { applinks?: { details?: { appID?: string; appIDs?: string[] }[] } }).applinks?.details ?? []);
      const declared = new Set(details.flatMap((d) => [...(d.appIDs ?? []), ...(d.appID ? [d.appID] : [])]));
      const missingIds = ids.filter((id) => !declared.has(id));
      return missingIds.length ? `does not name ${missingIds.join(', ')}` : null;
    }));
  } else outcomes.push(notApplicable('aasa', 'not_in_scope'));
  if (c.appLinks.android) {
    const a = c.appLinks.android;
    outcomes.push(check('assetlinks', '/.well-known/assetlinks.json', (json) => {
      if (!Array.isArray(json)) return 'is not a JSON array';
      const entry = (json as { target?: { package_name?: string; sha256_cert_fingerprints?: string[] } }[]).find((e) => e.target?.package_name === a.packageName);
      if (!entry) return `does not name package ${a.packageName}`;
      const fps = new Set((entry.target?.sha256_cert_fingerprints ?? []).map((f) => f.toUpperCase()));
      const missingFp = a.sha256CertFingerprints.filter((f) => !fps.has(f.toUpperCase()));
      return missingFp.length ? `does not list fingerprint ${missingFp[0]}` : null;
    }));
  } else outcomes.push(notApplicable('assetlinks', 'not_in_scope'));
  return [finalize(c, 'GEO-101', SITE, outcomes)];
}

// ---------------------------------------------------------------- GEO-010

function geo010(ctx: ScanContext, info: InformationalObservation[]): void {
  if (!ctx.url) return;
  const r = ctx.url.extras.get(new URL('/llms.txt', ctx.url.origin).href);
  if (r && r.status === 200 && !(r.headers['content-type'] ?? '').includes('html')) {
    info.push({ ruleId: 'GEO-010', message: `/llms.txt is present (${r.bytes} bytes). It is an experimental proposal; GEO does not score it.`, evidence: [{ kind: 'http', url: r.url, status: 200, detail: 'present' }] });
  }
}

// ---------------------------------------------------------------- entry

export const RULE_ORDER: readonly RuleId[] = ['GEO-013', 'GEO-009', 'GEO-014', 'GEO-015', 'GEO-003', 'GEO-004', 'GEO-011', 'GEO-012', 'GEO-016', 'GEO-017', 'GEO-002', 'GEO-101'];

export interface RuleRun {
  readonly evaluations: Evaluation[];
  readonly informational: InformationalObservation[];
}

export function runRules(ctx: ScanContext, only: ReadonlySet<RuleId> | null, skip: ReadonlySet<RuleId>): RuleRun {
  const info: InformationalObservation[] = [];
  const evaluations: Evaluation[] = [];
  const table: Record<string, () => Evaluation[]> = {
    'GEO-013': () => geo013(ctx),
    'GEO-009': () => geo009(ctx, info),
    'GEO-014': () => geo014(ctx),
    'GEO-015': () => geo015(ctx),
    'GEO-003': () => geo003(ctx),
    'GEO-004': () => geo004(ctx, info),
    'GEO-011': () => geo011(ctx),
    'GEO-012': () => geo012(ctx),
    'GEO-016': () => geo016(ctx),
    'GEO-017': () => geo017(ctx),
    'GEO-002': () => geo002(ctx),
    'GEO-101': () => geo101(ctx),
  };
  for (const id of RULE_ORDER) {
    const disabled = ctx.config.rules[id] === 'off' || skip.has(id) || (only !== null && !only.has(id));
    if (disabled) {
      evaluations.push({ ruleId: id, subject: SITE, status: 'not_applicable', statusReason: 'rule_disabled', evidenceQuality: 'direct', subChecks: [], findings: [] });
      continue;
    }
    try {
      evaluations.push(...table[id]!());
    } catch (e) {
      evaluations.push({ ruleId: id, subject: SITE, status: 'error', statusReason: 'internal_error', evidenceQuality: 'direct', subChecks: [{ id: 'internal', scope: 'both', status: 'not_run', reason: (e as Error).message }], findings: [] });
    }
  }
  if (ctx.config.rules['GEO-010'] !== 'off' && !skip.has('GEO-010')) geo010(ctx, info);
  return { evaluations, informational: info.filter((i) => i.ruleId !== 'GEO-102' || ctx.config.profile === 'app') };
}
