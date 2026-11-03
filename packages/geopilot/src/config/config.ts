import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { GeoError } from '../core/errors.ts';
import { sha256, canonicalJson } from '../core/hash.ts';
import type { RuleId, Severity } from '../types.ts';

export type RenderMode = 'auto' | 'always' | 'never';
export type CrawlerPolicy = 'allow' | 'block' | 'undecided';
export type FrameworkSetting = 'auto' | 'nextjs-app' | 'static' | 'generic';

export interface Suppression {
  readonly rule: RuleId;
  readonly routes: readonly string[];
  readonly reason: string;
  readonly expires: string | null;
}

export interface GeoConfig {
  readonly version: 1;
  readonly framework: FrameworkSetting;
  readonly profile: 'web' | 'app';
  readonly site: { readonly origin: string | null; readonly language: string | null };
  readonly routes: { readonly include: readonly string[]; readonly exclude: readonly string[] };
  readonly crawl: {
    readonly maxPages: number | null;
    readonly maxDepth: number;
    readonly render: RenderMode;
    readonly requestTimeoutMs: number;
  };
  readonly policy: {
    readonly aiSearchCrawlers: CrawlerPolicy;
    readonly aiTrainingCrawlers: CrawlerPolicy;
    readonly userTriggeredFetchers: CrawlerPolicy;
  };
  readonly appLinks: {
    readonly ios: { readonly appIds: readonly string[] } | null;
    readonly android: { readonly packageName: string; readonly sha256CertFingerprints: readonly string[] } | null;
  };
  readonly rules: Readonly<Partial<Record<RuleId, 'off' | { readonly severity: Severity }>>>;
  readonly suppress: readonly Suppression[];
  readonly fix: {
    readonly verifyCommands: readonly (readonly string[])[];
    readonly runtimeTimeoutSeconds: number;
    readonly serve: { readonly command: readonly string[] | null; readonly url: string | null; readonly readyTimeoutSeconds: number };
  };
  readonly thresholds: { readonly failOn: Severity | null; readonly minReadiness: number | null; readonly minCoverage: number };
  readonly hook: { readonly failOn: Severity | null; readonly timeoutSeconds: number };
  readonly experimental: boolean;
}

export const DEFAULT_CONFIG: GeoConfig = {
  version: 1,
  framework: 'auto',
  profile: 'web',
  site: { origin: null, language: null },
  routes: { include: ['/**'], exclude: [] },
  crawl: { maxPages: null, maxDepth: 3, render: 'auto', requestTimeoutMs: 10_000 },
  policy: { aiSearchCrawlers: 'allow', aiTrainingCrawlers: 'undecided', userTriggeredFetchers: 'allow' },
  appLinks: { ios: null, android: null },
  rules: {},
  suppress: [],
  fix: { verifyCommands: [], runtimeTimeoutSeconds: 60, serve: { command: null, url: null, readyTimeoutSeconds: 120 } },
  thresholds: { failOn: null, minReadiness: null, minCoverage: 80 },
  hook: { failOn: null, timeoutSeconds: 5 },
  experimental: false,
};

export const CONFIG_FILE = 'geo.config.json';
const RULE_IDS = new Set(['GEO-002', 'GEO-003', 'GEO-004', 'GEO-009', 'GEO-010', 'GEO-011', 'GEO-012', 'GEO-013', 'GEO-014', 'GEO-015', 'GEO-016', 'GEO-017', 'GEO-101', 'GEO-102']);
const SEVERITIES = new Set(['high', 'medium', 'low', 'info']);

class Problems {
  readonly list: string[] = [];
  add(path: string, msg: string): void {
    this.list.push(`${path}: ${msg}`);
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function keys(p: Problems, path: string, value: Obj, allowed: readonly string[]): void {
  for (const k of Object.keys(value)) if (!allowed.includes(k)) p.add(`${path}.${k}`, 'unknown key');
}

function oneOf<T extends string>(p: Problems, path: string, v: unknown, options: readonly T[]): v is T {
  if (typeof v === 'string' && (options as readonly string[]).includes(v)) return true;
  p.add(path, `must be one of ${options.join(', ')}`);
  return false;
}

function int(p: Problems, path: string, v: unknown, min: number, max: number): v is number {
  if (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max) return true;
  p.add(path, `must be an integer from ${min} to ${max}`);
  return false;
}

function strArray(p: Problems, path: string, v: unknown): v is string[] {
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return true;
  p.add(path, 'must be an array of strings');
  return false;
}

function isLoopbackHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    const h = u.hostname.replace(/^\[|\]$/g, '');
    return (u.protocol === 'http:' || u.protocol === 'https:') && (h === 'localhost' || h === '::1' || /^127\./.test(h));
  } catch {
    return false;
  }
}

