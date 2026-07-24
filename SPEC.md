# Darwin - Build Spec

**The agent that evolves itself, and picks the right model for every task.**

Hackathon working plan. Team of 4. Sponsors: Daytona, Braintrust, Fireworks, CodeRabbit, WorkOS.
Companion to [README.md](./README.md) (the pitch), [CONTRIBUTING.md](./CONTRIBUTING.md) (lane
map), and [DECISIONS.md](./DECISIONS.md) (architecture calls).

---

## 1. The idea (one breath)

You give Darwin a task it is mediocre at (or an industry, which it decomposes into its real
tasks). Darwin spawns a population of agent variants where each *genome* is a full recipe:
system prompt + self-written tool code + params + **which model it runs on**. It runs every
variant in its own isolated Daytona sandbox, scores them all on a Braintrust eval that acts as
the fitness function, keeps the fittest, and mutates the next generation with Fireworks for fast,
cheap, parallel inference. Generation over generation the best score climbs, live, on screen.

There is one idea here, not two: **model choice is just another gene.** Self-improvement and
model selection are the same act at different zoom levels. So Darwin does not only evolve a
better prompt and better tools, it discovers the best model for each task in the same loop. The
champion of each task becomes a *routing card*: for this task, use this model + this prompt +
these tools, at this score, cost, and latency. Nobody picks models per task today; everyone picks
one model for everything and overpays or underperforms. Darwin answers it with evidence, and it
is the machine that produces the specialist, not just the ranking.

The demo wow, in two beats:
1. the fitness score climbs on its own, live, as variants evolve in sandboxes they cannot escape;
2. a task x model grid lights up as evals complete and a final routing card falls out: best model
   per task, with score, cost, and latency.

**Thesis.** The scariest and most important frontier in AI is agents that improve themselves.
Darwin makes it real and makes it safe: self-modification happens only inside disposable
sandboxes, the agent can never edit its own grader, regressions are auto-killed and rolled back,
every rewrite is code-reviewed, and a human signs off on every champion. Bold idea, contained by
construction.

## 2. Sponsor fit (all load-bearing)

| Sponsor | Role |
|---|---|
| **Fireworks** | The mutation engine and the model catalog. Evolving a population is inference-heavy (mutate + evaluate every variant, every generation), and the `model` gene races the open catalog (Llama, Qwen, DeepSeek, Kimi, ...) through one OpenAI-compatible API (`https://api.fireworks.ai/inference/v1`). It is why the loop converges fast enough to climb live and why per-task model comparison is possible. |
| **Braintrust** | The fitness function. Every variant is a Braintrust experiment tagged by genome, generation, task, and model. The climbing score IS Braintrust experiment data, and the eval is not a report you read after, it is the selection pressure. Plus the immutable-grader property: the agent cannot edit its own eval. |
| **Daytona** | Containment + parallelism + rollback. Self-written, untrusted variant code runs only in isolated sandboxes; the whole population is evaluated in parallel across a sandbox pool; snapshots roll back broken or regressive mutations, live. Code-type tasks (generate SQL / Python) are executed in the sandbox and scored on real execution, not an opinion. |
| **CodeRabbit** | The independent reviewer of code the agent writes about itself. Every promoted champion opens a real PR carrying the self-written diff; CodeRabbit reviews it before it can merge (the human veto), a critical finding blocks promotion, and its findings feed the next mutation. On the repo from commit #1. |
| **WorkOS** | AuthKit login gating the dashboard: enterprise-ready from hour one. About 30 to 60 minutes to integrate. |
| _(stretch)_ | ElevenLabs narrator announcing new champions; CopilotKit copilot to drive the demo in plain language. Both feature-flagged, each its own Best-Use prize. |

## 2a. Braintrust is core (three surfaces, not a logger)

Braintrust is load-bearing on three surfaces:

1. **Fitness function (Lane B).** Every variant is a Braintrust experiment tagged by task,
   model, and generation; scorers are per `task_type` (autoevals ExactMatch/Levenshtein for
   code/structured, LLM-as-a-judge for text). The score is the selection pressure.
2. **The inference gateway (Lane B + C).** The Fireworks model race and the mutation calls route
   through the Braintrust AI gateway (`https://gateway.braintrust.dev/v1`, authenticated with the
   Braintrust key, model `fireworks/<slug>`), so every model call in the whole population is
   traced, cost-attributed, and scorable in Braintrust, and the provider key lives in Braintrust
   settings rather than locally. See `darwin/llm.py`. One-time setup: add the Fireworks key under
   Braintrust -> Settings -> AI providers.
