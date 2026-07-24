
This is the map for everything Lane D owns and the exact seams where the other lanes plug in.

## Files owned

```
dashboard/                         React + Vite + TypeScript dashboard
  app.html                         Lane D's Vite entry (the run dashboard)
  src/mainLaneD.tsx                Lane D entry module (AuthProvider + LaneDApp + lane-d.css)
  src/LaneDApp.tsx                 Lane D root: landing / run / library router
  src/lane-d.css                   Lane D's design system (scoped to the app.html bundle)
  src/types.ts                     the ONE normalized frontend event/data contract
  src/lib/routing.ts               winner selection, single-model baseline, comparison, export
  src/lib/landscape.ts             axis seriation + column geometry for the score landscape
  src/components/ScoreLandscape.tsx  the 3D task x model skyline (lazy-loaded three.js)
  src/lib/format.ts                display formatters
  src/store/reducer.ts             pure run-state reducer (the only place events are applied)
  src/store/useDarwinRun.ts        run lifecycle: owns the reducer + active source + demo mode
  src/sources/replay.ts            deterministic recorded/mock replay
  src/sources/websocket.ts         live WS client (reconnect + honest failure states)
  src/sources/backendAdapter.ts    raw backend event -> normalized DarwinEvent
  src/fixtures/                     mock/recorded runs (Legal services, Customer support)
  src/components/                   all UI (landing, decomposition, race grid, routing, library…)
  scripts/dumpFixtures.ts          serialize fixtures to data/runs/*.dashboard.json

darwin/server/events.py            event channel (Lane D owns the WS surface; see open items)
data/runs/*.dashboard.json         serialized replay fixtures (generated; source of truth is TS)
```

Lane D does **not** edit `darwin/core/*`, `darwin/eval/*`, `darwin/sandbox/*`, `pipeline/*`.

## How Lane D coexists with the landing app (two Vite entries)

`main` already ships a landing / evolution-replay app (`index.html` → `src/main.tsx` →
`src/App.tsx` + `src/app.css`). Lane D's dashboard carries an independent design system, and the
two collide by name: both define a `.app` class and both define `--bg`, `--fg`, `--warn`,
`--radius`, `--font-sans`, `--font-mono` on `:root`. In a single bundle whichever stylesheet loads
last silently restyles the other.

So the two ship as **separate Vite entries** (`build.rollupOptions.input`), which keeps their CSS
in separate chunks:

| Entry | URL | Owner | Bundle |
|---|---|---|---|
| `index.html` | `/` | landing / evolution replay (untouched by Lane D) | `main-*.js` + `main-*.css` |
| `app.html` | `/app.html` | Lane D run dashboard | `app-*.js` + `app-*.css` |

Lane D changed **no** file belonging to the landing app: `index.html`, `src/App.tsx`,
`src/main.tsx`, `src/index.css`, and `src/app.css` are byte-identical to `main`.

**The demo runs at `/app.html`, not `/`.**

## The score landscape (Grid / Landscape tab)

The race screen has two views of the same data. **Grid is the default** — it is the table view,
it is screen-reader navigable, and every value is readable there. **Landscape** is the hero: the
same task × model scores as an extruded 3D skyline.

Deliberate constraints, because this data does not support a free-form surface:

- **Stepped, never a smooth mesh.** Both axes are nominal and a run carries only 16–25 measured
  cells. Interpolating between them would invent the overwhelming majority of the geometry, and
  the peaks would move if the fixtures were reordered.
- **Axes seriated by marginal mean score**, so the relief means something instead of echoing the
  fixture order. Seriation applies **only once the run completes** — reordering mid-race would
  make columns jump as results land.
- **Height is score, anchored at zero.** No truncated baseline.
- **Colour is emphasis, not magnitude.** The row winner takes the accent; everything else
  recedes. A score→colour ramp would re-encode what height already shows. Winners carry a direct
  `%` label; identity is never colour-alone (see the legend).
- **The translucent plane is the best single model's mean score.** Columns above it beat "just
  pick one model" — the product argument, visible at a glance.

Winners use the design system's own `--primary` (`#4f7bff`), so a winner reads identically in the
landscape and in the grid. Validated with the dataviz validator against the dashboard surface
(`#111113`): `#4f7bff` and failed `#d03b3b` pass the lightness band, chroma floor, CVD separation
(all-pairs protanopia ΔE 29.5), normal-vision floor (33.8) and 3:1 contrast.

three.js is **lazy-loaded** (`React.lazy` on the tab, prefetched on hover), so the default grid
path stays ~58 kB and the ~230 kB gz 3D chunk only downloads if someone opens the tab. Browsers
without WebGL get an honest fallback pointing at the grid.

