import { DocsPage } from '@/components/docs-page';

export const metadata = { title: 'Configuration' };

const EXAMPLE = `{
  "$schema": "https://moelzanaty3.github.io/trace-rank/schema/config/v1.json",
  "version": 1,
  "framework": "auto",
  "profile": "web",
  "site": { "origin": "https://www.example.com", "language": "en" },
  "routes": { "include": ["/**"], "exclude": ["/admin/**", "/api/**"] },
  "crawl": { "maxPages": 25, "maxDepth": 3, "render": "auto", "requestTimeoutMs": 10000 },
  "policy": { "aiSearchCrawlers": "allow", "aiTrainingCrawlers": "undecided", "userTriggeredFetchers": "allow" },
  "appLinks": { "ios": null, "android": null },
  "rules": { "GEO-102": "off", "GEO-012": { "severity": "low" } },
  "suppress": [{ "rule": "GEO-014", "routes": ["/legal/**"], "reason": "Intentional noindex", "expires": "2027-06-01" }],
  "fix": {
    "verifyCommands": [["pnpm", "test"]],
    "runtimeTimeoutSeconds": 60,
    "serve": { "command": ["pnpm", "exec", "next", "dev", "--port", "3100"], "url": "http://127.0.0.1:3100", "readyTimeoutSeconds": 120 }
  },
  "thresholds": { "failOn": null, "minReadiness": null, "minCoverage": 80 },
  "hook": { "failOn": null, "timeoutSeconds": 5 },
  "experimental": false
}`;

export default function Page() {
  return (
    <DocsPage href="/docs/configuration/" crumb="Configuration" title="Configuration" intro="geo.config.json: JSON only, JSON Schema 2020-12, unknown keys are errors. No executable configuration.">
      <pre><code>{EXAMPLE}</code></pre>
      <h2>Precedence</h2>
      <p>CLI flags, then documented <code>GEO_*</code> environment variables, then the workspace config (the current directory), then the repository-root config, then defaults. <code>--print-config</code> prints the effective result. Monorepo workspaces are scored independently, never averaged.</p>
      <h2>Things GEO never infers</h2>
      <ul>
        <li><code>site.origin</code> and <code>site.language</code> — canonical checks and the S1/S2/G2/G3 fixes need them.</li>
        <li>Crawler policy. The training-crawler policy defaults to <code>undecided</code>, which produces no allow/block recommendation.</li>
        <li>App identifiers for <code>.well-known</code> files.</li>
        <li><code>fix.serve.command</code> — owner-written, an argv array that is never passed to a shell, with a loopback <code>url</code>. Config alone never authorises running it.</li>
      </ul>
      <h2>Keys</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Key</th><th>Meaning</th></tr>
          </thead>
          <tbody>
            <tr><td><code>framework</code></td><td><code>auto</code>, <code>nextjs-app</code>, <code>static</code> or <code>generic</code>. <code>generic</code> is not an error: it enables T0/T1 and disables unproven T2/T3 operations.</td></tr>
            <tr><td><code>profile</code></td><td><code>web</code> (default) or <code>app</code>, which enables GEO-101 and the GEO-102 observation.</td></tr>
            <tr><td><code>routes</code></td><td>Globs. <code>/**</code> matches everything; <code>/admin/**</code> also matches <code>/admin</code>.</td></tr>
            <tr><td><code>crawl</code></td><td><code>maxPages</code> (default 25 remote, 200 for an explicitly named local target), <code>maxDepth</code>, <code>render</code>.</td></tr>
            <tr><td><code>rules</code></td><td><code>&quot;off&quot;</code> or a severity override per rule id.</td></tr>
            <tr><td><code>suppress</code></td><td>Hide findings with a reason; expired suppressions reactivate with a notice. Suppression never changes readiness.</td></tr>
            <tr><td><code>fix.verifyCommands</code></td><td>V3 commands, argv arrays. Run only with interactive confirmation, an exact <code>--verify-cmd</code>, or <code>GEO_ALLOW_VERIFY_COMMAND=1</code>.</td></tr>
            <tr><td><code>thresholds</code></td><td>Gates used when no flag overrides them. <code>minCoverage</code> drives <code>--fail-on-incomplete</code>.</td></tr>
          </tbody>
        </table>
      </div>
      <h2>Environment</h2>
      <ul>
        <li><code>GEO_MAX_PAGES</code>, <code>GEO_RENDER</code>, <code>GEO_SITE_ORIGIN</code> — configuration overrides.</li>
        <li><code>GEO_ALLOW_VERIFY_COMMAND=1</code>, <code>GEO_ALLOW_SERVE_COMMAND=1</code> — non-interactive authorisation for V3/V4.</li>
        <li><code>GEO_CACHE_DIR</code> — where URL-only runs are cached outside a repository.</li>
        <li><code>NO_COLOR</code>, <code>FORCE_COLOR</code>, <code>CI</code> — output and interactivity.</li>
      </ul>
    </DocsPage>
  );
}