3. **The climb as experiment comparison (Lane B).** Generations chain as experiments so Braintrust
   shows improvement/regression across the run (`base_experiment` / `summarize(comparison_
   experiment_id=...)`), and a held-out slice proves the winner generalizes. For open-ended tasks,
   comparative scorers (autoevals `Battle`/`Summary`) enable hill-climbing without ground truth.

This is why an eval-engineer judge cares: the leaderboard, the inference, and the climb are all
auditable Braintrust objects, not screenshots.

## 3. Scope decisions (agree at kickoff)

- **Two demo modes, one engine.** (a) Self-improve: point Darwin at one task, watch it climb from
  ~40 to 90+. (b) Routing: point it at an industry (Legal, Support), it decomposes into 4 to 6
  tasks and evolves a specialist + routing card per task.
- **Live run = one task or one small industry**, small enough to finish in about 2 minutes on
  stage. Everything else is a pre-computed library, shown with an explicit "cached" badge. Never
  present a cached run as live: that is a disqualification risk and judges ask.
- Population 6 to 8, generations 4 to 6, elite 2. 5 to 8 models per task. 8 to 12 synthetic cases
  per task.
- **Honesty rule.** Run the live eval on the small target for real; browse everything else as an
  explicitly labeled library of past runs.

## 4. Architecture (thin, feature-flagged)

```
core/
  genome.py     the recipe: system_prompt + tools{name->source} + params + MODEL (mutable)
  engine.py     init -> evaluate -> select (elitism) -> mutate -> repeat; monotonic best score
  mutate.py     Fireworks function-calling: rewrite a tool / tweak the prompt / SWAP the model,
                informed by failure traces + CodeRabbit findings; canned offline fallback
  population.py generations, elitism, selection, the routing card
pipeline/
  decompose.py  industry -> tasks (one Fireworks structured-output call)
  synth.py      task -> synthetic EvalCases (Fireworks JSON mode; human spot-check)
eval/
  fitness.py    Braintrust eval as fitness (IMMUTABLE grader) + offline before/after report
  task.py       the target task(s): dataset + expected outputs + task_type + scorer_config
sandbox/
  daytona.py    parallel sandbox pool + snapshot/restore; local subprocess fallback
  runner.py     materialize a genome, run it in a sandbox, capture outputs (real execution)
safety/guards.py  host-isolation assert, immutable-grader assert, regression auto-reject +
                  rollback, human veto + compute cap
review/coderabbit.py  promotion gate + code-quality fitness term + mutation feedback
server/events.py  FastAPI WebSocket streaming events to the dashboard (local, survives WiFi)
dashboard/        fitness curve + phylogenetic lineage tree + genome diff + task x model grid +
                  routing card + safeguards strip; WorkOS AuthKit; CopilotKit copilot
data/runs/        persisted RunRecords (the pre-computed library + honest replay)
```

**Data shapes** (frozen at kickoff so lanes parallelize):

```
Genome      {genome_id, generation, parent_ids, system_prompt, tools{}, params{}, model,
             lineage_note}
Variant     {genome, fitness 0..1, per_case[], cost_est, p50_latency_ms, sandbox_id,
             snapshot_id, status, braintrust_experiment_url}
Generation  {index, variants[], best_fitness, champion_id}
RunRecord   {run_id, task_id, seed, generations[], fitness_curve[], final_champion, config}
RoutingCard {industry, entries:[{task_id, best_model, prompt, runner_up, score, cost,
             latency, rationale}]}
```

## 5. Four lanes (parallel from hour zero)

The contract that unblocks everyone in 30 minutes: freeze the shapes above + a mock RunRecord
JSON. Lane D builds against the mock; Lanes A to C fill it in for real. Every integration is
feature-flagged with a local fallback, so the demo floor is an offline path that always climbs.

The `model` gene makes the "parallel model race" and "self-improvement" the same loop, so the
work splits cleanly across four people:

### Lane A (person 1) - Evolution engine + mutation [Fireworks] (sacred path)
Owns `darwin/core/engine.py`, `darwin/core/genome.py`, `darwin/core/population.py`,
`darwin/core/mutate.py`, and the decompose/synth pipeline (`pipeline/decompose.py`,
`pipeline/synth.py`). Deliverable: the score climbs repeatably; the model gene is mutated and
the routing card falls out. Elitism makes `best_fitness` monotonic (the on-stage curve never
drops). Also owns industry -> a list of real tasks via one Fireworks structured-output call,
and per-task synthetic `EvalCase`s (Fireworks JSON mode), with expected outputs. **Spot-check
every dataset by hand:** garbage cases mean a meaningless leaderboard. Offline fallback: canned
task lists + cases for the two live industries, and a canned mutator for a deterministic climb.
See section 14a on data-generation tooling (Braintrust does not generate data; consider NeMo
Data Designer).
**Done when:** `python -m darwin.main` climbs 40 -> 90+ offline, swapping the model gene changes
the winner on at least one task, and `python -m pipeline.decompose "legal"` yields ~5 sane
tasks, each with ~10 checked cases on disk, loadable by `Task.load`.

