// Donald, Nov 25, 2026: an airport or (non-Two-Trees) bar ride from Cornelius, Davidson, Huntersville, Troutman or Statesville
// shows the pop-up "We're sorry, you're a little out of our service area, but if you give us a call, we could probably help you."
// Mooresville and Two Trees keep their existing wording. Uses real dates like the other specs. Set MELKN_SHOTS_DIR to save screenshots.
import {
  test,
  expect,
  bookingMocks,
  fillAirport,
  typeTimeAt,
  pick,
} from "./helpers/booking-mocks.js";

const shots = process.env.MELKN_SHOTS_DIR;
const CALL_US =
  "We're sorry, you're a little out of our service area, but if you give us a call, we could probably help you.";
const request = (page) =>
  page.getByRole("button", { name: "Request Booking", exact: true });

async function dayAndTime(page) {
  await pick(
    page.getByRole("textbox", { name: "Select date" }).first(),
    "2026-12-12",
  );
  await typeTimeAt(page, "Pickup Time", "10:00", "AM");
}

test.describe("call-us pop-up", () => {
  test("an airport ride from Cornelius shows the pop-up and sends nothing", async ({
    page,
  }) => {
    const state = await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page, { pickup: "10 Main St, Cornelius NC 28031" });
    await dayAndTime(page);
    await request(page).click();
    await expect(page.locator("#booking-success")).toContainText(CALL_US);
    await expect(page.locator("#pickup-error")).toHaveText(CALL_US);
    const popup = page.getByRole("alertdialog");
    await expect(popup).toBeVisible();
    await expect(popup).toContainText(CALL_US);
    expect(state.forms).toHaveLength(0);
    expect(state.calendars).toHaveLength(0);
    if (shots)
      await page.screenshot({ path: `${shots}/call-us-airport-cornelius.png` });
    await popup.getByRole("button", { name: "OK" }).click();
    await expect(popup).toBeHidden();
  });

  test("Escape closes it", async ({ page }) => {
    await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page, { pickup: "10 Main St, Statesville NC 28677" });
    await dayAndTime(page);
    await request(page).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();
  });

  test("a Bourbon & Bobbers ride from Huntersville shows the call-us text in the price box and the pop-up on request", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 8 });
    await page.goto("/#booking");
    await fillAirport(page, {});
    await page
      .getByRole("combobox", { name: "Trip type" })
      .selectOption("local");
    await page.locator("#local-kind").selectOption("bar");
    await page.locator("#bar-choice").selectOption("bourbon-bobber");
    await page
      .locator("#booking-pickup")
      .fill("10 Main St, Huntersville NC 28078");
    await expect(page.locator("#quote-details")).toHaveText(CALL_US);
    await page.locator("#booking-quote").scrollIntoViewIfNeeded();
    if (shots)
      await page.screenshot({
        path: `${shots}/call-us-bar-quote-huntersville.png`,
      });
    await dayAndTime(page);
    await request(page).click();
    await expect(page.getByRole("alertdialog")).toContainText(CALL_US);
    if (shots)
      await page.screenshot({
        path: `${shots}/call-us-bar-popup-huntersville.png`,
      });
    expect(state.forms).toHaveLength(0);
  });

  test("Mooresville and Two Trees keep the flat wording, no pop-up", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 8 });
    await page.goto("/#booking");
    await fillAirport(page, { pickup: "10 Main St, Mooresville NC 28115" });
    await dayAndTime(page);
    await request(page).click();
    await expect(page.locator("#booking-success")).toContainText(
      "Sorry, we don't service that area.",
    );
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    if (shots)
      await page.screenshot({
        path: `${shots}/refusal-airport-mooresville.png`,
      });
    await page.reload();
    await page
      .getByRole("combobox", { name: "Trip type" })
      .selectOption("local");
    await page.locator("#local-kind").selectOption("bar");
    await page.locator("#bar-choice").selectOption("two-trees");
    await page
      .locator("#booking-pickup")
      .fill("10 Main St, Cornelius NC 28031");
    await expect(page.locator("#quote-details")).toHaveText(
      "out of our service area.",
    );
    expect(state.forms).toHaveLength(0);
  });

  test("an airport ride from Denver still books, no pop-up", async ({
    page,
  }) => {
    const state = await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page, {});
    await dayAndTime(page);
    await request(page).click();
    await expect(
      page.getByRole("heading", { name: /Request received/ }),
    ).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(state.forms).toHaveLength(1);
  });
});
