/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_MODE?: string; // "live" | "recorded" | "mock"
  readonly VITE_WORKOS_ENABLED?: string; // "true" to activate real WorkOS AuthKit
  readonly VITE_WORKOS_CLIENT_ID?: string;
  readonly VITE_WORKOS_REDIRECT_URI?: string;
  readonly VITE_WORKOS_ORG_NAME?: string; // friendly org/workspace label
  readonly VITE_AUTH_DEV_AUTOLOGIN?: string; // "false" to show the login gate in dev
  readonly VITE_WS_URL?: string; // override the live event server URL
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