### Lane B (person 2) - Daytona sandbox pool + safety [Daytona]
Owns `darwin/sandbox/daytona.py`, `darwin/sandbox/runner.py`, `darwin/safety/guards.py`.
Parallel sandbox pool, snapshot rollback, the four guard pillars, and real execution scoring
for code-type tasks. Code-type task outputs are executed in the sandbox and scored on **real
execution**, not an opinion.
**Done when:** population evaluates in parallel sandboxes; a seeded bad mutation is rejected
and rolled back on screen; a code task is scored on real execution.

### Lane C (person 3) - Braintrust fitness + eval [Braintrust]
Owns `darwin/eval/fitness.py`, `darwin/eval/task.py`, scorer selection per `task_type`
(autoevals ExactMatch/Levenshtein for structured, LLM-as-judge with a tight low-temperature
rubric for text, execution-based for code), experiment naming/tagging (project=Darwin; tags:
task, model, generation), and the offline "does the winner generalize" check on a held-out
slice. Guards the immutable-grader property (`tests/test_immutable_grader.py`). This is the
deepest sponsor lane and the leaderboard's credibility.
**Done when:** every variant is a scored Braintrust experiment visible in the UI, the
Braintrust project page is demo-able, and the grader-untouched test passes; before/after table
proves the gain.

### Lane D (person 4) - Dashboard + auth + CodeRabbit + demo [WorkOS + CodeRabbit + the wow]
Owns `dashboard/` (fitness curve is the hero, lineage tree, genome diff, task x model grid,
routing card, safeguards strip, cached-run badge), WorkOS AuthKit login, CodeRabbit on the repo
from commit #1 (`.coderabbit.yaml`), `darwin/server/events.py`, `darwin/review/coderabbit.py`,
Devpost + per-sponsor blurbs, and the rehearsed 3-minute run-of-show. Builds against a mock
`RunRecord` from minute 30, never blocked on A to C.
**Done when:** the mock-fed dashboard is legible across a room by late morning; real events wired
by early afternoon; deployed to `darwin.pages.dev`; demo rehearsed twice.

**Shared, frozen contract:** `genome.py` + `population.py` shapes (`Genome`, `Variant`,
`Generation`, `RunRecord`, `RoutingCard`). Change only in a PR that also updates section 10.

**Cross-lane rules:** Lane A's loop is sacred; shapes frozen at kickoff; commit under your own
identity, in-window; deploy the dashboard to a clean `darwin.pages.dev` via Cloudflare.

## 6. Timeline (one-day, 3:30 PM wall, verify)

| Time | Milestone |
|---|---|
| 10:00 | Kickoff: freeze shapes + mock RunRecord. All four lanes start. |
| 11:30 | Checkpoint 1: A climbs offline on a canned task; B runs one variant in a real sandbox; C has one scored Braintrust experiment; D shows the mock grid + curve. |
| 1:00 | Checkpoint 2: full live pipeline end-to-end on one task/industry (ugly is fine). Start pre-computing the library. |
| 2:15 | Feature freeze. Tune until the climb is boringly reliable (5+ clean dry-runs). Seed the regression + reward-hacking canary. Polish dashboard, deploy to darwin.pages.dev. |
| 3:00 | Devpost submitted with a working build. Rehearse the demo twice. |
| 3:30 | Hard wall. |

## 7. Three-minute demo sketch

- **0:00 Hook.** "The most important frontier in AI is agents that improve themselves, and it is
  also the scariest. We built it, and made it safe. Watch this agent make itself smarter, live,
  without ever leaving a sandbox it cannot escape."
- **0:20 Starting line.** Task on screen, gen-0 score about 40 percent. "Nobody is going to help
  it." Kick off evolution.
- **0:40 The climb.** Variants spawn across Daytona sandboxes, the curve climbs 40 to 65 to 82 to
  90+, the leaderboard reshuffles. Say little. Then the genome diff: "generation 2 rewrote this
  tool in itself, and swapped to a cheaper model that scores higher on this task."
- **1:40 Safety turn.** A seeded bad mutation regresses and is auto-rejected and snapshot-rolled-
  back; the reward-hacking canary tries to reach the grader and is blocked by the immutable-grader
  guard AND flagged by CodeRabbit. "It cannot cheat, and a champion still needs a human to sign
  off." Show the champion PR + the CodeRabbit review.
