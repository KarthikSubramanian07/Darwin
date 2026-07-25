// The live event-server WebSocket URL. In production the dashboard is a static site with no
// backend of its own, so it must point at the deployed engine server via VITE_API_URL. In dev,
// Vite proxies /ws to localhost:8000, so we fall back to the current host. VITE_WS_URL, if set,
// wins outright (explicit full ws(s):// URL).
export function liveWsUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) return explicit;

  const api = import.meta.env.VITE_API_URL;
  if (api) {
    const u = new URL(api);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/ws";
    u.search = "";
    return u.toString();
  }

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

// Resolve a REST path (/api/run, /api/status) against the backend. Same story as the WS URL: in
// production the static site has no backend of its own, so calls must go to VITE_API_URL. In dev
// the Vite proxy handles /api, so we return the relative path and let it resolve to localhost.
export function apiUrl(path: string): string {
  const api = import.meta.env.VITE_API_URL;
  if (!api) return path; // dev: Vite proxies the relative path to :8000
  return new URL(path, api).toString();
}
