import { posix } from 'node:path';
import type * as t from '@babel/types';
import type { RepoReader } from '../../repo/reader.ts';
import type { ProvenanceLevel, SourceLocation } from '../../types.ts';
import {
  exportsOf,
  findJsxHtml,
  hasDirective,
  hasObjectKey,
  importsOf,
  lineCol,
  parseModule,
  staticValue,
  type JsxHtml,
  type ParsedModule,
  type StaticValue,
} from '../ast.ts';

// Next.js App Router, read as source (spec 11). Supported majors are a
// versioned table; an unknown major downgrades provenance rather than guessing.
export const SUPPORTED_NEXT_MAJORS: readonly number[] = [13, 14, 15, 16];

const PAGE_EXT = ['tsx', 'ts', 'jsx', 'js', 'mdx'];
const CODE_EXT = ['tsx', 'ts', 'jsx', 'js'];
const MAX_IMPORT_DEPTH = 5;

export interface NextRoute {
  readonly route: string;
  readonly pageFile: string;
  /** Root layout first. */
  readonly layoutFiles: readonly string[];
  readonly dynamic: boolean;
  readonly uncertain: readonly string[];
  readonly clientPage: boolean;
}

export type MetaSource =
  | { readonly kind: 'literal'; readonly file: string; readonly value: Extract<StaticValue, { kind: 'object' }>; readonly declaredIn: string }
  | { readonly kind: 'generate'; readonly file: string; readonly line: number }
  | { readonly kind: 'opaque'; readonly file: string; readonly line: number; readonly reason: string }
  | { readonly kind: 'none'; readonly file: string }
  | { readonly kind: 'parse_error'; readonly file: string; readonly reason: string };

export interface NextAnalysis {
  readonly appDir: string;
  readonly routes: readonly NextRoute[];
  readonly meta: ReadonlyMap<string, MetaSource>;
  readonly modules: ReadonlyMap<string, ParsedModule>;
  readonly rootLayout: string | null;
  readonly html: JsxHtml | null;
  readonly robots: { readonly publicTxt: string | null; readonly appTxt: string | null; readonly appCode: string | null };
  readonly sitemap: { readonly publicXml: readonly string[]; readonly appXml: string | null; readonly appCode: readonly string[] };
  readonly middleware: string | null;
  readonly nextConfig: { readonly file: string; readonly keys: readonly string[] } | null;
  readonly i18n: readonly string[];
  readonly nextMajor: number | null;
  readonly supportedMajor: boolean;
  readonly parseErrors: readonly { readonly file: string; readonly reason: string }[];
}

function firstExisting(repo: RepoReader, candidates: string[]): string | null {
  for (const c of candidates) if (repo.has(c)) return c;
  return null;
}

export function findAppDir(repo: RepoReader): string | null {
  for (const dir of ['app', 'src/app']) {
    if (repo.files.some((f) => f.startsWith(`${dir}/`) && /\/(page|layout)\.(tsx|ts|jsx|js|mdx)$/.test(`/${f.slice(dir.length + 1)}`))) return dir;
  }
  return null;
}

