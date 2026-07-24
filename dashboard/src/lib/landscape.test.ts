import { describe, expect, it } from "vitest";
import { buildLandscape, meanScore, seriate } from "./landscape";
import type { ModelInfo, RaceResult, TaskInfo } from "../types";
import { cellKey } from "../types";

const task = (id: string, name = id): TaskInfo => ({
  id,
  name,
  description: "",
  type: "TEXT",
  caseCount: 10,
});

const model = (id: string, label = id): ModelInfo => ({ id, label });

const result = (
  taskId: string,
  modelId: string,
  score: number,
  state: RaceResult["state"] = "complete",
): RaceResult => ({
  taskId,
  modelId,
  score,
  costPer1k: 1,
  p50LatencyMs: 100,
  caseCount: 10,
  braintrustUrl: null,
  sandbox: null,
  state,
});

const cellsOf = (rows: RaceResult[]): Record<string, RaceResult> =>
  Object.fromEntries(rows.map((r) => [cellKey(r.taskId, r.modelId), r]));

describe("meanScore", () => {
  it("is null when nothing has completed", () => {
    expect(meanScore([])).toBeNull();
    expect(meanScore([result("t1", "m1", 0.9, "running")])).toBeNull();
  });

  it("ignores non-complete cells", () => {
    const mean = meanScore([
      result("t1", "m1", 0.8),
      result("t1", "m2", 0.6),
      result("t1", "m3", 0.1, "failed"),
    ]);
    expect(mean).toBeCloseTo(0.7);
  });
});

describe("seriate", () => {
  it("orders by marginal mean, descending", () => {
    const items = [model("a"), model("b"), model("c")];
    const means: Record<string, number> = { a: 0.5, b: 0.9, c: 0.7 };
    expect(seriate(items, (id) => means[id]).map((m) => m.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps original order for ties, so the view is deterministic", () => {
    const items = [model("a"), model("b"), model("c")];
    expect(seriate(items, () => 0.5).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts categories with no completed cells to the end, order preserved", () => {
    const items = [model("a"), model("b"), model("c"), model("d")];
    const means: Record<string, number | null> = { a: null, b: 0.4, c: null, d: 0.8 };
    expect(seriate(items, (id) => means[id]).map((m) => m.id)).toEqual(["d", "b", "a", "c"]);
  });
});

describe("buildLandscape", () => {
  const tasks = [task("t1"), task("t2")];
  const models = [model("m1"), model("m2")];
  const cells = cellsOf([
    result("t1", "m1", 0.6),
    result("t1", "m2", 0.9),
    result("t2", "m1", 0.8),
    result("t2", "m2", 0.4),
  ]);

  it("emits one column per task x model pair", () => {
    const { columns } = buildLandscape(tasks, models, cells, false);
    expect(columns).toHaveLength(4);
    expect(new Set(columns.map((c) => c.key)).size).toBe(4);
  });

  it("marks exactly one winner per task", () => {
    const { columns } = buildLandscape(tasks, models, cells, false);
    const winners = columns.filter((c) => c.winner);
    expect(winners).toHaveLength(2);
    expect(winners.find((w) => w.taskId === "t1")?.modelId).toBe("m2");
    expect(winners.find((w) => w.taskId === "t2")?.modelId).toBe("m1");
  });

  it("preserves the given order when not seriated", () => {
    const { tasks: to, models: mo } = buildLandscape(tasks, models, cells, false);
    expect(to.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(mo.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("orders both axes by marginal mean when seriated", () => {
    // task means: t1 = .75, t2 = .60 ; model means: m1 = .70, m2 = .65
    const { tasks: to, models: mo } = buildLandscape(tasks, models, cells, true);
    expect(to.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(mo.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("assigns grid indices matching the ordered axes", () => {
    const { columns, tasks: to, models: mo } = buildLandscape(tasks, models, cells, true);
    for (const c of columns) {
      expect(to[c.row].id).toBe(c.taskId);
      expect(mo[c.col].id).toBe(c.modelId);
    }
  });

  it("leaves score null for cells that have not completed", () => {
    const partial = cellsOf([result("t1", "m1", 0, "running"), result("t1", "m2", 0.9)]);
    const { columns } = buildLandscape(tasks, models, partial, false);
    const running = columns.find((c) => c.key === cellKey("t1", "m1"));
    const missing = columns.find((c) => c.key === cellKey("t2", "m1"));
    expect(running?.score).toBeNull();
    expect(running?.state).toBe("running");
    expect(missing?.score).toBeNull();
    expect(missing?.state).toBe("queued");
  });

  it("reports the mean of per-task winning scores", () => {
    const { winnerMean } = buildLandscape(tasks, models, cells, true);
    expect(winnerMean).toBeCloseTo((0.9 + 0.8) / 2);
  });

  it("has a null winner mean before anything completes", () => {
    const { winnerMean } = buildLandscape(tasks, models, {}, false);
    expect(winnerMean).toBeNull();
  });
});
