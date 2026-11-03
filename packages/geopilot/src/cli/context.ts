import { execFileSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, type LoadedConfig } from '../config/config.ts';
import { GeoError, usage } from '../core/errors.ts';
import { cacheRoot } from '../cache/runs.ts';
import type { Fetcher } from '../collect/crawl.ts';
import { FORMATS, render, type Format } from '../report/render.ts';
import type { Report } from '../types.ts';
import type { Io } from './io.ts';
import type { Parsed } from './args.ts';

export interface Deps {
  readonly io: Io;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly fetcher?: Fetcher;
  readonly now?: () => Date;
}

export function gitRoot(dir: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

export function currentBranch(dir: string): string | null {
  try {
    return execFileSync('git', ['branch', '--show-current'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

export function defaultBranch(dir: string): string | null {
  try {
    const ref = execFileSync('git', ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return ref.replace(/^refs\/remotes\/origin\//, '') || null;
  } catch {
    return null;
  }
}

export function dirtyFiles(dir: string, files: readonly string[]): string[] {
  if (files.length === 0) return [];
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--', ...files], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').filter(Boolean).map((l) => l.slice(3));
  } catch {
    return [];
  }
}

export function resolveCwd(p: Parsed, deps: Deps): string {
  const c = p.str.get('cwd');
  const dir = c ? resolve(deps.cwd, c) : deps.cwd;
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw usage(`--cwd ${dir} is not a directory`);
  return dir;
}

export function loadFor(dir: string, p: Parsed, env: NodeJS.ProcessEnv): LoadedConfig {
  return loadConfig(dir, gitRoot(dir), p.str.get('config') ?? null, env);
}

export function cacheFor(repoPath: string | null, cwd: string, loaded: LoadedConfig, env: NodeJS.ProcessEnv): string {
  if (repoPath) return cacheRoot(gitRoot(repoPath) ?? repoPath, env);
  if (loaded.files.length > 0 || gitRoot(cwd)) return cacheRoot(gitRoot(cwd) ?? cwd, env);
  return cacheRoot(null, env);
}

function formatFromPath(path: string): Format | null {
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md') || path.endsWith('.markdown')) return 'markdown';
  if (path.endsWith('.txt')) return 'pretty';
  return null;
}

export function parseFormats(p: Parsed): { format: Format; output: string | null }[] {
  const formats = p.multi.get('format') ?? [];
  const outputs = p.multi.get('output') ?? [];
  for (const f of formats) {
    if (f === 'sarif' || f === 'github') throw usage(`--format ${f} is not available in this release`, 'SARIF and GitHub annotations ship with the Phase 3 GitHub Action. Use json, markdown or pretty.');
    if (!(FORMATS as readonly string[]).includes(f)) throw usage(`unknown --format ${f}`, `Use one of ${FORMATS.join(', ')}.`);
  }
  const pairs: { format: Format; output: string | null }[] = [];
  const n = Math.max(formats.length, outputs.length);
  for (let i = 0; i < n; i++) {
    const output = outputs[i] ?? null;
    const format = (formats[i] as Format | undefined) ?? (output ? formatFromPath(output) : null) ?? 'pretty';
    pairs.push({ format, output });
  }
  if (pairs.length === 0) pairs.push({ format: 'pretty', output: null });
  if (pairs.filter((x) => x.output === null).length > 1) throw usage('only one format can go to stdout; pair the others with --output');
  return pairs;
}

export function emit(report: Report, p: Parsed, deps: Deps, cwd: string): void {
  for (const { format, output } of parseFormats(p)) {
    const text = render(report, format, deps.io.color);
    if (output) {
      writeFileSync(resolve(cwd, output), format === 'pretty' ? render(report, 'pretty', { brand: (s) => s, red: (s) => s, green: (s) => s, yellow: (s) => s, dim: (s) => s, bold: (s) => s }) : text);
      if (!p.bool.has('quiet')) deps.io.err(`wrote ${format} report to ${output}\n`);
    } else if (!p.bool.has('quiet') || format !== 'pretty') deps.io.out(text);
  }
}

export function requireRepo(dir: string): void {
  if (!existsSync(dir)) throw new GeoError('usage', `${dir} does not exist`);
}
