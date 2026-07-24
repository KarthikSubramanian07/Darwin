import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Local WS backend (darwin/server/events.py) is proxied in dev so the dashboard
// survives flaky venue WiFi. Static build deploys to Cloudflare Pages (darwin.pages.dev).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
  build: { outDir: "dist", sourcemap: true },
});
