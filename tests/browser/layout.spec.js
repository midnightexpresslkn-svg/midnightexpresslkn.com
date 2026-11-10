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

      await page.locator("#trip-type").selectOption("local");
      await page.locator("#local-kind").selectOption("bar");
      const kindBox = await page.locator("#local-kind").boundingBox();
      const barBox = await page.locator("#bar-choice").boundingBox();
      expect(barBox.y).toBeGreaterThan(kindBox.y);
      await expect(page.locator("#ride-map-slot")).toBeHidden();
      await expect(page.locator("#rule-age")).toBeVisible();
      await expect(page.locator("#ride-rules")).toContainText("No smoking");
      await expect(page.locator("#ride-rules")).toContainText(
        "If you damage anything, you are responsible.",
      );
      const local = await offenders(page);
      expect(local.scrollWidth).toBeLessThanOrEqual(local.clientWidth + 1);
      expect(local.found).toEqual([]);
      await page.locator("#local-kind").selectOption("party");
      await expect(page.locator("#party-address")).toBeVisible();
      const party = await offenders(page);
      expect(party.found).toEqual([]);

      await page.locator("#trip-type").selectOption("group");
      await expect(page.locator("#group-vehicle")).toBeVisible();
      await expect(page.locator("#group-hours")).toBeVisible();
      await page.locator("#group-hours").fill("1");
      await page.locator("#group-hours").blur();
      await expect(page.locator("#quote-details")).toContainText(
        "2-hour minimum",
      );
      await expect(page.locator("#quote-details")).toContainText("$250.00");
      await expect(page.locator("#quote-details")).toContainText("$64.38");
      const group = await offenders(page);
      expect(group.scrollWidth).toBeLessThanOrEqual(group.clientWidth + 1);
      expect(group.found).toEqual([]);
    });
  }
});
