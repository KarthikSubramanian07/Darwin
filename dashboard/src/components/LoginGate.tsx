// Protected-route gate. Children render only when authenticated. Otherwise a clean login
// screen. Works with real WorkOS AuthKit or the dev identity fallback (see auth/AuthProvider).

import type { ReactNode } from "react";
import { useAuth } from "../auth/authContext";

export function LoginGate({ children }: { children: ReactNode }): JSX.Element {
  const { status, enabled, signIn } = useAuth();

  if (status === "loading") {
    return (
      <div className="auth-screen" role="status" aria-live="polite">
        <div className="auth-card">
          <div className="spinner" aria-hidden="true" />
          <p className="dim">Checking your session…</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand-row">
            <span className="mark">Darwin</span>
          </div>
          <h1>The best LLM for every task in your business.</h1>
          <p className="dim">
            Sign in to run evaluations and view your organization's routing history.
          </p>
          <button className="btn btn-primary btn-lg" onClick={signIn} autoFocus>
            {enabled ? "Sign in with WorkOS" : "Continue to dashboard"}
          </button>
          <p className="auth-note">
            {enabled
              ? "Secured by WorkOS AuthKit."
              : "Development identity — WorkOS AuthKit is wired but disabled. See docs/LANE_D.md to activate."}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
