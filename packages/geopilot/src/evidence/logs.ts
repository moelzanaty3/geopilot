import { createReadStream } from 'node:fs';
import { BlockList, isIP } from 'node:net';
import { createInterface } from 'node:readline';
import type { Fetcher } from '../collect/crawl.ts';
import { CRAWLERS, type CrawlerPurpose } from '../robots/crawlers.ts';

// Which crawlers really reached a site, judged from its access logs. A user agent is
// only a claim, so a request counts as verified when its address is on the list the
// crawler's operator publishes.

const IP_LISTS: Readonly<Record<string, string>> = {
  Googlebot: 'https://developers.google.com/static/search/apis/ipranges/googlebot.json',
  Bingbot: 'https://www.bing.com/toolbox/bingbot.json',
  'OAI-SearchBot': 'https://openai.com/searchbot.json',
  GPTBot: 'https://openai.com/gptbot.json',
  'ChatGPT-User': 'https://openai.com/chatgpt-user.json',
  ClaudeBot: 'https://claude.com/crawling/bots.json',
  'Claude-User': 'https://claude.com/crawling/bots.json',
  'Claude-SearchBot': 'https://claude.com/crawling/bots.json',
  PerplexityBot: 'https://www.perplexity.ai/perplexitybot.json',
  'Perplexity-User': 'https://www.perplexity.ai/perplexity-user.json',
};

const BLOCKING_STATUSES: ReadonlySet<number> = new Set([401, 403, 429, 503]);
const MAX_LINE_LENGTH = 64 * 1024;
const TOP_PATHS = 5;

export interface LogEntry {
  readonly ip: string;
  readonly path: string;
  readonly status: number;
  readonly userAgent: string;
}

export type CrawlerVerdict = 'reaching' | 'blocked' | 'unverified' | 'not_seen';

export interface CrawlerActivity {
  readonly crawler: string;
  readonly operator: string;
  readonly purpose: CrawlerPurpose;
  readonly verdict: CrawlerVerdict;
  readonly requests: number;
  readonly verified: number;
  /** Claimed this crawler's name from an address that isn't on its operator's list. */
  readonly unmatched: number;
  readonly blocked: number;
  readonly statuses: Readonly<Record<string, number>>;
  readonly blockedPaths: readonly string[];
  readonly listAvailable: boolean;
}

export interface LogReport {
  readonly linesRead: number;
  readonly linesSkipped: number;
  readonly crawlers: readonly CrawlerActivity[];
  readonly notes: readonly string[];
}

const COMBINED = /^(\S+) \S+ \S+ \[[^\]]*\] "(?:[A-Z]+ )?(\S+)[^"]*" (\d{3}) \S+(?: "[^"]*" "([^"]*)")?/;

function withoutQuery(path: string): string {
  return path.split('?')[0]!;
}

function fromJson(line: string): LogEntry | null {
  let row: unknown;
  try {
    row = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof row !== 'object' || row === null) return null;
  const field = (...names: readonly string[]): unknown => names.map((name) => (row as Record<string, unknown>)[name]).find((value) => value !== undefined);
  const ip = field('ClientIP', 'remote_addr', 'client_ip');
  const path = field('ClientRequestURI', 'ClientRequestPath', 'request_uri', 'uri', 'path');
  const status = Number(field('EdgeResponseStatus', 'status'));
  const userAgent = field('ClientRequestUserAgent', 'http_user_agent', 'user_agent');
  if (typeof ip !== 'string' || typeof path !== 'string' || typeof userAgent !== 'string' || !Number.isInteger(status)) return null;
  return { ip, path: withoutQuery(path), status, userAgent };
}

/** Reads the combined log format and JSON lines, including Cloudflare Logpush fields. */
export function parseLogLine(line: string): LogEntry | null {
  if (line.length > MAX_LINE_LENGTH) return null;
  if (line.startsWith('{')) return fromJson(line);
  const match = COMBINED.exec(line);
  if (!match || match[4] === undefined) return null;
  return { ip: match[1]!, path: withoutQuery(match[2]!), status: Number(match[3]), userAgent: match[4] };
}

function crawlerFor(userAgent: string): string | null {
  const lower = userAgent.toLowerCase();
  return CRAWLERS.find((crawler) => lower.includes(crawler.token.toLowerCase()))?.token ?? null;
}

function bareAddress(ip: string): string {
  return ip.toLowerCase().startsWith('::ffff:') ? ip.slice(7) : ip;
}

