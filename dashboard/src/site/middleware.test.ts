import { describe, expect, it } from "vitest";
import { onRequest } from "../../functions/_middleware";

// A fake Pages runtime: ASSETS and next() behave like Cloudflare's static asset server with a
// top-level 404.html (unknown paths -> 404 HTML).
const ASSET_FILES: Record<string, [string, string]> = {
  "/": ["<html>home</html>", "text/html; charset=utf-8"],
  "/about": ["<html>about</html>", "text/html; charset=utf-8"],
  "/index.md": ["# Darwin\n", "application/octet-stream"],
  "/about.md": ["# About Darwin\n", "application/octet-stream"],
  "/og.png": ["PNG", "image/png"],
};

function serve(path: string): Response {
  const hit = ASSET_FILES[path];
  if (hit) return new Response(hit[0], { status: 200, headers: { "Content-Type": hit[1] } });
  return new Response("<html>404 page</html>", {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function call(path: string, accept?: string, method = "GET") {
  const request = new Request(`https://trydarwin.pages.dev${path}`, {
    method,
    headers: accept ? { Accept: accept } : {},
  });
  const env = { ASSETS: { fetch: async (u: Request | URL | string) => serve(new URL(String(u)).pathname) } };
  const res = await onRequest({ request, env, next: async () => serve(new URL(request.url).pathname) });
  return { res, body: await res.text() };
}

describe("pages middleware", () => {
  it("serves Markdown for the homepage when asked", async () => {
    const { res, body } = await call("/", "text/markdown");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("Vary")).toBe("Accept");
    expect(res.headers.get("Link")).toContain('<https://trydarwin.pages.dev/>; rel="canonical"');
    expect(body).toBe("# Darwin\n");
  });

  it("keeps serving HTML to browsers, with Vary: Accept and a markdown alternate", async () => {
    const { res, body } = await call("/", "text/html,application/xhtml+xml,*/*;q=0.8");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Vary")).toBe("Accept");
    expect(res.headers.get("Link")).toContain('</index.md>; rel="alternate"; type="text/markdown"');
    expect(body).toBe("<html>home</html>");
  });

  it("serves clean-URL subpages as Markdown", async () => {
    const { res, body } = await call("/about", "text/markdown, text/html;q=0.5");
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(body).toBe("# About Darwin\n");
  });

  it("returns a real 404 with a Markdown body for unknown paths", async () => {
    const { res, body } = await call("/some-path-that-does-not-exist", "text/markdown");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("Vary")).toBe("Accept");
    expect(body).toContain("# 404: Not found");
    expect(body).toContain("/llms.txt");
  });

  it("returns a real 404 HTML page to browsers", async () => {
    const { res, body } = await call("/some-path-that-does-not-exist", "text/html");
    expect(res.status).toBe(404);
    expect(body).toBe("<html>404 page</html>");
    expect(res.headers.get("Vary")).toBe("Accept");
    expect(res.headers.get("Link")).toBeNull();
  });

  it("forces text/markdown on direct .md URLs and keeps .md misses in Markdown", async () => {
    const hit = await call("/about.md");
    expect(hit.res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    const miss = await call("/missing.md");
    expect(miss.res.status).toBe(404);
    expect(miss.res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
  });

  it("answers 406 when neither HTML nor Markdown is acceptable", async () => {
    const { res, body } = await call("/", "application/json");
    expect(res.status).toBe(406);
    expect(body).toContain("text/markdown");
    expect(res.headers.get("Vary")).toBe("Accept");
  });

  it("leaves static assets alone", async () => {
    const { res } = await call("/og.png", "text/markdown");
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Vary")).toBeNull();
  });

  it("sends headers but no body for HEAD", async () => {
    const { res, body } = await call("/", "text/markdown", "HEAD");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(body).toBe("");
  });
});
