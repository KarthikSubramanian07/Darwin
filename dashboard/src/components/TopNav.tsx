// Top navigation: brand, previous-runs access, and the demo-source control.

import { DEMO_MODE_LABEL, type DemoMode } from "../store/useDarwinRun";

interface TopNavProps {
  mode: DemoMode;
  onOpenLibrary: () => void;
  onHome: () => void;
  onOpenDemoControls: () => void;
}

export function TopNav({
  mode,
  onOpenLibrary,
  onHome,
  onOpenDemoControls,
}: TopNavProps): JSX.Element {
  return (
    <header className="topnav">
      <div className="topnav-left">
        <button className="brand" onClick={onHome} aria-label="Darwin home">
          <span className="mark">Darwin</span>
        </button>
      </div>

      <nav className="topnav-right" aria-label="Primary">
        <a className="btn btn-ghost" href="/">
          Home
        </a>
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
