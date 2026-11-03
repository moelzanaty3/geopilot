import type { FrameworkInfo, FrameworkId } from '../types.ts';
import type { RepoReader } from './reader.ts';
import { findAppDir, nextMajorOf } from '../frameworks/nextjs-app/analyze.ts';
import { findStaticRoot } from '../frameworks/static/analyze.ts';

// Framework identification from text only (spec 2.3). Detection is a hint
// about where source lives, never proof of how runtime output is produced.

const HINTS: readonly { readonly dep: string; readonly name: string }[] = [
  { dep: 'nuxt', name: 'Nuxt' },
  { dep: 'vue', name: 'Vue' },
  { dep: '@angular/core', name: 'Angular' },
  { dep: '@sveltejs/kit', name: 'SvelteKit' },
  { dep: 'svelte', name: 'Svelte' },
  { dep: 'astro', name: 'Astro' },
  { dep: '@remix-run/react', name: 'Remix' },
  { dep: '@react-router/dev', name: 'React Router framework' },
  { dep: 'gatsby', name: 'Gatsby' },
  { dep: '@11ty/eleventy', name: 'Eleventy' },
  { dep: 'vite', name: 'Vite' },
  { dep: 'react', name: 'React' },
];

function deps(repo: RepoReader): Record<string, string> | null {
  const text = repo.read('package.json');
  if (text === null) return null;
  try {
    const pkg = JSON.parse(text) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return { ...(pkg.devDependencies ?? {}), ...(pkg.dependencies ?? {}) };
  } catch {
    return {};
  }
}

const NONE = { urlAudit: 'T0', repo: null, provenance: null, fixes: null } as const;

export function detectFramework(repo: RepoReader, setting: 'auto' | 'nextjs-app' | 'static' | 'generic'): FrameworkInfo {
  const d = deps(repo);
  const evidence: string[] = [];
  const hasNext = d !== null && 'next' in d;
  const appDir = findAppDir(repo);
  const staticRoot = findStaticRoot(repo);
  const hints = d ? HINTS.filter((h) => h.dep in d).map((h) => h.name) : [];
  if (hasNext) evidence.push(`package.json depends on next ${d!.next}`);
  if (appDir) evidence.push(`${appDir}/ contains App Router page or layout files`);
  if (repo.files.some((f) => /^(src\/)?pages\/.+\.(tsx|ts|jsx|js)$/.test(f))) evidence.push('pages/ directory present (Pages Router)');
  if (staticRoot !== null) evidence.push(`${staticRoot || '.'}/index.html present`);
  for (const h of hints) evidence.push(`package.json depends on ${h}`);
  for (const f of ['hugo.toml', 'config.toml', '_config.yml', 'astro.config.mjs', 'nuxt.config.ts', 'svelte.config.js', 'angular.json']) {
    if (repo.has(f)) evidence.push(`${f} present`);
  }

  const make = (id: FrameworkId, state: FrameworkInfo['state'], confidence: FrameworkInfo['confidence'], version: string | null): FrameworkInfo => ({
    id,
    state,
    version,
    confidence,
    capabilityTier:
      id === 'nextjs-app'
        ? { urlAudit: 'T0', repo: 'T1', provenance: 'T2', fixes: 'T3' }
        : id === 'static'
          ? { urlAudit: 'T0', repo: 'T1', provenance: 'T2', fixes: 'T3' }
          : id === 'generic'
            ? { urlAudit: 'T0', repo: 'T1', provenance: null, fixes: null }
            : NONE,
    evidence,
  });

  if (setting === 'generic') return make('generic', 'detected', 'high', null);
  if (setting === 'nextjs-app') {
    if (!appDir) evidence.push('framework is set to nextjs-app but no app/ directory was found');
    return make(appDir ? 'nextjs-app' : 'generic', appDir ? 'detected' : 'suspected', appDir ? 'high' : 'low', hasNext ? d!.next ?? null : null);
  }
  if (setting === 'static') {
    return make(staticRoot !== null ? 'static' : 'generic', staticRoot !== null ? 'detected' : 'suspected', staticRoot !== null ? 'high' : 'low', null);
  }

  if (hasNext && appDir) {
    const major = nextMajorOf(repo);
    const otherFrameworks = hints.filter((h) => h !== 'React');
    if (otherFrameworks.length > 0) return make('nextjs-app', 'suspected', 'medium', d!.next ?? null);
    return make('nextjs-app', 'detected', major === null ? 'medium' : 'high', d!.next ?? null);
  }
  if (hasNext) return make('generic', 'suspected', 'low', d!.next ?? null);
  if (staticRoot !== null && hints.length === 0) return make('static', 'detected', d === null ? 'high' : 'medium', null);
  if (d !== null || hints.length > 0 || repo.files.length > 0) return make('generic', hints.length > 0 ? 'suspected' : 'unknown', 'low', null);
  return make('unknown', 'unknown', 'low', null);
}
