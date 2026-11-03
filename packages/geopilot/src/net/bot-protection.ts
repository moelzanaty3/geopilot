import type { FetchResult } from './fetch.ts';

const REFUSAL_STATUSES = new Set([401, 403, 429]);
const SERVER_BUSY = 503;

// Challenge pages are small, and a body can be 5 MB, so only the start is checked.
const SIGNATURE_WINDOW = 64 * 1024;

const CLOUDFLARE_CHALLENGE = /cdn-cgi\/challenge-platform|cf-chl-/i;

const SIGNATURES: readonly { readonly protection: string; readonly matches: (body: string) => boolean }[] = [
  { protection: 'Cloudflare', matches: (body) => CLOUDFLARE_CHALLENGE.test(body) || /<title>\s*(just a moment|attention required)/i.test(body) },
  { protection: 'Imperva', matches: (body) => /incapsula incident|_incapsula_resource/i.test(body) },
  { protection: 'DataDome', matches: (body) => body.includes('captcha-delivery.com') },
  { protection: 'PerimeterX', matches: (body) => /_pxcaptcha|px-captcha/i.test(body) },
  { protection: 'Sucuri', matches: (body) => /sucuri website firewall/i.test(body) },
  { protection: 'Akamai', matches: (body) => /<title>\s*access denied\s*<\/title>/i.test(body) && body.includes('errors.edgesuite.net') },
];

/** The bot-protection product that answered instead of the site, if one can be identified. */
export function botProtection(result: FetchResult): string | null {
  if (result.status === null) return null;
  const refused = REFUSAL_STATUSES.has(result.status);
  if (!refused && result.status !== SERVER_BUSY) return null;
  if (result.headers['cf-mitigated']?.toLowerCase().includes('challenge')) return 'Cloudflare';
  const body = result.body.slice(0, SIGNATURE_WINDOW);
  // A 503 is a real outage signal and caps readiness, so a word in its page can't explain it away.
  if (!refused) return CLOUDFLARE_CHALLENGE.test(body) ? 'Cloudflare' : null;
  return SIGNATURES.find((s) => s.matches(body))?.protection ?? null;
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
