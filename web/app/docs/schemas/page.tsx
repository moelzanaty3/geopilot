import { DocsPage } from '@/components/docs-page';

export const metadata = { title: 'Schemas' };

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function Page() {
  const items: [string, string, string][] = [
    ['config/v1.json', 'geo.config.json', 'Configuration. Unknown keys are errors.'],
    ['report/v1.json', 'geo-report/v1', 'Everything the engine emits: tool, run, framework tiers, routes, evaluations, readiness, coverage, confidence, scope, disclaimer.'],
    ['insights/v1.json', 'geo-insights/v1', 'Agent output: recommendations and hypotheses with resolvable evidence.'],
    ['merged/v1.json', 'geo-merged/v1', 'A report and validated insights, kept in separate sections.'],
  ];
  return (
    <DocsPage href="/docs/schemas/" crumb="Schemas" title="Schemas" intro="JSON Schema 2020-12, published with the package (geopilot/schemas/*) and here.">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Schema</th><th>Document</th><th>Describes</th></tr></thead>
          <tbody>
            {items.map(([path, doc, what]) => (
              <tr key={path}><td><a href={`${BASE}/schema/${path}`}><code>/schema/{path}</code></a></td><td><code>{doc}</code></td><td>{what}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Stable output</h2>
      <p>Reports are serialised canonically (sorted keys, stable arrays), so two runs over the same input produce identical bytes except the documented volatile fields: <code>run.id</code>, <code>run.startedAt</code> and <code>run.durationMs</code>.</p>
      <h2>Fingerprints</h2>
      <pre><code>geo1:&lt;ruleId&gt;:&lt;first 12 hex of sha256(ruleId | normalised subject | stable anchor)&gt;</code></pre>
      <p>The anchor is the sub-check (plus, where one sub-check can fire several times, a stable token such as the path or crawler) — never a line number.</p>
      <h2>Evaluation</h2>
      <p><code>status</code> is <code>pass</code>, <code>fail</code>, <code>not_applicable</code>, <code>not_evaluated</code> or <code>error</code>; anything other than pass/fail carries a <code>statusReason</code>. <code>evidenceQuality</code> is <code>direct</code>, <code>partial</code> or <code>inferred</code>. Each evaluation lists its sub-checks with the scope they ran in.</p>
    </DocsPage>
  );
}
