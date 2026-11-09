import { test, expect } from "@playwright/test";
import { hostnameOf } from "../helpers/hostname.js";

async function answerBags(page) {
  await page.locator("#booking-checking-bags-no").check();
  await page.locator("#booking-bag-count").fill("0");
}

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
    const icon = page.getByRole("link", { name: "Google reviews" });
    await expect(icon).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=Midnight+Express+LKN&query_place_id=ChIJKxRQ8TeXoyIR7zVHfWBTVf4",
    );
    await expect(icon).toHaveAttribute("target", "_blank");
    await expect(icon).toHaveAttribute("rel", "noopener");
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
    await expect(page.locator("#checking-bags-section")).toBeHidden();
    await expect(page.locator("#booking-flight")).toBeHidden();
    await expect(page.locator("#booking-round-trip")).toBeHidden();
    await expect(page.locator("#booking-wheelchair")).toBeHidden();
    await expect(page.locator("#booking-carseat")).toBeHidden();
    await expect(page.locator("#notes-label")).toHaveText("Trip Description");
    await expect(page.locator("#booking-destination")).toHaveAttribute(
      "placeholder",
      "Bank of America Stadium",
    );
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

  test("blank airport error is readable on a phone", async ({ page }) => {
    const posts = await installMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#booking");
    await page.locator("#trip-type").selectOption("airport");
    await page.locator("#booking-name").fill("Jame test");
    await page.locator("#booking-phone").fill("9804229125");
    await page.locator("#booking-passengers").fill("2");
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
    await page.locator("#airport-choice").selectOption("");
    await page.locator("#bookingForm button[type=submit]").click();
    const line = page
      .locator("#booking-success .alert li")
      .filter({ hasText: "Please choose an airport" });
    await expect(line).toHaveText("Please choose an airport");
    const color = await line.evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe("rgb(255, 255, 255)");
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
    await answerBags(page);
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
    await answerBags(page);
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
    await expect(page.locator("#trip-type-group")).toBeHidden();
    await expect(page.locator("#booking")).toBeVisible();
    await expect(page.locator("#destination-label")).toHaveText(
      "Drop-off / venue *",
    );
    await expect(page.locator("#booking-quote")).toBeHidden();
  });

  test("about section is one short paragraph", async ({ page }) => {
    await installMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const copy = page.locator("#about-us .about-text");
    await expect(copy).toHaveCount(1);
    await expect(copy).toHaveText(
      "Midnight Express LKN is a family-owned airport shuttle service based in Sherrills Ford and Denver, NC. We run reliable, pre-booked rides to and from Charlotte Douglas, Concord Regional, and nearby private airfields. Our licensed, insured drivers track your flight, so we're there when you land — on time, every time. We also do safe group and bar rides for weddings, parties, and nights out.",
    );
    await expect(copy).toHaveCSS("font-size", "18px");
    await expect(copy).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(page.locator("#about-us h2")).toHaveText(
      "Serving the Denver and Sherrills Ford Side of Lake Norman NC",
    );
    const call = page.locator("#about-us .about-cta");
    await expect(call).toHaveText("Call us today at (980) 422-9125");
    await expect(call.locator("a")).toHaveAttribute("href", "tel:+19804229125");
    await expect(page.locator("#why-choose-us")).not.toContainText(
      "Iron Station",
    );
    await expect(page.locator("#why-choose-us .fa-check")).toHaveCount(7);
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

  test("a listed airport is priced from the single airport menu", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 12 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("airport");
    await expect(page.locator("#address-label")).toHaveText("Home address *");
    await expect(page.locator("#airport-choice")).toBeVisible();
    await expect(page.locator("#airfield-choice")).toHaveCount(0);
    await expect(page.locator("#booking-destination")).toBeHidden();
    const tripBox = await page.locator("#trip-type").boundingBox();
    const airportBox = await page.locator("#airport-choice").boundingBox();
    expect(airportBox.y).toBeGreaterThan(tripBox.y);
    await expect(page.locator("#airport-choice option")).toHaveText([
      "Select an airport",
      "Charlotte Douglas International (CLT)",
      "Concord-Padgett Regional (JQF)",
      "Lincolnton (KIPJ)",
      "Charlotte private jets (Wilson/Signature, Modern Aviation)",
      "Concord private jets",
      "Charlotte-Monroe Executive (EQY)",
      "Wilgrove Air Park (8A6)",
      "Little Mountain (Airport Rd, Maiden)",
    ]);
    await page.locator("#airport-choice").selectOption("KIPJ");
    await expect(page.locator("#booking-destination")).toHaveValue("KIPJ");
    await page
      .getByPlaceholder("123 Main Street, Denver NC 28037")
      .fill("123 Main Street, Denver NC 28037");
    await expect(page.locator("#quote-details")).toContainText("Lincolnton");
    await expect(page.locator("#quote-details")).toContainText("Cash");
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
    await answerBags(page);
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
    await expect(page.locator("#airfield-choice")).toHaveCount(0);
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
