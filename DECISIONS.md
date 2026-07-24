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

### D4 - Task choice (TBD - Lane C to finalize)
**What:** pick a task where improvement is near-deterministic from *structured, actionable*
failure traces, so the mutator can act on them and the climb is reliable.
**Why:** a demo that climbs 40→90 boringly beats one that sometimes leaps and sometimes stalls.
**Status:** candidate options under evaluation - see the plan. Record the final choice here.

### D5 - Sponsor SDK surfaces are VERIFIED, not assumed
**What:** Daytona / Braintrust / Fireworks / CodeRabbit calls are written against current
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

**Braintrust / Fireworks / CodeRabbit:** record verified surfaces + pinned versions here as
Lanes C/A/B implement them.

### D6 - CodeRabbit is a load-bearing safety component, not a lint pass
**What:** Darwin is an AI that rewrites its own code, so CodeRabbit reviews every self-written
change in three roles: (1) a promotion gate (a champion PR is reviewed before merge; a critical
finding blocks promotion), (2) a code-quality fitness penalty (multi-objective selection so the
agent evolves code a human would merge), and (3) mutation feedback (findings feed the next
Fireworks mutation, so the agent learns from review across generations).
**Why:** it turns "human veto" into a concrete, reviewed PR and adds a second anti-reward-hacking
layer on top of the immutable grader.
**Caveat:** offline fallback is a local static-analysis stub (flags exec/eval/network/grader
imports), honestly labeled as weaker than CodeRabbit's review.

<!-- Append D7+ as decisions are made during the sprint. -->
