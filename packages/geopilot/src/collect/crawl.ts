import { guardedFetch, HostScheduler, type BodyKind, type FetchResult, type NetPolicy } from '../net/fetch.ts';
import { isLoopbackUrl } from '../net/address.ts';
import { asBlocked, botProtection, isRefusal } from '../net/bot-protection.ts';
import { headFacts, parseHtml, type Document, type HeadFacts } from '../html/parse.ts';
import { evaluate, parseRobots, type ParsedRobots } from '../robots/robots.ts';
import { parseSitemap, type ParsedSitemap } from '../sitemap/sitemap.ts';

export type Fetcher = (url: string, kind: BodyKind) => Promise<FetchResult>;

export interface PageObservation {
  readonly url: string;
  readonly result: FetchResult;
  readonly via: 'target' | 'sitemap' | 'link';
  readonly depth: number;
  readonly doc: Document | null;
  readonly facts: HeadFacts | null;
  readonly isHtml: boolean;
}

export interface BlockedEvidence {
  readonly url: string;
  readonly status: number;
  readonly protection: string | null;
}

export interface UrlEvidence {
  readonly origin: string;
  /** Set when bot protection or a firewall answered instead of the site. */
  readonly blocked: BlockedEvidence | null;
  readonly targets: readonly string[];
  readonly robots: { readonly url: string; readonly result: FetchResult; readonly parsed: ParsedRobots | null };
  readonly sitemaps: readonly { readonly url: string; readonly result: FetchResult; readonly parsed: ParsedSitemap | null; readonly via: 'robots' | 'default' | 'index' }[];
  readonly sitemapUrls: readonly string[];
  readonly pages: ReadonlyMap<string, PageObservation>;
  /** Normalised target URL → pages whose server HTML links to it. */
  readonly inbound: ReadonlyMap<string, ReadonlySet<string>>;
  readonly extras: ReadonlyMap<string, FetchResult>;
  readonly skippedByRobots: readonly string[];
  readonly ignoreRobots: boolean;
  readonly notes: readonly string[];
}

export interface CrawlOptions {
  readonly targets: readonly string[];
  readonly maxPages: number;
  readonly maxDepth: number;
  readonly followExternal: boolean;
  readonly ignoreRobots: boolean;
  readonly include: (path: string) => boolean;
  readonly extraPaths: readonly string[];
  readonly fetcher: Fetcher;
}

export const GEO_UA_TOKEN = 'geopilot';

