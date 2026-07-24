// Normalized Lane D frontend contract.
//
// The product ("which model is best at each task") is a task x model RACE that ends in a
// routing card. The Python backend (darwin/server/events.py) currently emits EVOLUTION events
// (run_started / variant_evaluated / generation_complete / ...) for the self-improvement loop.
// Those two are different views of the same engine, so the dashboard defines ONE normalized
// event contract here and adapts every source into it (see src/sources/*). This keeps event
// logic out of the components. See docs/LANE_D.md for the backend mapping + open integration.

export type TaskType = "TEXT" | "STRUCTURED" | "CODE";

export type CellState =
  | "queued"
  | "running"
  | "scoring"
  | "executing" // Daytona execution, code tasks only
  | "complete"
  | "failed";

// Honest provenance of what is on screen. Never show "live" over replayed data.
export type RunSource = "live" | "recorded_demo" | "mock" | "previously_computed";

export interface ModelInfo {
  id: string; // Fireworks model id (or a clearly-marked mock id)
  label: string; // short display name, legible across a room
  vendor?: string;
}

export interface TaskInfo {
  id: string;
  name: string;
  description: string;
  type: TaskType;
  caseCount: number;
}

export interface SandboxOutcome {
  passed: number;
  total: number;
}

export interface RaceResult {
  taskId: string;
  modelId: string;
  score: number; // 0..1
  costPer1k: number; // estimated USD to run 1k cases through this model
  p50LatencyMs: number;
  caseCount: number;
  braintrustUrl: string | null;
  sandbox: SandboxOutcome | null; // present only for CODE tasks executed in Daytona
  state: CellState;
  error?: string;
}

export interface RoutingEntry {
  taskId: string;
  taskName: string;
  taskType: TaskType;
  bestModelId: string;
  runnerUpModelId: string | null;
  score: number;
  scoreDelta: number; // best.score - runnerUp.score (0 if no runner-up)
  p50LatencyMs: number;
  costPer1k: number;
  rationale: string;
  braintrustUrl: string | null;
  sandboxVerified: boolean; // code task verified by real execution in Daytona
}

export interface RoutingCard {
  industry: string;
  entries: RoutingEntry[];
}

export interface RunSummary {
  runId: string;
  industry: string;
  createdAt: string; // ISO 8601
  source: RunSource;
  taskCount: number;
  modelCount: number;
  overallScore?: number; // average of per-task winning scores
}

// A complete, self-contained run: persisted, recorded, or mock. `events` drives replay;
// `results` + `routingCard` allow instant hydration with no fake loading.
export interface RunDoc {
  summary: RunSummary;
  models: ModelInfo[];
  tasks: TaskInfo[];
  results: RaceResult[];
  routingCard: RoutingCard;
  events: DarwinEvent[];
}

// ---- The normalized event stream every source is adapted into ----------------------------

export type DarwinEvent =
  | { type: "run_started"; ts: number; run: RunSummary; models: ModelInfo[] }
  | { type: "task_created"; ts: number; task: TaskInfo }
  | { type: "decomposition_complete"; ts: number }
  | { type: "race_queued"; ts: number; taskId: string; modelId: string; caseCount: number }
  | { type: "race_started"; ts: number; taskId: string; modelId: string }
  | { type: "race_scoring"; ts: number; taskId: string; modelId: string }
  | { type: "sandbox_started"; ts: number; taskId: string; modelId: string }
  | {
      type: "sandbox_result";
      ts: number;
      taskId: string;
      modelId: string;
      passed: number;
      total: number;
    }
  | { type: "race_scored"; ts: number; result: RaceResult }
  | { type: "race_failed"; ts: number; taskId: string; modelId: string; error: string }
  | { type: "routing_updated"; ts: number; card: RoutingCard }
  | { type: "run_completed"; ts: number; card: RoutingCard };

export type ConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

export const cellKey = (taskId: string, modelId: string): string => `${taskId}::${modelId}`;
