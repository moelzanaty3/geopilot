import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { canonicalJson, sha256 } from '../core/hash.ts';
import { redact } from '../core/redact.ts';
import type { Report } from '../types.ts';

// `.geo/runs/<runId>` inside a repository, otherwise the OS user cache
// (spec 5.1). Ten runs are kept. DOM snapshots are bounded and redacted; no
// cookies, auth headers or full response bodies beyond the cap are stored.

export const RETAIN_RUNS = 10;
export const SNAPSHOT_MAX_BYTES = 512 * 1024;

export function userCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.GEO_CACHE_DIR) return env.GEO_CACHE_DIR;
  if (platform() === 'win32') return join(env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'geopilot');
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Caches', 'geopilot');
  return join(env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'geopilot');
}

export function cacheRoot(repoRoot: string | null, env: NodeJS.ProcessEnv = process.env): string {
  return repoRoot ? join(repoRoot, '.geo') : userCacheDir(env);
}

export function ensureGeoDir(root: string): void {
  mkdirSync(join(root, 'runs'), { recursive: true });
  const gi = join(root, '.gitignore');
  if (root.endsWith('.geo') && !existsSync(gi)) writeFileSync(gi, '*\n');
}

export function runDir(root: string, runId: string): string {
  if (!/^r-[0-9TZ]+-[0-9a-f]{6}$/.test(runId)) throw new Error(`not a run id: ${runId}`);
  return join(root, 'runs', runId);
}

export function snapshotName(url: string): string {
  return `${sha256(url).slice(0, 16)}.html`;
}

export function saveRun(root: string, report: Report, snapshots: ReadonlyMap<string, string>): string {
  ensureGeoDir(root);
  const dir = runDir(root, report.run.id);
  mkdirSync(join(dir, 'dom'), { recursive: true });
  const json = canonicalJson(report);
  writeFileSync(join(dir, 'report.json'), json);
  const index: Record<string, string> = {};
  for (const [url, html] of snapshots) {
    const name = snapshotName(url);
    const bounded = Buffer.byteLength(html) > SNAPSHOT_MAX_BYTES ? Buffer.from(html).subarray(0, SNAPSHOT_MAX_BYTES).toString('utf8') : html;
    writeFileSync(join(dir, 'dom', name), redact(bounded));
    index[url] = name;
  }
  writeFileSync(join(dir, 'dom', 'index.json'), canonicalJson(index));
  prune(root);
  return dir;
}

export function listRuns(root: string): string[] {
  const dir = join(root, 'runs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => /^r-/.test(d)).sort();
}

function prune(root: string): void {
  const runs = listRuns(root);
  for (const old of runs.slice(0, Math.max(0, runs.length - RETAIN_RUNS))) {
    // Runs holding fix snapshots are kept: rollback depends on them.
    if (existsSync(join(root, 'runs', old, 'fix'))) continue;
    rmSync(join(root, 'runs', old), { recursive: true, force: true });
  }
}

export interface LoadedRun {
  readonly report: Report;
  readonly reportSha256: string;
  readonly dir: string;
  readonly dom: ReadonlyMap<string, string>;
}

export function loadRun(root: string, runId: string): LoadedRun | null {
  const dir = runDir(root, runId);
  const file = join(dir, 'report.json');
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  const dom = new Map<string, string>();
  const idx = join(dir, 'dom', 'index.json');
  if (existsSync(idx)) {
    const index = JSON.parse(readFileSync(idx, 'utf8')) as Record<string, string>;
    for (const [url, name] of Object.entries(index)) {
      const p = join(dir, 'dom', name);
      if (existsSync(p)) dom.set(url, readFileSync(p, 'utf8'));
    }
  }
  return { report: JSON.parse(text) as Report, reportSha256: sha256(text), dir, dom };
}

export function latestRun(root: string): string | null {
  const runs = listRuns(root).filter((r) => existsSync(join(root, 'runs', r, 'report.json')));
  return runs[runs.length - 1] ?? null;
}
