import type { RuleId } from '../types.ts';

// The closed 1.0 fix list (spec 12.1) and the single source of truth for each
// variant's required verification level. A variant not listed does not exist.

export type Variant = 'S1' | 'S2' | 'G1' | 'G2' | 'G3';
export type VerificationLevel = 'V1' | 'V2' | 'V3' | 'V4';

export interface VariantSpec {
  readonly variant: Variant;
  readonly title: string;
  readonly ruleId: RuleId;
  readonly subCheck: string;
  readonly class: 'safe' | 'guarded';
  readonly required: VerificationLevel;
  readonly why: string;
}

export const VARIANTS: Readonly<Record<Variant, VariantSpec>> = {
  S1: { variant: 'S1', title: 'Add a Sitemap line to the sole literal robots.txt', ruleId: 'GEO-011', subCheck: 'discoverable', class: 'safe', required: 'V2', why: 'The file is served verbatim; the static re-check is conclusive.' },
  S2: { variant: 'S2', title: 'Add the configured lang to the literal root <html>', ruleId: 'GEO-012', subCheck: 'lang', class: 'safe', required: 'V2', why: 'Literal markup with exact provenance.' },
  G1: { variant: 'G1', title: 'Remove a literal noindex from a sitemap-listed route', ruleId: 'GEO-014', subCheck: 'meta_noindex', class: 'guarded', required: 'V4', why: 'Headers or middleware outside the literal can still emit noindex; only the served response proves indexability.' },
  G2: { variant: 'G2', title: 'Add a canonical to a static Next.js route', ruleId: 'GEO-015', subCheck: 'canonical_present', class: 'guarded', required: 'V4', why: 'The rule includes target status and indexability, which are runtime properties.' },
  G3: { variant: 'G3', title: 'Create a static-only app/sitemap.ts', ruleId: 'GEO-011', subCheck: 'sitemap_valid', class: 'guarded', required: 'V4', why: 'Generated output must be served and valid.' },
};

