// Donald, Nov 25, 2026: every bar and party ride is inside a 15 road-mile radius around Two Trees, with Mooresville cut flat at
// 8.34 road miles (the Harris Teeter light at Perth Rd). Set MELKN_SHOTS_DIR to save screenshots.
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
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}

test.describe("15 mile radius and the Mooresville flat side", () => {
  test("Mooresville inside 8.34 miles is quoted for Two Trees", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 8.34 });
    await barQuote(page, {
      bar: "two-trees",
      pickup: "10 Main St, Mooresville NC 28115",
    });
    await expect(page.locator("#quote-details")).toContainText("Cash $25.00");
    await shot(page, "reach-mooresville-inside-834");
    expect(state.forms).toHaveLength(0);
  });

  test("Mooresville past 8.34 miles is refused in the price box and on submit", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 8.4 });
    await barQuote(page, {
      bar: "bourbon-bobber",
      pickup: "10 Main St, Mooresville NC 28115",
    });
    await expect(page.locator("#quote-details")).toHaveText(SORRY);
    await shot(page, "reach-mooresville-past-flat-side");
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
});
