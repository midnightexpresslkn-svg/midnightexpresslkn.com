import { test, expect } from "@playwright/test";
import { hostnameOf } from "../helpers/hostname.js";

async function answerBags(page) {
  await page.locator("#booking-checking-bags-no").check();
  await page.locator("#booking-bag-count").fill("0");
}

async function answerRoundTrip(page, value = "No") {
  const section = page.locator("#round-trip-section");
  if (!(await section.isVisible())) return;
  const id = value === "Yes" ? "#booking-round-trip" : "#booking-round-trip-no";
  await page.locator(id).check();
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
    await expect(quote).toContainText("Card $66.95");
    await expect(quote).not.toContainText("2.75");
    await expect(quote).not.toContainText("2.63");
    await expect(quote).not.toContainText(/per mile/i);
    expect(posts).toEqual([]);
  });

  test("airport cash rounds to the nearest $5 and card is exactly 3 percent more", async ({
    page,
  }) => {
    // 30 miles * $2.63 = $78.90 -> $80 cash; card $82.40. Nothing is submitted.
    const posts = await installMocks(page, { miles: 30 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("airport");
    await page.locator("#airport-choice").selectOption("CLT");
    await page
      .getByPlaceholder("123 Main Street, Denver NC 28037")
      .fill("123 Main Street, Denver NC 28037");
    const quote = page.locator("#quote-details");
    await expect(quote).toContainText("Cash $80.00");
    await expect(quote).toContainText("Card $82.40");
    await expect(quote).not.toContainText("78.90");
    expect(posts).toEqual([]);
  });

  test("group trip hides the fare and stays submittable", async ({ page }) => {
    const posts = await installMocks(page);
    await page.goto("/");
    await page.locator("#trip-type").selectOption("group");
    await expect(page.locator("#group-pricing-note")).toHaveCount(0);
    await expect(page.locator("#booking-quote")).toBeVisible();
    await expect(page.locator("#group-vehicle")).toContainText(
      "2026 Toyota Sienna Platinum",
    );
    await expect(page.locator("#booking-destination")).toBeHidden();
    await expect(page.locator("#checking-bags-section")).toBeHidden();
    await expect(page.locator("#booking-flight")).toBeHidden();
    await expect(page.locator("#booking-round-trip")).toBeHidden();
    await expect(page.locator("#booking-wheelchair")).toBeHidden();
    await expect(page.locator("#booking-carseat")).toBeHidden();
    await expect(page.locator("#booking-notes")).toHaveAttribute(
      "placeholder",
      "Anything we should know? For example, a wheelchair, a car seat, or extra luggage.",
    );
    await expect(page.locator("#notes-hint")).toHaveText(
      "Anything we should know? For example, a wheelchair, a car seat, or extra luggage.",
    );
    await expect(page.locator("#notes-label")).toHaveText("Trip Description *");
    await expect(page.locator("#group-hours")).toBeVisible();
    await expect(page.locator("#booking-notes")).toBeVisible();
    await expect(page.locator("#quote-details")).not.toContainText("Cash $");
    await expect(
      page.getByRole("button", { name: /request booking/i }),
    ).toBeEnabled();
    expect(posts).toEqual([]);
  });

  test("refuses a Charlotte pickup and does not create a request", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 16 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("group");
    await page.locator("#booking-name").fill("TEST, DO NOT BOOK");
    await page.locator("#booking-phone").fill("9804229125");
    await page.locator("#booking-passengers").fill("2");
    await page.locator("#booking-notes").fill("A wedding party downtown");
    await page.locator("#group-hours").fill("2");
    await page.locator("#booking-pickup").fill("8109 pike road charlotte");
    await page.locator("#rule-age").check();
    await page.locator("#rule-smoke").check();
    await page.locator("#rule-damage").check();
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
    await expect(result).toContainText("out of our service area.");
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
    await answerRoundTrip(page);
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
    await answerRoundTrip(page);
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
    await answerRoundTrip(page);
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
    await expect(page.locator("#group-hours")).toBeVisible();
    await expect(page.locator("#booking-quote")).toBeVisible();
  });

  test("round trip Yes or No matches the other booking labels", async ({
    page,
  }) => {
    await installMocks(page);
    const views = [
      { width: 390, height: 844, fontSize: "21px" },
      { width: 1280, height: 800, fontSize: "24px" },
    ];
    for (const { width, height, fontSize } of views) {
      await page.setViewportSize({ width, height });
      await page.goto("/?type=airport#booking");
      const bags = page.locator("#checking-bags-label");
      const bagsYes = page.locator("#checking-bags-section label").first();
      const legend = page.locator(".round-trip-choice legend");
      const options = page.locator("label.round-trip-option");
      await expect(bags).toBeVisible();
      await expect(legend).toHaveText("Round trip *");
      const bagsStyle = await bags.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          color: s.color,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
        };
      });
      expect(bagsStyle.color).toBe("rgb(255, 255, 255)");
      expect(bagsStyle.fontSize).toBe(fontSize);
      for (const loc of [legend, options.nth(0), options.nth(1), bagsYes]) {
        await expect(loc).toHaveCSS("color", bagsStyle.color);
        await expect(loc).toHaveCSS("font-size", bagsStyle.fontSize);
        await expect(loc).toHaveCSS("font-weight", bagsStyle.fontWeight);
      }
      await page.goto("/?type=local&kind=bar#booking");
      const passengers = page
        .locator("#passengers-label, #passengers-group label")
        .first();
      const barLegend = page.locator(".round-trip-choice legend");
      const barOptions = page.locator("label.round-trip-option");
      await expect(barLegend).toBeVisible();
      const paxStyle = await passengers.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          color: s.color,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
        };
      });
      expect(paxStyle.color).toBe("rgb(255, 255, 255)");
      expect(paxStyle.fontSize).toBe(fontSize);
      for (const loc of [barLegend, barOptions.nth(0), barOptions.nth(1)]) {
        await expect(loc).toHaveCSS("color", paxStyle.color);
        await expect(loc).toHaveCSS("font-size", paxStyle.fontSize);
        await expect(loc).toHaveCSS("font-weight", paxStyle.fontWeight);
      }
    }
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
    // 21px on phones matches the rest of the page, per Donald (Nov 9, 2026).
    await expect(copy).toHaveCSS("font-size", "21px");
    await expect(copy).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(page.locator("#about-us h2")).toHaveText(
      "Serving the Denver and Sherrills Ford Side of Lake Norman NC",
    );
    const call = page.locator("#about-us .about-cta");
    await expect(call).toHaveText("Call us today at (980) 422-9125");
    await expect(call.locator("a")).toHaveAttribute("href", "tel:+19804229125");
    const checks = page.locator("#why-choose-us .feature-list li");
    await expect(checks).toHaveCount(8);
    await expect(checks.nth(1)).toHaveText("Flat-rate pricing");
    await expect(page.locator("#why-choose-us .fa-check")).toHaveCount(8);
    await expect(page.locator("#why-choose-us")).not.toContainText(
      "Iron Station",
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
      "Private airfield",
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
    await answerRoundTrip(page);
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
    await expect(page.locator("#group-vehicle")).toContainText(
      "2026 Toyota Sienna Platinum",
    );
    await expect(page.locator("#airport-choice-row")).toBeHidden();
    await expect(page.locator("#airfield-choice")).toHaveCount(0);
    await expect(page.locator("#booking-quote")).toBeVisible();
    await expect(page.locator("#quote-details")).not.toContainText("Cash $");
  });

  test("a private airfield is priced like an airport from its address", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 40 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("airport");
    await page.locator("#airport-choice").selectOption("PRIVATE");
    await page.locator("#airfield-name").fill("Smith Field");
    await page
      .locator("#airfield-address")
      .fill("100 Runway Rd, Charlotte NC 28202");
    await page
      .getByPlaceholder("123 Main Street, Denver NC 28037")
      .fill("123 Main Street, Denver NC 28037");
    const quote = page.locator("#quote-details");
    await expect(quote).toContainText("One way to Smith Field");
    await expect(quote).toContainText("Cash $105.00");
    await expect(quote).toContainText("Card $108.15");
    await expect(quote).not.toContainText("2.63");
    await expect(quote).not.toContainText(/per mile/i);
    await page.locator("#trip-type").selectOption("group");
    await expect(page.locator("#airfield-name")).toBeHidden();
    await expect(page.locator("#airfield-address")).toBeHidden();
    await expect(page.locator("#quote-details")).not.toContainText(
      "Smith Field",
    );
    await expect(page.locator("#quote-details")).not.toContainText("$105.00");
    await expect(page.locator("#group-vehicle")).toContainText(
      "2026 Toyota Sienna Platinum",
    );
    expect(posts).toEqual([]);
  });

  test("a private airfield over 50 miles uses the same call message", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 55 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("airport");
    await page.locator("#airport-choice").selectOption("PRIVATE");
    await page.locator("#airfield-name").fill("Smith Field");
    await page
      .locator("#airfield-address")
      .fill("100 Runway Rd, Charlotte NC 28202");
    await page
      .getByPlaceholder("123 Main Street, Denver NC 28037")
      .fill("123 Main Street, Denver NC 28037");
    const quote = page.locator("#quote-details");
    await expect(quote).toContainText(
      "For trips over 50 miles, please call (980) 422-9125 for your price.",
    );
    await expect(quote).not.toContainText("Cash");
    await expect(quote.locator('a[href="tel:+19804229125"]')).toBeVisible();
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

async function fillIdentity(page) {
  await answerRoundTrip(page);
  await page.locator("#booking-name").fill("TEST, DO NOT BOOK");
  await page.locator("#booking-phone").fill("9804229125");
  await page.locator("#booking-email").fill("jane@example.com");
  await page.locator("#booking-passengers").fill("2");
  await page.locator("#booking-date").evaluate((el) => {
    el._flatpickr.setDate("2026-12-15", true);
    el.value = "2026-12-15";
  });
  await page.locator("#booking-time").evaluate((el) => {
    el._flatpickr.setDate("10:00:00", true);
    el.value = "10:00:00";
  });
}

test.describe("new rides on a 375px phone", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test("a listed bar quotes and the three boxes block submit", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 4 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("local");
    await page.locator("#local-kind").selectOption("bar");
    const kindBox = await page.locator("#local-kind").boundingBox();
    const barBox = await page.locator("#bar-choice").boundingBox();
    expect(barBox.y).toBeGreaterThan(kindBox.y);
    await page.locator("#bar-choice").selectOption("two-trees");
    await page
      .locator("#booking-pickup")
      .fill("123 Main Street, Denver NC 28037");
    await expect(page.locator("#quote-details")).toContainText(
      "One way to Two Trees Bar and Grill",
    );
    await expect(page.locator("#quote-details")).toContainText("Cash $15.00");
    await expect(page.locator("#quote-details")).toContainText("Card $15.45");
    await fillIdentity(page);
    await page.locator("#bookingForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#booking-success")).toContainText(
      "Please check all three boxes: Must be 21 or older, No smoking, and If you damage anything, you are responsible.",
    );
    await page.locator("#rule-age").check();
    await page.locator("#rule-smoke").check();
    await page.locator("#rule-damage").check();
    await expect(page.locator("#rule-age")).toBeChecked();
    await expect(page.locator("#rule-smoke")).toBeChecked();
    await expect(page.locator("#rule-damage")).toBeChecked();
    expect(posts).toEqual([]);
  });

  test("the intro and bar names render at 375px with no town in a label", async ({
    page,
  }) => {
    const posts = await installMocks(page);
    const names = [
      "Two Trees Bar and Grill",
      "Bourbon & Bobbers",
      "Joey's (Hwy 150)",
      "Joey's (Natalie Commons)",
      "16 Prime Steak and Seafood",
      "Lake Norman Brewery",
      "Latitudes",
      "Lobster Dogs",
      "Safari Miles",
      "Royal Bliss",
      "Sports Page Food and Spirits",
      "Blue Parrot",
      "Toucan's",
      "Vitale Lakeside",
    ];
    const towns = [
      "Denver",
      "Sherrills Ford",
      "Mooresville",
      "Cornelius",
      "Huntersville",
      "Terrell",
      "Catawba",
    ];
    await page.goto("/");
    await page.locator("#trip-type").selectOption("local");
    const intro = page.locator("#local-intro");
    await expect(intro).toBeVisible();
    await expect(intro).toHaveText(
      "Transportation to local bars, restaurants, and private parties, plus hourly group events.",
    );
    const list = page.locator("#local-bar-list");
    await expect(list).toBeVisible();
    await expect(list.locator("li")).toHaveText(names);
    const introBox = await intro.boundingBox();
    const listBox = await list.boundingBox();
    expect(listBox.y).toBeGreaterThan(introBox.y);
    await page.locator("#local-kind").selectOption("bar");
    const menu = await page.locator("#bar-choice option").allTextContents();
    expect(menu.slice(1)).toEqual(names);
    const barBox = await page.locator("#bar-choice").boundingBox();
    expect(barBox.y).toBeGreaterThan(listBox.y);
    const labels = [...names, ...menu.slice(1)];
    const hits = towns.filter((town) =>
      labels.some((label) => label.toLowerCase().includes(town.toLowerCase())),
    );
    expect(hits).toEqual([]);
    const fit = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth + 1);
    expect(posts).toEqual([]);
  });

  test("a party address uses the same quote and the same boxes", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 4 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("local");
    await page.locator("#local-kind").selectOption("party");
    await expect(page.locator("#party-address")).toBeVisible();
    await page.locator("#party-address").fill("200 Oak St, Sherrills Ford NC");
    await page
      .locator("#booking-pickup")
      .fill("123 Main Street, Denver NC 28037");
    await expect(page.locator("#quote-details")).toContainText(
      "One way to the party",
    );
    await expect(page.locator("#quote-details")).toContainText("Cash $15.00");
    await fillIdentity(page);
    await page.locator("#bookingForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#booking-success")).toContainText(
      "Please check all three boxes",
    );
    expect(posts).toEqual([]);
  });

  test("Two Trees past 10 miles is out of our service area", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 12 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("local");
    await page.locator("#local-kind").selectOption("bar");
    await page.locator("#bar-choice").selectOption("two-trees");
    await page
      .locator("#booking-pickup")
      .fill("123 Main Street, Denver NC 28037");
    await expect(page.locator("#quote-details")).toHaveText(
      "out of our service area.",
    );
    await expect(page.locator("#quote-details")).not.toContainText("Cash");
    await fillIdentity(page);
    await page.locator("#rule-age").check();
    await page.locator("#rule-smoke").check();
    await page.locator("#rule-damage").check();
    await page.locator("#bookingForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#booking-success")).toContainText(
      "out of our service area.",
    );
    expect(posts).toEqual([]);
  });

  test("a bar that is not on the list is out of our service area", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 4 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("local");
    await page.locator("#local-kind").selectOption("bar");
    await page.locator("#bar-choice").evaluate((select) => {
      const option = document.createElement("option");
      option.value = "not-on-the-list";
      option.textContent = "Some Other Bar";
      select.appendChild(option);
      select.value = "not-on-the-list";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page
      .locator("#booking-pickup")
      .fill("123 Main Street, Denver NC 28037");
    await expect(page.locator("#quote-details")).toHaveText(
      "out of our service area.",
    );
    await expect(page.locator("#quote-details")).not.toContainText("Cash");
    expect(posts).toEqual([]);
  });

  test("group shows the 2-hour minimum, 25% deposit, 6-passenger cap, and boxes", async ({
    page,
  }) => {
    const posts = await installMocks(page);
    await page.goto("/");
    await page.locator("#trip-type").selectOption("group");
    await page.locator("#group-hours").fill("1");
    await page.locator("#group-hours").blur();
    const quote = page.locator("#quote-details");
    await expect(quote).toContainText("2-hour minimum");
    await expect(quote).toContainText("Cash $250.00");
    await expect(quote).toContainText("Card $257.50");
    await expect(quote).toContainText("Deposit $62.50 cash");
    await expect(quote).toContainText("$64.38 card");
    await page.locator("#booking-passengers").fill("6");
    await expect(page.locator("#passenger-capacity-message")).not.toContainText(
      "seats 6",
    );
    await page.locator("#booking-passengers").fill("7");
    await expect(page.locator("#passenger-capacity-message")).toContainText(
      "The 2026 Toyota Sienna Platinum seats 6. For more than 6 passengers, please call (980) 422-9125.",
    );
    await page.locator("#booking-passengers").fill("2");
    await fillIdentity(page);
    await page.locator("#bookingForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#booking-success")).toContainText(
      "Please check all three boxes: Must be 21 or older, No smoking, and If you damage anything, you are responsible.",
    );
    await page.locator("#rule-age").check();
    await page.locator("#rule-smoke").check();
    await page.locator("#rule-damage").check();
    expect(posts).toEqual([]);
  });
});