export function nextMajorOf(repo: RepoReader): number | null {
  const text = repo.read('package.json');
  if (!text) return null;
  try {
    const pkg = JSON.parse(text) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const range = pkg.dependencies?.next ?? pkg.devDependencies?.next;
    if (!range) return null;
    const m = /(\d+)\./.exec(range) ?? /^[\^~>=\s]*(\d+)$/.exec(range);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

function segmentToRoute(seg: string): { part: string | null; dynamic: boolean; uncertain: string | null } {
  if (/^\(.*\)$/.test(seg) && !/^\(\.+\)/.test(seg)) return { part: null, dynamic: false, uncertain: null };
  if (/^\(\.+\)/.test(seg)) return { part: seg.replace(/^\(\.+\)/, ''), dynamic: false, uncertain: `intercepting route segment ${seg}` };
  if (seg.startsWith('@')) return { part: null, dynamic: false, uncertain: `parallel route slot ${seg}` };
  if (/^\[.*\]$/.test(seg)) return { part: seg, dynamic: true, uncertain: null };
  return { part: seg, dynamic: false, uncertain: null };
}

function isPrivate(segments: string[]): boolean {
  return segments.some((s) => s.startsWith('_'));
}

function resolveImport(repo: RepoReader, fromFile: string, spec: string): string | null {
  let base: string | null = null;
  if (spec.startsWith('.')) base = posix.normalize(posix.join(posix.dirname(fromFile), spec));
  else if (spec.startsWith('@/')) base = repo.has('src') || repo.files.some((f) => f.startsWith('src/')) ? `src/${spec.slice(2)}` : spec.slice(2);
  else if (spec.startsWith('~/')) base = spec.slice(2);
  if (base === null) return null;
  const candidates = [base, ...CODE_EXT.map((e) => `${base}.${e}`), ...CODE_EXT.map((e) => `${base}/index.${e}`)];
  return firstExisting(repo, candidates);
}

export function analyzeNextApp(repo: RepoReader): NextAnalysis | null {
  const appDir = findAppDir(repo);
  if (!appDir) return null;
  const modules = new Map<string, ParsedModule>();
  const parseErrors: { file: string; reason: string }[] = [];
  const load = (file: string): ParsedModule | null => {
    if (modules.has(file)) return modules.get(file)!;
    const src = repo.read(file);
    if (src === null || file.endsWith('.mdx')) return null;
    const mod = parseModule(file, src);
    if ('error' in mod) {
      parseErrors.push({ file, reason: mod.error });
      return null;
    }
    modules.set(file, mod);
    return mod;
  };

  const appFiles = repo.files.filter((f) => f.startsWith(`${appDir}/`));
  const routes: NextRoute[] = [];
  for (const file of appFiles) {
    const rel = file.slice(appDir.length + 1);
    const m = new RegExp(`^(.*/)?page\\.(${PAGE_EXT.join('|')})$`).exec(rel);
    if (!m) continue;
    const dirSegments = (m[1] ?? '').split('/').filter(Boolean);
    if (isPrivate(dirSegments)) continue;
    const parts: string[] = [];
    let dynamic = false;
    const uncertain: string[] = [];
    for (const seg of dirSegments) {
      const r = segmentToRoute(seg);
      if (r.part) parts.push(r.part);
      if (r.dynamic) dynamic = true;
      if (r.uncertain) uncertain.push(r.uncertain);
    }
    const layoutFiles: string[] = [];
    for (let i = 0; i <= dirSegments.length; i++) {
      const dir = [appDir, ...dirSegments.slice(0, i)].join('/');
      const layout = firstExisting(repo, CODE_EXT.map((e) => `${dir}/layout.${e}`));
      if (layout) layoutFiles.push(layout);
    }
    const mod = load(file);
    routes.push({
      route: `/${parts.join('/')}`,
      pageFile: file,
      layoutFiles,
      dynamic,
      uncertain,
      clientPage: mod ? hasDirective(mod, 'use client') : false,
    });
  }
  routes.sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : a.pageFile < b.pageFile ? -1 : 1));

  const meta = new Map<string, MetaSource>();
  const metaOf = (file: string): MetaSource => {
    if (meta.has(file)) return meta.get(file)!;
    const result = readMetadata(repo, file, load, parseErrors);
    meta.set(file, result);
    return result;
  };
  for (const r of routes) {
    metaOf(r.pageFile);
    for (const l of r.layoutFiles) metaOf(l);
  }

  const rootLayout = firstExisting(repo, CODE_EXT.map((e) => `${appDir}/layout.${e}`));
  const rootMod = rootLayout ? load(rootLayout) : null;
  const html = rootMod ? findJsxHtml(rootMod) : null;

  const nextConfigFile = firstExisting(repo, ['next.config.ts', 'next.config.mjs', 'next.config.js', 'next.config.cjs', 'next.config.mts']);
  let nextConfig: NextAnalysis['nextConfig'] = null;
  if (nextConfigFile) {
    const mod = load(nextConfigFile);
    nextConfig = { file: nextConfigFile, keys: mod ? hasObjectKey(mod, new Set(['i18n', 'headers', 'rewrites', 'redirects', 'basePath', 'trailingSlash', 'output'])) : ['unparsed'] };
  }
  const i18n: string[] = [];
  if (nextConfig?.keys.includes('i18n')) i18n.push(`${nextConfig.file} declares i18n`);
  for (const r of routes) {
    const first = r.route.split('/')[1] ?? '';
    if (/^\[(locale|lang|lng|language)\]$/.test(first)) {
      i18n.push(`dynamic locale segment ${first}`);
      break;
    }
  }

  const middleware = firstExisting(repo, [
    ...CODE_EXT.map((e) => `middleware.${e}`),
    ...CODE_EXT.map((e) => `src/middleware.${e}`),
    ...CODE_EXT.map((e) => `proxy.${e}`),
    ...CODE_EXT.map((e) => `src/proxy.${e}`),
  ]);
  const nextMajor = nextMajorOf(repo);
  return {
    appDir,
    routes,
    meta,
    modules,
    rootLayout,
    html,
    robots: {
      publicTxt: repo.has('public/robots.txt') ? 'public/robots.txt' : null,
      appTxt: repo.has(`${appDir}/robots.txt`) ? `${appDir}/robots.txt` : null,
      appCode: firstExisting(repo, CODE_EXT.map((e) => `${appDir}/robots.${e}`)),
    },
    sitemap: {
      publicXml: repo.files.filter((f) => /^public\/sitemap[^/]*\.xml$/.test(f)),
      appXml: repo.has(`${appDir}/sitemap.xml`) ? `${appDir}/sitemap.xml` : null,
      appCode: appFiles.filter((f) => /(^|\/)sitemap\.(tsx|ts|jsx|js)$/.test(f)),
    },
    middleware,
    nextConfig,
    i18n,
    nextMajor,
    supportedMajor: nextMajor !== null && SUPPORTED_NEXT_MAJORS.includes(nextMajor),
    parseErrors,
  };
}

