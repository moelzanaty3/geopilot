# Geopilot vs a plain prompt

This compares the geopilot plugin with asking the same model directly, on repositories with known answers. See the [write-up in the docs](https://moelzanaty3.github.io/geopilot/docs/benchmark/).

- [`PREREGISTRATION.md`](PREREGISTRATION.md): what would count as a win, written before any run, with later changes listed at the end.
- [`fixtures/`](fixtures/): six small projects.
- [`truth.json`](truth.json): the answer key, with planted problems and decoys.
- [`run.mjs`](run.mjs): runs both arms, grades the reports blind and summarizes them.
- [`results/`](results/): reports, grades and `summary.json`. `results/first-run/` holds geopilot's results before it was changed.

## Run it

```bash
node evals/run.mjs            # any missing reports, then grades and a summary
node evals/run.mjs --runs 1   # a cheap check
```

It needs an authenticated `claude` CLI and costs a few dollars. It reuses reports already in `results/`, so delete them to rerun from scratch.
