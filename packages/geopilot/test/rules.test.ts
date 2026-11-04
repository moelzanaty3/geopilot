import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scan } from '../src/scan.ts';
import { DEFAULT_CONFIG, loadConfig, validateConfig, type GeoConfig } from '../src/config/config.ts';
import { defaultFetcher } from '../src/collect/crawl.ts';
import { canonicalJson } from '../src/core/hash.ts';
import type { Evaluation, Report, RuleId } from '../src/types.ts';
import { FIXTURES, fixtureServer, type Recorded } from './helpers.ts';

const page = (o: { title?: string; desc?: string; lang?: string; robots?: string; canonical?: string; links?: string[]; ld?: string }): string =>
  `<!doctype html><html${o.lang ? ` lang="${o.lang}"` : ''}><head>${o.title ? `<title>${o.title}</title>` : ''}${o.desc ? `<meta name="description" content="${o.desc}">` : ''}${o.robots ? `<meta name="robots" content="${o.robots}">` : ''}${o.canonical ? `<link rel="canonical" href="${o.canonical}">` : ''}${o.ld ? `<script type="application/ld+json">${o.ld}</script>` : ''}</head><body><main>${(o.links ?? []).map((l) => `<a href="${l}">${l}</a>`).join(' ')}</main></body></html>`;

const servers: { close: () => Promise<void> }[] = [];
after(async () => {
  for (const s of servers) await s.close();
});

async function site(routes: (origin: string) => Record<string, Recorded>, config: Partial<GeoConfig> = {}, extra: { ignoreRobots?: boolean; repoPath?: string } = {}): Promise<{ report: Report; origin: string }> {
  let origin = '';
  const table: Record<string, Recorded> = {};
  const srv = await fixtureServer(new Proxy(table, {}));
  servers.push(srv);
  origin = srv.origin;
  Object.assign(table, routes(origin));
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const r = await scan({
    repoPath: extra.repoPath ?? null,
    urls: [`${origin}/`],
    config: cfg,
    configHash: 'test',
    fetcher: defaultFetcher({ explicitHosts: new Set(['127.0.0.1']) }),
    ignoreRobots: extra.ignoreRobots ?? false,
  });
  return { report: r.report, origin };
}

const of = (r: Report, id: RuleId, route?: string): Evaluation[] => r.evaluations.filter((e) => e.ruleId === id && (route === undefined || (e.subject.kind === 'routeGroup' && e.subject.route === route)));

