import { test, expect } from "@playwright/test";
import { hostnameOf } from "../helpers/hostname.js";

async function installMocks(page, { miles = 10, bookings = [] } = {}) {
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
        body: JSON.stringify(bookings),
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
    await page.locator("#airport-choice").selectOption("CLT");
    await page
      .getByPlaceholder("123 Main Street, Denver NC 28037")
      .fill("123 Main Street, Denver NC 28037");
    const quote = page.locator("#quote-details");
    await expect(quote).toContainText("Cash $65.00");
    await expect(quote).toContainText("Card $65.00");
    await expect(quote).not.toContainText("2.75");
    await expect(quote).not.toContainText(/per mile/i);
    expect(posts).toEqual([]);
  });

  test("group trip hides the fare and stays submittable", async ({ page }) => {
    const posts = await installMocks(page);
    await page.goto("/");
    await page.locator("#trip-type").selectOption("group");
    await expect(page.locator("#group-pricing-note")).toHaveCount(0);
    await expect(page.locator("#booking-quote")).toBeHidden();
    await expect(page.locator("#destination-label")).toHaveText(
      "Drop-off / venue *",
    );
    await expect(page.locator("#booking-checking-bags")).toBeVisible();
    await expect(page.locator("#booking-flight")).toBeVisible();
    await expect(page.locator("#booking-round-trip")).toBeVisible();
    await expect(page.locator("#booking-notes")).toBeVisible();
    const visible = await page.locator("#bookingForm").innerText();
    expect(visible).not.toMatch(/price|pricing|fare|\$\d/i);
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
    await page.locator("#booking-pickup").fill("8109 pike road charlotte");
    await page
      .locator("#booking-destination")
      .fill("200 Oak St, Sherrills Ford NC");
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

  test("accepts one overlapping ride and refuses the third", async ({
    page,
  }) => {
    const at = new Date(2026, 11, 15, 10, 0, 0, 0).toISOString();
    const posts = await installMocks(page, {
      bookings: [{ datetime: at }],
    });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("airport");
    await page.locator("#booking-name").fill("TEST, DO NOT BOOK");
    await page.locator("#booking-phone").fill("9804229125");
    await page.locator("#booking-passengers").fill("2");
    await page.locator("#airport-choice").selectOption("CLT");
    await page
      .getByPlaceholder("123 Main Street, Denver NC 28037")
      .fill("123 Main Street, Denver NC 28037");
    await page.locator("#booking-date").evaluate((el) => {
      el._flatpickr.setDate("2026-12-15", true);
      el.value = "2026-12-15";
    });
    await page.locator("#booking-time").evaluate((el) => {
      el._flatpickr.setDate("10:00:00", true);
      el.value = "10:00:00";
    });
    await page.locator("#bookingForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#booking-success")).toContainText(
      "Request received",
    );
    expect(posts.length).toBeGreaterThan(0);
  });

  test("refuses a third ride when both drivers are already busy", async ({
    page,
  }) => {
    const at = new Date(2026, 11, 15, 10, 0, 0, 0).toISOString();
    const posts = await installMocks(page, {
      bookings: [{ datetime: at }, { datetime: at }],
    });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("airport");
    await page.locator("#booking-name").fill("TEST, DO NOT BOOK");
    await page.locator("#booking-phone").fill("9804229125");
    await page.locator("#booking-passengers").fill("2");
    await page.locator("#airport-choice").selectOption("CLT");
    await page
      .getByPlaceholder("123 Main Street, Denver NC 28037")
      .fill("123 Main Street, Denver NC 28037");
    await page.locator("#booking-date").evaluate((el) => {
      el._flatpickr.setDate("2026-12-15", true);
      el.value = "2026-12-15";
    });
    await page.locator("#booking-time").evaluate((el) => {
      el._flatpickr.setDate("10:00:00", true);
      el.value = "10:00:00";
    });
    await page.locator("#bookingForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#booking-success")).toContainText(
      "That time is booked",
    );
    expect(posts).toEqual([]);
  });

  test("home page opens the group form with group selected", async ({
    page,
  }) => {
    await installMocks(page);
    await page.goto("/");
    const link = page.locator("#book-group-ride");
    await expect(link).toHaveText("Book a Group Ride");
    await expect(link).toHaveAttribute("href", "/?type=group#booking");
    await page.goto("/?type=group#booking");
    await expect(page.locator("#trip-type")).toHaveValue("group");
    await expect(page.locator("#booking")).toBeVisible();
    await expect(page.locator("#destination-label")).toHaveText(
      "Drop-off / venue *",
    );
    await expect(page.locator("#booking-quote")).toBeHidden();
  });

  test("about section links a group ride with no price", async ({ page }) => {
    await installMocks(page);
    await page.goto("/");
    const sentence = page.locator("#about-us .about-text").last();
    await expect(sentence).toHaveText(
      "We also provide safe, reliable group and bar transportation for weddings, parties, special events, and nights out, and you can book a group ride online in minutes.",
    );
    await expect(sentence.getByRole("link")).toHaveAttribute(
      "href",
      "/?type=group#booking",
    );
    await expect(sentence.getByRole("link")).toHaveText("book a group ride");
    await expect(sentence).not.toContainText(/\$|price|fare/i);
    await expect(sentence.locator("xpath=following-sibling::p[1]")).toHaveClass(
      /about-cta/,
    );
  });

  test("iPhone shows how to add the booking page to the home screen", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await installMocks(page);
    await page.goto("/#booking");
    await expect(page.locator("#add-home-ios")).toBeVisible();
    await expect(page.locator("#add-home-ios")).toHaveText(
      "Tap Share, then Add to Home Screen",
    );
    await expect(page.locator("#add-home-button")).toBeHidden();
    await context.close();
  });

  test("Android shows Add to Home Screen when the browser offers it", async ({
    page,
  }) => {
    await installMocks(page);
    await page.goto("/#booking");
    await expect(page.locator("#add-home-tip")).toBeHidden();
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      event.prompt = () => Promise.resolve();
      window.dispatchEvent(event);
    });
    await expect(page.locator("#add-home-button")).toBeVisible();
    await expect(page.locator("#add-home-button")).toHaveText(
      "Add to Home Screen",
    );
  });

  test("known airfield is priced and an other private airfield still books", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 12 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("airport");
    await expect(page.locator("#address-label")).toHaveText("Home address *");
    await expect(page.locator("#airport-choice")).toBeVisible();
    await expect(page.locator("#airfield-choice")).toBeVisible();
    await expect(page.locator("#booking-destination")).toBeHidden();
    const tripBox = await page.locator("#trip-type").boundingBox();
    const airfieldBox = await page.locator("#airfield-choice").boundingBox();
    const airportBox = await page.locator("#airport-choice").boundingBox();
    expect(airfieldBox.y).toBeGreaterThan(tripBox.y);
    expect(airfieldBox.y).toBeLessThan(airportBox.y);
    await expect(page.locator("#airport-choice option")).toHaveText([
      "Select an airport",
      "CLT main terminal",
      "Concord passenger terminal",
    ]);
    await expect(page.locator("#airfield-choice option")).toHaveText([
      "Select a private airfield",
      "Charlotte private (Wilson/Signature)",
      "Concord private FBO",
      "Lincolnton KIPJ",
      "Salisbury KRUQ",
      "Hickory KHKY",
      "Little Mountain (Airport Rd, Maiden)",
      "Other private airfield",
    ]);
    await page.locator("#airfield-choice").selectOption("KHKY");
    await expect(page.locator("#airport-choice")).toHaveValue("");
    await expect(page.locator("#booking-destination")).toHaveValue("KHKY");
    await page
      .getByPlaceholder("123 Main Street, Denver NC 28037")
      .fill("123 Main Street, Denver NC 28037");
    await expect(page.locator("#quote-details")).toContainText(
      "Hickory Regional",
    );
    await expect(page.locator("#quote-details")).toContainText("Cash");
    await page.locator("#airfield-choice").selectOption("other");
    await expect(page.locator("#airport-choice")).toHaveValue("");
    await page
      .getByPlaceholder("Name the private airfield")
      .fill("Smith Field, Charlotte NC");
    await expect(page.locator("#quote-details")).toContainText(
      "We'll confirm your price when we call.",
    );
    await page.locator("#booking-name").fill("TEST, DO NOT BOOK");
    await page.locator("#booking-phone").fill("9804229125");
    await page.locator("#booking-passengers").fill("2");
    await page.locator("#booking-date").evaluate((el) => {
      el._flatpickr.setDate("2026-12-15", true);
      el.value = "2026-12-15";
    });
    await page.locator("#booking-time").evaluate((el) => {
      el._flatpickr.setDate("10:00:00", true);
      el.value = "10:00:00";
    });
    await page.locator("#bookingForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#booking-success")).toContainText(
      "Request received",
    );
    await expect(page.locator("#booking-success")).not.toContainText(
      "don't service",
    );
    expect(posts.length).toBeGreaterThan(0);
  });

  test("group form still has no airport price", async ({ page }) => {
    await installMocks(page);
    await page.goto("/");
    await page.locator("#trip-type").selectOption("group");
    await expect(page.locator("#address-label")).toHaveText("Pickup Address *");
    await expect(page.locator("#destination-label")).toHaveText(
      "Drop-off / venue *",
    );
    await expect(page.locator("#airport-choice-row")).toBeHidden();
    await expect(page.locator("#airfield-choice-row")).toBeHidden();
    await expect(page.locator("#booking-quote")).toBeHidden();
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
