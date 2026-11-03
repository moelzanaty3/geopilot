import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/cli/main.ts';
import { sha256 } from '../src/core/hash.ts';
import { EXIT } from '../src/core/errors.ts';
import { unifiedDiff } from '../src/fix/diff.ts';
import { captureIo, gitFixture } from './helpers.ts';

const STUB = fileURLToPath(new URL('./support/serve-stub.mjs', import.meta.url));

async function freePort(): Promise<number> {
  const srv = createServer();
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address() as AddressInfo;
  await new Promise<void>((r) => srv.close(() => r()));
  return port;
}

function hashes(dir: string, files: string[]): Record<string, string | null> {
  return Object.fromEntries(files.map((f) => [f, existsSync(join(dir, f)) ? sha256(readFileSync(join(dir, f))) : null]));
}

async function cli(dir: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ code: number; out: string; err: string }> {
  const io = captureIo({ env });
  const code = await run([...args, '--no-color', '--non-interactive'], { io, cwd: dir, env });
  return { code, out: io.stdout(), err: io.stderr() };
}

function withServe(dir: string, port: number, extra: string[] = []): void {
  const cfg = JSON.parse(readFileSync(join(dir, 'geo.config.json'), 'utf8'));
  cfg.fix = { serve: { command: ['node', STUB, '--port', String(port), '--root', dir, ...extra], url: `http://127.0.0.1:${port}`, readyTimeoutSeconds: 15 } };
  writeFileSync(join(dir, 'geo.config.json'), JSON.stringify(cfg));
  execFileSync('git', ['-c', 'user.email=t@e', '-c', 'user.name=t', 'commit', '-qam', 'serve'], { cwd: dir });
}

function lastRun(dir: string): string {
  return readdirSync(join(dir, '.geo', 'runs')).sort().pop()!;
}

const FILES = ['app/layout.tsx', 'public/robots.txt', 'app/pricing/page.tsx', 'app/about/page.tsx'];

