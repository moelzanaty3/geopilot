import { DocsPage } from '@/components/docs-page';
import { GITHUB_URL } from '@/lib/site';

export const metadata = { title: 'Benchmark' };

const EVALS_URL = `${GITHUB_URL}/tree/main/evals`;

export default function Page() {
  return (
    <DocsPage href="/docs/benchmark/" crumb="Benchmark" title="Geopilot vs a plain prompt" intro="Is geopilot better than asking a good model directly? We tested it, wrote down what would count as a win before running it, and published the results.">
      <h2>The result</h2>
      <p>On six sample projects, both found every planted bug. <strong>Geopilot raised no false alarms and about a quarter as many wrong ideas.</strong> A plain prompt raised more useful ideas, and it was cheaper and faster.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Measure (18 runs each)</th><th>Plain prompt</th><th>Geopilot</th></tr></thead>
          <tbody>
            <tr><td>Planted bugs found</td><td>100%</td><td>100%</td></tr>
            <tr><td>Same bugs found between runs</td><td>1.00</td><td>1.00</td></tr>
            <tr><td><strong>False alarms per report</strong></td><td><strong>0.67</strong></td><td><strong>0</strong></td></tr>
            <tr><td>False alarms on the healthy site</td><td>2.0</td><td>0</td></tr>
            <tr><td>Useful ideas per report</td><td>6.0</td><td>4.2</td></tr>
            <tr><td>Generic ideas per report</td><td>5.9</td><td>2.8</td></tr>
            <tr><td><strong>Wrong ideas per report</strong></td><td><strong>2.3</strong></td><td><strong>0.6</strong></td></tr>
            <tr><td>Cost per run</td><td>$0.07</td><td>$0.14</td></tr>
            <tr><td>Time per run</td><td>32s</td><td>44s</td></tr>
          </tbody>
        </table>
      </div>
      <p>A false alarm means telling someone to change something that was fine, such as a deliberate <code>noindex</code> on a private page. An idea is any other recommendation, judged by a blind grader that could read the project&rsquo;s files. It&rsquo;s <em>useful</em> if it&rsquo;s specific, accurate and could plausibly help, <em>generic</em> if it would fit almost any site, and <em>wrong</em> if it&rsquo;s false, reverses a deliberate choice or relies on folklore such as word counts.</p>
      <h2>Where a plain prompt is still better</h2>
      <ul>
        <li><strong>It raises more useful ideas.</strong> 6.0 against 4.2 per report, a target geopilot missed. It raises about twice as many ideas in total, so you get more to choose from and more to filter: about 42% of its ideas were useful, against 56% of geopilot&rsquo;s.</li>
        <li><strong>It&rsquo;s cheaper and faster.</strong> Geopilot missed its target of staying within 25%. It costs about twice as much and took about 37% longer. Most of the extra cost is the rulebook it sends to the model, which is also what keeps false alarms down.</li>
        <li><strong>Large repositories are still unproven.</strong> In informal runs on one private production repository, geopilot raised specific findings, but its score still varied between runs, and it still sometimes left code unread. It wasn&rsquo;t graded against an answer key, and we don&rsquo;t claim geopilot is better on large repositories.</li>
      </ul>
      <h2>How it was tested</h2>
      <ul>
        <li><strong>Criteria first:</strong> what would count as a win was <a href={`${EVALS_URL}/PREREGISTRATION.md`}>written down before any run</a>. The false-alarm result meets it: at most half the plain prompt&rsquo;s rate, with catch rate and consistency no worse. A later round added <a href={`${EVALS_URL}/PREREGISTRATION.md`}>targets for ideas, cost and time</a>, and the results above say which were missed.</li>
        <li><strong>Known answers:</strong> six projects on six stacks, with 28 planted bugs, plus decoys that look like problems but aren&rsquo;t. One project is a healthy site, to catch false alarms.</li>
        <li><strong>Same conditions:</strong> the same model, the same read-only tools and no user settings. Each arm ran three times per project, and both were rerun for these numbers.</li>
        <li><strong>Blind grading:</strong> a separate model graded each report against the answer key, with geopilot&rsquo;s name and scoring lines masked.</li>
      </ul>
      <h2>Why you should discount this</h2>
      <ul>
        <li><strong>Geopilot&rsquo;s author wrote the projects and the answer key,</strong> and the bugs come from geopilot&rsquo;s own rule areas. That favours geopilot.</li>
        <li><strong>The projects are small.</strong> Both arms could read every file, and both scored 100%, so this test can&rsquo;t show a difference in catch rate. It also says little about large repositories.</li>
        <li><strong>Blinding isn&rsquo;t perfect.</strong> Geopilot&rsquo;s reports have a recognisable structure even with its name masked.</li>
        <li><strong>Geopilot was tuned on these same projects.</strong> We changed it after seeing earlier reports on them, including after a pilot and a full run in this round, so these aren&rsquo;t unseen tests. <a href={`${EVALS_URL}/results`}>Every earlier run is published</a>, and each change is listed in the pre-registration.</li>
        <li><strong>A model judged the ideas.</strong> We defined the three classes ourselves, and the grader sometimes gave the same suggestion different verdicts in different reports. Treat small differences in idea counts as noise.</li>
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
