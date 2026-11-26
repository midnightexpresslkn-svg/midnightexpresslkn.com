import { hostnameOf } from "../helpers/hostname.js";
import {
  test,
  expect,
  typeTimeAt,
  pick,
  chooseOneWay,
} from "./helpers/booking-mocks.js";
import { ui, expectPresentButHidden } from "./helpers/ui.js";

// Bags plus the other airport answers Donald made required on Nov 16, 2026.
async function answerBags(page, { note = "Departure curb, please." } = {}) {
  await page
    .getByRole("radio", { name: "To the airport", exact: true })
    .check();
  // "Checked bags? *" has no group role; its Yes/No pair is the first on the airport form.
  await page.getByRole("radio", { name: "No", exact: true }).first().check();
  // Its "How many?" box is the one with the "Example: 2" hint (carry-on uses "Example: 1").
  await page.getByPlaceholder("Example: 2", { exact: true }).fill("0");
  await page
    .getByRole("group", { name: /Carry-on bags/ })
    .getByRole("radio", { name: "No", exact: true })
    .check();
  await page
    .getByRole("group", { name: /help with your luggage/ })
    .getByRole("radio", { name: "No", exact: true })
    .check();
  await page.getByLabel(/Departure flight number/).fill("DL100");
  await page.getByRole("textbox", { name: /Special Notes/ }).fill(note);
}

// Airport, bar, and party rides ask Round trip; group events do not, so callers say which.
// An airport No asks Are you sure? first, so a one-way airport rider answers No twice (Nov 19 2026).
// Some specs answer Round trip twice; once No is kept, a repeat answer changes nothing.
async function answerRoundTrip(page, value = "No") {
  const airport = (await ui.tripType(page).inputValue()) === "airport";
  const no = ui.roundTrip(page).getByRole("radio", { name: "No", exact: true });
  if (value === "No" && airport && !(await no.isChecked()))
    return chooseOneWay(page);
  await ui
    .roundTrip(page)
    .getByRole("radio", { name: value, exact: true })
    .check();
}

// Bar rides have one combined agreement box (Donald, Nov 16 2026).
const barAgreement = ui.agreement;

// The group form's van line (Donald's price), shown only for group events.
const GROUP_VEHICLE_LINE =
  "2026 Toyota Sienna Platinum minivan, $125 per hour.";