describe('URL audit (T0) against recorded exchanges', () => {
  it('a healthy static site passes the URL rules it can evaluate', async () => {
    const { report } = await site((o) => ({
      '/robots.txt': { status: 200, headers: { 'content-type': 'text/plain' }, body: `User-agent: *\nAllow: /\nSitemap: ${o}/sitemap.xml\n` },
      '/sitemap.xml': { status: 200, headers: { 'content-type': 'application/xml' }, body: `<urlset><url><loc>${o}/</loc></url><url><loc>${o}/about</loc></url></urlset>` },
      '/': { status: 200, body: page({ title: 'Home', desc: 'Home page', lang: 'en', canonical: `${o}/`, links: ['/about'] }) },
      '/about': { status: 200, body: page({ title: 'About', desc: 'About page', lang: 'en', canonical: `${o}/about`, links: ['/'] }) },
    }), { site: { origin: 'http://127.0.0.1', language: 'en' } });
    for (const id of ['GEO-013', 'GEO-009', 'GEO-011'] as RuleId[]) assert.equal(of(report, id)[0]!.status, 'pass', id);
    assert.ok(of(report, 'GEO-014').every((e) => e.status === 'pass'));
    assert.ok(of(report, 'GEO-012').every((e) => e.status === 'pass'));
    assert.equal(of(report, 'GEO-016', '/about')[0]!.status, 'pass');
    assert.equal(of(report, 'GEO-016', '/')[0]!.status, 'not_applicable');
    assert.ok(of(report, 'GEO-003').every((e) => e.statusReason === 'renderer_unavailable'));
    assert.ok(of(report, 'GEO-004').every((e) => e.status === 'not_applicable'));
    assert.match(report.disclaimer, /does not measure or predict citations/);
  });

  it('robots.txt 5xx fails GEO-013, caps readiness and stops GEO crawling pages', async () => {
    const { report } = await site(() => ({ '/robots.txt': { status: 503, body: 'down' }, '/': { status: 200, body: page({ title: 'x', desc: 'y', lang: 'en' }) } }));
    const g = of(report, 'GEO-013')[0]!;
    assert.equal(g.status, 'fail');
    assert.ok(g.findings.some((f) => f.capReason));
    assert.ok(report.notices.some((n) => /5xx/.test(n)));
    const { report: r2 } = await site(() => ({ '/robots.txt': { status: 503, body: 'down' }, '/': { status: 200, body: page({ title: 'x', desc: 'y', lang: 'en', canonical: 'http://127.0.0.1/' }) } }), {}, { ignoreRobots: true });
    assert.equal(r2.readiness.value !== null && r2.readiness.value <= 40, true);
    assert.ok(r2.readiness.uncapped! > 40);
  });

  it('noindex on a sitemap-listed route fails GEO-014; header noindex too', async () => {
    const { report } = await site((o) => ({
      '/robots.txt': { status: 200, headers: { 'content-type': 'text/plain' }, body: `User-agent: *\nDisallow:\nSitemap: ${o}/sitemap.xml\n` },
      '/sitemap.xml': { status: 200, body: `<urlset><url><loc>${o}/</loc></url><url><loc>${o}/a</loc></url><url><loc>${o}/b</loc></url></urlset>`, headers: { 'content-type': 'application/xml' } },
      '/': { status: 200, body: page({ title: 'H', desc: 'd', lang: 'en', links: ['/a', '/b'] }) },
      '/a': { status: 200, body: page({ title: 'A', desc: 'd', lang: 'en', robots: 'noindex' }) },
      '/b': { status: 200, headers: { 'x-robots-tag': 'googlebot: noindex' }, body: page({ title: 'B', desc: 'd', lang: 'en' }) },
    }));
    assert.equal(of(report, 'GEO-014', '/a')[0]!.status, 'fail');
    assert.equal(of(report, 'GEO-014', '/a')[0]!.findings[0]!.subCheck, 'meta_noindex');
    assert.equal(of(report, 'GEO-014', '/b')[0]!.findings[0]!.subCheck, 'header_noindex');
    assert.equal(of(report, 'GEO-014', '/')[0]!.status, 'pass');
  });

  it('GEO-009 reports a site-wide search-crawler block against policy, training crawlers informationally', async () => {
    const { report } = await site(() => ({
      '/robots.txt': { status: 200, headers: { 'content-type': 'text/plain' }, body: 'User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /\n' },
      '/': { status: 200, body: page({ title: 'H', desc: 'd', lang: 'en' }) },
    }));
    const g = of(report, 'GEO-009')[0]!;
    assert.equal(g.status, 'fail');
    assert.ok(g.findings.some((f) => /OAI-SearchBot/.test(f.message) && f.capReason));
    assert.ok(!g.findings.some((f) => /GPTBot/.test(f.message)));
    assert.ok(report.informational.some((i) => /GPTBot.*blocked/.test(i.message)));
  });

  it('GEO-015 needs a declared origin; flags relative and off-origin canonicals', async () => {
    const routes = (o: string): Record<string, Recorded> => ({
      '/robots.txt': { status: 404 },
      '/': { status: 200, body: page({ title: 'H', desc: 'd', lang: 'en', canonical: '/', links: ['/x'] }) },
      '/x': { status: 200, body: page({ title: 'X', desc: 'd', lang: 'en', canonical: 'https://other.example/x' }) },
    });
    const { report } = await site(routes);
    assert.equal(of(report, 'GEO-015', '/')[0]!.status, 'fail');
    assert.equal(of(report, 'GEO-015', '/x')[0]!.status, 'not_evaluated');
    const { report: r2 } = await site(routes, { site: { origin: 'https://www.example.com', language: null } });
    assert.ok(of(r2, 'GEO-015', '/x')[0]!.findings.some((f) => f.subCheck === 'declared_origin'));
  });

  it('GEO-004 checks present JSON-LD only', async () => {
    const { report } = await site(() => ({
      '/robots.txt': { status: 404 },
      '/': { status: 200, body: page({ title: 'H', desc: 'd', lang: 'en', ld: '{"@type":"Product"}', links: ['/bad'] }) },
      '/bad': { status: 200, body: page({ title: 'B', desc: 'd', lang: 'en', ld: '{not json' }) },
    }));
    assert.ok(of(report, 'GEO-004', '/')[0]!.findings.some((f) => f.subCheck === 'required_properties'));
    assert.ok(of(report, 'GEO-004', '/bad')[0]!.findings.some((f) => f.subCheck === 'parses'));
  });

  it('a bot challenge is reported as blocked, never as a pass or a missing file', async () => {
    const challenge = { status: 403, headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' }, body: '<!doctype html><html><head><title>Just a moment...</title><meta name="robots" content="noindex,nofollow"></head></html>' };
    const { report } = await site(() => ({ '/robots.txt': challenge, '/sitemap.xml': challenge, '/': challenge }));
    assert.equal(report.blocked?.protection, 'Cloudflare');
    assert.equal(report.blocked?.status, 403);
    assert.equal(report.summary?.low, null);
    assert.equal(report.summary.applicable, 25);
    for (const e of report.evaluations) {
      assert.notEqual(e.status, 'pass', e.ruleId);
      assert.notEqual(e.status, 'fail', e.ruleId);
      assert.equal(e.findings.length, 0, e.ruleId);
    }
    for (const id of ['GEO-013', 'GEO-009', 'GEO-011'] as const) assert.equal(of(report, id)[0]?.statusReason, 'blocked', id);
    assert.equal(report.readiness.display, 'insufficient_evidence');
    assert.ok(report.notices[0]?.includes('says nothing about the site'));
    assert.ok(!report.assessmentScope.notes.some((n) => n.includes('--url')));
  });

  it('a plain firewall refusal on robots.txt and the entry page is blocked too', async () => {
    const { report } = await site(() => ({ '/robots.txt': { status: 403 }, '/': { status: 403 } }));
    assert.equal(report.blocked?.protection, null);
    assert.equal(of(report, 'GEO-013')[0]?.statusReason, 'blocked');
  });

  it('a 403 robots.txt on a site that serves its pages still means no rules', async () => {
    const { report } = await site(() => ({ '/robots.txt': { status: 403 }, '/': { status: 200, body: page({ title: 'H', desc: 'd', lang: 'en' }) } }));
    assert.equal(report.blocked, undefined);
    assert.equal(of(report, 'GEO-013')[0]?.status, 'pass');
  });

  it('a challenge on one deep page fails only that page, and keeps the rest of the scan', async () => {
    const challenge = { status: 403, headers: { 'cf-mitigated': 'challenge' }, body: '' };
    const { report } = await site(() => ({
      '/robots.txt': { status: 404 },
      '/': { status: 200, body: page({ title: 'H', desc: 'd', lang: 'en', links: ['/deep'] }) },
      '/deep': challenge,
    }));
    assert.equal(report.blocked, undefined);
    assert.equal(of(report, 'GEO-013')[0]?.status, 'pass');
    assert.ok(of(report, 'GEO-012', '/').some((e) => e.status === 'pass'));
  });

  it('a page that only mentions bot protection is never treated as blocked', async () => {
    const { report } = await site(() => ({
      '/robots.txt': { status: 503, body: 'We are down. Powered by datadome and Just a moment' },
      '/': { status: 200, body: page({ title: 'H', desc: 'd', lang: 'en' }) },
    }));
    assert.equal(report.blocked, undefined);
    assert.equal(of(report, 'GEO-013')[0]?.status, 'fail');
    assert.ok(report.readiness.capReason);
  });

  it('keeps repository evidence when the site blocks the scan', async () => {
    const challenge = { status: 403, headers: { 'cf-mitigated': 'challenge' }, body: '' };
    const { report } = await site(() => ({ '/robots.txt': challenge, '/': challenge }), {}, { repoPath: join(FIXTURES, 'next-fixable') });
    assert.ok(report.blocked);
    assert.ok(of(report, 'GEO-012').some((e) => e.status === 'fail'));
    assert.ok(report.summary?.low !== null);
  });

  it('an unreachable target is incomplete with readiness null (example C)', async () => {
    const r = await scan({ repoPath: null, urls: ['http://127.0.0.1:1/'], config: DEFAULT_CONFIG, configHash: 'x', fetcher: defaultFetcher({ explicitHosts: new Set(['127.0.0.1']) }) });
    assert.equal(r.report.readiness.value, null);
    assert.equal(r.report.readiness.display, 'insufficient_evidence');
    assert.equal(r.report.assessmentScope.assessment, 'incomplete');
  });

  it('is deterministic apart from documented volatile fields (five runs)', async () => {
    const outs = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const { report } = await site((o) => ({ '/robots.txt': { status: 404 }, '/': { status: 200, body: page({ title: 'H', desc: 'd', lang: 'en', links: [`${o}/a`] }) }, '/a': { status: 200, body: page({ title: 'A', lang: 'en' }) } }));
      const stable = JSON.parse(canonicalJson(report).replace(/127\.0\.0\.1:\d+/g, 'HOST'));
      delete stable.run.id;
      delete stable.run.startedAt;
      delete stable.run.durationMs;
      outs.add(JSON.stringify(stable));
    }
    assert.equal(outs.size, 1);
  });
});