- **2:10 Payoff.** The routing card. "Clause extraction: Qwen at one tenth the cost. Summarization:
  Kimi. SQL: DeepSeek, verified by real execution in a Daytona sandbox, not an opinion. Every cell
  is an auditable Braintrust experiment." Then the library, labeled as pre-computed.
- **2:40 Close.** "Stop asking which LLM is best. Start asking best at what, and let an agent that
  improves itself, safely, answer it with evidence."

## 8. Risks

- **Climb not climbing live.** Strict elitism (best genome always survives), structured failure
  traces, tuned population/generation counts, 5+ dry-runs. Cached real run as honest fallback.
- **Synthetic data quality.** Human spot-check every case; it is the credibility of the leaderboard.
- **LLM-judge flakiness.** Tight rubric, temperature near 0, prefer exact/structured/execution
  scorers where the task allows.
- **Fireworks burst rate limits.** Semaphore + retry/backoff from the start; keep the live run
  small.
- **Venue WiFi.** Local FastAPI/WebSocket; pre-warm sandboxes; keep the live generation count
  tight.
- **"Isn't this just benchmarks / AutoML / a paper?"** Benchmarks rank generic tasks; Darwin
  evolves a whole agent (prompt + tools + code + model) on your task, in sandboxes it cannot
  escape, scored by a grader it cannot game, and hands back the specialist plus the routing card.

---

# Part II - Implementation reference (read before coding)

This half is the detailed contract. It is the single source of truth for the code. If you
change a shared shape, update this file in the same PR.

## 9. Current state (what already exists on `main` / the phase-0 branch)

The offline spine is built and climbs with all sponsor flags off. Status per module:

| Module | Status | Notes |
|---|---|---|
| `darwin/config.py` | done | `load_config()` + `Features` + run params. Add `workos` when Lane D needs it. |
| `darwin/core/genome.py` | done | `Genome` + `seed/to_files/from_files/clone`. **`model` gene to be added (see 10).** |
| `darwin/core/population.py` | done | `Variant/Generation/RunRecord`, `rank/select`. **Add cost/latency/routing fields (10).** |
| `darwin/core/engine.py` | done | Full generational loop, parallel eval, elitism, event emit. |
| `darwin/core/mutate.py` | done (offline) | Canned ladder mutator. **Fireworks path = Phase 3.** |
| `darwin/eval/task.py` | done | Coding benchmark loader. **Add `task_type` + `scorer_config` + industry (10).** |
| `darwin/eval/fitness.py` | done (offline) | Local scorer + `offline_report`. **Braintrust path = Phase 2.** |
| `darwin/sandbox/base.py` | done | `SandboxPool` protocol, `SandboxHandle`, `RunOutputs`. |
| `darwin/sandbox/harness.py` | done | In-sandbox runner (no Darwin imports). |
| `darwin/sandbox/local.py` | done | Local subprocess pool (offline fallback). |
| `darwin/sandbox/daytona.py` | stub | **Phase 1: real pool + snapshot. Verified API in 14.** |
| `darwin/sandbox/runner.py` | done | Thin glue: isolation assert + `pool.run_genome`. |
| `darwin/safety/guards.py` | done | All four pillars. Uses `GRADER_TOKENS`. |
| `darwin/review/coderabbit.py` | stub | **Phase 4: gate + fitness term + feedback.** |
| `darwin/server/events.py` | done (in-memory) | `EventChannel.emit`. **WS fan-out = Phase 4.** |
| `darwin/main.py` | partial | Wire `build_engine` (Phase 0 finish). |
| `pipeline/*` | done | `decompose.py` + `synth.py` + `build.py` + curated `industries.py`. `python -m pipeline.build <industry>` writes `data/task/<industry>.json`; Fireworks JSON-mode live path with an offline library (legal, support) that climbs. |
| `dashboard/` | built + deployed | Vite + React, t3.codes aesthetic, playable evolution replay, live at trydarwin.pages.dev. Wire to a real `RunRecord` + WS next. |

## 10. Data shapes (exact fields)

Pydantic v2 models. `from __future__ import annotations` at the top of every module.

### Genome (`core/genome.py`)
```
genome_id: str
generation: int = 0
parent_ids: list[str] = []
system_prompt: str = DEFAULT_SYSTEM_PROMPT
tools: dict[str, str] = {}          # problem_id -> Python source (the agent's self-written code)
params: dict[str, float] = {}       # temperature, max_steps, ...
model: str = DEFAULT_MODEL          # <-- the model gene; a Fireworks model id (ADD THIS)
lineage_note: str = ""              # "what changed vs parent", written by the mutator
```
Methods: `seed(task, genome_id)`, `to_files(dir)`, `from_files(dir, genome_id)`,
`clone(**overrides)`, `to_json()/from_json(blob)`. When adding `model`, thread it through
`seed` (default model), `clone`, and the file manifest (`model` goes in `params.json` or a new
`meta.json`).