function readMetadata(
  repo: RepoReader,
  file: string,
  load: (file: string) => ParsedModule | null,
  parseErrors: { file: string; reason: string }[],
): MetaSource {
  const mod = load(file);
  if (!mod) {
    const err = parseErrors.find((e) => e.file === file);
    return err ? { kind: 'parse_error', file, reason: err.reason } : { kind: 'none', file };
  }
  const exp = exportsOf(mod);
  if (exp.has('generateMetadata')) return { kind: 'generate', file, line: lineCol(exp.get('generateMetadata')!.node).line };
  const md = exp.get('metadata');
  if (!md) return { kind: 'none', file };
  return followMetadata(repo, mod, md.kind === 'reexport' ? null : md.init, md.from ?? null, 'metadata', file, load, 0);
}

function followMetadata(
  repo: RepoReader,
  mod: ParsedModule,
  init: t.Node | null,
  reexportFrom: string | null,
  name: string,
  declaredIn: string,
  load: (file: string) => ParsedModule | null,
  depth: number,
): MetaSource {
  if (depth > MAX_IMPORT_DEPTH) return { kind: 'opaque', file: declaredIn, line: 1, reason: `import chain deeper than ${MAX_IMPORT_DEPTH}` };
  if (reexportFrom !== null) {
    const target = resolveImport(repo, mod.file, reexportFrom);
    const tmod = target ? load(target) : null;
    if (!tmod) return { kind: 'opaque', file: declaredIn, line: 1, reason: `re-export from unresolved module ${reexportFrom}` };
    const e = exportsOf(tmod).get(name);
    if (!e) return { kind: 'opaque', file: declaredIn, line: 1, reason: `${reexportFrom} has no export ${name}` };
    return followMetadata(repo, tmod, e.kind === 'reexport' ? null : e.init, e.from ?? null, name, declaredIn, load, depth + 1);
  }
  if (!init) return { kind: 'opaque', file: declaredIn, line: 1, reason: 'metadata has no initialiser' };
  const value = staticValue(init);
  if (value.kind === 'object') return { kind: 'literal', file: mod.file, value, declaredIn };
  if (value.kind === 'dynamic' && init.type === 'Identifier') {
    const imp = importsOf(mod).get(init.name);
    if (imp) {
      const target = resolveImport(repo, mod.file, imp.from);
      const tmod = target ? load(target) : null;
      if (!tmod) return { kind: 'opaque', file: declaredIn, line: lineCol(init).line, reason: `imported from unresolved module ${imp.from}` };
      const e = exportsOf(tmod).get(imp.imported);
      if (!e) return { kind: 'opaque', file: declaredIn, line: lineCol(init).line, reason: `${imp.from} has no export ${imp.imported}` };
      return followMetadata(repo, tmod, e.kind === 'reexport' ? null : e.init, e.from ?? null, imp.imported, declaredIn, load, depth + 1);
    }
  }
  return { kind: 'opaque', file: mod.file, line: lineCol(init).line, reason: value.kind === 'dynamic' ? value.reason : `metadata is a ${value.kind}` };
}

export interface ResolvedKey {
  readonly level: ProvenanceLevel;
  readonly value: StaticValue | null;
  readonly locations: readonly SourceLocation[];
  readonly reason: string;
  /** True when no segment defines the key: the value is proven missing even if the insertion point is not. */
  readonly missing?: boolean;
  /** The file whose metadata object holds the key, when it is a literal. */
  readonly literalFile: string | null;
  readonly prop: t.ObjectProperty | t.ObjectMethod | null;
}

/**
 * Resolve one top-level metadata key for a route by Next's shallow per-key
 * precedence: the nearest segment that defines the key wins outright.
 */
