// Bar form changes from Donald's Nov 16, 2026 spec, at phone width.
import {
  test,
  expect,
  bookingMocks,
  fillBar,
  settled,
} from "./helpers/booking-mocks.js";

const shots = process.env.MELKN_SHOTS_DIR;
const request = (page) =>
  page.getByRole("button", { name: "Request Booking", exact: true });
const agreement = (page) =>
  page.getByRole("checkbox", {
    name: "Must be 21 years or older, cannot smoke, and you are responsible for any damages. *",
  });

test.describe("bar form at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("round trip starts unanswered, Yes asks about the ride back, and one box agrees", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await page
      .getByRole("combobox", { name: "Trip type" })
      .selectOption("local");
    await page.locator("#local-kind").selectOption("bar");
    const round = page.getByRole("group", { name: /Round trip/ });
    await expect(
      round.getByRole("radio", { name: "Yes", exact: true }),
    ).not.toBeChecked();
    await expect(
      round.getByRole("radio", { name: "No", exact: true }),
    ).not.toBeChecked();
    await expect(page.getByLabel(/Passengers for the ride back/)).toBeHidden();
    await expect(agreement(page)).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "No smoking *" }),
    ).toBeHidden();

    await fillBar(page, { round: true });
    await expect(page.getByLabel(/Return pickup location/)).toBeVisible();
    if (shots) {
      await page
        .getByRole("combobox", { name: "Trip type" })
        .evaluate((el) => el.scrollIntoView({ block: "start" }));
      await settled(page);
      await page.screenshot({ path: shots + "/melkn-bar-form-top.png" });
      await round.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await settled(page);
      await page.screenshot({ path: shots + "/melkn-bar-form-lower.png" });
    }
    await request(page).click();
    await expect(
      page.getByRole("heading", { name: /Request received/ }),
    ).toBeVisible();
    expect(state.forms).toHaveLength(1);
    const sent = decodeURIComponent(state.forms[0].replace(/\+/g, " "));
    expect(sent).toContain("Passengers back: 3");
    expect(sent).toContain("Return pickup time: 11:30 PM");
    expect(sent).toContain("Return pickup location: Two Trees front door");
    expect(sent).toContain(
      "Agreement (Must be 21 years or older, cannot smoke, and you are responsible for any damages.): Yes",
    );
  });

  test("names each missing bar answer and sends nothing", async ({ page }) => {
    const state = await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await fillBar(page, { agree: false });
    await page
      .getByRole("group", { name: /Round trip/ })
      .getByRole("radio", { name: "Yes", exact: true })
      .check();
    await request(page).click();
    for (const message of [
      "Please enter how many passengers ride back.",
      "Please choose a return pickup time.",
      "Please enter where to pick you up for the ride back.",
      /^Please check the box: Must be 21 years or older/,
    ]) {
      await expect(page.getByText(message)).toHaveCount(2);
      await expect(
        page.getByRole("listitem").filter({ hasText: message }),
      ).toBeVisible();
    }
    expect(state.forms).toHaveLength(0);
    if (shots) {
      await page
        .getByRole("group", { name: /Round trip/ })
        .evaluate((el) => el.scrollIntoView({ block: "start" }));
      await settled(page);
      await page.screenshot({ path: shots + "/melkn-bar-form-error.png" });
    }
  });
});