async function agreeBar(page) {
  await barAgreement(page).check();
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
    await ui.tripType(page).selectOption("airport");
    await ui.airport(page).selectOption("CLT");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    const quote = ui.quote(page);
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
    await ui.tripType(page).selectOption("airport");
    await ui.airport(page).selectOption("CLT");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    const quote = ui.quote(page);
    await expect(quote).toContainText("Cash $80.00");
    await expect(quote).toContainText("Card $82.40");
    await expect(quote).not.toContainText("78.90");
    expect(posts).toEqual([]);
  });

  test("group trip hides the fare and stays submittable", async ({ page }) => {
    const posts = await installMocks(page);
    await page.goto("/");
    await ui.tripType(page).selectOption("group");
    // The old "call for pricing" line is gone.
    await expect(page.getByText(/call for (group )?pricing/i)).toHaveCount(0);
    await expect(ui.quoteHeading(page)).toBeVisible();
    await expect(page.getByText(GROUP_VEHICLE_LINE)).toContainText(
      "2026 Toyota Sienna Platinum",
    );
    await expectPresentButHidden(
      page.getByRole("textbox", {
        name: "Enter your destination address",
        includeHidden: true,
      }),
    );
    await expectPresentButHidden(
      page.getByText("Checked bags? *", { exact: true }),
    );
    await expectPresentButHidden(
      page.getByRole("textbox", {
        name: "Arrival flight number *",
        includeHidden: true,
      }),
    );
    await expectPresentButHidden(
      page.getByRole("group", { name: "Round trip *", includeHidden: true }),
    );
    await expectPresentButHidden(
      page.getByRole("checkbox", { name: "Wheelchair", includeHidden: true }),
    );
    await expectPresentButHidden(
      page.getByRole("checkbox", { name: "Car Seat", includeHidden: true }),
    );
    await expect(ui.notes(page)).toHaveAttribute(
      "placeholder",
      "Anything we should know? For example: drinks, music style.",
    );
    await expect(
      page.getByText(
        "Anything we should know? For example: drinks, music style.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Trip Description *", exact: true }),
    ).toBeVisible();
    await expect(ui.hours(page)).toBeVisible();
    await expect(ui.notes(page)).toBeVisible();
    await expect(ui.quote(page)).not.toContainText("Cash $");
    await expect(
      page.getByRole("button", { name: /request booking/i }),
    ).toBeEnabled();
    expect(posts).toEqual([]);
  });

  test("refuses a Charlotte pickup and does not create a request", async ({
    page,
  }) => {
    // Group limit is 20 road miles (Donald, Nov 25, 2026); a Charlotte pickup 21 miles out is refused.
    const posts = await installMocks(page, { miles: 21 });
    await page.goto("/");
    await ui.tripType(page).selectOption("group");
    await ui.name(page).fill("TEST, DO NOT BOOK");
    await ui.phone(page).fill("9804229125");
    await ui.passengers(page).fill("2");
    await ui.notes(page).fill("A wedding party downtown");
    await ui.hours(page).fill("2");
    await ui.pickup(page).fill("8109 pike road charlotte");
    await agreeBar(page);
    await pick(ui.date(page), "2026-12-15");
    await typeTimeAt(page, "Pickup Time", "10:00", "AM");
    await ui.submit(page).click();
    const result = ui.result(page);
    await expect(result).toContainText("out of our service area.");
    await expect(result).not.toContainText("980");
    await expect(result).not.toContainText(/call/i);
    expect(posts).toEqual([]);
  });

  test("blank airport error is readable on a phone", async ({ page }) => {
    const posts = await installMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#booking");
    await ui.tripType(page).selectOption("airport");
    await ui.name(page).fill("Jame test");
    await ui.phone(page).fill("9804229125");
    await ui.passengers(page).fill("2");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await pick(ui.date(page), "2026-12-15");
    await typeTimeAt(page, "Pickup Time", "10:00", "AM");
    await ui.airport(page).selectOption("");
    await answerRoundTrip(page);
    await ui.submit(page).click();
    const line = ui
      .result(page)
      .getByRole("listitem")
      .filter({ hasText: "Please choose an airport" });
    await expect(line).toHaveText("Please choose an airport");
    await expect(line).toHaveCSS("color", "rgb(255, 255, 255)");
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
    await ui.tripType(page).selectOption("airport");
    await ui.name(page).fill("TEST, DO NOT BOOK");
    await ui.phone(page).fill("9804229125");
    await ui.passengers(page).fill("2");
    await ui.airport(page).selectOption("CLT");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await pick(ui.date(page), "2026-12-15");
    await typeTimeAt(page, "Pickup Time", "10:00", "AM");
    await answerBags(page);
    await answerRoundTrip(page);
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText("Request received");
    expect(posts.length).toBeGreaterThan(0);
  });

  // Donald (Nov 23, 2026): a triple booking goes through as a normal request; only Donald's call warns him.
  for (const [label, busy, time] of [
    [
      "sends a third ride when both drivers are already busy",
      [
        [10, 0],
        [10, 0],
      ],
      "10:00",
    ],
    [
      "sends Shalini's 8:00 that overlaps a 6:15 ride by 15 minutes",
      [
        [4, 30],
        [6, 15],
      ],
      "8:00",
    ],
    [
      "sends a third 8:00 after 6:15 and 8:00 rides",
      [
        [6, 15],
        [8, 0],
      ],
      "8:00",
    ],
  ]) {
    test(label + " (no overlap message)", async ({ page }) => {
      const posts = await installMocks(page, {
        bookings: busy.map(([h, m]) => ({
          datetime: new Date(2026, 11, 15, h, m, 0, 0).toISOString(),
        })),
      });
      await page.goto("/");
      await ui.tripType(page).selectOption("airport");
      await ui.name(page).fill("TEST, DO NOT BOOK");
      await ui.phone(page).fill("9804229125");
      await ui.passengers(page).fill("2");
      await ui.airport(page).selectOption("CLT");
      await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
      await pick(ui.date(page), "2026-12-15");
      await typeTimeAt(page, "Pickup Time", time, "AM");
      await answerBags(page);
      await answerRoundTrip(page);
      await ui.submit(page).click();
      await expect(ui.result(page)).toContainText("Request received");
      await expect(ui.result(page)).not.toContainText(
        /booked|not available|conflict|tight|triple/i,
      );
      expect(posts.length).toBeGreaterThan(0);
    });
  }

  test("home page opens the group form with group selected", async ({
    page,
  }) => {
    await installMocks(page);
    await page.goto("/");
    // The hero box and the Group Transportation card both open the group form.
    const links = page.getByRole("link", {
      name: "Book a Group Ride",
      exact: true,
    });
    await expect(links).toHaveCount(2);
    for (const link of await links.all()) {
      await expect(link).toHaveText("Book a Group Ride");
      await expect(link).toHaveAttribute("href", "/?type=group#booking");
    }
    await page.goto("/?type=group#booking");
    const tripType = page.getByRole("combobox", {
      name: "Trip type *",
      includeHidden: true,
    });
    await expect(tripType).toHaveValue("group");
    await expect(tripType).toBeHidden();
    await expect(ui.bookingHeading(page)).toBeVisible();
    await expect(ui.form(page)).toBeVisible();
    await expect(ui.hours(page)).toBeVisible();
    await expect(ui.quoteHeading(page)).toBeVisible();
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
      const bags = page.getByText("Checked bags? *", { exact: true });
      // Checked bags' Yes is the first Yes on the airport form (it has no group of its own).
      const bagsYes = page
        .getByText("Yes", { exact: true })
        .filter({ visible: true })
        .first();
      const round = ui.roundTrip(page);
      const legend = round.getByText("Round trip *", { exact: true });
      const options = round.getByText(/^\s*(Yes|No)\s*$/);
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
      const passengers = page.getByText("Number of Passengers *", {
        exact: true,
      });
      const barRound = ui.roundTrip(page);
      const barLegend = barRound.getByText("Round trip *", { exact: true });
      const barOptions = barRound.getByText(/^\s*(Yes|No)\s*$/);
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
    const copy = page.getByText(
      "Midnight Express LKN is a family-owned airport shuttle service",
    );
    await expect(copy).toHaveCount(1);
    await expect(copy).toHaveText(
      "Midnight Express LKN is a family-owned airport shuttle service based in Sherrills Ford and Denver, NC. We run reliable, pre-booked rides to and from Charlotte Douglas, Concord Regional, and nearby private airfields. Our licensed, insured drivers track your flight, so we're there when you land — on time, every time. We also do safe group and bar rides for weddings, parties, and nights out.",
    );
    // 21px on phones matches the rest of the page, per Donald (Nov 9, 2026).
    await expect(copy).toHaveCSS("font-size", "21px");
    await expect(copy).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(
      page.getByRole("heading", {
        name: "Serving the Denver and Sherrills Ford Side of Lake Norman NC",
        exact: true,
      }),
    ).toBeVisible();
    const call = page.getByText("Call us today at");
    await expect(call).toHaveText("Call us today at (980) 422-9125");
    await expect(call.getByRole("link")).toHaveAttribute(
      "href",
      "tel:+19804229125",
    );
    const why = page.getByRole("region", {
      name: "Why Choose Midnight Express LKN",
    });
    const checks = why.getByRole("listitem");
    await expect(checks).toHaveCount(8);
    await expect(checks.nth(1)).toHaveText("Flat-rate pricing");
    // Exception: the check marks are decorative Font Awesome icons with no role or text,
    // so the only way to count them is their icon class.
    await expect(why.locator("i.fa-check")).toHaveCount(8);
    await expect(why).not.toContainText("Iron Station");
  });

  test.describe("on an iPhone", () => {
    // test.use keeps the shared page fixture, so console and network errors are still captured.
    test.use({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      viewport: { width: 390, height: 844 },
    });

    test("iPhone shows how to add the booking page to the home screen", async ({
      page,
    }) => {
      await installMocks(page);
      await page.goto("/#booking");
      const tip = page.getByText("Tap Share, then Add to Home Screen", {
        exact: true,
      });
      await expect(tip).toBeVisible();
      await expect(tip).toHaveText("Tap Share, then Add to Home Screen");
      await expectPresentButHidden(
        page.getByRole("button", {
          name: "Add to Home Screen",
          includeHidden: true,
        }),
      );
    });
  });

  test("Android shows Add to Home Screen when the browser offers it", async ({
    page,
  }) => {
    await installMocks(page);
    await page.goto("/#booking");
    // The whole tip line (iPhone hint and Android button) starts hidden.
    await expectPresentButHidden(
      page.getByText("Tap Share, then Add to Home Screen", { exact: true }),
    );
    await expectPresentButHidden(
      page.getByRole("button", {
        name: "Add to Home Screen",
        includeHidden: true,
      }),
    );
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      event.prompt = () => Promise.resolve();
      window.dispatchEvent(event);
    });
    const add = page.getByRole("button", { name: "Add to Home Screen" });
    await expect(add).toBeVisible();
    await expect(add).toHaveText("Add to Home Screen");
  });

  test("a listed airport is priced from the single airport menu", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 12 });
    await page.goto("/");
    await ui.tripType(page).selectOption("airport");
    await expect(
      page.getByRole("textbox", { name: "Home address *", exact: true }),
    ).toBeVisible();
    await expect(ui.airport(page)).toBeVisible();
    // The old separate "Private airfield" menu is gone; it is one airport menu now.
    await expect(
      page.getByRole("combobox", {
        name: "Private airfield",
        includeHidden: true,
      }),
    ).toHaveCount(0);
    await expectPresentButHidden(
      page.getByRole("textbox", {
        name: "Enter your destination address",
        includeHidden: true,
      }),
    );
    const tripBox = await ui.tripType(page).boundingBox();
    const airportBox = await ui.airport(page).boundingBox();
    expect(airportBox.y).toBeGreaterThan(tripBox.y);
    await expect(ui.airport(page).getByRole("option")).toHaveText([
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
    await ui.airport(page).selectOption("KIPJ");
    await expect(
      page.getByRole("textbox", {
        name: "Enter your destination address",
        includeHidden: true,
      }),
    ).toHaveValue("KIPJ");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await expect(ui.quote(page)).toContainText("Lincolnton");
    await expect(ui.quote(page)).toContainText("Cash");
    await ui.name(page).fill("TEST, DO NOT BOOK");
    await ui.phone(page).fill("9804229125");
    await ui.passengers(page).fill("2");
    await pick(ui.date(page), "2026-12-15");
    await typeTimeAt(page, "Pickup Time", "10:00", "AM");
    await answerBags(page);
    await answerRoundTrip(page);
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText("Request received");
    await expect(ui.result(page)).not.toContainText("don't service");
    expect(posts.length).toBeGreaterThan(0);
  });

  test("group form still has no airport price", async ({ page }) => {
    await installMocks(page);
    await page.goto("/");
    await ui.tripType(page).selectOption("group");
    await expect(
      page.getByRole("textbox", { name: "Pickup Address *", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(GROUP_VEHICLE_LINE)).toContainText(
      "2026 Toyota Sienna Platinum",
    );
    await expectPresentButHidden(
      page.getByRole("combobox", {
        name: "Airport",
        exact: true,
        includeHidden: true,
      }),
    );
    // The old separate "Private airfield" menu is gone; it is one airport menu now.
    await expect(
      page.getByRole("combobox", {
        name: "Private airfield",
        includeHidden: true,
      }),
    ).toHaveCount(0);
    await expect(ui.quoteHeading(page)).toBeVisible();
    await expect(ui.quote(page)).not.toContainText("Cash $");
  });

  test("a private airfield is priced like an airport from its address", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 40 });
    await page.goto("/");
    await ui.tripType(page).selectOption("airport");
    await ui.airport(page).selectOption("PRIVATE");
    await ui.airfieldName(page).fill("Smith Field");
    await ui.airfieldAddress(page).fill("100 Runway Rd, Charlotte NC 28202");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    const quote = ui.quote(page);
    await expect(quote).toContainText("One way to Smith Field");
    await expect(quote).toContainText("Cash $105.00");
    await expect(quote).toContainText("Card $108.15");
    await expect(quote).not.toContainText("2.63");
    await expect(quote).not.toContainText(/per mile/i);
    await ui.tripType(page).selectOption("group");
    await expectPresentButHidden(
      page.getByRole("textbox", {
        name: "Airfield name *",
        exact: true,
        includeHidden: true,
      }),
    );
    await expectPresentButHidden(
      page.getByRole("textbox", {
        name: "Airfield address *",
        exact: true,
        includeHidden: true,
      }),
    );
    await expect(ui.quote(page)).not.toContainText("Smith Field");
    await expect(ui.quote(page)).not.toContainText("$105.00");
    await expect(page.getByText(GROUP_VEHICLE_LINE)).toContainText(
      "2026 Toyota Sienna Platinum",
    );
    expect(posts).toEqual([]);
  });

  test("a private airfield over 50 miles uses the same call message", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 55 });
    await page.goto("/");
    await ui.tripType(page).selectOption("airport");
    await ui.airport(page).selectOption("PRIVATE");
    await ui.airfieldName(page).fill("Smith Field");
    await ui.airfieldAddress(page).fill("100 Runway Rd, Charlotte NC 28202");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    const quote = ui.quote(page);
    await expect(quote).toContainText(
      "For trips over 50 miles, please call (980) 422-9125 for your price.",
    );
    await expect(quote).not.toContainText("Cash");
    const call = quote.getByRole("link", { name: "(980) 422-9125" });
    await expect(call).toBeVisible();
    await expect(call).toHaveAttribute("href", "tel:+19804229125");
    expect(posts).toEqual([]);
  });

  test("manifest start url opens the booking section", async ({ page }) => {
    await installMocks(page);
    const response = await page.goto("/manifest.webmanifest");
    expect(response.ok()).toBeTruthy();
    const manifest = await response.json();
    expect(manifest.start_url).toContain("#booking");
    await page.goto(manifest.start_url);
    await expect(ui.bookingHeading(page)).toBeVisible();
    await expect(ui.form(page)).toBeVisible();
    await expect(page).toHaveURL(/#booking/);
  });
});

