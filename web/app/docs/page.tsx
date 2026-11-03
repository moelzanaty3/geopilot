import Link from 'next/link';
import { DocsPage } from '@/components/docs-page';
import { DISCLAIMER } from '@/lib/site';

export const metadata = { title: 'Introduction' };

export default function Page() {
  return (
    <DocsPage href="/docs/" crumb="Introduction" title="Introduction" intro="geopilot is an open-source, local-first, framework-agnostic technical readiness auditor and source-aware remediation assistant for websites.">
      <div className="callout">{DISCLAIMER}</div>
      <p>
        It combines a deterministic CLI that is useful on its own with a portable agent skill that works through the coding agent you already use. The promise is narrow on purpose: <strong>find the observable issue, show the evidence, trace its source when reliable, propose the smallest safe change, and honestly report what was verified.</strong>
      </p>
      <h2>Two experiences, neither depends on the other</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Experience</th>
              <th>What it can do</th>
              <th>What it cannot claim</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>CLI without AI</td>
              <td>Crawl sites on any stack; run deterministic rules; explain them; assess coverage; trace source on supported frameworks; apply approved deterministic patches; verify outcomes.</td>
              <td>Understand arbitrary business intent, or guarantee search/AI performance.</td>
            </tr>
            <tr>
              <td>Agent with your LLM</td>
              <td>Consume CLI evidence; inspect a repository on any framework; explain context; suggest and, after approval, make contextual or editorial edits; re-run checks.</td>
              <td>Turn its opinions into engine findings, or claim provenance or runtime verification the engine did not establish.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h2>What this release contains</h2>
      <ul>
        <li>The universal URL audit (T0) for every rule that does not need a browser renderer.</li>
        <li>Next.js App Router and static HTML source mapping (T2) with the five closed-list fixes (T3): S1, S2, G1, G2, G3.</li>
        <li>Readiness, coverage, confidence and assessment scope, computed exactly as the worked examples show.</li>
        <li>V1–V4 verification, including the GEO-started serve process that is the only way source freshness is ever “confirmed”.</li>
        <li><Link href="/docs/agent/">Agent plugins</Link> for Claude Code, GitHub Copilot CLI, OpenCode and OpenAI Codex; insight validation (L1/L2) and report merging.</li>
      </ul>
      <h2>Not in this release</h2>
      <ul>
        <li>A browser renderer: GEO-003 and GEO-002 report <code>not_evaluated</code> (renderer_unavailable), never a failure.</li>
        <li>Diff-aware <code>review</code>, baselines, pre-push hooks, SARIF and the GitHub Action (Phase 3).</li>
        <li>Crawler-specific robots fixes (G5) and app-link file creation (G4), which need the Phase 2 equivalence proof.</li>
        <li>A package for Cursor; the <code>AGENTS.md</code> section is a provisional fallback.</li>
      </ul>
      <p>
        Start with <Link href="/docs/getting-started/">Getting started</Link>.
      </p>
    </DocsPage>
  );
}
