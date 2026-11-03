// A stand-in for `next dev` in tests: it reads the fixture's source once at
// startup and serves HTML derived from it, so a server started after a write
// reflects the write and one started before it does not. --stale ignores the
// source and always serves the pricing page as noindex.
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const port = Number(arg('--port'));
const root = arg('--root') ?? process.cwd();
const stale = process.argv.includes('--stale');
const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : null);
const layout = read('app/layout.tsx') ?? '';
const lang = /<html[^>]*\blang="([^"]+)"/.exec(layout)?.[1];
const layoutDesc = /description:\s*'([^']+)'/.exec(layout)?.[1];
const snapshot = new Map();
for (const route of ['/', '/about', '/pricing']) {
  const src = read(route === '/' ? 'app/page.tsx' : `app${route}/page.tsx`);
  if (src !== null) snapshot.set(route, src);
}
const robots = read('public/robots.txt');
const sitemapXml = read('public/sitemap.xml');
const sitemapTs = read('app/sitemap.ts');

createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/robots.txt' && robots !== null) return res.writeHead(200, { 'content-type': 'text/plain' }).end(robots);
  if (path === '/sitemap.xml') {
    if (sitemapXml !== null) return res.writeHead(200, { 'content-type': 'application/xml' }).end(sitemapXml);
    if (sitemapTs !== null) {
      const urls = [...sitemapTs.matchAll(/url:\s*'([^']+)'/g)].map((m) => `<url><loc>${m[1]}</loc></url>`).join('');
      return res.writeHead(200, { 'content-type': 'application/xml' }).end(`<urlset>${urls}</urlset>`);
    }
  }
  const src = snapshot.get(path);
  if (src === undefined) return res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  const title = /title:\s*'([^']+)'/.exec(src)?.[1] ?? 'Home';
  const desc = /description:\s*'([^']+)'/.exec(src)?.[1] ?? layoutDesc;
  const canonical = /canonical:\s*'([^']+)'/.exec(src)?.[1];
  const noindex = stale ? path === '/pricing' : /index:\s*false/.test(src);
  const head = [`<title>${title}</title>`, desc ? `<meta name="description" content="${desc}">` : '', noindex ? '<meta name="robots" content="noindex">' : '', canonical ? `<link rel="canonical" href="${canonical}">` : ''].join('');
  res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html${lang ? ` lang="${lang}"` : ''}><head>${head}</head><body><main><a href="/about">About</a><a href="/pricing">Pricing</a></main></body></html>`);
}).listen(port, '127.0.0.1');
