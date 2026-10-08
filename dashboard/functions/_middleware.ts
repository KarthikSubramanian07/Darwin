// Cloudflare Pages middleware: Markdown content negotiation and agent-friendly errors.
//
//   Accept: text/markdown  on a document path -> its Markdown twin (/about -> /about.md),
//                                                 Content-Type: text/markdown, Vary: Accept
//   Accept: text/html / browsers / no header    -> the static HTML page, plus Vary: Accept
//   unknown path                                -> HTTP 404 (dist/404.html), or a Markdown
//                                                 404 body when Markdown is preferred
//   Accept that rules out both                  -> 406 listing what is available
//
// Static assets (anything with a file extension) pass straight through; _routes.json keeps
// the hashed bundle and images from invoking this function at all.

import { renderNotFoundMarkdown } from "../src/site/render";
import { addVary, markdownPathFor, negotiate } from "../src/site/negotiate";

interface Env {
  ASSETS: { fetch: (input: Request | URL | string, init?: RequestInit) => Promise<Response> };
}

interface Context {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}

const MARKDOWN = "text/markdown; charset=utf-8";
const DESCRIBEDBY = '</llms.txt>; rel="describedby"; type="text/markdown"';

const baseHeaders = (contentType: string): Headers =>
  new Headers({
    "Content-Type": contentType,
    Vary: "Accept",
    "Cache-Control": "public, max-age=0, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
  });

function respond(request: Request, body: string, status: number, headers: Headers): Response {
  return new Response(request.method === "HEAD" ? null : body, { status, headers });
}

function markdownNotFound(request: Request, pathname: string): Response {
  const headers = baseHeaders(MARKDOWN);
  headers.set("Link", DESCRIBEDBY);
  headers.set("X-Robots-Tag", "noindex");
  return respond(request, renderNotFoundMarkdown(pathname), 404, headers);
}

export const onRequest = async ({ request, env, next }: Context): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") return next();
  const url = new URL(request.url);

  // Direct .md URLs: guarantee the media type, and keep misses in Markdown.
  if (url.pathname.endsWith(".md")) {
    const res = await next();
    if (res.status === 404) return markdownNotFound(request, url.pathname);
    const out = new Response(res.body, res);
    if (res.ok) out.headers.set("Content-Type", MARKDOWN);
    return out;
  }

  const mdPath = markdownPathFor(url.pathname);
  if (!mdPath) return next();

  const wanted = negotiate(request.headers.get("Accept"));

  if (wanted === "none") {
    const headers = baseHeaders("text/plain; charset=utf-8");
    return respond(
      request,
      "406 Not Acceptable. This resource is available as text/html or text/markdown.\n",
      406,
      headers,
    );
  }

  if (wanted === "markdown") {
    const asset = await env.ASSETS.fetch(new URL(mdPath, url), { method: "GET" });
    if (asset.status !== 200) return markdownNotFound(request, url.pathname);
    const headers = baseHeaders(MARKDOWN);
    const canonical = url.pathname === "/index.html" ? "/" : url.pathname.replace(/\.html$/, "");
    headers.set("Link", `<${new URL(canonical, url).href}>; rel="canonical", ${DESCRIBEDBY}`);
    return respond(request, await asset.text(), 200, headers);
  }

  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("Vary", addVary(res.headers.get("Vary"), "Accept"));
  if (res.ok) {
    out.headers.append("Link", `<${mdPath}>; rel="alternate"; type="text/markdown"`);
    out.headers.append("Link", DESCRIBEDBY);
  }
  return out;
};
