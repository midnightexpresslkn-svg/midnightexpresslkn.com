// Airport form questions from Donald's Nov 16, 2026 spec, at phone width.
import {
  test,
  expect,
  bookingMocks,
  fillAirport,
  settled,
} from "./helpers/booking-mocks.js";

const shots = process.env.MELKN_SHOTS_DIR;
const request = (page) =>
  page.getByRole("button", { name: "Request Booking", exact: true });
const group = (page, name) => page.getByRole("group", { name });

/** Asserts the fields sit top to bottom in this order on the screen. */
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

/** First-ride flight, Round trip, then the ride-back fields together (Donald, Nov 16 2026). */
const rideOrder = (page, first, back) => [
  page.getByLabel(first),
  group(page, /Round trip/),
  page.getByText("Return Pickup Date", { exact: true }),
  page.getByText("Return Pickup Time", { exact: true }),
  page.getByRole("spinbutton", {
    name: /Passengers back (to|from) the airport/,
  }),
  page.getByLabel(back),
];

test.describe("airport form at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("asks every airport question and sends the answers once", async ({
    page,
  }) => {
    const state = await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page);
    const carryOn = group(page, /Carry-on bags/);
    const help = group(page, /help with your luggage/);
    await expect(carryOn).toBeVisible();
    await expect(help).toBeVisible();
    await expect(page.getByLabel(/Departure flight number/)).toBeVisible();
    // One way to the airport: only the departure flight is asked.
    const arrival = page.getByLabel(/Arrival flight number/);
    await expect(arrival).toBeHidden();
    const round = page.getByRole("group", { name: /Round trip/ });
    // Passengers back is asked only on a round trip too.
    const back = page.getByRole("spinbutton", {
      name: /Passengers back from the airport/,
      includeHidden: true,
    });
    await expect(back).toBeHidden();
    await round.getByRole("radio", { name: "Yes", exact: true }).check();
    await expect(arrival).toBeVisible();
    await expect(arrival).toHaveAttribute("required", "");
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("required", "");
    await back.fill("3");
    await round.getByRole("radio", { name: "No", exact: true }).check();
    await expect(arrival).toBeHidden();
    await expect(back).toBeHidden();
    await expect(back).toHaveValue("");
    await expect(
      page.getByRole("textbox", { name: /Special Notes \*/ }),
    ).toHaveAttribute("placeholder", /extra stops.*arrival or departure curb/);

    // How many? is only required after Yes.
    const carryCount = page.locator("#booking-carryon-count");
    await carryOn.getByRole("radio", { name: "No", exact: true }).check();
    await expect(carryCount).not.toHaveAttribute("required", "");
    await carryOn.getByRole("radio", { name: "Yes", exact: true }).check();
    await expect(carryCount).toHaveAttribute("required", "");

    // Special items stay optional; Other opens an optional describe box.
    const describe = page.getByLabel("Describe other items");
    await expect(describe).toBeHidden();
    await page.getByRole("checkbox", { name: "Other items" }).check();
    await expect(describe).toBeVisible();
    await expect(describe).not.toHaveAttribute("required", "");

    await carryCount.fill("2");
    await help.getByRole("radio", { name: "Yes", exact: true }).check();
    await page.getByRole("checkbox", { name: "Golf Clubs" }).check();
    await describe.fill("a stroller");
    if (shots) {
      await page
        .getByRole("combobox", { name: "Trip type" })
        .evaluate((el) => el.scrollIntoView({ block: "start" }));
      await settled(page);
      await page.screenshot({ path: shots + "/melkn-airport-form-top.png" });
      await page
        .getByRole("group", { name: /Carry-on bags/ })
        .evaluate((el) => el.scrollIntoView({ block: "start" }));
      await settled(page);
      await page.screenshot({ path: shots + "/melkn-airport-form-oneway.png" });
    }
    await request(page).click();
    await expect(
      page.getByRole("heading", { name: /Request received/ }),
    ).toBeVisible();
    expect(state.forms).toHaveLength(1);
    const sent = decodeURIComponent(state.forms[0].replace(/\+/g, " "));
    expect(sent).toContain("Carry-on bags: Yes (2)");
    expect(sent).toContain("Help with luggage: Yes");
    expect(sent).toContain("Golf Clubs, Other: a stroller");
    expect(sent).not.toContain("Passengers back");
  });

  test("a round trip asks for the arrival flight and the riders coming back", async ({
    page,
  }) => {
    const state = await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page, { round: true });
    await expect(page.getByLabel(/Arrival flight number/)).toBeVisible();
    await settled(page);
    await inOrder(
      rideOrder(page, /Departure flight number/, /Arrival flight number/),
    );
    if (shots) {
      await page
        .getByLabel(/Departure flight number/)
        .evaluate((el) => el.scrollIntoView({ block: "start" }));
      await settled(page);
      await page.screenshot({
        path: shots + "/melkn-airport-form-roundtrip.png",
      });
    }
    await request(page).click();
    await expect(
      page.getByRole("heading", { name: /Request received/ }),
    ).toBeVisible();
    expect(state.forms).toHaveLength(2);
    const back = decodeURIComponent(state.forms[1].replace(/\+/g, " "));
    expect(back).toContain("Passengers back from the airport: 2");
  });

  test("names each missing airport answer and sends nothing", async ({
    page,
  }) => {
    const state = await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page, { round: true });
    await page.getByLabel(/Departure flight number/).fill("");
    await page.getByLabel(/Arrival flight number/).fill("");
    await page.getByRole("textbox", { name: /Special Notes/ }).fill("");
    await request(page).click();
    // Each message shows by its field and again in the list above the button.
    for (const message of [
      "Please enter your departure flight number",
      "Please enter your arrival flight number",
      /^Please add a note for your driver/,
    ]) {
      await expect(page.getByText(message)).toHaveCount(2);
      await expect(
        page.getByRole("listitem").filter({ hasText: message }),
      ).toBeVisible();
    }
    expect(state.forms).toHaveLength(0);
    if (shots) {
      await page.getByLabel(/Departure flight number/).scrollIntoViewIfNeeded();
      await settled(page);
      await page.screenshot({ path: shots + "/melkn-airport-form-error.png" });
    }
  });

  test("picking up from the airport one way asks for the arrival flight and a drop-off address", async ({
    page,
  }) => {
    const state = await bookingMocks(page);
    await page.goto("/#booking");
    await page
      .getByRole("combobox", { name: "Trip type" })
      .selectOption("airport");
    const to = page.getByRole("radio", { name: "To the airport", exact: true });
    const from = page.getByRole("radio", {
      name: "Pick up from the airport",
      exact: true,
    });
    await expect(to).not.toBeChecked();
    await expect(from).not.toBeChecked();
    await fillAirport(page, { from: true });
    await expect(page.getByLabel(/Departure flight number/)).toBeHidden();
    await expect(page.getByLabel(/Arrival flight number/)).toHaveAttribute(
      "required",
      "",
    );
    await expect(page.getByLabel("Drop-off address *")).toBeVisible();
    await expect(
      page.getByText("One way from Charlotte Douglas"),
    ).toBeVisible();
    await expect(page.getByText("Cash $65.00 · Card $66.95")).toBeVisible();
    if (shots) {
      await page
        .getByRole("combobox", { name: "Trip type" })
        .evaluate((el) => el.scrollIntoView({ block: "start" }));
      await settled(page);
      await page.screenshot({
        path: shots + "/melkn-airport-from-oneway-top.png",
      });
      const dropoff = page.getByLabel("Drop-off address *");
      await expect(dropoff).toHaveAttribute("required", "");
      await dropoff.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await settled(page);
      await page.screenshot({
        path: shots + "/melkn-airport-from-dropoff.png",
      });
      await group(page, /Carry-on bags/).evaluate((el) =>
        el.scrollIntoView({ block: "start" }),
      );
      await settled(page);
      await page.screenshot({ path: shots + "/melkn-airport-from-oneway.png" });
    }
    await request(page).click();
    await expect(
      page.getByRole("heading", { name: /Request received/ }),
    ).toBeVisible();
    expect(state.forms).toHaveLength(1);
    const sent = decodeURIComponent(state.forms[0].replace(/\+/g, " "));
    expect(sent).toContain("Direction: Pick up from the airport");
    expect(sent).toContain("Arrival flight: AA2684");
    expect(sent).not.toContain("Departure flight");
  });

  test("a round trip from the airport goes back with the departure flight", async ({
    page,
  }) => {
    const state = await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page, { from: true, round: true });
    await expect(
      page.getByRole("spinbutton", { name: /Passengers back to the airport/ }),
    ).toBeVisible();
    await settled(page);
    await inOrder(
      rideOrder(page, /Arrival flight number/, /Departure flight number/),
    );
    if (shots) {
      await page
        .getByLabel(/Arrival flight number/)
        .evaluate((el) => el.scrollIntoView({ block: "start" }));
      await settled(page);
      await page.screenshot({
        path: shots + "/melkn-airport-from-roundtrip.png",
      });
    }
    await request(page).click();
    await expect(
      page.getByRole("heading", { name: /Request received/ }),
    ).toBeVisible();
    expect(state.forms).toHaveLength(2);
    const back = decodeURIComponent(state.forms[1].replace(/\+/g, " "));
    expect(back).toContain("DL100");
    expect(back).toContain("Passengers back to the airport: 2");
  });
});