test.describe("group description on a 375px phone", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test("an empty group description is blocked", async ({ page }) => {
    const posts = await installMocks(page);
    await page.goto("/");
    await page.locator("#trip-type").selectOption("group");
    await expect(page.locator("#notes-label")).toHaveText("Trip Description *");
    await fillIdentity(page);
    await page.locator("#group-hours").fill("2");
    await page
      .locator("#booking-pickup")
      .fill("123 Main Street, Denver NC 28037");
    await page.locator("#rule-age").check();
    await page.locator("#rule-smoke").check();
    await page.locator("#rule-damage").check();
    await page.locator("#bookingForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#booking-success")).toContainText(
      "Please tell us about your group event (what it is, how many people, and anything we should know).",
    );
    await expect(page.locator("#booking-notes")).toBeFocused();
    expect(posts).toEqual([]);
  });

  test("a whitespace-only group description is blocked", async ({ page }) => {
    const posts = await installMocks(page);
    await page.goto("/");
    await page.locator("#trip-type").selectOption("group");
    await fillIdentity(page);
    await page.locator("#group-hours").fill("2");
    await page
      .locator("#booking-pickup")
      .fill("123 Main Street, Denver NC 28037");
    await page.locator("#booking-notes").fill("   \n\t  ");
    await page.locator("#rule-age").check();
    await page.locator("#rule-smoke").check();
    await page.locator("#rule-damage").check();
    await page.locator("#bookingForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#booking-success")).toContainText(
      "Please tell us about your group event (what it is, how many people, and anything we should know).",
    );
    await expect(page.locator("#booking-notes")).toBeFocused();
    expect(posts).toEqual([]);
  });

  test("a group description is sent with the request", async ({ page }) => {
    const posts = await installMocks(page);
    const bodies = [];
    page.on("request", (request) => {
      if (request.method() === "POST") bodies.push(request.postData() || "");
    });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("group");
    await fillIdentity(page);
    await page.locator("#group-hours").fill("2");
    await page
      .locator("#booking-pickup")
      .fill("123 Main Street, Denver NC 28037");
    await page.locator("#booking-notes").fill("birthday dinner for 6");
    await page.locator("#rule-age").check();
    await page.locator("#rule-smoke").check();
    await page.locator("#rule-damage").check();
    await page.locator("#bookingForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#booking-success")).toContainText(
      "Request received",
    );
    expect(bodies.some((body) => body.includes("birthday dinner for 6"))).toBe(
      true,
    );
  });

  test("an airport ride can omit the description", async ({ page }) => {
    const posts = await installMocks(page, { miles: 10 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("airport");
    await expect(page.locator("#notes-label")).toHaveText("Special Notes");
    await expect(page.locator("#booking-notes")).not.toHaveAttribute(
      "required",
    );
    await fillIdentity(page);
    await page.locator("#airport-choice").selectOption("CLT");
    await page
      .locator("#booking-pickup")
      .fill("123 Main Street, Denver NC 28037");
    await answerBags(page);
    await answerRoundTrip(page);
    await page.locator("#bookingForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#booking-success")).toContainText(
      "Request received",
    );
    expect(posts.length).toBeGreaterThan(0);
  });

  test("a bar ride can omit the description", async ({ page }) => {
    const posts = await installMocks(page, { miles: 4 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("local");
    await page.locator("#local-kind").selectOption("bar");
    await expect(page.locator("#notes-label")).toHaveText("Special Notes");
    await fillIdentity(page);
    await page.locator("#bar-choice").selectOption("two-trees");
    await page
      .locator("#booking-pickup")
      .fill("123 Main Street, Denver NC 28037");
    await page.locator("#rule-age").check();
    await page.locator("#rule-smoke").check();
    await page.locator("#rule-damage").check();
    await page.locator("#bookingForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#booking-success")).toContainText(
      "Request received",
    );
    expect(posts.length).toBeGreaterThan(0);
  });

  test("a party ride can omit the description", async ({ page }) => {
    const posts = await installMocks(page, { miles: 4 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("local");
    await page.locator("#local-kind").selectOption("party");
    await expect(page.locator("#notes-label")).toHaveText("Special Notes");
    await fillIdentity(page);
    await page.locator("#party-address").fill("200 Oak St, Sherrills Ford NC");
    await page
      .locator("#booking-pickup")
      .fill("123 Main Street, Denver NC 28037");
    await page.locator("#rule-age").check();
    await page.locator("#rule-smoke").check();
    await page.locator("#rule-damage").check();
    await page.locator("#bookingForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#booking-success")).toContainText(
      "Request received",
    );
    expect(posts.length).toBeGreaterThan(0);
  });

  test("a private airfield can omit the description", async ({ page }) => {
    const posts = await installMocks(page, { miles: 40 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("airport");
    await page.locator("#airport-choice").selectOption("PRIVATE");
    await expect(page.locator("#booking-notes")).not.toHaveAttribute(
      "required",
    );
    await fillIdentity(page);
    await page.locator("#airfield-name").fill("Smith Field");
    await page
      .locator("#airfield-address")
      .fill("100 Runway Rd, Charlotte NC 28202");
    await page
      .locator("#booking-pickup")
      .fill("123 Main Street, Denver NC 28037");
    await answerBags(page);
    await answerRoundTrip(page);
    await page.locator("#bookingForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#booking-success")).toContainText(
      "Request received",
    );
    expect(posts.length).toBeGreaterThan(0);
  });
});

test.describe("Two Trees towns and group radius at 375px", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test("Two Trees at 9 miles from Denver is quoted", async ({ page }) => {
    const posts = await installMocks(page, { miles: 9 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("local");
    await page.locator("#local-kind").selectOption("bar");
    await page.locator("#bar-choice").selectOption("two-trees");
    await page
      .locator("#booking-pickup")
      .fill("123 Main Street, Denver NC 28037");
    await expect(page.locator("#quote-details")).toContainText("Cash $25.00");
    await expect(page.locator("#quote-details")).toContainText("Card $25.75");
    expect(posts).toEqual([]);
  });

  test("Two Trees from Mooresville under 10 miles is blocked", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 8 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("local");
    await page.locator("#local-kind").selectOption("bar");
    await page.locator("#bar-choice").selectOption("two-trees");
    await page
      .locator("#booking-pickup")
      .fill("123 Main St, Mooresville NC 28115");
    await expect(page.locator("#quote-details")).toHaveText(
      "out of our service area.",
    );
    expect(posts).toEqual([]);
  });

  test("Two Trees from Cornelius is blocked", async ({ page }) => {
    const posts = await installMocks(page, { miles: 5 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("local");
    await page.locator("#local-kind").selectOption("bar");
    await page.locator("#bar-choice").selectOption("two-trees");
    await page
      .locator("#booking-pickup")
      .fill("10 Main St, Cornelius NC 28031");
    await expect(page.locator("#quote-details")).toHaveText(
      "out of our service area.",
    );
    expect(posts).toEqual([]);
  });

  test("a group 14.9 miles across the lake is quoted", async ({ page }) => {
    const posts = await installMocks(page, { miles: 14.9 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("group");
    await page.locator("#group-hours").fill("2");
    await page
      .locator("#booking-pickup")
      .fill("100 N Main St, Mooresville NC 28115");
    await page.locator("#booking-pickup").blur();
    await expect(page.locator("#quote-details")).toContainText("Cash $250.00");
    await expect(page.locator("#quote-details")).not.toContainText(
      "out of our service area.",
    );
    expect(posts).toEqual([]);
  });

  test("a group 15.1 miles away is blocked", async ({ page }) => {
    const posts = await installMocks(page, { miles: 15.1 });
    await page.goto("/");
    await page.locator("#trip-type").selectOption("group");
    await page.locator("#group-hours").fill("2");
    await page
      .locator("#booking-pickup")
      .fill("100 N Main St, Mooresville NC 28115");
    await page.locator("#booking-pickup").blur();
    await expect(page.locator("#quote-details")).toHaveText(
      "out of our service area.",
    );
    expect(posts).toEqual([]);
  });
});

test.describe("hero CTAs above the fold on phones", () => {
  const viewports = [
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 393, height: 852 },
    { width: 430, height: 932 },
  ];
  const ids = [
    "hero-book-airport",
    "hero-call",
    "hero-book-group",
    "hero-book-bar",
  ];

  for (const { width, height } of viewports) {
    test(`four booking boxes fit in ${width}x${height}`, async ({ page }) => {
      await page.route("**/*", async (route) => {
        const host = new URL(route.request().url()).hostname;
        if (host === "127.0.0.1" || host === "localhost") {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "text/plain",
          body: "",
        });
      });
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await page.evaluate(() => document.fonts && document.fonts.ready);

      const boxes = [];
      for (const id of ids) {
        const link = page.locator(`header.hero #${id}`);
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        expect(box, `${id} missing box`).toBeTruthy();
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
        boxes.push(box);
      }
      expect(boxes[1].y).toBeGreaterThanOrEqual(boxes[0].y - 1);
      expect(boxes[3].y).toBeGreaterThanOrEqual(boxes[2].y - 1);
    });
  }
});

test.describe("hero button labels fit inside their boxes", () => {
  const widths = [320, 375, 390, 430];
  const labels = {
    "hero-book-airport": "Book an Airport Ride",
    "hero-call": "Call (980) 422-9125",
    "hero-book-group": "Book a Group Ride",
    "hero-book-bar": "Book a Bar Ride",
  };

  for (const width of widths) {
    test(`front page box labels fit at ${width}px`, async ({ page }) => {
      await page.route("**/*", async (route) => {
        const host = new URL(route.request().url()).hostname;
        if (host === "127.0.0.1" || host === "localhost") {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "text/plain",
          body: "",
        });
      });
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      await page.evaluate(() => document.fonts && document.fonts.ready);

      const fit = await page.evaluate((ids) => {
        function measure(el) {
          const box = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const range = document.createRange();
          range.selectNodeContents(el);
          const rects = [...range.getClientRects()];
          const textLeft = Math.min(...rects.map((rect) => rect.left));
          const textRight = Math.max(...rects.map((rect) => rect.right));
          const borderLeft = parseFloat(cs.borderLeftWidth);
          const borderRight = parseFloat(cs.borderRightWidth);
          const paddingLeft = parseFloat(cs.paddingLeft);
          const paddingRight = parseFloat(cs.paddingRight);
          return {
            text: el.innerText.replace(/\s+/g, " ").trim(),
            width: box.width,
            height: box.height,
            textLeft,
            textRight,
            innerLeft: box.left + borderLeft + paddingLeft,
            innerRight: box.right - borderRight - paddingRight,
          };
        }
        const out = {};
        for (const id of ids) {
          out[id] = measure(document.querySelector(`header.hero #${id}`));
        }
        return out;
      }, Object.keys(labels));

      const widthsFound = Object.values(fit).map((box) => box.width);
      for (const [id, text] of Object.entries(labels)) {
        expect(fit[id].text).toBe(text);
        expect(fit[id].textLeft).toBeGreaterThanOrEqual(
          fit[id].innerLeft - 0.5,
        );
        expect(fit[id].textRight).toBeLessThanOrEqual(fit[id].innerRight + 0.5);
      }
      expect(Math.max(...widthsFound) - Math.min(...widthsFound)).toBeLessThan(
        2,
      );
    });
  }
});
