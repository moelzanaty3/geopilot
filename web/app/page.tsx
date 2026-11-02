import Link from 'next/link';
import { RULES } from 'trace-rank/catalogue';
import { Command } from '@/components/copy-button';
import { DISCLAIMER, GITHUB_URL, LICENSE_NAME, NPM_URL } from '@/lib/site';
import { engineVersion } from '@/lib/data';

export const dynamic = 'force-static';

// Output of the real CLI against packages/trace-rank/test/fixtures/next-fixable,
// trimmed for width. Nothing here is invented: rerun it to check.
function Terminal() {
  return (
    <div className="term" role="img" aria-label="trace-rank scan and fix output for a Next.js repository">
      <div className="term-bar">
        <i />
        <i />
        <i />
        <span>~/acme-web</span>
      </div>
      <pre>
        <span className="t-dim">$ </span>npx trace-rank scan .{'\n'}
        <span className="t-acc t-b">trace-rank</span> <span className="t-dim">· nextjs-app (detected) · provenance T2 · fixes T3</span>{'\n\n'}
        {'  '}<span className="t-dim">Readiness </span> <span className="t-amb">insufficient evidence</span>{'\n'}
        {'  '}<span className="t-dim">Coverage  </span> 43%   <span className="t-dim">Confidence</span> 82%{'\n'}
        {'  '}<span className="t-dim">· 6 rules need runtime evidence — re-run with --url</span>{'\n\n'}
        {'  '}<span className="t-red">HIGH</span>  <span className="t-b">GEO-014</span>  <span className="t-acc">/pricing</span>  sets robots noindex in its metadata{'\n'}
        {'        '}<span className="t-dim">app/pricing/page.tsx:5  provenance exact</span>{'\n'}
        {'        '}<span className="t-dim">fix</span> G1-b75653d6 (guarded){'\n'}
        {'  '}<span className="t-amb">MED </span>  <span className="t-b">GEO-012</span>  <span className="t-acc">/</span>  root {'<html>'} has no lang attribute{'\n'}
        {'        '}<span className="t-dim">app/layout.tsx:10  provenance absent</span>{'\n'}
        {'        '}<span className="t-dim">fix</span> S2-d8092663 (safe){'\n\n'}
        <span className="t-dim">$ </span>npx trace-rank fix --apply --approve G1-b75653d6 --serve{'\n'}
        <span className="t-b">S2-d8092663</span>  <span className="t-grn">verified</span>  <span className="t-dim">required V2, achieved V2</span>{'\n'}
        <span className="t-b">G1-b75653d6</span>  <span className="t-grn">verified</span>  <span className="t-dim">required V4, achieved V4</span>{'\n'}
        {'    '}<span className="t-dim">V4</span> <span className="t-grn">pass</span> <span className="t-dim">served by a process GEO started after the write</span>{'\n'}
        {'  '}<span className="t-dim">source_freshness</span> confirmed <span className="t-dim">(process_started_after_write)</span>
      </pre>
    </div>
  );
}

const LOOP = [
  { step: '01', title: 'Observe', body: 'Fetch the site the way a crawler does: robots.txt first, sitemaps, server HTML, bounded and SSRF-guarded.' },
  { step: '02', title: 'Evidence', body: 'Every finding carries the URL, header, selector or line that shows it, capped and redacted.' },
  { step: '03', title: 'Trace', body: 'On Next.js App Router and static HTML, map the value to the literal that produced it — or say why not.' },
  { step: '04', title: 'Patch', body: 'Propose the smallest closed-list change. Safe fixes apply with --apply; guarded ones need their id.' },
  { step: '05', title: 'Prove', body: 'Re-check the rule condition, not the fingerprint. V4 counts only on a server GEO started after the write.' },
];

const OUTPUTS = [
  { num: 'Readiness', body: 'Weighted prevalence of failures in direct evidence. Inferred and agent observations never enter it.' },
  { num: 'Coverage', body: 'How much of what applies was assessed directly. Below 50%, no readiness number is shown.' },
  { num: 'Confidence', body: 'The direct share of what was evaluated. Repo-only inferences lower it, visibly.' },
  { num: 'Scope', body: 'Exactly which rule and subject pairs were checked. Change it, and numeric deltas are suppressed.' },
];

const TIERS = [
  { tier: 'T0', name: 'Universal URL', where: 'Any web stack', claim: 'Observed URL findings. No source claims.' },
  { tier: 'T1', name: 'Generic repository', where: 'Any readable repo', claim: 'Hints and candidate files only. No automatic patch.' },
  { tier: 'T2', name: 'Verified source mapping', where: 'Next.js App Router, static HTML', claim: 'File and line, when the evidence meets the bar.' },
  { tier: 'T3', name: 'Deterministic remediation', where: 'Next.js App Router, static HTML', claim: 'Five closed-list fixes, approvals, snapshots, rollback.' },
];

