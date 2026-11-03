# The report

Write for someone who has never heard of GEO. Use this structure and these headings, in this order. Explain each term the first time you use it, and don't shame anyone for what's missing.

```markdown
# GEO report: <project name>

**New to GEO?** GEO (generative engine optimization) means making your site easy for search engines and AI tools to find, read and quote. This report checks the technical basics in your code.

## Code score: <score>/100, <band>

Confidence: <High|Medium|Low> (checked <possible> of <applicable> points).
How it's calculated: <earned> earned ÷ <possible> possible × 100 = <score>.

<One or two plain sentences on what this means for this project.>

## Do these first

### 1. <What to do, in plain words>
- **Why it matters:** <one sentence about real-world effect>
- **Where:** `<file>:<line>`
- **What the code says:** `<exact quote>`
- **Size:** <Small | Medium | Large>
- **Score after this fix:** <recalculated score>

<Up to three items, biggest score gain first. Ties go to the smaller change.>

## All results

| Rule | What it checks | Result | Where |
| --- | --- | --- | --- |
| GEO-013 | <plain name> | Clear / Problem / Can't tell / Not applicable | `<file>:<line>` or what you read |

## Can't tell from code

- **<Rule>:** <why the code doesn't decide this> <how to confirm it>

## Assumptions

- <Anything you assumed, such as "you want AI search tools to find this site".>

## What to do next

1. Run the geopilot `fix` command to apply item 1. You'll see every change before anything is written.
2. Run the geopilot `explain` command with any rule id, such as `GEO-014`, to learn more.
3. For proof from a running site, start it and ask for a live scan with its URL.

Technical readiness only. GEO does not measure or predict citations, rankings, traffic or inclusion in any AI or search product.
```

If nothing is wrong, say so plainly, and use "Do these first" for anything you couldn't confirm. Don't invent work to fill the section, and never suggest word counts, mandatory FAQs or `llms.txt` as ways to be found.
