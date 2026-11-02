# ADR-0005: Interpretations of the specification

Status: Accepted

Where the specification was silent or ambiguous, these choices were made.

## Network and robots

- An unreachable robots.txt (DNS failure, refused connection) makes GEO-013 an `error`, not a `fail`: it is missing evidence about the site. A 5xx is a `fail` and caps readiness.
- RFC 9309 says a 5xx or unreachable robots.txt means complete disallow, so GEO fetches no pages in that case unless the operator passes `--ignore-robots` for a target they named. Scoring example B therefore assumes `--ignore-robots`.
- Without a public-suffix list, "registrable domain" is approximated conservatively: same origin by default; `--follow-external` adds subdomains of the target host (with a leading `www.` removed).

## Rules

- GEO-014 subjects are routes listed in a sitemap or linked from crawled server HTML. In a repository-only scan, a literal sitemap defines them; without one, every route is a subject.
- GEO-015 never infers an origin: without `site.origin` the `declared_origin` sub-check cannot run, so the rule is `not_evaluated`.
- GEO-017's header sub-check can run from source on Next.js: no middleware/proxy and no `headers()` in `next.config` means nothing can add the header. This is what lets spec example D treat GEO-017 as fully evaluable.
- The "site-wide noindex" cap applies only when every applicable GEO-014 subject is a direct noindex failure, not merely every evaluated one.
- A `profile` key (`web` | `app`) was added to the configuration to express the opt-in app profile; `appLinks` takes `{ appIds }` for iOS and `{ packageName, sha256CertFingerprints }` for Android.

## Fixes

- `fix --apply` applies safe fixes and lists unapproved guarded fixes as skipped. If `--rule` explicitly asks for a rule whose fix is guarded and unapproved, the command exits 2 before writing anything.
- `runtime_observation` compares against a pre-fix observation of the same path when the original scan had one; otherwise it is `unavailable`. It never affects the outcome.
- The skill's engine version is stamped into the installed copy by `agent install`, because semantic-release sets the package version at publish time.