async function fillIdentity(page, { roundTrip = true } = {}) {
  if (roundTrip) await answerRoundTrip(page);
  await ui.name(page).fill("TEST, DO NOT BOOK");
  await ui.phone(page).fill("9804229125");
  await ui.email(page).fill("jane@example.com");
  await ui.passengers(page).fill("2");
  await pick(ui.date(page), "2026-12-15");
  await typeTimeAt(page, "Pickup Time", "10:00", "AM");
}

test.describe("new rides on a 375px phone", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test("a listed bar quotes and the agreement box blocks submit", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 4 });
    await page.goto("/");
    await ui.tripType(page).selectOption("local");
    await ui.localKind(page).selectOption("bar");
    const kindBox = await ui.localKind(page).boundingBox();
    const barBox = await ui.bar(page).boundingBox();
    expect(barBox.y).toBeGreaterThan(kindBox.y);
    await ui.bar(page).selectOption("two-trees");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await expect(ui.quote(page)).toContainText(
      "One way to Two Trees Bar and Grill",
    );
    await expect(ui.quote(page)).toContainText("Cash $15.00");
    await expect(ui.quote(page)).toContainText("Card $15.45");
    await fillIdentity(page);
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText(
      "Please check the box: Must be 21 years or older, cannot smoke, and you are responsible for any damages.",
    );
    await agreeBar(page);
    await expect(barAgreement(page)).toBeChecked();
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
    await ui.tripType(page).selectOption("local");
    const intro = page.getByText(
      "Transportation to local bars, restaurants, and private parties, plus hourly group events.",
      { exact: true },
    );
    await expect(intro).toBeVisible();
    await expect(intro).toHaveText(
      "Transportation to local bars, restaurants, and private parties, plus hourly group events.",
    );
    const list = page.getByRole("list").filter({ hasText: names[1] });
    await expect(list).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveText(names);
    const introBox = await intro.boundingBox();
    const listBox = await list.boundingBox();
    expect(listBox.y).toBeGreaterThan(introBox.y);
    await ui.localKind(page).selectOption("bar");
    const menu = await ui.bar(page).getByRole("option").allTextContents();
    expect(menu.slice(1)).toEqual(names);
    const barBox = await ui.bar(page).boundingBox();
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
    await ui.tripType(page).selectOption("local");
    await ui.localKind(page).selectOption("party");
    await expect(ui.partyAddress(page)).toBeVisible();
    await ui.partyAddress(page).fill("200 Oak St, Sherrills Ford NC");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await expect(ui.quote(page)).toContainText("One way to the party");
    await expect(ui.quote(page)).toContainText("Cash $15.00");
    await fillIdentity(page);
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText(
      "Please check the box: Must be 21 years or older",
    );
    expect(posts).toEqual([]);
  });

  test("Two Trees past 15 miles is out of our service area", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 15.1 });
    await page.goto("/");
    await ui.tripType(page).selectOption("local");
    await ui.localKind(page).selectOption("bar");
    await ui.bar(page).selectOption("two-trees");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await expect(ui.quote(page)).toHaveText("out of our service area.");
    await expect(ui.quote(page)).not.toContainText("Cash");
    await fillIdentity(page);
    await agreeBar(page);
    await answerRoundTrip(page);
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText("out of our service area.");
    expect(posts).toEqual([]);
  });

  test("a bar that is not on the list is out of our service area", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 4 });
    await page.goto("/");
    await ui.tripType(page).selectOption("local");
    await ui.localKind(page).selectOption("bar");
    await ui.bar(page).evaluate((select) => {
      const option = document.createElement("option");
      option.value = "not-on-the-list";
      option.textContent = "Some Other Bar";
      select.appendChild(option);
      select.value = "not-on-the-list";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await expect(ui.quote(page)).toHaveText("out of our service area.");
    await expect(ui.quote(page)).not.toContainText("Cash");
    expect(posts).toEqual([]);
  });

  test("group shows the 2-hour minimum, 25% deposit, 6-passenger cap, and boxes", async ({
    page,
  }) => {
    const posts = await installMocks(page);
    await page.goto("/");
    await ui.tripType(page).selectOption("group");
    await ui.hours(page).fill("1");
    await ui.hours(page).blur();
    const quote = ui.quote(page);
    await expect(quote).toContainText("2-hour minimum");
    await expect(quote).toContainText("Cash $250.00");
    await expect(quote).toContainText("Card $257.50");
    await expect(quote).toContainText("25% deposit: Cash $62.50");
    await expect(quote).toContainText("Deposit must be paid up front.");
    await expect(quote).toContainText("Card $64.38");
    await ui.passengers(page).fill("6");
    await expect(page.getByText(/seats 6/)).toHaveCount(0);
    await ui.passengers(page).fill("7");
    await expect(page.getByText(/seats 6/)).toContainText(
      "The 2026 Toyota Sienna Platinum seats 6. For more than 6 passengers, please call (980) 422-9125.",
    );
    await ui.passengers(page).fill("2");
    await fillIdentity(page, { roundTrip: false });
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText(
      "Please check the box: Must be 21 years or older, cannot smoke, and you are responsible for any damages.",
    );
    await agreeBar(page);
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
    await ui.tripType(page).selectOption("group");
    await expect(
      page.getByRole("textbox", { name: "Trip Description *", exact: true }),
    ).toBeVisible();
    await fillIdentity(page, { roundTrip: false });
    await ui.hours(page).fill("2");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await agreeBar(page);
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText(
      "Please tell us about your group event (what it is, how many people, and anything we should know).",
    );
    await expect(ui.notes(page)).toBeFocused();
    expect(posts).toEqual([]);
  });

  test("a whitespace-only group description is blocked", async ({ page }) => {
    const posts = await installMocks(page);
    await page.goto("/");
    await ui.tripType(page).selectOption("group");
    await fillIdentity(page, { roundTrip: false });
    await ui.hours(page).fill("2");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await ui.notes(page).fill("   \n\t  ");
    await agreeBar(page);
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText(
      "Please tell us about your group event (what it is, how many people, and anything we should know).",
    );
    await expect(ui.notes(page)).toBeFocused();
    expect(posts).toEqual([]);
  });

  test("a group description is sent with the request", async ({ page }) => {
    const posts = await installMocks(page);
    const bodies = [];
    page.on("request", (request) => {
      if (request.method() === "POST") bodies.push(request.postData() || "");
    });
    await page.goto("/");
    await ui.tripType(page).selectOption("group");
    await fillIdentity(page, { roundTrip: false });
    await ui.hours(page).fill("2");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await ui.notes(page).fill("birthday dinner for 6");
    await agreeBar(page);
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText("Request received");
    expect(bodies.some((body) => body.includes("birthday dinner for 6"))).toBe(
      true,
    );
  });

  test("an airport ride needs a description", async ({ page }) => {
    const posts = await installMocks(page, { miles: 10 });
    await page.goto("/");
    await ui.tripType(page).selectOption("airport");
    await expect(
      page.getByRole("textbox", { name: "Special Notes *", exact: true }),
    ).toBeVisible();
    await expect(ui.notes(page)).toHaveAttribute("required", "");
    await fillIdentity(page);
    await ui.airport(page).selectOption("CLT");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await answerBags(page);
    await answerRoundTrip(page);
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText("Request received");
    expect(posts.length).toBeGreaterThan(0);
  });

  test("a bar ride can omit the description", async ({ page }) => {
    const posts = await installMocks(page, { miles: 4 });
    await page.goto("/");
    await ui.tripType(page).selectOption("local");
    await ui.localKind(page).selectOption("bar");
    await expect(
      page.getByRole("textbox", { name: "Special Notes", exact: true }),
    ).toBeVisible();
    await fillIdentity(page);
    await ui.bar(page).selectOption("two-trees");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await agreeBar(page);
    await answerRoundTrip(page);
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText("Request received");
    expect(posts.length).toBeGreaterThan(0);
  });

  test("a party ride can omit the description", async ({ page }) => {
    const posts = await installMocks(page, { miles: 4 });
    await page.goto("/");
    await ui.tripType(page).selectOption("local");
    await ui.localKind(page).selectOption("party");
    await expect(
      page.getByRole("textbox", { name: "Special Notes", exact: true }),
    ).toBeVisible();
    await fillIdentity(page);
    await ui.partyAddress(page).fill("200 Oak St, Sherrills Ford NC");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await page
      .getByRole("group", { name: /Second pickup location/ })
      .getByRole("radio", { name: "No", exact: true })
      .check();
    await answerRoundTrip(page);
    await agreeBar(page);
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText("Request received");
    expect(posts.length).toBeGreaterThan(0);
  });

  test("a private airfield needs a description too", async ({ page }) => {
    const posts = await installMocks(page, { miles: 40 });
    await page.goto("/");
    await ui.tripType(page).selectOption("airport");
    await ui.airport(page).selectOption("PRIVATE");
    await expect(ui.notes(page)).toHaveAttribute("required", "");
    await fillIdentity(page);
    await ui.airfieldName(page).fill("Smith Field");
    await ui.airfieldAddress(page).fill("100 Runway Rd, Charlotte NC 28202");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await answerBags(page);
    await answerRoundTrip(page);
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText("Request received");
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
    await ui.tripType(page).selectOption("local");
    await ui.localKind(page).selectOption("bar");
    await ui.bar(page).selectOption("two-trees");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await expect(ui.quote(page)).toContainText("Cash $25.00");
    await expect(ui.quote(page)).toContainText("Card $25.75");
    expect(posts).toEqual([]);
  });

  test("Two Trees from Mooresville is out of our service area at any distance", async ({
    page,
  }) => {
    for (const miles of [3, 8.34, 8.4]) {
      const posts = await installMocks(page, { miles });
      await page.goto("/");
      await ui.tripType(page).selectOption("local");
      await ui.localKind(page).selectOption("bar");
      await ui.bar(page).selectOption("two-trees");
      await ui.pickup(page).fill("123 Main St, Mooresville NC 28115");
      await expect(ui.quote(page)).toHaveText("out of our service area.");
      expect(posts).toEqual([]);
    }
  });

  test("another bar from Mooresville is refused at any distance", async ({
    page,
  }) => {
    for (const miles of [3, 8, 8.4]) {
      const posts = await installMocks(page, { miles });
      await page.goto("/");
      await ui.tripType(page).selectOption("local");
      await ui.localKind(page).selectOption("bar");
      await ui.bar(page).selectOption("bourbon-bobber");
      await ui.pickup(page).fill("123 Main St, Mooresville NC 28115");
      await expect(ui.quote(page)).toHaveText(
        "Sorry, we don't service that area.",
      );
      expect(posts).toEqual([]);
    }
  });

  test("any bar is refused past 15 road miles and a party is refused past 15 miles", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 15.1 });
    await page.goto("/");
    await ui.tripType(page).selectOption("local");
    await ui.localKind(page).selectOption("bar");
    await ui.bar(page).selectOption("bourbon-bobber");
    await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
    await expect(ui.quote(page)).toHaveText("out of our service area.");
    await ui.localKind(page).selectOption("party");
    await page.locator("#party-address").fill("200 Oak St, Sherrills Ford NC");
    await page.locator("#party-address").blur();
    await expect(ui.quote(page)).toHaveText("out of our service area.");
    expect(posts).toEqual([]);
  });

  test("Two Trees from Cornelius is blocked", async ({ page }) => {
    const posts = await installMocks(page, { miles: 5 });
    await page.goto("/");
    await ui.tripType(page).selectOption("local");
    await ui.localKind(page).selectOption("bar");
    await ui.bar(page).selectOption("two-trees");
    await ui.pickup(page).fill("10 Main St, Cornelius NC 28031");
    await expect(ui.quote(page)).toHaveText("out of our service area.");
    expect(posts).toEqual([]);
  });

  test("a group 19.9 miles away is quoted", async ({ page }) => {
    const posts = await installMocks(page, { miles: 19.9 });
    await page.goto("/");
    await ui.tripType(page).selectOption("group");
    await ui.hours(page).fill("2");
    await ui.pickup(page).fill("100 N Main St, Denver NC 28037");
    await ui.pickup(page).blur();
    await expect(ui.quote(page)).toContainText("Cash $250.00");
    await expect(ui.quote(page)).not.toContainText("out of our service area.");
    expect(posts).toEqual([]);
  });

  test("a group 20.1 miles away is blocked", async ({ page }) => {
    const posts = await installMocks(page, { miles: 20.1 });
    await page.goto("/");
    await ui.tripType(page).selectOption("group");
    await ui.hours(page).fill("2");
    await ui.pickup(page).fill("100 N Main St, Denver NC 28037");
    await ui.pickup(page).blur();
    await expect(ui.quote(page)).toHaveText("out of our service area.");
    expect(posts).toEqual([]);
  });

  test("a Mooresville group pickup is refused at any distance", async ({
    page,
  }) => {
    const posts = await installMocks(page, { miles: 5 });
    await page.goto("/");
    await ui.tripType(page).selectOption("group");
    await ui.hours(page).fill("2");
    await ui.pickup(page).fill("100 N Main St, Mooresville NC 28115");
    await ui.pickup(page).blur();
    await expect(ui.quote(page)).toHaveText(
      "Sorry, we don't service that area.",
    );
    expect(posts).toEqual([]);
  });
});

