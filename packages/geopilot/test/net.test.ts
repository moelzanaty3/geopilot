import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { classifyAddress, classifyV6, expandV6, isLoopbackUrl } from '../src/net/address.ts';
import { guardedFetch, LIMITS } from '../src/net/fetch.ts';
import { fixtureServer } from './helpers.ts';
import { botProtection } from '../src/net/bot-protection.ts';
import type { FetchResult } from '../src/net/fetch.ts';

describe('address classification', () => {
  const cases: [string, string][] = [
    ['127.0.0.1', 'loopback'],
    ['10.1.2.3', 'private'],
    ['172.16.0.1', 'private'],
    ['172.32.0.1', 'public'],
    ['192.168.1.1', 'private'],
    ['169.254.169.254', 'link-local'],
    ['100.64.0.1', 'cgnat'],
    ['224.0.0.1', 'multicast'],
    ['0.0.0.0', 'unspecified'],
    ['8.8.8.8', 'public'],
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['fc00::1', 'ula'],
    ['fd12:3456::1', 'ula'],
    ['fe80::1', 'link-local'],
    ['ff02::1', 'multicast'],
    ['::ffff:127.0.0.1', 'loopback'],
    ['::ffff:7f00:1', 'loopback'],
    ['::ffff:10.0.0.1', 'private'],
    ['64:ff9b::a9fe:a9fe', 'link-local'],
    ['2002:7f00:1::', 'loopback'],
    ['2606:4700::1111', 'public'],
  ];
  for (const [ip, cls] of cases) it(`${ip} is ${cls}`, () => assert.equal(classifyAddress(ip), cls));

  it('expands compressed IPv6 and rejects malformed input', () => {
    assert.deepEqual(expandV6('1::2'), [1, 0, 0, 0, 0, 0, 0, 2]);
    assert.equal(expandV6('1::2::3'), null);
    assert.equal(classifyV6('zz::1'), 'reserved');
  });

  it('WHATWG URL parsing normalises IPv4 encodings before classification', () => {
    for (const u of ['http://0x7f000001/', 'http://2130706433/', 'http://0177.0.0.1/', 'http://127.1/']) {
      assert.equal(new URL(u).hostname, '127.0.0.1', u);
      assert.ok(isLoopbackUrl(new URL(u)), u);
    }
    assert.ok(isLoopbackUrl(new URL('http://[::ffff:127.0.0.1]/')));
  });
});

