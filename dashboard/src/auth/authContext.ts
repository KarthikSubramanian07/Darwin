// Darwin's own auth context, so the app never depends directly on a specific WorkOS API shape.
// AuthProvider fills this from real WorkOS AuthKit when enabled, or a dev identity when not.

import { createContext, useContext } from "react";

export interface DarwinUser {
  name: string;
  email: string;
  org: string; // organization / workspace display label
  avatarUrl?: string | null;
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface DarwinAuth {
  enabled: boolean; // true when real WorkOS AuthKit is active
  status: AuthStatus;
  user: DarwinUser | null;
  signIn: () => void;
  signOut: () => void;
}

export const AuthContext = createContext<DarwinAuth | null>(null);

export function useAuth(): DarwinAuth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
