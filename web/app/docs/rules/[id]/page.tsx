import { notFound } from 'next/navigation';
import { RULES, findRule } from 'geopilot/catalogue';
import { VARIANTS } from 'geopilot/variants';
import { DocsPage } from '@/components/docs-page';

export function generateStaticParams() {
  return RULES.map((r) => ({ id: r.id.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = findRule(id);
  return { title: r ? `${r.id}: ${r.title}` : 'Rule' };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = findRule(id);
  if (!r) notFound();
  return (
    <DocsPage href="/docs/rules/" crumb={`Rules / ${r.id}`} title={`${r.id} · ${r.title}`} intro={r.purpose}>
      <dl className="kv">
        <dt>Evidence class</dt><dd>{r.evidenceClass}</dd>
        <dt>Weight</dt><dd>{r.scored ? r.weight : 'unscored (informational)'}</dd>
        <dt>Subject</dt><dd>{r.subject === 'site' ? 'one site subject' : 'each route group'}</dd>
        <dt>Scope</dt><dd>{r.scope}</dd>
        <dt>Default severity</dt><dd>{r.severity}</dd>
        <dt>Lifecycle</dt><dd>{r.lifecycle}</dd>
        <dt>Platforms</dt><dd>{r.platforms}</dd>
        {r.blockerCap && (<><dt>Readiness cap</dt><dd>40, when direct evidence shows {r.blockerCap}</dd></>)}
      </dl>
      {r.subChecks.length > 0 && (
        <>
          <h2>Sub-checks</h2>
          <p>A subject fails if any evaluated sub-check fails, and passes only when every applicable sub-check ran and passed. <code>url</code> sub-checks need a URL; <code>both</code> can also run from source.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Sub-check</th><th>Scope</th><th>Checks that</th></tr></thead>
              <tbody>
                {r.subChecks.map((s) => (
                  <tr key={s.id}><td><code>{s.id}</code></td><td>{s.scope}</td><td>{s.description}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {r.preconditions.length > 0 && (
        <>
          <h2>Preconditions</h2>
          <ul>{r.preconditions.map((p) => <li key={p}>{p}</li>)}</ul>
        </>
      )}
      <h2>Remediation</h2>
      <p>{r.remediation}</p>
      <p><strong>Fix class:</strong> {r.fixClass}</p>
      {r.fixVariants.length > 0 && (
        <ul>
          {r.fixVariants.map((v) => {
            const spec = VARIANTS[v as keyof typeof VARIANTS];
            return <li key={v}><code>{v}</code> {spec ? `${spec.title} — ${spec.class}, requires ${spec.required}` : 'Phase 2, not in this release'}</li>;
          })}
        </ul>
      )}
      {r.falsePositives.length > 0 && (
        <>
          <h2>Known false positives</h2>
          <ul>{r.falsePositives.map((p) => <li key={p}>{p}</li>)}</ul>
        </>
      )}
      <h2>Evidence</h2>
      <p>Platform policies and standards are cited as such; anything else is labelled guidance. These links were carried forward from the specification and should be rechecked before quoting them as current policy.</p>
      <ul>
        {r.references.map((ref) => (
          <li key={ref.url}><a href={ref.url}>{ref.title}</a> <span style={{ color: 'var(--muted)' }}>({ref.kind})</span></li>
        ))}
      </ul>
      <h2>Run it</h2>
      <pre><code>{`npx geopilot explain ${r.id}\nnpx geopilot scan . --rule ${r.id}`}</code></pre>
    </DocsPage>
  );
}
