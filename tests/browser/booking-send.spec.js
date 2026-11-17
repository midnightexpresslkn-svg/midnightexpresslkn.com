import {
  test,
  expect,
  bookingMocks,
  fillAirport,
  holdChecks,
} from "./helpers/booking-mocks.js";

const shots = process.env.MELKN_SHOTS_DIR;
const request = (page) =>
  page.getByRole("button", { name: "Request Booking", exact: true });
const confirmation = (page) =>
  page.getByRole("heading", { name: /Request received/ });
const another = (page) =>
  page.getByRole("button", { name: "Make Another Booking", exact: true });

async function quoted(page) {
  // The price lookup finishes before submit, so the held check below is the submit's own check.
  await expect(page.getByText(/Cash \$/).first()).toBeVisible();
}

test.describe("one send per booking", () => {
  test("a double tap during the checks sends exactly once", async ({
    page,
  }) => {
    const state = await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page, { pickup: "55 Quiet Hollow Rd" });
    await quoted(page);
    const { gate, release } = holdChecks(state);
    await request(page).dblclick();
    await gate.entered;
    await expect(request(page)).toBeDisabled();
    release();
    await expect(confirmation(page)).toBeVisible();
    await expect(another(page)).toBeVisible();
    expect(gate.hits).toBe(1);
    expect(state.forms).toHaveLength(1);
  });

  test("pressing Enter during the checks sends exactly once", async ({
    page,
  }) => {
    const state = await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page, { pickup: "55 Quiet Hollow Rd" });
    await quoted(page);
    const { gate, release } = holdChecks(state);
    await request(page).click();
    await gate.entered;
    await page.getByPlaceholder("Jane Smith").press("Enter");
    await page.getByPlaceholder("email@example.com").press("Enter");
    // A scripted submit also hits the lock, not just the disabled button.
    await page
      .getByPlaceholder("Jane Smith")
      .evaluate((el) => el.form.requestSubmit());
    release();
    await expect(confirmation(page)).toBeVisible();
    await expect(another(page)).toBeVisible();
    expect(gate.hits).toBe(1);
    expect(state.forms).toHaveLength(1);
  });

  test("a round trip sends exactly two legs, once", async ({ page }) => {
    const state = await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page, { round: true });
    await request(page).dblclick();
    await expect(
      page.getByText("Your round-trip requests were sent."),
    ).toBeVisible();
    await expect(another(page)).toBeVisible();
    await page
      .getByRole("button", {
        name: "Request Booking",
        exact: true,
        includeHidden: true,
      })
      .evaluate((b) => b.form.requestSubmit());
    expect(state.forms).toHaveLength(2);
    const dates = state.forms.map(
      (body) => /12\/1[56]\/2026/.exec(decodeURIComponent(body || ""))?.[0],
    );
    expect(new Set(dates).size).toBe(2);
  });

  test("Make Another Booking clears everything, sends nothing, then the next booking sends once", async ({
    page,
  }) => {
    const state = await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page, { round: true });
    await page.getByRole("checkbox", { name: "Wheelchair" }).check();
    await page
      .getByRole("textbox", { name: /Special Notes/ })
      .fill("Gate C, two kids");
    await request(page).click();
    await expect(confirmation(page)).toBeVisible();
    if (shots)
      await page.screenshot({
        path: shots + "/melkn-after-confirmation.png",
        fullPage: true,
      });
    expect(state.forms).toHaveLength(2);

    await another(page).click();
    await expect(another(page)).toBeHidden();
    await expect(confirmation(page)).toBeHidden();
    for (const ph of [
      "Jane Smith",
      "5555551234",
      "email@example.com",
      "123 Main Street, Denver NC 28037",
    ]) {
      await expect(page.getByPlaceholder(ph, { exact: true })).toHaveValue("");
    }
    for (const label of [/Departure flight number/, /Arrival flight number/]) {
      await expect(page.getByLabel(label)).toHaveValue("");
    }
    await expect(page.getByPlaceholder(/Anything we should know/)).toHaveValue(
      "",
    );
    await expect(
      page.getByRole("spinbutton", { name: /Online:/, includeHidden: true }),
    ).toHaveValue("");
    await expect(page.getByRole("combobox", { name: "Trip type" })).toHaveValue(
      "",
    );
    await expect(
      page.getByRole("combobox", { name: "Trip type" }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "Wheelchair", includeHidden: true }),
    ).not.toBeChecked();
    await expect(
      page
        .getByRole("group", { name: /Round trip/, includeHidden: true })
        .getByRole("radio", { name: "Yes", exact: true, includeHidden: true }),
    ).not.toBeChecked();
    await expect(request(page)).toBeEnabled();
    if (shots)
      await page.screenshot({
        path: shots + "/melkn-after-cleared-form.png",
        fullPage: true,
      });
    expect(state.forms).toHaveLength(2);

    await fillAirport(page, { name: "Second Isolated Rider" });
    await request(page).click();
    await expect(
      page.getByText("Thank you, Second Isolated Rider!"),
    ).toBeVisible();
    await expect(another(page)).toHaveCount(1);
    expect(state.forms).toHaveLength(3);
    expect(decodeURIComponent(state.forms[2].replace(/\+/g, " "))).toContain(
      "Second Isolated Rider",
    );
  });
});
