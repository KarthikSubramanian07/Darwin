// Top navigation: brand, previous-runs access, and the demo-source control.

import { DEMO_MODE_LABEL, type DemoMode } from "../store/useDarwinRun";

interface TopNavProps {
  mode: DemoMode;
  onOpenLibrary: () => void;
  onOpenDemoControls: () => void;
}

export function TopNav({
  mode,
  onOpenLibrary,
  onOpenDemoControls,
}: TopNavProps): JSX.Element {
  return (
    <header className="topnav">
      <div className="topnav-left">
        <a className="brand" href="/" aria-label="Darwin home">
          <span className="mark">Darwin</span>
        </a>
      </div>

      <nav className="topnav-right" aria-label="Primary">
        <button className="btn btn-ghost" onClick={onOpenLibrary}>
          Previous runs
        </button>
        <button className="btn btn-ghost" onClick={onOpenDemoControls} title="Demo source">
          Source: <strong>{DEMO_MODE_LABEL[mode]}</strong>
        </button>
      </nav>
    </header>
  );
}
