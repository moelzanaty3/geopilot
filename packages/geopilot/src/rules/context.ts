import type { GeoConfig } from '../config/config.ts';
import type { UrlEvidence } from '../collect/crawl.ts';
import type { RepoReader } from '../repo/reader.ts';
import type { FrameworkInfo } from '../types.ts';
import { analyzeNextApp, matchRoute, type NextAnalysis, type NextRoute } from '../frameworks/nextjs-app/analyze.ts';
import { analyzeStatic, type StaticAnalysis, type StaticPage } from '../frameworks/static/analyze.ts';
import { parseSitemap } from '../sitemap/sitemap.ts';

export interface RepoModel {
  readonly reader: RepoReader;
  readonly framework: FrameworkInfo;
  readonly next: NextAnalysis | null;
  readonly static: StaticAnalysis | null;
}

export interface RouteGroup {
  readonly route: string;
  readonly urls: string[];
  readonly next: NextRoute | null;
  readonly static: StaticPage | null;
  /** true/false when a sitemap was read; null when no sitemap could be read. */
  listed: boolean | null;
  linked: boolean;
}

export interface ScanContext {
  readonly config: GeoConfig;
  readonly url: UrlEvidence | null;
  readonly repo: RepoModel | null;
  readonly groups: readonly RouteGroup[];
  readonly rendererAvailable: boolean;
  readonly now: Date;
}

/** `/**` matches everything, `*` one segment; `/admin/**` also matches `/admin`. */
export function globMatch(pattern: string, path: string): boolean {
  const p = pattern.replace(/\/+$/, '') || '/';
  const target = path.replace(/\/+$/, '') || '/';
  if (p === '/**') return true;
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i]!;
    if (c === '*' && p[i + 1] === '*') {
      if (re.endsWith('/')) re = `${re.slice(0, -1)}(?:/.*)?`;
      else re += '.*';
      i++;
    } else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`).test(target);
}

export function includedPath(config: GeoConfig, path: string): boolean {
  if (!config.routes.include.some((g) => globMatch(g, path))) return false;
  return !config.routes.exclude.some((g) => globMatch(g, path));
}

const DYNAMIC_SEGMENT = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?=[0-9a-f]*\d)[0-9a-f]{12,})$/i;

/** URL-only route clustering: id-like segments collapse to `[id]`. */
export function clusterPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean).map((s) => (DYNAMIC_SEGMENT.test(s) ? '[id]' : decodeURIComponentSafe(s)));
  return `/${parts.join('/')}`;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function staticPathKey(pathname: string): string {
  const p = pathname.replace(/\/index\.html?$/, '/').replace(/\.html?$/, '').replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

export function loadRepoModel(reader: RepoReader, framework: FrameworkInfo): RepoModel {
  return {
    reader,
    framework,
    next: framework.id === 'nextjs-app' ? analyzeNextApp(reader) : null,
    static: framework.id === 'static' ? analyzeStatic(reader) : null,
  };
}

function literalSitemapPaths(repo: RepoModel): Set<string> | null {
  const files = repo.next ? [...repo.next.sitemap.publicXml, ...(repo.next.sitemap.appXml ? [repo.next.sitemap.appXml] : [])] : repo.static?.sitemapFiles ?? [];
  if (repo.next && repo.next.sitemap.appCode.length > 0) return null;
  if (files.length === 0) return null;
  const out = new Set<string>();
  for (const f of files) {
    const text = repo.reader.read(f);
    if (text === null) return null;
    for (const loc of parseSitemap(text).locs) out.add(new URL(loc).pathname.replace(/\/+$/, '') || '/');
  }
  return out;
}

export function buildGroups(config: GeoConfig, url: UrlEvidence | null, repo: RepoModel | null): RouteGroup[] {
  const groups = new Map<string, RouteGroup>();
  const add = (route: string, init: Partial<RouteGroup>): RouteGroup => {
    let g = groups.get(route);
    if (!g) {
      g = { route, urls: [], next: init.next ?? null, static: init.static ?? null, listed: null, linked: false };
      groups.set(route, g);
    }
    return g;
  };
  if (repo?.next) for (const r of repo.next.routes) if (includedPath(config, r.route)) add(r.route, { next: r });
  if (repo?.static) for (const p of repo.static.pages) if (includedPath(config, p.route)) add(p.route, { static: p });

  if (url) {
    const listed = new Set(url.sitemapUrls.map((u) => staticPathKey(new URL(u).pathname)));
    const sitemapRead = url.sitemaps.some((s) => s.parsed && s.parsed.kind !== 'invalid');
    for (const page of url.pages.values()) {
      if (!page.isHtml && page.result.status === 200) continue;
      const path = new URL(page.url).pathname;
      if (!includedPath(config, path)) continue;
      let route: string;
      if (repo?.next) route = matchRoute(repo.next.routes, path)?.route ?? clusterPath(path);
      else if (repo?.static) route = staticPathKey(path);
      else route = clusterPath(path);
      const g = add(route, {});
      g.urls.push(page.url);
      if (sitemapRead) g.listed = (g.listed ?? false) || listed.has(staticPathKey(path));
      if (url.inbound.get(page.url) && [...url.inbound.get(page.url)!].some((from) => from !== page.url)) g.linked = true;
    }
    for (const g of groups.values()) if (g.listed === null && sitemapRead) g.listed = false;
  } else if (repo) {
    const paths = literalSitemapPaths(repo);
    if (paths) for (const g of groups.values()) g.listed = paths.has(g.route);
  }
  for (const g of groups.values()) g.urls.sort();
  return [...groups.values()].sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0));
}
