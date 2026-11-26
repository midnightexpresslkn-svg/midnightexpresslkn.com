// Donald, Nov 25, 2026: every bar and party ride is inside a 15 road-mile radius around Two Trees, and Mooresville is out completely
// (9:50 PM: "Just take Mooresville out completely"), 118 Argus Ln (the old Harris Teeter allowance) included. Set MELKN_SHOTS_DIR to save screenshots.
import {
  test,
  expect,
  bookingMocks,
  fillAirport,
  typeTimeAt,
  pick,
} from "./helpers/booking-mocks.js";

const shots = process.env.MELKN_SHOTS_DIR;
const SORRY = "Sorry, we don't service that area.";
const FAR = "out of our service area.";
const request = (page) =>
  page.getByRole("button", { name: "Request Booking", exact: true });

async function dayAndTime(page) {
  await pick(
    page.getByRole("textbox", { name: "Select date" }).first(),
    "2026-12-12",
  );
  await typeTimeAt(page, "Pickup Time", "10:00", "AM");
}

async function barQuote(page, { bar, pickup }) {
  await page.goto("/#booking");
  await fillAirport(page, {});
  await page.getByRole("combobox", { name: "Trip type" }).selectOption("local");
  await page.locator("#local-kind").selectOption("bar");
  await page.locator("#bar-choice").selectOption(bar);
  await page.locator("#booking-pickup").fill(pickup);
}

async function shot(page, name) {
  await page.locator("#booking-quote").scrollIntoViewIfNeeded();
  // The whole booking form, so the shot shows the typed address and the refusal together.
  if (shots)
    await page
      .locator("form")
      .filter({ has: page.locator("#booking-quote") })
      .first()
      .screenshot({ path: `${shots}/${name}.png` });
}

