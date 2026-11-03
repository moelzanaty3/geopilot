import Link from 'next/link';
import { DocsPage } from '@/components/docs-page';

export const metadata = { title: 'Agent plugins' };

export default function Page() {
  return (
    <DocsPage href="/docs/agent/" crumb="Agent plugins" title="Agent plugins" intro="Install geopilot into the coding agent you already use. It audits your code on any framework, with no package install and no running site, then explains and fixes what it finds.">
      <h2>What you get</h2>
      <p>Run the <code>scan</code> command. The agent reads your code against every rule and gives you a code score with its arithmetic, the fixes to do first, and the file, line and quote behind each problem. Then <code>fix</code> shows each exact change and applies only what you approve, and <code>explain</code> teaches any rule using your own code. If you&rsquo;re new to GEO, run <code>explain</code> with no argument for a guided tour.</p>
      <div className="callout warn">The code score comes from a model reading source, so it isn&rsquo;t a measurement and two scans can differ. Anything only a running site can prove is reported as &ldquo;can&rsquo;t tell&rdquo;. It isn&rsquo;t a ranking and doesn&rsquo;t predict visibility.</div>
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
      <p>Codex won&rsquo;t auto-select the <code>$geopilot:fix</code> and <code>$geopilot:init</code> skills, but a fix request can still reach the fix workflow through the <code>geo</code> skill or the fixer agent. What protects your code is the approval each fix needs, not how the workflow started.</p>
      <h2>Anything else</h2>
      <pre><code>npx geopilot agent install --host agents-md --write-agents-md</code></pre>
      <p>Adds a short section to <code>AGENTS.md</code> for hosts that read it.</p>
      <h2>Project installs</h2>
      <p><code>agent install</code> lists every file it will create or update, then asks before writing. Pass <code>--yes</code> to skip the prompt in a script. It changes nothing else: no hooks, CI, lockfiles or other agent configuration.</p>
      <h2>Check your versions</h2>
      <pre><code>npx geopilot agent status</code></pre>
      <p>This prints the engine version, the Claude Code skill version installed in this repository, and the status of every host. A mismatch exits non-zero. Code audits still work, but re-run <code>agent install</code> so live checks use the matching version.</p>
      <h2>The commands</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Command</th><th>Does</th><th>Agent</th><th>Arguments</th></tr></thead>
          <tbody>
            <tr><td><code>scan</code></td><td>Audits your code against every rule, with a code score and the fixes to do first.</td><td><code>scanner</code></td><td><code>[path|url] [--url &lt;local-server&gt;]</code></td></tr>
            <tr><td><code>fix</code></td><td>Shows each exact change, then applies only what you approve and updates the code score. The model doesn&rsquo;t auto-select this command.</td><td><code>fixer</code></td><td><code>[--rule GEO-xxx]</code></td></tr>
            <tr><td><code>review</code></td><td>Reviews a branch or pull request for readiness regressions.</td><td><code>reviewer</code></td><td><code>[base-branch]</code></td></tr>
            <tr><td><code>explain</code></td><td>Explains GEO, a rule or a finding in plain words. With no argument, gives a guided tour.</td><td><code>explainer</code></td><td><code>&lt;GEO-xxx | fingerprint&gt;</code></td></tr>
            <tr><td><code>insights</code></td><td>Digs into a hard question and writes a step-by-step plan.</td><td><code>investigator</code></td><td><code>[GEO-xxx]</code></td></tr>
            <tr><td><code>init</code></td><td>Previews and creates <code>geo.config.json</code>. The model doesn&rsquo;t auto-select this command.</td><td>None</td><td><code>[--origin https://… --language en]</code></td></tr>
          </tbody>
        </table>
      </div>
      <h2>The agents</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Agent</th><th>Does</th><th>Writes</th></tr></thead>
          <tbody>
            <tr><td><code>scanner</code></td><td>Audits the code against every rule and writes the report.</td><td>Nothing</td></tr>
            <tr><td><code>fixer</code></td><td>Proposes each exact change, applies what you approve, re-checks the rule and updates the score.</td><td>Approved source changes, on a <code>geo/fix-*</code> branch, uncommitted</td></tr>
            <tr><td><code>reviewer</code></td><td>Reads a branch or PR and says what it made worse, better or unknown.</td><td>Nothing</td></tr>
            <tr><td><code>investigator</code></td><td>Traces where a value comes from on any framework and writes a plan.</td><td><code>.geo/insights.json</code>, <code>.geo/plan.md</code></td></tr>
            <tr><td><code>explainer</code></td><td>Teaches GEO and any rule or finding, using your code as the example.</td><td>Nothing</td></tr>
          </tbody>
        </table>
      </div>
      <p>Audits need no CLI. For live checks, every agent pins one engine version and runs it from your PATH or through <code>npx</code> in an empty directory, never from the repository being scanned.</p>
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
      <h2>How results work</h2>
      <p>Every rule gets one result, and none of them are guessed:</p>
      <ul>
        <li><strong>Clear</strong>: the agent read the code that decides this, and it&rsquo;s fine.</li>
        <li><strong>Problem</strong>: the agent can show the file, line and exact quote that cause it.</li>
        <li><strong>Can&rsquo;t tell</strong>: the code doesn&rsquo;t decide this, such as a header set by your CDN. It doesn&rsquo;t count for or against you, but it lowers confidence.</li>
        <li><strong>Not applicable</strong>: the rule doesn&rsquo;t apply to this project.</li>
      </ul>
      <h2>The score</h2>
      <p>Each rule has a weight from the rule catalogue. The score is a range, because a single number would leave the biggest unknowns out. The low end assumes every Can&rsquo;t tell rule is a problem, and the high end assumes every one is clear. A problem on some routes earns a share of its weight, and a blocker the agent can quote caps the score at 40. Confidence is the share of applicable weight that was checked: 80% or more is High, 50–79% is Medium, and below 50% is Low.</p>
      <p>The band comes from the low end: 90–100 Strong, 70–89 Good, 50–69 Needs work and 0–49 At risk. The report shows the arithmetic, so you can check it. The CLI uses the same formula.</p>
      <h2>Live checks</h2>
      <p>Reading code can&rsquo;t prove real status codes, redirects or headers. To measure them, ask the agent for a live check with your site&rsquo;s URL. It runs the pinned CLI and adds a <strong>live score</strong> beside the code score, then calls out any rule where the two disagree. See <Link href="/docs/scoring/">Scoring</Link>.</p>
      <div className="callout warn">If bot protection such as Cloudflare answers instead of your site, the live check reports <strong>blocked</strong> and counts nothing. That doesn&rsquo;t mean your site has a problem, and it doesn&rsquo;t show whether real crawlers get through. To check that, look at your firewall logs for the crawlers you care about.</div>
      <h2>Adding real evidence</h2>
      <p>Four CLI commands settle what neither code nor a blocked scan can. See the <Link href="/docs/cli/">CLI reference</Link>.</p>
      <ul>
        <li><code>geopilot logs</code> checks your access logs against the address lists crawlers publish, so it shows which real crawlers got through and where they were blocked.</li>
        <li><code>geopilot cloudflare</code> shows crawler requests and blocks from Cloudflare. It matches by user agent, which can be spoofed.</li>
        <li><code>geopilot inspect</code> shows Google&rsquo;s index status for a URL.</li>
        <li><code>geopilot citations</code> samples whether Perplexity cites your domain for one question, with a confidence range. It makes paid calls and is a sample, not a measure of your overall visibility.</li>
      </ul>
      <h2>Boundaries</h2>
      <ul>
        <li>Agents never say a result was measured or verified on a live site unless a live check showed it. After a fix, they report &ldquo;confirmed in code, not yet confirmed on a live site&rdquo;.</li>
        <li>Agent edits need approval after you&rsquo;ve seen the exact change. That approval is a behavioural instruction to the agent, not a technical control, and the skill says so.</li>
        <li>Agents stop and ask about files with uncommitted edits, more than ten files, files outside what you approved, or repository content that looks like instructions.</li>
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