export function resolveMetaKey(a: NextAnalysis, route: NextRoute, key: string): ResolvedKey {
  const chain = [route.pageFile, ...[...route.layoutFiles].reverse()];
  let imported: string | null = null;
  for (const file of chain) {
    const src = a.meta.get(file);
    if (!src || src.kind === 'none') continue;
    if (src.kind === 'parse_error') return { level: 'unmapped', value: null, locations: [{ file }], reason: `could not parse ${file}`, literalFile: null, prop: null };
    if (src.kind === 'generate') {
      return { level: 'file', value: null, locations: [{ file, line: src.line }], reason: `${file} computes metadata in generateMetadata`, literalFile: null, prop: null };
    }
    if (src.kind === 'opaque') {
      return { level: 'file', value: null, locations: [{ file: src.file, line: src.line }], reason: src.reason, literalFile: null, prop: null };
    }
    const prop = src.value.props.get(key);
    if (prop) {
      const loc = { file: src.file, ...lineCol(prop.node) };
      if (prop.value.kind === 'dynamic') {
        return { level: 'file', value: prop.value, locations: [loc], reason: `${key} is computed (${prop.value.reason})`, literalFile: null, prop: prop.node };
      }
      const imported = src.file !== src.declaredIn;
      return {
        level: imported ? 'file' : 'exact',
        value: prop.value,
        locations: [loc],
        reason: imported ? `${key} is imported into ${src.declaredIn} from ${src.file}` : `literal ${key} in ${src.file}`,
        literalFile: imported ? null : src.file,
        prop: prop.node,
      };
    }
    if (src.file !== src.declaredIn) imported ??= `${src.declaredIn} imports its metadata from ${src.file}`;
    if (src.value.dynamicKeys) {
      return { level: 'candidate', value: null, locations: [{ file: src.file, ...lineCol(src.value.node) }], reason: `metadata in ${src.file} spreads or computes keys; ${key} may come from there`, literalFile: null, prop: null };
    }
  }
  const reason = `no segment from ${route.pageFile} to the root layout defines ${key}`;
  // Absence is proven, but with imported metadata the insertion point is not.
  if (imported) return { level: 'candidate', value: null, locations: chain.map((file) => ({ file })), reason: `${reason}; ${imported}`, literalFile: null, prop: null, missing: true };
  return { level: 'absent', value: null, locations: chain.map((file) => ({ file })), reason, literalFile: null, prop: null, missing: true };
}

/** Global and per-route conditions that cap provenance below exact (spec 11). */
export function provenanceCaps(a: NextAnalysis, route: NextRoute | null, concern: 'html' | 'headers' | 'files'): string[] {
  const caps: string[] = [];
  if (!a.supportedMajor) caps.push(a.nextMajor === null ? 'Next.js version could not be read from package.json' : `Next.js ${a.nextMajor} is not in the supported-version table`);
  if (a.middleware) caps.push(`${a.middleware} can rewrite or add headers to any route`);
  if (concern !== 'html' && a.nextConfig?.keys.some((k) => k === 'headers' || k === 'rewrites')) caps.push(`${a.nextConfig.file} declares headers or rewrites`);
  if (concern === 'html' && a.i18n.length > 0) caps.push(...a.i18n);
  if (route) {
    caps.push(...route.uncertain);
    if (route.dynamic) caps.push(`${route.route} has dynamic parameters`);
  }
  return caps;
}

export function capLevel(level: ProvenanceLevel, caps: readonly string[]): ProvenanceLevel {
  if (caps.length === 0) return level;
  return level === 'exact' || level === 'absent' ? 'candidate' : level;
}

/** Match a URL path to the most specific route (static segments beat dynamic). */
export function matchRoute(routes: readonly NextRoute[], pathname: string): NextRoute | null {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  let best: { route: NextRoute; score: number } | null = null;
  for (const r of routes) {
    const rp = r.route.split('/').filter(Boolean);
    let score = 0;
    let ok = true;
    let i = 0;
    for (; i < rp.length; i++) {
      const seg = rp[i]!;
      if (/^\[\[\.\.\..+\]\]$/.test(seg)) {
        i = rp.length;
        score += 0;
        break;
      }
      if (/^\[\.\.\..+\]$/.test(seg)) {
        if (parts.length <= i) ok = false;
        i = rp.length;
        break;
      }
      const p = parts[i];
      if (p === undefined) {
        ok = false;
        break;
      }
      if (/^\[.+\]$/.test(seg)) score += 1;
      else if (decodeURIComponent(p) === seg) score += 10;
      else {
        ok = false;
        break;
      }
    }
    const catchAll = rp.some((s) => s.startsWith('[...') || s.startsWith('[[...'));
    if (ok && !catchAll && parts.length !== rp.length) ok = false;
    if (ok && (!best || score > best.score)) best = { route: r, score };
  }
  return best?.route ?? null;
}
