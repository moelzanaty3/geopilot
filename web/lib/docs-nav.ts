import { RULES } from 'geopilot/catalogue';

export interface DocLink {
  readonly href: string;
  readonly title: string;
}
export interface DocGroup {
  readonly label: string;
  readonly links: readonly DocLink[];
}

export const DOCS_NAV: readonly DocGroup[] = [
  {
    label: 'Start',
    links: [
      { href: '/docs/', title: 'Introduction' },
      { href: '/docs/getting-started/', title: 'Getting started' },
      { href: '/docs/configuration/', title: 'Configuration' },
    ],
  },
  {
    label: 'Concepts',
    links: [
      { href: '/docs/capabilities/', title: 'Capability tiers' },
      { href: '/docs/provenance/', title: 'Provenance' },
      { href: '/docs/scoring/', title: 'Scoring' },
      { href: '/docs/fixes/', title: 'Fixes & verification' },
    ],
  },
  {
    label: 'Reference',
    links: [
      { href: '/docs/cli/', title: 'CLI' },
      { href: '/docs/rules/', title: 'Rules' },
      { href: '/docs/schemas/', title: 'Schemas' },
      { href: '/docs/agent/', title: 'Agent plugins' },
      { href: '/docs/benchmark/', title: 'Benchmark' },
    ],
  },
  {
    label: 'Project',
    links: [
      { href: '/docs/security/', title: 'Security & privacy' },
      { href: '/docs/crawler/', title: 'The geopilot crawler' },
      { href: '/docs/releases/', title: 'Releases' },
      { href: '/docs/decisions/', title: 'Decisions (ADRs)' },
    ],
  },
];

export const RULE_LINKS: readonly DocLink[] = RULES.map((r) => ({ href: `/docs/rules/${r.id.toLowerCase()}/`, title: r.id }));

const FLAT = DOCS_NAV.flatMap((g) => g.links);

export function adjacent(href: string): { prev: DocLink | null; next: DocLink | null } {
  const i = FLAT.findIndex((l) => l.href === href);
  if (i === -1) return { prev: null, next: null };
  return { prev: FLAT[i - 1] ?? null, next: FLAT[i + 1] ?? null };
}
