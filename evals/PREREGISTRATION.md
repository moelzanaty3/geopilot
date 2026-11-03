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