describe('Next.js App Router repository (T2)', () => {
  it('example D end to end: readiness hidden, coverage 30%, confidence 70%', async () => {
    const dir = join(FIXTURES, 'example-d');
    const c = loadConfig(dir, null, null, {});
    const { report } = await scan({ repoPath: dir, urls: [], config: c.config, configHash: c.hash });
    assert.ok(Math.abs(report.readiness.value! - 92.857142857) < 1e-6);
    assert.equal(Math.round(report.coverage), 30);
    assert.equal(report.confidence, 70);
    assert.equal(report.readiness.display, 'insufficient_evidence');
    assert.ok(report.assessmentScope.notes.some((n) => /6 rules need runtime evidence/.test(n)));
    const desc = report.evaluations.find((e) => e.ruleId === 'GEO-012' && e.status === 'fail')!;
    assert.equal(desc.findings[0]!.provenance.level, 'absent');
  });

  function copy(name: string): string {
    const d = mkdtempSync(join(tmpdir(), 'geo-next-'));
    cpSync(join(FIXTURES, name), d, { recursive: true });
    return d;
  }
  const cfg = (dir: string): GeoConfig => loadConfig(dir, null, null, {}).config;

  it('literal metadata is exact provenance; middleware downgrades it to candidate', async () => {
    const d = copy('next-fixable');
    const r1 = (await scan({ repoPath: d, urls: [], config: cfg(d), configHash: 'x' })).report;
    const f1 = r1.evaluations.find((e) => e.ruleId === 'GEO-014' && e.status === 'fail')!.findings[0]!;
    assert.equal(f1.provenance.level, 'exact');
    assert.equal(f1.provenance.locations[0]!.file, 'app/pricing/page.tsx');
    assert.equal(f1.provenance.locations[0]!.line, 5);
    writeFileSync(join(d, 'middleware.ts'), 'export function middleware() {}\n');
    const r2 = (await scan({ repoPath: d, urls: [], config: cfg(d), configHash: 'x' })).report;
    const f2 = r2.evaluations.find((e) => e.ruleId === 'GEO-014' && e.findings.length > 0)?.findings[0];
    assert.ok(!f2 || f2.provenance.level !== 'exact');
  });

  it('generateMetadata is file provenance and its keys are not evaluated', async () => {
    const d = copy('next-fixable');
    const r = (await scan({ repoPath: d, urls: [], config: cfg(d), configHash: 'x' })).report;
    const blog = r.evaluations.find((e) => e.ruleId === 'GEO-012' && e.subject.kind === 'routeGroup' && e.subject.route === '/blog/[slug]')!;
    assert.equal(blog.subChecks.find((s) => s.id === 'title')!.status, 'not_run');
  });

  it('follows in-repo imports; absence through imported metadata is only candidate', async () => {
    const d = copy('next-fixable');
    writeFileSync(join(d, 'app', 'shared.ts'), "export const shared = { title: 'Shared', description: 'from a module' };\n");
    writeFileSync(join(d, 'app', 'about', 'page.tsx'), "import { shared } from '../shared';\nexport const metadata = shared;\nexport default function A() { return null; }\n");
    const r = (await scan({ repoPath: d, urls: [], config: cfg(d), configHash: 'x' })).report;
    const about = r.evaluations.find((e) => e.ruleId === 'GEO-015' && e.subject.kind === 'routeGroup' && e.subject.route === '/about')!;
    assert.equal(about.findings[0]!.provenance.level, 'candidate');
    const title = r.evaluations.find((e) => e.ruleId === 'GEO-012' && e.subject.kind === 'routeGroup' && e.subject.route === '/about')!;
    assert.equal(title.subChecks.find((s) => s.id === 'title')!.status, 'pass');
  });

  it('never claims exact provenance on a generic repository', async () => {
    const d = mkdtempSync(join(tmpdir(), 'geo-vue-'));
    writeFileSync(join(d, 'package.json'), JSON.stringify({ dependencies: { vue: '^3.0.0' } }));
    const r = (await scan({ repoPath: d, urls: [], config: validateConfig({ version: 1 }), configHash: 'x' })).report;
    assert.equal(r.framework.id, 'generic');
    assert.equal(r.framework.capabilityTier.provenance, null);
    assert.ok(r.evaluations.flatMap((e) => e.findings).every((f) => f.provenance.level !== 'exact'));
  });
});
