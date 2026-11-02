import { DocsPage } from '@/components/docs-page';
import { NPM_URL, GITHUB_URL } from '@/lib/site';

export const metadata = { title: 'Releases' };

export default function Page() {
  return (
    <DocsPage href="/docs/releases/" crumb="Releases" title="Releases" intro="One semantic version across the package and the skill; independent schema and scoring versions.">
      <h2>How a release happens</h2>
      <ol>
        <li>Every merge to <code>main</code> runs semantic-release from conventional commits: <code>fix:</code> is a patch, <code>feat:</code> a minor, a breaking change a major. Commits scoped <code>web</code>, <code>docs</code> or <code>ci</code> never release.</li>
        <li>The job re-runs typecheck, the full test suite and the build before publishing.</li>
        <li>Publishing uses npm trusted publishing (OIDC) with provenance. There is no long-lived npm token.</li>
        <li>A first-release guard refuses to compute 1.0.0: the release line is anchored at <code>v0.0.0</code>, so the first release is 0.0.1 or 0.1.0.</li>
        <li>A manual workflow publishes canaries to the <code>canary</code> dist-tag, leaving <code>latest</code> untouched.</li>
      </ol>
      <h2>What counts as breaking</h2>
      <p>Scoring formulas, weights and caps; CLI command or flag removals; schema field removals; raising the Node floor. New or promoted rules and additive schema fields are minor; false-positive reductions and docs are patches. Rule changes that alter findings on unchanged inputs are called out in the release notes.</p>
      <h2>Gates by stage</h2>
      <ul>
        <li><strong>0.1.0-alpha</strong>: alpha-scoped tests, benchmarks on three real Next.js apps, and the M1–M3 demonstration.</li>
        <li><strong>1.0.0-beta</strong>: full deterministic suites, a 30-site / 10-repo benchmark, published agent evals, and an external security review with no open high findings.</li>
        <li><strong>1.0.0</strong>: the beta gates plus four weeks with no open high-severity bugs.</li>
      </ul>
      <p><a href={NPM_URL}>npm</a> · <a href={`${GITHUB_URL}/releases`}>GitHub releases</a></p>
    </DocsPage>
  );
}
