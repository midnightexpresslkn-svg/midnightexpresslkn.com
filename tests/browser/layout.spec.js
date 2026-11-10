import { test, expect } from "@playwright/test";

const widths = [375, 390];

async function quiet(page) {
  await page.route("**/*", async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === "127.0.0.1" || host === "localhost") {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
  });
}

async function offenders(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const found = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const raw = walker.currentNode.textContent || "";
      if (!raw.trim()) continue;
      const parent = walker.currentNode.parentElement;
      if (!parent || parent.closest("script, style, [hidden], .sr-only"))
        continue;
      const cs = getComputedStyle(parent);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      for (const rect of range.getClientRects()) {
        if (rect.width < 1 || rect.height < 1) continue;
        if (rect.left < -1 || rect.right > vw + 1) {
          found.push({
            text: raw.trim().slice(0, 48),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            tag: parent.tagName,
          });
        }
      }
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: vw,
      found: found.slice(0, 8),
      count: found.length,
    };
  });
}

test.describe("mobile page fits the screen", () => {
  for (const width of widths) {
    test(`no text escapes and the page is not wider than ${width}px`, async ({
      page,
    }) => {
      await quiet(page);
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      await page.evaluate(() => document.fonts && document.fonts.ready);
      const home = await offenders(page);
      expect(home.scrollWidth, JSON.stringify(home)).toBeLessThanOrEqual(
        home.clientWidth + 1,
      );
      expect(home.found, JSON.stringify(home)).toEqual([]);

      const brand = page.locator(".navbar-brand");
      const toggle = page.locator(".navbar-toggle");
      const brandBox = await brand.boundingBox();
      const toggleBox = await toggle.boundingBox();
      expect(brandBox.x).toBeGreaterThanOrEqual(0);
      expect(brandBox.x + brandBox.width).toBeLessThanOrEqual(width + 1);
      expect(brandBox.x + brandBox.width).toBeLessThanOrEqual(toggleBox.x + 1);
      const logo = page.locator(".navbar-logo");
      const logoBox = await logo.boundingBox();
      expect(logoBox.x).toBeGreaterThanOrEqual(0);
      expect(logoBox.width).toBeGreaterThan(20);

      await page.locator("#trip-type").selectOption("airport");
      const form = await offenders(page);
      expect(form.scrollWidth).toBeLessThanOrEqual(form.clientWidth + 1);
      expect(form.found).toEqual([]);
      await page.locator("#airport-choice").selectOption("PRIVATE");
      const airfield = await offenders(page);
      expect(airfield.scrollWidth).toBeLessThanOrEqual(
        airfield.clientWidth + 1,
      );
      expect(airfield.found).toEqual([]);
    });
  }
});
