# DECISIONS.md - architecture choices, substitutions, and where cost starts

Living log. Append as you build. Each entry: **what** we decided, **why**, and **the
honest caveat** if there is one.

---

### D1 - Elitism guarantees a monotonic climb
**What:** the top `ELITE_K` genomes carry into the next generation unchanged, so
`best_fitness` never decreases.
**Why:** the on-stage curve must never visibly drop. This is the single most important
reliability decision in the build.

### D2 - Every integration is feature-flagged with an offline fallback
**What:** `FEATURE_DAYTONA / BRAINTRUST / FIREWORKS` each degrade to a local path
(subprocess sandbox / deterministic scorer / canned mutations).
**Why:** venue WiFi is unreliable; the demo floor is the all-flags-off path that still climbs.
**Caveat:** the local-subprocess sandbox is **not** real isolation - it is honestly labeled
as such and only used when Daytona is disabled.

### D3 - The grader is immutable by construction
**What:** the mutator is only ever handed a `Genome`, never the fitness code; genomes never
contain `eval/`; a test asserts no genome/tool references the fitness module.
**Why:** "it can't cheat its own grader" is a load-bearing safety property, not a promise.

### D4 - Task choice: a coding benchmark (RESOLVED)
**What:** Darwin evolves an agent on a suite of small, self-contained Python coding problems.
The genome's tool code IS the candidate solution; fitness = fraction of hidden unit tests
passing; failure traces = the failing assertions handed back to the mutator.
**Why:** failure traces are maximally structured and actionable (a test either passes or
prints exactly why it failed), the climb is near-deterministic, and because the genome is
literally code it threads every sponsor through one coherent story: Daytona runs the untrusted
code, Braintrust scores tests-as-fitness, Fireworks rewrites the solution from the assertion,
**Offline determinism:** the canned mutator advances the worst-scoring problem one rung along a
predefined improvement ladder (broken -> correct), guaranteeing a monotonic climb with all
flags off. See `darwin/eval/task.py` and `darwin/core/mutate.py`.

### D7 - Signature identity: follow the t3.codes design system (RESOLVED, supersedes earlier)
**What:** the dashboard follows t3.codes to a tee: zinc-950 `#09090b` canvas, near-white
`#fafafa` text, muted zinc grays, one indigo/violet accent `oklch(0.68 0.17 250)`, DM Sans +
JetBrains Mono, a subtle fractal-noise texture, 12px radii. Clean, minimal, developer-tool. No
emoji; a small circular animated mark (a ring with an orbiting node) is the logo.
**Why:** the owner chose the t3.codes aesthetic as the reference. Earlier "phosphor lab" and a
Syne display font were tried and rejected for drifting from that look; DM Sans throughout is the
rule. Copy carries personality; the type stays clean.
**Status:** built + deployed to https://trydarwin.pages.dev with a playable evolution replay
(the fitness curve climbs generation by generation, the log streams champions + a rolled-back
regression + a blocked reward-hacking canary, the model race resolves into the routing card).

### D8 - Scope: swing big, keep the core reliable (RESOLVED)
**What:** ship the three stretch beats (reward-hacking canary, live phylogenetic lineage tree,
ElevenLabs champion narrator) AND keep the core climb boringly reliable (5+ clean dry-runs).
ElevenLabs becomes a 5th, feature-flagged sponsor integration (Best Use of ElevenLabs).
**Why:** the user asked for big swings; each beat maps to a prize, and none is allowed to
destabilize the sacred path (all are isolatable + flag-off-able).

### D5 - Sponsor SDK surfaces are VERIFIED, not assumed
official docs. These SDKs change; training data is stale.

**Verified Daytona surface (2026-07-24, docs.daytona.io):**
- Install: `pip install daytona`. Import: `from daytona import Daytona, DaytonaConfig`.
- Client: `daytona = Daytona(DaytonaConfig(api_key=...))` (or `Daytona()` reads `DAYTONA_API_KEY`).
- Create: `sandbox = daytona.create(CreateSandboxFromSnapshotParams(...))`. Sub-90ms cold start.
- Run: `sandbox.process.code_run('...')` (returns `.result`) and `sandbox.process.exec('...')`.
- Snapshots: `daytona.snapshot.create(CreateSnapshotParams(name=, image=, sandbox_class=))`.
- Rollback primitive: snapshots restore state; VM sandboxes add fork + pause/resume. Lane B:
  confirm whether we roll back via re-create-from-snapshot (container) or fork/resume (VM);
  the demo needs a fast, clean restore. Ephemeral sandboxes (`ephemeral=True`) auto-delete on
  stop. Resources cap at 4 vCPU / 8GB / 10GB per sandbox.
- Parallelism (headline use): create N sandboxes concurrently to evaluate a whole generation.

**Verified Braintrust surface (2026-07-24, braintrust.dev):**
- Install: `pip install braintrust autoevals`. Braintrust does NOT generate data (Datasets only
  stores/curates); synthetic data is Lane A's job (see SPEC 14a).
- Experiment: `braintrust.init(project="Darwin", experiment=<name>, api_key=..., metadata={...},
  tags=[...], update=False) -> Experiment`.
- Log a row: `experiment.log(input=, output=, expected=, scores={<name>: 0..1}, metadata={...})`.
- URL: `experiment.summarize().experiment_url`.
- `Eval(name, data, task, scores=[...])` is the higher-level framework; we log per-variant
  experiments directly so each variant/model is an auditable cell in the grid.
