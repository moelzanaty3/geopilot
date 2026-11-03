import { createHash, randomBytes } from 'node:crypto';

export function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

// Sorted keys, no whitespace variance: two runs over the same input serialise to
// the same bytes, which is what makes reportSha256 and golden files meaningful.
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

export function canonicalJson(value: unknown, indent = 2): string {
  return `${JSON.stringify(canonicalize(value), null, indent)}\n`;
}

export function newRunId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:.]/g, '');
  return `r-${stamp}-${randomBytes(3).toString('hex')}`;
}
