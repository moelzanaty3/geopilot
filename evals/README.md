# Geopilot vs a plain prompt

This compares the geopilot plugin with asking the same model directly, on repositories with known answers. See the [write-up in the docs](https://moelzanaty3.github.io/geopilot/docs/benchmark/).

- [`PREREGISTRATION.md`](PREREGISTRATION.md): what would count as a win, written before any run, with later changes listed at the end.
- [`fixtures/`](fixtures/): nine small projects. Three are marked `heldOut` in `truth.json`.
- [`truth.json`](truth.json): the answer key, with planted problems and decoys.
- [`run.mjs`](run.mjs): runs both arms, grades the reports blind and summarizes them.
- [`results/`](results/): reports, grades and `summary.json`. The current run is at the top level. `first-run/`, `second-run/`, `third-run/`, `third-run-b/`, `third-run-c/` and `fourth-run/` hold earlier results.

`results/copilot-clean/` holds Copilot CLI runs on the three held-out projects. They were run by hand, with no geopilot plugin installed for the plain arm, and graded with `--grade-only <dir>`. Copilot runs have no cost figure.

## Run it

```bash
node evals/run.mjs            # any missing reports, then grades and a summary
node evals/run.mjs --runs 1   # a cheap check
node evals/run.mjs --tuning   # leaves out the held-out projects, for use while changing a prompt
```

It needs an authenticated `claude` CLI and costs a few dollars. It reuses reports already in `results/`, so delete them to rerun from scratch.
