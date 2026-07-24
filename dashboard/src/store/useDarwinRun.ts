// The one place run lifecycle lives: owns the reducer, the active event source, and the demo
// mode. Components read `state` and call `actions`; they never touch sources directly.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getRunForIndustry } from "../fixtures";
import { startReplay, type RunController } from "../sources/replay";
import { startWebSocket } from "../sources/websocket";
import type { DarwinEvent, RunDoc } from "../types";
import { initialRunState, runReducer, type RunState } from "./reducer";

export type DemoMode = "live" | "recorded" | "mock";

export const DEMO_MODE_LABEL: Record<DemoMode, string> = {
  live: "Live pipeline",
  recorded: "Recorded successful run",
  mock: "Mock development run",
};

const envDefaultMode = (): DemoMode => {
  const v = (import.meta.env.VITE_DEMO_MODE as string | undefined)?.toLowerCase();
  if (v === "live" || v === "recorded" || v === "mock") return v;
  return "recorded"; // safest default for the demo floor
};

export interface DarwinRunActions {
  start: (industry: string) => void;
  openRun: (doc: RunDoc) => void; // instant hydrate, no fake loading
  reset: () => void;
  setMode: (mode: DemoMode) => void;
  fallbackToRecorded: (industry: string) => void;
}

export interface UseDarwinRun {
  state: RunState;
  mode: DemoMode;
  actions: DarwinRunActions;
  activeIndustry: string;
}

export function useDarwinRun(): UseDarwinRun {
  const [state, dispatch] = useReducer(runReducer, initialRunState);
  const [mode, setMode] = useState<DemoMode>(envDefaultMode);
  const [activeIndustry, setActiveIndustry] = useState<string>("");
  const controller = useRef<RunController | null>(null);

  const stopActive = useCallback(() => {
    controller.current?.stop();
    controller.current = null;
  }, []);

  useEffect(() => stopActive, [stopActive]);

  const onEvent = useCallback((e: DarwinEvent) => dispatch({ kind: "event", event: e }), []);

  const startReplayDoc = useCallback(
    (doc: RunDoc) => {
      stopActive();
      dispatch({ kind: "reset" });
      controller.current = startReplay(doc.events, { onEvent, speed: 1 });
    },
    [onEvent, stopActive],
  );

  const start = useCallback(
    (industry: string) => {
      setActiveIndustry(industry);
      if (mode === "mock") {
        startReplayDoc(getRunForIndustry(industry, "mock"));
        return;
      }
      if (mode === "recorded") {
        startReplayDoc(getRunForIndustry(industry, "recorded_demo"));
        return;
      }
      // live: connect to the local event server and stream real events. No fabricated data:
      // if the socket cannot open, connection state goes to "error" and the UI offers recovery.
      stopActive();
      dispatch({ kind: "reset" });
      controller.current = startWebSocket({
        onEvent,
        onConnection: (s) => dispatch({ kind: "connection", state: s }),
      });
    },
    [mode, onEvent, startReplayDoc, stopActive],
  );

  const openRun = useCallback(
    (doc: RunDoc) => {
      stopActive();
      setActiveIndustry(doc.summary.industry);
      dispatch({
        kind: "hydrate",
        summary: doc.summary,
        models: doc.models,
        tasks: doc.tasks,
        results: doc.results,
        routingCard: doc.routingCard,
      });
    },
    [stopActive],
  );

  const reset = useCallback(() => {
    stopActive();
    setActiveIndustry("");
    dispatch({ kind: "reset" });
  }, [stopActive]);

  const fallbackToRecorded = useCallback(
    (industry: string) => {
      setMode("recorded");
      startReplayDoc(getRunForIndustry(industry, "recorded_demo"));
    },
    [startReplayDoc],
  );

  return {
    state,
    mode,
    activeIndustry,
    actions: { start, openRun, reset, setMode, fallbackToRecorded },
  };
}
