import { DocsPage } from '@/components/docs-page';

export const metadata = { title: 'Agent plugins' };

export default function Page() {
  return (
    <DocsPage href="/docs/agent/" crumb="Agent plugins" title="Agent plugins" intro="Install geopilot into the coding agent you already use: five agents and six commands that drive the published CLI. They never import engine code.">
      <h2>Choose an install</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Host</th><th>How it installs</th><th>Commands run as</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td>Claude Code</td><td>Plugin, from the marketplace</td><td><code>/geopilot:scan</code></td><td>Supported</td></tr>
            <tr><td>Claude Code</td><td>Files committed to one repository</td><td>Through the agents and skill</td><td>Supported</td></tr>
            <tr><td>GitHub Copilot CLI</td><td>Plugin, from the marketplace</td><td>Skills and agents from the shared plugin</td><td>Supported</td></tr>
            <tr><td>OpenCode</td><td>Files committed to one repository</td><td><code>/geopilot-scan</code></td><td>Supported</td></tr>
            <tr><td>OpenAI Codex</td><td>Plugin, from the marketplace</td><td><code>$geopilot:scan</code></td><td>Supported</td></tr>
            <tr><td>OpenAI Codex</td><td>Files committed to one repository</td><td><code>$geopilot-scan</code></td><td>Supported</td></tr>
            <tr><td>Hosts that read <code>AGENTS.md</code></td><td>A section in <code>AGENTS.md</code></td><td>None</td><td>Provisional</td></tr>
          </tbody>
        </table>
      </div>
      <p>Use the plugin for yourself, across every repository. Commit the files when the whole team should get the agents from the repository without installing anything.</p>
      <h2>Claude Code</h2>
      <pre><code>/plugin install geopilot --marketplace moelzanaty3/geopilot</code></pre>
      <p>On older versions: <code>/plugin marketplace add moelzanaty3/geopilot</code>, then <code>/plugin install geopilot@geopilot</code>. Commands appear as <code>/geopilot:scan</code>, <code>/geopilot:fix</code>, <code>/geopilot:review</code>, <code>/geopilot:explain</code>, <code>/geopilot:insights</code> and <code>/geopilot:init</code>; agents as <code>geopilot:scanner</code> and so on.</p>
      <p>To commit the agents into one repository instead, so the whole team gets them without installing a plugin:</p>
      <pre><code>npx geopilot agent install --host claude-code</code></pre>
      <h2>GitHub Copilot CLI</h2>
      <pre><code>copilot plugin marketplace add moelzanaty3/geopilot{'\n'}copilot plugin install geopilot@geopilot</code></pre>
      <p>Copilot CLI reads the same plugin directory as Claude Code, so it gets all five agents and the same skills.</p>
      <h2>OpenCode</h2>
      <pre><code>npx geopilot agent install --host opencode</code></pre>
      <p>Writes <code>.opencode/agents/geopilot-*.md</code>, <code>.opencode/commands/geopilot-*.md</code> (run as <code>/geopilot-scan</code> etc.) and <code>.opencode/skills/geo/</code>. Read-only agents get <code>edit: deny</code>; the fixer gets <code>edit: ask</code>.</p>
      <h2>OpenAI Codex</h2>
      <pre><code>codex plugin marketplace add moelzanaty3/geopilot{'\n'}codex plugin add geopilot@geopilot</code></pre>
      <p>Skills run as <code>$geopilot:scan</code>, <code>$geopilot:fix</code> and so on. Codex plugins can&rsquo;t carry custom agents, so each skill includes its agent&rsquo;s instructions.</p>
      <p>To get real subagents, and to share them with your team, install into the repository instead:</p>
      <pre><code>npx geopilot agent install --host codex</code></pre>
      <p>This writes <code>.codex/agents/geopilot-*.toml</code> and <code>.agents/skills/</code>, with skills run as <code>$geopilot-scan</code>.</p>
      <div className="callout warn">Codex loads <code>.codex/agents/</code> only in a project you have trusted, so the agents don&rsquo;t appear until then. Codex also can&rsquo;t give one agent its own sandbox: read-only agents rely on their instructions, so use a read-only session if you need it enforced.</div>
      <p><code>$geopilot:fix</code> and <code>$geopilot:init</code> run only when you name them. Codex won&rsquo;t pick them from a prompt.</p>
      <h2>Anything else</h2>
      <pre><code>npx geopilot agent install --host agents-md --write-agents-md</code></pre>
      <p>Adds a short section to <code>AGENTS.md</code> for hosts that read it.</p>
      <h2>Project installs</h2>
      <p><code>agent install</code> lists every file it will create or update, then asks before writing. Pass <code>--yes</code> to skip the prompt in a script. It changes nothing else: no hooks, CI, lockfiles or other agent configuration.</p>
      <h2>Check your versions</h2>
      <pre><code>npx geopilot agent status</code></pre>
      <p>This prints the engine version, the Claude Code skill version installed in this repository, and the status of every host. A mismatch exits non-zero, and the skill stops until the versions match. Re-run <code>agent install</code> to fix it.</p>
      <h2>The commands</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Command</th><th>Does</th><th>Agent</th><th>Arguments</th></tr></thead>
          <tbody>
            <tr><td><code>scan</code></td><td>Runs a scan of a URL, the repository or both, and reports findings.</td><td><code>scanner</code></td><td><code>[path|url] [--url &lt;local-server&gt;]</code></td></tr>
            <tr><td><code>fix</code></td><td>Previews the closed-list fixes, then applies only what you approve. You start it yourself; a model can&rsquo;t.</td><td><code>fixer</code></td><td><code>[--rule GEO-xxx]</code></td></tr>
            <tr><td><code>review</code></td><td>Reviews a branch or pull request for readiness regressions.</td><td><code>reviewer</code></td><td><code>[base-branch]</code></td></tr>
            <tr><td><code>explain</code></td><td>Explains a rule, or a finding from the last scan.</td><td><code>explainer</code></td><td><code>&lt;GEO-xxx | fingerprint&gt;</code></td></tr>
            <tr><td><code>insights</code></td><td>Investigates unmapped findings and records validated recommendations.</td><td><code>investigator</code></td><td><code>[GEO-xxx]</code></td></tr>
            <tr><td><code>init</code></td><td>Previews and creates <code>geo.config.json</code>. You start it yourself; a model can&rsquo;t.</td><td>None</td><td><code>[--origin https://… --language en]</code></td></tr>
          </tbody>
        </table>
      </div>
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
            <tr><td>Claude Code</td><td>Supported. Plugin and marketplace pass <code>claude plugin validate</code>.</td></tr>
            <tr><td>GitHub Copilot CLI</td><td>Supported. Copilot CLI 1.0.105 installs the plugin from the marketplace with all skills and agents.</td></tr>
            <tr><td>OpenCode</td><td>Supported. OpenCode 1.1.25 loads every agent, command and skill.</td></tr>
            <tr><td>OpenAI Codex</td><td>Supported. Codex CLI 0.166.0 installs the plugin and loads the project skills and agents.</td></tr>
            <tr><td><code>AGENTS.md</code> section</td><td>Provisional fallback</td></tr>
            <tr><td>Cursor</td><td>Not packaged yet</td></tr>
          </tbody>
        </table>
      </div>
      <p>Support means the host&rsquo;s own CLI installs and loads the files at the version shown. Results from a full model session can vary by host.</p>
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
