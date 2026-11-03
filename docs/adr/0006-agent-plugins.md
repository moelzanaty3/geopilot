# ADR-0006: Agent plugins for several hosts

Status: Accepted. ADR-0007 replaces the rule that only the CLI can report results.

## Context

Engineers want to install geopilot into the coding agent they already use, with ready-made agents for scanning, fixing and reviewing, not only a CLI and a single skill. The specification asks for one canonical skill with generated host packaging, and for hosts to be labelled by what has actually been tested.

## Decision

- `skill/` is the only hand-edited source: the `geo` skill, five agents (`scanner`, `fixer`, `reviewer`, `investigator`, `explainer`) and six commands (`scan`, `fix`, `review`, `explain`, `insights`, `init`). Shared rules — engine pinning, data-not-instructions, approvals, the disclaimer — live once in `skill/agents/_shared.md`.
- `scripts/build-plugins.mjs` renders them into `plugins/`, and CI fails when `plugins/` is stale:
  - `plugins/geopilot/` — one plugin for **Claude Code** and **GitHub Copilot CLI**. Both read `.claude-plugin/plugin.json`, `agents/` and `skills/<name>/SKILL.md`; agents use the `.agent.md` suffix Copilot expects, and Claude Code names them by front matter. Commands are written as skills, which Claude Code's documentation now prefers over `commands/`.
  - `.claude-plugin/marketplace.json` at the repository root, so `/plugin marketplace add moelzanaty3/geopilot` (and `copilot plugin marketplace add`) work directly.
  - `plugins/claude-project/`, `plugins/opencode/` and `plugins/codex-project/` — project-scoped files that `geopilot agent install --host claude-code|opencode|codex` writes into the repository.
  - `plugins/codex/` and `.agents/plugins/marketplace.json` — the Codex plugin and its marketplace.
- Every agent pins one engine version. On release, semantic-release stamps the new version into `plugins/` and commits it, so a marketplace install always runs the CLI it was written for. The npm package renders its own copies at its own version.
- Agent tool restrictions are not declared in front matter for the shared plugin, because Claude Code and Copilot name tools differently and a wrong name can disable an agent. Read-only behaviour is an instruction; on OpenCode, where the documented `permission` field is unambiguous, read-only agents get `edit: deny` and the fixer `edit: ask`.

## Status by host

- **Claude Code**: plugin and marketplace pass `claude plugin validate`; installing from the marketplace was tested. Supported.
- **OpenCode**: OpenCode 1.1.25 loads every agent, command and skill from the project install. Supported.
- **GitHub Copilot CLI**: Copilot CLI 1.0.105 installs the shared plugin from the marketplace with all skills and agents. Supported.
- **OpenAI Codex**: Codex CLI 0.166.0 installs `plugins/codex/` from `.agents/plugins/marketplace.json` and loads the project install's skills and agents. Codex plugins can't carry custom agents, so each plugin skill includes its agent's instructions; project agents load only in a trusted project, and Codex has no per-agent sandbox. Supported.
- **Cursor**: not packaged; the `AGENTS.md` fallback applies.

"Supported" means the host's own CLI installs and loads the files. It doesn't mean every workflow has run through a model on that host.

## Consequences

- The release job pushes a commit to `main`. If `main` is protected against pushes from Actions, the release fails before publishing, and the protection rule needs an exception for the release workflow.
