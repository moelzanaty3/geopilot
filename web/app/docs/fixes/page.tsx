import { VARIANTS } from 'geopilot/variants';
import { DocsPage } from '@/components/docs-page';

export const metadata = { title: 'Fixes & verification' };

export default function Page() {
  return (
    <DocsPage href="/docs/fixes/" crumb="Fixes & verification" title="Fixes & verification" intro="A closed list of deterministic patches. Each declares the verification it needs, and the outcome never claims more than was achieved.">
      <h2>Fix classes</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Class</th><th>Meaning</th><th>Who may apply</th></tr>
          </thead>
          <tbody>
            <tr><td><code>safe</code></td><td>Additive, local, deterministic; no owner policy; exact/absent provenance; every precondition holds</td><td><code>fix --apply</code></td></tr>
            <tr><td><code>guarded</code></td><td>Deterministic, but needs owner intent or production context</td><td>Interactive yes, or <code>--approve &lt;fixId&gt;</code></td></tr>
            <tr><td><code>contextual</code></td><td>Needs code or architecture judgement</td><td>The agent, after per-change approval</td></tr>
            <tr><td><code>editorial</code></td><td>Changes visible copy or claims</td><td>A human approves each change</td></tr>
            <tr><td><code>unsupported</code></td><td>Unmapped source, external infrastructure or unsafe conditions</td><td>Nobody automatically</td></tr>
          </tbody>
        </table>
      </div>
      <h2>Variants (single source of truth)</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Variant</th><th>Rule</th><th>Class</th><th>Requires</th><th>Why</th></tr>
          </thead>
          <tbody>
            {Object.values(VARIANTS).map((v) => (
              <tr key={v.variant}>
                <td><code>{v.variant}</code> {v.title}</td>
                <td>{v.ruleId}</td>
                <td>{v.class}</td>
                <td>{v.required}</td>
                <td style={{ color: 'var(--muted)' }}>{v.why}</td>
              </tr>
            ))}
            <tr><td><code>G4</code> .well-known app-link files</td><td>GEO-101</td><td>guarded</td><td>V4</td><td style={{ color: 'var(--muted)' }}>Phase 2: not in this release.</td></tr>
            <tr><td><code>G5</code> Crawler-specific robots groups</td><td>GEO-009</td><td>guarded</td><td>V2 / V4</td><td style={{ color: 'var(--muted)' }}>Phase 2: needs the RFC 9309 equivalence proof.</td></tr>
          </tbody>
        </table>
      </div>
      <h2>Lifecycle</h2>
      <ol>
        <li><strong>Dry run</strong> (the default): diff, provenance, every precondition, required verification. Variants whose preconditions fail are listed with the reason.</li>
        <li><strong>Guards</strong>: dirty target files need <code>--allow-dirty</code>; the default branch needs confirmation; every approval is settled before the first byte is written.</li>
        <li><strong>Snapshot and splice</strong>: originals go to <code>.geo/runs/&lt;runId&gt;/fix/</code>; edits are AST-located, byte-minimal splices; multi-file fixes are atomic.</li>
        <li><strong>Verify</strong> V1–V4 and compare the <em>rule condition and new findings</em>, not fingerprint absence.</li>
        <li><strong>Outcome</strong>: <code>verified</code>; <code>applied_unverified</code> (exit 6) when no check failed but the required level was not reached; <code>rolled_back</code> (exit 5) when an executed check failed — only that fix is restored.</li>
        <li><strong>Rollback</strong>: <code>fix --rollback &lt;runId&gt;</code> restores byte-exact snapshots and refuses any file edited afterwards.</li>
      </ol>
      <h2>Verification levels</h2>
      <ul>
        <li><strong>V1 — syntax.</strong> Touched files parse.</li>
        <li><strong>V2 — static rule.</strong> The affected sub-check now passes on a fresh re-scan and no new finding appears on an affected subject. A disappearance into <code>not_evaluated</code> is unverified.</li>
        <li><strong>V3 — configured commands.</strong> Only exact owner-configured argv commands, with interactive confirmation, an exact <code>--verify-cmd</code>, or <code>GEO_ALLOW_VERIFY_COMMAND=1</code>.</li>
        <li><strong>V4 — runtime observation.</strong> Requires confirmed source freshness <em>and</em> the rule now passing on the served response.</li>
      </ul>
      <h2>Freshness: the GEO-started serve process</h2>
      <p>A changed response is not proof that the app rebuilt from the edited source. In this release, <code>source_freshness: confirmed</code> means exactly one thing: <strong>GEO itself started the server after the last write</strong>.</p>
      <ol>
        <li>Authorise like V3: <code>fix.serve.command</code> and <code>fix.serve.url</code> in config, and <code>--serve</code>, an interactive yes, or <code>GEO_ALLOW_SERVE_COMMAND=1</code>. Config alone never starts a process, so a pull request that edits config cannot start one in CI.</li>
        <li>The port must be free. If something is already listening, GEO refuses (<code>runtime_unavailable: port_in_use</code>) — it cannot prove it would be talking to its own process.</li>
        <li>GEO spawns the argv with no shell from the repository root, after the last write, and polls the URL until it answers (or <code>serve_not_ready</code>).</li>
        <li>It fetches the affected URLs, re-evaluates, records <code>process_started_after_write</code>, and always terminates the process tree.</li>
      </ol>
      <div className="callout warn">
        <strong>Stated limit.</strong> “Confirmed” means the process started after the edit. A command that serves stale prebuilt output — <code>next start</code> without a rebuild — defeats it. Use a from-source dev command such as <code>pnpm exec next dev --port 3100</code>.
      </div>
      <p>Against a server you run yourself (<code>--url</code>), V4 is observation only: freshness stays <code>unconfirmed</code> and a V4-required fix is <code>applied_unverified</code>. An unconfirmed runtime never triggers a rollback; a confirmed-fresh runtime that still fails does. GEO never injects marker code into your project and never runs builds on its own.</p>
    </DocsPage>
  );
}