/**
 * Validate a parsed geo.config.json and merge it over `base`. Unknown keys are
 * errors (spec 6): a typo in a policy key must not silently fall back to a
 * default the owner did not choose.
 */
export function validateConfig(raw: unknown, base: GeoConfig = DEFAULT_CONFIG, source = CONFIG_FILE): GeoConfig {
  const p = new Problems();
  if (!isObj(raw)) throw new GeoError('config', `${source}: must be a JSON object`);
  keys(p, '$', raw, ['$schema', 'version', 'framework', 'profile', 'site', 'routes', 'crawl', 'policy', 'appLinks', 'rules', 'suppress', 'fix', 'thresholds', 'hook', 'experimental']);
  if (raw.version !== 1) p.add('$.version', 'must be 1');
  const c = structuredClone(base) as { -readonly [K in keyof GeoConfig]: GeoConfig[K] } & Obj;

  if (raw.framework !== undefined && oneOf(p, '$.framework', raw.framework, ['auto', 'nextjs-app', 'static', 'generic'] as const)) c.framework = raw.framework;
  if (raw.profile !== undefined && oneOf(p, '$.profile', raw.profile, ['web', 'app'] as const)) c.profile = raw.profile;
  if (raw.experimental !== undefined) {
    if (typeof raw.experimental === 'boolean') c.experimental = raw.experimental;
    else p.add('$.experimental', 'must be a boolean');
  }

  if (raw.site !== undefined) {
    if (!isObj(raw.site)) p.add('$.site', 'must be an object');
    else {
      keys(p, '$.site', raw.site, ['origin', 'language']);
      const site = { ...c.site };
      if (raw.site.origin !== undefined) {
        if (raw.site.origin === null) site.origin = null;
        else if (typeof raw.site.origin === 'string') {
          try {
            const u = new URL(raw.site.origin);
            if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.pathname !== '/' || u.search || u.hash) throw new Error('shape');
            site.origin = u.origin;
          } catch {
            p.add('$.site.origin', 'must be an http(s) origin such as https://www.example.com');
          }
        } else p.add('$.site.origin', 'must be a string or null');
      }
      if (raw.site.language !== undefined) {
        if (raw.site.language === null) site.language = null;
        else if (typeof raw.site.language === 'string' && /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(raw.site.language)) site.language = raw.site.language;
        else p.add('$.site.language', 'must be a BCP 47 language tag such as en or en-GB');
      }
      c.site = site;
    }
  }

  if (raw.routes !== undefined) {
    if (!isObj(raw.routes)) p.add('$.routes', 'must be an object');
    else {
      keys(p, '$.routes', raw.routes, ['include', 'exclude']);
      const routes = { ...c.routes };
      if (raw.routes.include !== undefined && strArray(p, '$.routes.include', raw.routes.include)) routes.include = raw.routes.include;
      if (raw.routes.exclude !== undefined && strArray(p, '$.routes.exclude', raw.routes.exclude)) routes.exclude = raw.routes.exclude;
      c.routes = routes;
    }
  }

  if (raw.crawl !== undefined) {
    if (!isObj(raw.crawl)) p.add('$.crawl', 'must be an object');
    else {
      keys(p, '$.crawl', raw.crawl, ['maxPages', 'maxDepth', 'render', 'requestTimeoutMs']);
      const crawl = { ...c.crawl };
      if (raw.crawl.maxPages !== undefined && int(p, '$.crawl.maxPages', raw.crawl.maxPages, 1, 200)) crawl.maxPages = raw.crawl.maxPages;
      if (raw.crawl.maxDepth !== undefined && int(p, '$.crawl.maxDepth', raw.crawl.maxDepth, 0, 10)) crawl.maxDepth = raw.crawl.maxDepth;
      if (raw.crawl.render !== undefined && oneOf(p, '$.crawl.render', raw.crawl.render, ['auto', 'always', 'never'] as const)) crawl.render = raw.crawl.render;
      if (raw.crawl.requestTimeoutMs !== undefined && int(p, '$.crawl.requestTimeoutMs', raw.crawl.requestTimeoutMs, 1000, 10_000)) crawl.requestTimeoutMs = raw.crawl.requestTimeoutMs;
      c.crawl = crawl;
    }
  }

  if (raw.policy !== undefined) {
    if (!isObj(raw.policy)) p.add('$.policy', 'must be an object');
    else {
      keys(p, '$.policy', raw.policy, ['aiSearchCrawlers', 'aiTrainingCrawlers', 'userTriggeredFetchers']);
      const policy = { ...c.policy };
      const opts = ['allow', 'block', 'undecided'] as const;
      if (raw.policy.aiSearchCrawlers !== undefined && oneOf(p, '$.policy.aiSearchCrawlers', raw.policy.aiSearchCrawlers, opts)) policy.aiSearchCrawlers = raw.policy.aiSearchCrawlers;
      if (raw.policy.aiTrainingCrawlers !== undefined && oneOf(p, '$.policy.aiTrainingCrawlers', raw.policy.aiTrainingCrawlers, opts)) policy.aiTrainingCrawlers = raw.policy.aiTrainingCrawlers;
      if (raw.policy.userTriggeredFetchers !== undefined && oneOf(p, '$.policy.userTriggeredFetchers', raw.policy.userTriggeredFetchers, opts)) policy.userTriggeredFetchers = raw.policy.userTriggeredFetchers;
      c.policy = policy;
    }
  }

  if (raw.appLinks !== undefined) {
    if (!isObj(raw.appLinks)) p.add('$.appLinks', 'must be an object');
    else {
      keys(p, '$.appLinks', raw.appLinks, ['ios', 'android']);
      const appLinks = { ...c.appLinks };
      const ios = raw.appLinks.ios;
      if (ios !== undefined) {
        if (ios === null) appLinks.ios = null;
        else if (isObj(ios) && strArray(p, '$.appLinks.ios.appIds', ios.appIds)) {
          keys(p, '$.appLinks.ios', ios, ['appIds']);
          appLinks.ios = { appIds: ios.appIds };
        } else if (!isObj(ios)) p.add('$.appLinks.ios', 'must be null or { appIds: [...] }');
      }
      const android = raw.appLinks.android;
      if (android !== undefined) {
        if (android === null) appLinks.android = null;
        else if (isObj(android) && typeof android.packageName === 'string' && strArray(p, '$.appLinks.android.sha256CertFingerprints', android.sha256CertFingerprints)) {
          keys(p, '$.appLinks.android', android, ['packageName', 'sha256CertFingerprints']);
          appLinks.android = { packageName: android.packageName, sha256CertFingerprints: android.sha256CertFingerprints };
        } else p.add('$.appLinks.android', 'must be null or { packageName, sha256CertFingerprints }');
      }
      c.appLinks = appLinks;
    }
  }

  if (raw.rules !== undefined) {
    if (!isObj(raw.rules)) p.add('$.rules', 'must be an object');
    else {
      const rules: Partial<Record<RuleId, 'off' | { severity: Severity }>> = { ...c.rules };
      for (const [id, v] of Object.entries(raw.rules)) {
        if (!RULE_IDS.has(id)) {
          p.add(`$.rules.${id}`, 'unknown rule id');
          continue;
        }
        if (v === 'off') rules[id as RuleId] = 'off';
        else if (isObj(v) && typeof v.severity === 'string' && SEVERITIES.has(v.severity) && Object.keys(v).length === 1) {
          rules[id as RuleId] = { severity: v.severity as Severity };
        } else p.add(`$.rules.${id}`, 'must be "off" or { "severity": "high" | "medium" | "low" | "info" }');
      }
      c.rules = rules;
    }
  }

  if (raw.suppress !== undefined) {
    if (!Array.isArray(raw.suppress)) p.add('$.suppress', 'must be an array');
    else {
      const out: Suppression[] = [];
      raw.suppress.forEach((s, i) => {
        const path = `$.suppress[${i}]`;
        if (!isObj(s)) return p.add(path, 'must be an object');
        keys(p, path, s, ['rule', 'routes', 'reason', 'expires']);
        if (typeof s.rule !== 'string' || !RULE_IDS.has(s.rule)) return p.add(`${path}.rule`, 'unknown rule id');
        if (typeof s.reason !== 'string' || s.reason.trim() === '') return p.add(`${path}.reason`, 'a reason is required');
        const routes = s.routes === undefined ? ['/**'] : s.routes;
        if (!strArray(p, `${path}.routes`, routes)) return;
        let expires: string | null = null;
        if (s.expires !== undefined && s.expires !== null) {
          if (typeof s.expires !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.expires) || Number.isNaN(Date.parse(`${s.expires}T00:00:00Z`))) {
            return p.add(`${path}.expires`, 'must be a YYYY-MM-DD date');
          }
          expires = s.expires;
        }
        out.push({ rule: s.rule as RuleId, routes, reason: s.reason, expires });
      });
      c.suppress = out;
    }
  }

  if (raw.fix !== undefined) {
    if (!isObj(raw.fix)) p.add('$.fix', 'must be an object');
    else {
      keys(p, '$.fix', raw.fix, ['verifyCommands', 'runtimeTimeoutSeconds', 'serve']);
      const fix = { ...c.fix, serve: { ...c.fix.serve } };
      if (raw.fix.verifyCommands !== undefined) {
        if (Array.isArray(raw.fix.verifyCommands) && raw.fix.verifyCommands.every((cmd) => Array.isArray(cmd) && cmd.length > 0 && cmd.every((x) => typeof x === 'string'))) {
          fix.verifyCommands = raw.fix.verifyCommands as string[][];
        } else p.add('$.fix.verifyCommands', 'must be an array of argv arrays, e.g. [["pnpm", "test"]]');
      }
      if (raw.fix.runtimeTimeoutSeconds !== undefined && int(p, '$.fix.runtimeTimeoutSeconds', raw.fix.runtimeTimeoutSeconds, 5, 600)) fix.runtimeTimeoutSeconds = raw.fix.runtimeTimeoutSeconds;
      const serve = raw.fix.serve;
      if (serve !== undefined) {
        if (!isObj(serve)) p.add('$.fix.serve', 'must be an object');
        else {
          keys(p, '$.fix.serve', serve, ['command', 'url', 'readyTimeoutSeconds']);
          if (serve.command !== undefined) {
            if (serve.command === null) fix.serve.command = null;
            else if (Array.isArray(serve.command) && serve.command.length > 0 && serve.command.every((x) => typeof x === 'string')) fix.serve.command = serve.command as string[];
            else p.add('$.fix.serve.command', 'must be null or an argv array; it is never passed to a shell');
          }
          if (serve.url !== undefined) {
            if (serve.url === null) fix.serve.url = null;
            else if (typeof serve.url === 'string' && isLoopbackHttpUrl(serve.url)) fix.serve.url = serve.url;
            else p.add('$.fix.serve.url', 'must be null or a loopback URL such as http://127.0.0.1:3100');
          }
          if (serve.readyTimeoutSeconds !== undefined && int(p, '$.fix.serve.readyTimeoutSeconds', serve.readyTimeoutSeconds, 5, 600)) fix.serve.readyTimeoutSeconds = serve.readyTimeoutSeconds;
        }
      }
      c.fix = fix;
    }
  }

  if (raw.thresholds !== undefined) {
    if (!isObj(raw.thresholds)) p.add('$.thresholds', 'must be an object');
    else {
      keys(p, '$.thresholds', raw.thresholds, ['failOn', 'minReadiness', 'minCoverage']);
      const t = { ...c.thresholds };
      if (raw.thresholds.failOn !== undefined) {
        if (raw.thresholds.failOn === null) t.failOn = null;
        else if (oneOf(p, '$.thresholds.failOn', raw.thresholds.failOn, ['high', 'medium', 'low', 'info'] as const)) t.failOn = raw.thresholds.failOn;
      }
      if (raw.thresholds.minReadiness !== undefined) {
        if (raw.thresholds.minReadiness === null) t.minReadiness = null;
        else if (int(p, '$.thresholds.minReadiness', raw.thresholds.minReadiness, 0, 100)) t.minReadiness = raw.thresholds.minReadiness;
      }
      if (raw.thresholds.minCoverage !== undefined && int(p, '$.thresholds.minCoverage', raw.thresholds.minCoverage, 0, 100)) t.minCoverage = raw.thresholds.minCoverage;
      c.thresholds = t;
    }
  }

  if (raw.hook !== undefined) {
    if (!isObj(raw.hook)) p.add('$.hook', 'must be an object');
    else {
      keys(p, '$.hook', raw.hook, ['failOn', 'timeoutSeconds']);
      const h = { ...c.hook };
      if (raw.hook.failOn !== undefined) {
        if (raw.hook.failOn === null) h.failOn = null;
        else if (oneOf(p, '$.hook.failOn', raw.hook.failOn, ['high', 'medium', 'low', 'info'] as const)) h.failOn = raw.hook.failOn;
      }
      if (raw.hook.timeoutSeconds !== undefined && int(p, '$.hook.timeoutSeconds', raw.hook.timeoutSeconds, 1, 60)) h.timeoutSeconds = raw.hook.timeoutSeconds;
      c.hook = h;
    }
  }

  if (p.list.length > 0) {
    throw new GeoError('config', `${source} is invalid:\n  ${p.list.join('\n  ')}`, 'See https://moelzanaty3.github.io/geopilot/docs/configuration');
  }
  return c as GeoConfig;
}

