import { isIP } from 'node:net';

export type AddressClass =
  | 'public'
  | 'loopback'
  | 'private'
  | 'link-local'
  | 'cgnat'
  | 'ula'
  | 'multicast'
  | 'unspecified'
  | 'reserved';

function v4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function inV4(ip: number, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) >>> 0 === (v4ToInt(base) & mask) >>> 0;
}

export function classifyV4(ip: string): AddressClass {
  const n = v4ToInt(ip);
  if (inV4(n, '0.0.0.0', 8)) return 'unspecified';
  if (inV4(n, '127.0.0.0', 8)) return 'loopback';
  if (inV4(n, '10.0.0.0', 8) || inV4(n, '172.16.0.0', 12) || inV4(n, '192.168.0.0', 16)) return 'private';
  if (inV4(n, '169.254.0.0', 16)) return 'link-local';
  if (inV4(n, '100.64.0.0', 10)) return 'cgnat';
  if (inV4(n, '224.0.0.0', 4)) return 'multicast';
  if (
    inV4(n, '240.0.0.0', 4) ||
    inV4(n, '192.0.0.0', 24) ||
    inV4(n, '192.0.2.0', 24) ||
    inV4(n, '198.18.0.0', 15) ||
    inV4(n, '198.51.100.0', 24) ||
    inV4(n, '203.0.113.0', 24)
  ) {
    return 'reserved';
  }
  return 'public';
}

/** Expand any textual IPv6 (including embedded dotted IPv4) to 8 hextets. */
export function expandV6(ip: string): number[] | null {
  let text = ip.toLowerCase();
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (isIP(dotted[1]!) !== 4) return null;
    const n = v4ToInt(dotted[1]!);
    text = `${text.slice(0, -dotted[1]!.length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const all = [...head, ...Array<string>(fill).fill('0'), ...tail];
  if (all.length !== 8) return null;
  const out: number[] = [];
  for (const h of all) {
    if (!/^[0-9a-f]{1,4}$/.test(h)) return null;
    out.push(parseInt(h, 16));
  }
  return out;
}

function embeddedV4(h: number[]): string {
  return `${h[6]! >> 8}.${h[6]! & 0xff}.${h[7]! >> 8}.${h[7]! & 0xff}`;
}

export function classifyV6(ip: string): AddressClass {
  const h = expandV6(ip);
  if (!h) return 'reserved';
  if (h.every((x) => x === 0)) return 'unspecified';
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return 'loopback';
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64
  // (64:ff9b::/96) all reach an IPv4 host, so the IPv4 verdict is the verdict.
  if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) return classifyV4(embeddedV4(h));
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) return classifyV4(embeddedV4(h));
  if (h[0] === 0x2002) return classifyV4(`${h[1]! >> 8}.${h[1]! & 0xff}.${h[2]! >> 8}.${h[2]! & 0xff}`);
  if ((h[0]! & 0xfe00) === 0xfc00) return 'ula';
  if ((h[0]! & 0xffc0) === 0xfe80) return 'link-local';
  if ((h[0]! & 0xff00) === 0xff00) return 'multicast';
  if (h[0] === 0x2001 && h[1] === 0xdb8) return 'reserved';
  return 'public';
}

export function classifyAddress(ip: string): AddressClass {
  const family = isIP(ip);
  if (family === 4) return classifyV4(ip);
  if (family === 6) return classifyV6(ip);
  return 'reserved';
}

export function isPublicAddress(ip: string): boolean {
  return classifyAddress(ip) === 'public';
}

/** URL hostnames keep IPv6 brackets; net APIs want them stripped. */
export function bareHost(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

export function isLoopbackUrl(url: URL): boolean {
  const host = bareHost(url.hostname);
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  return isIP(host) !== 0 && classifyAddress(host) === 'loopback';
}
