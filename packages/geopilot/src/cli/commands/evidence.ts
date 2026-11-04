import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXIT, GeoError, usage } from '../../core/errors.ts';
import { canonicalJson } from '../../core/hash.ts';
import { DISCLAIMER } from '../../core/version.ts';
import { defaultFetcher } from '../../collect/crawl.ts';
import { analyzeLogs, loadIpLists, readLines, type CrawlerVerdict, type LogReport } from '../../evidence/logs.ts';
import { cloudflareCrawler, inspectUrl, sampleCitations, ServiceError, type CitationSummary, type CloudflareCrawler, type Http } from '../../evidence/services.ts';
import { CRAWLERS } from '../../robots/crawlers.ts';
import { GLOBAL_FLAGS, parseArgs, type Parsed } from '../args.ts';
import type { Deps } from '../context.ts';

const CITATION_MODEL = 'openai/gpt-5.6-sol';
const MAX_CITATION_RUNS = 20;
const MAX_CLOUDFLARE_HOURS = 24;

const VERDICT_LABELS: Readonly<Record<CrawlerVerdict, string>> = {
  reaching: 'Reaching your site',
  blocked: 'Being blocked',
  unverified: 'Seen, but not verified',
  not_seen: 'Not seen',
};

function wantsJson(p: Parsed): boolean {
  return p.multi.get('format')?.includes('json') ?? false;
}

function tokenFrom(env: NodeJS.ProcessEnv, name: string, command: string): string {
  const token = env[name];
  if (!token) throw usage(`${command} needs ${name} in the environment`, 'Tokens are read only from the environment, so they never appear in your shell history or a report.');
  return token;
}

function httpFrom(deps: Deps): Http {
  return deps.http ?? fetch;
}

async function withServiceErrors<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (e instanceof ServiceError) throw new GeoError('usage', e.message);
    throw e;
  }
}

function statuses(values: Readonly<Record<string, number>>): string {
  const entries = Object.entries(values);
  return entries.length === 0 ? '' : `  ${entries.map(([status, count]) => `${status}×${count}`).join(' ')}`;
}

function renderLogs(report: LogReport, p: Deps['io']['color']): string {
  const out = [`${p.bold('Crawler activity from your logs')}  ${p.dim(`${report.linesRead} lines read, ${report.linesSkipped} unreadable`)}`, ''];
  for (const c of report.crawlers) {
    const label = VERDICT_LABELS[c.verdict];
    const shown = c.verdict === 'blocked' ? p.red(label) : c.verdict === 'reaching' ? p.green(label) : p.dim(label);
    const detail = c.requests === 0 ? '' : `  ${p.dim(`${c.verified} verified, ${c.unmatched} unmatched${c.listAvailable ? '' : ', no address list available'}`)}${statuses(c.statuses)}`;
    out.push(`  ${c.crawler.padEnd(17)} ${p.dim(c.purpose.padEnd(15))} ${shown}${detail}`);
    if (c.blockedPaths.length > 0) out.push(`  ${' '.repeat(33)} ${p.dim(`blocked on ${c.blockedPaths.join(', ')}`)}`);
  }
  if (report.notes.length > 0) out.push('', ...report.notes.map((note) => `  ${p.yellow('note')}  ${note}`));
  out.push('', p.dim(`  Status codes count verified requests only. ${DISCLAIMER}`), '');
  return out.join('\n');
}

export async function logsCommand(argv: readonly string[], deps: Deps): Promise<number> {
  const p = parseArgs(argv, GLOBAL_FLAGS);
  if (p.positionals.length === 0) throw usage('logs needs at least one access log file', 'geopilot logs access.log');
  const files = p.positionals.map((file) => resolve(deps.cwd, file));
  for (const file of files) if (!existsSync(file)) throw usage(`no such log file: ${file}`);
  const lists = await loadIpLists(deps.fetcher ?? defaultFetcher({ explicitHosts: new Set() }));
  const report = await analyzeLogs(readLines(files), lists);
  deps.io.out(wantsJson(p) ? canonicalJson(report) : renderLogs(report, deps.io.color));
  return EXIT.ok;
}

function renderCloudflare(rows: readonly CloudflareCrawler[], hours: number, p: Deps['io']['color']): string {
  const out = [`${p.bold('Crawler requests from Cloudflare')}  ${p.dim(`last ${hours} hours`)}`, ''];
  for (const row of rows) {
    const shown = row.requests === 0 ? p.dim('Not seen') : row.blocked * 2 >= row.requests ? p.red('Mostly blocked') : p.green('Mostly reaching');
    out.push(`  ${row.crawler.padEnd(17)} ${shown}${row.requests === 0 ? '' : `  ${p.dim(`${row.requests} requests`)}${statuses(row.statuses)}`}`);
    if (row.blockedPaths.length > 0) out.push(`  ${' '.repeat(17)} ${p.dim(`blocked on ${row.blockedPaths.join(', ')}`)}`);
  }
  out.push('', `  ${p.yellow('note')}  These match by user agent, which can be spoofed. Use geopilot logs with Logpush data to verify addresses.`, '');
  return out.join('\n');
}

