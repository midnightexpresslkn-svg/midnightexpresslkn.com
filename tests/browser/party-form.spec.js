// Party form changes from Donald's Nov 16, 2026 spec, at phone width.
import {
  test,
  expect,
  bookingMocks,
  fillParty,
  settled,
} from "./helpers/booking-mocks.js";

const shots = process.env.MELKN_SHOTS_DIR;
const request = (page) =>
  page.getByRole("button", { name: "Request Booking", exact: true });
const AGREEMENT =
  "Must be 21 years or older, cannot smoke, and you are responsible for any damages.";

/** Asserts the fields sit top to bottom in this order on the page. */
async function inOrder(locators) {
  let last = -Infinity;
  for (const locator of locators) {
    await expect(locator).toBeVisible();
    const top = await locator.evaluate(
      (el) => el.getBoundingClientRect().top + window.scrollY,
    );
    expect(top, `${locator} comes after the field above it`).toBeGreaterThan(
      last,
    );
    last = top;
  }
}

test.describe("party form at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a round-trip party asks every party question and sends them in Notes", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await page
      .getByRole("combobox", { name: "Trip type" })
      .selectOption("local");
    await page
      .getByRole("combobox", { name: "Bar, restaurant, or party" })
      .selectOption("party");
    const round = page.getByRole("group", { name: /Round trip/ });
    await expect(
      round.getByRole("radio", { name: "Yes", exact: true }),
    ).not.toBeChecked();
    await expect(
      round.getByRole("radio", { name: "No", exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("list").filter({ hasText: "Two Trees" }),
    ).toBeHidden();
    await expect(
      page.getByPlaceholder("Where should we take you after the party?"),
    ).toBeHidden();
    await expect(page.getByLabel("Second pickup address *")).toBeHidden();
    await expect(
      page.getByRole("checkbox", { name: `${AGREEMENT} *` }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "No smoking *" }),
    ).toBeHidden();
    await expect(
      page.getByRole("textbox", { name: "Special Notes" }),
    ).toHaveAttribute(
      "placeholder",
      "Anything we should know? For example: drinks, music style.",
    );

    await fillParty(page, { round: true });
    await settled(page);
    await inOrder([
      page.getByLabel("Party address *", { exact: true }),
      page.getByLabel("Pickup address *", { exact: true }),
      page.getByRole("group", { name: /Second pickup location/ }),
      page.getByLabel("Second pickup address *"),
    ]);
    await inOrder([
      round,
      page.getByPlaceholder("Where should we take you after the party?"),
      page.getByRole("group", { name: /More than one drop-off location/ }),
      page.getByLabel("Other drop-off location *"),
      page.getByLabel(/How many people for the ride back/),
    ]);
    if (shots) {
      await page
        .getByRole("combobox", { name: "Bar, restaurant, or party" })
        .evaluate((el) => el.scrollIntoView({ block: "start" }));
      await settled(page);
      await page.screenshot({ path: shots + "/melkn-party-form-top.png" });
      await round.evaluate((el) => {
        el.scrollIntoView({ block: "start" });
        window.scrollBy(0, -70);
      });
      await settled(page);
      await page.screenshot({ path: shots + "/melkn-party-form-lower.png" });
    }
    await request(page).click();
    await expect(
      page.getByRole("heading", { name: /Request received/ }),
    ).toBeVisible();
    expect(state.forms).toHaveLength(1);
    const sent = decodeURIComponent(state.forms[0].replace(/\+/g, " "));
    for (const line of [
      `Agreement (${AGREEMENT}): Yes`,
      "Second pickup address: 300 Pine St, Denver NC",
      "Drop-off location: 100 Main St, Denver NC",
      "Other drop-off location: 50 Lake Rd, Cornelius NC",
      "People for the ride back: 4",
      "Special requests: Birthday banner on the door",
    ]) {
      expect(sent).toContain(line);
    }
  });

  test("names each missing party answer and sends nothing", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await fillParty(page, { agree: false, second: false });
    await page
      .getByRole("group", { name: /Second pickup location/ })
      .getByRole("radio", { name: "Yes", exact: true })
      .check();
    await page
      .getByRole("group", { name: /Round trip/ })
      .getByRole("radio", { name: "Yes", exact: true })
      .check();
    await request(page).click();
    for (const message of [
      "Please enter the second pickup address.",
      "Please enter where to drop you off after the party.",
      "Please choose Yes or No for more than one drop-off location.",
      "Please enter how many people ride back.",
      /^Please check the box: Must be 21 years or older/,
    ]) {
      await expect(page.getByText(message)).toHaveCount(2);
      await expect(
        page.getByRole("listitem").filter({ hasText: message }),
      ).toBeVisible();
    }
    expect(state.forms).toHaveLength(0);
    if (shots) {
      await page.getByRole("group", { name: /Round trip/ }).evaluate((el) => {
        el.scrollIntoView({ block: "start" });
        window.scrollBy(0, -70);
      });
      await settled(page);
      await page.screenshot({ path: shots + "/melkn-party-form-error.png" });
    }
  });
});
