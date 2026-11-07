import { test, expect } from "@playwright/test";
import { hostnameOf } from "../helpers/hostname.js";

async function installMocks(page, { miles = 10 } = {}) {
  const posts = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    const host = hostnameOf(url);
    const method = request.method();
    if (host === "127.0.0.1" || host === "localhost") {
      await route.continue();
      return;
    }
    if (
      method === "POST" &&
      (host === "script.google.com" || host === "docs.google.com")
    ) {
      posts.push(url);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (host === "geocoding.geo.census.gov") {
      const callback = new URL(url).searchParams.get("callback") || "callback";
      const data = {
        result: {
          addressMatches: [
            {
              coordinates: { x: -81.03, y: 35.53 },
              addressComponents: { city: "Denver", state: "NC", zip: "28037" },
            },
          ],
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/javascript; charset=utf-8",
        body: `${callback}(${JSON.stringify(data)});`,
      });
      return;
    }
    if (host === "router.project-osrm.org") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: "Ok",
          routes: [{ distance: miles * 1609.344 }],
        }),
      });
      return;
    }
    if (host === "nominatim.openstreetmap.org") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }
    if (host === "script.google.com") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
  });
  return posts;
}

test.describe("booking page", () => {
  test("review button reads Leave a review on Google", async ({ page }) => {
    const posts = await installMocks(page);
    await page.goto("/");
    const link = page.getByRole("link", { name: "Leave a review on Google" });
    await expect(link).toHaveText(/Leave a review on Google/);
    await expect(link).toHaveAttribute(
      "href",
      "https://g.page/r/Ce81R31gU1X-ECA/review",
    );
    expect(posts).toEqual([]);
  });

  test("shows cash and card totals without a per-mile rate", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 10 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("airport");
    await page
      .getByPlaceholder("123 Main Street, Denver NC 28037")
      .fill("123 Main Street, Denver NC 28037");
    await page.getByPlaceholder("CLT Airport").fill("airport");
    const quote = page.locator("#quote-details");
    await expect(quote).toContainText("Cash $70.00");
    await expect(quote).toContainText("Card $72.10");
    await expect(quote).not.toContainText("2.75");
    await expect(quote).not.toContainText(/per mile/i);
    expect(posts).toEqual([]);
  });

  test("group trip hides the fare and stays submittable", async ({ page }) => {
    const posts = await installMocks(page);
    await page.goto("/");
    await page.locator("#trip-type").selectOption("group");
    await expect(page.locator("#group-call-note")).toBeVisible();
    await expect(page.locator("#group-call-note")).not.toContainText("$");
    await expect(page.locator("#booking-quote")).toBeHidden();
    await expect(
      page.getByRole("button", { name: /request booking/i }),
    ).toBeEnabled();
    expect(posts).toEqual([]);
  });

  test("refuses a Charlotte pickup and does not create a request", async ({
    page,
  }) => {
    const posts = await installMocks(page);
    await page.goto("/");
    await page.locator("#trip-type").selectOption("group");
    await page.locator("#booking-name").fill("TEST, DO NOT BOOK");
    await page.locator("#booking-phone").fill("9804229125");
    await page.locator("#booking-passengers").fill("2");
    await page.locator("#booking-pickup").fill("100 Main St, Denver NC");
    await page.locator("#group-pickup").fill("8109 pike road charlotte");
    await page.locator("#group-dropoff").fill("200 Oak St, Sherrills Ford NC");
    await page.locator("#group-description").fill("party");
    await page.locator("#group-hours").fill("2");
    await page.locator("#booking-date").evaluate((el) => {
      el._flatpickr.setDate("2026-12-15", true);
      el.value = "2026-12-15";
    });
    await page.locator("#booking-time").evaluate((el) => {
      el._flatpickr.setDate("10:00:00", true);
      el.value = "10:00:00";
    });
    await page.locator("#bookingForm").evaluate((form) => form.requestSubmit());
    const result = page.locator("#booking-success");
    await expect(result).toHaveText("Sorry, we don't service that area.");
    await expect(result).not.toContainText("980");
    await expect(result).not.toContainText(/call/i);
    expect(posts).toEqual([]);
  });

  test("manifest start url opens the booking section", async ({ page }) => {
    await installMocks(page);
    const response = await page.goto("/manifest.webmanifest");
    expect(response.ok()).toBeTruthy();
    const manifest = await response.json();
    expect(manifest.start_url).toContain("#booking");
    await page.goto(manifest.start_url);
    await expect(page.locator("#booking")).toBeVisible();
    await expect(page).toHaveURL(/#booking/);
  });
});
