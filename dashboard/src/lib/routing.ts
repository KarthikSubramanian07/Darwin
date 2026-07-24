// Pure analysis over race results: winner selection, the single-model baseline, the
// routing-vs-baseline comparison, and the export payload. No positive claim is hardcoded;
// every delta is computed from the data and may come out negative (shown honestly).

import type {
  ModelInfo,
  RaceResult,
  RoutingCard,
  RoutingEntry,
  RunSummary,
  TaskInfo,
} from "../types";

const byTask = (results: RaceResult[]): Map<string, RaceResult[]> => {
  const m = new Map<string, RaceResult[]>();
  for (const r of results) {
    if (r.state !== "complete") continue;
    const list = m.get(r.taskId) ?? [];
    list.push(r);
    m.set(r.taskId, list);
  }
  return m;
};

/** The winner for a task: highest score, ties broken by lower latency then lower cost. */
export function pickWinner(results: RaceResult[]): RaceResult | null {
  const complete = results.filter((r) => r.state === "complete");
  if (complete.length === 0) return null;
  return [...complete].sort(
    (a, b) =>
      b.score - a.score ||
      a.p50LatencyMs - b.p50LatencyMs ||
      a.costPer1k - b.costPer1k ||
      a.modelId.localeCompare(b.modelId),
  )[0];
}

/** The runner-up for a task (second best by the same ordering), or null. */
export function pickRunnerUp(results: RaceResult[]): RaceResult | null {
  const complete = results.filter((r) => r.state === "complete");
  if (complete.length < 2) return null;
  const sorted = [...complete].sort(
    (a, b) =>
      b.score - a.score ||
      a.p50LatencyMs - b.p50LatencyMs ||
      a.costPer1k - b.costPer1k ||
      a.modelId.localeCompare(b.modelId),
  );
  return sorted[1];
}

const rationaleFor = (winner: RaceResult, runnerUp: RaceResult | null, model?: ModelInfo): string => {
  const name = model?.label ?? winner.modelId;
  const parts: string[] = [];
  parts.push(`${name} leads at ${(winner.score * 100).toFixed(0)}% on real eval cases`);
  if (runnerUp) {
    const delta = (winner.score - runnerUp.score) * 100;
    if (delta >= 0.5) parts.push(`${delta.toFixed(0)} pts over the runner-up`);
  }
  if (winner.sandbox) parts.push(`verified by execution (${winner.sandbox.passed}/${winner.sandbox.total} tests)`);
  return parts.join(", ") + ".";
};

/** Fold each task's champion into a routing card. */
export function buildRoutingCard(
  industry: string,
  tasks: TaskInfo[],
  results: RaceResult[],
  models: ModelInfo[],
): RoutingCard {
  const grouped = byTask(results);
  const modelById = new Map(models.map((m) => [m.id, m]));
  const entries: RoutingEntry[] = [];
  for (const task of tasks) {
    const taskResults = grouped.get(task.id) ?? [];
    const winner = pickWinner(taskResults);
    if (!winner) continue;
    const runnerUp = pickRunnerUp(taskResults);
    entries.push({
      taskId: task.id,
      taskName: task.name,
      taskType: task.type,
      bestModelId: winner.modelId,
      runnerUpModelId: runnerUp?.modelId ?? null,
      score: winner.score,
      scoreDelta: runnerUp ? winner.score - runnerUp.score : 0,
      p50LatencyMs: winner.p50LatencyMs,
      costPer1k: winner.costPer1k,
      rationale: rationaleFor(winner, runnerUp, modelById.get(winner.modelId)),
      braintrustUrl: winner.braintrustUrl,
      sandboxVerified: Boolean(winner.sandbox && winner.sandbox.passed === winner.sandbox.total),
    });
  }
  return { industry, entries };
}

export interface StackMetrics {
  modelId: string | null; // null for the routing stack (mixed models)
  label: string;
  avgScore: number;
  aggCostPer1k: number; // sum across tasks
  avgLatencyMs: number;
}

/**
 * Best single model across ALL tasks: for each candidate model, average its score over the
 * tasks it has a complete result for; the model with the best average is the baseline. Cost and
 * latency are aggregated/averaged over that model's per-task results so the comparison is
 * apples-to-apples with the routing stack.
 */
