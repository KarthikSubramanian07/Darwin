# Contributing to Darwin (sprint lane map)

Four lanes, four owners. **No two people touch the same critical file at once.** The
demo-critical path (the evolution loop + the dashboard) is protected from experimental
work. Every integration lands as an isolatable, feature-flagged module that degrades to a
clean no-op, so the core loop always runs offline.

## Lanes

| Lane | Owner | Owns | Deliverable |
|------|-------|------|-------------|
| **A - Evolution + Mutation** (sacred) | | `darwin/core/engine.py`, `genome.py`, `population.py`, `mutate.py` | the score climbs, repeatably |
| **B - Sandbox + Safety** | | `darwin/sandbox/daytona.py`, `runner.py`, `darwin/safety/guards.py` | parallel sandboxes; bad mutation rolled back on stage |
| **C - Fitness + Eval** | | `darwin/eval/fitness.py`, `task.py` | Braintrust as fitness fn; offline before/after table |
| **D - Dashboard + Pitch** | | `dashboard/`, `darwin/server/events.py`, Devpost | the live climbing curve, legible from across a room |

**Cross-lane module:** `darwin/review/coderabbit.py` (the independent reviewer of the
agent's self-written code) is shared by Lane B (promotion gate + safety) and Lane C
(code-quality fitness term + mutation feedback). Coordinate on its interface before editing.

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
