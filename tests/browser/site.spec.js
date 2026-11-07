import { test, expect } from "@playwright/test";
import { hostnameOf } from "../helpers/hostname.js";

async function installMocks(page, { miles = 10, routeMode = "ok" } = {}) {
  const posts = [];
  const milesRequests = [];
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
      posts.push(url);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: "Ok",
          routes: [{ distance: 1609.344 }],
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
      const parsed = new URL(url);
      if (parsed.searchParams.get("action") === "miles") {
        milesRequests.push(url);
        const callback = parsed.searchParams.get("callback") || "callback";
        const payload =
          routeMode === "legacy"
            ? [{ datetime: "2026-12-15T15:00:00.000Z" }]
            : { ok: true, meters: miles * 1609.344 };
        const body = `${callback}(${JSON.stringify(payload)});`;
        await route.fulfill({
          status: 200,
          contentType: "application/javascript; charset=utf-8",
          body,
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
  });
  return { posts, milesRequests };
}

test.describe("booking page", () => {
  test("review button reads Leave a review on Google", async ({ page }) => {
    const { posts } = await installMocks(page);
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
    const { posts } = await installMocks(page, { miles: 10 });
    await page.goto("/");
    await page
      .getByPlaceholder("123 Main Street, Denver NC 28037")
      .fill("123 Main Street, Denver NC 28037");
    await page.getByPlaceholder("CLT Airport").fill("airport");
    await page.locator("#airport-trip-yes").check();
    const quote = page.locator("#quote-details");
    await expect(quote).toContainText("Cash $70.00");
    await expect(quote).toContainText("Card $72.10");
    await expect(quote).not.toContainText("2.75");
    await expect(quote).not.toContainText(/per mile/i);
    expect(posts).toEqual([]);
  });

  test("quotes 7740 Marlette Ln from Google meters, not the old router", async ({
    page,
  }) => {
    const { posts, milesRequests } = await installMocks(page, { miles: 29 });
    await page.goto("/");
    await page
      .getByPlaceholder("123 Main Street, Denver NC 28037")
      .fill("7740 Marlette Ln, Sherrills Ford, NC 28673");
    await page.getByPlaceholder("CLT Airport").fill("CLT");
    await page.locator("#airport-trip-yes").check();
    const quote = page.locator("#quote-details");
    await expect(quote).toContainText("Cash $79.75");
    await expect(quote).toContainText("Card $82.14");
    await expect(quote).toContainText(
      "One way to Charlotte Douglas Airport (CLT)",
    );
    await expect(quote).not.toContainText("29");
    await expect(quote).not.toContainText("2.75");
    const asked = milesRequests.map((url) => new URL(url).searchParams);
    expect(asked.some((params) => params.get("action") === "miles")).toBe(true);
    expect(
      asked.some(
        (params) =>
          params.get("origin") === "7740 Marlette Ln, Sherrills Ford, NC 28673",
      ),
    ).toBe(true);
    expect(asked.some((params) => params.get("airport") === "CLT")).toBe(true);
    expect(posts).toEqual([]);
  });

  test("does not show a cheaper fare when Google distance is unavailable", async ({
    page,
  }) => {
    const { posts } = await installMocks(page, {
      miles: 10,
      routeMode: "legacy",
    });
    await page.goto("/");
    await page
      .getByPlaceholder("123 Main Street, Denver NC 28037")
      .fill("7740 Marlette Ln, Sherrills Ford, NC 28673");
    await page.getByPlaceholder("CLT Airport").fill("CLT");
    await page.locator("#airport-trip-yes").check();
    const quote = page.locator("#quote-details");
    await expect(quote).toHaveText("We'll confirm your price when we call.");
    await expect(quote).not.toContainText("$");
    expect(posts).toEqual([]);
  });

  test("group event yes shows the call link and disables submit", async ({
    page,
  }) => {
    const { posts } = await installMocks(page);
    await page.goto("/");
    await page.locator("#group-event-yes").check();
    const call = page.locator("#group-event-call");
    await expect(call).toBeVisible();
    await expect(
      call.getByRole("link", { name: "(980) 422-9125" }),
    ).toHaveAttribute("href", "tel:+19804229125");
    await expect(
      page.getByRole("button", { name: /request booking/i }),
    ).toBeDisabled();
    await expect(page.locator("#booking-quote")).toBeHidden();
    expect(posts).toEqual([]);
  });

  test("refuses a Charlotte pickup and does not create a request", async ({
    page,
  }) => {
    const { posts } = await installMocks(page);
    await page.goto("/");
    await page.locator("#booking-name").fill("TEST, DO NOT BOOK");
    await page.locator("#booking-phone").fill("9804229125");
    await page.locator("#booking-passengers").fill("2");
    await page.locator("#booking-pickup").fill("8109 pike road charlotte");
    await page.locator("#booking-destination").fill("Suya king restaurant");
    await page.locator("#airport-trip-no").check();
    await page.locator("#group-event-no").check();
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
