import { expect, test } from "@playwright/test";

// The "Skip to content" link must be wholly off-screen until a keyboard user reaches it, then
// wholly on-screen. Each page family has its own stylesheet, so check one page of each.
const PAGES = [
  { name: "landing", path: "/" },
  { name: "the Lab", path: "/app.html" },
  { name: "about", path: "/about.html" },
  { name: "developers", path: "/developers.html" },
  { name: "not found", path: "/404.html" },
];

for (const { name, path } of PAGES) {
  test(`skip link on ${name} stays hidden until focused, then shows in full`, async ({ page }) => {
    await page.goto(path);
    const link = page.locator(".skip-link").first();
    await expect(link).toHaveText("Skip to content");

    // Not even a sliver of it may peek into the viewport.
    await expect(link).not.toBeInViewport();
    const parked = await link.boundingBox();
    expect(parked, "skip link has a layout box").not.toBeNull();
    expect(parked!.y + parked!.height).toBeLessThanOrEqual(0);

    // The first Tab lands on it and brings the whole link into view.
    await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    await expect(link).toBeVisible();
    await expect(link).toBeInViewport({ ratio: 1 });
    const shown = await link.boundingBox();
    expect(shown!.y).toBeGreaterThanOrEqual(0);
    expect(shown!.height).toBeGreaterThan(20);

    // Leaving it parks it off-screen again.
    await page.keyboard.press("Tab");
    await expect(link).not.toBeFocused();
    await expect(link).not.toBeInViewport();
  });
}
