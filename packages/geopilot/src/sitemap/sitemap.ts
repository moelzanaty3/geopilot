import { gunzipSync } from 'node:zlib';
import { decodeEntities } from '../html/parse.ts';

export interface ParsedSitemap {
  readonly kind: 'urlset' | 'sitemapindex' | 'invalid';
  readonly locs: readonly string[];
  readonly errors: readonly string[];
}

export const SITEMAP_MAX_URLS = 50_000;
export const SITEMAP_MAX_BYTES = 50 * 1024 * 1024;

/** Gzip-wrapped sitemaps are inflated with the same 50 MiB ceiling as plain ones. */
export function inflateSitemap(body: Buffer): string {
  if (body[0] === 0x1f && body[1] === 0x8b) {
    return gunzipSync(body, { maxOutputLength: SITEMAP_MAX_BYTES }).toString('utf8');
  }
  return body.toString('utf8');
}

export function parseSitemap(xml: string): ParsedSitemap {
  const errors: string[] = [];
  const text = xml.replace(/^﻿/, '').replace(/<!--[\s\S]*?-->/g, '');
  const root = /<\s*(urlset|sitemapindex)\b[^>]*>/i.exec(text);
  if (!root) return { kind: 'invalid', locs: [], errors: ['no <urlset> or <sitemapindex> root element'] };
  const kind = root[1]!.toLowerCase() as 'urlset' | 'sitemapindex';
  if (!new RegExp(`</\\s*${kind}\\s*>`, 'i').test(text)) errors.push(`<${kind}> is not closed`);
  const entry = kind === 'urlset' ? 'url' : 'sitemap';
  const locs: string[] = [];
  const re = new RegExp(`<\\s*${entry}\\b[^>]*>([\\s\\S]*?)<\\s*/\\s*${entry}\\s*>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const loc = /<\s*loc\s*>([\s\S]*?)<\s*\/\s*loc\s*>/i.exec(m[1]!);
    if (!loc) {
      errors.push(`<${entry}> without <loc>`);
      continue;
    }
    const value = decodeEntities(loc[1]!.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim());
    try {
      const u = new URL(value);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('scheme');
      locs.push(u.href);
    } catch {
      errors.push(`<loc> is not an absolute http(s) URL: ${value.slice(0, 120)}`);
    }
  }
  if (locs.length > SITEMAP_MAX_URLS) errors.push(`more than ${SITEMAP_MAX_URLS} entries`);
  if (locs.length === 0 && errors.length === 0) errors.push(`<${kind}> has no entries`);
  return { kind, locs, errors };
}