// The four hero boxes, found by their link names inside the page banner.
const HERO_LINKS = [
  "Book an Airport Ride",
  "Call (980) 422-9125",
  "Book a Group Ride",
  "Book a Bar Ride",
];
const heroLink = (page, name) =>
  page.getByRole("banner").getByRole("link", { name });

async function quietNetwork(page) {
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
}

test.describe("hero CTAs above the fold on phones", () => {
  const viewports = [
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 393, height: 852 },
    { width: 430, height: 932 },
  ];

  for (const { width, height } of viewports) {
    test(`four booking boxes fit in ${width}x${height}`, async ({ page }) => {
      await quietNetwork(page);
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await page.evaluate(() => document.fonts && document.fonts.ready);

      const boxes = [];
      for (const name of HERO_LINKS) {
        const link = heroLink(page, name);
        await expect(link).toBeVisible();
        await expect(link).toBeInViewport({ ratio: 1 });
        const box = await link.boundingBox();
        expect(box, `${name} missing box`).toBeTruthy();
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

  for (const width of widths) {
    test(`front page box labels fit at ${width}px`, async ({ page }) => {
      await quietNetwork(page);
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      await page.evaluate(() => document.fonts && document.fonts.ready);

      const fit = {};
      for (const name of HERO_LINKS) {
        const link = heroLink(page, name);
        await expect(link).toHaveText(name);
        // Pixel check: compare the text's own rectangles with the box's padding edges.
        fit[name] = await link.evaluate((el) => {
          const box = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const range = document.createRange();
          range.selectNodeContents(el);
          const rects = [...range.getClientRects()];
          return {
            text: el.innerText.replace(/\s+/g, " ").trim(),
            width: box.width,
            height: box.height,
            textLeft: Math.min(...rects.map((rect) => rect.left)),
            textRight: Math.max(...rects.map((rect) => rect.right)),
            innerLeft:
              box.left +
              parseFloat(cs.borderLeftWidth) +
              parseFloat(cs.paddingLeft),
            innerRight:
              box.right -
              parseFloat(cs.borderRightWidth) -
              parseFloat(cs.paddingRight),
          };
        });
      }

      const widthsFound = Object.values(fit).map((box) => box.width);
      for (const name of HERO_LINKS) {
        expect(fit[name].text).toBe(name);
        expect(fit[name].textLeft).toBeGreaterThanOrEqual(
          fit[name].innerLeft - 0.5,
        );
        expect(fit[name].textRight).toBeLessThanOrEqual(
          fit[name].innerRight + 0.5,
        );
      }
      expect(Math.max(...widthsFound) - Math.min(...widthsFound)).toBeLessThan(
        2,
      );
    });
  }
});
