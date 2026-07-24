// Adapter: raw backend event ({type, payload, ts}) -> normalized DarwinEvent.
//
// IMPORTANT (backend mismatch, documented in docs/LANE_D.md): darwin/server/events.py currently
// emits EVOLUTION events (run_started, generation_started, variant_evaluated, generation_complete,
// champion_changed, mutation, guard, run_complete) for the self-improvement loop. Those do not
// carry the task x model RACE data the routing view needs. This adapter therefore:
//   1. passes through any event already using our normalized race vocabulary (forward-compatible:
//      when Lane A/C add a race emitter with these names, the live grid works with no UI change);
//   2. maps the evolution lifecycle events it can (run start/complete) so the shell stays honest;
//   3. returns null for events with no meaningful race mapping (they are ignored, not faked).

import type { DarwinEvent, RunSummary } from "../types";

interface RawEvent {
  type: string;
  payload?: Record<string, unknown>;
  ts?: number;
}

const NORMALIZED_TYPES = new Set<DarwinEvent["type"]>([
  "run_started",
  "task_created",
  "decomposition_complete",
  "race_queued",
  "race_started",
  "race_scoring",
  "sandbox_started",
  "sandbox_result",
  "race_scored",
  "race_failed",
  "routing_updated",
  "run_completed",
]);

const nowMs = (raw: RawEvent): number => (typeof raw.ts === "number" ? raw.ts * 1000 : Date.now());

export function adaptBackendEvent(raw: RawEvent): DarwinEvent | null {
  const ts = nowMs(raw);
  const p = raw.payload ?? {};

  // (1) Forward-compatible pass-through: a race-aware backend can emit our vocabulary directly.
  if (NORMALIZED_TYPES.has(raw.type as DarwinEvent["type"])) {
    return { ts, ...(raw as object), ...p } as unknown as DarwinEvent;
  }

  // (2) Best-effort mapping of the current evolution lifecycle.
  switch (raw.type) {
    case "run_started": {
      const summary: RunSummary = {
        runId: String(p.run_id ?? "live-run"),
        industry: String(p.task ?? "Live run"),
        createdAt: new Date(ts).toISOString(),
        source: "live",
        taskCount: 0,
        modelCount: 0,
      };
      return { type: "run_started", ts, run: summary, models: [] };
    }
    case "run_complete":
      // No routing card is emitted by the evolution loop; signal completion with an empty card.
      return {
        type: "run_completed",
        ts,
        card: { industry: String(p.run_id ?? "Live run"), entries: [] },
      };
    default:
      // generation_started / variant_evaluated / champion_changed / mutation / guard:
      // no faithful race mapping yet. Ignore rather than invent grid data.
      return null;
  }
}
