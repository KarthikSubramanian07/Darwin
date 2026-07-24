/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_MODE?: string; // "live" | "recorded" | "mock"
  readonly VITE_WS_URL?: string; // override the live event server URL
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