### Variant (`core/population.py`)
```
genome: Genome
fitness: float = 0.0                # 0..1 from the eval
per_case: list[PerCase] = []        # PerCase{case_id, score, output, error}
raw_outputs: dict = {}              # problem_id -> [{got, error}]  (ADD as a field; engine sets it)
cost_est: float = 0.0               # $ estimate for this variant's eval  (ADD, Fireworks)
p50_latency_ms: int = 0             # median call latency               (ADD, Fireworks)
braintrust_experiment_url: str = "" # link to the experiment            (ADD, Braintrust)
sandbox_id: str = ""
snapshot_id: str | None = None
status: "evaluated"|"failed"|"rejected"|"rolled_back" = "evaluated"
duration_ms: int = 0
```
> **Action item:** the engine currently sets `v.raw_outputs = outputs` on the instance. Add
> `raw_outputs: dict = Field(default_factory=dict)` to `Variant` so pydantic accepts it. Same for
> `cost_est`, `p50_latency_ms`, `braintrust_experiment_url` when their lanes land.

### Generation / RunRecord (`core/population.py`)
```
Generation { index, variants[], best_fitness, champion_id, started_at, ended_at }
RunRecord  { run_id, task_id, seed, generations[], fitness_curve[], final_champion, config }
```
`fitness_curve[i]` = best_fitness after generation `i` (monotonic; the climb).

### Task (`eval/task.py`)
```
Case     { args: list, expected: object }
Problem  { case_id, entrypoint, prompt, cases[], ladder[],
           task_type: "code"|"text"|"structured" = "code",   # ADD
           scorer_config: dict = {} }                          # ADD (per-type scorer knobs)
Task     { task_id, description, problems[], industry: str = "" }   # ADD industry
```
Helpers: `load(task_id)`, `total_cases`, `inputs_only()` (sandbox-safe: entrypoints + args, no
expected), `expected()` (host-only answers).

### RoutingCard (new, `core/population.py` or `pipeline/routing.py`)
```
RoutingEntry { task_id, best_model, prompt, runner_up, score, cost, latency, rationale }
RoutingCard  { industry, entries: list[RoutingEntry] }
```
Built by folding each task's champion into one card. This is the ModelMatch deliverable.

### Event (`server/events.py`)
```
{ "type": str, "payload": dict, "ts": float }
```
Types: `run_started, generation_started, variant_evaluated, generation_complete,
champion_changed, mutation, guard, run_complete`. `guard` payloads carry a `guard` key
(`grader_tamper, regression_rejected, rolled_back, promotion_blocked, awaiting_veto,
champion_approved, cap_reached, variant_failed`).

## 11. Module contracts

### Engine (`core/engine.py`) - LANE A, sacred
`EvolutionEngine(config, *, fitness, sandboxes, mutator, guards, events=None).run(task) ->
RunRecord`. The loop: seed population -> for each generation { `_evaluate_population` (parallel
threads, one sandbox per genome) -> `guards.filter` (regression reject + rollback) ->
`select(variants, elite_k)` -> elitism carry-forward so best never drops -> `guards.promote` a
new champion -> emit events -> `mutator.mutate_offspring` -> next population }. Never raises out
of `run()`. Stops early on `best_fitness >= 1.0` or when `guards.within_caps` is false.

### Mutation (`core/mutate.py`) - LANE A
`Mutator(config, task).mutate_offspring(elite, all_variants, n, generation) -> list[Genome]`.
Offline: advance the worst improvable problem one ladder rung (deterministic climb). Phase 3
(Fireworks): for each offspring, one function-calling request returning
`{target: "prompt"|"tool:<name>"|"params"|"model", new_content, lineage_note}`, informed by the
parent's failure traces (`Variant.per_case`) and, when available, CodeRabbit findings. The
`model` target swaps the gene to another catalog model. Log calls-per-generation + p50 latency.
**Never receives the fitness code.**

### Fitness (`eval/fitness.py`) - LANE C, immutable grader
`Fitness(config, task).score(outputs, *, genome_id, generation) -> (fitness: float,
per_case: list[PerCase])`. Offline: exact-match over `task.expected()`. Phase 2 (Braintrust):
wrap the same scoring in an `Eval()`/experiment per variant tagged `genome_id, generation, task,
model`, set `Variant.braintrust_experiment_url`. Per `task_type`: `code` -> execution pass/fail
(already how the benchmark works), `structured` -> autoevals ExactMatch/Levenshtein, `text` ->
LLM-as-judge with a tight rubric at temperature ~0. `offline_report(gen0_outputs,
final_outputs)` -> before/after table.