export default function Home() {
  const version = engineVersion();
  const scored = RULES.filter((r) => r.scored);
  return (
    <main id="content" tabIndex={-1}>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <div className="eyebrow">
              <span className="pill accent">GEO technical readiness</span>
              <span className="pill">CLI + agent skill</span>
            </div>
            <h1>
              <span className="a">Find the issue.</span>
              <span className="b">
                Trace it to <span className="mark">source.</span>
              </span>
              <span className="b">Prove the fix.</span>
            </h1>
            <p className="lead">
              trace-rank audits any website for the technical conditions crawlers and AI search systems document — robots, sitemaps, indexability, canonicals, metadata, structured data — shows the evidence, maps it to the line that caused it, and verifies the change it proposes.
            </p>
            <div className="hero-actions">
              <Command text="npx trace-rank scan https://your.site" />
            </div>
            <div className="hero-actions" style={{ marginTop: 14 }}>
              <Link className="btn btn-accent" href="/docs/getting-started/">
                Get started
              </Link>
              <Link className="btn btn-ghost" href="/docs/rules/">
                Browse {scored.length} rules
              </Link>
            </div>
            <div className="hero-meta">
              <span>No accounts · no telemetry · no model calls</span>
              <a href={NPM_URL}>npm {version === '0.0.0-development' ? 'pre-release' : version}</a>
              <a href={GITHUB_URL}>GitHub</a>
              <span>{LICENSE_NAME}</span>
            </div>
          </div>
          <Terminal />
        </div>
      </section>

      <div className="disclaimer">
        <div className="container">
          <p>
            <strong>Honest by contract.</strong> {DISCLAIMER}
          </p>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div className="kicker">The loop</div>
            <h2>Observable finding to verified fix, with nothing assumed in between.</h2>
            <p>URL scans and a 0–100 score are commodity. The difference is the chain: evidence, a source mapping you can check, the smallest safe patch, and verification that never overstates what it proved.</p>
          </div>
          <div className="loop">
            {LOOP.map((s) => (
              <div key={s.step}>
                <div className="step">{s.step}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div className="kicker">Four outputs, never blended</div>
            <h2>A score that refuses to guess.</h2>
            <p>
              A repository-only scan of a Next.js app finds and traces problems but reports <em>insufficient evidence</em> rather than a readiness number: its HTTP sub-checks cannot run, and a rule never passes on part of its own checks.
            </p>
          </div>
          <div className="grid cols-4">
            {OUTPUTS.map((o) => (
              <div className="card" key={o.num}>
                <div className="num">{o.num}</div>
                <p>{o.body}</p>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 18, fontSize: 14, color: 'var(--muted)' }}>
            Every number in the docs is recomputed from executable fixtures. <Link href="/docs/scoring/" style={{ color: 'var(--accent-ink)' }}>See the worked examples →</Link>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div className="kicker">Broad reach, graduated trust</div>
            <h2>Every stack gets a URL audit. Source claims are earned.</h2>
            <p>A framework is not “supported” because it can be scanned by URL or read by an agent. Each output names the tier that actually applied.</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Capability</th>
                  <th>Available on</th>
                  <th>What it may claim</th>
                </tr>
              </thead>
              <tbody>
                {TIERS.map((t) => (
                  <tr key={t.tier}>
                    <td>
                      <span className="pill accent">{t.tier}</span>
                    </td>
                    <td>{t.name}</td>
                    <td>{t.where}</td>
                    <td style={{ color: 'var(--muted)' }}>{t.claim}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <span className="pill">Agent</span>
                  </td>
                  <td>Contextual investigation</td>
                  <td>Any repository your coding agent can read</td>
                  <td style={{ color: 'var(--muted)' }}>Recommendations and hypotheses, labelled agent-suggested. Never engine provenance.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div className="kicker">Two independent experiences</div>
            <h2>Useful without AI. Better with your agent.</h2>
          </div>
          <div className="grid cols-2">
            <div className="card">
              <h3>The CLI, no model involved</h3>
              <p>Crawl any site, run deterministic rules, explain them, trace source on supported frameworks, apply approved fixes, verify outcomes, cache runs. It never calls an LLM, ships no provider SDK and needs no API key.</p>
            </div>
            <div className="card">
              <h3>The agent skill, your model</h3>
              <p>One portable skill drives the published CLI from Claude Code. It reads the evidence, investigates any framework, and proposes contextual edits after approval — keeping engine findings, its recommendations and its hypotheses in separate sections.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div className="kicker">A closed catalogue</div>
            <h2>{scored.length} scored rules. No folklore.</h2>
            <p>Each rule cites the platform documentation or standard it rests on. Word counts, mandatory FAQs and llms.txt are not requirements; GEO-010 reports llms.txt for information only.</p>
          </div>
          <div className="grid cols-3">
            {scored.map((r) => (
              <Link className="card" key={r.id} href={`/docs/rules/${r.id.toLowerCase()}/`}>
                <h3>
                  <span className="pill accent">{r.id}</span>
                  <span className="pill">{r.evidenceClass} · w{r.weight}</span>
                </h3>
                <p>{r.title}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="final">
            <h2>One command to the first result.</h2>
            <p>Point it at a URL, a repository, or both. Nothing is written outside .geo/ until you approve it.</p>
            <div className="hero-actions">
              <Command text="npx trace-rank scan . --url http://127.0.0.1:3000" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
