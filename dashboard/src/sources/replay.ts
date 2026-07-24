// Deterministic replay of a recorded/mock event stream. Schedules each event at its (scaled)
// timestamp offset so mock and recorded-demo modes look like a live run without touching a
// network. Used by both "Recorded successful run" and "Mock development run" demo modes.

import type { DarwinEvent } from "../types";

export interface RunController {
  stop: () => void;
}

export interface ReplayOptions {
  speed?: number; // 1 = real recorded timing; >1 faster
  onEvent: (e: DarwinEvent) => void;
  onDone?: () => void;
}

export function startReplay(events: DarwinEvent[], opts: ReplayOptions): RunController {
  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  const timers: ReturnType<typeof setTimeout>[] = [];
  if (events.length === 0) {
    opts.onDone?.();
    return { stop: () => {} };
  }
  const t0 = events[0].ts;
  let stopped = false;

  events.forEach((e) => {
    const delay = Math.max(0, (e.ts - t0) / speed);
    const id = setTimeout(() => {
      if (stopped) return;
      opts.onEvent(e);
      if (e.type === "run_completed") opts.onDone?.();
    }, delay);
    timers.push(id);
  });

  return {
    stop: () => {
      stopped = true;
      for (const id of timers) clearTimeout(id);
    },
  };
}