### Sandbox (`sandbox/`) - LANE B
Implement the `SandboxPool` protocol (`base.py`): `acquire(n)`, `run_genome(handle, genome,
inputs_spec) -> RunOutputs`, `snapshot(handle) -> str`, `restore(handle, snap_id)`, `close()`,
class attr `is_real_isolation`. `run_genome` must: materialize the genome (`genome.to_files`),
write `inputs.json` (`task.inputs_only()`) and `harness.py` (`HARNESS_SRC`), execute the harness
in the sandbox, and `parse_result(stdout)`. The local pool (`local.py`) is done and is the
reference implementation; `daytona.py` mirrors it against the real SDK (14). Add
`handle_by_id(sandbox_id)` so `guards._rollback` can find a handle.

### Safety (`safety/guards.py`) - LANE B
`Guards(config, sandboxes, events)`: `assert_sandboxed(handle)`,
`assert_grader_untouched(genome)` (raises `GraderTamperError`), `screen(genome) -> reason|None`
(run before executing a genome), `filter(variants, parent_fitness) -> variants` (reject
regressions, roll back), `promote(champion, review=None) -> bool` (blocked if
`review.blocks_promotion` or a human veto; `AUTO_APPROVE` bypasses), `within_caps(sbx, secs)`.

### Review (`review/coderabbit.py`) - LANE B/C
`CodeReviewer(config).review_genome(genome, parent) -> ReviewResult{findings[], max_severity,
quality_penalty, blocks_promotion, pr_url}`. Fast path: CodeRabbit CLI/API on the diff. Real
path: `open_champion_pr(genome) -> pr_url`, then read the PR review. Offline: local
static-analysis stub flagging exec/eval/network/grader imports. Wire into (1) `guards.promote`
(gate), (2) fitness as a penalty term, (3) `Mutator` as feedback.

### Pipeline (`pipeline/`) - LANE A (new)
`decompose.industry_to_tasks(industry: str) -> list[Task]` (one Fireworks structured-output
call; offline: canned task lists for Legal + Support). `synth.generate_cases(task) ->
list[Case]` (Fireworks JSON mode; human spot-check; offline: canned cases). Keep both
feature-flagged.

### Server + dashboard (`server/events.py`, `dashboard/`) - LANE D
`EventChannel.emit(type, payload)` is done and synchronous. Phase 4: a FastAPI `/ws` endpoint
subscribes each client and forwards events; run the engine in a background thread and stream.
Dashboard reads events and renders the panels (16). WorkOS AuthKit gates the page; CopilotKit
copilot calls back into engine actions via the server.

## 12. The benchmark task (offline ground truth)

`data/task/coding_bench.json`, generated by `scripts/build_task.py`. 8 problems x 2 hidden
cases = 16 cases. Gen 0 has 3 problems correct (6/16 = 37.5%, "~40%") and 5 broken. Each broken
problem has a 2-rung `ladder` (broken -> correct). The offline canned mutator advances the worst
problem one rung per generation, so the climb is monotonic and reaches ~100% in a few
generations. `expected` values live only in the task JSON on the grader side and never enter a
sandbox (the immutable-grader property in action). To add tasks: edit `scripts/build_task.py`
and re-run it.

## 13. Config + feature flags

`.env` (see `.env.example`). Flags: `FEATURE_DAYTONA/BRAINTRUST/FIREWORKS/CODERABBIT` (add
`FEATURE_WORKOS`, `FEATURE_ELEVENLABS`, `FEATURE_COPILOTKIT` as those land). With all off, the
loop uses the local sandbox + local scorer + canned mutations + static-analysis review and still
climbs. Run params: `POPULATION_SIZE=8, GENERATIONS=5, ELITE_K=2, MAX_TOTAL_SANDBOXES=48,
MAX_WALL_CLOCK_S=180, RANDOM_SEED=1337, AUTO_APPROVE=1`. Every integration must degrade to a
clean no-op; test the flag-off path in CI.

## 14. Verified sponsor SDK surfaces

**Verify before writing calls. Do not invent method names. Record versions + doc links in
DECISIONS.md D5.**

