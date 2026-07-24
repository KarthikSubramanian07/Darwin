// Top navigation: brand, workspace/org, previous-runs access, and the signed-in identity.

import { useAuth } from "../auth/authContext";
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
  const { user, signOut, enabled } = useAuth();
  const initials = user
    ? user.name
        .split(" ")
        .map((s) => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  return (
    <header className="topnav">
      <div className="topnav-left">
        <button className="brand" onClick={onHome} aria-label="Darwin home">
          <span className="mark">Darwin</span>
        </button>
        {user ? (
          <span className="workspace" title="Current workspace">
            <span className="workspace-dim">Workspace</span>
            <span className="workspace-name">{user.org}</span>
          </span>
        ) : null}
      </div>

      <nav className="topnav-right" aria-label="Primary">
        <button className="btn btn-ghost" onClick={onOpenLibrary}>
          Previous runs
        </button>
        <button
          className="btn btn-ghost"
          onClick={onOpenDemoControls}
          title="Demo source"
        >
          Source: <strong>{DEMO_MODE_LABEL[mode]}</strong>
        </button>
        {user ? (
          <div className="identity">
            <span className="avatar" aria-hidden="true">
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials}
            </span>
            <span className="identity-meta">
              <span className="identity-name">{user.name}</span>
              <span className="identity-org">
                {user.email}
                {!enabled ? " · dev" : ""}
              </span>
            </span>
            <button className="btn btn-ghost btn-sm" onClick={signOut}>
              Sign out
            </button>
          </div>
        ) : null}
      </nav>
    </header>
  );
}
