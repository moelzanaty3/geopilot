import type { RepoReader } from '../../repo/reader.ts';
import { headFacts, parseHtml, type Document, type HeadFacts } from '../../html/parse.ts';

// Static HTML: a URL path maps to `about.html` or `about/index.html` under the
// site root (spec 11). Literal markup can be exact; anything a script injects
// is unmapped.

export interface StaticPage {
  readonly route: string;
  readonly file: string;
  readonly doc: Document;
  readonly facts: HeadFacts;
  /** Head values a script on the page may rewrite at runtime. */
  readonly scriptTouches: ReadonlySet<'title' | 'lang' | 'description' | 'robots' | 'canonical'>;
}

export interface StaticAnalysis {
  readonly root: string;
  readonly pages: readonly StaticPage[];
  readonly robotsFile: string | null;
  readonly sitemapFiles: readonly string[];
}

export function findStaticRoot(repo: RepoReader): string | null {
  if (repo.has('index.html')) return '';
  for (const dir of ['public', 'site', 'docs', 'www']) if (repo.has(`${dir}/index.html`)) return dir;
  return null;
}

function routeFor(rel: string): string {
  const noExt = rel.replace(/\.html?$/, '');
  if (noExt === 'index') return '/';
  if (noExt.endsWith('/index')) return `/${noExt.slice(0, -'/index'.length)}`;
  return `/${noExt}`;
}

function scriptTouches(doc: Document): Set<'title' | 'lang' | 'description' | 'robots' | 'canonical'> {
  const out = new Set<'title' | 'lang' | 'description' | 'robots' | 'canonical'>();
  for (const el of doc.elements) {
    if (el.name !== 'script') continue;
    const body = el.text ?? '';
    if (el.attrs.has('src')) {
      // An external script can do anything to the head; it is not read.
      out.add('title').add('lang').add('description').add('robots').add('canonical');
      continue;
    }
    if (/document\.title\s*=/.test(body)) out.add('title');
    if (/documentElement\.(lang\s*=|setAttribute\(\s*['"]lang)/.test(body)) out.add('lang');
    if (/createElement\(\s*['"]meta/.test(body) || /querySelector\([^)]*meta/.test(body)) out.add('description').add('robots');
    if (/rel\s*=\s*['"]?canonical|['"]canonical['"]/.test(body)) out.add('canonical');
  }
  return out;
}

export function analyzeStatic(repo: RepoReader): StaticAnalysis | null {
  const root = findStaticRoot(repo);
  if (root === null) return null;
  const prefix = root ? `${root}/` : '';
  const pages: StaticPage[] = [];
  for (const file of repo.files) {
    if (!file.startsWith(prefix) || !/\.html?$/.test(file)) continue;
    const rel = file.slice(prefix.length);
    if (rel.split('/').some((s) => s.startsWith('_') || s === 'node_modules')) continue;
    const src = repo.read(file);
    if (src === null) continue;
    const doc = parseHtml(src);
    pages.push({ route: routeFor(rel), file, doc, facts: headFacts(doc), scriptTouches: scriptTouches(doc) });
  }
  pages.sort((a, b) => (a.route < b.route ? -1 : 1));
  return {
    root,
    pages,
    robotsFile: repo.has(`${prefix}robots.txt`) ? `${prefix}robots.txt` : null,
    sitemapFiles: repo.files.filter((f) => f.startsWith(prefix) && /^sitemap[^/]*\.xml$/.test(f.slice(prefix.length))),
  };
}
