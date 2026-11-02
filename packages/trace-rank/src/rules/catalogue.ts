import type { FixClass, RuleId, Severity, SubCheckScope } from '../types.ts';

// The closed 1.0 catalogue (spec 9). IDs are permanent. Each rule lists its
// sub-checks with the scope they can run in, which is what ADR-019's
// "never pass on a partial set of checks" is computed from.

export type EvidenceClass = 'E1' | 'E2' | 'E3' | 'E4';
export type RuleSubjectKind = 'site' | 'routeGroup';

export interface SubCheckSpec {
  readonly id: string;
  readonly scope: SubCheckScope;
  readonly description: string;
}

export interface RuleMeta {
  readonly id: RuleId;
  readonly title: string;
  readonly purpose: string;
  readonly evidenceClass: EvidenceClass;
  readonly weight: 0 | 1 | 2 | 3;
  readonly scored: boolean;
  readonly subject: RuleSubjectKind;
  readonly scope: string;
  readonly severity: Severity;
  readonly fixClass: string;
  readonly fixVariants: readonly string[];
  readonly subChecks: readonly SubCheckSpec[];
  readonly platforms: string;
  readonly preconditions: readonly string[];
  readonly falsePositives: readonly string[];
  readonly remediation: string;
  readonly references: readonly { readonly title: string; readonly url: string; readonly kind: 'platform-policy' | 'standard' | 'guidance' }[];
  readonly lifecycle: 'stable' | 'experimental' | 'informational';
  readonly blockerCap: string | null;
}

export const DOCS_BASE = 'https://moelzanaty3.github.io/trace-rank';
export const ruleDocsUrl = (id: RuleId): string => `${DOCS_BASE}/docs/rules/${id.toLowerCase()}/`;

