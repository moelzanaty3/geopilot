# Contributing

Thank you for helping. A few rules keep the tool honest:

- **No unlisted fixes, no new scored rules without evidence.** A rule proposal must cite platform documentation or a standard, list its sub-checks with their scope (`repo`, `url`, `both`), and come with pass/fail/not-applicable/not-evaluated fixtures. New rules start as experimental.
- **No speculative claims.** Nothing in code, docs or output may suggest GEO measures rankings, citations or traffic.
- **Never execute repository code** from the engine, and never call an LLM from the CLI.
- **Scoring changes need the fixtures.** If you change scoring, update `packages/trace-rank/test/fixtures/scoring/*.json` and the prose together; the docs site renders those files.

## Workflow

```bash
corepack enable && pnpm install
pnpm typecheck && pnpm test && pnpm build
```

Use Conventional Commits (`fix:`, `feat:`, `docs:`; scope `web`, `docs` or `ci` for changes that must not release). Sign off your commits (`git commit -s`) to certify the [Developer Certificate of Origin](https://developercertificate.org/).