/** Downloads the published address lists. A list that can't be read is left out, never assumed. */
export async function loadIpLists(fetcher: Fetcher): Promise<Map<string, BlockList>> {
  const lists = new Map<string, BlockList>();
  const byUrl = new Map<string, Promise<BlockList | null>>();
  const load = async (url: string): Promise<BlockList | null> => {
    const result = await fetcher(url, 'json');
    if (result.status !== 200) return null;
    let prefixes: unknown;
    try {
      prefixes = (JSON.parse(result.body) as { prefixes?: unknown }).prefixes;
    } catch {
      return null;
    }
    if (!Array.isArray(prefixes) || prefixes.length === 0) return null;
    const list = new BlockList();
    for (const prefix of prefixes as { ipv4Prefix?: string; ipv6Prefix?: string }[]) {
      const cidr = prefix.ipv4Prefix ?? prefix.ipv6Prefix;
      const [network, bits] = (cidr ?? '').split('/');
      const family = isIP(network ?? '');
      if (family !== 0 && bits !== undefined) list.addSubnet(network!, Number(bits), family === 6 ? 'ipv6' : 'ipv4');
    }
    return list;
  };
  for (const [crawler, url] of Object.entries(IP_LISTS)) {
    if (!byUrl.has(url)) byUrl.set(url, load(url));
    const list = await byUrl.get(url)!;
    if (list) lists.set(crawler, list);
  }
  return lists;
}

function isOnList(list: BlockList, ip: string): boolean {
  const address = bareAddress(ip);
  const family = isIP(address);
  return family !== 0 && list.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

interface Tally {
  requests: number;
  verified: number;
  unmatched: number;
  blocked: number;
  statuses: Map<string, number>;
  blockedPaths: Map<string, number>;
}

function verdictFor(tally: Tally, hasList: boolean): CrawlerVerdict {
  if (tally.requests === 0) return 'not_seen';
  if (!hasList || tally.verified === 0) return 'unverified';
  return tally.blocked * 2 >= tally.verified ? 'blocked' : 'reaching';
}

export async function analyzeLogs(lines: AsyncIterable<string>, lists: ReadonlyMap<string, BlockList>): Promise<LogReport> {
  const tallies = new Map<string, Tally>();
  let linesRead = 0;
  let linesSkipped = 0;
  for await (const line of lines) {
    if (line.trim() === '') continue;
    linesRead++;
    const entry = parseLogLine(line);
    if (!entry) {
      linesSkipped++;
      continue;
    }
    const crawler = crawlerFor(entry.userAgent);
    if (!crawler) continue;
    const tally = tallies.get(crawler) ?? { requests: 0, verified: 0, unmatched: 0, blocked: 0, statuses: new Map(), blockedPaths: new Map() };
    tallies.set(crawler, tally);
    tally.requests++;
    const list = lists.get(crawler);
    if (list && isOnList(list, entry.ip)) {
      tally.verified++;
      const status = String(entry.status);
      tally.statuses.set(status, (tally.statuses.get(status) ?? 0) + 1);
      if (BLOCKING_STATUSES.has(entry.status)) {
        tally.blocked++;
        tally.blockedPaths.set(entry.path, (tally.blockedPaths.get(entry.path) ?? 0) + 1);
      }
    } else if (list) tally.unmatched++;
  }
  const crawlers = CRAWLERS.map((crawler): CrawlerActivity => {
    const tally = tallies.get(crawler.token) ?? { requests: 0, verified: 0, unmatched: 0, blocked: 0, statuses: new Map<string, number>(), blockedPaths: new Map<string, number>() };
    const hasList = lists.has(crawler.token);
    return {
      crawler: crawler.token,
      operator: crawler.operator,
      purpose: crawler.purpose,
      verdict: verdictFor(tally, hasList),
      requests: tally.requests,
      verified: tally.verified,
      unmatched: tally.unmatched,
      blocked: tally.blocked,
      statuses: Object.fromEntries([...tally.statuses].sort()),
      blockedPaths: [...tally.blockedPaths].sort((a, b) => b[1] - a[1]).slice(0, TOP_PATHS).map(([path]) => path),
      listAvailable: hasList,
    };
  });
  const notes: string[] = [];
  const unmatched = crawlers.reduce((total, c) => total + c.unmatched, 0);
  const verified = crawlers.reduce((total, c) => total + c.verified, 0);
  if (unmatched > 0 && verified === 0) notes.push("No crawler requests matched a published address. If these logs sit behind a CDN or proxy, they may record its address instead of the crawler's, so use the CDN's logs or log the real client address.");
  else if (unmatched > 0) notes.push(`${unmatched} request(s) used a crawler's name from an address not on its operator's list. Treat them as impostors or log them through your proxy's real client address.`);
  if (linesRead > 0 && linesSkipped === linesRead) notes.push('No line could be read. geopilot reads the combined log format and JSON lines.');
  return { linesRead, linesSkipped, crawlers, notes };
}

export async function* readLines(files: readonly string[]): AsyncGenerator<string> {
  for (const file of files) {
    const reader = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of reader) yield line;
  }
}
