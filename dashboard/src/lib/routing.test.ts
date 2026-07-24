import { describe, expect, it } from "vitest";
import {
  buildExport,
  buildRoutingCard,
  compareStacks,
  pickRunnerUp,
  pickWinner,
  routingStack,
  singleModelBaseline,
} from "./routing";
import type { ModelInfo, RaceResult, RunSummary, TaskInfo } from "../types";

const models: ModelInfo[] = [
  { id: "m-a", label: "Model A" },
  { id: "m-b", label: "Model B" },
  { id: "m-c", label: "Model C" },
];

const tasks: TaskInfo[] = [
  { id: "t1", name: "Summarize", description: "", type: "TEXT", caseCount: 10 },
  { id: "t2", name: "Extract", description: "", type: "STRUCTURED", caseCount: 10 },
];

const cell = (
  taskId: string,
  modelId: string,
  score: number,
  extra: Partial<RaceResult> = {},
): RaceResult => ({
  taskId,
  modelId,
  score,
  costPer1k: 1,
  p50LatencyMs: 1000,
  caseCount: 10,
  braintrustUrl: null,
  sandbox: null,
  state: "complete",
  ...extra,
});

// A wins t1, B wins t2. C is consistent-but-mediocre (covers both tasks).
const results: RaceResult[] = [
  cell("t1", "m-a", 0.92, { costPer1k: 1.0, p50LatencyMs: 800 }),
  cell("t1", "m-b", 0.8, { costPer1k: 0.6, p50LatencyMs: 900 }),
  cell("t1", "m-c", 0.85, { costPer1k: 1.2, p50LatencyMs: 700 }),
  cell("t2", "m-a", 0.7, { costPer1k: 1.0, p50LatencyMs: 800 }),
  cell("t2", "m-b", 0.9, { costPer1k: 0.6, p50LatencyMs: 900 }),
  cell("t2", "m-c", 0.84, { costPer1k: 1.2, p50LatencyMs: 700 }),
];

describe("winner selection", () => {
  it("picks the highest score", () => {
    const t1 = results.filter((r) => r.taskId === "t1");
    expect(pickWinner(t1)?.modelId).toBe("m-a");
    expect(pickRunnerUp(t1)?.modelId).toBe("m-c");
  });

  it("ignores non-complete cells", () => {
    const rows = [cell("t1", "m-a", 0.99, { state: "running" }), cell("t1", "m-b", 0.5)];
    expect(pickWinner(rows)?.modelId).toBe("m-b");
  });

  it("breaks ties by lower latency then cost", () => {
    const rows = [
      cell("t1", "m-a", 0.8, { p50LatencyMs: 900 }),
      cell("t1", "m-b", 0.8, { p50LatencyMs: 700 }),
    ];
    expect(pickWinner(rows)?.modelId).toBe("m-b");
  });

  it("returns null when nothing is complete", () => {
    expect(pickWinner([])).toBeNull();
    expect(pickRunnerUp([cell("t1", "m-a", 0.8)])).toBeNull();
  });
});

describe("routing card", () => {
  it("assigns the per-task winner and score delta", () => {
    const card = buildRoutingCard("Legal", tasks, results, models);
    expect(card.entries).toHaveLength(2);
    const t1 = card.entries.find((e) => e.taskId === "t1")!;
    expect(t1.bestModelId).toBe("m-a");
    expect(t1.runnerUpModelId).toBe("m-c");
    expect(t1.scoreDelta).toBeCloseTo(0.92 - 0.85, 5);
    const t2 = card.entries.find((e) => e.taskId === "t2")!;
    expect(t2.bestModelId).toBe("m-b");
  });

  it("marks a code task Daytona-verified only when all tests pass", () => {
    const codeResults = [
      cell("t1", "m-a", 0.9, { sandbox: { passed: 8, total: 8 } }),
      cell("t1", "m-b", 0.7, { sandbox: { passed: 5, total: 8 } }),
    ];
    const card = buildRoutingCard("X", [tasks[0]], codeResults, models);
    expect(card.entries[0].sandboxVerified).toBe(true);
  });
});

describe("single-model baseline", () => {
  it("chooses the best model that covers every task", () => {
    // Averages: A=(.92+.70)/2=.81, B=(.80+.90)/2=.85, C=(.85+.84)/2=.845 -> B is best.
    const baseline = singleModelBaseline(results, models, tasks);
    expect(baseline?.modelId).toBe("m-b");
    expect(baseline?.avgScore).toBeCloseTo(0.85, 5);
    expect(baseline?.aggCostPer1k).toBeCloseTo(1.2, 5); // 0.6 + 0.6
  });

  it("excludes models that do not cover all tasks", () => {
    const partial = results.filter((r) => !(r.modelId === "m-a" && r.taskId === "t2"));
    const baseline = singleModelBaseline(partial, models, tasks);
    expect(baseline?.modelId).not.toBe("m-a"); // A no longer covers t2
  });

  it("returns null with no complete results", () => {
    expect(singleModelBaseline([], models, tasks)).toBeNull();
  });
});

describe("routing vs baseline comparison", () => {
  it("computes honest, signed deltas from the data", () => {
    const card = buildRoutingCard("Legal", tasks, results, models);
    const routing = routingStack(card);
    // routing avg = (.92 + .90)/2 = .91
    expect(routing.avgScore).toBeCloseTo(0.91, 5);

    const cmp = compareStacks(card, results, models, tasks);
    // quality: (.91 - .85) * 100 = +6 pts
    expect(cmp.qualityDeltaPct).toBeCloseTo(6, 4);
    // routing agg cost = 1.0 (A on t1) + 0.6 (B on t2) = 1.6 ; baseline (B) = 1.2 -> +33.3%
    expect(cmp.costDeltaPct).toBeCloseTo(((1.6 - 1.2) / 1.2) * 100, 4);
    expect(cmp.costDeltaPct).toBeGreaterThan(0); // routing costs MORE here — reported honestly
  });

  it("does not fabricate positive claims when routing is worse on cost", () => {
    const cmp = compareStacks(
      buildRoutingCard("Legal", tasks, results, models),
      results,
      models,
      tasks,
    );
    // sign is meaningful; we assert the number is not silently clamped to <= 0
    expect(Math.sign(cmp.costDeltaPct)).toBe(1);
  });
});

describe("export payload", () => {
  it("serializes task -> model routes with metadata", () => {
    const card = buildRoutingCard("Legal", tasks, results, models);
    const summary: RunSummary = {
      runId: "run-x",
      industry: "Legal",
      createdAt: "2026-07-24T00:00:00Z",
      source: "recorded_demo",
      taskCount: 2,
      modelCount: 3,
    };
    const out = buildExport(card, summary);
    expect(out.darwin_routing_config.industry).toBe("Legal");
    expect(out.darwin_routing_config.routes).toHaveLength(2);
    expect(out.darwin_routing_config.routes[0]).toHaveProperty("model");
    expect(out.darwin_routing_config.generated_from.runId).toBe("run-x");
  });
});
