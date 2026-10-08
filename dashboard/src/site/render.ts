// Pure renderers over ./content.ts. No I/O, so every output is unit-testable and the Vite
// plugin only has to write strings to disk.

import {
  ABOUT,
  BRAND,
  CONTACT,
  CONTACT_EMAIL,
  DEVELOPERS,
  HOME,
  ISSUES_URL,
  LAB,
  LLMS_EXTRA,
  PAGES,
  PRIVACY,
  REPO_URL,
  SITE_URL,
  SUMMARY,
  TAGLINE,
  type Block,
  type Page,
  type Section,
} from "./content";

export const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Absolute URL for a site path, leaving external links untouched. */
export const abs = (href: string): string =>
  /^(https?:|mailto:)/.test(href) ? href : `${SITE_URL}${href === "/" ? "/" : href}`;

/** The Markdown twin of a page path: "/" -> "/index.md", "/about" -> "/about.md". */
export const markdownPath = (page: Page): string => `/${page.slug}.md`;

// ---------------------------------------------------------------- Markdown

/** Inline Markdown is already the source format; only root-relative links become absolute. */
const mdInline = (text: string): string =>
  text.replace(/\]\((\/[^)]*)\)/g, (_, href: string) => `](${abs(href)})`);

const mdBlock = (b: Block): string => {
  if (b.kind === "p") return mdInline(b.text);
  if (b.kind === "list") return b.items.map((i) => `- ${mdInline(i)}`).join("\n");
  return "```" + b.lang + "\n" + b.code + "\n```";
};

const mdSection = (s: Section, depth: number): string =>
  [
    `${"#".repeat(depth)} ${s.heading}`,
    ...s.blocks.map(mdBlock),
    ...(s.subsections ?? []).map((sub) => mdSection(sub, depth + 1)),
  ].join("\n\n");

export function renderMarkdown(page: Page): string {
  return (
    [
      `# ${page.h1}`,
      `> ${page.description}`,
      mdInline(page.intro),
      ...page.sections.map((s) => mdSection(s, 2)),
      `---\n\nCanonical page: ${abs(page.path)} · Site index for agents: ${SITE_URL}/llms.txt`,
    ].join("\n\n") + "\n"
  );
}

/** Markdown body for any unknown path (served with HTTP 404). */
export function renderNotFoundMarkdown(path: string): string {
  // Paths are attacker-controlled; keep them printable and out of Markdown syntax.
  const safe = path.replace(/[^A-Za-z0-9/._~-]/g, "").slice(0, 200) || "/";
  return (
    [
      "# 404: Not found",
      `There is no page at \`${safe}\` on ${SITE_URL}. It may have been renamed, or the link may be wrong.`,
      "## Where to go instead",
      [
        `- [Home](${SITE_URL}/): what Darwin is and how it works (Markdown: ${SITE_URL}/index.md)`,
        `- [Developers](${SITE_URL}/developers): quickstart, CLI, and local API`,
        `- [llms.txt](${SITE_URL}/llms.txt): a Markdown index of every page, for AI agents`,
        `- [sitemap.xml](${SITE_URL}/sitemap.xml): every indexable URL`,
      ].join("\n"),
    ].join("\n\n") + "\n"
  );
}

// ---------------------------------------------------------------- HTML

const htmlInline = (text: string): string =>
  escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, href: string) => {
      const ext = /^https?:/.test(href) && !href.startsWith(SITE_URL);
      return `<a href="${href}"${ext ? ' rel="noopener"' : ""}>${label}</a>`;
    });

const htmlBlock = (b: Block): string => {
  if (b.kind === "p") return `<p>${htmlInline(b.text)}</p>`;
  if (b.kind === "list") return `<ul>${b.items.map((i) => `<li>${htmlInline(i)}</li>`).join("")}</ul>`;
  return `<pre><code class="language-${b.lang}">${escapeHtml(b.code)}</code></pre>`;
};

