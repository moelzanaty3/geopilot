# ADR-0007: Audit from code first, with the CLI as the live check

Status: Accepted. Partly supersedes the authority rule in ADR-0006.

## Context

The plugins only ran the CLI and repeated its output. The rules lived in the CLI, so the agents had nothing of their own to apply. On a framework the engine can't map, a user with no running site got an empty report with 0% coverage, and had to install a package to get it.

The people we want to help often have never heard of GEO. They need a clear report and a next step on the code in front of them.

## Decision

- The agents audit by reading the code against the rules. This needs no install, no CLI and no running site, and works on any framework.
- `skill/rules.md` says how to check each rule by reading code, in plain words. `scripts/build-plugins.mjs` merges it with the facts in the engine's catalogue and embeds the result in each agent, because agents can't reliably locate skill files across hosts. The build fails if a rule has no guide, so the CLI and agents can't disagree about what a rule is.
- A rule gets one of four results: Clear, Problem, Can't tell or Not applicable. A Problem needs a file, a line and an exact quote. If code doesn't decide a rule, the result is Can't tell.
- Reports always carry a **code score**, calculated by a published formula from the catalogue's weights, with the arithmetic shown and a confidence level. Below 50% of applicable weight checked, confidence is Low; the number is still shown.
- The CLI measures a running site and reports **live readiness**. It runs only when the user asks for it or gives a URL. The two numbers are never merged.
- Fixes are made by the agent on any framework, after the user sees and approves each exact change. They're reported as "confirmed in code, not yet confirmed on a live site".

## Consequences

- The code score comes from a model reading code, so two scans can differ. Requiring quotes and giving every rule an explicit result reduces this but doesn't remove it. Only live readiness is deterministic.
- Reading code can't prove everything: real status codes, redirects, CDN rules and headers set outside the repository stay Can't tell until a live check.
- Agent approvals are instructions to the model, not technical controls.
- The disclaimer stays: neither number measures or predicts citations, rankings, traffic or inclusion in any AI or search product.
