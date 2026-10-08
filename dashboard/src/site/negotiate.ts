// HTTP content negotiation for the Pages middleware (functions/_middleware.ts).
// Pure functions only, so the edge behaviour is unit-tested in Node.

export type Representation = "html" | "markdown" | "none";

interface Range {
  type: string;
  subtype: string;
  q: number;
  index: number;
}

const MARKDOWN_TYPES = ["text/markdown", "text/x-markdown"];

export function parseAccept(header: string): Range[] {
  return header
    .split(",")
    .map((part, index) => {
      const [mime, ...params] = part.trim().split(";");
      const [type = "", subtype = ""] = mime.trim().toLowerCase().split("/");
      let q = 1;
      for (const param of params) {
        const [k, v] = param.trim().split("=");
        if (k?.trim().toLowerCase() === "q") {
          const n = Number(v);
          q = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
        }
      }
      return { type, subtype, q, index };
    })
    .filter((r) => r.type && r.subtype);
}

/** RFC 9110 §12.5.1: the most specific matching range decides a media type's quality. */
function match(ranges: Range[], mime: string): { q: number; specificity: number; index: number } {
  const [type, subtype] = mime.split("/");
  let best = { q: 0, specificity: -1, index: Infinity };
  for (const r of ranges) {
    const specificity =
      r.type === type && r.subtype === subtype ? 2 : r.type === type && r.subtype === "*" ? 1 : r.type === "*" && r.subtype === "*" ? 0 : -1;
    if (specificity > best.specificity) best = { q: r.q, specificity, index: r.index };
  }
  return best;
}

/**
 * Which representation of a document to serve. Missing header means HTML (browsers, curl).
 * Ties in q go to the explicitly named type, then to whichever the client listed first,
 * so `Accept: text/markdown` and `Accept: text/markdown, text/html` both get Markdown while
 * every browser Accept header (which names text/html and never text/markdown) gets HTML.
 */
export function negotiate(accept: string | null | undefined): Representation {
  if (!accept || !accept.trim()) return "html";
  const ranges = parseAccept(accept);
  if (ranges.length === 0) return "html";
  const html = match(ranges, "text/html");
  const md = MARKDOWN_TYPES.map((t) => match(ranges, t)).reduce((a, b) =>
    b.q > a.q || (b.q === a.q && b.specificity > a.specificity) ? b : a,
  );
  if (html.q === 0 && md.q === 0) return "none";
  if (md.q !== html.q) return md.q > html.q ? "markdown" : "html";
  if (md.specificity !== html.specificity) return md.specificity > html.specificity ? "markdown" : "html";
  return md.index < html.index ? "markdown" : "html";
}

/**
 * Markdown twin for a document path, or null for static assets (anything with a file
 * extension other than .html). "/" -> "/index.md", "/about/" -> "/about.md".
 */
export function markdownPathFor(pathname: string): string | null {
  let path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "/index.md";
  if (path.endsWith("/index.html")) path = path.slice(0, -"/index.html".length) || "/";
  else if (path.endsWith(".html")) path = path.slice(0, -".html".length);
  if (path === "/") return "/index.md";
  const last = path.slice(path.lastIndexOf("/") + 1);
  if (last.includes(".")) return null;
  return `${path}.md`;
}

/** Documents are negotiable; assets (/og.png, /llms.txt, /index.md, ...) are served as-is. */
export const isDocumentPath = (pathname: string): boolean => markdownPathFor(pathname) !== null;

/** Append a token to a Vary header without duplicating it. */
export function addVary(existing: string | null, token: string): string {
  if (!existing) return token;
  const parts = existing.split(",").map((s) => s.trim().toLowerCase());
  return parts.includes(token.toLowerCase()) || parts.includes("*") ? existing : `${existing}, ${token}`;
}
