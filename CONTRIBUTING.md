# Contributing to Darwin (sprint lane map)

Four lanes, four owners. **No two people touch the same critical file at once.** The
demo-critical path (the race/evolution loop + the dashboard) is protected from experimental
work. Every integration lands as an isolatable, feature-flagged module that degrades to a
clean no-op, so the core loop always runs offline.

## Lanes

| Lane | Person | Scope | Owns (files) |
|------|--------|-------|--------------|
| **A** | person 1 | evolution engine + mutation (sacred path): the model gene, the climbing loop, the decompose/synth pipeline | `darwin/core/engine.py`, `darwin/core/genome.py`, `darwin/core/population.py`, `darwin/core/mutate.py`, `pipeline/decompose.py`, `pipeline/synth.py` |
| **B** | person 2 | Daytona sandbox pool + safety: parallel execution, snapshot rollback, the four guard pillars | `darwin/sandbox/daytona.py`, `darwin/sandbox/runner.py`, `darwin/safety/guards.py` |
| **C** | person 3 | Braintrust fitness + eval: scorers, experiments, the leaderboard's credibility | `darwin/eval/fitness.py`, `darwin/eval/task.py`, scorer configs, `tests/test_immutable_grader.py` |

**Shared, frozen contract (coordinate before editing):** `darwin/core/genome.py` and
`darwin/core/population.py` hold the data shapes every lane depends on (`Genome`, `Variant`,
`Generation`, `RunRecord`, `RoutingCard`). Change them only in a PR that updates
[SPEC.md](./SPEC.md) section 10 in the same commit.

## One product, not two

Model selection is core, not an add-on: the `model` is a first-class gene on the genome. So the
"parallel model race" and "self-improvement" are the same loop viewed at different zoom levels.
**A** runs the evolutionary loop and produces the tasks + data, **B** executes every variant in
isolated sandboxes, **C** scores every variant/model via Braintrust, **D** visualizes it as the
task×model grid and the routing card.

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
python3.11 -m venv .venv && source .venv/bin/activate   # 3.11+ required (Daytona SDK needs 3.10+)
pip install -r requirements.txt
cp .env.example .env
pytest            # tests must pass before you push
ruff check .      # lint before you push
```

Useful runners (Lane C):

```bash
python scripts/smoke_sponsors.py            # ~15s connectivity check: Fireworks catalog + one
                                            # throwaway Daytona sandbox (run before any demo)
python -m darwin.main --offline --echo      # offline demo floor (all flags off, still climbs)
python -m darwin.main --echo                # live run using the feature flags/keys in .env
SEED_REGRESSION_GEN=2 python -m darwin.main --echo   # demo beat: seeded canary regresses in
                                            # gen 2 -> auto-reject + sandbox rollback on screen
python scripts/precompute_library.py --runs 3        # record real RunRecords into data/runs/
                                            # (the honest cached library; prints wall-clock vs
                                            # the 2-minute live budget)
pytest tests/test_daytona_pool.py -q        # includes a live Daytona round-trip when
                                            # FEATURE_DAYTONA=1 and DAYTONA_API_KEY are set
```

Live dashboard (UI wired to real engine events over WebSocket):

```bash
python -m darwin.server.app                 # WS/API server on :8000 (WS /ws streams events,
                                            # POST /api/run starts a run, GET /api/status)
cd dashboard && npm install && npm run dev  # dashboard on :5173; vite proxies /ws + /api to
                                            # :8000. With the server up the page goes LIVE
                                            # (the "Run live" button drives a real run);
                                            # without it, the labelled cached replay renders.
curl -X POST localhost:8000/api/run -H 'Content-Type: application/json' \
     -d '{"task": "coding_bench", "offline": true}'   # start a run without the UI
```

## Branch & PR flow

- Branch off `main`: `lane-a/mutation-crossover`, `lane-b/snapshot-rollback`, etc.
- Open a PR early; CI (lint + tests) must be green to merge.
- Keep PRs scoped to your lane's files to avoid conflicts on the sacred path.