const RFC9309 = { title: 'RFC 9309: Robots Exclusion Protocol', url: 'https://www.rfc-editor.org/rfc/rfc9309', kind: 'standard' } as const;
const GOOGLE_AI = { title: 'Google: AI features and your website', url: 'https://developers.google.com/search/docs/appearance/ai-features', kind: 'platform-policy' } as const;
const GOOGLE_ROBOTS_META = { title: 'Google: robots meta tag and X-Robots-Tag', url: 'https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag', kind: 'platform-policy' } as const;
const GOOGLE_CANONICAL = { title: 'Google: consolidate duplicate URLs', url: 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls', kind: 'platform-policy' } as const;
const SITEMAPS_ORG = { title: 'sitemaps.org protocol', url: 'https://www.sitemaps.org/protocol.html', kind: 'standard' } as const;
const GOOGLE_SD = { title: 'Google: structured data general guidelines', url: 'https://developers.google.com/search/docs/appearance/structured-data/sd-policies', kind: 'platform-policy' } as const;
const GOOGLE_JS = { title: 'Google: JavaScript SEO basics', url: 'https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics', kind: 'guidance' } as const;
const GOOGLE_LINKS = { title: 'Google: make your links crawlable', url: 'https://developers.google.com/search/docs/crawling-indexing/links-crawlable', kind: 'platform-policy' } as const;
const OPENAI = { title: 'OpenAI crawlers', url: 'https://developers.openai.com/docs/gptbot', kind: 'platform-policy' } as const;
const ANTHROPIC = { title: 'Anthropic crawlers', url: 'https://support.claude.com/en/articles/8896518-anthropic-crawlers', kind: 'platform-policy' } as const;
const PERPLEXITY = { title: 'Perplexity crawlers', url: 'https://docs.perplexity.ai/docs/resources/perplexity-crawlers.md', kind: 'platform-policy' } as const;
const HTML_LANG = { title: 'WHATWG HTML: the lang attribute', url: 'https://html.spec.whatwg.org/multipage/dom.html#the-lang-and-xml:lang-attributes', kind: 'standard' } as const;
const GOOGLE_TITLE = { title: 'Google: influencing title links', url: 'https://developers.google.com/search/docs/appearance/title-link', kind: 'guidance' } as const;
const GOOGLE_SNIPPET = { title: 'Google: control your snippets', url: 'https://developers.google.com/search/docs/appearance/snippet', kind: 'guidance' } as const;
const AXE = { title: 'axe-core rule descriptions', url: 'https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md', kind: 'standard' } as const;
const APPLE_AASA = { title: 'Apple: supporting associated domains', url: 'https://developer.apple.com/documentation/xcode/supporting-associated-domains', kind: 'platform-policy' } as const;
const ANDROID_APPLINKS = { title: 'Android: verify App Links', url: 'https://developer.android.com/training/app-links/verify-android-applinks', kind: 'platform-policy' } as const;
const LLMS_TXT = { title: 'llms.txt proposal', url: 'https://llmstxt.org/', kind: 'guidance' } as const;

export const RULES: readonly RuleMeta[] = [
  {
    id: 'GEO-013',
    title: 'robots.txt is reachable, parseable and within size limits',
    purpose: 'Crawlers treat a robots.txt that answers 5xx or cannot be reached as a complete disallow, so a broken robots.txt blocks a whole site.',
    evidenceClass: 'E1',
    weight: 3,
    scored: true,
    subject: 'site',
    scope: 'URL/repo',
    severity: 'high',
    fixClass: 'contextual',
    fixVariants: [],
    subChecks: [
      { id: 'reachability', scope: 'url', description: '/robots.txt answers 2xx or 4xx, not 5xx or a network error' },
      { id: 'parse_size', scope: 'both', description: 'robots.txt is plain text within 500 KiB' },
    ],
    platforms: 'Any web stack',
    preconditions: [],
    falsePositives: ['A CDN serving a transient 5xx during the scan; re-run to confirm.'],
    remediation: 'Serve robots.txt as text/plain with a 200 (or a 404 if you want no rules). Fix the server error behind a 5xx before anything else.',
    references: [RFC9309],
    lifecycle: 'stable',
    blockerCap: 'robots.txt answered 5xx',
  },
  {
    id: 'GEO-009',
    title: 'Search crawlers have the access your declared policy says they should',
    purpose: 'Compares effective RFC 9309 access for each search crawler with the owner-declared policy. Training crawlers are reported for information only.',
    evidenceClass: 'E1',
    weight: 3,
    scored: true,
    subject: 'site',
    scope: 'URL/repo',
    severity: 'high',
    fixClass: 'guarded (Phase 2)',
    fixVariants: ['G5'],
    subChecks: [{ id: 'search_access', scope: 'both', description: 'every search crawler is allowed (or blocked) on sampled paths as policy.aiSearchCrawlers declares' }],
    platforms: 'Any web stack',
    preconditions: ['policy.aiSearchCrawlers is allow or block; undecided makes the rule not applicable'],
    falsePositives: ['A user-agent group written for a crawler token GEO does not list.'],
    remediation: 'Adjust the user-agent groups in robots.txt so the crawlers your policy allows can reach the paths you want found. Crawler-specific fixes stay manual until the Phase 2 equivalence proof ships.',
    references: [RFC9309, OPENAI, ANTHROPIC, PERPLEXITY, GOOGLE_AI],
    lifecycle: 'stable',
    blockerCap: 'a search crawler is blocked site-wide against declared policy',
  },
  {
    id: 'GEO-014',
    title: 'Sitemap-listed and linked routes are indexable',
    purpose: 'A route you list in a sitemap or link to, but answer with an error, noindex or a robots disallow, sends search engines contradictory signals.',
    evidenceClass: 'E1',
    weight: 3,
    scored: true,
    subject: 'routeGroup',
    scope: 'URL/repo',
    severity: 'high',
    fixClass: 'literal noindex guarded; otherwise contextual',
    fixVariants: ['G1'],
    subChecks: [
      { id: 'http_status', scope: 'url', description: 'sampled URLs answer 200 after redirects' },
      { id: 'meta_noindex', scope: 'both', description: 'no noindex or none in robots metadata' },
      { id: 'header_noindex', scope: 'url', description: 'no noindex in X-Robots-Tag' },
      { id: 'robots_disallow', scope: 'both', description: 'robots.txt does not disallow Googlebot or Bingbot from the route' },
    ],
    platforms: 'Any web stack',
    preconditions: ['Subjects are routes listed in a sitemap or linked from crawled server HTML'],
    falsePositives: ['Intentionally noindexed pages that remain in a sitemap; remove them from the sitemap or suppress with a reason.'],
    remediation: 'Either make the route indexable (remove noindex, fix the status, allow it in robots.txt) or remove it from the sitemap and internal links.',
    references: [GOOGLE_ROBOTS_META, RFC9309, SITEMAPS_ORG],
    lifecycle: 'stable',
    blockerCap: 'every sampled route is noindex',
  },
  {
    id: 'GEO-015',
    title: 'An absolute canonical resolves to an indexable URL on the declared origin',
    purpose: 'A canonical that is relative, points off-origin, or resolves to an error or noindex page makes the preferred URL ambiguous.',
    evidenceClass: 'E2',
    weight: 2,
    scored: true,
    subject: 'routeGroup',
    scope: 'URL/repo',
    severity: 'medium',
    fixClass: 'guarded',
    fixVariants: ['G2'],
    subChecks: [
      { id: 'canonical_present', scope: 'both', description: 'exactly one absolute canonical URL' },
      { id: 'declared_origin', scope: 'both', description: 'the canonical is on site.origin' },
      { id: 'target_indexable', scope: 'url', description: 'the canonical target answers 200 and is not noindex' },
    ],
    platforms: 'Any web stack',
    preconditions: ['site.origin is declared in geo.config.json; GEO never infers it'],
    falsePositives: ['Deliberate cross-domain canonicals for syndicated content.'],
    remediation: 'Emit one absolute canonical per page on your declared origin, pointing at a 200, indexable URL.',
    references: [GOOGLE_CANONICAL],
    lifecycle: 'stable',
    blockerCap: null,
  },
  {
    id: 'GEO-003',
    title: 'Primary content is present in server HTML',
    purpose: 'Compares raw and rendered primary text. Content that only appears after JavaScript runs is at risk for crawlers that do not render.',
    evidenceClass: 'E2',
    weight: 3,
    scored: true,
    subject: 'routeGroup',
    scope: 'URL render; repo inferred',
    severity: 'medium',
    fixClass: 'contextual',
    fixVariants: [],
    subChecks: [{ id: 'server_text_ratio', scope: 'url', description: 'raw/rendered primary-text ratio is at least 0.5 when rendered text is 200+ characters' }],
    platforms: 'Any web stack; needs a renderer',
    preconditions: ['A renderer is available. Without one the rule is not_evaluated, never failed. This release ships no renderer.'],
    falsePositives: ['Pages whose primary content is intentionally interactive.'],
    remediation: 'Render primary content on the server (a Server Component, SSR or static generation) and hydrate interactivity on top.',
    references: [GOOGLE_JS],
    lifecycle: 'stable',
    blockerCap: null,
  },
  {
    id: 'GEO-004',
    title: 'Present JSON-LD parses and meets documented requirements',
    purpose: 'Structured data that does not parse, or lacks the properties its type requires, is ignored. Absence is not a finding.',
    evidenceClass: 'E1',
    weight: 2,
    scored: true,
    subject: 'routeGroup',
    scope: 'URL/repo',
    severity: 'medium',
    fixClass: 'contextual',
    fixVariants: [],
    subChecks: [
      { id: 'parses', scope: 'both', description: 'every application/ld+json block is valid JSON' },
      { id: 'required_properties', scope: 'both', description: 'known types carry their documented required properties' },
    ],
    platforms: 'Any web stack',
    preconditions: ['At least one JSON-LD block is present; otherwise not applicable'],
    falsePositives: ['Types GEO does not model are checked for parsing only.'],
    remediation: 'Fix the JSON syntax, then add the required properties for the declared @type.',
    references: [GOOGLE_SD],
    lifecycle: 'stable',
    blockerCap: null,
  },
  {
    id: 'GEO-011',
    title: 'A valid sitemap is discoverable and its URLs are reachable',
    purpose: 'A sitemap referenced from robots.txt, that parses and lists reachable URLs, is the documented way to tell crawlers what exists.',
    evidenceClass: 'E2',
    weight: 2,
    scored: true,
    subject: 'site',
    scope: 'URL/repo',
    severity: 'medium',
    fixClass: 'safe sitemap line / guarded sitemap generation',
    fixVariants: ['S1', 'G3'],
    subChecks: [
      { id: 'sitemap_valid', scope: 'both', description: 'a sitemap exists and parses as urlset or sitemapindex' },
      { id: 'discoverable', scope: 'both', description: 'robots.txt carries a Sitemap: line' },
      { id: 'listed_accessible', scope: 'url', description: 'sampled listed URLs answer 200' },
    ],
    platforms: 'Any web stack',
    preconditions: [],
    falsePositives: ['Sitemaps submitted only through a search console; GEO cannot see those.'],
    remediation: 'Publish a sitemap, reference it with an absolute Sitemap: line in robots.txt, and keep only reachable URLs in it.',
    references: [SITEMAPS_ORG, RFC9309],
    lifecycle: 'stable',
    blockerCap: null,
  },
  {
    id: 'GEO-012',
    title: 'Title, meta description and html lang are present',
    purpose: 'The document title, description and language are the baseline metadata every consumer of the page reads.',
    evidenceClass: 'E2',
    weight: 2,
    scored: true,
    subject: 'routeGroup',
    scope: 'URL/repo',
    severity: 'medium',
    fixClass: 'safe literal lang / editorial copy',
    fixVariants: ['S2'],
    subChecks: [
      { id: 'title', scope: 'both', description: 'a non-empty <title>' },
      { id: 'description', scope: 'both', description: 'a non-empty meta description' },
      { id: 'lang', scope: 'both', description: 'a non-empty lang on <html>' },
    ],
    platforms: 'Any web stack',
    preconditions: [],
    falsePositives: [],
    remediation: 'Give every route a specific title and description, and set lang on the root <html>.',
    references: [HTML_LANG, GOOGLE_TITLE, GOOGLE_SNIPPET],
    lifecycle: 'stable',
    blockerCap: null,
  },
  {
    id: 'GEO-016',
    title: 'Key routes are reachable through server-rendered links',
    purpose: 'Crawlers discover pages through <a href> links in served HTML. A route reachable only through a sitemap or client-side navigation is weakly connected.',
    evidenceClass: 'E2',
    weight: 2,
    scored: true,
    subject: 'routeGroup',
    scope: 'URL',
    severity: 'medium',
    fixClass: 'contextual',
    fixVariants: [],
    subChecks: [{ id: 'server_link', scope: 'url', description: 'at least one other crawled page links to the route in its raw server HTML' }],
    platforms: 'Any web stack',
    preconditions: ['Evaluated from raw HTML: without a renderer, raw HTML is the server HTML. The entry route is not applicable.'],
    falsePositives: ['Routes linked only from pages outside the crawl budget; raise --max-pages.'],
    remediation: 'Link the route from server-rendered navigation or content with a plain <a href>.',
    references: [GOOGLE_LINKS],
    lifecycle: 'stable',
    blockerCap: null,
  },
  {
    id: 'GEO-017',
    title: 'Snippet restrictions do not conflict with an AI-search inclusion policy',
    purpose: 'nosnippet and max-snippet:0 limit how content can be shown in search features, including AI features. That contradicts a declared policy of allowing AI search.',
    evidenceClass: 'E1',
    weight: 2,
    scored: true,
    subject: 'routeGroup',
    scope: 'URL/repo',
    severity: 'medium',
    fixClass: 'contextual',
    fixVariants: [],
    subChecks: [
      { id: 'snippet_meta', scope: 'both', description: 'no nosnippet or max-snippet:0 in robots metadata' },
      { id: 'snippet_header', scope: 'both', description: 'no nosnippet or max-snippet:0 in X-Robots-Tag (from source: no middleware or headers() that could set it)' },
    ],
    platforms: 'Any web stack',
    preconditions: ['policy.aiSearchCrawlers is allow; otherwise not applicable'],
    falsePositives: ['data-nosnippet on specific elements is not flagged; it is a scoped choice.'],
    remediation: 'Remove page-wide nosnippet / max-snippet:0, or change the declared policy if exclusion is intended.',
    references: [GOOGLE_AI, GOOGLE_SNIPPET, GOOGLE_ROBOTS_META],
    lifecycle: 'stable',
    blockerCap: null,
  },
  {
    id: 'GEO-002',
    title: 'Selected accessibility checks pass on the rendered page',
    purpose: 'A subset of axe-core checks that also affect how machines read a page: image alternatives, document title, link and button names.',
    evidenceClass: 'E2',
    weight: 1,
    scored: true,
    subject: 'routeGroup',
    scope: 'URL render',
    severity: 'low',
    fixClass: 'contextual/editorial',
    fixVariants: [],
    subChecks: [{ id: 'axe_subset', scope: 'url', description: 'image-alt, document-title, link-name, button-name on the rendered page' }],
    platforms: 'Any web stack; needs a renderer',
    preconditions: ['A renderer is available. This release ships no renderer, so the rule is not_evaluated.'],
    falsePositives: [],
    remediation: 'Fix the reported elements; see the axe-core rule pages.',
    references: [AXE],
    lifecycle: 'stable',
    blockerCap: null,
  },
  {
    id: 'GEO-101',
    title: 'Mobile app association files are served correctly',
    purpose: 'apple-app-site-association and assetlinks.json must be served without redirects, as JSON, naming the configured apps.',
    evidenceClass: 'E1',
    weight: 2,
    scored: true,
    subject: 'site',
    scope: 'URL',
    severity: 'medium',
    fixClass: 'guarded (Phase 2)',
    fixVariants: ['G4'],
    subChecks: [
      { id: 'aasa', scope: 'url', description: '/.well-known/apple-app-site-association names the configured appIDs' },
      { id: 'assetlinks', scope: 'url', description: '/.well-known/assetlinks.json names the configured package and fingerprints' },
    ],
    platforms: 'Any web stack',
    preconditions: ['profile is app and appLinks is configured; otherwise not applicable'],
    falsePositives: [],
    remediation: 'Serve the association files at the documented paths with a 200, application/json, and no redirect.',
    references: [APPLE_AASA, ANDROID_APPLINKS],
    lifecycle: 'stable',
    blockerCap: null,
  },
  {
    id: 'GEO-010',
    title: 'llms.txt presence (informational)',
    purpose: 'Reports whether /llms.txt exists. It is an experimental proposal; absence is never a finding and it is never scored.',
    evidenceClass: 'E4',
    weight: 0,
    scored: false,
    subject: 'site',
    scope: 'URL',
    severity: 'info',
    fixClass: 'none',
    fixVariants: [],
    subChecks: [],
    platforms: 'Any web stack',
    preconditions: [],
    falsePositives: [],
    remediation: 'None required.',
    references: [LLMS_TXT],
    lifecycle: 'informational',
    blockerCap: null,
  },
  {
    id: 'GEO-102',
    title: 'App-specific structured data (informational, app profile)',
    purpose: 'Reports SoftwareApplication / MobileApplication JSON-LD when the app profile is enabled. Context-dependent and never scored.',
    evidenceClass: 'E3',
    weight: 0,
    scored: false,
    subject: 'site',
    scope: 'URL',
    severity: 'info',
    fixClass: 'none',
    fixVariants: [],
    subChecks: [],
    platforms: 'Any web stack',
    preconditions: ['profile is app'],
    falsePositives: [],
    remediation: 'None required.',
    references: [GOOGLE_SD],
    lifecycle: 'informational',
    blockerCap: null,
  },
];

export const RETIRED: readonly { readonly id: string; readonly title: string }[] = [
  { id: 'GEO-001', title: 'Q&A format mandate' },
  { id: 'GEO-005', title: 'Word-count requirement' },
  { id: 'GEO-006', title: 'Paragraph-length requirement' },
  { id: 'GEO-007', title: 'FAQ / summary mandate' },
  { id: 'GEO-008', title: 'Numbers / citations mandate' },
];

const BY_ID = new Map(RULES.map((r) => [r.id, r]));

export function ruleMeta(id: RuleId): RuleMeta {
  return BY_ID.get(id)!;
}

export function findRule(id: string): RuleMeta | undefined {
  return BY_ID.get(id.toUpperCase() as RuleId);
}

export const SCORED_RULES = RULES.filter((r) => r.scored);
