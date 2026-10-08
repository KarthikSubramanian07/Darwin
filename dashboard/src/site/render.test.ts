import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ABOUT, CONTACT, DEVELOPERS, HOME, LAB, NOT_FOUND, PAGES, PRIVACY, SITE_URL } from "./content";
import {
  ORGANIZATION,
  jsonLd,
  renderArticle,
  renderHomePrerender,
  renderJsonLd,
  renderLlmsTxt,
  renderMarkdown,
  renderNotFoundMarkdown,
  renderPageHtml,
  renderSitemap,
} from "./render";
import { HEAD_MARK, PRERENDER_MARK, ROUTES_JSON, injectEntry, siteFiles } from "./vitePlugin";

const text = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const headings = (html: string): number[] => [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));

describe("homepage prerender (content without JavaScript)", () => {
  const html = renderHomePrerender();

  it("serves well over 500 characters of real text", () => {
    expect(text(html).length).toBeGreaterThan(1500);
  });

  it("has exactly one H1 naming the brand and product", () => {
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).toContain("<h1>Darwin: the evolutionary optimizer for AI agents</h1>");
  });

  it.each(PAGES)("$path heading levels never skip", (page) => {
    const levels = headings(renderArticle(page));
    expect(levels[0]).toBe(1);
    levels.slice(1).forEach((lvl, i) => expect(lvl - levels[i]).toBeLessThanOrEqual(1));
  });
});

describe("trust pages", () => {
  it.each([ABOUT, CONTACT, PRIVACY, DEVELOPERS])("$path has 500+ chars of content", (page) => {
    expect(text(renderArticle(page)).length).toBeGreaterThanOrEqual(500);
  });

  it("standalone pages are complete documents with lang, canonical, og:image, og:type", () => {
    const html = renderPageHtml(ABOUT);
    expect(html).toMatch(/^<!doctype html>\n<html lang="en">/);
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/about" />`);
    expect(html).toContain(`<meta property="og:image" content="${SITE_URL}/og.png" />`);
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<link rel="alternate" type="text/markdown" href="/about.md" />');
  });

  it("the 404 page is noindex with no canonical and points at llms.txt and the sitemap", () => {
    const html = renderPageHtml(NOT_FOUND);
    expect(html).toContain('content="noindex,follow"');
    expect(html).not.toContain('rel="canonical"');
    expect(html).toContain('href="/llms.txt"');
    expect(html).toContain('href="/sitemap.xml"');
  });

  it("escapes HTML in copy", () => {
    expect(renderArticle({ ...ABOUT, intro: "<script>x</script>", sections: [] })).toContain(
      "&lt;script&gt;x&lt;/script&gt;",
    );
  });
});

