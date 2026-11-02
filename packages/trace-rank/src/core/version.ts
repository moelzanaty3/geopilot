import { readFileSync } from 'node:fs';

// Resolved relative to this file so it holds for src/ (tests) and dist/ (published).
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  name: string;
  version: string;
};

export const TOOL_NAME = pkg.name;
export const TOOL_VERSION = pkg.version;
export const RULESET_VERSION = '1.0.0';
export const SCORING_VERSION = '1.0.0';
export const USER_AGENT = `trace-rank/${TOOL_VERSION} (+https://moelzanaty3.github.io/trace-rank/docs/crawler)`;
export const DISCLAIMER =
  'Technical readiness only. GEO does not measure or predict citations, rankings, traffic or inclusion in any AI or search product.';
