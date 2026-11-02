export const NAME = 'trace-rank';
export const GITHUB_REPO = 'moelzanaty3/trace-rank';
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;
export const ISSUES_URL = `${GITHUB_URL}/issues`;
export const NPM_PACKAGE = 'trace-rank';
export const NPM_URL = `https://www.npmjs.com/package/${NPM_PACKAGE}`;
export const AUTHOR = 'Mohamed Elzanaty';
export const AUTHOR_URL = 'https://github.com/moelzanaty3';
export const LICENSE_NAME = 'Apache-2.0';
export const DISCLAIMER =
  'Technical readiness only. GEO does not measure or predict citations, rankings, traffic or inclusion in any AI or search product.';
export const BLURB =
  'Find the observable issue, show the evidence, trace its source when reliable, propose the smallest safe change, and report honestly what was verified.';

export type NavLink = { readonly href: string; readonly label: string };
export const NAV_LINKS: readonly NavLink[] = [
  { href: '/docs/', label: 'Docs' },
  { href: '/docs/getting-started/', label: 'Get started' },
  { href: '/docs/rules/', label: 'Rules' },
  { href: '/docs/cli/', label: 'CLI' },
  { href: '/docs/agent/', label: 'Agent skill' },
];
