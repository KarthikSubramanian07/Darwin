# Darwin — Devpost

> **Generic benchmarks tell you which model wins their test. Darwin tells you which model wins your
> work.**

## Tagline

The best LLM for every task in your business — chosen by evidence, not vibes.

## Inspiration

Every team asks the same question: "Which LLM should we use?" It's the wrong question. The model
that wins summarization routinely loses at extraction, classification, or code. Picking one model
for everything means overpaying on the tasks it's bad at and underperforming on the tasks that
matter. Generic leaderboards don't help — they rank models on *someone else's* tasks, not yours.

We wanted a tool that answers the real question: for *this* company's actual workload, which model
is best at *each* task — and can prove it.

## What it does

You give Darwin an industry. It:

1. **Decomposes** the industry into the real AI tasks that business runs (e.g. for Legal:
   contract summarization, clause extraction, citation verification, risk classification, SQL
   reporting).
2. **Races** several Fireworks-hosted models against task-specific eval cases.
3. **Scores** every model/task cell through Braintrust, and for code tasks **executes** the output
   in a Daytona sandbox and scores on real pass/fail — not an opinion.
4. **Produces a routing card**: the recommended model per task, with score, cost, latency,
   rationale, and a link to the underlying experiment — plus an honest comparison against the best
   single model for everything.

The dashboard shows the whole thing live: a task × model grid fills in cell by cell, a routing
recommendation updates as evidence lands, and the run ends on an exportable routing config.

## How we built it

- **Frontend:** React + Vite + TypeScript. One normalized event contract feeds one reducer; every
  data source (live WebSocket, recorded replay, mock, persisted run) is adapted into it, so the UI
  has a single source of truth. The routing math (winner selection, single-model baseline, and the
  routing-vs-baseline comparison) is pure and unit-tested — no positive claim is hardcoded; if
  routing costs more, the dashboard says so.
- **Engine:** a Python evolutionary loop where a model is a first-class gene, so "race the models"
  and "improve the agent" are the same loop at different zoom levels. It runs fully offline with
  every sponsor flag off, then lights up each integration when its key is present.
- **Safety by construction:** self-written code runs only in sandboxes, the grader is immutable,
  regressions are auto-rejected, and every promotion is code-reviewed.
- **Reliability:** every integration is feature-flagged with a local fallback, and the dashboard
  has a recorded-run mode so the demo floor works with no network at all.

## Challenges we ran into

- **Two shapes of the same engine.** The evolution loop emits generation/variant events; the
  routing product needs task × model race events. We resolved it with a normalized frontend
  contract and an adapter that passes race events through and maps evolution lifecycle events —
  rather than bending the UI to one and faking the other.
- **Honesty under demo pressure.** It's tempting to silently swap in canned data when Wi-Fi drops.
  We built explicit source labeling and a recovery action instead, so a cached run is never shown
  as live.
- **Defensible numbers.** The "routing beats one model" claim had to be computed from the run, and
  allowed to come out negative. It's a real comparison, not a marketing line.

## Accomplishments we're proud of

- A task × model race grid that's legible from across a room, ending in an exportable routing card.
- A comparison that's honest by construction — quality, cost, and latency deltas all derived from
  the data.
- An offline-first demo path: recorded runs open instantly, and live failures recover gracefully.
- Real execution-based scoring for code tasks, not an LLM's guess at correctness.

## What we learned

"Best model" is a category error. Once you measure per task, routing wins are routine and specific:
a cheaper model that's better at summarization, a code model verified by execution, a classifier
that edges everything else. The evidence is the product.

## What's next

- Wire the live race stream end to end (backend WebSocket fan-out + normalized race events).
- Real Braintrust experiment links and measured Fireworks cost/latency on every cell.
- One-click deploy of a routing config to a gateway/proxy so recommendations become production
  routing.
- Organization-scoped run history so teams track how their routing shifts as models improve.

## Sponsor integrations

- **Fireworks** — the model catalog and inference engine the tasks are raced across (one
  OpenAI-compatible API over Llama, Qwen, DeepSeek, Kimi, and more).
- **Braintrust** — the auditable evaluation and experiment layer; every task × model cell is a
  scored experiment, and the grader is immutable so the agent can't game its own metric.
- **Daytona** — real execution-based scoring: code outputs run in isolated sandboxes and are
  scored on actual pass/fail, with snapshot rollback for bad mutations.
- **WorkOS** — AuthKit login and organization-scoped evaluation history, enterprise-ready from
  hour one.
- **CodeRabbit** — independent review of the code the agent writes about itself, and the review
  signal that supported four lanes building in parallel against frozen contracts.

<!--
INTERNAL TODO (do not ship in public copy — see docs/LANE_D.md for detail):
  * Live race stream is not yet emitted by the backend; live mode connects + recovers honestly,
    recorded mode is the demo floor. Adapter is forward-compatible.
  * Braintrust experiment URLs + Fireworks cost/latency in the dashboard are mock fixtures today
    (src/fixtures/models.ts), clearly labeled, pending Lane B/C data.
  * WorkOS AuthKit is fully wired but OFF by default (dev identity fallback) until a client id is
    provided.
  * Daytona execution outcomes shown in the dashboard come from fixtures until the live stream lands.
-->
