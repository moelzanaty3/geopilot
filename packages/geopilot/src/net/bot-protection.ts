import type { FetchResult } from './fetch.ts';

const BLOCKING_STATUSES = new Set([401, 403, 429, 503]);
const REFUSAL_STATUSES = new Set([401, 403, 429]);

const SIGNATURES: readonly { readonly protection: string; readonly pattern: RegExp }[] = [
  { protection: 'Cloudflare', pattern: /<title>\s*(just a moment|attention required)|cf-chl-|cdn-cgi\/challenge-platform/i },
  { protection: 'Imperva', pattern: /incapsula incident|_incapsula_resource/i },
  { protection: 'DataDome', pattern: /captcha-delivery\.com|datadome/i },
  { protection: 'PerimeterX', pattern: /_pxcaptcha|px-captcha/i },
  { protection: 'Sucuri', pattern: /sucuri website firewall/i },
  { protection: 'Akamai', pattern: /<title>\s*access denied\s*<\/title>[\s\S]*errors\.edgesuite\.net/i },
];

/** The bot-protection product that answered instead of the site, if one can be identified. */
export function botProtection(result: FetchResult): string | null {
  if (result.status === null || !BLOCKING_STATUSES.has(result.status)) return null;
  if (result.headers['cf-mitigated']?.toLowerCase().includes('challenge')) return 'Cloudflare';
  return SIGNATURES.find((s) => s.pattern.test(result.body))?.protection ?? null;
}

export function isRefusal(result: FetchResult): boolean {
  return result.status !== null && REFUSAL_STATUSES.has(result.status);
}

/**
 * A blocked answer says nothing about the site behind it, so it's returned as a
 * failed fetch. Every rule then reports missing evidence, never a pass or a fail.
 */
export function asBlocked(result: FetchResult, protection: string | null): FetchResult {
  const by = protection ?? 'the site or its firewall';
  return { ...result, status: null, body: '', error: { code: 'blocked_by_bot_protection', message: `${by} refused the request with ${result.status}` } };
}