- Darwin logs one experiment per variant tagged `[task, model, gen<N>]`; numeric truth is also
  computed locally (`darwin/eval/scorers.py`) so offline and online agree on code tasks.

**Braintrust AI gateway (verified 2026-07-24):** route any provider through Braintrust with the
OpenAI client at `base_url="https://gateway.braintrust.dev/v1"`, `api_key=BRAINTRUST_API_KEY`,
model `fireworks/<slug>`. Provider key is stored in Braintrust AI-providers settings, not locally.
`darwin/llm.py` uses this when `USE_BRAINTRUST_GATEWAY=1`, so the model race + mutation calls are
traced and scored in Braintrust. Experiment chaining for the climb: `BaseExperiment()` /
`base_experiment` + comparative scorers (`autoevals.Battle`/`Summary`), or
`summarize(comparison_experiment_id=...)`.

lanes implement them.

### D11 - Braintrust is core on three surfaces (RESOLVED)
**What:** fitness function (scorers + per-variant experiments), the inference gateway (model race
+ mutation routed through Braintrust), and the climb as experiment comparison. See SPEC 2a.
**Why:** "ensure it's core" - Braintrust drives selection, carries the inference, and hosts the
climb as auditable objects, not a passive log.
**Caveat:** the gateway needs the Fireworks key configured in Braintrust settings; default off in
`.env` for the local Lane B test, on for the live model race.

change in three roles: (1) a promotion gate (a champion PR is reviewed before merge; a critical
finding blocks promotion), (2) a code-quality fitness penalty (multi-objective selection so the
agent evolves code a human would merge), and (3) mutation feedback (findings feed the next
Fireworks mutation, so the agent learns from review across generations).
**Why:** it turns "human veto" into a concrete, reviewed PR and adds a second anti-reward-hacking
layer on top of the immutable grader.
**Caveat:** offline fallback is a local static-analysis stub (flags exec/eval/network/grader

### D9 - CopilotKit: natural-language control of the demo (RESOLVED)
**What:** a CopilotKit copilot in the dashboard lets anyone drive Darwin in plain language:
"run another generation", "explain why gen 3 won", "show me the tool it rewrote", "veto this
champion". It reads the live run state and can trigger engine actions through the event server.
**Why:** turns the dashboard from a passive readout into an interactive agent surface (Best Use
of CopilotKit), and makes the human-veto pillar something a judge performs by voice/text.
**Setup:** `npx copilotkit@latest license` needs interactive sign-in (owner runs it once).
Feature-flagged; dashboard renders fine without it.

### D10 - Deploy via Wrangler to darwin.pages.dev (RESOLVED)
**What:** deploy the dashboard (landing + interactive replay of a real persisted run) to
Cloudflare Pages with `wrangler pages deploy`. Owner approves the auth prompt.
**Why:** hands-off for the owner, one clean SEO link that works with no backend and doubles as
the honest cached-run fallback.

### D11 - Fireworks verified surface + pinned race catalog (RESOLVED, 2026-07-24)
**What:** all Fireworks calls go through `darwin/core/fw_client.py` (OpenAI-compatible client,
`base_url=https://api.fireworks.ai/inference/v1`, semaphore + retry/backoff, latency + cost
capture from the response `usage` object). The race catalog is queried live
(`client.models.list()`) and validated against the pinned fallback `RACE_MODELS`:
`gpt-oss-120b`, `kimi-k2p6`, `glm-5p1`, `glm-5p2`, `deepseek-v4-pro` (5 text models live on
this account; `flux-1-schnell-fp8` excluded as image-gen). Prices per 1M tokens pinned in
`MODEL_PRICES` from fireworks.ai/models. `DEFAULT_MODEL` is now `gpt-oss-120b` (cheapest
verified: $0.15/M in, $0.60/M out) - the old `llama-v3p1-8b-instruct` was removed from
serverless in the 2026-05-14 legacy purge.
**Why:** SDK surfaces and catalogs drift; every claim above came from a live probe or current
docs (see LEARNINGS.md). Mutation calls FORCE the function via `tool_choice` and validate
`{target, new_content}` strictly, because probed models otherwise reply in prose or fill
`target` loosely.
**Caveat:** deepseek-v4-pro pricing reads garbled in the docs; we pinned the conservative
$1.74/$3.48 reading and label all cost figures as estimates.

### D12 - Rollback = in-sandbox directory snapshot, not platform snapshots (RESOLVED)
**What:** `DaytonaSandboxPool.snapshot/restore` copies the run directory inside the sandbox
(`cp -a`), exactly mirroring the local reference pool's `copytree` semantics. Sandboxes are
created once per run and reused across generations (run dirs wiped per variant).
**Why:** Daytona's per-sandbox snapshot API is experimental (`_experimental_create_snapshot`),
captures to object storage with state polling, and restore requires creating a new sandbox -
too slow at per-variant cadence for the 2-minute live budget. Directory snapshots restore in
one exec and the demo beat (regression -> rolled_back) stays visibly instant.
**Caveat:** this rolls back the *variant's filesystem state*, not the whole VM image. The
containment story is unchanged (the sandbox itself is still the isolation boundary); if a
demo ever needs full-image rollback, the platform snapshot path is the upgrade.

<!-- Append D13+ as decisions are made during the sprint. -->