export function readConfigFile(path: string, base: GeoConfig): GeoConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new GeoError('config', `${path}: not valid JSON (${(e as Error).message})`);
  }
  return validateConfig(raw, base, path);
}

/** Overrides applied after files: documented GEO_* variables. */
export function envOverrides(env: NodeJS.ProcessEnv, c: GeoConfig): GeoConfig {
  const out = structuredClone(c) as { -readonly [K in keyof GeoConfig]: GeoConfig[K] };
  if (env.GEO_MAX_PAGES !== undefined) {
    const n = Number(env.GEO_MAX_PAGES);
    if (!Number.isInteger(n) || n < 1 || n > 200) throw new GeoError('config', 'GEO_MAX_PAGES must be an integer from 1 to 200');
    out.crawl = { ...out.crawl, maxPages: n };
  }
  if (env.GEO_RENDER !== undefined) {
    if (!['auto', 'always', 'never'].includes(env.GEO_RENDER)) throw new GeoError('config', 'GEO_RENDER must be auto, always or never');
    out.crawl = { ...out.crawl, render: env.GEO_RENDER as RenderMode };
  }
  if (env.GEO_SITE_ORIGIN !== undefined) {
    out.site = validateConfig({ version: 1, site: { origin: env.GEO_SITE_ORIGIN } }, out as GeoConfig, 'GEO_SITE_ORIGIN').site;
  }
  return out as GeoConfig;
}

