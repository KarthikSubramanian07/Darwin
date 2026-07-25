// Live wiring: WebSocket client + reducer that folds engine events into the exact shapes the
// replay page already renders (curve / pool / log), so App.tsx switches sources, not layouts.
//
// Server: darwin/server/app.py (`python -m darwin.server.app`). In dev, vite proxies /ws and
// /api to :8000. When no server is reachable the hook reports connected=false and the page
// falls back to the bundled replay - with the honest "cached" badge, never a fake "live".

import { useEffect, useRef, useState } from "react";
import { apiUrl, liveWsUrl } from "./lib/wsUrl";
import type { EventKind, Genome, RunEvent } from "./run";

export interface LiveRewrite {
  kind: "tool" | "model" | "prompt";
  tool?: string;
  old: string;
  new: string;
  genomeId: string;
  gen: number;
}

export interface LiveState {
  runId: string;
  task: string;
  totalGens: number;
  curve: number[]; // best fitness per completed generation
  pool: Genome[]; // every evaluated variant (id, gen, fit, model)
  events: RunEvent[]; // the evolution log, engine-truth
  models: string[]; // short model names in order of first appearance (the race columns)
  // problem -> model -> best pass-rate seen this run (the live task x model grid)
  race: Record<string, Record<string, number>>;
  lastRewrite: LiveRewrite | null; // the most recent real self-written diff
  running: boolean;
  finished: boolean;
}

export const EMPTY: LiveState = {
  runId: "",
  task: "",
  totalGens: 6,
  curve: [],
  pool: [],
  events: [],
  models: [],
  race: {},
  lastRewrite: null,
  running: false,
  finished: false,
};

const shortModel = (m?: string) => (m ? m.split("/").pop() ?? m : "?");

// One engine event -> state. Mirrors darwin/server/events.py's type list; unknown types no-op
// so the server can grow without breaking the page. Exported for unit tests.
export function reduce(s: LiveState, e: { type: string; payload: Record<string, any> }): LiveState {
  const p = e.payload ?? {};
  const push = (kind: EventKind, gen: number, text: string): LiveState => ({
    ...s,
    events: [...s.events, { gen, kind, text }],
  });

  switch (e.type) {
    case "run_started":
      return {
        ...EMPTY,
        runId: p.run_id ?? "",
        task: p.task ?? "",
        totalGens: p.generations ?? 6,
        running: true,
        events: [
          {
            gen: 0,
            kind: "seed",
            text: `run started on ${p.task} (${p.total_cases} cases, ${
              p.population_size
            } variants${p.real_isolation ? ", real Daytona isolation" : ", local sandbox"})`,
          },
        ],
      };
    case "variant_evaluated": {
      const model = shortModel(p.model);
      const g: Genome = {
        id: p.genome_id,
        gen: p.generation ?? 0,
        fit: p.fitness ?? 0,
        model,
      };
      // fold per-problem pass rates into the race grid: best score per (problem, model)
      const race = { ...s.race };
      for (const [pid, score] of Object.entries<number>(p.problems ?? {})) {
        const row = { ...(race[pid] ?? {}) };
        row[model] = Math.max(row[model] ?? 0, score);
        race[pid] = row;
      }
      return {
        ...s,
        pool: [...s.pool.filter((x) => x.id !== g.id), g],
        models: s.models.includes(model) ? s.models : [...s.models, model],
        race,
      };
    }
    case "generation_complete":
      return {
        ...push(
          "eval",
          p.index ?? s.curve.length,
          `gen ${(p.index ?? 0) + 1} evaluated, best ${Math.round((p.best_fitness ?? 0) * 100)}%`,
        ),
        curve: [...s.curve, p.best_fitness ?? 0],
      };
    case "champion_changed":
      return push(
        "champion",
        p.generation ?? s.curve.length,
        `new champion ${p.genome_id}, ${Math.round((p.fitness ?? 0) * 100)}%`,
      );
    case "mutation": {
      const next = push("mutate", (p.generation ?? 1) - 1, `${p.genome_id}: ${p.note ?? "mutated"}`);
      const rw = p.rewrite;
      if (rw && rw.kind && typeof rw.new === "string") {
        next.lastRewrite = {
          kind: rw.kind,
          tool: rw.tool,
          old: rw.old ?? "",
          new: rw.new,
          genomeId: p.genome_id,
          gen: p.generation ?? 0,
        };
      }
      return next;
    }
    case "guard": {
      const gen = s.curve.length;
      switch (p.guard) {
        case "regression_rejected":
          return push("reject", gen, `${p.genome_id} scored below its parent, rejected`);
        case "rolled_back":
          return push("reject", gen, `${p.genome_id} sandbox rolled back from snapshot`);
        case "grader_tamper":
          return push("block", gen, `${p.genome_id} blocked: tried to reach the grader`);
        case "promotion_blocked":
          return push("block", gen, `${p.genome_id} promotion blocked by review`);
        case "variant_failed":
          return push("eval", gen, `${p.genome_id} failed in its sandbox, scored 0`);
        default:
          return s;
      }
    }
    case "run_complete":
      return {
        ...push("champion", s.curve.length - 1, `run complete, final ${Math.round((p.final_fitness ?? 0) * 100)}%`),
        running: false,
        finished: true,
      };
    case "run_failed":
      return { ...push("block", s.curve.length, `run failed: ${p.error}`), running: false };
    default:
      return s;
  }
}

export function useLiveRun() {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<LiveState>(EMPTY);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let retry = 0;
    let timer = 0;

    function connect() {
      const ws = new WebSocket(liveWsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
      };
      ws.onmessage = (msg) => {
        try {
          setState((s) => reduce(s, JSON.parse(msg.data)));
        } catch {
          /* malformed frame: ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed && retry < 5) {
          timer = window.setTimeout(connect, 2000 * ++retry);
        }
      };
    }

    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  async function startRun(task = "coding_bench") {
    const res = await fetch(apiUrl("/api/run"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task }),
    });
    return res.ok;
  }

  // hasData: at least one run reached the page (snapshot or live), so live panels are honest
  return { connected, hasData: state.events.length > 0, state, startRun };
}
