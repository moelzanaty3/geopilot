import { DocsPage } from '@/components/docs-page';

export const metadata = { title: 'Provenance' };

export default function Page() {
  return (
    <DocsPage href="/docs/provenance/" crumb="Provenance" title="Provenance" intro="A claim about the source that determines an observed or expected value — not merely a plausible file. Static analysis never executes repository code.">
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Level</th><th>Meaning</th><th>Automatic patch</th></tr>
          </thead>
          <tbody>
            <tr><td><code>exact</code></td><td>One static literal determines the value; no conflicting metadata, config or middleware source; the rendered value matches when available.</td><td>Closed-list safe/guarded fixes only</td></tr>
            <tr><td><code>file</code></td><td>One file is implicated, but the value is computed, imported, or produced by <code>generateMetadata</code>.</td><td>No; agent contextual change</td></tr>
            <tr><td><code>candidate</code></td><td>Several possible sources, dynamic parameters, middleware uncertainty, or a rendered mismatch.</td><td>No; agent investigation</td></tr>
            <tr><td><code>unmapped</code></td><td>Runtime data, CMS, environment, unsupported framework, or a URL-only scan.</td><td>No</td></tr>
            <tr><td><code>absent</code></td><td>The artifact is missing and the conventional insertion point is proven.</td><td>Closed-list fixes only</td></tr>
          </tbody>
        </table>
      </div>
      <h2>Next.js App Router</h2>
      <ul>
        <li>Routes come from <code>app/</code> or <code>src/app/</code>: route groups are stripped, private folders skipped, dynamic segments marked, parallel and intercepting routes downgraded.</li>
        <li>Metadata is resolved by Next’s shallow per-key precedence: the nearest segment that defines a key wins outright, and a layout’s <code>title.default</code> is the fallback below it.</li>
        <li>Static <code>metadata</code> objects, <code>generateMetadata</code>, <code>robots.*</code>, <code>sitemap.*</code>, <code>middleware.*</code> / <code>proxy.*</code> and <code>next.config.*</code> are read as AST. In-repo imports are followed to depth 5.</li>
        <li>Downgrades to <code>candidate</code>: middleware or proxy present; <code>next.config</code> headers or rewrites (for header-level rules); i18n; dynamic parameters; parallel or intercepting routes; an unsupported Next.js major (supported: 13–16).</li>
        <li>Absence through imported metadata is <code>candidate</code>: the value is missing, but the insertion point is not proven.</li>
      </ul>
      <h2>Static HTML</h2>
      <p>A URL path maps to <code>about.html</code> or <code>about/index.html</code> under the site root. Literal markup can be <code>exact</code>. Anything an inline or external script could rewrite is <code>unmapped</code>.</p>
      <h2>Other frameworks</h2>
      <p>Generic repository mode returns hints and candidate files, never <code>exact</code> just because a conventional path exists. The agent may propose a change, but cannot upgrade the engine’s provenance label, and a passing URL scan afterwards establishes observed behaviour — not which file was responsible.</p>
    </DocsPage>
  );
}
