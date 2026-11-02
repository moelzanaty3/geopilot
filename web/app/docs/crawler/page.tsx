import { DocsPage } from '@/components/docs-page';

export const metadata = { title: 'The trace-rank crawler' };

export default function Page() {
  return (
    <DocsPage href="/docs/crawler/" crumb="Crawler" title="The trace-rank crawler" intro="If you found this page in your logs: someone ran trace-rank against your site.">
      <pre><code>User-Agent: trace-rank/&lt;version&gt; (+https://moelzanaty3.github.io/trace-rank/docs/crawler)</code></pre>
      <ul>
        <li>It is a local command-line tool run by a person, not a hosted service. There is no central crawler.</li>
        <li>It reads <code>/robots.txt</code> first and obeys rules for the product token <code>trace-rank</code> (or <code>*</code>). A 5xx or unreachable robots.txt is treated as a full disallow.</li>
        <li>It fetches at most two requests at a time per host, 250 ms apart, honours <code>Crawl-delay</code> up to 2 seconds, and stops at 25 pages by default.</li>
        <li>It never impersonates another crawler.</li>
        <li>An operator can override robots.txt only for a target they name on the command line, and that override is recorded in their report.</li>
      </ul>
      <p>To opt out, add to your robots.txt:</p>
      <pre><code>User-agent: trace-rank{'\n'}Disallow: /</code></pre>
    </DocsPage>
  );
}
