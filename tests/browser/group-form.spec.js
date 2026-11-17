// Group form changes from Donald's Nov 16, 2026 spec, at phone width.
import {
  test,
  expect,
  bookingMocks,
  fillGroup,
  settled,
} from "./helpers/booking-mocks.js";

const shots = process.env.MELKN_SHOTS_DIR;
const request = (page) =>
  page.getByRole("button", { name: "Request Booking", exact: true });
const AGREEMENT =
  "Must be 21 years or older, cannot smoke, and you are responsible for any damages.";

async function scrollTo(locator) {
  await locator.evaluate((el) => {
    el.scrollIntoView({ block: "start" });
    window.scrollBy(0, -70);
  });
}

test.describe("group form at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a group shows optional stops, the trip charge, and the deposit up front", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await page
      .getByRole("combobox", { name: "Trip type" })
      .selectOption("group");
    const form = page.locator("#bookingForm");
    for (const word of [
      /airport/i,
      /luggage/i,
      /baggage/i,
      /wheelchair/i,
      /car seat/i,
    ]) {
      await expect(form.getByText(word).filter({ visible: true })).toHaveCount(
        0,
      );
    }
    await expect(
      page.getByRole("checkbox", { name: `${AGREEMENT} *` }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "No smoking *" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("textbox", { name: "Trip Description *" }),
    ).toHaveAttribute(
      "placeholder",
      "Anything we should know? For example: drinks, music style.",
    );
    for (const n of ["2nd", "3rd", "4th"]) {
      const stop = page.getByLabel(`${n} stop (optional)`);
      await expect(stop).toBeVisible();
      await expect(stop).not.toHaveAttribute("required", "");
    }

    await fillGroup(page);
    const quote = page.locator("#quote-details");
    await expect(quote).toContainText(
      "Trip charge: Cash $375.00 · Card $386.25",
    );
    await expect(quote).toContainText("25% deposit: Cash $93.75 · Card $96.56");
    await expect(quote).toContainText("Deposit must be paid up front.");
    if (shots) {
      await scrollTo(page.getByRole("combobox", { name: "Trip type" }));
      await settled(page);
      await page.screenshot({ path: shots + "/melkn-group-form-top.png" });
      await page
        .getByRole("heading", { name: "Estimated Quote" })
        .evaluate((el) => el.parentElement.scrollIntoView({ block: "center" }));
      await settled(page);
      await expect(page.locator(".quote-deposit")).toBeInViewport();
      await page.screenshot({ path: shots + "/melkn-group-form-lower.png" });
    }
    await request(page).click();
    await expect(
      page.getByRole("heading", { name: /Request received/ }),
    ).toBeVisible();
    const confirm = page.locator(".confirm-price");
    await expect(confirm).toContainText(
      "Trip charge: Cash $375.00 · Card $386.25",
    );
    await expect(confirm).toContainText(
      "25% deposit: Cash $93.75 · Card $96.56",
    );
    await expect(confirm).toContainText("Deposit must be paid up front.");
    const another = page.getByRole("button", { name: "Make Another Booking" });
    await expect(another).toBeVisible();
    if (shots) {
      // Instant scroll so the page's smooth scrolling cannot move it mid-shot.
      await another.evaluate((el) => {
        const bottom = el.getBoundingClientRect().bottom + window.scrollY;
        window.scrollTo({
          top: bottom - window.innerHeight + 40,
          behavior: "instant",
        });
      });
      await settled(page);
      await expect(another).toBeInViewport({ ratio: 1 });
      await expect(
        page.getByRole("heading", { name: /Request received/ }),
      ).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: shots + "/melkn-group-form-confirm.png" });
    }
    expect(state.forms).toHaveLength(1);
    const sent = decodeURIComponent(state.forms[0].replace(/\+/g, " "));
    for (const line of [
      "Group details:",
      `Agreement (${AGREEMENT}): Yes`,
      "Stop 2: Two Trees Bar and Grill",
      "Stop 3: Lake Norman Brewery",
    ]) {
      expect(sent).toContain(line);
    }
    expect(sent).not.toContain("Stop 4:");
  });

  test("names each missing group answer and sends nothing", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await fillGroup(page, { agree: false, stops: 0 });
    await page.getByRole("textbox", { name: "Trip Description *" }).fill("");
    await page.getByLabel("How many hours *").fill("");
    await page.getByLabel("How many hours *").blur();
    // Clearing hours shrinks the quote, so wait for it before pressing the button.
    await expect(page.locator("#quote-details")).toContainText(
      "Enter how many hours to see your price.",
    );
    await request(page).click();
    for (const message of [
      "Enter how many hours.",
      /^Please tell us about your group event/,
      /^Please check the box: Must be 21 years or older/,
    ]) {
      await expect(
        page.getByRole("listitem").filter({ hasText: message }),
      ).toBeVisible();
    }
    expect(state.forms).toHaveLength(0);
    if (shots) {
      await scrollTo(page.getByLabel("How many hours *"));
      await settled(page);
      await page.screenshot({ path: shots + "/melkn-group-form-error.png" });
    }
  });
});
