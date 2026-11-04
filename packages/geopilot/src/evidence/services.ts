// Calls to services that hold evidence a scan can't see. The hosts are constants, so a
// token can't be sent anywhere else, and tokens are never logged or written to a report.

export type Http = (url: string, init: RequestInit) => Promise<Response>;

const CLOUDFLARE_GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';
const URL_INSPECTION = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const PERPLEXITY_AGENT = 'https://api.perplexity.ai/v1/agent';
const REQUEST_LIMIT = 5000;

export class ServiceError extends Error {}

async function postJson(http: Http, url: string, token: string, body: unknown, service: string): Promise<unknown> {
  const response = await http(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new ServiceError(`${service} answered ${response.status}. Check the token and its permissions.`);
  try {
    return await response.json();
  } catch {
    throw new ServiceError(`${service} returned a response that isn't JSON.`);
  }
}

// ---------------------------------------------------------------- Cloudflare

export interface CloudflareCrawler {
  readonly crawler: string;
  readonly requests: number;
  readonly blocked: number;
  readonly statuses: Readonly<Record<string, number>>;
  readonly blockedPaths: readonly string[];
}

const CLOUDFLARE_QUERY = `query CrawlerRequests($zone: String!, $since: Time!, $until: Time!, $agent: String!) {
  viewer {
    zones(filter: { zoneTag: $zone }) {
      httpRequestsAdaptiveGroups(
        filter: { datetime_geq: $since, datetime_leq: $until, requestSource: "eyeball", userAgent_like: $agent }
        limit: ${REQUEST_LIMIT}
        orderBy: [count_DESC]
      ) {
        count
        dimensions { edgeResponseStatus clientRequestPath }
      }
    }
  }
}`;

interface CloudflareGroup {
  readonly count: number;
  readonly dimensions: { readonly edgeResponseStatus: number; readonly clientRequestPath: string };
}

interface CloudflareResponse {
  readonly errors?: readonly { readonly message?: string }[] | null;
  readonly data?: { readonly viewer?: { readonly zones?: readonly { readonly httpRequestsAdaptiveGroups?: readonly CloudflareGroup[] }[] } } | null;
}

export async function cloudflareCrawler(http: Http, token: string, zone: string, crawler: string, since: Date, until: Date): Promise<CloudflareCrawler> {
  const variables = { zone, since: since.toISOString(), until: until.toISOString(), agent: `%${crawler}%` };
  const result = (await postJson(http, CLOUDFLARE_GRAPHQL, token, { query: CLOUDFLARE_QUERY, variables }, 'Cloudflare')) as CloudflareResponse;
  if (result.errors?.length) throw new ServiceError(`Cloudflare rejected the query: ${result.errors[0]?.message ?? 'unknown error'}`);
  const groups = result.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [];
  const statuses: Record<string, number> = {};
  const paths = new Map<string, number>();
  let requests = 0;
  let blocked = 0;
  for (const group of groups) {
    const status = group.dimensions.edgeResponseStatus;
    requests += group.count;
    statuses[status] = (statuses[status] ?? 0) + group.count;
    if ([401, 403, 429, 503].includes(status)) {
      blocked += group.count;
      paths.set(group.dimensions.clientRequestPath, (paths.get(group.dimensions.clientRequestPath) ?? 0) + group.count);
    }
  }
  return { crawler, requests, blocked, statuses, blockedPaths: [...paths].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([path]) => path) };
}

// ---------------------------------------------------------------- Google

export interface IndexStatus {
  readonly url: string;
  readonly verdict: string | null;
  readonly coverageState: string | null;
  readonly robotsTxtState: string | null;
  readonly indexingState: string | null;
  readonly pageFetchState: string | null;
  readonly lastCrawlTime: string | null;
  readonly googleCanonical: string | null;
  readonly userCanonical: string | null;
}

export async function inspectUrl(http: Http, token: string, url: string, site: string): Promise<IndexStatus> {
  const result = (await postJson(http, URL_INSPECTION, token, { inspectionUrl: url, siteUrl: site }, 'Google')) as { inspectionResult?: { indexStatusResult?: Record<string, unknown> } };
  const status = result.inspectionResult?.indexStatusResult ?? {};
  const text = (name: string): string | null => (typeof status[name] === 'string' ? status[name] : null);
  return {
    url,
    verdict: text('verdict'),
    coverageState: text('coverageState'),
    robotsTxtState: text('robotsTxtState'),
    indexingState: text('indexingState'),
    pageFetchState: text('pageFetchState'),
    lastCrawlTime: text('lastCrawlTime'),
    googleCanonical: text('googleCanonical'),
    userCanonical: text('userCanonical'),
  };
}