## Architecture

Every data source is adapted into one normalized event stream (`DarwinEvent` in `types.ts`) and
fed to one reducer (`store/reducer.ts`). Components read state and dispatch nothing directly —
`useDarwinRun` is the single owner of the active source and the demo mode.

```
 IndustryInput ─┐
 RunLibrary ────┤        ┌─ mock replay ──────┐
 DemoControls ──┼─▶ useDarwinRun ─ source ─────┼─ recorded replay ─┐
                │        │                      └─ live WebSocket ──┴─▶ backendAdapter
                │        ▼                                                    │
                │   runReducer(state, {kind:'event', event})  ◀──────────────┘
                ▼        │
           React views ◀─ RunState (phase, cells, feed, routingCard, connection)
```

### The normalized contract (`DarwinEvent`)

`run_started · task_created · decomposition_complete · race_queued · race_started · race_scoring ·
sandbox_started · sandbox_result · race_scored · race_failed · routing_updated · run_completed`

Cells are keyed `taskId::modelId`. The reducer patches a cell through
`queued → running → scoring → [executing] → complete | failed` and derives the routing card and
the activity feed. `lib/routing.ts` is pure and unit-tested; it never hardcodes a positive claim.

### Event adapter (the important backend seam)

`darwin/server/events.py` currently emits **evolution** events for the self-improvement loop:
`run_started, generation_started, variant_evaluated, generation_complete, champion_changed,
mutation, guard, run_complete`. Those describe generations of a coding agent — not a task × model
race — so they do not carry the grid data the routing view needs.

`sources/backendAdapter.ts` therefore does three honest things:

1. **Pass-through** for any event that already uses our race vocabulary (`race_scored`, etc.). So
   when a race emitter is added backend-side with these names, the live grid lights up with **zero
   UI changes**.
2. **Best-effort lifecycle mapping** of the current evolution events it can (`run_started`,
   `run_complete`).
3. **Ignore** (return `null`) evolution events with no faithful race mapping, rather than invent
   grid cells.

## Mock data

`src/fixtures/` builds complete runs from a score matrix via `buildRunDoc` (which derives the
routing card through the same `lib/routing` code the live path uses). `models.ts` is the single,
clearly-labeled place mock Fireworks model ids / cost / latency live. Winners differ per task by
construction (Legal: Kimi / Qwen / DeepSeek / Llama / DeepSeek). `npx vite-node
scripts/dumpFixtures.ts` serializes them to `data/runs/*.dashboard.json`.

## Live integration (what teammates need to wire)

To make **Live pipeline** mode fill the grid for real, the backend needs to:

1. **Add a WebSocket fan-out** to `darwin/server/events.py` (Phase 4): a FastAPI `/ws` endpoint
   that registers each client as an `EventChannel` subscriber and forwards `{type, payload, ts}`.
   Vite already proxies `/ws → localhost:8000`.
2. **Emit race-shaped events** using the normalized names above (the adapter passes them through).
   Minimum viable set: `task_created` (per decomposed task), `race_queued/started/scoring`,
   `sandbox_started/sandbox_result` (code tasks), `race_scored` (with a `RaceResult`-shaped
   payload), and `run_completed` (with a `RoutingCard`). Field names must match `types.ts`.
3. **Provide a run trigger** the dashboard can call to start a live run for a typed industry
   (e.g. `POST /run {industry}`), or run the engine and let the dashboard attach to the stream.

Until then, live mode connects, shows an honest "waiting/unavailable" state, and offers one-click
recovery to the recorded run. Recorded mode is the demo floor.


client id is present; otherwise a polished dev identity. Both paths implement login/logout, a
protected route (`LoginGate`), and identity + workspace in the nav.


   `http://localhost:5173/callback` (and the prod URL) as a redirect URI.
2. In `dashboard/.env`:
   ```
   ```
   server secret is required for this integration. No secret is ever committed.

## Demo modes

`Live pipeline` / `Recorded successful run` / `Mock development run`, switchable in the nav and
lockable with `VITE_DEMO_MODE`. Default is `recorded` (safest). The selected source is always
labeled; cached runs never display as LIVE.

## Remaining integration points (open)

- [ ] Backend: WS fan-out in `darwin/server/events.py` + a run trigger endpoint.
- [ ] Backend: emit normalized race events (or a thin translator from evolution → race).
- [ ] Lane C: real Fireworks model ids + measured cost/latency → replace `src/fixtures/models.ts`.
- [ ] Lane B: real Braintrust experiment URLs on `race_scored` payloads (nulls handled today).
- [ ] Deploy `dashboard/dist` to `darwin.pages.dev` (Wrangler) — see SPEC §17.
