// The single run-state reducer. Every source (mock, recorded, live WS, persisted) is adapted
// into DarwinEvent and fed here, so event handling lives in exactly one place.

import type {
  ConnectionState,
  DarwinEvent,
  ModelInfo,
  RaceResult,
  RoutingCard,
  RunSource,
  RunSummary,
  TaskInfo,
} from "../types";
import { cellKey } from "../types";

export type RunPhase = "idle" | "decomposing" | "racing" | "complete";

export interface FeedItem {
  id: number;
  ts: number;
  kind: "info" | "score" | "sandbox" | "routing" | "warn";
  text: string;
}

export interface RunState {
  phase: RunPhase;
  source: RunSource | null;
  summary: RunSummary | null;
  models: ModelInfo[];
  tasks: TaskInfo[];
  cells: Record<string, RaceResult>; // cellKey(taskId, modelId) -> result
  routingCard: RoutingCard | null;
  feed: FeedItem[];
  connection: ConnectionState;
  lastEventTs: number;
}

export const initialRunState: RunState = {
  phase: "idle",
  source: null,
  summary: null,
  models: [],
  tasks: [],
  cells: {},
  routingCard: null,
  feed: [],
  connection: "idle",
  lastEventTs: 0,
};

export type RunAction =
  | { kind: "event"; event: DarwinEvent }
  | { kind: "connection"; state: ConnectionState }
  | { kind: "reset" }
  // Instant hydration of a persisted/recorded run with no replay (no fake loading).
  | {
      kind: "hydrate";
      summary: RunSummary;
      models: ModelInfo[];
      tasks: TaskInfo[];
      results: RaceResult[];
      routingCard: RoutingCard;
    };

const MODEL_LABEL: Record<string, string> = {};
const label = (state: RunState, modelId: string): string =>
  state.models.find((m) => m.id === modelId)?.label ?? MODEL_LABEL[modelId] ?? modelId;
const taskName = (state: RunState, taskId: string): string =>
  state.tasks.find((t) => t.id === taskId)?.name ?? taskId;

let feedSeq = 1;
const pushFeed = (state: RunState, item: Omit<FeedItem, "id">): FeedItem[] => {
  const next = [{ id: feedSeq++, ...item }, ...state.feed];
  return next.slice(0, 60); // keep the feed compact
};

const setCell = (state: RunState, cell: RaceResult): Record<string, RaceResult> => ({
  ...state.cells,
  [cellKey(cell.taskId, cell.modelId)]: cell,
});

const patchCell = (
  state: RunState,
  taskId: string,
  modelId: string,
  patch: Partial<RaceResult>,
): Record<string, RaceResult> => {
  const key = cellKey(taskId, modelId);
  const existing: RaceResult = state.cells[key] ?? {
    taskId,
    modelId,
    score: 0,
    costPer1k: 0,
    p50LatencyMs: 0,
    caseCount: 0,
    braintrustUrl: null,
    sandbox: null,
    state: "queued",
  };
  return { ...state.cells, [key]: { ...existing, ...patch } };
};

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.kind) {
    case "reset":
      return { ...initialRunState, connection: state.connection };
    case "connection":
      return { ...state, connection: action.state };
    case "hydrate": {
      const cells: Record<string, RaceResult> = {};
      for (const r of action.results) cells[cellKey(r.taskId, r.modelId)] = r;
      return {
        ...state,
        phase: "complete",
        source: action.summary.source,
        summary: action.summary,
        models: action.models,
        tasks: action.tasks,
        cells,
        routingCard: action.routingCard,
        feed: [],
        lastEventTs: 0,
      };
    }
    case "event":
      return applyEvent(state, action.event);
  }
}

function applyEvent(state: RunState, e: DarwinEvent): RunState {
  const base = { ...state, lastEventTs: e.ts };
  switch (e.type) {
    case "run_started":
      return {
        ...base,
        phase: "decomposing",
        source: e.run.source,
        summary: e.run,
        models: e.models,
        tasks: [],
        cells: {},
        routingCard: null,
        feed: pushFeed(base, { ts: e.ts, kind: "info", text: `Run started: ${e.run.industry}` }),
      };
    case "task_created":
      return {
        ...base,
        tasks: [...base.tasks, e.task],
        feed: pushFeed(base, {
          ts: e.ts,
          kind: "info",
          text: `Task identified: ${e.task.name} (${e.task.type})`,
        }),
      };
    case "decomposition_complete":
      return { ...base, phase: "racing" };
    case "race_queued":
      return {
        ...base,
        phase: "racing",
        cells: patchCell(base, e.taskId, e.modelId, {
          state: "queued",
          caseCount: e.caseCount,
        }),
      };
    case "race_started":
      return { ...base, cells: patchCell(base, e.taskId, e.modelId, { state: "running" }) };
    case "race_scoring":
      return { ...base, cells: patchCell(base, e.taskId, e.modelId, { state: "scoring" }) };
    case "sandbox_started":
      return {
        ...base,
        cells: patchCell(base, e.taskId, e.modelId, { state: "executing" }),
        feed: pushFeed(base, {
          ts: e.ts,
          kind: "sandbox",
          text: `${label(base, e.modelId)} output sent to Daytona for ${taskName(base, e.taskId)}`,
        }),
      };
    case "sandbox_result":
      return {
        ...base,
        cells: patchCell(base, e.taskId, e.modelId, {
          sandbox: { passed: e.passed, total: e.total },
        }),
        feed: pushFeed(base, {
          ts: e.ts,
          kind: "sandbox",
          text: `Daytona execution ${e.passed === e.total ? "passed" : "partial"} ${e.passed}/${e.total} tests`,
        }),
      };
    case "race_scored":
      return {
        ...base,
        cells: setCell(base, { ...e.result, state: "complete" }),
        feed: pushFeed(base, {
          ts: e.ts,
          kind: "score",
          text: `${label(base, e.result.modelId)} scored ${(e.result.score * 100).toFixed(0)}% on ${taskName(base, e.result.taskId)}`,
        }),
      };
    case "race_failed":
      return {
        ...base,
        cells: patchCell(base, e.taskId, e.modelId, { state: "failed", error: e.error }),
        feed: pushFeed(base, {
          ts: e.ts,
          kind: "warn",
          text: `${label(base, e.modelId)} failed on ${taskName(base, e.taskId)}: ${e.error}`,
        }),
      };
    case "routing_updated":
      return {
        ...base,
        routingCard: e.card,
        feed: pushFeed(base, { ts: e.ts, kind: "routing", text: "Routing recommendation updated" }),
      };
    case "run_completed":
      return {
        ...base,
        phase: "complete",
        routingCard: e.card,
        feed: pushFeed(base, { ts: e.ts, kind: "routing", text: "Run complete: routing card ready" }),
      };
  }
}

/** How far along the race is (0..1), for progress affordances. */
export function raceProgress(state: RunState): number {
  const total = state.tasks.length * state.models.length;
  if (total === 0) return 0;
  const done = Object.values(state.cells).filter(
    (c) => c.state === "complete" || c.state === "failed",
  ).length;
  return done / total;
}
