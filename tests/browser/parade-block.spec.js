// Donald, Nov 25, 2026: no ride on Dec 5, 2026 from 7:00 AM up to (not including) 4:00 PM Eastern. A rider who picks
// Dec 5 at 10:00 AM sees a plain message and nothing is sent. This spec uses real dates, like the other browser specs, so it is valid until Dec 4, 2026. Set MELKN_SHOTS_DIR to save the screenshots for Donald.
import {
  test,
  expect,
  bookingMocks,
  fillAirport,
  typeTimeAt,
  pick,
} from "./helpers/booking-mocks.js";

const shots = process.env.MELKN_SHOTS_DIR;
const MESSAGE =
  "We're sorry, we are in the Denver Christmas parade today. We're sorry, we couldn't help you. You can book after 4 PM.";
const request = (page) =>
  page.getByRole("button", { name: "Request Booking", exact: true });

async function openAt(page, state) {
  await page.goto("/#booking");
  return state;
}

async function oneWayOn(page, day, time, period) {
  await fillAirport(page, { pickup: "55 Quiet Hollow Rd" });
  await pick(page.getByRole("textbox", { name: "Select date" }).first(), day);
  await typeTimeAt(page, "Pickup Time", time, period);
  await expect(page.getByText(/Cash \$/).first()).toBeVisible();
}

test.describe("Dec 5 parade block", () => {
  test("Dec 5 at 10:00 AM shows the message and sends nothing", async ({
    page,
  }) => {
    const state = await bookingMocks(page);
    await openAt(page);
    await oneWayOn(page, "2026-12-05", "10:00", "AM");
    await request(page).click();
    await expect(page.locator("#booking-success")).toContainText(MESSAGE);
    await expect(page.locator("#date-error")).toHaveText(MESSAGE);
    const popup = page.getByRole("alertdialog");
    await expect(popup).toBeVisible();
    await expect(popup).toContainText(MESSAGE);
    expect(state.forms).toHaveLength(0);
    expect(state.calendars).toHaveLength(0);
    if (shots) {
      await page.screenshot({ path: `${shots}/dec5-10am-popup.png` });
    }
    await popup.getByRole("button", { name: "OK" }).click();
    await expect(popup).toBeHidden();
  });

  test("Dec 5 at 7:00 AM and 3:59 PM are blocked", async ({ page }) => {
    const state = await bookingMocks(page);
    await openAt(page);
    await oneWayOn(page, "2026-12-05", "7:00", "AM");
    await request(page).click();
    await expect(page.locator("#booking-success")).toContainText(MESSAGE);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "OK" })
      .click();
    await typeTimeAt(page, "Pickup Time", "3:59", "PM");
    await request(page).click();
    await expect(page.locator("#booking-success")).toContainText(MESSAGE);
    expect(state.forms).toHaveLength(0);
  });

  test("Dec 5 at 6:59 AM and 4:00 PM still book", async ({ page }) => {
    const state = await bookingMocks(page);
    await openAt(page);
    await oneWayOn(page, "2026-12-05", "6:59", "AM");
    await request(page).click();
    await expect(
      page.getByRole("heading", { name: /Request received/ }),
    ).toBeVisible();
    expect(state.forms).toHaveLength(1);
    await page
      .getByRole("button", { name: "Make Another Booking", exact: true })
      .click();
    await openAt(page);
    await oneWayOn(page, "2026-12-05", "4:00", "PM");
    await request(page).click();
    await expect(
      page.getByRole("heading", { name: /Request received/ }),
    ).toBeVisible();
    expect(state.forms).toHaveLength(2);
    expect(await page.locator("#booking-success").textContent()).not.toContain(
      "parade",
    );
    if (shots) await page.screenshot({ path: `${shots}/dec5-4pm-books.png` });
  });

  for (const day of ["2026-12-04", "2026-12-06"]) {
    test(`${day} at 10:00 AM still books`, async ({ page }) => {
      const state = await bookingMocks(page);
      await openAt(page);
      await oneWayOn(page, day, "10:00", "AM");
      await request(page).click();
      await expect(
        page.getByRole("heading", { name: /Request received/ }),
      ).toBeVisible();
      expect(state.forms).toHaveLength(1);
    });
  }

  test("a round trip with the return leg on Dec 5 at 10:00 AM is blocked", async ({
    page,
  }) => {
    const state = await bookingMocks(page);
    await openAt(page);
    await fillAirport(page, { round: true });
    await pick(
      page.getByRole("textbox", { name: "Select date" }).first(),
      "2026-12-04",
    );
    await typeTimeAt(page, "Pickup Time", "10:00", "AM");
    await pick(
      page.getByRole("textbox", { name: "Select date" }).nth(1),
      "2026-12-05",
    );
    await typeTimeAt(page, "Return Pickup Time", "10:00", "AM");
    await request(page).click();
    await expect(page.locator("#booking-success")).toContainText(MESSAGE);
    await expect(page.locator("#return-date-error")).toHaveText(MESSAGE);
    await expect(page.getByRole("alertdialog")).toContainText(MESSAGE);
    expect(state.forms).toHaveLength(0);
    if (shots)
      await page.screenshot({ path: `${shots}/dec5-return-leg-popup.png` });
  });
});
