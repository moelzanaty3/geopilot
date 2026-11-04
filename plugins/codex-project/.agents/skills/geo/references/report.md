# The report

Write for someone who has never heard of GEO. Use this structure and these headings, in this order. Explain each term the first time you use it, and don't shame anyone for what's missing.

```markdown
# GEO report: <project name>

**New to GEO?** GEO (generative engine optimization) means making your site easy for search engines and AI tools to find, read and quote. This report checks the technical basics.

## Code score: <low>–<high>/100, <band or Unconfirmed>

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
- **Score after this:** <recalculated range, or the two ranges for a check. Always numbers, never a direction such as "moves up">

<Up to three items, most points at stake first. A defect from "Other problems found" can take a place if it's more urgent than a check. Points at stake are the points a Problem has lost, or the full weight of a Can't tell rule. Ties go to the smaller change. A blocked live check counts as a top item: confirm real crawlers get through. If any Problem exists, the Problem with the most points lost always takes one of the three places, because it's something the user can fix now.>

## All results

| Rule | What it checks | Code | Where |
| --- | --- | --- | --- |
| GEO-013 | <plain name> | Clear / Problem / Can't tell / Not applicable | `<file>:<line>` or what you read |

<The Code cell holds only those exact words, or "Not scored" for a rule that's for information only. Route counts and notes go in the Where column, kept short. Add a Live column only when a live check read the site. If it was blocked or didn't run, leave the column out.>

## Other problems found

<Real defects outside the rules that affect how machines find, read or understand this site. They aren't scored. Each needs a file, a line and an exact quote, and a one-line fix. Only list what the code shows is wrong, such as:
- private or sign-in pages in the sitemap, or indexable with no noindex
- a sitemap built from the request's host, or sitemap URLs that differ from canonicals
- hosts that disagree between canonicals, sitemaps and social tags
- structured data that points at the wrong page

Something merely missing or optional isn't a defect: it belongs in "Worth considering" if it belongs anywhere. If there's nothing real, write "None found".>

## Worth considering

Optional ideas from reading this project. They aren't problems, and they don't change the score.

- **<The idea, in plain words>:** `<file>:<line>`: `<exact quote that prompted it>`. <What to do, and why it might help readers or machines.>

<Up to 10, most useful first, one line each. Go through the whole list below before you stop: a project with several pages usually has at least 6. Each idea must rest on something you read in this project: a quote, or for something missing, the file where it would go and what you checked. Name the concrete thing to add or change, so "add the opening hours and address to /visit" and not "improve content". If you truly find nothing, write "None". Don't repeat anything from the sections above, and never move an idea into "Do these first". Look for:
- a page or heading that promises something the page doesn't deliver
- a claim with nothing behind it, such as a number or a list the page never backs up
- what a visitor would come to ask that the site doesn't answer in text
- facts that exist only in an image, a video or a script
- facts already visible on the page that structured data could label, such as a business's address and hours, a product's price or an article's author and date
- a page that's easy to reach but has little linking onward to the pages it relates to
- a sitemap with no `<lastmod>` when real dates exist
- settings that exist but aren't connected to anything, or framework config missing the site's URL
- a list whose items could each have their own page and address
- head basics the code doesn't set, such as `charset`, `viewport` and social tags, and page structure such as `<main>` and headings
- site identity that nothing states in a machine-readable way, such as Organization or WebSite structured data with the name and links the site already shows
- titles and descriptions that exist but don't say what the page is, who it's from or where
- wrong addresses that can't return a real 404, or a hand-kept sitemap the framework could generate

Never suggest:
- `llms.txt`, word counts, longer content for its own sake, keyword changes, or an FAQ just to have one
- reversing or extending a choice that looks deliberate, such as a noindex on a private page, a blocked training crawler or `data-nosnippet`
- improving a page that's deliberately kept out of search
- code changes with no effect on what machines receive, such as swapping to a framework's link component when plain links already work
- anything that promises citations, rankings or traffic: say "might help", never "will">

## Can't tell from code

- **<Rule>:** <why the code doesn't decide this> <how to confirm it>
- **Bot protection:** code can't show whether a CDN or firewall lets real crawlers through. Unless a live check settled this, always include this line and suggest `geopilot logs <access log>`, which checks real crawlers against their published addresses.

## Assumptions

- <Anything you assumed, such as "you want AI search tools to find this site".>
- <What you read, in one line, such as "12 routes, the navigation, 4 main pages and all 6 JSON-LD sources".>

## What to do next

1. Run the geopilot `fix` command to apply item 1. You'll see every change before anything is written.
2. Run the geopilot `explain` command with any rule id, such as `GEO-014`, to learn more.
3. For proof from a running site, ask for a live scan with its URL.

Technical readiness only. GEO does not measure or predict citations, rankings, traffic or inclusion in any AI or search product.
```

If nothing is wrong, say so plainly, and use "Do these first" for the biggest unknowns. Don't invent work to fill the section, and never suggest word counts, mandatory FAQs or `llms.txt` as ways to be found.
