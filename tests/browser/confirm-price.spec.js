import {
  test,
  expect,
  bookingMocks,
  fillAirport,
} from "./helpers/booking-mocks.js";
import { ui } from "./helpers/ui.js";

const shots = process.env.MELKN_SHOTS_DIR;
const request = (page) =>
  page.getByRole("button", { name: "Request Booking", exact: true });
const confirmation = (page) =>
  page.getByRole("heading", { name: /Request received/ });

test.describe("price on the confirmation at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("one way shows the same total the form showed", async ({ page }) => {
    await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page);
    await expect(
      page.getByText("One way to Charlotte Douglas Airport (CLT)"),
    ).toBeVisible();
    await expect(page.getByText("Cash $65.00 · Card $66.95")).toBeVisible();
    await request(page).click();
    await expect(confirmation(page)).toBeVisible();
    const price = page
      .getByRole("paragraph")
      .filter({ hasText: "Estimated price:" });
    await expect(price).toContainText(
      "One way to Charlotte Douglas Airport (CLT)",
    );
    await expect(price).toContainText("Cash $65.00 · Card $66.95");
    await expect(
      page.getByText(/not confirmed until you receive a call from us/),
    ).toBeVisible();
    await page.mouse.move(0, 0); // no hover styling in the screenshot
    await expect(confirmation(page)).toBeInViewport({ ratio: 1 });
    // The page scrolls smoothly; wait until two animation frames show the same scroll position.
    await page.waitForFunction(
      () =>
        new Promise((done) => {
          const y = window.scrollY;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => done(window.scrollY === y)),
          );
        }),
    );
    await expect(
      page.getByRole("listitem").filter({ hasText: /^(Outbound|Return):/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Make Another Booking", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    if (shots)
      await page.screenshot({
        path: shots + "/melkn-confirm-price-oneway.png",
      });
  });

  test("round trip shows the same round-trip total the form showed", async ({
    page,
  }) => {
    await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page, { round: true });
    await expect(
      page.getByText("Round trip, Charlotte Douglas Airport (CLT) and back"),
    ).toBeVisible();
    await expect(page.getByText("Cash $130.00 · Card $133.90")).toBeVisible();
    await expect(
      page.getByText("Outbound: Cash $65.00 · Card $66.95"),
    ).toBeVisible();
    await expect(
      page.getByText("Return: Cash $65.00 · Card $66.95"),
    ).toBeVisible();
    await request(page).click();
    await expect(
      page.getByText("Your round-trip requests were sent."),
    ).toBeVisible();
    const price = page
      .getByRole("paragraph")
      .filter({ hasText: "Estimated price:" });
    await expect(price).toContainText(
      "Round trip, Charlotte Douglas Airport (CLT) and back",
    );
    await expect(price).toContainText("Outbound: Cash $65.00 · Card $66.95");
    await expect(price).toContainText("Return: Cash $65.00 · Card $66.95");
    await expect(price).toContainText("Total: Cash $130.00 · Card $133.90");
    await page.mouse.move(0, 0); // no hover styling in the screenshot
    await expect(confirmation(page)).toBeInViewport({ ratio: 1 });
    // The page scrolls smoothly; wait until two animation frames show the same scroll position.
    await page.waitForFunction(
      () =>
        new Promise((done) => {
          const y = window.scrollY;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => done(window.scrollY === y)),
          );
        }),
    );
    await expect(
      page.getByRole("listitem").filter({ hasText: /^(Outbound|Return):/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Make Another Booking", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    if (shots)
      await page.screenshot({
        path: shots + "/melkn-confirm-price-roundtrip.png",
      });
  });

  test("no price on the confirmation when the form had none", async ({
    page,
  }) => {
    await bookingMocks(page, { miles: 80 });
    await page.goto("/#booking");
    await fillAirport(page);
    await expect(
      page.getByText(/For trips over 50 miles, please call/),
    ).toBeVisible();
    await request(page).click();
    await expect(confirmation(page)).toBeVisible();
    await expect(page.getByText(/Estimated price:/)).toHaveCount(0);
    await expect(ui.result(page)).toContainText("Request received");
    await expect(ui.result(page)).not.toContainText("$");
  });

  test("Make Another Booking removes the old price", async ({ page }) => {
    await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page);
    await expect(page.getByText("Cash $65.00 · Card $66.95")).toBeVisible();
    await request(page).click();
    await expect(page.getByText(/Estimated price:/)).toBeVisible();
    await page
      .getByRole("button", { name: "Make Another Booking", exact: true })
      .click();
    await expect(page.getByText(/Estimated price:/)).toHaveCount(0);
    // The quote box itself is hidden until a trip type is picked again.
    await expect(page.getByText("Cash $65.00 · Card $66.95")).toBeHidden();
  });
});