export function normaliseUrl(input: string, base?: string): string | null {
  try {
    const u = base ? new URL(input, base) : new URL(input);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

export function defaultFetcher(policy: NetPolicy): Fetcher {
  const scheduler = new HostScheduler();
  return (url, kind) => {
    let host = url;
    let local = false;
    try {
      const u = new URL(url);
      host = u.host;
      local = isLoopbackUrl(u);
    } catch {
      // guardedFetch reports the malformed URL itself
    }
    return scheduler.run(host, local, () => guardedFetch(url, kind, policy));
  };
}

function allowedHost(url: URL, origin: URL, followExternal: boolean): boolean {
  if (url.origin === origin.origin) return true;
  if (!followExternal) return false;
  const base = origin.hostname.replace(/^www\./, '');
  return url.hostname === base || url.hostname.endsWith(`.${base}`);
}

function isHtmlResponse(r: FetchResult): boolean {
  const ct = (r.headers['content-type'] ?? '').toLowerCase();
  return ct === '' ? /^\s*(<!doctype html|<html)/i.test(r.body) : ct.includes('html');
}

export async function crawl(opts: CrawlOptions): Promise<UrlEvidence> {
  const first = new URL(opts.targets[0]!);
  const origin = new URL(first.origin);
  const notes: string[] = [];
  const block: { evidence: BlockedEvidence | null } = { evidence: null };
  const markBlocked = (result: FetchResult, protection: string | null): FetchResult => {
    block.evidence ??= { url: result.url, status: result.status!, protection };
    return asBlocked(result, protection);
  };
  const f: Fetcher = async (url, kind) => {
    const result = await opts.fetcher(url, kind);
    const protection = botProtection(result);
    return protection ? markBlocked(result, protection) : result;
  };

  const robotsUrl = new URL('/robots.txt', origin).href;
  let robotsResult = await f(robotsUrl, 'robots');
  // RFC 9309 reads a 4xx robots.txt as "no rules". If the entry page refuses us too,
  // the 4xx is the firewall talking, so it says nothing about the site's rules.
  if (isRefusal(robotsResult)) {
    const entry = await f(first.href, 'html');
    if (block.evidence || isRefusal(entry)) robotsResult = markBlocked(robotsResult, null);
  }
  const robotsParsed = robotsResult.status !== null && robotsResult.status >= 200 && robotsResult.status < 300 ? parseRobots(robotsResult.body) : null;
  if (robotsParsed) {
    const delay = robotsParsed.groups.find((g) => g.agents.includes(GEO_UA_TOKEN) || g.agents.includes('*'))?.crawlDelay;
    if (delay) notes.push(`robots.txt asks for a crawl-delay of ${delay}s; GEO honours up to 2s`);
  }
  const robotsServerError = robotsResult.status !== null && robotsResult.status >= 500;
  const robotsUnreachable = robotsResult.error !== null;

  const mayFetch = (url: string): boolean => {
    if (block.evidence) return false;
    if (opts.ignoreRobots) return true;
    // RFC 9309 2.3.1.4: an unreachable or 5xx robots.txt means assume complete disallow.
    if (robotsServerError || robotsUnreachable) return false;
    if (!robotsParsed) return true;
    const u = new URL(url);
    return evaluate(robotsParsed, GEO_UA_TOKEN, `${u.pathname}${u.search}`).allowed;
  };

  const sitemaps: { url: string; result: FetchResult; parsed: ParsedSitemap | null; via: 'robots' | 'default' | 'index' }[] = [];
  const sitemapUrls: string[] = [];
  const sitemapQueue: { url: string; via: 'robots' | 'default' | 'index' }[] = [];
  for (const s of robotsParsed?.sitemaps ?? []) {
    const n = normaliseUrl(s.url);
    if (n && allowedHost(new URL(n), origin, opts.followExternal)) sitemapQueue.push({ url: n, via: 'robots' });
  }
  if (sitemapQueue.length === 0) sitemapQueue.push({ url: new URL('/sitemap.xml', origin).href, via: 'default' });
  const seenSitemaps = new Set<string>();
  while (sitemapQueue.length > 0 && seenSitemaps.size < 6) {
    const next = sitemapQueue.shift()!;
    if (seenSitemaps.has(next.url)) continue;
    seenSitemaps.add(next.url);
    if (!mayFetch(next.url)) continue;
    const result = await f(next.url, 'sitemap');
    const ok = result.status !== null && result.status >= 200 && result.status < 300;
    const parsed = ok ? parseSitemap(result.body) : null;
    sitemaps.push({ url: next.url, result, parsed, via: next.via });
    if (parsed?.kind === 'sitemapindex') {
      for (const loc of parsed.locs.slice(0, 5)) sitemapQueue.push({ url: loc, via: 'index' });
    } else if (parsed?.kind === 'urlset') {
      for (const loc of parsed.locs) sitemapUrls.push(loc);
    }
  }

  const pages = new Map<string, PageObservation>();
  const inbound = new Map<string, Set<string>>();
  const skippedByRobots: string[] = [];
  const queue: { url: string; via: PageObservation['via']; depth: number }[] = [];
  const queued = new Set<string>();
  const enqueue = (url: string, via: PageObservation['via'], depth: number): void => {
    const n = normaliseUrl(url);
    if (!n || queued.has(n)) return;
    const u = new URL(n);
    if (!allowedHost(u, origin, opts.followExternal) || !opts.include(u.pathname)) return;
    queued.add(n);
    queue.push({ url: n, via, depth });
  };
  for (const t of opts.targets) enqueue(t, 'target', 0);
  for (const s of sitemapUrls) enqueue(s, 'sitemap', 1);

  while (queue.length > 0 && pages.size < opts.maxPages) {
    const batch = queue.splice(0, Math.min(4, opts.maxPages - pages.size));
    await Promise.all(
      batch.map(async (item) => {
        if (!mayFetch(item.url)) {
          skippedByRobots.push(item.url);
          return;
        }
        const result = await f(item.url, 'html');
        const html = result.error === null && isHtmlResponse(result);
        const doc = html ? parseHtml(result.body) : null;
        const facts = doc ? headFacts(doc) : null;
        pages.set(item.url, { url: item.url, result, via: item.via, depth: item.depth, doc, facts, isHtml: html });
        if (!facts) return;
        for (const href of facts.links) {
          const target = normaliseUrl(href, result.finalUrl);
          if (!target) continue;
          if (!inbound.has(target)) inbound.set(target, new Set());
          inbound.get(target)!.add(item.url);
          if (item.depth < opts.maxDepth) enqueue(target, 'link', item.depth + 1);
        }
      }),
    );
  }
  if (queue.length > 0) notes.push(`page budget of ${opts.maxPages} reached; ${queue.length} discovered URLs were not fetched`);
  if (!block.evidence && skippedByRobots.length > 0) notes.push(`${skippedByRobots.length} URLs were not fetched because robots.txt disallows ${GEO_UA_TOKEN}`);

  const extras = new Map<string, FetchResult>();
  for (const path of opts.extraPaths) {
    const url = new URL(path, origin).href;
    if (!mayFetch(url)) continue;
    extras.set(url, await f(url, path.endsWith('.json') || path.includes('apple-app-site') ? 'json' : 'robots'));
  }
  const canonicalTargets = new Set<string>();
  for (const page of pages.values()) {
    for (const c of page.facts?.canonical ?? []) {
      const n = normaliseUrl(c, page.result.finalUrl);
      if (n && !pages.has(n) && allowedHost(new URL(n), origin, opts.followExternal)) canonicalTargets.add(n);
    }
  }
  for (const target of [...canonicalTargets].slice(0, 25)) {
    if (!mayFetch(target)) continue;
    extras.set(target, await f(target, 'html'));
  }

  return {
    blocked: block.evidence,
    origin: origin.origin,
    targets: opts.targets,
    robots: { url: robotsUrl, result: robotsResult, parsed: robotsParsed },
    sitemaps,
    sitemapUrls,
    pages,
    inbound,
    extras,
    skippedByRobots,
    ignoreRobots: opts.ignoreRobots,
    notes,
  };
}
