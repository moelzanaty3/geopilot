import { DocsPage } from '@/components/docs-page';

export const metadata = { title: 'Capability tiers' };

const MATRIX: [string, string, string, string, string][] = [
  ['Next.js App Router', 'T0', 'T1 + agent', 'T2 (this release)', 'T3, closed list'],
  ['Static HTML', 'T0', 'T1 + agent', 'T2 (this release)', 'T3: S1, S2, G1'],
  ['Next.js Pages Router', 'T0', 'T1 + agent', 'Not in 1.0', 'None'],
  ['React + Vite / SPA', 'T0; renderer recommended', 'T1 + agent', 'Not in 1.0', 'None'],
  ['Vue / Nuxt', 'T0', 'T1 + agent', 'Post-1.0 candidate', 'None in 1.0'],
  ['Angular', 'T0', 'T1 + agent', 'Post-1.0 candidate', 'None in 1.0'],
  ['Svelte / SvelteKit', 'T0', 'T1 + agent', 'Post-1.0 candidate', 'None in 1.0'],
  ['Astro', 'T0', 'T1 + agent', 'First post-1.0 candidate', 'None in 1.0'],
  ['Remix / React Router', 'T0', 'T1 + agent', 'Post-1.0 candidate', 'None in 1.0'],
  ['Gatsby / Eleventy / Hugo / Jekyll', 'T0', 'T1 + agent', 'Post-1.0 candidate', 'None in 1.0'],
  ['WordPress / Drupal / Shopify / Webflow / Wix', 'T0, where reachable', 'Agent, if source is available', 'Not in 1.0', 'None'],
  ['Other server-rendered stacks', 'T0', 'T1 + agent', 'Not in 1.0', 'None'],
];

export default function Page() {
  return (
    <DocsPage href="/docs/capabilities/" crumb="Capability tiers" title="Capability tiers" intro="Every website gets a URL audit. Source mapping and automatic fixes are capability-gated, and every output names the tier that applied.">
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Tier</th><th>Capability</th><th>Allowed claims</th></tr>
          </thead>
          <tbody>
            <tr><td>T0</td><td>HTTP, redirects, robots, sitemaps, metadata, structured data, server HTML, internal links</td><td>Observed URL findings; no repository provenance or patches</td></tr>
            <tr><td>T1</td><td>Non-executing repository inventory, framework hints, candidate files</td><td><code>candidate</code>/<code>unmapped</code> only; no automatic patch</td></tr>
            <tr><td>T2</td><td>Framework-aware route and metadata resolution</td><td>File and line only when the evidence meets the provenance bar</td></tr>
            <tr><td>T3</td><td>Closed-list patches with approval, snapshots, rollback and verification</td><td>Only listed fixes, only when every precondition holds</td></tr>
            <tr><td>Agent</td><td>Contextual investigation using T0/T1/T2 evidence</td><td>Agent judgement, never engine provenance or score</td></tr>
          </tbody>
        </table>
      </div>
      <h2>Platform matrix</h2>
      <p>This is a capability roadmap, not a claim that every integration has been tested. Detection is a hint about where source lives; it is never proof of how runtime output is produced.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Platform</th><th>URL audit</th><th>Repo / agent</th><th>Source provenance</th><th>Patches</th></tr>
          </thead>
          <tbody>
            {MATRIX.map((r) => (
              <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Framework detection</h2>
      <p>Detection reads <code>package.json</code>, lockfile names, configuration files and directory shapes <em>as text</em>. It never runs repository scripts or configuration. It reports <code>detected</code>, <code>suspected</code> or <code>unknown</code> with its evidence; conflicting signals produce <code>suspected</code> or <code>unknown</code>.</p>
    </DocsPage>
  );
}
