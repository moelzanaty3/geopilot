import { DocsPage } from '@/components/docs-page';

export const metadata = { title: 'Agent skill' };

export default function Page() {
  return (
    <DocsPage href="/docs/agent/" crumb="Agent skill" title="Agent skill" intro="One canonical skill (skill/geo) that drives the published CLI from your coding agent. It never imports engine code.">
      <pre><code>npx trace-rank agent install --host claude-code{'\n'}npx trace-rank agent status</code></pre>
      <p>The install previews the files it will write under <code>.claude/skills/geo/</code>, asks for approval, and stamps the engine version into the skill. The wrappers (<code>scripts/geo.sh</code>, <code>scripts/geo.ps1</code>) prefer a matching local install and otherwise run that exact npm version — never <code>@latest</code>. A version mismatch stops the workflow.</p>
      <h2>Hosts</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Host</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td>Claude Code</td><td>supported in this release</td></tr>
            <tr><td><code>AGENTS.md</code> section</td><td>provisional; written only with <code>--write-agents-md</code></td></tr>
            <tr><td>GitHub Copilot, Cursor, OpenCode, OpenAI Codex</td><td>not available until their invocation and permission behaviour is tested</td></tr>
          </tbody>
        </table>
      </div>
      <h2>Workflows</h2>
      <ul>
        <li><strong>scan</strong> — run the engine first; present engine findings, agent recommendations and hypotheses as separate sections.</li>
        <li><strong>explain</strong> — rule docs and repository context, never invented outcomes.</li>
        <li><strong>insights</strong> — write <code>.geo/insights.json</code>, then <code>trace-rank insights validate</code>.</li>
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