describe("markdown twins", () => {
  it("homepage markdown is substantial and absolute-linked", () => {
    const md = renderMarkdown(HOME);
    expect(md.startsWith("# Darwin: the evolutionary optimizer for AI agents\n")).toBe(true);
    expect(md.length).toBeGreaterThan(1500);
    expect(md).toContain(`](${SITE_URL}/developers)`);
    expect(md).not.toMatch(/\]\(\//);
  });

  it("404 markdown explains the error, points to docs, and neutralises the path", () => {
    const md = renderNotFoundMarkdown("/x`](javascript:alert(1))<b>");
    expect(md).toContain("# 404: Not found");
    expect(md).toContain(`${SITE_URL}/llms.txt`);
    expect(md).toContain(`${SITE_URL}/sitemap.xml`);
    expect(md).toContain("`/xjavascriptalert1b`");
    expect(md.length).toBeGreaterThan(200);
  });
});

describe("JSON-LD", () => {
  const graph = renderJsonLd(HOME)["@graph"] as Record<string, unknown>[];
  const types = graph.map((n) => n["@type"]);

  it("describes the site, the organization, and the software", () => {
    expect(types).toEqual(["WebSite", "Organization", "SoftwareApplication", "WebPage"]);
    const app = graph[2];
    for (const key of ["name", "description", "url", "offers", "license", "codeRepository"]) {
      expect(app).toHaveProperty(key);
    }
  });

  it("Organization carries a contactPoint with an email and contactType", () => {
    const cp = ORGANIZATION.contactPoint[0];
    expect(cp["@type"]).toBe("ContactPoint");
    expect(cp.email).toMatch(/@/);
    expect(cp.contactType).toBeTruthy();
  });

  it("Organization carries a PostalAddress", () => {
    expect(ORGANIZATION.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Berkeley",
      addressRegion: "CA",
      addressCountry: "US",
    });
  });

  it("uses page-specific types for About and Contact", () => {
    const t = (p: typeof ABOUT) => (renderJsonLd(p)["@graph"] as { "@type": string }[])[3]["@type"];
    expect(t(ABOUT)).toBe("AboutPage");
    expect(t(CONTACT)).toBe("ContactPage");
  });

  it("cannot break out of its script tag", () => {
    expect(jsonLd({ a: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});

describe("llms.txt", () => {
  const txt = renderLlmsTxt();

  it("follows the llmstxt.org layout: H1, blockquote, then H2 link sections ending in Optional", () => {
    const lines = txt.split("\n");
    expect(lines[0]).toBe("# Darwin");
    expect(lines[2].startsWith("> ")).toBe(true);
    const h2 = lines.filter((l) => l.startsWith("## "));
    expect(h2[h2.length - 1]).toBe("## Optional");
    expect(h2).toContain("## Docs");
    expect(txt.match(/^# /gm)).toHaveLength(1);
  });

  it("has when-to-use guidance and how to call Darwin", () => {
    expect(txt).toContain("## When to use Darwin");
    expect(txt).toContain("## How an agent should use Darwin");
    expect(txt).toContain("`darwin --offline`");
  });

  it("links every indexable page's markdown twin", () => {
    for (const p of [HOME, LAB, DEVELOPERS, ABOUT, CONTACT, PRIVACY]) {
      expect(txt).toContain(`(${SITE_URL}/${p.slug}.md)`);
    }
  });
});

describe("sitemap.xml", () => {
  const xml = renderSitemap("2026-10-08");

  it("lists every indexable URL with lastmod and nothing else", () => {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(
      ["/", "/app", "/developers", "/about", "/contact", "/privacy"].map((p) => `${SITE_URL}${p}`),
    );
    expect(xml.match(/<lastmod>2026-10-08<\/lastmod>/g)).toHaveLength(locs.length);
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });
});

describe("vite plugin output", () => {
  const files = siteFiles("2026-10-08", "/* css */");

  it("emits every page, twin, and machine-readable file", () => {
    expect(Object.keys(files).sort()).toEqual(
      [
        "404.html",
        "_routes.json",
        "about.html",
        "about.md",
        "app.md",
        "contact.html",
        "contact.md",
        "developers.html",
        "developers.md",
        "index.md",
        "llms.txt",
        "privacy.html",
        "privacy.md",
        "site.css",
        "sitemap.xml",
      ].sort(),
    );
  });

  it("keeps hashed assets out of the middleware", () => {
    expect(ROUTES_JSON.exclude).toContain("/assets/*");
    expect(ROUTES_JSON.include).toEqual(["/*"]);
  });

  it.each([
    ["index.html", HOME],
    ["app.html", LAB],
  ] as const)("the real %s entry gets the prerender, JSON-LD, and markdown alternate", (file, page) => {
    const src = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    expect(src).toContain(HEAD_MARK);
    expect(src).toContain(PRERENDER_MARK);
    const out = injectEntry(src, page);
    expect(out).toContain('<script type="application/ld+json">');
    expect(out).toContain(`<link rel="alternate" type="text/markdown" href="/${page.slug}.md" />`);
    expect(out).toMatch(/<div id="root"><main class="prerender prose"><h1>/);
    expect(out).toContain('<link rel="canonical"');
    expect(out).toContain('<meta property="og:image"');
    expect(out).toContain('<html lang="en">');
    expect(out).not.toContain(PRERENDER_MARK);
  });

  it("refuses an entry without markers instead of silently shipping an empty shell", () => {
    expect(() => injectEntry("<html></html>", HOME)).toThrow(/missing/);
  });
});
