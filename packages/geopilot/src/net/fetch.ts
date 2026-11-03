import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import zlib from 'node:zlib';
import { USER_AGENT } from '../core/version.ts';
import { bareHost, classifyAddress, type AddressClass } from './address.ts';

export const LIMITS = {
  connectMs: 5_000,
  requestMs: 10_000,
  maxRedirects: 5,
  html: 5 * 1024 * 1024,
  robots: 500 * 1024,
  sitemap: 50 * 1024 * 1024,
  json: 1024 * 1024,
} as const;

export type BodyKind = 'html' | 'robots' | 'sitemap' | 'json';

export interface NetPolicy {
  /**
   * Hostnames the user named explicitly. Only these may resolve to a
   * non-public address, and only when the request was made to that host
   * directly — never after a redirect from a different host.
   */
  readonly explicitHosts: ReadonlySet<string>;
  readonly lookup?: (host: string) => Promise<readonly LookupAddress[]>;
}

export interface Redirect {
  readonly url: string;
  readonly status: number;
  readonly location: string;
}

export type FetchErrorCode =
  | 'blocked_address'
  | 'dns_failure'
  | 'connect_timeout'
  | 'request_timeout'
  | 'too_many_redirects'
  | 'body_too_large'
  | 'unsupported_protocol'
  | 'network_error'
  | 'decode_error';

export interface FetchResult {
  readonly url: string;
  readonly finalUrl: string;
  readonly status: number | null;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly bytes: number;
  readonly redirects: readonly Redirect[];
  readonly error: { readonly code: FetchErrorCode; readonly message: string } | null;
  readonly address: string | null;
}

class NetError extends Error {
  readonly code: FetchErrorCode;
  constructor(code: FetchErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

// Response headers kept on the result. Set-Cookie and anything carrying
// credentials are dropped on purpose (spec 14: never store cookies).
const KEPT_HEADERS = [
  'content-type',
  'content-length',
  'content-encoding',
  'location',
  'x-robots-tag',
  'link',
  'cache-control',
  'last-modified',
  'etag',
  'vary',
];

const defaultLookup = (host: string): Promise<readonly LookupAddress[]> =>
  new Promise((resolve, reject) => {
    dnsLookup(host, { all: true, verbatim: true }, (err, addresses) => {
      if (err) reject(new NetError('dns_failure', `${host}: ${err.code ?? err.message}`));
      else resolve(addresses);
    });
  });

function allowed(cls: AddressClass, host: string, policy: NetPolicy, redirectedFromOtherHost: boolean): boolean {
  if (cls === 'public') return true;
  if (cls === 'multicast' || cls === 'unspecified' || cls === 'reserved') return false;
  return policy.explicitHosts.has(host) && !redirectedFromOtherHost;
}

/**
 * Resolve, validate every address, and hand the socket only an address that
 * passed. The socket connects to exactly what was checked, so a DNS answer
 * that changes between check and connect (rebinding) cannot slip through.
 */
async function resolveChecked(
  host: string,
  policy: NetPolicy,
  redirectedFromOtherHost: boolean,
): Promise<LookupAddress[]> {
  const bare = bareHost(host);
  if (isIP(bare) !== 0) {
    const cls = classifyAddress(bare);
    if (!allowed(cls, host, policy, redirectedFromOtherHost)) {
      throw new NetError('blocked_address', `${bare} is a ${cls} address and was not explicitly named`);
    }
    return [{ address: bare, family: isIP(bare) }];
  }
  const addresses = await (policy.lookup ?? defaultLookup)(bare);
  if (addresses.length === 0) throw new NetError('dns_failure', `${bare}: no addresses`);
  for (const a of addresses) {
    const cls = classifyAddress(a.address);
    if (!allowed(cls, host, policy, redirectedFromOtherHost)) {
      throw new NetError('blocked_address', `${bare} resolves to ${a.address} (${cls}), which was not explicitly named`);
    }
  }
  return [...addresses];
}

function pinnedLookup(addresses: LookupAddress[]): LookupFunction {
  return ((_host: string, options: { all?: boolean } | number, callback?: unknown) => {
    const cb = (typeof options === 'function' ? options : callback) as (
      err: Error | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void;
    const wantAll = typeof options === 'object' && options !== null && options.all === true;
    if (wantAll) cb(null, addresses);
    else cb(null, addresses[0]!.address, addresses[0]!.family);
  }) as LookupFunction;
}

interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

function decoder(encoding: string | undefined): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null {
  switch ((encoding ?? '').trim().toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return zlib.createGunzip();
    case 'deflate':
      return zlib.createInflate();
    case 'br':
      return zlib.createBrotliDecompress();
    default:
      return null;
  }
}

function requestOnce(url: URL, addresses: LookupAddress[], limit: number, deadline: number): Promise<RawResponse> {
  return new Promise((resolveOuter, rejectOuter) => {
    // Once a response has started, destroying the request no longer reliably
    // emits 'error' on it, so every abort path settles the promise itself.
    let settled = false;
    const resolve = (v: RawResponse): void => {
      if (!settled) {
        settled = true;
        resolveOuter(v);
      }
    };
    const reject = (e: unknown): void => {
      if (!settled) {
        settled = true;
        rejectOuter(e);
      }
    };
    const abort = (e: NetError): void => {
      reject(e);
      req.destroy(e);
    };
    const mod = url.protocol === 'https:' ? https : http;
    const remaining = Math.max(1, deadline - Date.now());
    const req = mod.request(
      url,
      {
        method: 'GET',
        lookup: pinnedLookup(addresses),
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
          'accept-encoding': 'gzip, deflate, br',
        },
        agent: false,
      },
      (res) => {
        const headers: Record<string, string> = {};
        for (const name of KEPT_HEADERS) {
          const v = res.headers[name];
          if (v !== undefined) headers[name] = Array.isArray(v) ? v.join(', ') : v;
        }
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && headers.location) {
          res.resume();
          resolve({ status, headers, body: Buffer.alloc(0) });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let rawSize = 0;
        const dec = decoder(headers['content-encoding']);
        const sink = dec ?? res;
        const onData = (chunk: Buffer): void => {
          size += chunk.length;
          if (size > limit) {
            abort(new NetError('body_too_large', `decoded body exceeds ${limit} bytes`));
            dec?.destroy();
            return;
          }
          chunks.push(chunk);
        };
        if (dec) {
          res.on('data', (chunk: Buffer) => {
            rawSize += chunk.length;
            if (rawSize > limit) abort(new NetError('body_too_large', `body exceeds ${limit} bytes`));
          });
          res.pipe(dec);
          dec.on('error', () => reject(new NetError('decode_error', 'content-encoding could not be decoded')));
        }
        sink.on('data', onData);
        sink.on('end', () => resolve({ status, headers, body: Buffer.concat(chunks) }));
        res.on('error', (e) => reject(e instanceof NetError ? e : new NetError('network_error', e.message)));
        res.on('aborted', () => reject(new NetError('network_error', 'response aborted')));
      },
    );
    const connectTimer = setTimeout(() => abort(new NetError('connect_timeout', 'connect timed out')), LIMITS.connectMs);
    req.on('socket', (socket) => {
      socket.once(url.protocol === 'https:' ? 'secureConnect' : 'connect', () => clearTimeout(connectTimer));
    });
    req.setTimeout(remaining, () => abort(new NetError('request_timeout', 'request timed out')));
    req.on('error', (e) => {
      clearTimeout(connectTimer);
      reject(e instanceof NetError ? e : new NetError('network_error', (e as NodeJS.ErrnoException).code ?? e.message));
    });
    req.on('close', () => clearTimeout(connectTimer));
    req.end();
  });
}

export async function guardedFetch(target: string, kind: BodyKind, policy: NetPolicy): Promise<FetchResult> {
  const redirects: Redirect[] = [];
  let current: URL;
  try {
    current = new URL(target);
  } catch {
    return failure(target, target, redirects, 'unsupported_protocol', 'not a valid URL', null);
  }
  const originalHost = current.host;
  const deadline = Date.now() + LIMITS.requestMs;
  let address: string | null = null;
  for (let hop = 0; ; hop++) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      return failure(target, current.href, redirects, 'unsupported_protocol', `${current.protocol} is not fetched`, address);
    }
    if (current.username || current.password) {
      return failure(target, current.href, redirects, 'unsupported_protocol', 'URLs with credentials are not fetched', address);
    }
    try {
      const addresses = await resolveChecked(current.hostname, policy, current.host !== originalHost);
      address = addresses[0]!.address;
      const res = await requestOnce(current, addresses, LIMITS[kind], deadline);
      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        if (hop >= LIMITS.maxRedirects) {
          return failure(target, current.href, redirects, 'too_many_redirects', `more than ${LIMITS.maxRedirects} redirects`, address);
        }
        const next = new URL(res.headers.location, current);
        redirects.push({ url: current.href, status: res.status, location: next.href });
        current = next;
        continue;
      }
      return {
        url: target,
        finalUrl: current.href,
        status: res.status,
        headers: res.headers,
        body: res.body.toString('utf8'),
        bytes: res.body.length,
        redirects,
        error: null,
        address,
      };
    } catch (e) {
      const err = e instanceof NetError ? e : new NetError('network_error', (e as Error).message);
      return failure(target, current.href, redirects, err.code, err.message, address);
    }
  }
}

