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
    if (shots) {
      await group(page, /Carry-on bags/).evaluate((el) =>
        el.scrollIntoView({ block: "start" }),
      );
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
});
