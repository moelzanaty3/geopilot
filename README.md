# geopilot

**Find the observable issue, show the evidence, trace its source when reliable, propose the smallest safe change, and honestly report what was verified.**

geopilot is an open-source, local-first technical readiness auditor and source-aware remediation assistant for websites. It is an implementation of the GEO Build Specification v2.2.1: a deterministic CLI that is useful on its own, plus a portable agent skill that drives it from your coding agent.

> Technical readiness only. GEO does not measure or predict citations, rankings, traffic or inclusion in any AI or search product.

Docs: https://moelzanaty3.github.io/geopilot/

## Quick start

```bash
npx geopilot scan https://www.example.com          # any stack (T0)
npx geopilot scan .                                 # repository: source locations on Next.js App Router / static HTML
npx geopilot scan . --url http://127.0.0.1:3000     # both: the strongest evidence
npx geopilot fix                                    # dry run of closed-list fixes
npx geopilot fix --apply --approve <fixId> --serve  # guarded fix, verified on a server GEO starts after the write
npx geopilot agent install --host claude-code       # the agent skill
```

The binary is also available as `geo-check`.

## What it does

| | |
| --- | --- |
| **Rules** | GEO-013 robots reachability · GEO-009 search-crawler access vs declared policy · GEO-014 indexability of listed/linked routes · GEO-015 canonicals · GEO-003 server HTML content · GEO-004 JSON-LD · GEO-011 sitemaps · GEO-012 title/description/lang · GEO-016 server-rendered links · GEO-017 snippet restrictions · GEO-002 accessibility subset · GEO-101 app association files; GEO-010 and GEO-102 informational |
| **Outputs** | Readiness, coverage, confidence and assessment scope, kept separate. Readiness counts direct evidence only, never passes a rule on part of its sub-checks, is capped at 40 on blocker conditions, and is hidden below 50% coverage |
| **Provenance** | `exact` / `file` / `candidate` / `unmapped` / `absent`, read from source as AST — never executed — with documented downgrades (middleware, i18n, dynamic routes, unknown Next.js majors) |
| **Fixes** | S1 sitemap line in robots.txt, S2 `lang` on root `<html>` (safe); G1 remove literal noindex, G2 add canonical, G3 static `app/sitemap.ts` (guarded). Snapshots, byte-exact rollback, V1–V4 verification |
| **Freshness** | V4 counts only when GEO itself started your dev server after the write (`fix.serve`, `--serve`). Anything else is `applied_unverified`, exit 6 |
| **Safety** | SSRF guard that pins the validated address to the socket; private targets only when named; robots.txt respected; no telemetry, accounts or model calls |

## Repository layout

```
packages/geopilot/   the published CLI and library (src/, test/, schemas/)
skill/geo/             the canonical agent skill (copied into the package at build)
web/                   the documentation site (Next.js static export → GitHub Pages)
docs/adr/              decisions taken while implementing the specification
```

## Development

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test          # fixtures A–E, 10k-case scoring properties, SSRF, fix engine incl. real V4 serve runs
pnpm build
pnpm web:dev       # docs site on http://localhost:3000
```

Requires Node 22.18 or newer. Commits follow Conventional Commits; merges to `main` release through semantic-release with npm trusted publishing (see [Releases](https://moelzanaty3.github.io/geopilot/docs/releases/)).

## Status

This is the Phase 1 alpha slice with the parts of Phase 2 it needs to stay honest. Not yet built: a browser renderer (GEO-003/GEO-002 report `not_evaluated`), SARIF and the GitHub Action, `review`/baselines/hooks, fixes G4/G5, and agent hosts other than Claude Code. See [ADR-0004](docs/adr/0004-phase-scope.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
