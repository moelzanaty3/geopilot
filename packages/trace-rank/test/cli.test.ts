import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli/main.ts';
import { EXIT } from '../src/core/errors.ts';
import { TOOL_VERSION } from '../src/core/version.ts';
import { captureIo, FIXTURES, gitFixture } from './helpers.ts';

async function cli(dir: string, args: string[], opts: { interactive?: boolean; answers?: string[]; env?: NodeJS.ProcessEnv } = {}): Promise<{ code: number; out: string; err: string }> {
  const io = captureIo(opts);
  const code = await run(args, { io, cwd: dir, env: opts.env ?? {} });
  return { code, out: io.stdout(), err: io.stderr() };
}

describe('CLI contract', () => {
  it('prints help, version, and the disclaimer', async () => {
    const h = await cli(tmpdir(), ['--help']);
    assert.equal(h.code, EXIT.ok);
    assert.match(h.out, /does not measure or predict citations/);
    assert.equal((await cli(tmpdir(), ['--version'])).out.trim(), TOOL_VERSION);
  });
  it('unknown commands and flags are usage errors (exit 2)', async () => {
    assert.equal((await cli(tmpdir(), ['nope'])).code, EXIT.usage);
    assert.equal((await cli(tmpdir(), ['scan', '--aprove'])).code, EXIT.usage);
    assert.equal((await cli(tmpdir(), ['review'])).code, EXIT.usage);
    assert.equal((await cli(tmpdir(), ['scan', '--format', 'sarif'])).code, EXIT.usage);
  });
  it('invalid config exits 3', async () => {
    const d = mkdtempSync(join(tmpdir(), 'geo-bad-'));
    writeFileSync(join(d, 'geo.config.json'), '{"version":1,"oops":true}');
    const r = await cli(d, ['scan', '--no-cache']);
    assert.equal(r.code, EXIT.config);
    assert.match(r.err, /unknown key/);
  });
  it('scan writes paired formats and caches the run with redacted DOM snapshots', async () => {
    const dir = gitFixture('example-d');
    const r = await cli(dir, ['scan', '--format', 'json', '--output', 'r.json', '--format', 'markdown', '--output', 'r.md', '--quiet']);
    assert.equal(r.code, EXIT.ok, r.err);
    const report = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8'));
    assert.equal(report.schemaVersion, 'geo-report/v1');
    assert.match(readFileSync(join(dir, 'r.md'), 'utf8'), /## Verified engine findings/);
    assert.match(readFileSync(join(dir, 'r.md'), 'utf8'), /does not measure or predict/);
    assert.equal(readdirSync(join(dir, '.geo', 'runs')).length, 1);
    assert.equal(readFileSync(join(dir, '.geo', '.gitignore'), 'utf8'), '*\n');
  });
  it('--no-cache writes no run', async () => {
    const dir = gitFixture('example-d');
    await cli(dir, ['scan', '--no-cache', '--quiet']);
    assert.ok(!existsSync(join(dir, '.geo')));
  });
  it('gates: --fail-on exits 1; --min-readiness never passes on insufficient evidence; --fail-on-incomplete exits 4', async () => {
    const dir = join(FIXTURES, 'example-d');
    assert.equal((await cli(dir, ['scan', '--no-cache', '--quiet', '--fail-on', 'medium'])).code, EXIT.gate);
    const m = await cli(dir, ['scan', '--no-cache', '--quiet', '--min-readiness', '10']);
    assert.equal(m.code, EXIT.gate);
    assert.match(m.err, /insufficient evidence/);
    assert.equal((await cli(dir, ['scan', '--no-cache', '--quiet', '--fail-on-incomplete'])).code, EXIT.incomplete);
  });
  it('explain and rules', async () => {
    const e = await cli(tmpdir(), ['explain', 'geo-014']);
    assert.match(e.out, /G1 +Remove a literal noindex/);
    assert.match(e.out, /http_status +\[url\]/);
    assert.match((await cli(tmpdir(), ['explain', 'GEO-005'])).out, /retired/);
    const rules = JSON.parse((await cli(tmpdir(), ['rules', '--all', '--json'])).out);
    assert.equal(rules.rules.length, 14);
    assert.equal(rules.retired.length, 5);
  });
  it('--print-config prints the effective configuration', async () => {
    const r = await cli(join(FIXTURES, 'example-d'), ['scan', '--print-config']);
    assert.match(r.out, /"origin": "https:\/\/www\.example\.com"/);
  });
  it('init previews and needs approval; never infers the origin', async () => {
    const d = gitFixture('example-d');
    execFileSync('git', ['rm', '-q', 'geo.config.json'], { cwd: d });
    assert.equal((await cli(d, ['init'])).code, EXIT.usage);
    assert.ok(!existsSync(join(d, 'geo.config.json')));
    const r = await cli(d, ['init', '--yes']);
    assert.equal(r.code, EXIT.ok);
    const cfg = JSON.parse(readFileSync(join(d, 'geo.config.json'), 'utf8'));
    assert.equal(cfg.site.origin, null);
    assert.equal(cfg.fix.serve.command, null);
    assert.match(r.out, /Suggested \(not written unless you accept\)/);
    assert.equal((await cli(d, ['init', '--yes'])).code, EXIT.usage);
  });
  it('agent install copies the skill with the engine version stamped in, and status matches', async () => {
    const d = gitFixture('example-d');
    assert.equal((await cli(d, ['agent', 'install', '--host', 'claude-code'])).code, EXIT.usage);
    assert.equal((await cli(d, ['agent', 'install', '--host', 'claude-code', '--yes'])).code, EXIT.ok);
    const skill = readFileSync(join(d, '.claude', 'skills', 'geo', 'SKILL.md'), 'utf8');
    assert.match(skill, new RegExp(`engine-version: "${TOOL_VERSION.replace(/\./g, '\\.')}"`));
    assert.doesNotMatch(skill, /\{\{ENGINE_VERSION\}\}/);
    assert.equal((await cli(d, ['agent', 'status'])).code, EXIT.ok);
    assert.equal((await cli(d, ['agent', 'install', '--host', 'cursor', '--yes'])).code, EXIT.usage);
    assert.equal((await cli(d, ['agent', 'install', '--host', 'agents-md', '--yes'])).code, EXIT.usage);
  });
});

describe('insights validate', () => {
  function insightsDoc(runId: string, sha: string, commit: string, overrides: Record<string, unknown> = {}): unknown {
    return {
      schemaVersion: 'geo-insights/v1',
      producer: { host: 'claude-code', model: 'test', skillVersion: TOOL_VERSION },
      basedOn: { runId, reportSha256: sha, gitCommit: commit },
      insights: [
        {
          id: 'ins-1',
          kind: 'recommendation',
          category: 'metadata',
          title: 'Add a description to /pricing',
          description: 'The pricing page inherits no description.',
          evidence: [{ type: 'file', path: 'app/pricing/page.tsx', lines: { start: 3, end: 6 }, quote: "title: 'Pricing'" }],
          related: { fingerprints: [], routes: ['/pricing'], files: ['app/pricing/page.tsx'], insights: [] },
          conflictsWith: [],
          confidence: 'high',
          priority: 'medium',
          effort: 'small',
          expectedBenefit: 'GEO-012 passes',
          suggestedAction: 'Add description to the metadata export',
          fixClass: 'editorial',
          approvalRequired: true,
          verification: 'V2',
          uncertainty: 'Copy needs owner approval',
          ...overrides,
        },
      ],
    };
  }
  async function setup(): Promise<{ dir: string; runId: string; sha: string; commit: string }> {
    const dir = gitFixture('example-d');
    await cli(dir, ['scan', '--quiet']);
    const runId = readdirSync(join(dir, '.geo', 'runs'))[0]!;
    const text = readFileSync(join(dir, '.geo', 'runs', runId, 'report.json'), 'utf8');
    const { sha256 } = await import('../src/core/hash.ts');
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    return { dir, runId, sha: sha256(text), commit };
  }
  it('resolves file evidence at the cited commit', async () => {
    const { dir, runId, sha, commit } = await setup();
    writeFileSync(join(dir, 'ins.json'), JSON.stringify(insightsDoc(runId, sha, commit)));
    const r = await cli(dir, ['insights', 'validate', 'ins.json']);
    assert.equal(r.code, EXIT.ok, r.out);
    assert.match(r.out, /evidence resolved/);
  });
  it('rejects kind "verified" at L1 (exit 1)', async () => {
    const { dir, runId, sha, commit } = await setup();
    writeFileSync(join(dir, 'ins.json'), JSON.stringify(insightsDoc(runId, sha, commit, { kind: 'verified' })));
    const r = await cli(dir, ['insights', 'validate', 'ins.json']);
    assert.equal(r.code, EXIT.gate);
    assert.match(r.out, /never a verified result/);
  });
  it('flags a quote that does not resolve, and marks edited files stale', async () => {
    const { dir, runId, sha, commit } = await setup();
    writeFileSync(join(dir, 'ins.json'), JSON.stringify(insightsDoc(runId, sha, commit, { evidence: [{ type: 'file', path: 'app/pricing/page.tsx', lines: { start: 1, end: 2 }, quote: 'not in the file' }] })));
    assert.equal((await cli(dir, ['insights', 'validate', 'ins.json'])).code, EXIT.gate);
    writeFileSync(join(dir, 'ins.json'), JSON.stringify(insightsDoc(runId, sha, commit)));
    writeFileSync(join(dir, 'app/pricing/page.tsx'), '// edited\n');
    const r = await cli(dir, ['insights', 'validate', 'ins.json']);
    assert.match(r.out, /stale/);
  });
  it('with no retained run evidence, URL references are unchecked and it exits 4', async () => {
    const { dir, sha, commit } = await setup();
    writeFileSync(join(dir, 'ins.json'), JSON.stringify(insightsDoc('r-20200101T000000Z-000000', sha, commit, { evidence: [{ type: 'url', url: 'https://www.example.com/', selector: 'title' }] })));
    assert.equal((await cli(dir, ['insights', 'validate', 'ins.json'])).code, EXIT.incomplete);
  });
  it('report merge separates engine findings, recommendations and hypotheses', async () => {
    const { dir, runId, sha, commit } = await setup();
    writeFileSync(join(dir, 'ins.json'), JSON.stringify(insightsDoc(runId, sha, commit)));
    const report = join('.geo', 'runs', runId, 'report.json');
    const r = await cli(dir, ['report', 'merge', report, 'ins.json', '--format', 'markdown']);
    assert.equal(r.code, EXIT.ok, r.err);
    assert.match(r.out, /## Verified engine findings[\s\S]*## Agent recommendations[\s\S]*## Hypotheses to validate/);
    const conv = await cli(dir, ['report', 'convert', report, '--format', 'markdown']);
    assert.match(conv.out, /# trace-rank report/);
  });
});

describe('published schemas', () => {
  it('parse and declare JSON Schema 2020-12', () => {
    const dir = new URL('../schemas/', import.meta.url);
    for (const f of readdirSync(dir)) {
      const s = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
      assert.equal(s.$schema, 'https://json-schema.org/draft/2020-12/schema', f);
    }
  });
  it('the report schema requires every top-level field the engine emits', async () => {
    const schema = JSON.parse(readFileSync(new URL('../schemas/report-v1.json', import.meta.url), 'utf8'));
    const r = await cli(join(FIXTURES, 'example-d'), ['scan', '--no-cache', '--quiet', '--format', 'json']);
    assert.deepEqual(Object.keys(JSON.parse(r.out)).sort(), [...schema.required].sort());
  });
});