const htmlSection = (s: Section, depth: number): string =>
  `<section><h${depth}>${escapeHtml(s.heading)}</h${depth}>${s.blocks.map(htmlBlock).join("")}${(
    s.subsections ?? []
  )
    .map((sub) => htmlSection(sub, depth + 1))
    .join("")}</section>`;

/** The semantic article body shared by standalone pages and the homepage prerender. */
export function renderArticle(page: Page): string {
  return `<h1>${escapeHtml(page.h1)}</h1><p class="lede">${htmlInline(page.intro)}</p>${page.sections
    .map((s) => htmlSection(s, 2))
    .join("")}`;
}

const NAV_LINKS: [string, string][] = [
  ["/developers", "Developers"],
  ["/about", "About"],
  ["/app", "The Lab"],
];
const FOOTER_LINKS: [string, string][] = [
  ["/about", "About"],
  ["/developers", "Developers"],
  ["/contact", "Contact"],
  ["/privacy", "Privacy"],
  ["/llms.txt", "llms.txt"],
];

const linkRow = (links: [string, string][]): string =>
  links.map(([href, label]) => `<a href="${href}">${label}</a>`).join("");

export function renderHeadMeta(page: Page): string {
  const url = abs(page.path);
  const robots = page.indexable ? "index,follow,max-image-preview:large" : "noindex,follow";
  return [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
    page.indexable ? `<link rel="canonical" href="${url}" />` : "",
    page.indexable ? `<link rel="alternate" type="text/markdown" href="${markdownPath(page)}" />` : "",
    `<link rel="describedby" type="text/markdown" href="/llms.txt" />`,
    `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`,
    `<meta name="theme-color" content="#0c0c0e" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:site_name" content="${BRAND}" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${SITE_URL}/og.png" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ]
    .filter(Boolean)
    .join("\n    ");
}

/** A complete standalone page (about, contact, privacy, developers, 404). */
export function renderPageHtml(page: Page): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${renderHeadMeta(page)}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" />
    <link rel="stylesheet" href="/site.css" />
    <script type="application/ld+json">${jsonLd(renderJsonLd(page))}</script>
  </head>
  <body class="doc">
    <div class="aurora" aria-hidden="true"></div>
    <header class="nav">
      <a class="brand" href="/" aria-label="Darwin home">${LOGO_SVG}<span class="wordmark">Darwin</span></a>
      <nav class="links" aria-label="Primary">${linkRow(NAV_LINKS)}</nav>
    </header>
    <main class="prose">${renderArticle(page)}</main>
    <footer class="footer">
      <span>Darwin · ${TAGLINE}</span>
      <nav aria-label="Footer">${linkRow(FOOTER_LINKS)}</nav>
    </footer>
  </body>
</html>
`;
}

/** The homepage's no-JS content, injected into #root and replaced by React on boot. */
export function renderHomePrerender(): string {
  return `<main class="prerender prose">${renderArticle(HOME)}<nav aria-label="Footer">${linkRow(
    FOOTER_LINKS,
  )}</nav></main>`;
}

// Static copy of src/Logo.tsx (ring, accent core, orbiting node); inline to avoid a request.
const LOGO_SVG = `<span class="logo"><svg viewBox="0 0 28 28" width="26" height="26" fill="none" aria-hidden="true"><circle cx="14" cy="14" r="10" stroke="var(--fg-dim)" stroke-width="1.6"/><circle cx="14" cy="14" r="3.6" fill="var(--accent)"/><g class="logo-orbit"><circle cx="14" cy="4" r="2.1" fill="var(--fg)"/></g></svg></span>`;

// ---------------------------------------------------------------- JSON-LD

/** Stringify for a <script> block: "</" can never close the tag early. */
export const jsonLd = (data: unknown): string => JSON.stringify(data).replace(/</g, "\\u003c");

export const ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: BRAND,
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/favicon.svg`,
  image: `${SITE_URL}/og.png`,
  description: SUMMARY,
  founder: { "@type": "Person", name: "Karthik Subramanian" },
  sameAs: [REPO_URL],
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "technical support",
      email: CONTACT_EMAIL,
      url: ISSUES_URL,
      availableLanguage: "en",
    },
    {
      "@type": "ContactPoint",
      contactType: "security",
      email: CONTACT_EMAIL,
      url: `${SITE_URL}/contact`,
      availableLanguage: "en",
    },
  ],
};

export const SOFTWARE_APPLICATION = {
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/#software`,
  name: BRAND,
  alternateName: `Darwin, ${TAGLINE}`,
  description: SUMMARY,
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "AI agent optimization",
  operatingSystem: "macOS, Linux, Windows",
  url: `${SITE_URL}/`,
  downloadUrl: REPO_URL,
  installUrl: `${SITE_URL}/developers`,
  softwareHelp: `${SITE_URL}/developers`,
  codeRepository: REPO_URL,
  license: "https://opensource.org/license/mit",
  isAccessibleForFree: true,
  image: `${SITE_URL}/og.png`,
  keywords:
    "AI agents, evolutionary algorithms, self-improving AI, LLM routing, LLM evaluation, sandboxing, AI safety",
  author: { "@id": `${SITE_URL}/#organization` },
  publisher: { "@id": `${SITE_URL}/#organization` },
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export function renderJsonLd(page: Page): Record<string, unknown> {
  const webPage = {
    "@type": page === ABOUT ? "AboutPage" : page === CONTACT ? "ContactPage" : "WebPage",
    "@id": `${abs(page.path)}#webpage`,
    url: abs(page.path),
    name: page.title,
    description: page.description,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#software` },
    inLanguage: "en",
  };
  const website = {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: BRAND,
    url: `${SITE_URL}/`,
    description: SUMMARY,
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
  return { "@context": "https://schema.org", "@graph": [website, ORGANIZATION, SOFTWARE_APPLICATION, webPage] };
}

// ---------------------------------------------------------------- llms.txt + sitemap

const llmsLink = (page: Page, note: string): string =>
  `- [${page.h1}](${SITE_URL}${markdownPath(page)}): ${note}`;

/** llms.txt per https://llmstxt.org: H1, blockquote summary, prose, H2 link lists, Optional. */
export function renderLlmsTxt(): string {
  const sectionBody = (s: Section): string => mdSection({ ...s, heading: s.heading }, 2);
  return (
    [
      `# ${BRAND}`,
      `> ${SUMMARY}`,
      "Darwin is self-hosted and open source. There is no hosted API and no signup; agents interact with it through the `darwin` CLI or the local HTTP and WebSocket API described below. Every page on this site is also served as Markdown: request it with `Accept: text/markdown`, or append `.md` (the homepage is /index.md).",
      sectionBody(LLMS_EXTRA.whenToUse),
      sectionBody(LLMS_EXTRA.howToCall),
      "## Docs",
      [
        llmsLink(DEVELOPERS, "quickstart, CLI flags, local API endpoints, configuration keys, offline sandbox mode"),
        llmsLink(HOME, "what Darwin is, how a generation works, and the safety guarantees"),
        llmsLink(LAB, "the Lab: benchmark models per task and export a routing strategy"),
        `- [README](${REPO_URL}#readme): architecture, design decisions, and the full pitch`,
      ].join("\n"),
      "## Company",
      [
        llmsLink(ABOUT, "who builds Darwin and why"),
        llmsLink(CONTACT, "GitHub issues for bugs, email for security reports"),
        llmsLink(PRIVACY, "what this site collects and where run data goes"),
      ].join("\n"),
      "## Optional",
      [
        `- [Source code](${REPO_URL}): Python engine and React dashboard, MIT license`,
        `- [Sitemap](${SITE_URL}/sitemap.xml): every indexable URL`,
      ].join("\n"),
    ].join("\n\n") + "\n"
  );
}

/** sitemap.xml per https://www.sitemaps.org/protocol.html. `lastmod` is a W3C date (YYYY-MM-DD). */
export function renderSitemap(lastmod: string): string {
  const urls = PAGES.filter((pg) => pg.indexable)
    .map(
      (pg) =>
        `  <url>\n    <loc>${abs(pg.path)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${pg.priority.toFixed(1)}</priority>\n  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
