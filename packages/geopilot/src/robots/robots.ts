// RFC 9309 robots exclusion: parsing, group selection and longest-match
// evaluation. This is the reference evaluator the GEO-009 safety contract
// (spec 12.1) compares before/after transformations against.

export interface RobotsRule {
  readonly allow: boolean;
  readonly pattern: string;
  readonly line: number;
}

export interface RobotsGroup {
  readonly agents: readonly string[];
  readonly rules: readonly RobotsRule[];
  readonly line: number;
  readonly crawlDelay: number | null;
}

export interface ParsedRobots {
  readonly groups: readonly RobotsGroup[];
  readonly sitemaps: readonly { readonly url: string; readonly line: number }[];
  readonly invalidLines: readonly number[];
  readonly truncated: boolean;
}

export const ROBOTS_MAX_BYTES = 500 * 1024;

export function parseRobots(text: string): ParsedRobots {
  const truncated = Buffer.byteLength(text, 'utf8') > ROBOTS_MAX_BYTES;
  const body = truncated ? Buffer.from(text, 'utf8').subarray(0, ROBOTS_MAX_BYTES).toString('utf8') : text;
  const groups: { agents: string[]; rules: RobotsRule[]; line: number; crawlDelay: number | null }[] = [];
  const sitemaps: { url: string; line: number }[] = [];
  const invalidLines: number[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  const lines = body.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    const colon = line.indexOf(':');
    if (colon === -1) {
      invalidLines.push(lineNo);
      return;
    }
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    switch (key) {
      case 'user-agent':
        if (!lastWasAgent || !current) {
          current = { agents: [], rules: [], line: lineNo, crawlDelay: null };
          groups.push(current);
        }
        current.agents.push(value.toLowerCase());
        lastWasAgent = true;
        return;
      case 'allow':
      case 'disallow':
        lastWasAgent = false;
        if (!current) {
          invalidLines.push(lineNo);
          return;
        }
        // An empty Disallow matches nothing; it is not a rule.
        if (value === '' && key === 'disallow') return;
        current.rules.push({ allow: key === 'allow', pattern: value, line: lineNo });
        return;
      case 'crawl-delay': {
        lastWasAgent = false;
        const n = Number(value);
        if (current && Number.isFinite(n)) current.crawlDelay = n;
        return;
      }
      case 'sitemap':
        sitemaps.push({ url: value, line: lineNo });
        return;
      default:
        lastWasAgent = false;
        return;
    }
  });
  return { groups, sitemaps, invalidLines, truncated };
}

/** Normalise percent-encoding so `/a%2fb` and `/a%2Fb` compare equal (RFC 9309 2.2.2). */
function normalisePath(path: string): string {
  return path
    .replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase())
    .replace(/[^\x21-\x7e]/g, (c) => encodeURIComponent(c));
}

function patternMatches(pattern: string, path: string): boolean {
  const p = normalisePath(pattern);
  const anchored = p.endsWith('$');
  const body = anchored ? p.slice(0, -1) : p;
  const parts = body.split('*');
  let pos = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (i === 0) {
      if (!path.startsWith(part)) return false;
      pos = part.length;
      continue;
    }
    if (i === parts.length - 1 && anchored) {
      return path.length - part.length >= pos && path.endsWith(part);
    }
    const found = path.indexOf(part, pos);
    if (found === -1) return false;
    pos = found + part.length;
  }
  return anchored ? pos === path.length : true;
}

/** Product token used for matching: the part before any `/version`. */
export function productToken(agent: string): string {
  return agent.split('/')[0]!.trim().toLowerCase();
}

export function selectGroups(robots: ParsedRobots, token: string): RobotsGroup[] {
  const t = productToken(token);
  const specific = robots.groups.filter((g) => g.agents.some((a) => a === t));
  if (specific.length > 0) return specific;
  return robots.groups.filter((g) => g.agents.includes('*'));
}

export interface AccessDecision {
  readonly allowed: boolean;
  readonly rule: RobotsRule | null;
  readonly group: 'specific' | 'wildcard' | 'none';
}

export function evaluate(robots: ParsedRobots, token: string, pathWithQuery: string): AccessDecision {
  const path = normalisePath(pathWithQuery || '/');
  if (path === '/robots.txt') return { allowed: true, rule: null, group: 'none' };
  const t = productToken(token);
  const groups = selectGroups(robots, t);
  if (groups.length === 0) return { allowed: true, rule: null, group: 'none' };
  const kind: AccessDecision['group'] = groups.some((g) => g.agents.includes(t)) ? 'specific' : 'wildcard';
  let best: RobotsRule | null = null;
  let bestLen = -1;
  for (const group of groups) {
    for (const rule of group.rules) {
      if (!patternMatches(rule.pattern, path)) continue;
      const len = normalisePath(rule.pattern).length;
      if (len > bestLen || (len === bestLen && rule.allow && best && !best.allow)) {
        best = rule;
        bestLen = len;
      }
    }
  }
  return { allowed: best ? best.allow : true, rule: best, group: kind };
}

/** True when the crawler is disallowed from the site root by its applicable group. */
export function blocksSite(robots: ParsedRobots, token: string): boolean {
  return !evaluate(robots, token, '/').allowed;
}
