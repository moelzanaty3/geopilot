// A tolerant HTML tokenizer: enough of the WHATWG tokenizer to read the head
// and the links of a served document without a dependency. It understands
// comments, doctype, raw-text elements (script, style, textarea, title),
// quoted/unquoted attributes and character references in attribute values and
// text. It does not build a tree; callers ask for elements by name.

export interface Element {
  readonly name: string;
  readonly attrs: ReadonlyMap<string, string>;
  /** Offsets of the start tag in the source, for evidence and patching. */
  readonly start: number;
  readonly end: number;
  /** Text content for raw-text elements (script, style, title, textarea). */
  readonly text?: string;
  readonly inHead: boolean;
  readonly depthInNoscript: boolean;
}

const RAW_TEXT = new Set(['script', 'style', 'title', 'textarea', 'xmp', 'iframe', 'noembed', 'noframes']);
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[ref.toLowerCase()] ?? m;
  });
}

export interface Document {
  readonly source: string;
  readonly elements: readonly Element[];
  /** Visible text outside script/style, whitespace-collapsed. */
  readonly text: string;
}

function parseAttrs(src: string, from: number, to: number): Map<string, string> {
  const attrs = new Map<string, string>();
  const re = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  re.lastIndex = from;
  const body = src.slice(0, to);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const name = m[1]!.toLowerCase();
    if (!attrs.has(name)) attrs.set(name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ''));
  }
  return attrs;
}

/** Index of the `>` closing a tag that starts at `from`, honouring quotes. */
function tagEnd(src: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i]!;
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
  }
  return -1;
}

export function parseHtml(source: string): Document {
  const elements: Element[] = [];
  const text: string[] = [];
  let i = 0;
  let inHead = true;
  let noscript = 0;
  const n = source.length;
  while (i < n) {
    const lt = source.indexOf('<', i);
    if (lt === -1) {
      text.push(source.slice(i));
      break;
    }
    if (lt > i) text.push(source.slice(i, lt));
    if (source.startsWith('<!--', lt)) {
      const close = source.indexOf('-->', lt + 4);
      i = close === -1 ? n : close + 3;
      continue;
    }
    if (source[lt + 1] === '!' || source[lt + 1] === '?') {
      const close = source.indexOf('>', lt);
      i = close === -1 ? n : close + 1;
      continue;
    }
    const closing = source[lt + 1] === '/';
    const nameMatch = /^[a-zA-Z][^\s\/>]*/.exec(source.slice(lt + (closing ? 2 : 1), lt + 64));
    if (!nameMatch) {
      text.push('<');
      i = lt + 1;
      continue;
    }
    const name = nameMatch[0].toLowerCase();
    const end = tagEnd(source, lt);
    if (end === -1) break;
    if (closing) {
      if (name === 'head') inHead = false;
      if (name === 'noscript' && noscript > 0) noscript--;
      i = end + 1;
      continue;
    }
    if (name === 'body') inHead = false;
    const attrs = parseAttrs(source, lt + 1 + name.length, end);
    if (RAW_TEXT.has(name)) {
      const closeRe = new RegExp(`</${name}\\s*>`, 'i');
      const rest = source.slice(end + 1);
      const m = closeRe.exec(rest);
      const inner = m ? rest.slice(0, m.index) : rest;
      elements.push({ name, attrs, start: lt, end: end + 1, text: inner, inHead, depthInNoscript: noscript > 0 });
      if (name === 'title' || name === 'textarea') text.push(` ${inner} `);
      i = m ? end + 1 + m.index + m[0].length : n;
      continue;
    }
    if (name === 'noscript') noscript++;
    // A body-only element implies the head has ended even without </head>.
    if (inHead && !['html', 'head', 'meta', 'link', 'base', 'noscript', 'template'].includes(name)) inHead = false;
    elements.push({ name, attrs, start: lt, end: end + 1, inHead, depthInNoscript: noscript > 0 });
    i = end + 1;
  }
  return {
    source,
    elements,
    text: decodeEntities(text.join(' ')).replace(/\s+/g, ' ').trim(),
  };
}

export function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

export interface HeadFacts {
  readonly lang: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly robots: readonly { readonly name: string; readonly content: string }[];
  readonly canonical: readonly string[];
  readonly jsonLd: readonly { readonly raw: string; readonly offset: number }[];
  readonly links: readonly string[];
  readonly hasMain: boolean;
}

export function headFacts(doc: Document): HeadFacts {
  let lang: string | null = null;
  let title: string | null = null;
  let description: string | null = null;
  const robots: { name: string; content: string }[] = [];
  const canonical: string[] = [];
  const jsonLd: { raw: string; offset: number }[] = [];
  const links: string[] = [];
  let hasMain = false;
  for (const el of doc.elements) {
    switch (el.name) {
      case 'html':
        if (lang === null && el.attrs.has('lang')) lang = el.attrs.get('lang')!.trim();
        break;
      case 'title':
        if (title === null && !el.depthInNoscript) title = decodeEntities(el.text ?? '').replace(/\s+/g, ' ').trim();
        break;
      case 'meta': {
        const name = (el.attrs.get('name') ?? '').toLowerCase();
        const content = el.attrs.get('content') ?? '';
        if (name === 'description' && description === null) description = content.trim();
        if (name === 'robots' || name === 'googlebot' || name === 'bingbot') robots.push({ name, content });
        break;
      }
      case 'link': {
        const rel = (el.attrs.get('rel') ?? '').toLowerCase().split(/\s+/);
        if (rel.includes('canonical') && el.attrs.has('href')) canonical.push(el.attrs.get('href')!.trim());
        break;
      }
      case 'script':
        if ((el.attrs.get('type') ?? '').trim().toLowerCase() === 'application/ld+json') {
          jsonLd.push({ raw: el.text ?? '', offset: el.start });
        }
        break;
      case 'a':
        if (el.attrs.has('href')) links.push(el.attrs.get('href')!.trim());
        break;
      case 'main':
        hasMain = true;
        break;
    }
  }
  return { lang, title, description, robots, canonical, jsonLd, links, hasMain };
}

const DIRECTIVE_PREFIXES = new Set(['max-snippet', 'max-image-preview', 'max-video-preview', 'unavailable_after']);

export interface Directives {
  /** User agent the directives are scoped to, or `*` for all. */
  readonly agent: string;
  readonly values: ReadonlySet<string>;
}

/**
 * Parse one robots meta content or X-Robots-Tag header value. A header may be
 * scoped (`googlebot: noindex`); a leading token followed by a colon is an
 * agent unless it is itself a directive name such as `max-snippet`.
 */
export function parseDirectives(value: string, agent = '*'): Directives {
  let scope = agent;
  let body = value;
  const m = /^\s*([a-z0-9_-]+)\s*:\s*(.*)$/i.exec(value);
  if (m && !DIRECTIVE_PREFIXES.has(m[1]!.toLowerCase())) {
    scope = m[1]!.toLowerCase();
    body = m[2]!;
  }
  const values = new Set<string>();
  for (const part of body.split(',')) {
    const d = part.trim().toLowerCase().replace(/\s*:\s*/, ':');
    if (d) values.add(d);
  }
  return { agent: scope, values };
}

export function blocksIndexing(d: Directives): boolean {
  return d.values.has('noindex') || d.values.has('none');
}

export function restrictsSnippets(d: Directives): boolean {
  return d.values.has('nosnippet') || d.values.has('max-snippet:0');
}
