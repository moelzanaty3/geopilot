// Library entry. The agent skill never imports this; it invokes the CLI.
export { scan, type ScanOptions, type ScanResult } from './scan.ts';
export { loadConfig, validateConfig, DEFAULT_CONFIG, type GeoConfig } from './config/config.ts';
export { RULES, findRule, type RuleMeta } from './rules/catalogue.ts';
export { score } from './scoring/score.ts';
export { compareReports } from './scoring/compare.ts';
export { renderJson, renderMarkdown, renderPretty } from './report/render.ts';
export { parseRobots, evaluate as evaluateRobots } from './robots/robots.ts';
export { VARIANTS } from './fix/plan.ts';
export { run } from './cli/main.ts';
export type * from './types.ts';