function failure(
  url: string,
  finalUrl: string,
  redirects: Redirect[],
  code: FetchErrorCode,
  message: string,
  address: string | null,
): FetchResult {
  return { url, finalUrl, status: null, headers: {}, body: '', bytes: 0, redirects, error: { code, message }, address };
}

/** Two in flight per host and, for remote hosts, 250 ms between starts (spec 14). */
export class HostScheduler {
  private readonly active = new Map<string, number>();
  private readonly lastStart = new Map<string, number>();
  private readonly waiters = new Map<string, (() => void)[]>();
  private readonly spacing = new Map<string, number>();

  private readonly perHost: number;
  private readonly minSpacingMs: number;

  constructor(perHost = 2, minSpacingMs = 250) {
    this.perHost = perHost;
    this.minSpacingMs = minSpacingMs;
  }

  setCrawlDelay(host: string, seconds: number): void {
    const bounded = Math.min(Math.max(seconds, 0), 2) * 1000;
    this.spacing.set(host, Math.max(this.minSpacingMs, bounded));
  }

  async run<T>(host: string, local: boolean, task: () => Promise<T>): Promise<T> {
    while ((this.active.get(host) ?? 0) >= this.perHost) {
      await new Promise<void>((resolve) => {
        const list = this.waiters.get(host) ?? [];
        list.push(resolve);
        this.waiters.set(host, list);
      });
    }
    this.active.set(host, (this.active.get(host) ?? 0) + 1);
    if (!local) {
      const gap = this.spacing.get(host) ?? this.minSpacingMs;
      const wait = (this.lastStart.get(host) ?? 0) + gap - Date.now();
      this.lastStart.set(host, Math.max(Date.now(), (this.lastStart.get(host) ?? 0) + gap));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    try {
      return await task();
    } finally {
      this.active.set(host, (this.active.get(host) ?? 1) - 1);
      this.waiters.get(host)?.shift()?.();
    }
  }
}