export async function cloudflareCommand(argv: readonly string[], deps: Deps): Promise<number> {
  const p = parseArgs(argv, [...GLOBAL_FLAGS, { name: 'zone', type: 'string' }, { name: 'hours', type: 'string' }]);
  const zone = p.str.get('zone');
  if (!zone) throw usage('cloudflare needs --zone <zone id>');
  const hours = Number(p.str.get('hours') ?? MAX_CLOUDFLARE_HOURS);
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_CLOUDFLARE_HOURS) throw usage(`--hours must be a whole number from 1 to ${MAX_CLOUDFLARE_HOURS}`);
  const token = tokenFrom(deps.env, 'CLOUDFLARE_API_TOKEN', 'cloudflare');
  const until = deps.now?.() ?? new Date();
  const since = new Date(until.getTime() - hours * 3_600_000);
  const rows: CloudflareCrawler[] = [];
  for (const crawler of CRAWLERS) rows.push(await withServiceErrors(() => cloudflareCrawler(httpFrom(deps), token, zone, crawler.token, since, until)));
  deps.io.out(wantsJson(p) ? canonicalJson({ hours, crawlers: rows, matchedBy: 'user_agent' }) : renderCloudflare(rows, hours, deps.io.color));
  return EXIT.ok;
}

export async function inspectCommand(argv: readonly string[], deps: Deps): Promise<number> {
  const p = parseArgs(argv, [...GLOBAL_FLAGS, { name: 'site', type: 'string' }]);
  const url = p.positionals[0];
  const site = p.str.get('site');
  if (!url || !site) throw usage('inspect needs a URL and --site <Search Console property>', 'geopilot inspect https://example.com/pricing --site sc-domain:example.com');
  const token = tokenFrom(deps.env, 'GOOGLE_ACCESS_TOKEN', 'inspect');
  const status = await withServiceErrors(() => inspectUrl(httpFrom(deps), token, url, site));
  if (wantsJson(p)) {
    deps.io.out(canonicalJson(status));
    return EXIT.ok;
  }
  const c = deps.io.color;
  const row = (label: string, value: string | null) => `  ${c.dim(label.padEnd(16))} ${value ?? 'not reported'}`;
  deps.io.out(`${[
    `${c.bold("Google's index status")}  ${url}`,
    '',
    row('Verdict', status.verdict),
    row('Coverage', status.coverageState),
    row('Page fetch', status.pageFetchState),
    row('robots.txt', status.robotsTxtState),
    row('Indexing', status.indexingState),
    row('Last crawl', status.lastCrawlTime),
    row('Google canonical', status.googleCanonical),
    row('Your canonical', status.userCanonical),
    '',
    c.dim("  This is the version in Google's index, not a live test."),
    '',
  ].join('\n')}`);
  return EXIT.ok;
}

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function renderCitations(summary: CitationSummary, model: string, p: Deps['io']['color']): string {
  return [
    `${p.bold('Citation sample')}  ${summary.query}`,
    '',
    `  ${p.dim('Cited in the answer')}   ${summary.cited} of ${summary.runs} runs  ${p.dim(`(95% range ${percent(summary.citedRateLow)}–${percent(summary.citedRateHigh)})`)}`,
    `  ${p.dim('Among its sources')}     ${summary.retrieved} of ${summary.runs} runs`,
    ...(summary.otherDomains.length > 0 ? [`  ${p.dim('Others cited')}          ${summary.otherDomains.join(', ')}`] : []),
    '',
    p.dim(`  One question, one engine (Perplexity Agent API, ${model}), one moment. Answers vary, so this is a sample, not a measure of your overall visibility.`),
    '',
  ].join('\n');
}

export async function citationsCommand(argv: readonly string[], deps: Deps): Promise<number> {
  const p = parseArgs(argv, [...GLOBAL_FLAGS, { name: 'domain', type: 'string' }, { name: 'runs', type: 'string' }, { name: 'model', type: 'string' }]);
  const query = p.positionals.join(' ');
  const domain = p.str.get('domain');
  if (!query || !domain) throw usage('citations needs a question and --domain <your domain>', 'geopilot citations "best sim only deals" --domain example.com --runs 5 --yes');
  const runs = Number(p.str.get('runs') ?? 5);
  if (!Number.isInteger(runs) || runs < 1 || runs > MAX_CITATION_RUNS) throw usage(`--runs must be a whole number from 1 to ${MAX_CITATION_RUNS}`);
  const token = tokenFrom(deps.env, 'PERPLEXITY_API_KEY', 'citations');
  const model = p.str.get('model') ?? CITATION_MODEL;
  const approved = p.bool.has('yes') || (await deps.io.confirm(`Send this question to Perplexity ${runs} time(s)? Each run is billed to your API key.`));
  if (!approved) throw usage('citations makes paid API calls: answer the prompt or pass --yes');
  const summary = await withServiceErrors(() => sampleCitations(httpFrom(deps), token, query, domain, runs, model));
  deps.io.out(wantsJson(p) ? canonicalJson({ ...summary, engine: 'perplexity-agent-api', model }) : renderCitations(summary, model, deps.io.color));
  return EXIT.ok;
}
