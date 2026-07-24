// Composes screens 2-4 for an active/opened run based on run phase. Selection + the "waiting for
// live" state live here so App stays a thin router.

import { useMemo, useState } from "react";
import type { DemoMode } from "../store/useDarwinRun";
import { raceProgress, type RunState } from "../store/reducer";
import type { RaceResult } from "../types";
import { ActivityFeed } from "./ActivityFeed";
import { CellDetail } from "./CellDetail";
import { Decomposition } from "./Decomposition";
import { LiveBanner } from "./LiveBanner";
import { RaceGrid } from "./RaceGrid";
import { RoutingView } from "./RoutingView";
import { SourceBadge } from "./SourceBadge";
import { formatDate } from "../lib/format";

interface RunViewProps {
  state: RunState;
  mode: DemoMode;
  industry: string;
  onStartAnother: () => void;
  onFallback: () => void;
}

export function RunView({
  state,
  mode,
  industry,
  onStartAnother,
  onFallback,
}: RunViewProps): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);
  const results = useMemo(() => Object.values(state.cells), [state.cells]);

  const selectedResult: RaceResult | null = selected ? (state.cells[selected] ?? null) : null;
  const selTaskId = selected?.split("::")[0] ?? null;
  const selModelId = selected?.split("::")[1] ?? null;
  const selTask = state.tasks.find((t) => t.id === selTaskId) ?? null;
  const selModel = state.models.find((m) => m.id === selModelId) ?? null;

  // Live mode, connected but no run data yet: honest waiting/recovery state.
  const liveWaiting =
    mode === "live" && state.phase !== "complete" && state.tasks.length === 0;

  const progress = raceProgress(state);

  return (
    <div className="runview">
      <div className="runview-bar">
        <div className="runview-title">
          <SourceBadge
            source={state.summary?.source ?? (mode === "live" ? "live" : "recorded_demo")}
            date={state.summary ? formatDate(state.summary.createdAt) : undefined}
          />
          <span className="runview-industry">{state.summary?.industry ?? industry}</span>
        </div>
        {state.phase === "racing" ? (
          <div className="runview-progress" aria-label="Race progress">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <span className="progress-pct tabular">{Math.round(progress * 100)}%</span>
          </div>
        ) : null}
      </div>

      {mode === "live" ? <LiveBanner connection={state.connection} onFallback={onFallback} /> : null}

      {liveWaiting ? (
        <div className="live-waiting">
          <div className="spinner" aria-hidden="true" />
          <p className="dim">
            {state.connection === "error" || state.connection === "closed"
              ? "No live events. Use the recovery action above, or switch source."
              : "Waiting for the live pipeline to emit events…"}
          </p>
        </div>
      ) : state.phase === "decomposing" ? (
        <Decomposition industry={state.summary?.industry ?? industry} tasks={state.tasks} />
      ) : (
        <>
          <div className="race-layout">
            <div className="race-main">
              <RaceGrid
                tasks={state.tasks}
                models={state.models}
                cells={state.cells}
                selected={selected}
                onSelect={setSelected}
              />
              <CellDetail
                result={selectedResult}
                task={selTask}
                model={selModel}
                onClose={() => setSelected(null)}
              />
            </div>
            <ActivityFeed items={state.feed} />
          </div>

          {state.phase === "complete" && state.routingCard && state.summary ? (
            <RoutingView
              card={state.routingCard}
              summary={state.summary}
              results={results}
              models={state.models}
              tasks={state.tasks}
              onStartAnother={onStartAnother}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
