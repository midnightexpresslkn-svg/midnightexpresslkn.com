import { test, expect } from "@playwright/test";

// Donald, Nov 10, 2026 6:57 PM: the three required boxes show the same required star as the other required fields,
// on the bar ride form and on the group event form.
const RULES = [
  ["#rule-age", "Must be 21 or older *"],
  ["#rule-smoke", "No smoking *"],
  ["#rule-damage", "If you damage anything, you are responsible. *"],
];

async function blockNetwork(page) {
  await page.route("**/*", async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === "127.0.0.1" || host === "localhost") return route.continue();
    return route.fulfill({ status: 200, contentType: "text/plain", body: "" });
  });
}

async function expectStars(page) {
  await expect(page.locator("#ride-rules")).toBeVisible();
  for (const [id, text] of RULES) {
    const label = page.locator(".ride-rule", { has: page.locator(id) });
    await expect(label).toBeVisible();
    await expect(label).toHaveText(text);
    await expect(page.getByLabel(text)).toHaveAttribute("type", "checkbox");
  }
  // same marker as the other required labels, e.g. "Trip type *"
  await expect(page.locator('label[for="trip-type"]')).toHaveText(/ \*$/);
}

test("bar ride form shows the required star on all three boxes", async ({
  page,
}) => {
  await blockNetwork(page);
  await page.goto("/");
  await page.locator("#trip-type").selectOption("local");
  await page.locator("#local-kind").selectOption("bar");
  await expectStars(page);
});

test("group event form shows the required star on all three boxes", async ({
  page,
}) => {
  await blockNetwork(page);
  await page.goto("/");
  await page.locator("#trip-type").selectOption("group");
  await expectStars(page);
});
