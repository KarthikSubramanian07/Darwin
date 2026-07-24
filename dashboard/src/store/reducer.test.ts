import { describe, expect, it } from "vitest";
import { initialRunState, raceProgress, runReducer, type RunState } from "./reducer";
import type { DarwinEvent, ModelInfo, RaceResult, RunSummary, TaskInfo } from "../types";
import { cellKey } from "../types";

const models: ModelInfo[] = [
  { id: "m-a", label: "Model A" },
  { id: "m-b", label: "Model B" },
];
const task: TaskInfo = { id: "t1", name: "Summarize", description: "", type: "TEXT", caseCount: 10 };

const summary: RunSummary = {
  runId: "run-1",
  industry: "Legal services",
  createdAt: "2026-07-24T00:00:00Z",
  source: "recorded_demo",
  taskCount: 1,
  modelCount: 2,
};

const ev = (event: DarwinEvent): { kind: "event"; event: DarwinEvent } => ({ kind: "event", event });

const play = (events: DarwinEvent[], from: RunState = initialRunState): RunState =>
  events.reduce((s, e) => runReducer(s, ev(e)), from);

describe("event reducer", () => {
  it("moves through phases as events arrive", () => {
    let s = runReducer(initialRunState, ev({ type: "run_started", ts: 1, run: summary, models }));
    expect(s.phase).toBe("decomposing");
    expect(s.models).toHaveLength(2);

    s = runReducer(s, ev({ type: "task_created", ts: 2, task }));
    expect(s.tasks).toHaveLength(1);

    s = runReducer(s, ev({ type: "decomposition_complete", ts: 3 }));
    expect(s.phase).toBe("racing");
  });

  it("transitions a cell through states without losing prior fields", () => {
    let s = play([
      { type: "run_started", ts: 1, run: summary, models },
      { type: "task_created", ts: 2, task },
      { type: "race_queued", ts: 3, taskId: "t1", modelId: "m-a", caseCount: 10 },
    ]);
    expect(s.cells[cellKey("t1", "m-a")].state).toBe("queued");
    expect(s.cells[cellKey("t1", "m-a")].caseCount).toBe(10);

    s = runReducer(s, ev({ type: "race_started", ts: 4, taskId: "t1", modelId: "m-a" }));
    expect(s.cells[cellKey("t1", "m-a")].state).toBe("running");
    expect(s.cells[cellKey("t1", "m-a")].caseCount).toBe(10); // preserved across patch
  });

  it("records a completed score and emits a feed item", () => {
    const result: RaceResult = {
      taskId: "t1",
      modelId: "m-a",
      score: 0.94,
      costPer1k: 0.6,
      p50LatencyMs: 900,
      caseCount: 10,
      braintrustUrl: null,
      sandbox: null,
      state: "complete",
    };
    const s = play([
      { type: "run_started", ts: 1, run: summary, models },
      { type: "task_created", ts: 2, task },
      { type: "race_scored", ts: 3, result },
    ]);
    expect(s.cells[cellKey("t1", "m-a")].state).toBe("complete");
    expect(s.cells[cellKey("t1", "m-a")].score).toBe(0.94);
    expect(s.feed.some((f) => f.kind === "score")).toBe(true);
  });

  it("marks failures and surfaces them in the feed", () => {
    const s = play([
      { type: "run_started", ts: 1, run: summary, models },
      { type: "task_created", ts: 2, task },
      { type: "race_failed", ts: 3, taskId: "t1", modelId: "m-b", error: "timeout" },
    ]);
    expect(s.cells[cellKey("t1", "m-b")].state).toBe("failed");
    expect(s.feed.some((f) => f.kind === "warn")).toBe(true);
  });

  it("completes the run with a routing card", () => {
    const s = play([
      { type: "run_started", ts: 1, run: summary, models },
      { type: "run_completed", ts: 2, card: { industry: "Legal services", entries: [] } },
    ]);
    expect(s.phase).toBe("complete");
    expect(s.routingCard).not.toBeNull();
  });

  it("computes race progress from completed/failed cells", () => {
    const result: RaceResult = {
      taskId: "t1",
      modelId: "m-a",
      score: 0.9,
      costPer1k: 1,
      p50LatencyMs: 1,
      caseCount: 10,
      braintrustUrl: null,
      sandbox: null,
      state: "complete",
    };
    const s = play([
      { type: "run_started", ts: 1, run: summary, models },
      { type: "task_created", ts: 2, task },
      { type: "race_scored", ts: 3, result },
    ]);
    // 1 of (1 task x 2 models) = 0.5
    expect(raceProgress(s)).toBeCloseTo(0.5, 5);
  });
});

describe("source labeling", () => {
  it("keeps the honest source from run_started", () => {
    const s = runReducer(
      initialRunState,
      ev({ type: "run_started", ts: 1, run: { ...summary, source: "live" }, models }),
    );
    expect(s.source).toBe("live");
  });

  it("hydrate opens a persisted run instantly as complete with its own source", () => {
    const result: RaceResult = {
      taskId: "t1",
      modelId: "m-a",
      score: 0.9,
      costPer1k: 1,
      p50LatencyMs: 1,
      caseCount: 10,
      braintrustUrl: null,
      sandbox: null,
      state: "complete",
    };
    const s = runReducer(initialRunState, {
      kind: "hydrate",
      summary: { ...summary, source: "previously_computed" },
      models,
      tasks: [task],
      results: [result],
      routingCard: { industry: "Legal services", entries: [] },
    });
    expect(s.phase).toBe("complete");
    expect(s.source).toBe("previously_computed");
    expect(Object.keys(s.cells)).toHaveLength(1);
    expect(s.feed).toHaveLength(0); // no fake replay/loading
  });
});
