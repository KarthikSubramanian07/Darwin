# Contributing to Darwin (sprint lane map)

Four lanes, four owners. **No two people touch the same critical file at once.** The
demo-critical path (the race/evolution loop + the dashboard) is protected from experimental
work. Every integration lands as an isolatable, feature-flagged module that degrades to a
clean no-op, so the core loop always runs offline.

## Lanes

| Lane | Person | Scope | Owns (files) |
|------|--------|-------|--------------|
| **A** | person 1 | industry → task decomposition + synthetic data generation | `pipeline/decompose.py`, `pipeline/synth.py`, `darwin/eval/task.py`, `scripts/build_task.py`, `data/task/` |
| **B** | person 2 | the Braintrust eval harness: scorers, experiments, the leaderboard's credibility | `darwin/eval/fitness.py`, scorer configs, `tests/test_immutable_grader.py` |
| **C** | person 3 | the parallel model race on Fireworks + Daytona sandbox execution + pre-computing the extra industries | `darwin/core/engine.py`, `darwin/core/mutate.py`, `darwin/sandbox/*`, `darwin/safety/guards.py`, `data/runs/` (precomputed library) |
| **D** | person 4 | dashboard, WorkOS login, CodeRabbit, Devpost, and driving the demo | `dashboard/`, `darwin/server/events.py`, `darwin/review/coderabbit.py`, `.coderabbit.yaml`, Devpost |

**Shared, frozen contract (coordinate before editing):** `darwin/core/genome.py` and
`darwin/core/population.py` hold the data shapes every lane depends on (`Genome`, `Variant`,
`Generation`, `RunRecord`, `RoutingCard`). Change them only in a PR that updates
[SPEC.md](./SPEC.md) section 10 in the same commit.

## One product, not two

Model selection is core, not an add-on: the `model` is a first-class gene on the genome. So the
"parallel model race" (Lane C) and "self-improvement" are the same loop viewed at different zoom
levels. **A** produces the tasks + data, **B** scores every variant/model, **C** runs the race
and evolution in sandboxes, **D** visualizes it as the task×model grid and the routing card.

## Rules

1. **Lane A's loop is sacred.** Nobody else edits `core/engine.py` during a working demo.
2. **Feature-flag every integration.** With `FEATURE_DAYTONA/BRAINTRUST/FIREWORKS=0`, the
   loop must still run and still climb on a canned task. That flag-off path is the demo floor.
3. **VERIFY sponsor APIs against current docs** before writing calls. Do not invent SDK
   method names, base URLs, or model ids. Note substitutions in `DECISIONS.md`.
4. **The grader is immutable.** Never hand `eval/fitness.py` to the mutator; never put it in a
   writable sandbox path. `tests/test_immutable_grader.py` enforces this - keep it green.
5. **Commit under your own identity**, in clean, in-window, timestamped commits.

## Dev setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
pytest            # tests must pass before you push
ruff check .      # lint before you push
```

## Branch & PR flow

- Branch off `main`: `lane-a/mutation-crossover`, `lane-b/snapshot-rollback`, etc.
- Open a PR early; CI (lint + tests) must be green to merge.
- Keep PRs scoped to your lane's files to avoid conflicts on the sacred path.
