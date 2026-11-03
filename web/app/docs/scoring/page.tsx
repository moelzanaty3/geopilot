import { DocsPage } from '@/components/docs-page';
import { scoringExamples } from '@/lib/data';

export const metadata = { title: 'Scoring' };

export default function Page() {
  const examples = scoringExamples();
  return (
    <DocsPage href="/docs/scoring/" crumb="Scoring" title="Scoring" intro="Four separate outputs: readiness, coverage, confidence and assessment scope. Inferred, agent and experimental observations never enter readiness.">
      <h2>Definitions</h2>
      <p>For each scored rule <em>r</em> with weight <em>w(r)</em> ∈ {'{1, 2, 3}'}, applicable subjects are partitioned (after removing not-applicable ones) into direct passes, direct fails, inferred, and unassessed (<code>not_evaluated</code> or <code>error</code>). Each site-level rule contributes one site subject.</p>
      <pre><code>{`p(r)       = |D_f(r)| / |D(r)|                       for r with direct evidence
Readiness  = 100 · Σ w(r)·(1 − p(r)) / Σ w(r)         over rules with direct evidence
Coverage   = 100 · Σ w(r)·|D|/(|D|+|I|+|U|) / Σ w(r)  over applicable rules
Confidence = 100 · Σ w(r)·|D|/(|D|+|I|) / Σ w(r)      over rules with direct or inferred evidence`}</code></pre>
      <ul>
        <li>Readiness is null with no direct evidence; coverage is 0 with no applicable rules; confidence is null with nothing evaluated.</li>
        <li>Unrounded throughout; display rounds half away from zero, once.</li>
        <li><strong>Sub-checks.</strong> A fail on any evaluated sub-check fails the subject. All evaluated sub-checks passing while one applicable sub-check could not run is <code>not_evaluated</code> (<code>incomplete_subchecks</code>). A rule never passes on part of its own checks.</li>
        <li><strong>Blocker cap.</strong> Readiness is capped at 40 when direct evidence shows robots.txt answering 5xx, a search crawler blocked site-wide against declared policy, or every route noindex. The uncapped value and the reason are kept.</li>
        <li><strong>Display.</strong> Coverage ≥ 80% shows readiness; 50–80% shows it as provisional; below 50% (or no readiness) shows “insufficient evidence” and no number.</li>
      </ul>
      <h2>The score range</h2>
      <p>Every report also gives each rule one result: Clear, Problem, Can&rsquo;t tell or Not applicable. From those, the CLI and the agent plugins calculate one score with one formula, shown as a range. The low end assumes every Can&rsquo;t tell rule is a problem, and the high end assumes every one is clear. The CLI puts this in the report&rsquo;s <code>summary</code>. Readiness below stays stricter: a rule never passes on part of its checks.</p>
      <p>If bot protection or a firewall answers instead of the site, the report says it was blocked, sets <code>blocked</code>, and passes or fails nothing about the site.</p>
      <h2>Worked examples</h2>
      <p>These are executable fixtures in <code>packages/geopilot/test/fixtures/scoring</code>. The test suite recomputes every number below from them on every change, and this page reads the same files, so the prose cannot drift from the engine.</p>
      {examples.map((x) => (
        <section key={x.id}>
          <h3>
            {x.id.replace('example-', 'Example ').toUpperCase().replace('EXAMPLE ', 'Example ')} — {x.title}
          </h3>
          <p>{x.description}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Readiness</th><th>Coverage</th><th>Confidence</th><th>Cap</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{x.expected.readinessDisplay}</td>
                  <td>{x.expected.coverageDisplay}</td>
                  <td>{x.expected.confidenceDisplay}</td>
                  <td>{x.expected.capReason ?? '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <pre className="wrap"><code>{x.expected.formula}</code></pre>
        </section>
      ))}
      <h2>Comparing runs</h2>
      <ul>
        <li>A numeric readiness delta is shown only when the scoring version, ruleset major.minor and the set of direct (rule, subject) pairs are identical. Otherwise the comparison says “assessment scope changed” and lists what entered and left.</li>
        <li>A finding that moves from <code>fail</code> to <code>not_evaluated</code> or <code>error</code> is not resolved.</li>
        <li>Cross-site scores are not rankings. Even with an identical scope it is a technical readiness comparison, not AI performance.</li>
      </ul>
      <p>Eleven properties are checked on 10,000 generated cases each: bounds, null-iff-no-direct-evidence, fail→pass monotonicity, unassessed evidence never improving coverage or readiness, inferred evidence never moving readiness, order and sample invariance, cap invariance, and the comparability rules above.</p>
    </DocsPage>
  );
}
