import { test, expect } from "@playwright/test";

async function installMocks(page, { miles = 10 } = {}) {
  const posts = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    if (
      url.startsWith("http://127.0.0.1") ||
      url.startsWith("http://localhost")
    ) {
      await route.continue();
      return;
    }
    if (
      method === "POST" &&
      /script\.google\.com|docs\.google\.com|google\.com\/forms/.test(url)
    ) {
      posts.push(url);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (url.includes("geocoding.geo.census.gov")) {
      const callback = new URL(url).searchParams.get("callback") || "callback";
      const data = {
        result: {
          addressMatches: [
            {
              coordinates: { x: -81.03, y: 35.53 },
              addressComponents: { city: "Denver", zip: "28037" },
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
    if (url.includes("router.project-osrm.org")) {
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
    if (url.includes("nominatim.openstreetmap.org")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }
    if (url.includes("script.google.com")) {
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

  test("group event yes shows the call link and disables submit", async ({
    page,
  }) => {
    const posts = await installMocks(page);
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
