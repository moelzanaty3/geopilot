import { COMMANDS } from 'geopilot/commands';
import { DocsPage } from '@/components/docs-page';

export const metadata = { title: 'CLI reference' };

const EXITS: [string, string][] = [
  ['0', 'Success, or no gate configured'],
  ['1', 'An explicit gate failed, or an insights file is invalid'],
  ['2', 'Usage error, or a required approval is missing (before any source file is written)'],
  ['3', 'Invalid configuration'],
  ['4', 'Incomplete assessment with --fail-on-incomplete; insights references unchecked'],
  ['5', 'A fix was rolled back (takes precedence over 6)'],
  ['6', 'A fix was applied but did not reach its required verification level'],
  ['70', 'Internal error'],
];

export default function Page() {
  return (
    <DocsPage href="/docs/cli/" crumb="CLI" title="CLI reference" intro="geopilot (alias geo-check). Only the CLI writes to stdout, prompts, or sets the exit code.">
      <h2>Commands</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Command</th><th>Usage</th></tr>
          </thead>
          <tbody>
            {COMMANDS.map((c) => (
              <tr key={c.name}>
                <td>
                  <code>{c.name}</code>
                  {c.phase && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{c.phase}, not in this release</div>}
                </td>
                <td>
                  <div>{c.summary}</div>
                  <code style={{ display: 'inline-block', marginTop: 6, whiteSpace: 'pre-wrap' }}>geopilot {c.usage}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Global flags</h2>
      <p><code>--config</code>, <code>--cwd</code>, <code>--format pretty|json|markdown</code>, <code>--output</code>, <code>--non-interactive</code>, <code>--yes</code>, <code>--quiet</code>, <code>--verbose</code>, <code>--no-color</code>, <code>--no-cache</code>, <code>--print-config</code>. Repeated <code>--format</code>/<code>--output</code> flags are paired in order; only one format may go to stdout.</p>
      <h2>Approvals</h2>
      <ul>
        <li><code>--apply</code> applies safe fixes. Each guarded fix needs an interactive yes or its exact <code>--approve &lt;fixId&gt;</code>.</li>
        <li><code>--yes</code> never approves a guarded fix. Asking for a guarded fix by <code>--rule</code> without approval exits 2 before writing.</li>
        <li>Applying on the default branch needs a prompt or <code>--yes</code>; dirty target files need <code>--allow-dirty</code>.</li>
        <li><code>--serve</code> authorises the configured <code>fix.serve</code> command for this run only.</li>
      </ul>
      <h2>Exit codes</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Code</th><th>Meaning</th></tr>
          </thead>
          <tbody>
            {EXITS.map(([c, m]) => (
              <tr key={c}><td><code>{c}</code></td><td>{m}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>An unreachable target without an incompleteness gate exits 0, but only with <code>assessment: incomplete</code>, readiness null and no “passed” wording.</p>
      <h2>Run cache</h2>
      <p>Runs live in <code>.geo/runs/&lt;runId&gt;</code> inside a repository (with a <code>.geo/.gitignore</code>), otherwise in the OS user cache. Ten runs are kept, plus any run holding fix snapshots. Reports and bounded, redacted DOM snapshots are stored for insight validation; cookies, auth headers and full bodies beyond the cap are not. <code>--no-cache</code> disables persistence, and anything that needs stored evidence then reports it as unavailable.</p>
    </DocsPage>
  );
}
