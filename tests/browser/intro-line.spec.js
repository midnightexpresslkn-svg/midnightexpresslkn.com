import { test, expect } from "./helpers/booking-mocks.js";

const sizes = [
  { name: "phone 375", width: 375, height: 812 },
  { name: "phone 390", width: 390, height: 844 },
  { name: "desktop", width: 1366, height: 900 },
];

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

// Pixel measurements on user-facing handles: the red lines are separators, the intro is its text.
const lineStyle = (el) => {
  const vw = document.documentElement.clientWidth;
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return {
    width: Math.round(r.width),
    thickness: s.borderTopWidth,
    color: s.borderTopColor,
    left: Math.round(r.left),
    right: Math.round(vw - r.right),
    top: Math.round(r.top + window.scrollY),
  };
};

async function measure(page) {
  const banner = page.getByRole("banner");
  const heroSeparator = banner.getByRole("separator");
  await expect(heroSeparator).toHaveCount(1);
  const heroLine = await heroSeparator.evaluate(lineStyle);
  // Every visible separator on the page; the hero's comes first, then one under each section title.
  const all = [];
  for (const separator of await page.getByRole("separator").all()) {
    all.push(await separator.evaluate(lineStyle));
  }
  expect(all[0], "the hero line is the first separator").toEqual(heroLine);
  const intro = await banner
    .getByText("Lake Norman's top-rated, family-owned airport transportation")
    .evaluate((el) => {
      const vw = document.documentElement.clientWidth;
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()];
      const textLeft = Math.min(...rects.map((r) => r.left));
      const textRight = Math.max(...rects.map((r) => r.right));
      return {
        boxLeft: Math.round(box.left),
        boxRight: Math.round(vw - box.right),
        textLeft,
        textRight: vw - textRight,
      };
    });
  return {
    heroLine,
    others: all.slice(1).filter((line) => line.width > 0),
    intro,
  };
}

test.describe("hero intro line and paragraph", () => {
  for (const size of sizes) {
    test(`${size.name}: the red line matches the section lines and the paragraph is centered`, async ({
      page,
    }) => {
      await quiet(page);
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/");
      await page.evaluate(() => document.fonts && document.fonts.ready);
      const m = await measure(page);
      expect(m.others.length, JSON.stringify(m)).toBeGreaterThan(2);
      for (const other of m.others) {
        expect(m.heroLine.width, JSON.stringify(m)).toBe(other.width);
        expect(m.heroLine.thickness, JSON.stringify(m)).toBe(other.thickness);
        expect(m.heroLine.color, JSON.stringify(m)).toBe(other.color);
      }
      expect(m.heroLine.width).toBe(250);
      expect(m.heroLine.thickness).toBe("5px");
      expect(Math.abs(m.heroLine.left - m.heroLine.right)).toBeLessThanOrEqual(
        1,
      );
      expect(m.intro.boxLeft, JSON.stringify(m)).toBe(m.intro.boxRight);
      expect(
        Math.abs(m.intro.textLeft - m.intro.textRight),
        JSON.stringify(m),
      ).toBeLessThanOrEqual(1);
    });
  }
});