export interface LoadedConfig {
  readonly config: GeoConfig;
  readonly files: readonly string[];
  readonly hash: string;
}

/** Root config first, then the workspace config in `cwd`, then environment. */
export function loadConfig(cwd: string, repoRoot: string | null, explicit: string | null, env: NodeJS.ProcessEnv): LoadedConfig {
  const files: string[] = [];
  let c = DEFAULT_CONFIG;
  if (explicit) {
    const path = resolve(cwd, explicit);
    if (!existsSync(path)) throw new GeoError('config', `config file not found: ${path}`);
    c = readConfigFile(path, c);
    files.push(path);
  } else {
    const rootFile = repoRoot ? join(repoRoot, CONFIG_FILE) : null;
    const localFile = join(cwd, CONFIG_FILE);
    if (rootFile && existsSync(rootFile) && resolve(dirname(rootFile)) !== resolve(cwd)) {
      c = readConfigFile(rootFile, c);
      files.push(rootFile);
    }
    if (existsSync(localFile)) {
      c = readConfigFile(localFile, c);
      files.push(localFile);
    }
  }
  c = envOverrides(env, c);
  return { config: c, files, hash: `sha256:${sha256(canonicalJson(c)).slice(0, 16)}` };
}

/** The effective configuration for --print-config. It holds no secrets by construction. */
export function printableConfig(c: GeoConfig): string {
  return canonicalJson({ $schema: 'https://moelzanaty3.github.io/geopilot/schema/config/v1.json', ...c });
}
