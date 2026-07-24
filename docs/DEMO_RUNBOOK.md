# Darwin — 3-Minute Demo Runbook

The goal: land one idea — **the best model is per-task, and here's the evidence** — in three
minutes, with zero chance of a dead air moment. The demo floor is the **recorded run**; live is a
bonus, not a dependency.

## Pre-demo checklist (T-10 min)

- [ ] `cd dashboard && npm install` done; `npm run build` is green.
- [ ] `dashboard/.env` set. For the safest floor: `VITE_DEMO_MODE=recorded`.
- [ ] Decide auth: dev identity (default, zero friction) or real WorkOS (`VITE_WORKOS_ENABLED=true`
      + client id). If unsure, leave WorkOS off.
- [ ] `npm run dev` running; open `http://localhost:5173` and confirm the landing screen.
- [ ] Open a recorded run once to warm it, then return to the landing screen.
- [ ] Screen zoom / display scaling set so grid cells read from the back of the room.
- [ ] Silence notifications; full-screen the browser.

### Required environment variables

| Var | Demo value | Why |
|-----|-----------|-----|
| `VITE_DEMO_MODE` | `recorded` | Deterministic, offline-safe demo floor |
| `VITE_WORKOS_ENABLED` | `false` (or `true` + client id) | Dev identity vs real login |
| `VITE_WORKOS_CLIENT_ID` | `client_…` (only if enabled) | WorkOS AuthKit app |
| `VITE_WORKOS_REDIRECT_URI` | `http://localhost:5173/callback` | AuthKit redirect |

### Services to start

- **Dashboard:** `cd dashboard && npm run dev` → `http://localhost:5173`
- **(Live mode only)** the Python event server on `:8000` with a race emitter (see docs/LANE_D.md).
  Not required for the recorded demo.

### Browser tabs to preload

1. Dashboard — landing screen (`localhost:5173`).
2. Braintrust project page (the experiments backing the scores).
3. A Daytona sandbox / execution view (the code-task proof), if available.
4. (Optional) WorkOS dashboard showing the AuthKit app.

## Live mode flow

1. Nav → **Source: Recorded successful run** → switch to **Live pipeline**.
2. Landing → type an industry → **Build my model stack**.
3. The grid fills from the real event stream; narrate the climb.
4. If anything stalls: the banner shows the connection state and a one-click **Open recorded
   successful run** — take it and continue without breaking stride.

## Recorded fallback flow (the safe floor)

1. Ensure **Source = Recorded successful run**.
2. Landing → keep **Legal services** (or type any industry) → **Build my model stack**.
3. Decomposition animates in, the grid races cell by cell, the routing card falls out. Everything
   is deterministic and offline.

## Failure recovery

- **Wi-Fi dies / live stalls:** click **Open recorded successful run** in the banner. Never present
  recorded data as live — the badge stays honest and that's fine to say out loud.
- **Browser hiccup:** reload; open a run from **Previous runs** — cached runs open instantly.
- **Total lock-up:** the previous-run library is the airbag; open Legal services and talk to the
  finished routing card.

## The three minutes (spoken beats + timing)

**0:00 — Hook (20s).**
> "Most teams ask, 'Which LLM is best?' That's the wrong question. The model that wins
> summarization may lose extraction, code, or verification. Darwin finds the best model for every
> task in your business — and shows you the evidence."

**0:20 — Input (15s).** Landing screen. "Give it an industry — Legal services." Click **Build my
model stack**. Note the workspace/identity in the nav (WorkOS).

**0:35 — Decomposition (20s).** Tasks appear.
> "It breaks the industry into the real work: summarization, clause extraction, citation
> verification, risk classification, SQL reporting — text, structured, and code tasks."

**0:55 — The race (60s).** The hero grid fills in.
> "Every model races every task on real eval cases, scored through Braintrust. Watch the winners
> diverge — this isn't one model sweeping the board." Point at the grid: different columns win
> different rows. Hover a cell to show score, cost, latency, cases, and the Braintrust link.

**1:55 — Daytona proof (20s).** The SQL row.
> "For code, we don't trust a guess — DeepSeek's SQL runs in a Daytona sandbox and scores on real
> execution: 8 of 8 tests." Show the Daytona tab if available.

**2:15 — Routing card + the case (30s).**
> "Here's the payoff: one specialist per task. And the honest comparison — the best single model
> for everything versus Darwin routing. Higher average quality, and" (read the actual deltas)
> "lower cost and latency here. If routing cost more, we'd show that too."

**2:45 — Export + close (15s).** Click **Export routing config**.
> "That's a routing config you can ship." Close on:
> **"Generic benchmarks tell you which model wins their test. Darwin tells you which model wins
> your work."**

## WorkOS login handling

- Dev identity (default): you're already "signed in" as the demo operator; the nav shows the user
  and workspace. Optionally click **Sign out** → **Continue to dashboard** to show the gate.
- Real WorkOS: click **Sign in with WorkOS**, complete the hosted flow, land back authenticated.
  Do a dry run beforehand so the redirect is warm.

## Braintrust project tab

Have the Darwin project open. When you hover a cell's Braintrust link, cut to the tab to show a
real scored experiment behind a number. Keeps "auditable" concrete.

## Daytona proof moment

The SQL reporting row is the execution beat: "scored by running it, not by asking a model if it
looks right." If a live sandbox view is up, show the pass/fail there.

## Final close

> "Stop asking which LLM is best. Ask which LLM is best at each task — Darwin answers it with
> evidence."
