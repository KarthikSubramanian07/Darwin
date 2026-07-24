import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Local WS backend (darwin/server/events.py) is proxied in dev so the dashboard
// survives flaky venue WiFi. Static build deploys to Cloudflare Pages (darwin.pages.dev).
//
// Two entries: index.html is the landing/evolution replay, app.html is Lane D's run
// dashboard. They keep separate bundles because they carry independent design systems.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: "ws://localhost:8000", ws: true },
      "/api": { target: "http://localhost:8000" },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: "index.html",
        app: "app.html",
      },
    },
  },
});
