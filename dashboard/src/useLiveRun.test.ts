import { describe, expect, it } from "vitest";
import { EMPTY, reduce, type LiveState } from "./useLiveRun";

const ev = (type: string, payload: Record<string, unknown>) => ({ type, payload });

function play(events: ReturnType<typeof ev>[], from: LiveState = EMPTY): LiveState {
  return events.reduce(reduce, from);
}

describe("live event reducer", () => {
  it("folds per-problem scores into a task x model race grid, keeping the best per cell", () => {
    const s = play([
      ev("run_started", { run_id: "r", task: "coding_bench", generations: 6, population_size: 8 }),
      ev("variant_evaluated", {
        genome_id: "g0-0",
        model: "accounts/fireworks/models/gpt-oss-120b",
        fitness: 0.5,
        generation: 0,
        problems: { two_sum: 0.0, fizzbuzz: 1.0 },
      }),
      ev("variant_evaluated", {
        genome_id: "g1-1",
        model: "accounts/fireworks/models/gpt-oss-120b",
        fitness: 0.75,
        generation: 1,
        problems: { two_sum: 1.0, fizzbuzz: 0.5 }, // fizzbuzz regressed; grid keeps the best
      }),
      ev("variant_evaluated", {
        genome_id: "g1-2",
        model: "accounts/fireworks/models/kimi-k2p6",
        fitness: 0.25,
        generation: 1,
        problems: { two_sum: 0.5, fizzbuzz: 0.5 },
      }),
    ]);
    expect(s.models).toEqual(["gpt-oss-120b", "kimi-k2p6"]);
    expect(s.race.two_sum).toEqual({ "gpt-oss-120b": 1.0, "kimi-k2p6": 0.5 });
    expect(s.race.fizzbuzz["gpt-oss-120b"]).toBe(1.0); // best-ever, not latest
  });

  it("captures the latest real rewrite from mutation events", () => {
    const s = play([
      ev("run_started", { run_id: "r", task: "t", generations: 6, population_size: 8 }),
      ev("mutation", {
        genome_id: "g1-1",
        generation: 1,
        note: "fixed two_sum",
        rewrite: { kind: "tool", tool: "two_sum", old: "return []", new: "return [0, 1]" },
      }),
      ev("mutation", { genome_id: "g1-2", generation: 1, note: "no-op carry" }), // no rewrite
    ]);
    expect(s.lastRewrite).toMatchObject({
      kind: "tool",
      tool: "two_sum",
      genomeId: "g1-1",
      new: "return [0, 1]",
    });
  });

  it("a new run resets the grid, pool, and rewrite", () => {
    const mid = play([
      ev("run_started", { run_id: "r1", task: "t", generations: 6, population_size: 8 }),
      ev("variant_evaluated", { genome_id: "a", model: "m/x", fitness: 1, generation: 0, problems: { p: 1 } }),
      ev("mutation", { genome_id: "b", generation: 1, rewrite: { kind: "tool", tool: "p", old: "", new: "x" } }),
    ]);
    const fresh = reduce(mid, ev("run_started", { run_id: "r2", task: "t", generations: 6, population_size: 8 }));
    expect(fresh.race).toEqual({});
    expect(fresh.pool).toEqual([]);
    expect(fresh.lastRewrite).toBeNull();
    expect(fresh.runId).toBe("r2");
  });

  it("unknown event types are ignored", () => {
    const s = play([ev("run_started", { run_id: "r", task: "t" }), ev("totally_new_thing", {})]);
    expect(s.runId).toBe("r");
  });
});
