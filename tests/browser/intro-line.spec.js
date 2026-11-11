import { test, expect } from "@playwright/test";

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

function measure(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const line = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        width: Math.round(r.width),
        thickness: s.borderTopWidth,
        color: s.borderTopColor,
        left: Math.round(r.left),
        right: Math.round(vw - r.right),
      };
    };
    const intro = document.querySelector(".intro-text .skills");
    const box = intro.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(intro);
    const rects = [...range.getClientRects()];
    const textLeft = Math.min(...rects.map((r) => r.left));
    const textRight = Math.max(...rects.map((r) => r.right));
    const others = [
      ...document.querySelectorAll(
        "section hr.star-primary, section hr.star-light",
      ),
    ]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map(line);
    return {
      heroLine: line(document.querySelector("header.hero hr.star-light")),
      others,
      intro: {
        boxLeft: Math.round(box.left),
        boxRight: Math.round(vw - box.right),
        textLeft,
        textRight: vw - textRight,
      },
    };
  });
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
