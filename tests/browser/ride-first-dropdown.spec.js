// Charlotte Ride fix (Donald, Nov 27, 2026): "Just a ride" is on the first dropdown and the first page, and it opens
// the Ride form (the same form ?type=local&kind=ride opens). All Google calls are mocked by bookingMocks.
import {
  test,
  expect,
  bookingMocks,
  typeTimeAt,
  pick,
} from "./helpers/booking-mocks.js";
import { ui } from "./helpers/ui.js";

const shots = process.env.MELKN_SHOTS_DIR;
const DENVER = "123 Main Street, Denver NC 28037";
const CHARLOTTE = "100 Tryon St, Charlotte NC 28202";

test.describe("Just a ride on the first page", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the first dropdown lists Just a ride between Local Bars and Parties and Group", async ({
    page,
  }) => {
    await bookingMocks(page, { miles: 8 });
    await page.goto("/#booking");
    await expect(ui.tripType(page)).toBeVisible();
    const labels = await ui.tripType(page).locator("option").allTextContents();
    expect(labels).toEqual([
      "Select…",
      "Airport",
      "Local Bars and Parties",
      "Just a ride",
      "Group",
    ]);
    if (shots) {
      // A headless page cannot draw the native pop-up, so show the same options as an open list for the picture.
      await ui.tripType(page).evaluate((select) => {
        select.size = 5;
      });
      await page
        .getByRole("listbox", { name: "Trip type *" })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${shots}/first-page-dropdown-just-a-ride.png`,
      });
    }
  });

  test("choosing Just a ride on the first dropdown opens the Ride form", async ({
    page,
  }) => {
    await bookingMocks(page, { miles: 8 });
    await page.goto("/#booking");
    await ui.tripType(page).selectOption({ label: "Just a ride" });
    await expect(ui.localKind(page)).toHaveValue("ride");
    await expect(ui.dropoff(page)).toBeVisible();
    await expect(ui.agreement(page)).toBeHidden();
    await expect(ui.tripType(page)).toHaveValue("local");
    if (shots) {
      await ui.localKind(page).evaluate((select) => {
        select.scrollIntoView({ block: "start" });
        window.scrollBy(0, -110);
      });
      await page.screenshot({
        path: `${shots}/ride-form-from-first-dropdown.png`,
      });
    }
  });

  test("the Book a Ride button on the services section opens the Ride form", async ({
    page,
  }) => {
    await bookingMocks(page, { miles: 8 });
    await page.goto("/");
    const cta = page.getByRole("link", { name: "Book a Ride", exact: true });
    await expect(cta).toHaveAttribute("href", "/?type=local&kind=ride#booking");
    if (shots) {
      await cta.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${shots}/services-book-a-ride-button.png`,
      });
    }
    await cta.click();
    await expect(page).toHaveURL(/type=local&kind=ride/);
    await expect(ui.localKind(page)).toHaveValue("ride");
    await expect(ui.tripType(page)).toBeHidden();
    await expect(ui.dropoff(page)).toBeVisible();
  });

  test("the ?type=local&kind=ride preset still opens the Ride form", async ({
    page,
  }) => {
    await bookingMocks(page, { miles: 8 });
    await page.goto("/?type=local&kind=ride#booking");
    await expect(ui.localKind(page)).toHaveValue("ride");
    await expect(ui.tripType(page)).toBeHidden();
    await expect(ui.dropoff(page)).toBeVisible();
  });

  test("a Charlotte ride booked from the first dropdown sends localKind ride and allowCharlotte", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 20 });
    await page.goto("/#booking");
    await ui.tripType(page).selectOption({ label: "Just a ride" });
    await expect(ui.dropoff(page)).toBeVisible();
    await page.getByPlaceholder("Jane Smith").fill("Isolated QA Rider");
    await page.getByPlaceholder("5555551234").fill("5555550199");
    await page.getByPlaceholder("email@example.com").fill("qa@example.invalid");
    await page.getByRole("spinbutton", { name: /Online:/ }).fill("2");
    await pick(ui.date(page), "2026-12-15");
    await typeTimeAt(page, "Pickup Time", "10:00", "AM");
    await ui.pickup(page).fill(DENVER);
    await ui.dropoff(page).fill(CHARLOTTE);
    await ui.dropoff(page).blur();
    await page
      .getByRole("group", { name: /Round trip/ })
      .getByRole("radio", { name: "No", exact: true })
      .check();
    await expect(ui.quote(page)).toContainText("Cash $60.00");
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText("Request received");
    expect(state.calendars.length).toBe(1);
    const body = JSON.parse(state.calendars[0]);
    expect(body.localKind).toBe("ride");
    expect(body.allowCharlotte).toBe(true);
    expect(body.destinationAddress).toBe(CHARLOTTE);
  });
});
