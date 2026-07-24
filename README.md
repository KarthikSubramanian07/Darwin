<div align="center">

# 🧬 Darwin

### An agent that evolves itself. Safely.

**Point it at a task it's mediocre at. It rewrites its own tools, prompt, and code, runs every variant in a sandbox it can't escape, scores them with a grader it can't cheat, keeps the fittest, and does it again. The score climbs while you watch.**

[![CI](https://github.com/KarthikSubramanian07/darwin/actions/workflows/ci.yml/badge.svg)](https://github.com/KarthikSubramanian07/darwin/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](./LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-black.svg)](https://www.python.org/)

`self-improving-ai` · `evolutionary-algorithms` · `ai-safety` · `agents` · `sandboxing`

</div>

---

## The one-sentence version

Everyone wants an agent that improves on its own. Nobody will deploy one, because "an AI rewriting its own code" is a liability no one can sign off on. Darwin is that loop, made safe by construction. Self-modification happens only inside disposable sandboxes, the agent can never touch its own grader, every rewrite gets code-reviewed before it lives, regressions are auto-killed and rolled back, and a human signs off on every new champion.

It is literal natural selection over agents:

- **Variation.** Mutate the agent's tools, prompt, and code. Fireworks does the mutating, fast and in parallel.
- **Selection.** A Braintrust eval is the fitness function. The score decides who lives.
- **Inheritance.** The fittest seed the next generation.
- **Containment.** Every variant runs in its own isolated Daytona sandbox. A bad mutation can't touch the host and gets snapshot-rolled-back on sight.

Generation over generation, the best score climbs. Autonomously. On screen. In real time.

## Why it's different

| You've seen | Darwin |
|---|---|
| **AlphaEvolve** evolves a *program* toward a fixed objective, in a research harness | evolves a whole **agent** (tools + prompt + code) as a product you point at your task |
| **DSPy / prompt optimizers** edit the *words* | rewrites the *tools*, a strictly larger search space, run in a real sandbox |
| **Braintrust / eval tools** *measure* an agent after the fact | uses the eval as *selection pressure*: the score decides which agents survive |
| **ADAS / meta-agent search** optimizes, unconstrained | optimizes **safely**: sandboxed, immutable grader, code review, rollback, human veto |

> Prompt optimizers edit the words. Darwin rewrites the tools. AlphaEvolve is a paper; Darwin is a product you can run on your task in three minutes.

## The safety spine

Five guarantees, enforced as code, not slideware:

1. **Sandboxed self-modification.** Every variant executes only inside a Daytona sandbox. Genome code is never imported into the host.
2. **Immutable fitness function.** The grader lives outside the agent's reach. The mutator is never handed the eval. A test enforces it. The agent cannot cheat its own metric.
3. **Independent code review.** Darwin is an AI that rewrites its own code, so every rewrite is reviewed by CodeRabbit before it can be promoted. A critical finding (unsafe exec, sandbox escape, an attempt to reach the grader) blocks the champion, even if its task score went up.
4. **Regression auto-rejection and rollback.** A variant that scores worse than its parent is killed and its sandbox restored from snapshot. Elitism keeps the champion's score monotonic.
5. **Human veto and a hard compute cap.** No new champion promotes without sign-off, and evolution can't run away.

## Architecture

```
task ──▶ ┌─────────────────────────────────────────────────────┐
         │  EvolutionEngine   init ▸ evaluate ▸ select ▸ mutate │◀─┐
         └─────────────────────────────────────────────────────┘  │
              │            │             │            │            │
        Genome pop    Daytona pool   Braintrust   Fireworks        │
       (prompt+tools  (N parallel     (fitness =   (mutation       │
        +code,         sandboxes,     immutable     engine,         │
        mutable)       snapshot/      grader)       parallel)───────┘
                       rollback)          │
                            │        CodeRabbit reviews the self-written
                            │        diff before a champion is promoted
                            ▼
                     live dashboard: fitness curve · leaderboard · genome diff
```

Load-bearing sponsors, each used at its frontier: **Daytona** (containment, parallelism, snapshot rollback), **Braintrust** (fitness function, offline eval), **Fireworks** (fast parallel mutation), **CodeRabbit** (independent review of the agent's self-written code). Everything else is home-built.

## Quickstart

```bash
git clone https://github.com/KarthikSubramanian07/darwin.git && cd darwin
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # add keys, or leave blank to run fully offline

python -m darwin.main       # start an evolution run
# dashboard: cd dashboard && npm install && npm run dev
```

**No keys? It still climbs.** With every feature flag off, Darwin falls back to a local subprocess sandbox, a local scorer, canned mutations, and a local static-analysis reviewer, and the fitness curve still climbs on a canned task. That offline path is the demo floor.

## Team and lanes

Built in a one-day sprint. Four lanes, four owners, one sacred path (the evolution loop). See [CONTRIBUTING.md](./CONTRIBUTING.md) for lane boundaries and [DECISIONS.md](./DECISIONS.md) for the architecture calls we made and why.

## License

[MIT](./LICENSE) © Karthik Subramanian

<div align="center"><sub>The score climbing is the hook. The tool it rewrote in itself is the proof. The sandbox it can't escape is the close.</sub></div>
