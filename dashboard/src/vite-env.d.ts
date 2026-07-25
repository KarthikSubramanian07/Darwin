/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_MODE?: string; // "live" | "recorded" | "mock"
  readonly VITE_API_URL?: string; // deployed engine server base URL (Railway); ws derived from it
  readonly VITE_WS_URL?: string; // override the live event server URL (explicit ws(s):// URL)
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
