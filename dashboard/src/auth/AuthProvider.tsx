// AuthProvider decides between two implementations at mount:
//
//   * Real WorkOS AuthKit  — when VITE_WORKOS_ENABLED=true AND a client id is present. It mounts
//     WorkOS's <AuthKitProvider> and bridges its useAuth() into our DarwinAuth context.
//   * Dev identity fallback — otherwise. A polished local identity so the dashboard is never
//     blocked by missing secrets. Login/logout still work (they toggle the local session).
//
// The real path is fully wired but OFF by default (see .env.example + docs/LANE_D.md for exact
// activation). No secrets are hardcoded.

import { AuthKitProvider, useAuth as useWorkOSAuth } from "@workos-inc/authkit-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AuthContext, type DarwinAuth, type DarwinUser } from "./authContext";

const WORKOS_ENABLED =
  String(import.meta.env.VITE_WORKOS_ENABLED).toLowerCase() === "true" &&
  Boolean(import.meta.env.VITE_WORKOS_CLIENT_ID);

const ORG_NAME = (import.meta.env.VITE_WORKOS_ORG_NAME as string | undefined) || "Darwin Labs";
const DEV_AUTOLOGIN =
  String(import.meta.env.VITE_AUTH_DEV_AUTOLOGIN ?? "true").toLowerCase() !== "false";

const DEV_USER: DarwinUser = {
  name: "Demo Operator",
  email: "demo@darwin.local",
  org: ORG_NAME,
  avatarUrl: null,
};

// ---- Dev fallback provider --------------------------------------------------------------

function DevAuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [authed, setAuthed] = useState<boolean>(DEV_AUTOLOGIN);
  const signIn = useCallback(() => setAuthed(true), []);
  const signOut = useCallback(() => setAuthed(false), []);
  const value = useMemo<DarwinAuth>(
    () => ({
      enabled: false,
      status: authed ? "authenticated" : "unauthenticated",
      user: authed ? DEV_USER : null,
      signIn,
      signOut,
    }),
    [authed, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---- Real WorkOS bridge -----------------------------------------------------------------

function WorkOSBridge({ children }: { children: ReactNode }): JSX.Element {
  const wos = useWorkOSAuth();
  const value = useMemo<DarwinAuth>(() => {
    const u = wos.user;
    const name =
      [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() || u?.email || "Signed in";
    const user: DarwinUser | null = u
      ? {
          name,
          email: u.email ?? "",
          org: wos.organizationId || ORG_NAME,
          avatarUrl: u.profilePictureUrl ?? null,
        }
      : null;
    const status = wos.isLoading ? "loading" : user ? "authenticated" : "unauthenticated";
    return {
      enabled: true,
      status,
      user,
      signIn: () => void wos.signIn(),
      signOut: () => void wos.signOut(),
    };
  }, [wos]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  if (WORKOS_ENABLED) {
    return (
      <AuthKitProvider
        clientId={String(import.meta.env.VITE_WORKOS_CLIENT_ID)}
        redirectUri={import.meta.env.VITE_WORKOS_REDIRECT_URI as string | undefined}
      >
        <WorkOSBridge>{children}</WorkOSBridge>
      </AuthKitProvider>
    );
  }
  return <DevAuthProvider>{children}</DevAuthProvider>;
}
