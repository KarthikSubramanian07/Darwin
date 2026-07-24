import "./app.css";
import { FitnessCurve } from "./FitnessCurve";
import { Logo } from "./Logo";
import {
  CURVE,
  MODELS,
  RACE,
  eventsUpTo,
  leaderboardAt,
  safeguardsFired,
} from "./run";
import { useEvolution } from "./useEvolution";
import { useLiveRun } from "./useLiveRun";
import { useTween } from "./useTween";

const KIND_LABEL: Record<string, string> = {
  seed: "seed",
  eval: "eval",
  champion: "champion",
  mutate: "mutation",
  reject: "rollback",
  block: "blocked",
};

const GUARDS = [
  "sandboxed self-modification",
  "a grader it can't touch",
  "regressions rolled back",
  "a human signs off",
];

const MARQUEE = [
  ["Prompt optimizers edit the words.", "Darwin rewrites the tools."],
  ["Model routers rank someone else's benchmark.", "Darwin wins on yours."],
  ["AlphaEvolve is a paper.", "This runs in three minutes."],
  ["The score isn't a report you read.", "It's who lives and who dies."],
];

export default function App() {
  const { gen, phase, run } = useEvolution(9500); // ~1 min replay so it reads as a real run
  const live = useLiveRun();

  // Live when the WS server is up and at least one run has streamed; otherwise the bundled
  // replay - always labelled as such (honesty rule: never present a cached run as live).
  const isLive = live.connected && live.hasData;
  const L = live.state;

  const curve = isLive ? (L.curve.length ? L.curve : [0]) : CURVE;
  const genIdx = isLive ? Math.max(0, L.curve.length - 1) : gen;
  const totalGens = isLive ? L.totalGens : 6;
  const best = curve[genIdx] ?? 0;
  const pct = useTween(best * 100);
  const variants = useTween(isLive ? L.pool.length : 8 + gen * 6);
  const fired = useTween(
    isLive
      ? L.events.filter((e) => e.kind === "reject" || e.kind === "block").length
      : safeguardsFired(gen),
  );
  const leaderboard = isLive
    ? [...L.pool].sort((a, b) => b.fit - a.fit || a.id.localeCompare(b.id)).slice(0, 6)
    : leaderboardAt(gen);
  const log = isLive ? [...L.events].reverse() : [...eventsUpTo(gen)].reverse();

  // The race grid + routing card: real per-problem x per-model scores from this run when
  // live; the bundled sample (labelled as such) otherwise.
  const liveRaceReady = isLive && L.models.length > 0 && Object.keys(L.race).length > 0;
  const raceModels = liveRaceReady ? L.models : MODELS;
  const raceRows = liveRaceReady
    ? Object.entries(L.race).map(([task, perModel]) => {
        const scores = raceModels.map((m) => Math.round((perModel[m] ?? 0) * 100));
        return { task, scores, winner: scores.indexOf(Math.max(...scores)) };
      })
    : RACE;
  const raceResolved = isLive ? L.finished : phase === "done";

  // Replay only: cells + winners appear as the run progresses, so the grid fills in over the
  // generations instead of being fully populated from frame one (live cells already only exist
  // once the backend has measured them).
  const nRaceModels = raceModels.length;
  const nRaceCells = Math.max(1, raceRows.length * nRaceModels);
  const cellRevealed = (rowIdx: number, colIdx: number): boolean => {
    if (isLive) return true;
    const k = rowIdx * nRaceModels + colIdx;
    return genIdx >= 1 + Math.floor((k / nRaceCells) * Math.max(1, totalGens - 1));
  };
  const rowRevealed = (rowIdx: number): boolean =>
    isLive ? raceResolved : raceModels.every((_, ci) => cellRevealed(rowIdx, ci));
  const diffReady = isLive ? Boolean(L.lastRewrite) : genIdx >= 2;

  // The primary button: drive a REAL run when the server is there, else replay the sample.
  const onRun = live.connected ? () => void live.startRun() : run;
  const running = isLive ? L.running : phase === "playing";

  const statusText = isLive
    ? L.running
      ? `generation ${Math.min(L.curve.length + 1, totalGens)} of ${totalGens} · live`
      : L.finished
        ? "done, it solved itself · live run"
        : "server connected, ready"
    : phase === "playing"
      ? `generation ${gen + 1} of 6 · replay`
      : phase === "done"
        ? "done, it solved itself · replay"
        : live.connected
          ? "server connected, ready when you are"
          : "ready when you are";

  return (
    <div className="app">
      <div className="aurora" />

      <nav className="nav">
        <a className="brand" href="/" aria-label="Darwin home">
          <Logo size={26} />
          <span className="wordmark">Darwin</span>
        </a>
        <div className="links">
          <a className="navlink" href="#run">Overview</a>
          <a className="navlink" href="https://github.com/KarthikSubramanian07/Darwin">GitHub</a>
          <a className="btn btn-primary btn-sm" href="/app.html">The Lab ↗</a>
        </div>
      </nav>

      <section className="hero">
        <div className="herotext">
          <span className="eyebrow reveal">
            <span className={`dot ${running ? "playing" : isLive && L.finished ? "done" : phase}`} />{" "}
            {statusText}
          </span>
          <h1 className="title reveal" style={{ animationDelay: "0.06s" }}>
            Agents that <span className="accent">breed better agents.</span>
          </h1>
          <p className="lede reveal" style={{ animationDelay: "0.12s" }}>
            Point Darwin at a task. Its first attempt is deliberately mediocre. Then it breeds a
            population of variants, rewrites their tools, prompt, and even the model they run on,
            and keeps whatever scores higher. Nobody helps it. It never escapes the sandbox. It
            just gets better.
          </p>
          <div className="cta reveal" style={{ animationDelay: "0.18s" }}>
            <button className="btn btn-primary" onClick={onRun}>
              {running
                ? "Evolving…"
                : live.connected
                  ? "Run a live evolution"
                  : phase === "done"
                    ? "Run it again"
                    : "Run the evolution"}
            </button>
            <a className="btn btn-ghost" href="https://github.com/KarthikSubramanian07/Darwin">
              Steal our code (it's MIT)
            </a>
          </div>
          <div className="config reveal" style={{ animationDelay: "0.24s" }}>
            8 variants · 6 generations · {MODELS.length} models in the race · sandboxed by
            <b> Daytona</b> · scored by <b>Braintrust</b> · mutated by <b>Fireworks AI</b>
          </div>
        </div>
      </section>

      <div className="marquee">
        <div className="track">
          {[...MARQUEE, ...MARQUEE].map(([a, b], i) => (
            <span key={i}>
              {a} <b>{b}</b>
            </span>
          ))}
        </div>
      </div>

      <section id="run" className="card hoverable showcase">
        <div className="cardhead">
          <div>
            <h3>Fitness</h3>
            <div className="cap">best score per generation, climbing on its own</div>
          </div>
          <span className={`livechip ${running ? "playing" : phase}`}>
            {isLive
              ? L.running
                ? "● live"
                : "live run"
              : phase === "playing"
                ? "● replay"
                : phase === "done"
                  ? "cached replay"
                  : "ready"}
          </span>
        </div>
        <FitnessCurve values={curve} activeIndex={genIdx} height={200} />
        <div className="metric">
          <span className="big num">{Math.round(pct)}%</span>
          <span className="delta">
            {genIdx === 0
              ? "generation zero, and it shows"
              : `+${Math.round((best - (curve[0] ?? 0)) * 100)} pts, nobody helped`}
          </span>
        </div>
      </section>

      <section className="grid2">
        <div className="card hoverable">
          <h3>Population</h3>
          <div className="cap" style={{ marginBottom: 6 }}>
            ranked by fitness. the fittest breed. · <b>g4-17</b> reads: born in generation 4,
            the 17th genome created this run
          </div>
          {leaderboard.map((v, i) => (
            <div className="row" key={v.id}>
              <span className="name num">
                {v.id}
                <span style={{ color: "var(--fg-faint)", fontSize: 11 }}> · {v.model}</span>
              </span>
              <span className="bar">
                <span key={`${v.id}-${genIdx}`} style={{ width: `${v.fit * 100}%`, animationDelay: `${i * 0.05}s` }} />
              </span>
              <span className="val num">{Math.round(v.fit * 100)}</span>
            </div>
          ))}
          <div className="modeltag">
            top model: <b>{leaderboard[0]?.model}</b>
          </div>
        </div>

        <div className="card hoverable">
          <h3>Evolution log</h3>
          <div className="cap" style={{ marginBottom: 8 }}>what happened, generation by generation</div>
          <div className="feed">
            {log.length === 0 && <div className="feeditem muted">waiting for the first generation…</div>}
            {log.map((e, i) => (
              <div className={`feeditem ${e.kind}`} key={`${e.gen}-${e.text}`} style={{ animationDelay: `${Math.min(i, 3) * 0.04}s` }}>
                <span className="edot" />
                <span className="etag">{KIND_LABEL[e.kind]}</span>
                <span className="etext">{e.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="tiles">
        <div className="tile">
          <div className="k">Generation</div>
          <div className="v num">{genIdx + 1}/{totalGens}</div>
        </div>
        <div className="tile">
          <div className="k">Best score</div>
          <div className="v num">{Math.round(pct)}%</div>
        </div>
        <div className="tile">
          <div className="k">Variants bred</div>
          <div className="v num">{Math.round(variants)}</div>
        </div>
        <div className="tile">
          <div className="k">Safeguards fired</div>
          <div className="v num">{Math.round(fired)}</div>
        </div>
      </section>

      <section className={`card hoverable race ${raceResolved ? "resolved" : ""}`}>
        <h3>The race</h3>
        <div className="cap" style={{ marginBottom: 12 }}>
          {liveRaceReady
            ? `${raceModels.length} models × ${raceRows.length} problems on ${L.task} · every cell is a best pass-rate from THIS run`
            : `${MODELS.length} models × ${RACE.length} tasks · each cell is a Braintrust experiment · filling in as the run progresses`}
        </div>
        <div className="racescroll">
          <div className="racegrid" style={{ gridTemplateColumns: `120px repeat(${raceModels.length}, minmax(64px, 1fr))` }}>
            <div className="rh" />
            {raceModels.map((m) => (
              <div className="rh" key={m}>{m}</div>
            ))}
            {raceRows.map((r, ri) => (
              <RaceRow
                key={r.task}
                row={r}
                revealed={raceModels.map((_, ci) => cellRevealed(ri, ci))}
                showWinner={rowRevealed(ri)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="grid2">
        <div className="card hoverable">
          {isLive && L.lastRewrite ? (
            <>
              <h3>
                What it rewrote in itself · gen {L.lastRewrite.gen} ·{" "}
                {L.lastRewrite.kind === "tool" ? `tool ${L.lastRewrite.tool}` : L.lastRewrite.kind}
              </h3>
              <div className="cap">
                no human wrote this. {L.lastRewrite.genomeId} did, to beat its parent.
              </div>
              <div className="diff">
                {L.lastRewrite.kind === "model" ? (
                  <>
                    <span className="del">- model: {L.lastRewrite.old.split("/").pop()}{"\n"}</span>
                    <span className="add">+ model: {L.lastRewrite.new.split("/").pop()}{"\n"}</span>
                  </>
                ) : (
                  <>
                    {L.lastRewrite.old.split("\n").slice(0, 6).map((line, i) => (
                      <span className="del" key={`d${i}`}>- {line}{"\n"}</span>
                    ))}
                    {L.lastRewrite.new.split("\n").slice(0, 10).map((line, i) => (
                      <span className="add" key={`a${i}`}>+ {line}{"\n"}</span>
                    ))}
                  </>
                )}
              </div>
            </>
          ) : diffReady ? (
            <>
              <h3>What it rewrote in itself · gen 1 → 2</h3>
              <div className="cap">no human wrote this. the agent did, to beat its last version.</div>
              <div className="diff">
                <span className="ctx">  def two_sum(nums, target):{"\n"}</span>
                <span className="del">-     return []            # gives up{"\n"}</span>
                <span className="add">+     seen = {"{}"}{"\n"}</span>
                <span className="add">+     for i, x in enumerate(nums):{"\n"}</span>
                <span className="add">+         if target - x in seen:{"\n"}</span>
                <span className="add">+             return [seen[target - x], i]{"\n"}</span>
                <span className="add">+         seen[x] = i{"\n"}</span>
              </div>
            </>
          ) : (
            <>
              <h3>What it rewrote in itself</h3>
              <div className="cap">the first self-rewrite lands in generation 2…</div>
              <div className="diff">
                <span className="ctx">  waiting for the agent to rewrite one of its own tools…{"\n"}</span>
              </div>
            </>
          )}
        </div>

        <div className="card hoverable">
          <h3>Routing card</h3>
          <div className="cap" style={{ marginBottom: 6 }}>
            stop picking one model for everything. here's the specialist for each task.
          </div>
          {raceRows.map((r, i) => {
            const ready = rowRevealed(i);
            return (
              <div className="row" key={r.task}>
                <span className="name" style={{ width: 150 }}>
                  {r.task}
                  {ready ? (
                    <span style={{ color: "var(--fg-faint)", fontSize: 11 }}> · {raceModels[r.winner]}</span>
                  ) : (
                    <span style={{ color: "var(--fg-faint)", fontSize: 11 }}> · racing…</span>
                  )}
                </span>
                <span className="bar">
                  <span style={{ width: ready ? `${r.scores[r.winner]}%` : "0%", animationDelay: `${0.2 + i * 0.06}s` }} />
                </span>
                <span className="val num">{ready ? r.scores[r.winner] : "·"}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="safeguards">
        <span className="sg-label">why you can actually deploy this:</span>
        {GUARDS.map((g) => (
          <span className="guard" key={g}>
            <span className="check">✓</span> {g}
          </span>
        ))}
      </section>

      <footer className="footer">
        <span>The number goes up on its own. The sandbox is why you can sleep.</span>
        <span>Darwin · Daytona SF HackSprint</span>
      </footer>
    </div>
  );
}

function RaceRow({
  row,
  revealed,
  showWinner,
}: {
  row: { task: string; scores: number[]; winner: number };
  revealed: boolean[];
  showWinner: boolean;
}) {
  return (
    <>
      <div className="rlabel">{row.task}</div>
      {row.scores.map((s, i) => {
        const shown = revealed[i];
        const win = shown && showWinner && i === row.winner;
        return (
          <div
            className={`cell ${shown ? "" : "cell-queued"} ${win ? "win" : ""}`}
            key={i}
            style={shown ? { background: `color-mix(in oklch, var(--accent) ${s * 0.85}%, transparent)` } : undefined}
          >
            <span className="num">{shown ? s : "·"}</span>
          </div>
        );
      })}
    </>
  );
}
