import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

// The repository is read as text and never executed (spec 2.3, 14). Secrets
// and gitignored files are not read at all, not merely not reported.

const SECRET_NAMES = [/^\.env(\..*)?$/, /\.pem$/, /\.key$/, /^\.npmrc$/, /^\.netrc$/, /^id_[a-z0-9]+$/, /\.p12$/, /\.pfx$/];
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.turbo', '.vercel', 'dist', 'build', 'out', 'coverage', '.geo', '.cache']);
export const MAX_FILES = 20_000;
export const MAX_FILE_BYTES = 1024 * 1024;

export function isSecretPath(rel: string): boolean {
  const parts = rel.split(/[\\/]/);
  const base = parts[parts.length - 1] ?? '';
  if (rel === '.git/config' || parts.includes('.git')) return true;
  return SECRET_NAMES.some((re) => re.test(base));
}

export interface RepoReader {
  readonly root: string;
  readonly files: readonly string[];
  readonly gitCommit: string | null;
  readonly truncated: boolean;
  has(rel: string): boolean;
  read(rel: string): string | null;
}

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function walk(root: string, dir: string, out: string[]): void {
  if (out.length >= MAX_FILES) return;
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    if (out.length >= MAX_FILES) return;
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(root, abs, out);
    } else if (e.isFile() || e.isSymbolicLink()) {
      out.push(relative(root, abs).split(sep).join('/'));
    }
  }
}

export function openRepo(rootInput: string): RepoReader {
  const root = realpathSync(resolve(rootInput));
  let files: string[];
  const listed = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  if (listed !== null) {
    files = listed
      .split('\0')
      .filter(Boolean)
      .filter((f) => !f.split('/').some((p) => SKIP_DIRS.has(p)));
  } else {
    files = [];
    walk(root, root, files);
  }
  const truncated = files.length > MAX_FILES;
  files = files.filter((f) => !isSecretPath(f)).sort().slice(0, MAX_FILES);
  const set = new Set(files);
  const head = git(root, ['rev-parse', 'HEAD']);
  const cache = new Map<string, string | null>();
  return {
    root,
    files,
    gitCommit: head ? head.trim() : null,
    truncated,
    has: (rel) => set.has(rel),
    read(rel) {
      if (!set.has(rel) || isSecretPath(rel)) return null;
      if (cache.has(rel)) return cache.get(rel)!;
      const abs = join(root, rel);
      let content: string | null = null;
      try {
        // A symlink that resolves outside the repository is not followed.
        const real = lstatSync(abs).isSymbolicLink() ? realpathSync(abs) : abs;
        if (real !== root && !real.startsWith(root + sep)) content = null;
        else if (statSync(real).size <= MAX_FILE_BYTES) content = readFileSync(real, 'utf8');
      } catch {
        content = null;
      }
      cache.set(rel, content);
      return content;
    },
  };
}
