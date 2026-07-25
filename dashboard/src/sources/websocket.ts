// Live WebSocket client for the local event server (darwin/server/events.py, proxied at /ws by
// Vite). Handles connection states + bounded exponential-backoff reconnect, and routes every
// frame through the backend adapter. It NEVER fabricates data: if the socket cannot open, it
// reports an error state and the UI offers an honest fallback (open the recorded run).

import { liveWsUrl } from "../lib/wsUrl";
import type { ConnectionState, DarwinEvent } from "../types";
import { adaptBackendEvent } from "./backendAdapter";
import type { RunController } from "./replay";

export interface WebSocketOptions {
  url?: string;
  onEvent: (e: DarwinEvent) => void;
  onConnection: (s: ConnectionState) => void;
  maxRetries?: number;
}

export function startWebSocket(opts: WebSocketOptions): RunController {
  const url = opts.url ?? liveWsUrl();
  const maxRetries = opts.maxRetries ?? 5;
  let retries = 0;
  let socket: WebSocket | null = null;
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = (): void => {
    if (stopped) return;
    opts.onConnection(retries === 0 ? "connecting" : "reconnecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    socket = ws;

    ws.onopen = () => {
      retries = 0;
      opts.onConnection("open");
    };
    ws.onmessage = (msg) => {
      let raw: unknown;
      try {
        raw = JSON.parse(msg.data as string);
      } catch {
        return; // ignore malformed frames
      }
      const event = adaptBackendEvent(raw as { type: string });
      if (event) opts.onEvent(event);
    };
    ws.onerror = () => {
      opts.onConnection("error");
    };
    ws.onclose = () => {
      if (stopped) return;
      scheduleReconnect();
    };
  };

  const scheduleReconnect = (): void => {
    if (stopped) return;
    if (retries >= maxRetries) {
      opts.onConnection("error");
      return;
    }
    retries += 1;
    const delay = Math.min(8000, 500 * 2 ** (retries - 1)); // 0.5s, 1s, 2s, 4s, 8s
    opts.onConnection("reconnecting");
    reconnectTimer = setTimeout(connect, delay);
  };

  connect();

  return {
    stop: () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      opts.onConnection("closed");
      try {
        socket?.close();
      } catch {
        /* noop */
      }
    },
  };
}
