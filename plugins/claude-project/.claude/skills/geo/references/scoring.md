# The code score

The code score tells someone how ready their code looks, and shows the arithmetic so they can check it. Calculate it exactly like this, from the rule weights.

**Give each scored rule one verdict:**

| Verdict | Meaning | In the score |
| --- | --- | --- |
| Clear | You read the code that decides this, and it's fine | Earns its full weight |
| Problem | You can quote the code that causes it | Earns its weight × the share of checked routes that are clear (0 for a site-wide rule) |
| Can't tell | The code doesn't decide this, or you couldn't read it | Left out, and lowers confidence |
| Not applicable | The rule doesn't apply to this project | Left out completely |

**Calculate:**

1. **Points possible** = the total weight of Clear and Problem rules.
2. **Points earned** = what those rules earned, using the table above.
3. **Code score** = points earned ÷ points possible × 100, rounded to a whole number.
4. **Cap:** if you can quote code that causes a blocker listed on a rule, the score can't be above 40. Say which blocker applied.
5. **Confidence** = points possible ÷ the total weight of every applicable rule (Clear, Problem and Can't tell). 80% or more is High, 50–79% is Medium, and below 50% is Low.

If points possible is 0, say "No score yet" and explain what you couldn't read.

**Name the band:** 90–100 Strong, 70–89 Good, 50–69 Needs work, 0–49 At risk.

**Example:** GEO-013 is Clear (3 of 3). GEO-014 is a Problem on 1 of 3 routes (3 × 2/3 = 2 of 3). GEO-011 is a Problem site-wide (0 of 2). GEO-012 is Clear (2 of 2). That's 7 earned of 10 possible, so the score is **70**. If the applicable rules total 25, confidence is 10 ÷ 25 = 40%, which is **Low**.

**Always:**

- Call it the **code score**. It comes from reading source, not from measuring a running site.
- Show the arithmetic line in the report.
- Never merge it with the CLI's live readiness number. Report them separately, because they measure different things.
- Don't use it to compare sites. It isn't a ranking, and a higher score doesn't guarantee more visibility.