describe('fix engine', () => {
  it('dry run lists the closed-list fixes and writes nothing', async () => {
    const dir = gitFixture('next-fixable');
    const before = hashes(dir, FILES);
    const r = await cli(dir, ['fix', '--format', 'json']);
    assert.equal(r.code, EXIT.ok);
    const plan = JSON.parse(r.out);
    assert.deepEqual(plan.proposals.map((p: { variant: string }) => p.variant).sort(), ['G1', 'G2', 'S1', 'S2']);
    assert.deepEqual(hashes(dir, FILES), before);
  });

  it('--apply applies safe fixes, verifies them at V2, skips guarded ones, and is idempotent', async () => {
    const dir = gitFixture('next-fixable');
    const r = await cli(dir, ['fix', '--apply']);
    assert.equal(r.code, EXIT.ok, r.out + r.err);
    assert.match(r.out, /S1-\w+ +verified/);
    assert.match(r.out, /S2-\w+ +verified/);
    assert.match(r.err, /skipped guarded fix G1-/);
    assert.match(readFileSync(join(dir, 'app/layout.tsx'), 'utf8'), /<html lang="en">/);
    assert.match(readFileSync(join(dir, 'public/robots.txt'), 'utf8'), /Sitemap: https:\/\/www\.example\.com\/sitemap\.xml\n$/);
    assert.match(readFileSync(join(dir, 'app/pricing/page.tsx'), 'utf8'), /index: false/);
    const again = JSON.parse((await cli(dir, ['fix', '--format', 'json'])).out);
    assert.ok(!again.proposals.some((p: { variant: string }) => p.variant === 'S1' || p.variant === 'S2'));
  });

  it('rollback restores bytes exactly, and refuses after a later edit', async () => {
    const dir = gitFixture('next-fixable');
    const before = hashes(dir, FILES);
    await cli(dir, ['fix', '--apply']);
    const id = lastRun(dir);
    assert.equal((await cli(dir, ['fix', '--rollback', id, '--yes'])).code, EXIT.ok);
    assert.deepEqual(hashes(dir, FILES), before);

    await cli(dir, ['fix', '--apply']);
    const id2 = lastRun(dir);
    writeFileSync(join(dir, 'public/robots.txt'), 'edited by a developer\n');
    const r = await cli(dir, ['fix', '--rollback', id2, '--yes']);
    assert.equal(r.code, EXIT.gate);
    assert.match(r.err, /refused/);
    assert.equal(readFileSync(join(dir, 'public/robots.txt'), 'utf8'), 'edited by a developer\n');
  });

  it('a guarded fix named by --rule without --approve exits 2 before writing; --yes does not approve it', async () => {
    const dir = gitFixture('next-fixable');
    const before = hashes(dir, FILES);
    const r = await cli(dir, ['fix', '--apply', '--rule', 'GEO-014', '--yes']);
    assert.equal(r.code, EXIT.usage);
    assert.match(r.err, /needs explicit approval/);
    assert.deepEqual(hashes(dir, FILES), before);
  });

  it('refuses dirty target files unless --allow-dirty', async () => {
    const dir = gitFixture('next-fixable');
    writeFileSync(join(dir, 'app/layout.tsx'), `${readFileSync(join(dir, 'app/layout.tsx'), 'utf8')}// wip\n`);
    const r = await cli(dir, ['fix', '--apply', '--rule', 'GEO-012']);
    assert.equal(r.code, EXIT.usage);
    assert.match(r.err, /uncommitted/);
  });

  it('refuses the default branch without confirmation', async () => {
    const dir = gitFixture('next-fixable');
    execFileSync('git', ['checkout', '-qb', 'main'], { cwd: dir });
    const r = await cli(dir, ['fix', '--apply', '--rule', 'GEO-012']);
    assert.equal(r.code, EXIT.usage);
    assert.match(r.err, /default branch/);
  });

  it('a V4 fix without an authorised server is applied_unverified (exit 6), never verified', async () => {
    const dir = gitFixture('next-fixable');
    const plan = JSON.parse((await cli(dir, ['fix', '--format', 'json', '--rule', 'GEO-014'])).out);
    const id = plan.proposals[0].fixId;
    const r = await cli(dir, ['fix', '--apply', '--rule', 'GEO-014', '--approve', id]);
    assert.equal(r.code, EXIT.unverified, r.out + r.err);
    assert.match(r.out, /applied, unverified/);
    assert.match(r.out, /source_freshness unconfirmed/);
  });

  it('config alone never starts the serve command', async () => {
    const dir = gitFixture('next-fixable');
    withServe(dir, await freePort());
    const id = JSON.parse((await cli(dir, ['fix', '--format', 'json', '--rule', 'GEO-014'])).out).proposals[0].fixId;
    const r = await cli(dir, ['fix', '--apply', '--rule', 'GEO-014', '--approve', id]);
    assert.equal(r.code, EXIT.unverified);
    assert.match(r.out, /no serve command authorised/);
  });

  it('--serve: GEO starts the server after the write, freshness is confirmed, the fix is verified at V4', async () => {
    const dir = gitFixture('next-fixable');
    withServe(dir, await freePort());
    const id = JSON.parse((await cli(dir, ['fix', '--format', 'json', '--rule', 'GEO-014'])).out).proposals[0].fixId;
    const r = await cli(dir, ['fix', '--apply', '--rule', 'GEO-014', '--approve', id, '--serve']);
    assert.equal(r.code, EXIT.ok, r.out + r.err);
    assert.match(r.out, /verified/);
    assert.match(r.out, /source_freshness confirmed \(process_started_after_write\)/);
    assert.match(r.out, /V4 pass/);
  });

  it('GEO_ALLOW_SERVE_COMMAND=1 authorises serve in non-interactive mode', async () => {
    const dir = gitFixture('next-fixable');
    withServe(dir, await freePort());
    const id = JSON.parse((await cli(dir, ['fix', '--format', 'json', '--rule', 'GEO-014'])).out).proposals[0].fixId;
    const r = await cli(dir, ['fix', '--apply', '--rule', 'GEO-014', '--approve', id], { GEO_ALLOW_SERVE_COMMAND: '1' });
    assert.equal(r.code, EXIT.ok, r.out + r.err);
  });

  it('a confirmed-fresh runtime that still fails rolls the fix back (exit 5)', async () => {
    const dir = gitFixture('next-fixable');
    withServe(dir, await freePort(), ['--stale']);
    const before = hashes(dir, ['app/pricing/page.tsx']);
    const id = JSON.parse((await cli(dir, ['fix', '--format', 'json', '--rule', 'GEO-014'])).out).proposals[0].fixId;
    const r = await cli(dir, ['fix', '--apply', '--rule', 'GEO-014', '--approve', id, '--serve']);
    assert.equal(r.code, EXIT.rolledBack, r.out + r.err);
    assert.match(r.out, /rolled back/);
    assert.deepEqual(hashes(dir, ['app/pricing/page.tsx']), before);
  });

  it('refuses to observe a port something else is already using', async () => {
    const dir = gitFixture('next-fixable');
    const busy = createServer();
    await new Promise<void>((r) => busy.listen(0, '127.0.0.1', r));
    const port = (busy.address() as AddressInfo).port;
    try {
      withServe(dir, port);
      const id = JSON.parse((await cli(dir, ['fix', '--format', 'json', '--rule', 'GEO-014'])).out).proposals[0].fixId;
      const r = await cli(dir, ['fix', '--apply', '--rule', 'GEO-014', '--approve', id, '--serve']);
      assert.equal(r.code, EXIT.unverified);
      assert.match(r.out, /port_in_use/);
    } finally {
      await new Promise<void>((r) => busy.close(() => r()));
    }
  });

  it('G3 creates a static app/sitemap.ts when no sitemap source exists', async () => {
    const dir = gitFixture('next-fixable');
    rmSync(join(dir, 'public/sitemap.xml'));
    execFileSync('git', ['-c', 'user.email=t@e', '-c', 'user.name=t', 'commit', '-qam', 'no sitemap'], { cwd: dir });
    withServe(dir, await freePort());
    const plan = JSON.parse((await cli(dir, ['fix', '--format', 'json', '--rule', 'GEO-011'])).out);
    const g3 = plan.proposals.find((p: { variant: string }) => p.variant === 'G3');
    assert.ok(g3, JSON.stringify(plan.blocked));
    const r = await cli(dir, ['fix', '--apply', '--rule', 'GEO-011', '--approve', g3.fixId, '--serve']);
    const sitemap = readFileSync(join(dir, 'app/sitemap.ts'), 'utf8');
    assert.match(sitemap, /MetadataRoute\.Sitemap/);
    assert.match(sitemap, /https:\/\/www\.example\.com\/about/);
    assert.doesNotMatch(sitemap, /pricing/, 'noindex routes are not listed');
    assert.doesNotMatch(sitemap, /\[slug\]/, 'dynamic routes are not listed');
    assert.ok([EXIT.ok, EXIT.unverified].includes(r.code as 0 | 6), r.out + r.err);
  });

  it('unified diff is a single local hunk', () => {
    const d = unifiedDiff('a.txt', 'a\nb\nc\n', 'a\nB\nc\n');
    assert.match(d, /-b\n\+B/);
    assert.match(unifiedDiff('n.ts', null, 'x\n'), /--- \/dev\/null/);
  });
});
