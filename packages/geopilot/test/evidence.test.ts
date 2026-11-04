import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli/main.ts';
import { EXIT } from '../src/core/errors.ts';
import { analyzeLogs, loadIpLists, parseLogLine } from '../src/evidence/logs.ts';
import { readCitations, wilsonInterval, type Http } from '../src/evidence/services.ts';
import type { Fetcher } from '../src/collect/crawl.ts';
import { captureIo } from './helpers.ts';

const GOOGLE_IP = '66.249.66.1';
const OPENAI_IP = '20.42.10.5';
const STRANGER_IP = '203.0.113.9';

const fetcher: Fetcher = async (url) => {
  const prefixes: Record<string, unknown[]> = {
    'https://developers.google.com/static/search/apis/ipranges/googlebot.json': [{ ipv4Prefix: '66.249.64.0/19' }, { ipv6Prefix: '2001:4860:4801::/48' }],
    'https://openai.com/searchbot.json': [{ ipv4Prefix: '20.42.10.0/24' }],
  };
  const body = prefixes[url] ? JSON.stringify({ prefixes: prefixes[url] }) : '';
  return { url, finalUrl: url, status: prefixes[url] ? 200 : 404, headers: {}, body, bytes: body.length, redirects: [], error: null, address: null };
};

const combined = (ip: string, path: string, status: number, agent: string) => `${ip} - - [03/Nov/2026:10:00:00 +0000] "GET ${path} HTTP/1.1" ${status} 512 "-" "${agent}"`;
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const SEARCHBOT = 'Mozilla/5.0 AppleWebKit/537.36; compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot';

async function* linesOf(lines: readonly string[]): AsyncGenerator<string> {
  yield* lines;
}

const find = async (lines: readonly string[]) => analyzeLogs(linesOf(lines), await loadIpLists(fetcher));

describe('crawler logs', () => {
  it('reads the combined format and Cloudflare Logpush, and drops query strings', () => {
    assert.deepEqual(parseLogLine(combined(GOOGLE_IP, '/a?token=secret', 200, GOOGLEBOT)), { ip: GOOGLE_IP, path: '/a', status: 200, userAgent: GOOGLEBOT });
    const json = JSON.stringify({ ClientIP: OPENAI_IP, ClientRequestURI: '/b?x=1', EdgeResponseStatus: 403, ClientRequestUserAgent: SEARCHBOT });
    assert.deepEqual(parseLogLine(json), { ip: OPENAI_IP, path: '/b', status: 403, userAgent: SEARCHBOT });
    assert.equal(parseLogLine('not a log line'), null);
    assert.equal(parseLogLine('{"broken'), null);
    assert.equal(parseLogLine(combined(GOOGLE_IP, `/${'a'.repeat(70_000)}`, 200, GOOGLEBOT)), null);
  });

  it('counts a request as verified only from an address on the operator list', async () => {
    const report = await find([combined(GOOGLE_IP, '/', 200, GOOGLEBOT), combined(STRANGER_IP, '/', 200, GOOGLEBOT)]);
    const google = report.crawlers.find((c) => c.crawler === 'Googlebot')!;
    assert.equal(google.requests, 2);
    assert.equal(google.verified, 1);
    assert.equal(google.unmatched, 1);
    assert.equal(google.verdict, 'reaching');
    assert.deepEqual(google.statuses, { 200: 1 });
    assert.ok(report.notes.some((n) => n.includes('address not on its operator')));
  });

  it('reports a verified crawler being refused, with the paths', async () => {
    const report = await find([combined(OPENAI_IP, '/pricing', 403, SEARCHBOT), combined(OPENAI_IP, '/pricing', 403, SEARCHBOT), combined(OPENAI_IP, '/', 200, SEARCHBOT)]);
    const bot = report.crawlers.find((c) => c.crawler === 'OAI-SearchBot')!;
    assert.equal(bot.verdict, 'blocked');
    assert.deepEqual(bot.blockedPaths, ['/pricing']);
  });

  it('never calls an impostor or proxied request reaching, and says why', async () => {
    const report = await find([combined(STRANGER_IP, '/', 200, GOOGLEBOT)]);
    assert.equal(report.crawlers.find((c) => c.crawler === 'Googlebot')?.verdict, 'unverified');
    assert.ok(report.notes.some((n) => n.includes('CDN or proxy')));
  });

  it('never verifies a crawler whose list is unavailable', async () => {
    const claude = (await find([combined(GOOGLE_IP, '/', 200, 'ClaudeBot/1.0')])).crawlers.find((c) => c.crawler === 'ClaudeBot')!;
    assert.equal(claude.listAvailable, false);
    assert.equal(claude.verified, 0);
    assert.equal(claude.verdict, 'unverified');
  });

  it('prints a report through the CLI', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'geo-logs-'));
    writeFileSync(join(dir, 'access.log'), `${combined(GOOGLE_IP, '/', 200, GOOGLEBOT)}\n`);
    const io = captureIo({});
    assert.equal(await run(['logs', 'access.log', '--no-color'], { io, cwd: dir, env: {}, fetcher }), EXIT.ok);
    assert.match(io.stdout(), /Googlebot\s+search\s+Reaching your site/);
    assert.doesNotMatch(io.stdout(), new RegExp(GOOGLE_IP.replaceAll('.', '\\.')));
    assert.equal(await run(['logs', 'missing.log'], { io: captureIo({}), cwd: dir, env: {}, fetcher }), EXIT.usage);
  });
});

