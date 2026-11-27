// Typed time entry from Donald's Nov 16, 2026 spec (replaces the wheel picker), at phone width.
import {
  test,
  expect,
  bookingMocks,
  fillGroup,
  settled,
  formText,
} from "./helpers/booking-mocks.js";

const shots = process.env.MELKN_SHOTS_DIR;
const request = (page) =>
  page.getByRole("button", { name: "Request Booking", exact: true });
const pickupBox = (page) => page.getByLabel("Pickup Time *", { exact: true });
const ampm = (page) =>
  page.getByRole("group", { name: "Pickup Time AM or PM *", exact: true });

async function showTime(page) {
  await page.getByText("Pickup Time *", { exact: true }).evaluate((el) => {
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top - 150, behavior: "instant" });
  });
  await settled(page);
  await expect(ampm(page)).toBeInViewport({ ratio: 1 });
}

test.describe("typed pickup time at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("starts blank, takes 730 plus PM, and sends 7:30 PM in the usual format", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await page
      .getByRole("combobox", { name: "Trip type" })
      .selectOption("group");
    await expect(pickupBox(page)).toHaveValue("");
    await expect(pickupBox(page)).toHaveAttribute("inputmode", "numeric");
    for (const p of ["AM", "PM"]) {
      await expect(
        ampm(page).getByRole("radio", { name: p, exact: true }),
      ).not.toBeChecked();
    }
    await fillGroup(page, { time: "730", period: "PM" });
    await pickupBox(page).blur();
    await expect(pickupBox(page)).toHaveValue("7:30");
    await expect(
      ampm(page).getByRole("radio", { name: "PM", exact: true }),
    ).toBeChecked();
    if (shots) {
      await showTime(page);
      await page.screenshot({ path: shots + "/melkn-time-entry.png" });
    }
    await request(page).click();
    await expect(
      page.getByRole("heading", { name: /Request received/ }),
    ).toBeVisible();
    expect(state.forms).toHaveLength(1);
    const sent = formText(state.forms[0]);
    expect(sent).toMatch(/\d{2}\/\d{2}\/\d{4} 19:30:00/);
    await expect.poll(() => state.calendars.length).toBe(1);
    expect(JSON.parse(state.calendars[0]).pickupTime).toBe("19:30:00");
  });

  test("will not send without AM or PM, and names the problem", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await fillGroup(page, { time: "7:30", period: null });
    await request(page).click();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Please choose AM or PM for the pickup time" }),
    ).toBeVisible();
    expect(state.forms).toHaveLength(0);
    if (shots) {
      await showTime(page);
      await page.screenshot({ path: shots + "/melkn-time-error.png" });
    }
  });

  test("rejects an impossible time and a blank one", async ({ page }) => {
    const state = await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await fillGroup(page, { time: "13:75", period: "AM" });
    await request(page).click();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Pickup Time: enter a real time, like 7:30" }),
    ).toBeVisible();
    await pickupBox(page).fill("");
    await request(page).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: "Pickup Time is required" }),
    ).toBeVisible();
    expect(state.forms).toHaveLength(0);
  });
});
