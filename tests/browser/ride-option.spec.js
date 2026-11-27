// Just-a-Ride option (Donald, Nov 27, 2026). Party and group forms are unchanged.
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  test,
  expect,
  bookingMocks,
  settled,
  typeTimeAt,
  fillParty,
  pick,
} from "./helpers/booking-mocks.js";
import { ui } from "./helpers/ui.js";

const DENVER = "123 Main Street, Denver NC 28037";
const CHARLOTTE = "100 Tryon St, Charlotte NC 28202";
const MOORES = "123 Main St, Mooresville NC 28115";
const CORNELIUS = "100 Catawba Ave, Cornelius NC 28031";
const SHERRILLS = "200 Oak St, Sherrills Ford NC 28673";
const SORRY = "Sorry, we don't service that area.";
const FAR = "out of our service area.";

async function chooseRide(page) {
  const tripType = ui.tripType(page);
  if (await tripType.isVisible()) {
    await tripType.selectOption("local");
  }
  await ui.localKind(page).selectOption("ride");
  await expect(ui.dropoff(page)).toBeVisible();
  await expect(ui.agreement(page)).toBeHidden();
}

async function fillRide(
  page,
  { pickup = DENVER, destination = SHERRILLS } = {},
) {
  await chooseRide(page);
  await page.getByPlaceholder("Jane Smith").fill("Isolated QA Rider");
  await page.getByPlaceholder("5555551234").fill("5555550199");
  await page.getByPlaceholder("email@example.com").fill("qa@example.invalid");
  await page.getByRole("spinbutton", { name: /Online:/ }).fill("2");
  await pick(ui.date(page), "2026-12-15");
  await typeTimeAt(page, "Pickup Time", "10:00", "AM");
  await ui.pickup(page).fill(pickup);
  await ui.dropoff(page).fill(destination);
  await ui.dropoff(page).blur();
  await page
    .getByRole("group", { name: /Round trip/ })
    .getByRole("radio", { name: "No", exact: true })
    .check();
}

test.describe("just a Ride option", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a Charlotte work trip is allowed and shows a quote", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 20 });
    await page.goto("/?type=local&kind=ride#booking");
    await expect(ui.localKind(page)).toHaveValue("ride");
    await expect(ui.tripType(page)).toBeHidden();
    await expect(ui.agreement(page)).toBeHidden();
    await expect(ui.dropoff(page)).toBeVisible();
    await fillRide(page, { pickup: DENVER, destination: CHARLOTTE });
    await expect(ui.quote(page)).toContainText("Cash $60.00");
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText("Request received");
    expect(state.calendars.length).toBeGreaterThan(0);
  });

  test("Mooresville stays refused", async ({ page }) => {
    const moores = await bookingMocks(page, { miles: 10 });
    await page.goto("/#booking");
    await fillRide(page, { pickup: MOORES, destination: DENVER });
    await expect(ui.quote(page)).toHaveText(SORRY);
    await ui.submit(page).click();
    await expect(page.getByText(SORRY).first()).toBeVisible();
    expect(moores.calendars).toEqual([]);
    expect(moores.forms).toEqual([]);
  });

  test("Cornelius stays refused", async ({ page }) => {
    const cornelius = await bookingMocks(page, { miles: 10 });
    await page.goto("/#booking");
    await fillRide(page, { pickup: DENVER, destination: CORNELIUS });
    await expect(ui.quote(page)).toHaveText(SORRY);
    await ui.submit(page).click();
    expect(cornelius.calendars).toEqual([]);
    expect(cornelius.forms).toEqual([]);
  });

  test("21.6 mile quotes use $3/mile, rounded like localFare", async ({
    page,
  }) => {
    await bookingMocks(page, { miles: 21.6 });
    await page.goto("/#booking");
    await fillRide(page, { pickup: DENVER, destination: SHERRILLS });
    await expect(ui.quote(page)).toContainText("Cash $65.00");
  });

  test("21.7 mile quotes use the airport fare function", async ({ page }) => {
    await bookingMocks(page, { miles: 21.7 });
    await page.goto("/#booking");
    await fillRide(page, { pickup: DENVER, destination: SHERRILLS });
    await expect(ui.quote(page)).toContainText("Cash $65.00");
  });

  test("22 mile quotes use the airport fare function", async ({ page }) => {
    await bookingMocks(page, { miles: 22 });
    await page.goto("/#booking");
    await fillRide(page, { pickup: DENVER, destination: SHERRILLS });
    await expect(ui.quote(page)).toContainText("Cash $65.00");
  });

  test("24 mile quotes use the airport fare function", async ({ page }) => {
    await bookingMocks(page, { miles: 24 });
    await page.goto("/#booking");
    await fillRide(page, { pickup: DENVER, destination: SHERRILLS });
    await expect(ui.quote(page)).toContainText("Cash $65.00");
  });

  test("30 mile quotes use the airport fare and stay in reach", async ({
    page,
  }) => {
    await bookingMocks(page, { miles: 30 });
    await page.goto("/#booking");
    await fillRide(page, { pickup: DENVER, destination: SHERRILLS });
    await expect(ui.quote(page)).toContainText("Cash $80.00");
  });

  test("31 miles is refused", async ({ page }) => {
    const at31 = await bookingMocks(page, { miles: 31 });
    await page.goto("/#booking");
    await fillRide(page, { pickup: DENVER, destination: SHERRILLS });
    await expect(ui.quote(page)).toHaveText(FAR);
    await ui.submit(page).click();
    expect(at31.calendars).toEqual([]);
  });

  test("the party form still refuses Charlotte", async ({ page }) => {
    const party = await bookingMocks(page, { miles: 8 });
    await page.goto("/#booking");
    await fillParty(page, { round: false, second: false });
    await ui.partyAddress(page).fill(CHARLOTTE);
    await ui.partyAddress(page).blur();
    await expect(ui.quote(page)).toHaveText(SORRY);
    await ui.submit(page).click();
    expect(party.calendars).toEqual([]);
  });

  test("the party form still books a 15 mile trip", async ({ page }) => {
    const ok = await bookingMocks(page, { miles: 15 });
    await page.goto("/#booking");
    await fillParty(page, { round: false, second: false });
    await expect(ui.quote(page)).toContainText("Cash $45.00");
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText("Request received");
    expect(ok.calendars.length).toBeGreaterThan(0);
  });

  test("shows a Ride quote for the screenshot", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 2400 });
    await bookingMocks(page, { miles: 20 });
    await page.goto("/?type=local&kind=ride#booking");
    await fillRide(page, { pickup: DENVER, destination: CHARLOTTE });
    await expect(ui.quote(page)).toContainText("Cash $60.00");
    await ui.bookingHeading(page).scrollIntoViewIfNeeded();
    await settled(page);
    const heading = await ui.bookingHeading(page).boundingBox();
    const quoteBox = await ui.quote(page).boundingBox();
    if (!heading || !quoteBox)
      throw new Error("booking heading or quote not on screen");
    const clip = {
      x: 0,
      y: Math.max(0, heading.y - 16),
      width: page.viewportSize().width,
      height: quoteBox.y + quoteBox.height - heading.y + 32,
    };
    const dir = "/workspace/site-ride-option-20261127/shots";
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "ride-option-quote.png");
    await page.screenshot({ path: file, clip });
    await page.screenshot({
      path: "/workspace/ride-option-quote-20261127.png",
      clip,
    });
  });
});
