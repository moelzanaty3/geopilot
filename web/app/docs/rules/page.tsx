import Link from 'next/link';
import { RETIRED, RULES } from 'geopilot/catalogue';
import { DocsPage } from '@/components/docs-page';

export const metadata = { title: 'Rules' };

export default function Page() {
  return (
    <DocsPage href="/docs/rules/" crumb="Rules" title="Rule catalogue" intro="Closed for 1.0. Evidence classes: E1 documented platform or standard behaviour (scored), E2 supported best practice (scored), E3 context-dependent and E4 experimental (informational only).">
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Rule</th><th>Title</th><th>Class</th><th>Weight</th><th>Scope</th><th>Fixes</th></tr>
          </thead>
          <tbody>
            {RULES.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/docs/rules/${r.id.toLowerCase()}/`}><code>{r.id}</code></Link></td>
                <td>{r.title}</td>
                <td>{r.evidenceClass}</td>
                <td>{r.scored ? r.weight : 'unscored'}</td>
                <td>{r.scope}</td>
                <td>{r.fixClass}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Retired</h2>
      <p>These were content-format mandates without platform evidence. They are not requirements; an agent may still raise grounded content insights.</p>
      <ul>
        {RETIRED.map((r) => (
          <li key={r.id}><code>{r.id}</code> {r.title}</li>
        ))}
      </ul>
    </DocsPage>
  );
}
