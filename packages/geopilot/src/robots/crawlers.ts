// Crawlers grouped by what they are for, not by a blanket "AI bots" label
// (spec 9). Each entry names the documentation its classification rests on.

export type CrawlerPurpose = 'search' | 'training' | 'user_triggered';

export interface Crawler {
  readonly token: string;
  readonly operator: string;
  readonly purpose: CrawlerPurpose;
  readonly honoursRobots: boolean;
  readonly docs: string;
}

export const CRAWLERS: readonly Crawler[] = [
  { token: 'Googlebot', operator: 'Google', purpose: 'search', honoursRobots: true, docs: 'https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers' },
  { token: 'Bingbot', operator: 'Microsoft', purpose: 'search', honoursRobots: true, docs: 'https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0' },
  { token: 'OAI-SearchBot', operator: 'OpenAI', purpose: 'search', honoursRobots: true, docs: 'https://developers.openai.com/docs/gptbot' },
  { token: 'Claude-SearchBot', operator: 'Anthropic', purpose: 'search', honoursRobots: true, docs: 'https://support.claude.com/en/articles/8896518-anthropic-crawlers' },
  { token: 'PerplexityBot', operator: 'Perplexity', purpose: 'search', honoursRobots: true, docs: 'https://docs.perplexity.ai/docs/resources/perplexity-crawlers.md' },
  { token: 'GPTBot', operator: 'OpenAI', purpose: 'training', honoursRobots: true, docs: 'https://developers.openai.com/docs/gptbot' },
  { token: 'ClaudeBot', operator: 'Anthropic', purpose: 'training', honoursRobots: true, docs: 'https://support.claude.com/en/articles/8896518-anthropic-crawlers' },
  { token: 'Google-Extended', operator: 'Google', purpose: 'training', honoursRobots: true, docs: 'https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers' },
  { token: 'CCBot', operator: 'Common Crawl', purpose: 'training', honoursRobots: true, docs: 'https://commoncrawl.org/ccbot' },
  { token: 'ChatGPT-User', operator: 'OpenAI', purpose: 'user_triggered', honoursRobots: false, docs: 'https://developers.openai.com/docs/gptbot' },
  { token: 'Claude-User', operator: 'Anthropic', purpose: 'user_triggered', honoursRobots: true, docs: 'https://support.claude.com/en/articles/8896518-anthropic-crawlers' },
  { token: 'Perplexity-User', operator: 'Perplexity', purpose: 'user_triggered', honoursRobots: false, docs: 'https://docs.perplexity.ai/docs/resources/perplexity-crawlers.md' },
];

export function crawlersFor(purpose: CrawlerPurpose): Crawler[] {
  return CRAWLERS.filter((c) => c.purpose === purpose);
}
