// Honest live-connection status. On failure it offers recovery (open the recorded run) instead
// of silently swapping in fake data while still claiming LIVE.

import type { ConnectionState } from "../types";

const LABEL: Partial<Record<ConnectionState, string>> = {
  connecting: "Connecting to the live pipeline…",
  reconnecting: "Reconnecting to the live pipeline…",
  open: "Live pipeline connected",
  error: "Live connection unavailable",
  closed: "Live connection closed",
};

export function LiveBanner({
  connection,
  onFallback,
}: {
  connection: ConnectionState;
  onFallback: () => void;
}): JSX.Element | null {
  if (connection === "idle" || connection === "open") return null;
  const isError = connection === "error" || connection === "closed";
  return (
    <div className={`live-banner ${isError ? "live-banner-error" : ""}`} role="status" aria-live="polite">
      <span className="live-banner-dot" aria-hidden="true" />
      <span>{LABEL[connection] ?? "Live pipeline"}</span>
      {isError ? (
        <button className="btn btn-sm btn-primary" onClick={onFallback}>
          Open recorded successful run
        </button>
      ) : null}
    </div>
  );
}
