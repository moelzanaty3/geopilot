import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blocksSite, evaluate, parseRobots } from '../src/robots/robots.ts';
import { blocksIndexing, headFacts, parseDirectives, parseHtml, restrictsSnippets } from '../src/html/parse.ts';
import { parseSitemap, inflateSitemap } from '../src/sitemap/sitemap.ts';
import { parseXRobotsTag } from '../src/rules/evaluate.ts';
import { gzipSync } from 'node:zlib';
import { rng } from './helpers.ts';

describe('RFC 9309 robots', () => {
  it('uses the longest match, and allow wins a tie', () => {
    const r = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /x\nAllow: /x\n');
    assert.equal(evaluate(r, 'Bot', '/private/secret').allowed, false);
    assert.equal(evaluate(r, 'Bot', '/private/public/page').allowed, true);
    assert.equal(evaluate(r, 'Bot', '/x').allowed, true);
  });
  it('supports * and $', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp*/cache\n');
    assert.equal(evaluate(r, 'Bot', '/a/b.pdf').allowed, false);
    assert.equal(evaluate(r, 'Bot', '/a/b.pdf?x=1').allowed, true);
    assert.equal(evaluate(r, 'Bot', '/tmp1/cache').allowed, false);
  });
  it('a specific group replaces the wildcard group; tokens match case-insensitively', () => {
    const r = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /\n');
    assert.equal(evaluate(r, 'gptbot', '/page').allowed, true);
    assert.equal(evaluate(r, 'OAI-SearchBot', '/page').allowed, false);
    assert.equal(evaluate(r, 'GPTBot', '/page').group, 'specific');
  });
  it('merges groups that name the same agent and groups consecutive user-agent lines', () => {
    const r = parseRobots('User-agent: a\nUser-agent: b\nDisallow: /one\n\nUser-agent: b\nDisallow: /two\n');
    assert.equal(evaluate(r, 'b', '/one').allowed, false);
    assert.equal(evaluate(r, 'b', '/two').allowed, false);
    assert.equal(evaluate(r, 'a', '/two').allowed, true);
  });
  it('an empty Disallow allows everything and /robots.txt is always allowed', () => {
    assert.equal(evaluate(parseRobots('User-agent: *\nDisallow:\n'), 'x', '/a').allowed, true);
    assert.equal(evaluate(parseRobots('User-agent: *\nDisallow: /\n'), 'x', '/robots.txt').allowed, true);
  });
  it('normalises percent-encoding', () => {
    assert.equal(evaluate(parseRobots('User-agent: *\nDisallow: /a%2fb\n'), 'x', '/a%2Fb').allowed, false);
  });
  it('reads sitemap lines, crawl-delay and comments', () => {
    const r = parseRobots('# hi\nUser-agent: * # all\nCrawl-delay: 5\nSitemap: https://e.com/s.xml\n');
    assert.equal(r.sitemaps[0]!.url, 'https://e.com/s.xml');
    assert.equal(r.groups[0]!.crawlDelay, 5);
    assert.ok(!blocksSite(r, 'x'));
  });
  it('property: an Allow equal to the path always wins over a Disallow of the same length', () => {
    const r = rng(9);
    for (let i = 0; i < 10_000; i++) {
      const path = `/${Math.floor(r() * 1e6).toString(36)}`;
      const robots = parseRobots(`User-agent: *\nDisallow: ${path}\nAllow: ${path}\n`);
      assert.equal(evaluate(robots, 'x', path).allowed, true);
    }
  });
});

describe('HTML extraction', () => {
  const html = `<!doctype html><html lang="en-GB"><head>
    <!-- <title>commented</title> -->
    <title>Hello &amp; welcome</title>
    <meta name="description" content="A page">
    <meta name="robots" content="noindex, follow">
    <link rel="canonical" href="https://e.com/a">
    <script type="application/ld+json">{"@type":"Article","headline":"x"}</script>
    <script>var t = "<title>not this</title>";</script>
  </head><body><main><a href="/b">B</a><a href='/c'>C</a></main></body></html>`;
  const f = headFacts(parseHtml(html));
  it('reads lang, title, description, robots, canonical, JSON-LD and links', () => {
    assert.equal(f.lang, 'en-GB');
    assert.equal(f.title, 'Hello & welcome');
    assert.equal(f.description, 'A page');
    assert.deepEqual(f.robots, [{ name: 'robots', content: 'noindex, follow' }]);
    assert.deepEqual(f.canonical, ['https://e.com/a']);
    assert.equal(f.jsonLd.length, 1);
    assert.deepEqual(f.links, ['/b', '/c']);
    assert.ok(f.hasMain);
  });
  it('parses robots directives and scoped X-Robots-Tag values', () => {
    assert.ok(blocksIndexing(parseDirectives('NOINDEX, follow')));
    assert.ok(blocksIndexing(parseDirectives('none')));
    assert.ok(restrictsSnippets(parseDirectives('max-snippet: 0')));
    assert.ok(!restrictsSnippets(parseDirectives('max-snippet:50')));
    const x = parseXRobotsTag('googlebot: noindex, nofollow, otherbot: noarchive');
    assert.equal(x[0]!.agent, 'googlebot');
    assert.ok(x[0]!.values.has('noindex'));
    assert.equal(x[1]!.agent, 'otherbot');
  });
});

describe('sitemaps', () => {
  it('parses urlset and sitemapindex', () => {
    assert.deepEqual(parseSitemap('<urlset><url><loc>https://e.com/a</loc></url></urlset>').locs, ['https://e.com/a']);
    assert.equal(parseSitemap('<sitemapindex><sitemap><loc>https://e.com/s1.xml</loc></sitemap></sitemapindex>').kind, 'sitemapindex');
  });
  it('reports relative locs, missing roots and empty sitemaps', () => {
    assert.ok(parseSitemap('<urlset><url><loc>/a</loc></url></urlset>').errors[0]!.includes('absolute'));
    assert.equal(parseSitemap('<html></html>').kind, 'invalid');
    assert.ok(parseSitemap('<urlset></urlset>').errors.length > 0);
  });
  it('inflates gzip sitemaps', () => {
    assert.match(inflateSitemap(gzipSync('<urlset/>')), /urlset/);
  });
});
