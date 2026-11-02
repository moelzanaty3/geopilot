import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG, loadConfig, printableConfig, validateConfig } from '../src/config/config.ts';
import { GeoError } from '../src/core/errors.ts';

const bad = (raw: unknown, re: RegExp): void => {
  assert.throws(() => validateConfig(raw), (e: unknown) => e instanceof GeoError && e.kind === 'config' && re.test(e.message));
};

describe('geo.config.json', () => {
  it('accepts the spec example', () => {
    const c = validateConfig({
      $schema: 'https://example.com/schema.json',
      version: 1,
      framework: 'auto',
      site: { origin: 'https://www.example.com', language: 'en' },
      routes: { include: ['/**'], exclude: ['/admin/**', '/api/**'] },
      crawl: { maxPages: 25, maxDepth: 3, render: 'auto', requestTimeoutMs: 10000 },
      policy: { aiSearchCrawlers: 'allow', aiTrainingCrawlers: 'undecided', userTriggeredFetchers: 'allow' },
      appLinks: { ios: null, android: null },
      rules: { 'GEO-102': 'off', 'GEO-012': { severity: 'low' } },
      suppress: [{ rule: 'GEO-014', routes: ['/legal/**'], reason: 'Intentional noindex', expires: '2027-06-01' }],
      fix: { verifyCommands: [], runtimeTimeoutSeconds: 60, serve: { command: null, url: null, readyTimeoutSeconds: 120 } },
      thresholds: { failOn: null, minReadiness: null, minCoverage: 80 },
      hook: { failOn: null, timeoutSeconds: 5 },
      experimental: false,
    });
    assert.equal(c.site.origin, 'https://www.example.com');
    assert.deepEqual(c.rules['GEO-012'], { severity: 'low' });
  });
  it('rejects unknown keys at every level', () => {
    bad({ version: 1, sitee: {} }, /\$\.sitee: unknown key/);
    bad({ version: 1, crawl: { maxpages: 3 } }, /crawl\.maxpages: unknown key/);
  });
  it('requires an origin, a loopback serve URL and argv serve commands', () => {
    bad({ version: 1, site: { origin: 'https://e.com/path' } }, /origin/);
    bad({ version: 1, fix: { serve: { url: 'http://10.0.0.1:3000' } } }, /loopback/);
    bad({ version: 1, fix: { serve: { command: 'next dev' } } }, /argv/);
    bad({ version: 1, rules: { 'GEO-999': 'off' } }, /unknown rule id/);
    bad({ version: 2 }, /must be 1/);
  });
  it('defaults the training-crawler policy to undecided and never sets an origin', () => {
    assert.equal(DEFAULT_CONFIG.policy.aiTrainingCrawlers, 'undecided');
    assert.equal(DEFAULT_CONFIG.site.origin, null);
  });
  it('applies root, then workspace, then environment', () => {
    const root = mkdtempSync(join(tmpdir(), 'geo-cfg-'));
    const ws = join(root, 'apps', 'web');
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(root, 'geo.config.json'), JSON.stringify({ version: 1, site: { origin: 'https://root.example' }, crawl: { maxDepth: 1 } }));
    writeFileSync(join(ws, 'geo.config.json'), JSON.stringify({ version: 1, crawl: { maxDepth: 2 } }));
    const c = loadConfig(ws, root, null, { GEO_MAX_PAGES: '7' });
    assert.equal(c.config.site.origin, 'https://root.example');
    assert.equal(c.config.crawl.maxDepth, 2);
    assert.equal(c.config.crawl.maxPages, 7);
    assert.equal(c.files.length, 2);
    assert.match(printableConfig(c.config), /root\.example/);
  });
});
