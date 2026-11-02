import { DocsPage } from '@/components/docs-page';

export const metadata = { title: 'Getting started' };

export default function Page() {
  return (
    <DocsPage href="/docs/getting-started/" crumb="Getting started" title="Getting started" intro="One command to the first result. Node 22.18 or newer; nothing to sign up for.">
      <h2>Scan a URL</h2>
      <pre><code>npx trace-rank scan https://www.example.com</code></pre>
      <p>
        GEO fetches <code>/robots.txt</code> first and respects it for its own user agent, reads the sitemap, and crawls same-origin pages through server HTML (25 pages, depth 3 by default). Private and local addresses are only fetched when you name them yourself.
      </p>
      <h2>Scan a repository</h2>
      <pre><code>cd my-next-app{'\n'}npx trace-rank scan .</code></pre>
      <p>
        On a Next.js App Router or static HTML repository, findings carry a source location and a provenance level. Without a URL, rules whose HTTP sub-checks cannot run are <code>not_evaluated</code>, so the display is usually <em>insufficient evidence</em>. That is by design: a repository-only scan finds and traces problems; it does not claim readiness.
      </p>
      <h2>Both: the strongest evidence</h2>
      <pre><code>pnpm next dev --port 3000 &{'\n'}npx trace-rank scan . --url http://127.0.0.1:3000</code></pre>
      <h2>Configure the facts GEO will never guess</h2>
      <pre><code>npx trace-rank init --origin https://www.example.com --language en</code></pre>
      <p>
        <code>init</code> previews <code>geo.config.json</code> and writes it only after you approve. GEO never infers your origin, language, crawler policy or app identifiers; canonical checks and origin-dependent fixes stay unavailable until you declare them.
      </p>
      <h2>Fix</h2>
      <pre><code>npx trace-rank fix                       # dry run: diffs, preconditions, required verification{'\n'}npx trace-rank fix --apply               # safe fixes{'\n'}npx trace-rank fix --apply --approve G1-b75653d6 --serve</code></pre>
      <p>
        Guarded fixes need their own id; <code>--yes</code> never approves one. Fixes that require runtime verification (V4) are reported as <code>applied_unverified</code> (exit 6) unless GEO starts your dev server itself after the write — see <a href="../fixes/">Fixes &amp; verification</a>. Every apply can be undone with <code>trace-rank fix --rollback &lt;runId&gt;</code>.
      </p>
      <h2>Use it from your agent</h2>
      <pre><code>npx trace-rank agent install --host claude-code</code></pre>
      <p>Then ask Claude Code to “run a GEO scan”. The skill drives the same CLI and keeps its own recommendations apart from engine findings.</p>
      <h2>In CI</h2>
      <pre><code>npx trace-rank@0 scan https://preview.example.com --format markdown --output geo.md --fail-on high</code></pre>
      <p>Gates are opt-in: nothing fails unless you pass a threshold. An unreachable target exits 0 with an incomplete assessment unless you add <code>--fail-on-incomplete</code> (exit 4).</p>
    </DocsPage>
  );
}