### Daytona (verified 2026-07-24, docs.daytona.io)
```python
pip install daytona
from daytona import Daytona, DaytonaConfig, CreateSandboxFromSnapshotParams, CreateSnapshotParams
daytona = Daytona(DaytonaConfig(api_key=...))   # or Daytona() reads DAYTONA_API_KEY
sandbox = daytona.create(CreateSandboxFromSnapshotParams(language="python"))
resp = sandbox.process.code_run('print("hi")')  # resp.result
resp = sandbox.process.exec("python harness.py") # shell exec
daytona.snapshot.create(CreateSnapshotParams(name=..., image=..., sandbox_class=...))
```
Sub-90ms cold start. Container sandboxes for our case. Rollback = re-create from snapshot or (VM
class) fork/pause-resume; confirm the fastest clean restore for the demo. Resources cap 4 vCPU /
8GB / 10GB. Parallelism (headline use): create N sandboxes concurrently for a generation. File
IO: use `sandbox.fs` / process exec to write the genome package + harness, or `code_run` a
bootstrap that writes them.

### Fireworks (OpenAI-compatible)
```python
from openai import OpenAI
client = OpenAI(base_url="https://api.fireworks.ai/inference/v1", api_key=FIREWORKS_API_KEY)
client.chat.completions.create(model="accounts/fireworks/models/<id>", messages=[...],
                               tools=[...], temperature=0)  # function-calling for structured mutation
```
VERIFIED 2026-07-24 (see DECISIONS.md D11 + LEARNINGS.md): live serverless catalog is
`gpt-oss-120b, kimi-k2p6, glm-5p1, glm-5p2, deepseek-v4-pro` (legacy Llama/Qwen ids were
removed 2026-05-14). All calls go through `darwin/core/fw_client.py`: concurrency semaphore +
retry/backoff for burst limits, per-call latency for p50, cost from the response `usage`.
Mutation calls must FORCE the function via `tool_choice` and strictly validate arguments.

### Braintrust
```python
pip install braintrust autoevals
from braintrust import Eval
from autoevals import ExactMatch, Levenshtein
Eval("Darwin", data=lambda: [...], task=lambda input: ..., scores=[ExactMatch])  # one experiment
```
Tag experiments with `genome_id, generation, task, model`. Wizard/CLI setup exists but do not
depend on the `bt` CLI in the loop. Project name = `Darwin`.

### CodeRabbit
`.coderabbit.yaml` is committed (strict, treats genome tool code as untrusted). PR reviews via
the GitHub app; a CLI/API exists for inline review. Verify the CLI invocation + any API surface.
Offline fallback: local static analysis.

### WorkOS (AuthKit)
`npm i @workos-inc/authkit-react` (or the Node SDK for a server callback). Verify current
AuthKit quickstart. Gate the dashboard route; store the session; show the signed-in user. About
30 to 60 minutes. Feature-flag so the dashboard renders without it in dev.

## 14a. Synthetic data generation (Lane A)

**Braintrust does not generate data.** Its Datasets feature stores/curates cases (from
production, evals, or manual entry) and runs evals over them; generation is on you. So Lane A owns
data creation, and there are two sane paths:

1. **Fireworks JSON-mode generation (default, lowest-dependency).** For each task, one structured
   -output call produces `EvalCase`s with `expected` answers, then a human spot-checks. Keeps the
   stack to sponsors we already use and is enough for 8 to 12 cases per task.
2. **NVIDIA NeMo Data Designer (optional, higher quality).** `pip install data-designer`. Builds
   datasets with `DataDesignerConfigBuilder`: statistical samplers + LLM columns, dependency-aware
   fields, Python/SQL validators, LLM-as-judge quality scoring, and a `preview()` before full
   generation. No local GPU; it targets any OpenAI-compatible endpoint, so **point it at Fireworks**
   (set the provider base URL + key) and it doubles as a Fireworks showcase. Python 3.10 to 3.14,
   async engine. Use it when case quality/diversity matters more than setup time; keep path 1 as
   the offline fallback either way.

Either path must write cases through `Task`/`EvalCase` so `expected` stays on the grader side and
never enters a sandbox (immutable-grader property).

## 15. Dev setup, run, test

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                 # leave blank to run fully offline
python scripts/build_task.py         # (re)generate the benchmark dataset

python -m darwin.main --offline      # run an evolution (offline path)
pytest -q                            # tests must pass before pushing
ruff check .                         # lint before pushing

