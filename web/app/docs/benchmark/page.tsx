import { DocsPage } from '@/components/docs-page';
import { GITHUB_URL } from '@/lib/site';

export const metadata = { title: 'Benchmark' };

const EVALS_URL = `${GITHUB_URL}/tree/main/evals`;

export default function Page() {
  return (
    <DocsPage href="/docs/benchmark/" crumb="Benchmark" title="Geopilot vs a plain prompt" intro="Is geopilot better than asking a good model directly? We tested it, wrote down what would count as a win before running it, and published the results.">
      <h2>The result</h2>
      <p>On six sample projects, both found every planted bug. <strong>Geopilot raised about 14 times fewer false alarms</strong>, and it costs about twice as much per run.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Measure (18 runs each)</th><th>Plain prompt</th><th>Geopilot</th></tr></thead>
          <tbody>
            <tr><td>Planted bugs found</td><td>100%</td><td>100%</td></tr>
            <tr><td>Same bugs found between runs</td><td>1.00</td><td>1.00</td></tr>
            <tr><td><strong>False alarms per report</strong></td><td><strong>0.78</strong></td><td><strong>0.06</strong></td></tr>
            <tr><td>False alarms on the healthy site</td><td>1.33</td><td>0</td></tr>
            <tr><td>Other issues raised per report</td><td>7.7</td><td>0.6</td></tr>
            <tr><td>Cost per run</td><td>$0.07</td><td>$0.15</td></tr>
            <tr><td>Time per run</td><td>27s</td><td>44s</td></tr>
          </tbody>
        </table>
      </div>
      <p>A false alarm here means telling someone to change something that was fine, such as a deliberate <code>noindex</code> on a private page, or adding <code>llms.txt</code> or a FAQ because a checklist says so. This matters most if you&rsquo;ll act on the report, or if you&rsquo;re new to GEO and can&rsquo;t easily tell good advice from noise.</p>
      <h2>Where a plain prompt is still better</h2>
      <ul>
        <li><strong>It&rsquo;s cheaper and faster.</strong> It cost about half as much and ran in about 60% of the time.</li>
        <li><strong>It raises more ideas.</strong> Its &ldquo;other issues&rdquo; include useful suggestions such as thin content, alongside noise. Geopilot deliberately stays narrower. We didn&rsquo;t grade how many of those extra issues were right, so this count isn&rsquo;t a score in either direction.</li>
        <li><strong>On a large real repository, it was at least as useful.</strong> In an informal run on one production repository, the plain prompt raised specific findings that an earlier geopilot version missed. Adding an &ldquo;Other problems found&rdquo; section closed part of that gap. But geopilot still sometimes skipped files, and its low score varied between runs. Both approaches also missed a bug we already knew about. It&rsquo;s one repository, it wasn&rsquo;t graded against an answer key, and we don&rsquo;t claim geopilot is better on large repositories.</li>
      </ul>
      <h2>How it was tested</h2>
      <ul>
        <li><strong>Criteria first:</strong> what would count as a win was <a href={`${EVALS_URL}/PREREGISTRATION.md`}>written down before any run</a>. The false-alarm result meets it: at most half the plain prompt&rsquo;s rate, with nothing else materially worse.</li>
        <li><strong>Known answers:</strong> six projects on six stacks, with 28 planted bugs, plus decoys that look like problems but aren&rsquo;t. One project is a healthy site, to catch false alarms.</li>
        <li><strong>Same conditions:</strong> the same model, the same read-only tools and no user settings. Each arm ran three times per project.</li>
        <li><strong>Blind grading:</strong> a separate model graded each report against the answer key, with geopilot&rsquo;s name and scoring lines masked.</li>
      </ul>
      <h2>Why you should discount this</h2>
      <ul>
        <li><strong>Geopilot&rsquo;s author wrote the projects and the answer key,</strong> and the bugs come from geopilot&rsquo;s own rule areas. That favours geopilot.</li>
        <li><strong>The projects are small.</strong> Both arms could read every file, and both scored 100%, so this test can&rsquo;t show a difference in catch rate. It also says little about large repositories.</li>
        <li><strong>Blinding isn&rsquo;t perfect.</strong> Geopilot&rsquo;s reports have a recognisable structure even with its name masked.</li>
        <li><strong>Geopilot changed between runs.</strong> The first run found the same catch rate and 0 false alarms, but also showed the weaknesses on the real repository. We then changed geopilot and reran only its arm. <a href={`${EVALS_URL}/results`}>Both sets of results are published</a>. These numbers are from the second run, so treat them as less independent than a single pre-registered run.</li>
        <li><strong>One measure didn&rsquo;t work.</strong> &ldquo;Invalid file references&rdquo; also counted files a report suggested creating, so we don&rsquo;t report it.</li>
        <li><strong>One model, one moment.</strong> This used Claude Sonnet on Claude Code in November 2026.</li>
      </ul>
      <p>This measures audit quality only. It says nothing about whether fixes lead to more citations or traffic.</p>
      <h2>Run it yourself</h2>
      <pre><code>node evals/run.mjs</code></pre>
      <p>This needs an authenticated <code>claude</code> CLI and costs a few dollars. Delete the files in <code>evals/results/</code> first to rerun from scratch. The <a href={EVALS_URL}>projects, answer key, reports and grades</a> are all in the repository.</p>
    </DocsPage>
  );
}
