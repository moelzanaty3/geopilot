import { DocsPage } from '@/components/docs-page';
import { GITHUB_URL } from '@/lib/site';

export const metadata = { title: 'Benchmark' };

const EVALS_URL = `${GITHUB_URL}/tree/main/evals`;

export default function Page() {
  return (
    <DocsPage href="/docs/benchmark/" crumb="Benchmark" title="Geopilot vs a plain prompt" intro="Is geopilot better than asking a good model directly? We tested it, wrote down what would count as a win before running it, and published the results.">
      <h2>The result</h2>
      <p>On three projects kept back while geopilot was being tuned, both found every planted bug. <strong>Geopilot raised no false alarms and about a tenth as many wrong ideas.</strong> A plain prompt raised slightly more useful ideas, and it was cheaper and faster.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Held-out projects (9 runs each)</th><th>Plain prompt</th><th>Geopilot</th></tr></thead>
          <tbody>
            <tr><td>Planted bugs found</td><td>100%</td><td>100%</td></tr>
            <tr><td>Same bugs found between runs</td><td>1.00</td><td>1.00</td></tr>
            <tr><td><strong>False alarms per report</strong></td><td><strong>1.56</strong></td><td><strong>0</strong></td></tr>
            <tr><td>False alarms on the healthy site</td><td>3.0</td><td>0</td></tr>
            <tr><td>Useful ideas per report</td><td>6.6</td><td>5.4</td></tr>
            <tr><td>Generic ideas per report</td><td>5.1</td><td>3.8</td></tr>
            <tr><td><strong>Wrong ideas per report</strong></td><td><strong>3.8</strong></td><td><strong>0.3</strong></td></tr>
            <tr><td>Cost per run</td><td>$0.07</td><td>$0.14</td></tr>
            <tr><td>Time per run</td><td>32s</td><td>42s</td></tr>
          </tbody>
        </table>
      </div>
      <p>On the six projects used for tuning (18 runs each), the plain prompt and geopilot had 0.67 and 0 false alarms, 6.0 and 5.6 useful ideas, and 2.3 and 0.8 wrong ideas.</p>
      <p>A false alarm means telling someone to change something that was fine, such as a deliberate <code>noindex</code> on a private page. An idea is any other recommendation, judged by a blind grader that could read the project&rsquo;s files. It&rsquo;s <em>useful</em> if it&rsquo;s specific, accurate and could plausibly help, <em>generic</em> if it would fit almost any site, and <em>wrong</em> if it&rsquo;s false, reverses a deliberate choice or relies on folklore such as word counts.</p>
      <h2>On GitHub Copilot, and on a lighter model</h2>
      <p>We repeated the test on Copilot CLI on the same three projects, with its default model and a lightweight one. These runs used geopilot 0.0.3, before the reading changes in the numbers above. Cells show the plain prompt, then geopilot. Copilot doesn&rsquo;t report a price per run, so cost isn&rsquo;t compared.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Measure (9 runs each)</th><th>Claude Sonnet 5.5</th><th>GPT-5.6 Luna</th></tr></thead>
          <tbody>
            <tr><td>Planted bugs found</td><td>100% / 100%</td><td><strong>100% / 90%</strong></td></tr>
            <tr><td>Same bugs found between runs</td><td>1.00 / 1.00</td><td><strong>1.00 / 0.87</strong></td></tr>
            <tr><td>False alarms per report</td><td>2.0 / 0</td><td>2.33 / 0</td></tr>
            <tr><td>Useful ideas per report</td><td>5.8 / 5.0</td><td>4.0 / 4.1</td></tr>
            <tr><td>Wrong ideas per report</td><td>3.9 / 1.0</td><td>3.6 / 0.8</td></tr>
            <tr><td>Time per run</td><td>31s / 51s</td><td>69s / 80s</td></tr>
          </tbody>
        </table>
      </div>
      <p><strong>On a lightweight model, geopilot can miss real bugs.</strong> On Luna it missed a missing <code>lang</code> attribute in 2 of 3 runs on one project and a button-only link once, and the plain prompt found both every time. By the rule we set in advance, that means geopilot hasn&rsquo;t shown a win on Luna, even with no false alarms. For an audit, use your host&rsquo;s default or a stronger model if you can.</p>
      <h2>Why a plain prompt has more ideas, and why that&rsquo;s not all good</h2>
      <p>A plain prompt raises about 15 ideas per report against geopilot&rsquo;s 10, so it has more to choose from and much more to filter. <strong>About 57% of geopilot&rsquo;s ideas were useful, against 42% for the plain prompt, and the plain prompt raised about 11 times as many wrong ones.</strong> Sorting the useful ideas from the previous run (geopilot 0.0.3) by kind shows what&rsquo;s behind the gap. The sorting is rough and the samples are small.</p>
      <ul>
        <li><strong>Geopilot raised more ideas about what&rsquo;s on your pages:</strong> 1.8 against 1.0 per report on missing page content, such as facts a page promises but never gives, and 0.9 against 0.4 on links and navigation.</li>
        <li><strong>Geopilot won&rsquo;t extend a choice you made on purpose.</strong> The biggest single difference was naming more training crawlers to block, at 0.7 against 0 per report. Geopilot leaves that decision with you, so you may want to check that list yourself.</li>
        <li><strong>The plain prompt raised more ideas on some basics:</strong> titles and descriptions, page structure, canonicals and site settings. This is a real gap in geopilot, and we plan to close it.</li>
      </ul>
      <h2>Where a plain prompt is still better</h2>
      <ul>
        <li><strong>It raises slightly more useful ideas.</strong> 6.6 against 5.4 per report, so geopilot missed its target of at least matching it.</li>
        <li><strong>It&rsquo;s cheaper and faster.</strong> Geopilot costs about twice as much and took about 30% longer, and it missed its target of costing less than the previous $0.14. Most of the extra cost is the rulebook it sends to the model, which is also what keeps false alarms down.</li>
        <li><strong>Large repositories are still unproven.</strong> In informal runs on one private production repository, geopilot raised specific findings, at about $0.30&ndash;$0.50 and one to two minutes per run. It isn&rsquo;t consistent there yet: three runs of the current version gave low scores of 48, 52 and 80, some left code unread, and a known bug was named in only one of them. It wasn&rsquo;t graded against an answer key, and we don&rsquo;t claim geopilot is better on large repositories.</li>
      </ul>
      <h2>How it was tested</h2>
      <ul>
        <li><strong>Criteria first:</strong> what would count as a win was <a href={`${EVALS_URL}/PREREGISTRATION.md`}>written down before any run</a>. The false-alarm result meets it: at most half the plain prompt&rsquo;s rate, with catch rate and consistency no worse. A later round added <a href={`${EVALS_URL}/PREREGISTRATION.md`}>targets for ideas, cost and time</a>, and the results above say which were missed.</li>
        <li><strong>Known answers:</strong> nine projects on nine stacks, with 38 planted bugs, plus decoys that look like problems but aren&rsquo;t. Two projects are healthy sites, to catch false alarms.</li>
        <li><strong>Held-out projects:</strong> three of the nine were written before geopilot 0.0.3&rsquo;s last prompt changes and first run once that prompt was frozen. The numbers above are from a later version, changed for how it reads large repositories, so those three aren&rsquo;t unseen any more.</li>
        <li><strong>Same conditions:</strong> the same model, the same read-only tools and no user settings. Each arm ran three times per project.</li>
        <li><strong>Blind grading:</strong> a separate model graded each report against the answer key, with geopilot&rsquo;s name and scoring lines masked.</li>
      </ul>
      <h2>Why you should discount this</h2>
      <ul>
        <li><strong>Geopilot&rsquo;s author wrote the projects and the answer key,</strong> and the bugs come from geopilot&rsquo;s own rule areas. That favours geopilot.</li>
        <li><strong>The projects are small.</strong> Both arms could read every file, and both scored 100%, so this test can&rsquo;t show a difference in catch rate. It also says little about large repositories.</li>
        <li><strong>Blinding isn&rsquo;t perfect.</strong> Geopilot&rsquo;s reports have a recognisable structure even with its name masked.</li>
        <li><strong>Held out doesn&rsquo;t mean independent.</strong> The same author wrote those three projects and knows what geopilot looks for, and three small projects can&rsquo;t settle this. Geopilot was tuned repeatedly on the other six. <a href={`${EVALS_URL}/results`}>Every earlier run is published</a>, and each change is listed in the pre-registration.</li>
        <li><strong>A model judged the ideas.</strong> We defined the three classes ourselves, and the grader sometimes gave the same suggestion different verdicts in different reports. Treat small differences in idea counts as noise.</li>
        <li><strong>One measure didn&rsquo;t work.</strong> &ldquo;Invalid file references&rdquo; also counted files a report suggested creating, so we don&rsquo;t report it.</li>
        <li><strong>A few models, one moment.</strong> This used Claude Sonnet on Claude Code, and Claude Sonnet 5.5 and GPT-5.6 Luna on Copilot, in November 2026. Other hosts and models weren&rsquo;t tested.</li>
      </ul>
      <p>This measures audit quality only. It says nothing about whether fixes lead to more citations or traffic.</p>
      <h2>Run it yourself</h2>
      <pre><code>node evals/run.mjs</code></pre>
      <p>This needs an authenticated <code>claude</code> CLI and costs a few dollars. Delete the files in <code>evals/results/</code> first to rerun from scratch. The <a href={EVALS_URL}>projects, answer key, reports and grades</a> are all in the repository.</p>
    </DocsPage>
  );
}
