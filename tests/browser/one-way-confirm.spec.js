// Airport one-way "Are you sure?" (Donald, Nov 19 2026): the first No on an airport round trip
// is cleared and the message shows beside the question; Yes hides it; a second No is kept.
// Bar, party, and group forms are unchanged.
import {
  test,
  expect,
  bookingMocks,
  fillAirport,
  fillBar,
  fillParty,
  fillGroup,
  oneWayConfirm,
  settled,
} from "./helpers/booking-mocks.js";

const shots = process.env.MELKN_SHOTS_DIR;
const roundTrip = (page) => page.getByRole("group", { name: /Round trip/ });
const yes = (page) =>
  roundTrip(page).getByRole("radio", { name: "Yes", exact: true });
const no = (page) =>
  roundTrip(page).getByRole("radio", { name: "No", exact: true });
const request = (page) =>
  page.getByRole("button", { name: "Request Booking", exact: true });

/**
 * The message sits right under the Round trip question and inside the screen width. Both boxes
 * are measured in one frame and the check retries, so scrolling or a slide animation elsewhere
 * on the form cannot catch them mid-move.
 */
async function besideQuestion(page) {
  const question = roundTrip(page);
  await expect
    .poll(async () =>
      oneWayConfirm(page).evaluate(
        (el, fieldset) => {
          const q = fieldset.getBoundingClientRect();
          const m = el.getBoundingClientRect();
          const gap = m.top - q.bottom;
          return {
            belowAnswers: gap >= -1,
            rightUnder: gap < 40,
            linedUp: m.left >= q.left - 1,
            onScreen: m.right <= document.documentElement.clientWidth,
            wraps: el.scrollWidth <= el.clientWidth,
          };
        },
        await question.elementHandle(),
      ),
    )
    .toEqual({
      belowAnswers: true,
      rightUnder: true,
      linedUp: true,
      onScreen: true,
      wraps: true,
    });
}

for (const size of [
  { label: "phone", width: 390, height: 844 },
  { label: "desktop", width: 1280, height: 800 },
]) {
  test.describe(`airport one-way confirm on ${size.label} (${size.width}x${size.height})`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("the first No clears and shows Are you sure? beside the question", async ({
      page,
    }) => {
      const state = await bookingMocks(page);
      await page.goto("/#booking");
      await fillAirport(page, { round: null });
      await expect(oneWayConfirm(page)).toHaveCount(0);
      await no(page).click();
      await expect(oneWayConfirm(page)).toBeVisible();
      await expect(no(page)).not.toBeChecked();
      await expect(yes(page)).not.toBeChecked();
      await besideQuestion(page);
      if (shots) {
        await roundTrip(page).evaluate((el) =>
          el.scrollIntoView({ block: "center" }),
        );
        await settled(page);
        await page.screenshot({
          path: `${shots}/airport-oneway-confirm-${size.label}-${size.width}x${size.height}.png`,
        });
      }
      // Round trip is required again: submitting names it and sends nothing.
      await request(page).click();
      // It shows under the question and in the error list at the top of the form.
      const needed = page.getByText("Please choose Yes or No for round trip.", {
        exact: true,
      });
      await expect(needed).toHaveCount(2);
      await expect(needed.first()).toBeVisible();
      await expect(needed.last()).toBeVisible();
      expect(state.forms).toEqual([]);
      expect(state.calendars).toEqual([]);
    });

    test("Yes hides the message and keeps Yes", async ({ page }) => {
      await bookingMocks(page);
      await page.goto("/#booking");
      await fillAirport(page, { round: null });
      await no(page).click();
      await expect(oneWayConfirm(page)).toBeVisible();
      await yes(page).check();
      await expect(oneWayConfirm(page)).toHaveCount(0);
      await expect(yes(page)).toBeChecked();
      await expect(page.getByLabel(/Arrival flight number/)).toBeVisible();
    });

    test("a second No sticks and the ride books one way", async ({ page }) => {
      const state = await bookingMocks(page);
      await page.goto("/#booking");
      await fillAirport(page, { round: null });
      await no(page).click();
      await expect(oneWayConfirm(page)).toBeVisible();
      await no(page).check();
      await expect(no(page)).toBeChecked();
      await expect(oneWayConfirm(page)).toHaveCount(0);
      await expect(page.getByLabel(/Arrival flight number/)).toBeHidden();
      await request(page).click();
      await expect(
        page.getByRole("heading", { name: /Request received/ }),
      ).toBeVisible();
      await expect.poll(() => state.calendars.length).toBe(1);
      expect(JSON.parse(state.calendars[0]).roundTrip).toBe("No");
      expect(state.forms.length).toBe(1);
    });
  });
}

test.describe("other forms are unaffected (390x844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a bar ride keeps the first No with no message", async ({ page }) => {
    await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await fillBar(page, { round: false });
    await expect(no(page)).toBeChecked();
    await expect(oneWayConfirm(page)).toHaveCount(0);
  });

  test("a party ride keeps the first No with no message", async ({ page }) => {
    await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await fillParty(page, { round: false });
    await expect(no(page)).toBeChecked();
    await expect(oneWayConfirm(page)).toHaveCount(0);
  });

  test("a group event has no Round trip question and no message", async ({
    page,
  }) => {
    await bookingMocks(page);
    await page.goto("/#booking");
    await fillGroup(page);
    await expect(roundTrip(page)).toBeHidden();
    await expect(oneWayConfirm(page)).toHaveCount(0);
  });

  test("leaving the airport form hides a showing message", async ({ page }) => {
    await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await fillAirport(page, { round: null });
    await no(page).click();
    await expect(oneWayConfirm(page)).toBeVisible();
    await page
      .getByRole("combobox", { name: "Trip type" })
      .selectOption("local");
    await expect(oneWayConfirm(page)).toHaveCount(0);
  });
});
