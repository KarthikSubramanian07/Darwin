import { describe, expect, it } from "vitest";
import { addVary, isDocumentPath, markdownPathFor, negotiate, parseAccept } from "./negotiate";

const CHROME = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";

describe("negotiate", () => {
  it.each([
    [null, "html"],
    ["", "html"],
    ["*/*", "html"],
    [CHROME, "html"],
    ["text/html", "html"],
    ["text/markdown", "markdown"],
    ["text/x-markdown", "markdown"],
    ["text/markdown, text/html", "markdown"],
    ["text/html, text/markdown", "html"],
    ["text/markdown;q=0.9, text/html", "html"],
    ["text/html;q=0.5, text/markdown", "markdown"],
    ["text/markdown, */*;q=0.1", "markdown"],
    ["text/*", "html"],
    ["application/json", "none"],
    ["text/html;q=0, text/markdown;q=0", "none"],
    ["image/png, */*;q=0", "none"],
  ] as const)("Accept %j -> %s", (accept, expected) => {
    expect(negotiate(accept)).toBe(expected);
  });

  it("parses q-values and clamps garbage", () => {
    expect(parseAccept("text/markdown;q=0.4, text/html;q=7, a/b;q=x")).toEqual([
      { type: "text", subtype: "markdown", q: 0.4, index: 0 },
      { type: "text", subtype: "html", q: 1, index: 1 },
      { type: "a", subtype: "b", q: 1, index: 2 },
    ]);
  });
});

describe("markdownPathFor", () => {
  it.each([
    ["/", "/index.md"],
    ["/index.html", "/index.md"],
    ["/about", "/about.md"],
    ["/about/", "/about.md"],
    ["/about.html", "/about.md"],
    ["/developers", "/developers.md"],
    ["/app", "/app.md"],
    ["/nope/deeper", "/nope/deeper.md"],
    ["/og.png", null],
    ["/llms.txt", null],
    ["/assets/main.js", null],
  ])("%s -> %s", (path, md) => {
    expect(markdownPathFor(path)).toBe(md);
    expect(isDocumentPath(path)).toBe(md !== null);
  });
});

describe("addVary", () => {
  it("adds Accept once", () => {
    expect(addVary(null, "Accept")).toBe("Accept");
    expect(addVary("Accept-Encoding", "Accept")).toBe("Accept-Encoding, Accept");
    expect(addVary("accept", "Accept")).toBe("accept");
    expect(addVary("*", "Accept")).toBe("*");
  });
});
