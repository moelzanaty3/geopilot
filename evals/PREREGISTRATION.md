# Pre-registration: does geopilot beat a plain prompt?

Written before any run of this comparison.

## Question

Given the same model and the same repository, does the geopilot plugin produce a better GEO audit than asking the model directly?

## Arms

- **Plain:** one prompt, the kind a capable engineer would write: `Audit this repository for SEO and AI search readiness (GEO). Tell me what's wrong and what to fix, with the file and line for each problem.`
- **Geopilot:** the `/geopilot:scan` command.

Both arms use the same model (Claude Sonnet), the same read-only tools and the same isolation from user settings. Neither has web access.

## Sample

Six small repositories in `fixtures/`, on six different stacks, with known answers in `truth.json`:

- Five contain planted problems, and four of those also contain decoys: things that look like problems but aren't.
- One is a healthy site with decoys only, as a control for false alarms.

Each arm runs three times on each repository, for 36 runs.

## Grading

A separate model grades each report against `truth.json`. It sees no arm label, and reports with geopilot's name or command names have them masked. For each report it records which planted problems were identified and which decoys were wrongly called problems.

File references are also checked mechanically against each repository.

## Measures

1. **Recall:** planted problems identified, out of all planted problems.
2. **False alarms:** decoys wrongly reported as problems, per report.
3. **Consistency:** average overlap (Jaccard) of the planted problems found by two runs of the same arm on the same repository.
4. **Invalid references:** file references that don't exist, per report.
5. **Cost and time:** per run, reported for information.

## What counts as value

Geopilot has demonstrated value only if at least one of these holds, with no other primary measure materially worse:

- Recall is at least 10 percentage points higher.
- False alarms per report are at most half of the plain arm's, and the plain arm has at least 0.5 per report.
- Consistency is at least 0.10 higher.

"Materially worse" means recall lower by more than 5 points, false alarms higher by more than 0.25 per report, or consistency lower by more than 0.05.

If none holds, the result is "no demonstrated value over a plain prompt", and the docs won't claim otherwise.

## Limits, stated up front

- geopilot's author wrote the fixtures and the answer key, and the planted problems come from geopilot's own rule areas. This favours geopilot. The answer key is limited to problems a technical SEO reviewer would accept, but a reader should discount the result accordingly.
- A plain prompt can find real problems outside the answer key, and those aren't counted as recall. The grader counts them separately so they stay visible.
- Six small repositories, one model and one point in time. This isn't a statistical claim about all repositories.
- This measures audit quality. It says nothing about whether fixes lead to more citations.

## Changes made after this was written

- **Before any run:** one planted problem was wrong. In Next.js, a relative canonical is valid when `metadataBase` is set, so it was replaced with a page that has no canonical.
- **After the first full run:** geopilot met the false-alarm criterion, but an informal run on one real production repository showed a plain prompt giving more useful findings. geopilot was changed: bands only at High confidence, "Can't tell" no longer excuses unread files, every JSON-LD source is checked, and real defects outside the rules go in an unscored section. Only geopilot's arm was then rerun, against the same plain reports. The first results are in `results/first-run/`.
- **Invalid references:** this measure also counted files a report suggested creating, so it doesn't measure what it was meant to. It's kept in `summary.json` but isn't reported as a result. It wasn't part of the win criteria.
- **Not pre-registered:** the real-repository run was exploratory and wasn't graded against an answer key. Its contents aren't published because the repository is private.

## Third run: fewer steps and more ideas

Written before this run. Profiling showed `/geopilot:scan` wrote its report twice and carried a large prompt, and that the prompt banned optional ideas. geopilot was changed to fix both. Both arms are rerun from scratch, so they're measured at the same moment. Earlier results stay in `results/first-run/` and `results/second-run/`.

**New measure: ideas.** The old "other issues" count didn't say whether the issues were any good. A separate blind grader now reads each report alongside the repository's files, with section names masked, and classifies every recommendation that isn't a planted problem:

- **Useful:** specific to this repository, accurate according to its code, and a concrete action that could plausibly help people or machines find, read or understand the site.
- **Generic:** accurate, but would apply to almost any site or has very little effect.
- **Wrong:** false according to the code, reverses a deliberate choice, or relies on folklore such as `llms.txt` as a way to be found, word counts or mandatory FAQs.

**Targets for geopilot, against the plain arm in this run:**

1. Useful ideas per report at least equal.
2. Wrong ideas per report lower.
3. The existing criteria still hold: recall not lower by more than 5 points, consistency not lower by more than 0.05, and false alarms at most half the plain arm's.
4. Cost and time per run within 25%.

Every target is reported whether it's met or not.

**Limits of this run:** the changes were made after seeing reports on these same fixtures, so the fixtures can't be treated as unseen. The ideas guidance doesn't name anything from them, but a reader should still discount the result. The same author defined the three idea classes, and a model grades them.

**Changed after a one-pass pilot, before the full run:** the pilot (6 reports per arm) had geopilot at 3.67 useful ideas per report against 5.67 for the plain arm, so five general kinds of idea the plain arm found were added to geopilot's guidance. The targets didn't change. geopilot's pilot reports were discarded and its arm rerun; the plain arm didn't change, so its pilot reports were kept as its first run. The pilot also showed the ideas grader can be inconsistent, giving the same suggestion different verdicts in different reports.

**Changed after the first full run of this comparison, and the last change on these fixtures:** that run missed targets 1 and 4 and is kept in `results/third-run/`. Two of the five added kinds of idea were removed because they conflicted with deliberate choices, one of them causing a false alarm on the healthy site. An idea had also been promoted into "Do these first", which is now forbidden. The limit rose from 7 to 10 ideas, and the guidance now asks for the whole list to be checked. The targets didn't change. The plain arm's reports were kept and only geopilot's arm was rerun. Whatever this run shows gets published, and further tuning would need fixtures it hasn't seen.

**Changed because of a real repository, not these fixtures:** that run's reports are kept in `results/third-run-b/`. An informal scan of a private production repository stopped early and said it hadn't read the navigation, so a step was added that makes the scan check it finished reading before it scores. It doesn't touch the ideas guidance. geopilot's arm was rerun only so the published numbers describe the prompt that ships.

## Fourth run: held-out projects

Written before this run, and before the prompt changes it tests. The third run missed its targets for useful ideas, cost and time, and tuning further on the same six projects couldn't show real improvement. So three new projects were added, with their answer key, before any prompt change: `clinic` (Eleventy), `atlas` (Remix) and `larder` (a healthy static site). They're marked `heldOut` in `truth.json`.

**Method:** geopilot may be tuned only on the original six projects. The new projects are run once it's final, and their results are reported separately. If the held-out result is worse than the tuning result, the held-out result is the one that counts.

**Targets on the held-out projects, against the plain arm:**

1. Useful ideas per report at least equal.
2. Wrong ideas per report lower, and false alarms at most half.
3. Recall not lower by more than 5 points, and consistency not lower by more than 0.05.
4. Cost per run lower than the third run's $0.14.

**Limits:** the same author wrote the new projects and knows what geopilot looks for. Three small projects can't settle this, and the ideas grader remains inconsistent.

**Result on the held-out projects, plain against geopilot:** useful ideas 6.56 and 5.78, so target 1 was missed. Wrong ideas 3.78 and 0.67, and false alarms 1.56 and 0, so target 2 was met. Recall 100% and consistency 1.00 for both, so target 3 was met. Cost per run was $0.14, the same as the third run, so target 4 was missed. These projects have now been seen, so further tuning needs new ones.
