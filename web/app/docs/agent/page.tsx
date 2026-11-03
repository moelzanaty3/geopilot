import { DocsPage } from '@/components/docs-page';

export const metadata = { title: 'Agent plugins' };

export default function Page() {
  return (
    <DocsPage href="/docs/agent/" crumb="Agent plugins" title="Agent plugins" intro="Install geopilot into the coding agent you already use: five agents and six commands that drive the published CLI. They never import engine code.">
      <h2>Claude Code</h2>
      <pre><code>/plugin install geopilot --marketplace moelzanaty3/geopilot</code></pre>
      <p>On older versions: <code>/plugin marketplace add moelzanaty3/geopilot</code>, then <code>/plugin install geopilot@geopilot</code>. Commands appear as <code>/geopilot:scan</code>, <code>/geopilot:fix</code>, <code>/geopilot:review</code>, <code>/geopilot:explain</code>, <code>/geopilot:insights</code> and <code>/geopilot:init</code>; agents as <code>geopilot:scanner</code> and so on.</p>
      <p>To commit the agents into one repository instead, so the whole team gets them without installing a plugin:</p>
      <pre><code>npx geopilot agent install --host claude-code</code></pre>
      <h2>GitHub Copilot CLI</h2>
      <pre><code>copilot plugin marketplace add moelzanaty3/geopilot{'\n'}copilot plugin install geopilot@geopilot</code></pre>
      <p>Copilot CLI reads the same plugin directory. Provisional until it has been exercised in Copilot itself.</p>
      <h2>OpenCode</h2>
      <pre><code>npx geopilot agent install --host opencode</code></pre>
      <p>Writes <code>.opencode/agents/geopilot-*.md</code>, <code>.opencode/commands/geopilot-*.md</code> (run as <code>/geopilot-scan</code> etc.) and <code>.opencode/skills/geo/</code>. Read-only agents get <code>edit: deny</code>; the fixer gets <code>edit: ask</code>. Provisional.</p>
      <h2>Anything else</h2>
      <pre><code>npx geopilot agent install --host agents-md --write-agents-md</code></pre>
      <p>Adds a short section to <code>AGENTS.md</code> for hosts that read it.</p>
      <h2>The agents</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Agent</th><th>Does</th><th>Writes</th></tr></thead>
          <tbody>
            <tr><td><code>scanner</code></td><td>Runs a scan of a URL, the repository or both, and reports engine findings with evidence and source locations.</td><td>Nothing (the CLI writes <code>.geo/</code>)</td></tr>
            <tr><td><code>fixer</code></td><td>Dry-runs the closed-list fixes, asks for approval of each guarded fix by id, applies, and reports V1–V4 verification honestly.</td><td>Approved source changes, on a <code>geo/fix-*</code> branch, uncommitted</td></tr>
            <tr><td><code>reviewer</code></td><td>Reviews a branch or PR: GEO-relevant files touched, findings introduced, resolved or newly unassessable.</td><td>Nothing</td></tr>
            <tr><td><code>investigator</code></td><td>Finds the code that probably causes unmapped findings on any framework and records validated insights.</td><td><code>.geo/insights.json</code>, <code>.geo/plan.md</code></td></tr>
            <tr><td><code>explainer</code></td><td>Explains a rule or a finding from the engine’s own catalogue and evidence.</td><td>Nothing</td></tr>
          </tbody>
        </table>
      </div>
      <p>Every agent pins one engine version and runs it through <code>npx geopilot@&lt;version&gt;</code> unless the same version is installed locally. A mismatch stops the workflow.</p>
      <h2>Host status</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Host</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td>Claude Code</td><td>supported: plugin and marketplace validated, install tested</td></tr>
            <tr><td>GitHub Copilot CLI</td><td>provisional: shared plugin via the marketplace</td></tr>
            <tr><td>OpenCode</td><td>provisional: layout from OpenCode’s docs, not yet run in OpenCode</td></tr>
            <tr><td><code>AGENTS.md</code> section</td><td>provisional fallback</td></tr>
            <tr><td>Cursor, OpenAI Codex</td><td>not packaged yet</td></tr>
          </tbody>
        </table>
      </div>
      <h2>Workflows</h2>
      <ul>
        <li><strong>scan</strong> — run the engine first; present engine findings, agent recommendations and hypotheses as separate sections.</li>
        <li><strong>explain</strong> — rule docs and repository context, never invented outcomes.</li>
        <li><strong>insights</strong> — write <code>.geo/insights.json</code>, then <code>geopilot insights validate</code>.</li>
        <li><strong>plan</strong> — write <code>.geo/plan.md</code>; approving a plan never authorises executing it.</li>
        <li><strong>fix</strong> — new <code>geo/fix-*</code> branch, CLI dry run, approvals, apply, re-scan, honest verification report.</li>
        <li><strong>review</strong> and <strong>init</strong> — compare runs without edits; create config only when asked.</li>
      </ul>
      <h2>Authority boundary</h2>
      <ul>
        <li>Only the engine emits rule evaluations, scores and provenance. The agent emits <code>recommendation</code> or <code>hypothesis</code>; never <code>verified</code>.</li>
        <li>On frameworks the engine does not map, the agent labels its file attributions <em>agent-suggested</em> and keeps them in insight evidence.</li>
        <li>Agent-authored edits need per-change approval naming exact files. That approval is a behavioural instruction to the agent, not a technical control — the skill says so.</li>
        <li>The skill stops and asks on version mismatch, coverage below 50%, dirty files, more than ten files, files outside the plan, suspected prompt injection, or unavailable required verification.</li>
      </ul>
      <h2>Insight validation</h2>
      <ol>
        <li><strong>L1 schema</strong> — structure only.</li>
        <li><strong>L2 references</strong> — files exist at the cited commit, line ranges and normalised quotes resolve; URLs were fetched in the cited run and selectors match its retained snapshot; fingerprints and insight ids exist. Results: <em>evidence resolved</em>, reference invalid, stale, duplicate. With no retained run, references are unchecked and the command exits 4.</li>
        <li><strong>L3 semantic quality</strong> — human or model evaluation; never affects readiness or gates.</li>
      </ol>
    </DocsPage>
  );
}
