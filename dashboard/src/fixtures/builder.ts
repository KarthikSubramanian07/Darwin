// Deterministic RunDoc builder. Given a score matrix + per-model cost/latency, it produces the
// complete results grid, a timestamped event stream for replay, and a routing card derived by
// the SAME analysis code the live path uses (lib/routing). Nothing about winners is hardcoded
// downstream; change a number here and the routing card follows.

import { buildRoutingCard } from "../lib/routing";
import type {
  DarwinEvent,
  ModelInfo,
  RaceResult,
  RunDoc,
  RunSource,
  RunSummary,
  TaskInfo,
} from "../types";

export interface ModelSpec extends ModelInfo {
  costPer1k: number;
  p50LatencyMs: number;
}

export interface FixtureConfig {
  runId: string;
  industry: string;
  createdAt: string; // ISO
  source: RunSource;
  models: ModelSpec[];
  tasks: TaskInfo[];
  // scores[taskId][modelId] in 0..1
  scores: Record<string, Record<string, number>>;
  // sandbox[taskId][modelId] = passed/total for CODE tasks executed in Daytona
  sandbox?: Record<string, Record<string, { passed: number; total: number }>>;
  // model ids whose Braintrust experiment link is unavailable (exercise the null path)
  braintrustMissing?: string[];
  braintrustBase?: string;
}

const slug = (s: string): string => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

export function buildRunDoc(cfg: FixtureConfig): RunDoc {
  const missing = new Set(cfg.braintrustMissing ?? []);
  const btBase = cfg.braintrustBase ?? "https://www.braintrust.dev/app/Darwin/experiments";

  const results: RaceResult[] = [];
  for (const task of cfg.tasks) {
    for (const model of cfg.models) {
      const score = cfg.scores[task.id]?.[model.id];
      if (score === undefined) continue;
      const sb = cfg.sandbox?.[task.id]?.[model.id] ?? null;
      results.push({
        taskId: task.id,
        modelId: model.id,
        score,
        costPer1k: model.costPer1k,
        p50LatencyMs: model.p50LatencyMs,
        caseCount: task.caseCount,
        braintrustUrl: missing.has(model.id)
          ? null
          : `${btBase}/${slug(cfg.industry)}-${task.id}-${slug(model.label)}`,
        sandbox: sb,
        state: "complete",
      });
    }
  }

  const routingCard = buildRoutingCard(cfg.industry, cfg.tasks, results, cfg.models);
  const overallScore =
    routingCard.entries.length > 0
      ? routingCard.entries.reduce((s, e) => s + e.score, 0) / routingCard.entries.length
      : undefined;

  const summary: RunSummary = {
    runId: cfg.runId,
    industry: cfg.industry,
    createdAt: cfg.createdAt,
    source: cfg.source,
    taskCount: cfg.tasks.length,
    modelCount: cfg.models.length,
    overallScore,
  };

  const events = buildEvents(cfg, summary, results, routingCard);
  return { summary, models: cfg.models, tasks: cfg.tasks, results, routingCard, events };
}

// Build the timestamped replay stream. Kept separate so buildRunDoc stays readable.
function buildEvents(
  cfg: FixtureConfig,
  summary: RunSummary,
  results: RaceResult[],
  routingCard: RunDoc["routingCard"],
): DarwinEvent[] {
  const events: DarwinEvent[] = [];
  let t = 0;
  const step = (ms: number): number => (t += ms);

  events.push({ type: "run_started", ts: step(0), run: summary, models: cfg.models });
  for (const task of cfg.tasks) {
    events.push({ type: "task_created", ts: step(320), task });
  }
  events.push({ type: "decomposition_complete", ts: step(260) });

  // Queue every cell first (so the whole grid renders), then run task-by-task.
  for (const task of cfg.tasks) {
    for (const model of cfg.models) {
      if (cfg.scores[task.id]?.[model.id] === undefined) continue;
      events.push({
        type: "race_queued",
        ts: step(40),
        taskId: task.id,
        modelId: model.id,
        caseCount: task.caseCount,
      });
    }
  }

  const resultOf = (taskId: string, modelId: string): RaceResult | undefined =>
    results.find((r) => r.taskId === taskId && r.modelId === modelId);

  for (const task of cfg.tasks) {
    for (const model of cfg.models) {
      const res = resultOf(task.id, model.id);
      if (!res) continue;
      events.push({ type: "race_started", ts: step(220), taskId: task.id, modelId: model.id });
      events.push({ type: "race_scoring", ts: step(180), taskId: task.id, modelId: model.id });
      if (res.sandbox) {
        events.push({ type: "sandbox_started", ts: step(140), taskId: task.id, modelId: model.id });
        events.push({
          type: "sandbox_result",
          ts: step(260),
          taskId: task.id,
          modelId: model.id,
          passed: res.sandbox.passed,
          total: res.sandbox.total,
        });
      }
      events.push({ type: "race_scored", ts: step(120), result: res });
    }
    // routing recommendation refreshes as each task resolves
    events.push({ type: "routing_updated", ts: step(80), card: routingCard });
  }

  events.push({ type: "run_completed", ts: step(200), card: routingCard });
  return events;
}
