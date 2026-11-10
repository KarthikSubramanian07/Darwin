// Demo/source control. Small, not visually dominant. Lets the operator lock the build to a
// reliable source if venue Wi-Fi fails. The selected source is always clearly indicated in the
// nav; this panel just switches it.

import { type JSX, useEffect, useRef } from "react";
import { DEMO_MODE_LABEL, type DemoMode } from "../store/useDarwinRun";

const MODES: DemoMode[] = ["live", "recorded", "mock"];

const HELP: Record<DemoMode, string> = {
  live: "Streams real events from the local pipeline over WebSocket. Falls back honestly if the connection drops.",
  recorded: "Replays a real, successful past run with recorded timing. Safest for the demo floor.",
  mock: "Deterministic development data for building and testing the UI.",
};

export function DemoControls({
  mode,
  onSelect,
  onClose,
}: {
  mode: DemoMode;
  onSelect: (m: DemoMode) => void;
  onClose: () => void;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    const root = rootRef.current;
    if (!root) return;

    const focusables = () =>
      [
        ...root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.hasAttribute("disabled"));

    const first = focusables()[0];
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="demo-controls"
      role="dialog"
      aria-modal="true"
      aria-label="Demo source"
      ref={rootRef}
    >
      <div className="demo-controls-head">
        <h3>Demo source</h3>
        <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <ul className="mode-list">
        {MODES.map((m) => (
          <li key={m}>
            <button
              className={`mode-option ${mode === m ? "mode-active" : ""}`}
              onClick={() => onSelect(m)}
              aria-pressed={mode === m}
            >
              <span className="mode-radio" aria-hidden="true" />
              <span className="mode-body">
                <span className="mode-name">{DEMO_MODE_LABEL[m]}</span>
                <span className="mode-help dim">{HELP[m]}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="demo-controls-foot dim">
        Lock the source with <code>VITE_DEMO_MODE</code> in the environment.
      </p>
    </div>
  );
}
