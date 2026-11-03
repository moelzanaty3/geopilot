# geopilot

**Find the issue. Trace it to source. Prove the fix.**

[![npm version](https://img.shields.io/npm/v/geopilot?color=1d9bf0&label=npm)](https://www.npmjs.com/package/geopilot)
[![node](https://img.shields.io/node/v/geopilot?color=1d9bf0)](https://www.npmjs.com/package/geopilot)
[![license](https://img.shields.io/npm/l/geopilot?color=1d9bf0)](LICENSE)
[![docs](https://img.shields.io/badge/docs-moelzanaty3.github.io%2Fgeopilot-1d9bf0)](https://moelzanaty3.github.io/geopilot/)

**[Documentation](https://moelzanaty3.github.io/geopilot/)** · [Getting started](https://moelzanaty3.github.io/geopilot/docs/getting-started/) · [Rules](https://moelzanaty3.github.io/geopilot/docs/rules/) · [CLI](https://moelzanaty3.github.io/geopilot/docs/cli/) · [Agent plugins](https://moelzanaty3.github.io/geopilot/docs/agent/) · [npm](https://www.npmjs.com/package/geopilot)

geopilot audits any website for the technical conditions crawlers and AI search systems document: robots, sitemaps, indexability, canonicals, metadata and structured data. It shows the evidence, maps the problem to the line that caused it, proposes the smallest safe change, and reports honestly what was verified.

It runs on your machine, with no accounts, telemetry or model calls.

> Technical readiness only. geopilot does not measure or predict citations, rankings, traffic or inclusion in any AI or search product.

## Quick start

Requires Node 22.18 or newer.

```bash
npx geopilot scan https://www.example.com        # any stack
npx geopilot scan .                              # a repository, with source locations
npx geopilot scan . --url http://127.0.0.1:3000  # both: the strongest evidence
npx geopilot fix                                 # preview fixes; nothing is written
```

A repository scan on a Next.js app looks like this:

```text
Readiness   insufficient evidence
Coverage    43%    Confidence  82%    Assessment  partial
· 6 rules need runtime evidence — re-run with --url

HIGH  GEO-014  /pricing  /pricing sets robots noindex in its metadata
      app/pricing/page.tsx:5  provenance exact
      fix G1-b75653d6 (guarded)  → geopilot fix --rule GEO-014
MED   GEO-011  site  public/robots.txt has no Sitemap: line
      public/robots.txt  provenance exact
      fix S1-6d0f6bea (safe)  → geopilot fix --rule GEO-011
```

Apply a guarded fix by its id, then have geopilot verify it on a server it starts after the write:

```bash
npx geopilot fix --apply --approve <fixId> --serve
```

## Use it from your coding agent

Plugins add five agents and six commands that drive the same CLI. On Codex, the marketplace plugin carries them as skills; install into the repo for real subagents. They keep engine findings apart from their own recommendations, and they never apply a guarded fix without its id.

| Host | Install | Status |
| --- | --- | --- |
| Claude Code | `/plugin install geopilot --marketplace moelzanaty3/geopilot` | Supported |
| GitHub Copilot CLI | `copilot plugin marketplace add moelzanaty3/geopilot`<br>`copilot plugin install geopilot@geopilot` | Supported |
| OpenCode | `npx geopilot agent install --host opencode` | Supported |
| OpenAI Codex | `codex plugin marketplace add moelzanaty3/geopilot`<br>`codex plugin add geopilot@geopilot` | Supported |
| Claude Code or Codex, committed to one repo | `npx geopilot agent install --host claude-code`<br>`npx geopilot agent install --host codex` | Supported |
| Other hosts that read `AGENTS.md` | `npx geopilot agent install --host agents-md --write-agents-md` | Provisional |

**Agents:** `scanner`, `fixer`, `reviewer`, `investigator`, `explainer`
**Commands:** `scan`, `fix`, `review`, `explain`, `insights`, `init`

[Read the plugin guide →](https://moelzanaty3.github.io/geopilot/docs/agent/)

## What you get

| | |
| --- | --- |
| **Rules** | A closed catalogue covering robots, crawler access, indexability, canonicals, server HTML, JSON-LD, sitemaps, metadata, links and snippet controls. Each rule cites the documentation it rests on. [Browse the rules](https://moelzanaty3.github.io/geopilot/docs/rules/). |
| **Four separate outputs** | Readiness, coverage, confidence and assessment scope are never blended. Below 50% coverage, geopilot shows no readiness number rather than guess. [How scoring works](https://moelzanaty3.github.io/geopilot/docs/scoring/). |
| **Source tracing** | On Next.js App Router and static HTML, findings map to file and line by reading source as an AST. Source is never executed, and every mapping states how much to trust it. [Provenance](https://moelzanaty3.github.io/geopilot/docs/provenance/). |
| **Fixes** | Five closed-list fixes, each with snapshots and byte-exact rollback. Safe fixes apply with `--apply`; guarded fixes also need their id. [Fixes and verification](https://moelzanaty3.github.io/geopilot/docs/fixes/). |
| **Honest verification** | Runtime verification counts only on a server geopilot started after the write. Anything less is reported as `applied_unverified`. |
| **Safety** | An SSRF guard, private targets only when you name them, and robots.txt respected. [Security and privacy](https://moelzanaty3.github.io/geopilot/docs/security/). |

## Repository layout

```
packages/geopilot/   the published CLI and library (src/, test/, schemas/)
skill/              canonical agent kit: the geo skill, agents/, commands/ (the only copy a human edits)
plugins/            generated host plugins (Claude Code + Copilot, OpenCode, project install)
web/                the documentation site (Next.js static export → GitHub Pages)
docs/adr/           decisions taken while implementing the specification
```

## Development

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test           # fixtures, scoring properties, SSRF, fix engine incl. real V4 serve runs
pnpm build
pnpm publish:local  # install this working tree as the global geopilot (pnpm publish:local:clean removes it)
pnpm web:dev        # docs site on http://localhost:3000
```

Commits follow Conventional Commits; merges to `main` release through semantic-release with npm trusted publishing. See [Releases](https://moelzanaty3.github.io/geopilot/docs/releases/).

## Status

This is an early alpha. A browser renderer, SARIF output, the GitHub Action, the `review` CLI command, baselines and hooks aren't built yet. [See the current scope](docs/adr/0004-phase-scope.md).

## Links

- [Documentation](https://moelzanaty3.github.io/geopilot/)
- - [Issues](https://github.com/moelzanaty3/geopilot/issues)
- [Contributing](CONTRIBUTING.md)

## License

[Apache-2.0](LICENSE)
