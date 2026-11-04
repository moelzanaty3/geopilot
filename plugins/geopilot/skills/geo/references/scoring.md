# The score

The score tells someone how ready their site looks, and shows the arithmetic so they can check it. The CLI uses the same formula, so calculate it exactly like this, from the rule weights. Never adjust the result by judgement.

**Give each scored rule exactly one result.** The result cell holds only one of these four words, with no qualifiers such as "Clear (but...)".

| Result | Meaning | In the score |
| --- | --- | --- |
| Clear | You read the code that decides this for every route you checked, and it's fine | Earns its full weight |
| Problem | You can quote the code that causes it on at least one route | Earns its weight × clear routes ÷ (clear + problem routes). A site-wide problem earns 0 |
| Can't tell | Something outside the code decides this, such as a CMS, a feature flag or a CDN, and no route has a quotable problem | Earns 0 now, and could earn its full weight |
| Not applicable | The rule doesn't apply to this project | Left out completely |

**How to decide:**

- A **check marked "live only"** on a rule never changes its code result. List it under "Can't tell from code", but the rule can still be Clear.
- **Can't tell never means you didn't look.** "I didn't read it" is never a reason for this result. Read the navigation, shared components and every JSON-LD source before using it. If you truly ran out of room, say what you didn't read.
- **A Problem must survive a check.** Code you can quote isn't proof of what crawlers receive. A config value might not be used, and the real file might be somewhere else, such as a `public/` or `static/` folder, a build step, a route or middleware. Search for those, and find what reads the value. If you'd have to add a caveat such as "I didn't read the library that serves this", keep reading. If that can't settle it, the result is Can't tell.
- A **value decided at runtime** (CMS, API, feature flag, environment switch) is unknown for that route. If that leaves no Problem and any route unknown, the rule is Can't tell.
- A **route with an unknown value** doesn't count in clear or problem routes.
- A **shared template** counts once per route you sampled. Two phone routes using one template are two routes.
- A **fallback default** counts as clear only for the route it's written for, such as the home page. On other routes that a CMS might override, it's unknown.

**Calculate:**

1. **Earned** = the total that Clear and Problem rules earned.
2. **Checked** = the total weight of Clear and Problem rules.
3. **Unknown** = the total weight of Can't tell rules.
4. **Applicable** = checked + unknown.
5. **Low** = earned ÷ applicable × 100, rounded. This is the score if every unknown turns out to be a problem.
6. **High** = (earned + unknown) ÷ applicable × 100, rounded. This is the score if every unknown turns out to be clear.
7. **Cap:** if you can quote code that causes a blocker listed on a rule, neither number can be above 40. Say which blocker applied.
8. **Confidence** = checked ÷ applicable. 80% or more is High, 50–79% is Medium, and below 50% is Low.

Show the score as `low–high`. If they're equal, show one number. If checked is 0, say "No score yet" and explain why.

**Name a band only at High confidence, from the low number:** 90–100 Strong, 70–89 Good, 50–69 Needs work, 0–49 At risk. At Medium or Low confidence, say **Unconfirmed**, because a low number that's mostly unknowns says nothing bad about the site.

**Example:** GEO-013 is Clear (3 of 3). GEO-014 has a Problem on 1 of 3 routes (3 × 2/3 = 2 of 3). GEO-011 is a site-wide Problem (0 of 2). GEO-012 is Clear (2 of 2). The other applicable rules total 15 and are Can't tell. Earned is 7, checked is 10, unknown is 15 and applicable is 25. Low is 7 ÷ 25 = **28**. High is 22 ÷ 25 = **88**. Confidence is 10 ÷ 25 = 40%, which is **Low**. The score is **28–88, Unconfirmed**.

**Score after a fix:** apply the fix to these results and recalculate both numbers. A check you recommend moves the score only by narrowing the range: show the range if it comes back clear and if it comes back a problem.

**Always:**

- Say **code score** for a score from reading source, and **live score** for one from the CLI. They use one formula on different evidence, so show them separately and never average them.
- Show the arithmetic line in the report.
- Don't use a score to compare sites. It isn't a ranking, and a higher score doesn't guarantee more visibility.