describe('guarded fetch', () => {
  const servers: { close: () => Promise<void> }[] = [];
  after(async () => {
    for (const s of servers) await s.close();
  });

  it('refuses a loopback target that was not explicitly named', async () => {
    const s = await fixtureServer({ '/': { status: 200, body: 'ok' } });
    servers.push(s);
    const r = await guardedFetch(`${s.origin}/`, 'html', { explicitHosts: new Set() });
    assert.equal(r.error?.code, 'blocked_address');
  });

  it('fetches an explicitly named loopback target', async () => {
    const s = await fixtureServer({ '/': { status: 200, body: '<html>ok</html>' } });
    servers.push(s);
    const r = await guardedFetch(`${s.origin}/`, 'html', { explicitHosts: new Set(['127.0.0.1']) });
    assert.equal(r.status, 200);
    assert.match(r.body, /ok/);
  });

  it('blocks a hostname that resolves to a private address (rebinding defence)', async () => {
    const r = await guardedFetch('http://rebind.test/', 'html', { explicitHosts: new Set(), lookup: async () => [{ address: '127.0.0.1', family: 4 }] });
    assert.equal(r.error?.code, 'blocked_address');
  });

  it('blocks when any resolved address is private, even if one is public', async () => {
    const r = await guardedFetch('http://mixed.test/', 'html', { explicitHosts: new Set(), lookup: async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }] });
    assert.equal(r.error?.code, 'blocked_address');
  });

  it('connects to exactly the checked address', async () => {
    const s = await fixtureServer({ '/': { status: 200, body: 'pinned' } });
    servers.push(s);
    const port = new URL(s.origin).port;
    let calls = 0;
    const r = await guardedFetch(`http://named.local:${port}/`, 'html', {
      explicitHosts: new Set(['named.local']),
      lookup: async () => {
        calls++;
        return [{ address: '127.0.0.1', family: 4 }];
      },
    });
    assert.equal(r.status, 200);
    assert.equal(r.address, '127.0.0.1');
    assert.equal(calls, 1);
  });

  it('does not follow a redirect from a named host to a different private host', async () => {
    const s = await fixtureServer({ '/': { status: 302, headers: { location: 'http://10.0.0.1/admin' } } });
    servers.push(s);
    const r = await guardedFetch(`${s.origin}/`, 'html', { explicitHosts: new Set(['127.0.0.1']) });
    assert.equal(r.error?.code, 'blocked_address');
    assert.equal(r.redirects.length, 1);
  });

  it('stops after five redirects', async () => {
    const routes: Record<string, { status: number; headers: Record<string, string> }> = {};
    for (let i = 0; i < 8; i++) routes[`/r${i}`] = { status: 302, headers: { location: `/r${i + 1}` } };
    const s = await fixtureServer(routes);
    servers.push(s);
    const r = await guardedFetch(`${s.origin}/r0`, 'html', { explicitHosts: new Set(['127.0.0.1']) });
    assert.equal(r.error?.code, 'too_many_redirects');
    assert.equal(r.redirects.length, LIMITS.maxRedirects);
  });

  it('refuses non-http schemes and credentials in URLs', async () => {
    assert.equal((await guardedFetch('file:///etc/passwd', 'html', { explicitHosts: new Set() })).error?.code, 'unsupported_protocol');
    assert.equal((await guardedFetch('http://u:p@example.com/', 'html', { explicitHosts: new Set() })).error?.code, 'unsupported_protocol');
  });

  it('caps decompressed size (gzip bomb guard)', async () => {
    const bomb = gzipSync(Buffer.alloc(LIMITS.robots * 4, 0x41));
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' });
      res.end(bomb);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    servers.push({ close: () => new Promise((r) => server.close(() => r())) });
    const { port } = server.address() as AddressInfo;
    const r = await guardedFetch(`http://127.0.0.1:${port}/robots.txt`, 'robots', { explicitHosts: new Set(['127.0.0.1']) });
    assert.equal(r.error?.code, 'body_too_large');
  });

  it('decodes gzip within limits and drops Set-Cookie', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip', 'set-cookie': 'sid=secret' });
      res.end(gzipSync('User-agent: *\nDisallow:\n'));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    servers.push({ close: () => new Promise((r) => server.close(() => r())) });
    const { port } = server.address() as AddressInfo;
    const r = await guardedFetch(`http://127.0.0.1:${port}/robots.txt`, 'robots', { explicitHosts: new Set(['127.0.0.1']) });
    assert.equal(r.status, 200);
    assert.match(r.body, /User-agent/);
    assert.equal(r.headers['set-cookie'], undefined);
  });
});

describe('bot protection detection', () => {
  const response = (status: number, body: string, headers: Record<string, string> = {}): FetchResult => ({ url: 'https://a.test/', finalUrl: 'https://a.test/', status, headers, body, bytes: body.length, redirects: [], error: null, address: '203.0.113.1' });

  it('identifies a challenge from its header or its markers', () => {
    assert.equal(botProtection(response(403, '', { 'cf-mitigated': 'challenge' })), 'Cloudflare');
    assert.equal(botProtection(response(403, '<title>Just a moment...</title>')), 'Cloudflare');
    assert.equal(botProtection(response(503, '<script src="/cdn-cgi/challenge-platform/x"></script>')), 'Cloudflare');
    assert.equal(botProtection(response(403, '<script src="https://geo.captcha-delivery.com/x"></script>')), 'DataDome');
  });

  it('ignores weak matches, healthy pages and markers beyond the first 64 KiB', () => {
    assert.equal(botProtection(response(503, '<title>Just a moment</title> datadome')), null);
    assert.equal(botProtection(response(403, 'We compared datadome with other products')), null);
    assert.equal(botProtection(response(200, '<title>Just a moment</title>')), null);
    assert.equal(botProtection(response(403, `${' '.repeat(70 * 1024)}cf-chl-marker`)), null);
  });

  it('stays fast on a large hostile body', () => {
    const body = '<title>access denied</title>'.repeat(180_000);
    const start = performance.now();
    assert.equal(botProtection(response(403, body)), null);
    assert.ok(performance.now() - start < 200);
  });
});