test.describe("15 mile radius, and Mooresville is out completely", () => {
  test("Mooresville inside what used to be the 8.34 mile allowance is refused for Two Trees", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 8.34 });
    await barQuote(page, {
      bar: "two-trees",
      pickup: "10 Main St, Mooresville NC 28115",
    });
    await expect(page.locator("#quote-details")).toHaveText(FAR);
    await shot(page, "mooresville-two-trees-refused");
    await dayAndTime(page);
    await request(page).click();
    await expect(page.locator("#booking-success")).toContainText(FAR);
    expect(state.forms).toHaveLength(0);
  });

  test("a Mooresville bar ride is refused in the price box and on submit", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 5 });
    await barQuote(page, {
      bar: "bourbon-bobber",
      pickup: "10 Main St, Mooresville NC 28115",
    });
    await expect(page.locator("#quote-details")).toHaveText(SORRY);
    await shot(page, "mooresville-bar-refused");
    await dayAndTime(page);
    await request(page).click();
    await expect(page.locator("#booking-success")).toContainText(SORRY);
    expect(state.forms).toHaveLength(0);
  });

  test("118 Argus Ln, Mooresville (the old Harris Teeter allowance) is refused", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 8.3 });
    await barQuote(page, {
      bar: "bourbon-bobber",
      pickup: "118 Argus Ln, Mooresville NC 28117",
    });
    await expect(page.locator("#quote-details")).toHaveText(SORRY);
    await shot(page, "mooresville-argus-ln-refused");
    await dayAndTime(page);
    await request(page).click();
    await expect(page.locator("#booking-success")).toContainText(SORRY);
    expect(state.forms).toHaveLength(0);
  });

  test("a party from, or to, a Mooresville address is refused", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 5 });
    await page.goto("/#booking");
    await fillAirport(page, {});
    await page
      .getByRole("combobox", { name: "Trip type" })
      .selectOption("local");
    await page.locator("#local-kind").selectOption("party");
    await page
      .locator("#booking-pickup")
      .fill("123 Main Street, Denver NC 28037");
    await page.locator("#party-address").fill("118 Argus Ln, Mooresville NC");
    await page.locator("#party-address").blur();
    await expect(page.locator("#quote-details")).toHaveText(SORRY);
    await shot(page, "mooresville-party-address-refused");
    await page
      .locator("#booking-pickup")
      .fill("118 Argus Ln, Mooresville NC 28117");
    await page.locator("#party-address").fill("200 Oak St, Sherrills Ford NC");
    await page.locator("#party-address").blur();
    await expect(page.locator("#quote-details")).toHaveText(SORRY);
    expect(state.forms).toHaveLength(0);
  });

  test("a Mooresville group pickup is refused, and a Mooresville airport ride too", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 5 });
    await page.goto("/#booking");
    await fillAirport(page, {});
    await page
      .getByRole("combobox", { name: "Trip type" })
      .selectOption("group");
    await page
      .locator("#booking-pickup")
      .fill("118 Argus Ln, Mooresville NC 28117");
    await expect(page.locator("#quote-details")).toHaveText(SORRY);
    await shot(page, "mooresville-group-refused");
    await page.reload();
    await fillAirport(page, { pickup: "118 Argus Ln, Mooresville NC 28117" });
    await dayAndTime(page);
    await request(page).click();
    await expect(page.locator("#booking-success")).toContainText(SORRY);
    expect(state.forms).toHaveLength(0);
  });

  test("a bar at exactly 15 road miles is quoted", async ({ page }) => {
    const inside = await bookingMocks(page, { miles: 15 });
    await barQuote(page, {
      bar: "two-trees",
      pickup: "123 Main Street, Denver NC 28037",
    });
    await expect(page.locator("#quote-details")).toContainText("Cash $45.00");
    await shot(page, "reach-bar-15-miles-inside");
    expect(inside.forms).toHaveLength(0);
  });

  test("a bar past 15 road miles is refused", async ({ page }) => {
    const state = await bookingMocks(page, { miles: 15.1 });
    await barQuote(page, {
      bar: "bourbon-bobber",
      pickup: "123 Main Street, Denver NC 28037",
    });
    await expect(page.locator("#quote-details")).toHaveText(FAR);
    await shot(page, "reach-bar-past-15-miles");
    await dayAndTime(page);
    await request(page).click();
    await expect(page.locator("#booking-success")).toContainText(FAR);
    expect(state.forms).toHaveLength(0);
  });

  test("a party whose address is past 15 road miles is refused", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 15.1 });
    await page.goto("/#booking");
    await fillAirport(page, {});
    await page
      .getByRole("combobox", { name: "Trip type" })
      .selectOption("local");
    await page.locator("#local-kind").selectOption("party");
    await page
      .locator("#booking-pickup")
      .fill("123 Main Street, Denver NC 28037");
    await page.locator("#party-address").fill("200 Oak St, Sherrills Ford NC");
    await page.locator("#party-address").blur();
    await expect(page.locator("#quote-details")).toHaveText(FAR);
    await shot(page, "reach-party-past-15-miles");
    expect(state.forms).toHaveLength(0);
  });

  test("a listed Mooresville bar is refused at quote time from a served pickup", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 6 });
    await barQuote(page, {
      bar: "blue-parrot",
      pickup: "123 Main Street, Denver NC 28037",
    });
    await expect(page.locator("#quote-details")).toHaveText(SORRY);
    await shot(page, "mooresville-listed-bar-refused");
    await dayAndTime(page);
    await request(page).click();
    await expect(page.locator("#booking-success")).toContainText(SORRY);
    expect(state.forms).toHaveLength(0);
  });

  test("a Mooresville private airfield is refused when the home is in Denver", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 12 });
    await page.goto("/#booking");
    await fillAirport(page, { pickup: "123 Main Street, Denver NC 28037" });
    await page
      .getByRole("combobox", { name: "Airport", exact: true })
      .selectOption("PRIVATE");
    await page.locator("#airfield-name").fill("Smith Field");
    await page
      .locator("#airfield-address")
      .fill("100 Runway Rd, Mooresville NC 28117");
    await expect(page.locator("#quote-details")).toHaveText(SORRY);
    await shot(page, "mooresville-private-airfield-refused");
    await dayAndTime(page);
    await request(page).click();
    await expect(page.locator("#booking-success")).toContainText(SORRY);
    expect(state.forms).toHaveLength(0);
  });
});