cd dashboard && npm install && npm run dev   # dashboard on :5173, proxies /ws to :8000
```
CI (`.github/workflows/ci.yml`) runs ruff + pytest with all sponsor flags off on py3.11/3.12,
plus a dashboard build. Keep it green.

## 16. Design system (follow t3.codes to a tee)

The dashboard follows the t3.codes design system exactly: dark, minimal, developer-tool, one
accent, DM Sans everywhere (no display/serif faces), a subtle fractal-noise texture, tasteful
motion. The fitness curve is the hero. Copy carries the personality; the type stays clean.

```
--bg        #09090b   zinc-950 canvas
--bg-card   #111113   card
--fg        #fafafa   text
--fg-muted  #a1a1aa   muted / --fg-dim #71717a / --fg-faint #52525b
--border    rgba(255,255,255,0.08)   / --border-strong rgba(255,255,255,0.14)
--accent    oklch(0.68 0.17 250)     indigo/violet (single accent)
--ok        oklch(0.72 0.16 150)     / --warn oklch(0.76 0.15 75) / --bad oklch(0.66 0.2 20)
--font-sans "DM Sans"   / --font-mono "JetBrains Mono"
--radius    12px (sm 8, lg 16)
```
Type: DM Sans for everything (wordmark, hero, body), JetBrains Mono + tabular-nums for data.
Motion: a playable evolution replay (the curve grows generation by generation), count-up numbers,
staggered reveals, a slowly orbiting logo node, hover lifts, a marquee of differentiators, a
subtle aurora behind the hero. Avoid the AI-default look and any funky display font (Syne was
tried and rejected). Panels: fitness curve, population leaderboard, stat tiles, evolution log
(scrollable), task x model race grid, genome diff, routing card, safeguards strip.
Built with Vite + React (`dashboard/`), deployed to https://trydarwin.pages.dev.

**Data wiring (kept in place):** `dashboard/src/run.ts` holds a labelled replay whose shapes
mirror `RunRecord`; to show a real run, fetch a persisted `data/runs/*.json` and map
`fitness_curve -> CURVE`, `Generation.variants -> POOL`, events -> `EVENTS`, and each
`Variant.braintrust_experiment_url` to a deep link per row/cell. The live path streams the same
shapes from `darwin/server/events.py` over `/ws`.

## 17. Deployment

Dashboard is deployed to `https://trydarwin.pages.dev` via Cloudflare Pages using Wrangler
(`cd dashboard && npm run deploy`, which runs `wrangler pages deploy dist --project-name
trydarwin`). "darwin" was taken, so the project is "trydarwin". The deployed site is the landing
page + an interactive replay of a real persisted `RunRecord` (bundled JSON), so it works with no
backend and doubles as the honest cached-run fallback. SEO: title, meta description, Open Graph,
`sitemap.xml`, `robots.txt`, semantic HTML, Lighthouse pass.

## 18. Conventions

- Python 3.11+, `from __future__ import annotations`, ruff (line length 100, rules E/F/I/UP/B),
  pydantic v2 for shared shapes. Match surrounding style.
- Branch per lane: `lane-a/...`, `lane-b/...`, etc. Open a PR early; CI must be green to merge.
  Keep PRs scoped to your lane's files (Lane A's loop is sacred).
- Commit under your own identity, in clean in-window commits. Do not add other co-authors.
- No em dashes in prose (use hyphens/colons). No AI-slop UI.
- Update this SPEC + DECISIONS.md in the same PR whenever you change a shared shape or make an
  architecture call.

## 19. Build phases + acceptance

- **Phase 0 (done):** offline spine climbs on the canned task with elitism (monotonic).
- **Phase 1 (Lane B):** real Daytona pool + snapshot rollback; parallel eval; a bad mutation
  rolled back on demand.
- **Phase 2 (Lane C):** Braintrust eval as fitness + per-variant experiments; grader-untouched
  test green; offline before/after table.
- **Phase 3 (Lane A):** Fireworks function-calling mutation (incl. model swap) beating a random
  baseline; calls-per-gen + p50 latency logged; decompose/synth pipeline.
- **Phase 4 (Lane B + D):** guards + CodeRabbit gate; dashboard (curve, lineage tree, diff, grid,
  routing card, safeguards strip); WorkOS auth; seeded regression + reward-hacking canary.
- **Phase 5 (all):** 5+ reliable dry-runs, cached fallback, deploy to darwin.pages.dev, Devpost,
  rehearse.

Acceptance mirrors the phases: all-flags-off climb is monotonic; parallel Daytona eval with
rollback; Braintrust scores every variant + before/after table; immutable-grader test passes;
Fireworks mutation beats random and swaps models; safety beats work on screen; dashboard legible
across a room; working build submitted before the wall.

## 20. Glossary

- **Genome:** the mutable recipe (prompt + tools + params + model) defining one agent variant.
- **Variant:** a genome plus its measured result (fitness, per-case, cost, latency, status).
- **Fitness:** the Braintrust eval score used as selection pressure (0..1).
- **Elitism:** carrying the top-K genomes forward unchanged so best_fitness never drops.
- **Ladder:** the offline broken-to-correct source sequence per problem that guarantees a
  deterministic climb with flags off.
- **Routing card:** the per-task champion (best model + prompt + tools) with score/cost/latency.
- **Immutable grader:** the property that the agent cannot read or edit its own fitness function.
- **Canary:** a seeded cheating mutation used to demonstrate the safety guards catching it.
