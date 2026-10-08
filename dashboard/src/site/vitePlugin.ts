// Build-time emitter for everything agents and crawlers read. One source (./content.ts),
// rendered by ./render.ts into:
//   index.html / app.html   raw-HTML article injected into #root (React replaces it on boot)
//                           + JSON-LD + Markdown alternate links
//   about|contact|privacy|developers.html, 404.html   standalone static pages
//   <slug>.md               Markdown twin of every indexable page (served on Accept: text/markdown)
//   llms.txt, sitemap.xml, site.css, _routes.json

import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { HOME, LAB, NOT_FOUND, PAGES, type Page } from "./content";
import {
  jsonLd,
  markdownPath,
  renderArticle,
  renderHomePrerender,
  renderJsonLd,
  renderLlmsTxt,
  renderMarkdown,
  renderPageHtml,
  renderSitemap,
} from "./render";

export const PRERENDER_MARK = "<!--agent:prerender-->";
export const HEAD_MARK = "<!--agent:head-->";

/** Assets Pages should serve without invoking functions/_middleware.ts (saves invocations). */
export const ROUTES_JSON = {
  version: 1,
  include: ["/*"],
  exclude: ["/assets/*", "/favicon.svg", "/og.png", "/site.css", "/robots.txt", "/sitemap.xml", "/llms.txt"],
};

const headFor = (page: Page): string =>
  [
    `<link rel="alternate" type="text/markdown" href="${markdownPath(page)}" />`,
    `<link rel="describedby" type="text/markdown" href="/llms.txt" />`,
    `<script type="application/ld+json">${jsonLd(renderJsonLd(page))}</script>`,
    // Hide the no-JS article as soon as we know scripts run, so React mounts without a flash.
    `<script>document.documentElement.classList.add("js")</script>`,
    `<style>.js .prerender{display:none}</style>`,
    `<noscript><link rel="stylesheet" href="/site.css" /></noscript>`,
  ].join("\n    ");

/** Inject the head block and the prerendered article into a Vite HTML entry. */
export function injectEntry(html: string, page: Page): string {
  if (!html.includes(PRERENDER_MARK) || !html.includes(HEAD_MARK)) {
    throw new Error(`agent-site: ${page.path} entry is missing ${HEAD_MARK} or ${PRERENDER_MARK}`);
  }
  const article =
    page === HOME ? renderHomePrerender() : `<main class="prerender prose">${renderArticle(page)}</main>`;
  return html.replace(HEAD_MARK, headFor(page)).replace(PRERENDER_MARK, article);
}

/** Every file the plugin emits, keyed by output path. Exported for tests. */
export function siteFiles(lastmod: string, css: string): Record<string, string> {
  const files: Record<string, string> = {
    "llms.txt": renderLlmsTxt(),
    "sitemap.xml": renderSitemap(lastmod),
    "site.css": css,
    "_routes.json": JSON.stringify(ROUTES_JSON, null, 2) + "\n",
  };
  for (const page of PAGES) {
    if (page.standalone) files[`${page.slug}.html`] = renderPageHtml(page);
    if (page !== NOT_FOUND) files[markdownPath(page).slice(1)] = renderMarkdown(page);
  }
  return files;
}

export function agentSite(): Plugin {
  const lastmod = new Date().toISOString().slice(0, 10);
  return {
    name: "darwin-agent-site",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const file = ctx.filename.replace(/\\/g, "/");
        if (file.endsWith("/app.html")) return injectEntry(html, LAB);
        if (file.endsWith("/index.html")) return injectEntry(html, HOME);
        return html;
      },
    },
    generateBundle() {
      const css = readFileSync(new URL("./pages.css", import.meta.url), "utf8");
      for (const [fileName, source] of Object.entries(siteFiles(lastmod, css))) {
        this.emitFile({ type: "asset", fileName, source });
      }
    },
  };
}
