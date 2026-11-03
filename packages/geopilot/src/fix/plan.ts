import { sha256 } from '../core/hash.ts';
import { parseRobots } from '../robots/robots.ts';
import { resolveMetaKey, provenanceCaps, type NextAnalysis } from '../frameworks/nextjs-app/analyze.ts';
import { parseDirectives } from '../html/parse.ts';
import { unwrap } from '../frameworks/ast.ts';
import type { ScanContext, RouteGroup } from '../rules/context.ts';
import type { Evaluation, Provenance, RuleId, Subject } from '../types.ts';
import { subjectKey } from '../types.ts';

import { VARIANTS, type Variant, type VerificationLevel } from './variants.ts';

export { VARIANTS, type Variant, type VerificationLevel, type VariantSpec } from './variants.ts';

export interface FileChange {
  readonly path: string;
  readonly before: string | null;
  readonly after: string;
  readonly beforeHash: string | null;
}

export interface Precondition {
  readonly check: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface FixProposal {
  readonly fixId: string;
  readonly variant: Variant;
  readonly class: 'safe' | 'guarded';
  readonly title: string;
  readonly ruleId: RuleId;
  readonly subCheck: string;
  readonly subjects: readonly Subject[];
  readonly fingerprints: readonly string[];
  readonly changes: readonly FileChange[];
  readonly preconditions: readonly Precondition[];
  readonly required: VerificationLevel;
  readonly provenance: Provenance;
  readonly alternative: string | null;
  readonly affectedRoutes: readonly string[];
}

export interface BlockedFix {
  readonly variant: Variant;
  readonly subject: Subject;
  readonly preconditions: readonly Precondition[];
}

function fixIdOf(variant: Variant, paths: readonly string[], subjects: readonly Subject[]): string {
  return `${variant}-${sha256(`${variant}|${[...paths].sort().join(',')}|${subjects.map(subjectKey).sort().join(',')}`).slice(0, 8)}`;
}

function findingsFor(evals: readonly Evaluation[], ruleId: RuleId, subCheck: string, subject?: Subject): string[] {
  return evals
    .filter((e) => e.ruleId === ruleId && (!subject || subjectKey(e.subject) === subjectKey(subject)))
    .flatMap((e) => e.findings.filter((f) => f.subCheck === subCheck).map((f) => f.fingerprint));
}

function proposal(
  variant: Variant,
  subjects: Subject[],
  fingerprints: string[],
  changes: FileChange[],
  preconditions: Precondition[],
  provenance: Provenance,
  affectedRoutes: string[],
  alternative: string | null = null,
): FixProposal {
  const v = VARIANTS[variant];
  return {
    fixId: fixIdOf(variant, changes.map((c) => c.path), subjects),
    variant,
    class: v.class,
    title: v.title,
    ruleId: v.ruleId,
    subCheck: v.subCheck,
    subjects,
    fingerprints,
    changes,
    preconditions,
    required: v.required,
    provenance,
    alternative,
    affectedRoutes,
  };
}

const ok = (check: string, cond: boolean, detail: string): Precondition => ({ check, ok: cond, detail });

function quoteStyle(source: string): "'" | '"' {
  const single = (source.match(/'/g) ?? []).length;
  const double = (source.match(/"/g) ?? []).length;
  return double > single ? '"' : "'";
}

function jsString(value: string, q: "'" | '"'): string {
  return `${q}${value.replace(/\\/g, '\\\\').replace(new RegExp(q, 'g'), `\\${q}`)}${q}`;
}

function splice(src: string, start: number, end: number, text: string): string {
  return src.slice(0, start) + text + src.slice(end);
}

// ------------------------------------------------------------------ S2

function planS2(ctx: ScanContext, evals: readonly Evaluation[], out: FixProposal[], blocked: BlockedFix[]): void {
  const language = ctx.config.site.language;
  const repo = ctx.repo!;
  const langFails = evals.filter((e) => e.ruleId === 'GEO-012' && e.findings.some((f) => f.subCheck === 'lang'));
  if (langFails.length === 0) return;
  const subjects = langFails.map((e) => e.subject);
  const fps = langFails.flatMap((e) => e.findings.filter((f) => f.subCheck === 'lang').map((f) => f.fingerprint));
  if (repo.next) {
    const n = repo.next;
    const html = n.html;
    const pre = [
      ok('site.language is configured', language !== null, language ? `"${language}"` : 'set site.language in geo.config.json; GEO never infers it'),
      ok('root layout renders one literal <html>', html !== null && html.count === 1, n.rootLayout ?? 'no root layout'),
      ok('<html> has no lang and no spread props', html !== null && html.lang === null && !html.hasSpread, html?.hasSpread ? 'spread props present' : html?.lang ? 'lang already set' : 'ok'),
      ok('no i18n', n.i18n.length === 0, n.i18n.join('; ') || 'none'),
      ok('provenance is exact/absent after downgrades', provenanceCaps(n, null, 'html').length === 0, provenanceCaps(n, null, 'html').join('; ') || 'none'),
    ];
    if (pre.some((p) => !p.ok) || !html || !n.rootLayout) {
      blocked.push({ variant: 'S2', subject: { kind: 'site' }, preconditions: pre });
      return;
    }
    const src = repo.reader.read(n.rootLayout)!;
    const at = html.node.name.end!;
    const after = splice(src, at, at, ` lang="${language}"`);
    out.push(proposal('S2', subjects, fps, [{ path: n.rootLayout, before: src, after, beforeHash: sha256(src) }], pre, { level: 'absent', locations: [{ file: n.rootLayout, line: html.node.loc?.start.line ?? 1 }], reason: '<html> has no lang' }, n.routes.map((r) => r.route)));
    return;
  }
  if (repo.static) {
    const changes: FileChange[] = [];
    const pre: Precondition[] = [ok('site.language is configured', language !== null, language ? `"${language}"` : 'set site.language in geo.config.json')];
    for (const e of langFails) {
      const g = ctx.groups.find((x) => e.subject.kind === 'routeGroup' && x.route === e.subject.route);
      const page = g?.static;
      if (!page) continue;
      const htmls = page.doc.elements.filter((el) => el.name === 'html');
      const good = htmls.length === 1 && !htmls[0]!.attrs.has('lang') && !page.scriptTouches.has('lang');
      pre.push(ok(`${page.file}: one literal <html>, no lang, no script sets it`, good, good ? 'ok' : 'not provably absent'));
      if (!good || !language) continue;
      const src = page.doc.source;
      const at = htmls[0]!.start + '<html'.length;
      changes.push({ path: page.file, before: src, after: splice(src, at, at, ` lang="${language}"`), beforeHash: sha256(src) });
    }
    if (changes.length === 0 || pre.some((p) => !p.ok)) {
      blocked.push({ variant: 'S2', subject: { kind: 'site' }, preconditions: pre });
      return;
    }
    out.push(proposal('S2', subjects, fps, changes, pre, { level: 'absent', locations: changes.map((c) => ({ file: c.path })), reason: '<html> has no lang' }, subjects.map((s) => (s.kind === 'routeGroup' ? s.route : '/'))));
  }
}

// ------------------------------------------------------------------ S1

function sitemapPathFromRepo(ctx: ScanContext): string | null {
  const n = ctx.repo!.next;
  if (n) {
    if (n.sitemap.publicXml.includes('public/sitemap.xml') || n.sitemap.appXml || n.sitemap.appCode.includes(`${n.appDir}/sitemap.ts`) || n.sitemap.appCode.some((f) => /^[^/]+(\/[^/]+)?\/sitemap\.(ts|js|tsx|jsx)$/.test(f) && f.startsWith(`${n.appDir}/sitemap.`))) return '/sitemap.xml';
    const other = n.sitemap.publicXml[0];
    return other ? `/${other.slice('public/'.length)}` : null;
  }
  const s = ctx.repo!.static;
  if (s && s.sitemapFiles[0]) return `/${s.sitemapFiles[0].slice(s.root ? s.root.length + 1 : 0)}`;
  return null;
}

function planS1(ctx: ScanContext, evals: readonly Evaluation[], out: FixProposal[], blocked: BlockedFix[]): void {
  const fps = findingsFor(evals, 'GEO-011', 'discoverable');
  if (fps.length === 0) return;
  const repo = ctx.repo!;
  const origin = ctx.config.site.origin;
  const n = repo.next;
  const robotsFile = n ? n.robots.publicTxt : repo.static?.robotsFile ?? null;
  const path = sitemapPathFromRepo(ctx);
  const sitemapUrl = origin && path ? `${origin}${path}` : null;
  const urlEvidenceOk = ctx.url ? ctx.url.sitemaps.some((s) => s.parsed && s.parsed.kind !== 'invalid' && s.parsed.errors.length === 0 && new URL(s.url).pathname === path) : true;
  const pre = [
    ok('site.origin is configured', origin !== null, origin ?? 'set site.origin; the Sitemap line must be absolute'),
    ok('a literal robots.txt is the sole robots source', robotsFile !== null && (!n || (n.robots.appTxt === null && n.robots.appCode === null && n.middleware === null)), robotsFile ?? 'no literal robots.txt'),
    ok('a sitemap source exists', path !== null, path ?? 'no sitemap source; see G3'),
    ok('the sitemap validates where it was observed', urlEvidenceOk, ctx.url ? 'checked against the fetched sitemap' : 'repository-only: validated as the conventional path of an existing source'),
  ];
  if (pre.some((p) => !p.ok) || !robotsFile || !sitemapUrl) {
    blocked.push({ variant: 'S1', subject: { kind: 'site' }, preconditions: pre });
    return;
  }
  const src = repo.reader.read(robotsFile)!;
  if (parseRobots(src).sitemaps.length > 0) return;
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const sep = src.length === 0 || src.endsWith('\n') ? '' : eol;
  const after = `${src}${sep}${src.length > 0 ? eol : ''}Sitemap: ${sitemapUrl}${eol}`;
  out.push(proposal('S1', [{ kind: 'site' }], fps, [{ path: robotsFile, before: src, after, beforeHash: sha256(src) }], pre, { level: 'exact', locations: [{ file: robotsFile }], reason: `sole literal ${robotsFile}` }, ['/robots.txt']));
}

// ------------------------------------------------------------------ G1

function planG1(ctx: ScanContext, evals: readonly Evaluation[], out: FixProposal[], blocked: BlockedFix[]): void {
  const repo = ctx.repo!;
  for (const e of evals) {
    if (e.ruleId !== 'GEO-014' || e.subject.kind !== 'routeGroup') continue;
    const findings = e.findings.filter((f) => f.subCheck === 'meta_noindex');
    if (findings.length === 0) continue;
    const route = e.subject.route;
    const g = ctx.groups.find((x) => x.route === route)!;
    const listed = g.listed === true;
    if (repo.next && g.next) {
      const n = repo.next;
      const r = resolveMetaKey(n, g.next, 'robots');
      const caps = provenanceCaps(n, g.next, 'headers');
      const pre = [
        ok('route is sitemap-listed', listed, listed ? 'listed' : g.listed === null ? 'no readable sitemap lists it' : 'not in the sitemap'),
        ok('robots is a literal in the metadata chain', r.level === 'exact' && r.literalFile !== null && r.prop !== null, r.reason),
        ok('no provenance downgrades', caps.length === 0, caps.join('; ') || 'none'),
      ];
      const edit = pre.every((p) => p.ok) ? g1Edit(repo.reader.read(r.literalFile!)!, r.prop!) : null;
      pre.push(ok('noindex is removable without changing other directives', edit !== null, edit ? 'ok' : 'robots value is not a recognised literal form'));
      if (!edit) {
        blocked.push({ variant: 'G1', subject: e.subject, preconditions: pre });
        continue;
      }
      const affected = n.routes.filter((x) => [x.pageFile, ...x.layoutFiles].includes(r.literalFile!)).map((x) => x.route);
      const src = repo.reader.read(r.literalFile!)!;
      out.push(proposal('G1', [e.subject], findings.map((f) => f.fingerprint), [{ path: r.literalFile!, before: src, after: edit, beforeHash: sha256(src) }], pre, { level: 'exact', locations: r.locations, reason: r.reason }, affected, `Alternatively, if the noindex is intended, remove ${route} from the sitemap instead.`));
    } else if (repo.static && g.static) {
      const page = g.static;
      const metas = page.doc.elements.filter((el) => el.name === 'meta' && /^(robots|googlebot|bingbot)$/i.test(el.attrs.get('name') ?? ''));
      const pre = [
        ok('route is sitemap-listed', listed, listed ? 'listed' : 'not proven listed'),
        ok('no script rewrites robots meta', !page.scriptTouches.has('robots'), page.scriptTouches.has('robots') ? 'script may set robots' : 'ok'),
        ok('exactly one robots meta element', metas.length === 1, `${metas.length} found`),
      ];
      if (pre.some((p) => !p.ok)) {
        blocked.push({ variant: 'G1', subject: e.subject, preconditions: pre });
        continue;
      }
      const src = page.doc.source;
      const el = metas[0]!;
      const tag = src.slice(el.start, el.end);
      const content = el.attrs.get('content') ?? '';
      const kept = [...parseDirectives(content).values].filter((d) => d !== 'noindex' && d !== 'none');
      if (parseDirectives(content).values.has('none')) kept.push('nofollow');
      let after: string;
      if (kept.length === 0) {
        const lineStart = src.lastIndexOf('\n', el.start - 1) + 1;
        const lineEnd = src.indexOf('\n', el.end);
        const onlyTag = src.slice(lineStart, el.start).trim() === '' && src.slice(el.end, lineEnd === -1 ? src.length : lineEnd).trim() === '';
        after = onlyTag ? splice(src, lineStart, lineEnd === -1 ? src.length : lineEnd + 1, '') : splice(src, el.start, el.end, '');
      } else {
        const m = /(content\s*=\s*)(["']?)([^"'>]*)\2/i.exec(tag);
        if (!m) {
          blocked.push({ variant: 'G1', subject: e.subject, preconditions: [...pre, ok('content attribute is literal', false, 'unrecognised')] });
          continue;
        }
        const newTag = tag.replace(m[0], `${m[1]}${m[2] || '"'}${kept.join(', ')}${m[2] || '"'}`);
        after = splice(src, el.start, el.end, newTag);
      }
      out.push(proposal('G1', [e.subject], findings.map((f) => f.fingerprint), [{ path: page.file, before: src, after, beforeHash: sha256(src) }], pre, { level: 'exact', locations: [{ file: page.file }], reason: 'literal robots meta' }, [route], `Alternatively, if the noindex is intended, remove ${route} from the sitemap instead.`));
    }
  }
}

/** Remove noindex from a literal `robots` property: flip `index: false`, or drop the token from a string. */
function g1Edit(src: string, prop: import('@babel/types').ObjectProperty | import('@babel/types').ObjectMethod): string | null {
  if (prop.type !== 'ObjectProperty') return null;
  const value = unwrap(prop.value);
  if (value.type === 'StringLiteral') {
    const d = parseDirectives(value.value);
    const known = new Set(['noindex', 'index', 'follow', 'nofollow', 'none']);
    if (![...d.values].every((x) => known.has(x))) return null;
    const kept = [...d.values].filter((x) => x !== 'noindex' && x !== 'none');
    if (d.values.has('none')) kept.push('nofollow');
    if (kept.length === 0) return removeProperty(src, prop);
    const q = src[value.start!] === '"' ? '"' : "'";
    return splice(src, value.start!, value.end!, `${q}${kept.join(', ')}${q}`);
  }
  if (value.type === 'ObjectExpression') {
    let out = src;
    const edits: { start: number; end: number }[] = [];
    const visit = (obj: import('@babel/types').ObjectExpression): boolean => {
      for (const p of obj.properties) {
        if (p.type === 'SpreadElement') return false;
        if (p.type !== 'ObjectProperty') continue;
        const k = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' ? p.key.value : null;
        const v = unwrap(p.value);
        if (k === 'index' && v.type === 'BooleanLiteral' && !v.value) edits.push({ start: v.start!, end: v.end! });
        if (k === 'googleBot' && v.type === 'ObjectExpression' && !visit(v)) return false;
        if (k === 'googleBot' && v.type === 'StringLiteral' && /noindex|none/i.test(v.value)) return false;
      }
      return true;
    };
    if (!visit(value) || edits.length === 0) return null;
    for (const e of edits.sort((a, b) => b.start - a.start)) out = splice(out, e.start, e.end, 'true');
    return out;
  }
  return null;
}

function removeProperty(src: string, prop: import('@babel/types').ObjectProperty): string {
  let end = prop.end!;
  const rest = src.slice(end);
  const comma = /^\s*,/.exec(rest);
  if (comma) end += comma[0].length;
  let start = prop.start!;
  const lineStart = src.lastIndexOf('\n', start - 1) + 1;
  if (src.slice(lineStart, start).trim() === '') {
    start = lineStart;
    const nl = src.indexOf('\n', end);
    if (nl !== -1 && src.slice(end, nl).trim() === '') end = nl + 1;
  }
  return splice(src, start, end, '');
}

// ------------------------------------------------------------------ G2

function planG2(ctx: ScanContext, evals: readonly Evaluation[], out: FixProposal[], blocked: BlockedFix[]): void {
  const repo = ctx.repo!;
  const n = repo.next;
  if (!n) return;
  const origin = ctx.config.site.origin;
  for (const e of evals) {
    if (e.ruleId !== 'GEO-015' || e.subject.kind !== 'routeGroup') continue;
    const findings = e.findings.filter((f) => f.subCheck === 'canonical_present' && /no canonical|declares no canonical/.test(f.message));
    if (findings.length === 0) continue;
    const g: RouteGroup | undefined = ctx.groups.find((x) => e.subject.kind === 'routeGroup' && x.route === e.subject.route);
    const route = g?.next;
    if (!route) continue;
    const alt = resolveMetaKey(n, route, 'alternates');
    const src = n.meta.get(route.pageFile);
    const sameRoute = n.routes.filter((r) => r.route === route.route).length === 1;
    const caps = provenanceCaps(n, route, 'html');
    const pre = [
      ok('site.origin is configured', origin !== null, origin ?? 'set site.origin; GEO never infers it'),
      ok('route is static', !route.dynamic && route.uncertain.length === 0, route.dynamic ? 'dynamic segment' : route.uncertain.join('; ') || 'static'),
      ok('exactly one page maps to the route', sameRoute, sameRoute ? 'unique' : 'several pages (route groups) map here'),
      ok('alternates is absent from the whole metadata chain', alt.level === 'absent', alt.reason),
      ok('page exports a literal metadata object declared in the page', src?.kind === 'literal' && src.declaredIn === route.pageFile && src.file === route.pageFile && !src.value.dynamicKeys, src?.kind ?? 'none'),
      ok('no provenance downgrades', caps.length === 0, caps.join('; ') || 'none'),
    ];
    if (pre.some((p) => !p.ok) || src?.kind !== 'literal' || !origin) {
      blocked.push({ variant: 'G2', subject: e.subject, preconditions: pre });
      continue;
    }
    const text = repo.reader.read(route.pageFile)!;
    const obj = src.value.node;
    const q = quoteStyle(text);
    const canonical = `${origin}${route.route === '/' ? '/' : route.route}`;
    const first = obj.properties[0];
    const open = obj.start! + 1;
    const prop = `alternates: { canonical: ${jsString(canonical, q)} }`;
    let after: string;
    if (!first) after = splice(text, open, open, ` ${prop} `);
    else {
      const between = text.slice(open, first.start!);
      after = between.includes('\n') ? splice(text, first.start!, first.start!, `${prop},${between.slice(between.lastIndexOf('\n'))}`) : splice(text, open, open, ` ${prop},`);
    }
    out.push(proposal('G2', [e.subject], findings.map((f) => f.fingerprint), [{ path: route.pageFile, before: text, after, beforeHash: sha256(text) }], pre, { level: 'absent', locations: [{ file: route.pageFile, line: obj.loc?.start.line ?? 1 }], reason: 'no alternates in the metadata chain' }, [route.route]));
  }
}

// ------------------------------------------------------------------ G3

function planG3(ctx: ScanContext, evals: readonly Evaluation[], out: FixProposal[], blocked: BlockedFix[]): void {
  const n: NextAnalysis | null = ctx.repo!.next;
  if (!n) return;
  const fps = findingsFor(evals, 'GEO-011', 'sitemap_valid');
  const absentFinding = evals.some((e) => e.ruleId === 'GEO-011' && e.findings.some((f) => f.subCheck === 'sitemap_valid' && /no sitemap/.test(f.message)));
  if (!absentFinding) return;
  const origin = ctx.config.site.origin;
  const robotsText = n.robots.publicTxt ? ctx.repo!.reader.read(n.robots.publicTxt) : n.robots.appTxt ? ctx.repo!.reader.read(n.robots.appTxt) : null;
  const caps = provenanceCaps(n, null, 'files');
  const statics = n.routes.filter((r) => !r.dynamic && r.uncertain.length === 0);
  const pre = [
    ok('site.origin is configured', origin !== null, origin ?? 'set site.origin; GEO never infers it'),
    ok('no sitemap source exists', n.sitemap.publicXml.length === 0 && n.sitemap.appXml === null && n.sitemap.appCode.length === 0, 'checked public/sitemap*.xml and app/**/sitemap.*'),
    ok('robots is not generated and names no other sitemap', n.robots.appCode === null && (robotsText === null || parseRobots(robotsText).sitemaps.length === 0), n.robots.appCode ?? 'ok'),
    ok('no middleware, rewrites or headers config', caps.length === 0, caps.join('; ') || 'none'),
    ok('at least one static route', statics.length > 0, `${statics.length} static routes`),
  ];
  if (pre.some((p) => !p.ok) || !origin) {
    blocked.push({ variant: 'G3', subject: { kind: 'site' }, preconditions: pre });
    return;
  }
  const ts = n.rootLayout?.endsWith('.ts') || n.rootLayout?.endsWith('.tsx');
  const path = `${n.appDir}/sitemap.${ts ? 'ts' : 'js'}`;
  const included = statics.filter((r) => {
    const robots = resolveMetaKey(n, r, 'robots');
    if (robots.value?.kind === 'string' && /noindex|none/i.test(robots.value.value)) return false;
    if (robots.value?.kind === 'object') {
      const idx = robots.value.props.get('index')?.value;
      if (idx?.kind === 'boolean' && !idx.value) return false;
    }
    return true;
  });
  const lines = included.map((r) => `    { url: '${origin}${r.route === '/' ? '/' : r.route}' },`);
  const body = ts
    ? `import type { MetadataRoute } from 'next';\n\n// Static routes only. Generated by geopilot (fix G3); dynamic routes are not listed.\nexport default function sitemap(): MetadataRoute.Sitemap {\n  return [\n${lines.join('\n')}\n  ];\n}\n`
    : `// Static routes only. Generated by geopilot (fix G3); dynamic routes are not listed.\nexport default function sitemap() {\n  return [\n${lines.join('\n')}\n  ];\n}\n`;
  out.push(proposal('G3', [{ kind: 'site' }], fps, [{ path, before: null, after: body, beforeHash: null }], pre, { level: 'absent', locations: [{ file: path }], reason: 'no sitemap source exists' }, included.map((r) => r.route)));
}

export interface FixPlan {
  readonly proposals: readonly FixProposal[];
  readonly blocked: readonly BlockedFix[];
}

export function planAll(ctx: ScanContext, evals: readonly Evaluation[]): FixPlan {
  const out: FixProposal[] = [];
  const blocked: BlockedFix[] = [];
  if (!ctx.repo || (!ctx.repo.next && !ctx.repo.static)) return { proposals: out, blocked };
  planS1(ctx, evals, out, blocked);
  planS2(ctx, evals, out, blocked);
  planG1(ctx, evals, out, blocked);
  planG2(ctx, evals, out, blocked);
  planG3(ctx, evals, out, blocked);
  out.sort((a, b) => (a.fixId < b.fixId ? -1 : 1));
  return { proposals: out, blocked };
}

export function planFixes(ctx: ScanContext, evals: readonly Evaluation[]): FixProposal[] {
  return [...planAll(ctx, evals).proposals];
}
