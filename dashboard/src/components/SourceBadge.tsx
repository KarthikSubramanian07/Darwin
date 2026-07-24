// Honest provenance badge. Cached/recorded runs are NEVER shown as live.

import type { RunSource } from "../types";

const META: Record<RunSource, { label: string; cls: string }> = {
  live: { label: "LIVE", cls: "badge-live" },
  recorded_demo: { label: "RECORDED DEMO", cls: "badge-recorded" },
  previously_computed: { label: "PREVIOUS RUN", cls: "badge-previous" },
  mock: { label: "MOCK DATA", cls: "badge-mock" },
};

export function SourceBadge({
  source,
  date,
}: {
  source: RunSource;
  date?: string;
}): JSX.Element {
  const m = META[source];
  return (
    <span className={`source-badge ${m.cls}`}>
      <span className="dot" aria-hidden="true" />
      {m.label}
      {date ? <span className="badge-date"> · {date}</span> : null}
    </span>
  );
}
