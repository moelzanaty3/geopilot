# geopilot

**Find the issue. Trace it to source. Prove the fix.**

[![npm version](https://img.shields.io/npm/v/geopilot?color=1d9bf0&label=npm)](https://www.npmjs.com/package/geopilot)
[![node](https://img.shields.io/node/v/geopilot?color=1d9bf0)](https://www.npmjs.com/package/geopilot)
[![license](https://img.shields.io/npm/l/geopilot?color=1d9bf0)](LICENSE)
[![docs](https://img.shields.io/badge/docs-moelzanaty3.github.io%2Fgeopilot-1d9bf0)](https://moelzanaty3.github.io/geopilot/)

**[Documentation](https://moelzanaty3.github.io/geopilot/)** · [Getting started](https://moelzanaty3.github.io/geopilot/docs/getting-started/) · [Rules](https://moelzanaty3.github.io/geopilot/docs/rules/) · [CLI](https://moelzanaty3.github.io/geopilot/docs/cli/) · [Agent plugins](https://moelzanaty3.github.io/geopilot/docs/agent/) · [npm](https://www.npmjs.com/package/geopilot)

geopilot makes your site or app easy for search engines and AI tools to find, read and quote, and you don't need to know anything about GEO to start. Ask your coding agent to scan your code. You get a score, the exact lines to change and a plain explanation of why they matter. Then it fixes them with your approval.

> Technical readiness only. geopilot does not measure or predict citations, rankings, traffic or inclusion in any AI or search product.

## Quick start

Install the plugin in your coding agent. The audit itself needs no package install and no running site, and it works on any framework.

| Host | Install | Run a scan |
| --- | --- | --- |
| Claude Code | `/plugin install geopilot --marketplace moelzanaty3/geopilot` | `/geopilot:scan` |
| GitHub Copilot CLI | `copilot plugin marketplace add moelzanaty3/geopilot`<br>`copilot plugin install geopilot@geopilot` | Ask it to use the `scan` skill |
| OpenAI Codex | `codex plugin marketplace add moelzanaty3/geopilot`<br>`codex plugin add geopilot@geopilot` | `$geopilot:scan` |
| OpenCode | `npx geopilot agent install --host opencode` | `/geopilot-scan` |

To commit the agents into a repository for your whole team, run `npx geopilot agent install --host claude-code` or `--host codex`. [Read the plugin guide](https://moelzanaty3.github.io/geopilot/docs/agent/).

## What your agent does

| Command | What you get |
| --- | --- |
| `scan` | A code score with its arithmetic, every rule checked, and the fixes to do first, each with its file, line and quote |
| `fix` | Each exact change and why it matters. It applies only what you approve, then updates the score |
| `explain` | GEO, or any rule, in plain words, using your own code as the example. With no argument, a guided tour |
| `review` | Whether a branch makes your site harder or easier to find |
| `insights` | A step-by-step plan for a hard question |
| `init` | A `geo.config.json`, when you want to declare your domain and policy |

The code score comes from reading your source, so it can't prove what only a running site shows, such as real status codes and headers. Those rules are reported as "can't tell", never guessed. Scans come from a model reading code, so results can vary between runs.

## Live checks with the CLI

To measure a running site, use the CLI. It's deterministic, makes no model calls, and needs Node 22.18 or newer.

```bash
npx geopilot scan https://www.example.com        # any stack
npx geopilot scan . --url http://127.0.0.1:3000  # your code and your running site
npx geopilot fix                                 # preview closed-list fixes; nothing is written
```

Its live readiness number is reported separately from the code score. Apply a guarded fix by its id, then verify it on a server geopilot starts after the write:

```bash
npx geopilot fix --apply --approve <fixId> --serve
```

## What you get

| | |
| --- | --- |
| **Rules** | A closed catalogue covering robots, crawler access, indexability, canonicals, server HTML, JSON-LD, sitemaps, metadata, links and snippet controls. Each rule cites the documentation it rests on. [Browse the rules](https://moelzanaty3.github.io/geopilot/docs/rules/). |
| **Live scoring** | On live checks, readiness, coverage, confidence and assessment scope are never blended. Below 50% coverage, the CLI shows no readiness number rather than guess. [How scoring works](https://moelzanaty3.github.io/geopilot/docs/scoring/). |
| **Source tracing** | Agents trace findings on any framework. The CLI also maps findings on Next.js App Router and static HTML by reading source as an AST. Source is never executed. [Provenance](https://moelzanaty3.github.io/geopilot/docs/provenance/). |
| **Fixes** | Agents propose fixes for your stack and apply them with your approval. The CLI adds five closed-list fixes, each with snapshots and byte-exact rollback. [Fixes and verification](https://moelzanaty3.github.io/geopilot/docs/fixes/). |
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