export function singleModelBaseline(
  results: RaceResult[],
  models: ModelInfo[],
  tasks: TaskInfo[],
): StackMetrics | null {
  const complete = results.filter((r) => r.state === "complete");
  if (complete.length === 0) return null;
  const taskIds = new Set(tasks.map((t) => t.id));
  const modelById = new Map(models.map((m) => [m.id, m]));

  let best: StackMetrics | null = null;
  const modelIds = [...new Set(complete.map((r) => r.modelId))];
  for (const modelId of modelIds) {
    const rows = complete.filter((r) => r.modelId === modelId && taskIds.has(r.taskId));
    if (rows.length === 0) continue;
    // Only consider models that cover every task, so "one model for everything" is truthful.
    if (rows.length < taskIds.size) continue;
    const avgScore = rows.reduce((s, r) => s + r.score, 0) / rows.length;
    const aggCost = rows.reduce((s, r) => s + r.costPer1k, 0);
    const avgLatency = rows.reduce((s, r) => s + r.p50LatencyMs, 0) / rows.length;
    const metrics: StackMetrics = {
      modelId,
      label: modelById.get(modelId)?.label ?? modelId,
      avgScore,
      aggCostPer1k: aggCost,
      avgLatencyMs: avgLatency,
    };
    if (!best || metrics.avgScore > best.avgScore) best = metrics;
  }
  return best;
}

/** Metrics for the Darwin routing stack (per-task winners). */
export function routingStack(card: RoutingCard): StackMetrics {
  const entries = card.entries;
  const n = Math.max(1, entries.length);
  return {
    modelId: null,
    label: "Darwin routing",
    avgScore: entries.reduce((s, e) => s + e.score, 0) / n,
    aggCostPer1k: entries.reduce((s, e) => s + e.costPer1k, 0),
    avgLatencyMs: entries.reduce((s, e) => s + e.p50LatencyMs, 0) / n,
  };
}

export interface Comparison {
  baseline: StackMetrics | null;
  routing: StackMetrics;
  qualityDeltaPct: number; // routing - baseline, in score percentage points
  costDeltaPct: number; // (routing - baseline) / baseline * 100 ; positive = routing costs more
  latencyDeltaPct: number; // (routing - baseline) / baseline * 100 ; positive = routing slower
}

export function compareStacks(
  card: RoutingCard,
  results: RaceResult[],
  models: ModelInfo[],
  tasks: TaskInfo[],
): Comparison {
  const baseline = singleModelBaseline(results, models, tasks);
  const routing = routingStack(card);
  const pct = (routingVal: number, baseVal: number): number =>
    baseVal === 0 ? 0 : ((routingVal - baseVal) / baseVal) * 100;
  return {
    baseline,
    routing,
    qualityDeltaPct: baseline ? (routing.avgScore - baseline.avgScore) * 100 : 0,
    costDeltaPct: baseline ? pct(routing.aggCostPer1k, baseline.aggCostPer1k) : 0,
    latencyDeltaPct: baseline ? pct(routing.avgLatencyMs, baseline.avgLatencyMs) : 0,
  };
}

/** The exported routing config: task -> model routes plus provenance metadata. */
export interface RoutingExport {
  darwin_routing_config: {
    industry: string;
    generated_from: RunSummary;
    routes: Array<{
      task_id: string;
      task: string;
      task_type: string;
      model: string;
      runner_up: string | null;
      score: number;
      p50_latency_ms: number;
      est_cost_per_1k: number;
      braintrust_experiment: string | null;
      execution_verified: boolean;
    }>;
  };
}

export function buildExport(card: RoutingCard, summary: RunSummary): RoutingExport {
  return {
    darwin_routing_config: {
      industry: card.industry,
      generated_from: summary,
      routes: card.entries.map((e) => ({
        task_id: e.taskId,
        task: e.taskName,
        task_type: e.taskType,
        model: e.bestModelId,
        runner_up: e.runnerUpModelId,
        score: Number(e.score.toFixed(4)),
        p50_latency_ms: e.p50LatencyMs,
        est_cost_per_1k: Number(e.costPer1k.toFixed(4)),
        braintrust_experiment: e.braintrustUrl,
        execution_verified: e.sandboxVerified,
      })),
    },
  };
}