describe('citation samples', () => {
  const answer = (text: string) => ({
    output: [
      { type: 'search_results', results: [{ id: 1, url: 'https://www.example.com/a' }, { id: 2, url: 'https://shop.other.test/b' }] },
      { type: 'message', content: [{ text }] },
    ],
  });

  it('separates cited in the answer from merely retrieved', () => {
    const cited = readCitations(answer('Yes [web:1].'), 'example.com');
    assert.equal(cited.cited, true);
    assert.equal(cited.retrieved, true);
    const retrievedOnly = readCitations(answer('Yes [web:2].'), 'example.com');
    assert.equal(retrievedOnly.cited, false);
    assert.equal(retrievedOnly.retrieved, true);
    assert.deepEqual(retrievedOnly.citedDomains, ['shop.other.test']);
  });

  it('does not match a lookalike domain', () => {
    const lookalike = readCitations({ output: [{ type: 'search_results', results: [{ id: 1, url: 'https://notexample.com/' }] }, { type: 'message', content: [{ text: '[web:1]' }] }] }, 'example.com');
    assert.equal(lookalike.cited, false);
  });

  it('gives a wide range for a small sample', () => {
    const small = wilsonInterval(1, 5);
    assert.ok(small.low < 0.05 && small.high > 0.6);
    assert.ok(wilsonInterval(50, 100).high - wilsonInterval(50, 100).low < 0.25);
  });

  it('needs a token and approval before any paid call, and keeps tokens out of the output', async () => {
    let calls = 0;
    const http: Http = async (_url, init) => {
      calls++;
      assert.equal((init.headers as Record<string, string>).authorization, 'Bearer secret-token');
      return new Response(JSON.stringify(answer('See [web:1].')));
    };
    const args = ['citations', 'best deals', '--domain', 'example.com', '--runs', '2', '--no-color'];
    assert.equal(await run(args, { io: captureIo({}), cwd: tmpdir(), env: {}, http }), EXIT.usage);
    assert.equal(await run(args, { io: captureIo({}), cwd: tmpdir(), env: { PERPLEXITY_API_KEY: 'secret-token' }, http }), EXIT.usage);
    assert.equal(calls, 0);
    const io = captureIo({});
    assert.equal(await run([...args, '--yes'], { io, cwd: tmpdir(), env: { PERPLEXITY_API_KEY: 'secret-token' }, http }), EXIT.ok);
    assert.equal(calls, 2);
    assert.match(io.stdout(), /2 of 2 runs/);
    assert.doesNotMatch(`${io.stdout()}${io.stderr()}`, /secret-token/);
  });
});

describe('service evidence', () => {
  it('summarises Cloudflare requests by status, and warns that user agents can be spoofed', async () => {
    const http: Http = async (url, init) => {
      assert.equal(url, 'https://api.cloudflare.com/client/v4/graphql');
      const { variables } = JSON.parse(String(init.body)) as { variables: { agent: string } };
      const groups = variables.agent === '%GPTBot%' ? [{ count: 9, dimensions: { edgeResponseStatus: 403, clientRequestPath: '/plans' } }, { count: 1, dimensions: { edgeResponseStatus: 200, clientRequestPath: '/' } }] : [];
      return new Response(JSON.stringify({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: groups }] } } }));
    };
    const io = captureIo({});
    assert.equal(await run(['cloudflare', '--zone', 'z1', '--no-color'], { io, cwd: tmpdir(), env: { CLOUDFLARE_API_TOKEN: 't' }, http }), EXIT.ok);
    assert.match(io.stdout(), /GPTBot\s+Mostly blocked\s+10 requests/);
    assert.match(io.stdout(), /blocked on \/plans/);
    assert.match(io.stdout(), /can be spoofed/);
    assert.equal(await run(['cloudflare', '--zone', 'z1', '--hours', '48'], { io: captureIo({}), cwd: tmpdir(), env: { CLOUDFLARE_API_TOKEN: 't' }, http }), EXIT.usage);
  });

  it('reports a service error plainly and without the token', async () => {
    const http: Http = async () => new Response('nope', { status: 401 });
    const io = captureIo({});
    assert.equal(await run(['cloudflare', '--zone', 'z1'], { io, cwd: tmpdir(), env: { CLOUDFLARE_API_TOKEN: 'secret-token' }, http }), EXIT.usage);
    assert.match(io.stderr(), /answered 401/);
    assert.doesNotMatch(io.stderr(), /secret-token/);
  });

  it("shows Google's index status", async () => {
    const http: Http = async () => new Response(JSON.stringify({ inspectionResult: { indexStatusResult: { verdict: 'FAIL', pageFetchState: 'ACCESS_FORBIDDEN', robotsTxtState: 'ALLOWED' } } }));
    const io = captureIo({});
    const env = { GOOGLE_ACCESS_TOKEN: 't' };
    assert.equal(await run(['inspect', 'https://example.com/a', '--site', 'sc-domain:example.com', '--no-color'], { io, cwd: tmpdir(), env, http }), EXIT.ok);
    assert.match(io.stdout(), /Verdict\s+FAIL/);
    assert.match(io.stdout(), /Page fetch\s+ACCESS_FORBIDDEN/);
    assert.match(io.stdout(), /Last crawl\s+not reported/);
  });
});