// ---------------------------------------------------------------- Citations

export interface CitationRun {
  /** The domain was cited in the answer's text. */
  readonly cited: boolean;
  /** The domain was among the sources the engine retrieved, cited or not. */
  readonly retrieved: boolean;
  readonly citedDomains: readonly string[];
}

export interface CitationSummary {
  readonly query: string;
  readonly domain: string;
  readonly runs: number;
  readonly cited: number;
  readonly retrieved: number;
  /** 95% Wilson interval for the citation rate. Answers vary, so one run proves little. */
  readonly citedRateLow: number;
  readonly citedRateHigh: number;
  readonly otherDomains: readonly string[];
}

interface AgentResponse {
  readonly output?: readonly {
    readonly type?: string;
    readonly results?: readonly { readonly id?: number | string; readonly url?: string }[];
    readonly content?: readonly { readonly text?: string; readonly annotations?: readonly { readonly type?: string; readonly url?: string }[] }[];
  }[];
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function matchesDomain(host: string, domain: string): boolean {
  const wanted = domain.toLowerCase().replace(/^www\./, '');
  return host === wanted || host.endsWith(`.${wanted}`);
}

/** Answers cite through [web:id] markers that point at search results, and sometimes annotations. */
export function readCitations(response: AgentResponse, domain: string): CitationRun {
  const output = response.output ?? [];
  const results = output.filter((item) => item.type === 'search_results').flatMap((item) => item.results ?? []);
  const urlById = new Map(results.map((result) => [String(result.id), result.url ?? '']));
  const content = output.filter((item) => item.type === 'message').flatMap((item) => item.content ?? []);
  const citedUrls = new Set<string>();
  for (const part of content) {
    for (const marker of (part.text ?? '').matchAll(/\[web:([^\]\s]+)\]/g)) {
      const url = urlById.get(marker[1]!);
      if (url) citedUrls.add(url);
    }
    for (const note of part.annotations ?? []) if (note.type === 'citation' && note.url) citedUrls.add(note.url);
  }
  const citedHosts = [...citedUrls].map(hostOf).filter((host): host is string => host !== null);
  const retrievedHosts = results.map((result) => hostOf(result.url ?? '')).filter((host): host is string => host !== null);
  return {
    cited: citedHosts.some((host) => matchesDomain(host, domain)),
    retrieved: retrievedHosts.some((host) => matchesDomain(host, domain)),
    citedDomains: [...new Set(citedHosts)],
  };
}

export function wilsonInterval(successes: number, total: number): { readonly low: number; readonly high: number } {
  if (total === 0) return { low: 0, high: 1 };
  const z = 1.96;
  const rate = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = rate + (z * z) / (2 * total);
  const margin = z * Math.sqrt((rate * (1 - rate)) / total + (z * z) / (4 * total * total));
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return { low: clamp((centre - margin) / denominator), high: clamp((centre + margin) / denominator) };
}

export async function sampleCitations(http: Http, token: string, query: string, domain: string, runs: number, model: string): Promise<CitationSummary> {
  const samples: CitationRun[] = [];
  for (let run = 0; run < runs; run++) {
    const response = (await postJson(http, PERPLEXITY_AGENT, token, { model, input: query, tools: [{ type: 'web_search' }] }, 'Perplexity')) as AgentResponse;
    samples.push(readCitations(response, domain));
  }
  const cited = samples.filter((sample) => sample.cited).length;
  const interval = wilsonInterval(cited, runs);
  const others = new Map<string, number>();
  for (const sample of samples) for (const host of sample.citedDomains) if (!matchesDomain(host, domain)) others.set(host, (others.get(host) ?? 0) + 1);
  return {
    query,
    domain,
    runs,
    cited,
    retrieved: samples.filter((sample) => sample.retrieved).length,
    citedRateLow: interval.low,
    citedRateHigh: interval.high,
    otherDomains: [...others].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([host]) => host),
  };
}
