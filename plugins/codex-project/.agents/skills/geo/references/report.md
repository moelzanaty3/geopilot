# The report

Write for someone who has never heard of GEO. Use this structure and these headings, in this order. Explain each term the first time you use it, and don't shame anyone for what's missing.

```markdown
# GEO report: <project name>

**New to GEO?** GEO (generative engine optimization) means making your site easy for search engines and AI tools to find, read and quote. This report checks the technical basics.

## Code score: <low>–<high>/100, <band>

Confidence: <High|Medium|Low> (checked <checked> of <applicable> points).
How it's calculated: low = <earned> ÷ <applicable> × 100 = <low>. High = (<earned> + <unknown>) ÷ <applicable> × 100 = <high>.

<One or two plain sentences on what this means for this project, and what the unknowns are.>

## Live check

<Only one of these:>
- **Not run.** To add it, give me your site's URL.
- **Blocked.** <Protection> answered instead of your site, so the live check read nothing. This doesn't show a problem with your site, or whether real crawlers get through.
- **Couldn't run.** <The exact reason, such as a permission policy.> To run it yourself: `<exact command>`.
- **Live score: <low>–<high>/100, <band>** (checked <checked> of <applicable> points).

## Where code and live disagree

<Only when a live check ran. List each rule where the two results differ, say which to trust, and why. If they agree, leave this section out.>

## Do these first

### 1. <What to do, in plain words>
- **Why it matters:** <one sentence about real-world effect>
- **Where:** `<file>:<line>`
- **What the code says:** `<exact quote>`
- **Size:** <Small | Medium | Large>
- **Score after this:** <recalculated range, or the two ranges for a check>

<Up to three items, most points at stake first. Points at stake are the points a Problem has lost, or the full weight of a Can't tell rule. Ties go to the smaller change. A blocked live check counts as a top item: confirm real crawlers get through. If any Problem exists, the Problem with the most points lost always takes one of the three places, because it's something the user can fix now.>

## All results

| Rule | What it checks | Code | Live | Where |
| --- | --- | --- | --- | --- |
| GEO-013 | <plain name> | Clear / Problem / Can't tell / Not applicable | <same words, or "Not run"> | `<file>:<line>` or what you read |

<The Code and Live cells hold only those exact words. Route counts and notes go in the Where column.>

## Can't tell from code

- **<Rule>:** <why the code doesn't decide this> <how to confirm it>
- **Bot protection:** code can't show whether a CDN or firewall lets real crawlers through. Unless a live check settled this, always include this line and suggest `geopilot logs <access log>`, which checks real crawlers against their published addresses.

## Assumptions

- <Anything you assumed, such as "you want AI search tools to find this site".>

## What to do next

1. Run the geopilot `fix` command to apply item 1. You'll see every change before anything is written.
2. Run the geopilot `explain` command with any rule id, such as `GEO-014`, to learn more.
3. For proof from a running site, ask for a live scan with its URL.

Technical readiness only. GEO does not measure or predict citations, rankings, traffic or inclusion in any AI or search product.
```

If nothing is wrong, say so plainly, and use "Do these first" for the biggest unknowns. Don't invent work to fill the section, and never suggest word counts, mandatory FAQs or `llms.txt` as ways to be found.
