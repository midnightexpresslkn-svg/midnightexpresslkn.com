import {
  test,
  expect,
  bookingMocks,
  fillAirport,
  fillBar,
  fillGroup,
} from "./helpers/booking-mocks.js";
import { ui } from "./helpers/ui.js";

// Donald (Nov 19, 2026): the calendar summary shows the exact cash and card price the customer saw.
const request = (page) =>
  page.getByRole("button", { name: "Request Booking", exact: true });
const confirmation = (page) =>
  page.getByRole("heading", { name: /Request received/ });

async function calendarBody(state) {
  await expect.poll(() => state.calendars.length).toBe(1);
  return JSON.parse(state.calendars[0]);
}

test.describe("price sent to the calendar summary at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("airport one way sends the price the form showed", async ({ page }) => {
    const state = await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page);
    await expect(ui.quote(page)).toContainText("Cash $65.00 · Card $66.95");
    await request(page).click();
    await expect(confirmation(page)).toBeVisible();
    const body = await calendarBody(state);
    expect(body).toMatchObject({
      quoteShown: "Yes",
      quoteCash: "$65.00",
      quoteCard: "$66.95",
      quoteDetail: "One way to Charlotte Douglas Airport (CLT)",
    });
  });

  test("bar round trip sends the total and both legs", async ({ page }) => {
    const state = await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await fillBar(page, { round: true });
    const quote = ui.quote(page);
    await expect(quote).toContainText(/Round trip, .+ and back/);
    const shown = (await quote.innerText()).replace(/\s+/g, " ");
    await request(page).click();
    await expect(confirmation(page)).toBeVisible();
    const body = await calendarBody(state);
    expect(body.quoteShown).toBe("Yes");
    expect(shown).toContain(`Cash ${body.quoteCash} · Card ${body.quoteCard}`);
    expect(body.quoteDetail).toMatch(
      /^Round trip, .+ and back\. Outbound: Cash \$[\d.]+ · Card \$[\d.]+; Return: Cash \$[\d.]+ · Card \$[\d.]+$/,
    );
  });

  test("group sends the trip charge and the deposit", async ({ page }) => {
    const state = await bookingMocks(page);
    await page.goto("/#booking");
    await fillGroup(page);
    await expect(ui.quote(page)).toContainText(
      "Trip charge: Cash $375.00 · Card $386.25",
    );
    await request(page).click();
    await expect(confirmation(page)).toBeVisible();
    const body = await calendarBody(state);
    expect(body).toMatchObject({ quoteCash: "$375.00", quoteCard: "$386.25" });
    expect(body.quoteDetail).toMatch(
      /, 3 hours\. 25% deposit: Cash \$93\.75 · Card \$96\.56$/,
    );
  });

  test("no price on the form is sent as no price shown", async ({ page }) => {
    const state = await bookingMocks(page, { miles: 80 });
    await page.goto("/#booking");
    await fillAirport(page);
    await expect(
      page.getByText(/For trips over 50 miles, please call/),
    ).toBeVisible();
    await request(page).click();
    await expect(confirmation(page)).toBeVisible();
    const body = await calendarBody(state);
    expect(body.quoteShown).toBe("No");
    expect(body).not.toHaveProperty("quoteCash");
  });
});
