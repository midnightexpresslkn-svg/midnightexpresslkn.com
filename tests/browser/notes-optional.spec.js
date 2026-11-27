// Donald (Nov 27, 2026): Special Notes is optional on airport, bar, and Just a ride.
// Party (Special Notes *) and group (Trip Description *) stay required.
import { mkdirSync } from "node:fs";
import {
  test,
  expect,
  bookingMocks,
  settled,
  typeTimeAt,
  pick,
  fillAirport,
  fillBar,
  fillParty,
  fillGroup,
} from "./helpers/booking-mocks.js";
import { ui } from "./helpers/ui.js";

const PARTY_MSG =
  "Please tell us about the party (what it is, and anything we should know).";
const GROUP_MSG =
  "Please tell us about your group event (what it is, how many people, and anything we should know).";

async function fillRide(page) {
  await ui.tripType(page).selectOption("local");
  await ui.localKind(page).selectOption("ride");
  await page.getByPlaceholder("Jane Smith").fill("Isolated QA Rider");
  await page.getByPlaceholder("5555551234").fill("5555550199");
  await page.getByPlaceholder("email@example.com").fill("qa@example.invalid");
  await page.getByRole("spinbutton", { name: /Online:/ }).fill("2");
  await pick(ui.date(page), "2026-12-15");
  await typeTimeAt(page, "Pickup Time", "10:00", "AM");
  await ui.pickup(page).fill("123 Main Street, Denver NC 28037");
  await ui.dropoff(page).fill("200 Oak St, Sherrills Ford NC 28673");
  await ui.dropoff(page).blur();
  await page
    .getByRole("group", { name: /Round trip/ })
    .getByRole("radio", { name: "No", exact: true })
    .check();
}

test.describe("optional Special Notes on airport, bar, and Ride", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("an airport booking submits with an empty Special Notes box", async ({
    page,
  }) => {
    const state = await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page, { round: false });
    await ui.notes(page).fill("");
    await expect(
      page.getByRole("textbox", { name: "Special Notes", exact: true }),
    ).toBeVisible();
    await expect(ui.notes(page)).not.toHaveAttribute("required", "");
    await expect(ui.notes(page)).toHaveValue("");
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText("Request received");
    expect(state.calendars.length).toBeGreaterThan(0);
  });

  test("a bar booking submits with an empty Special Notes box", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await fillBar(page);
    await ui.notes(page).fill("");
    await expect(
      page.getByRole("textbox", { name: "Special Notes", exact: true }),
    ).toBeVisible();
    await expect(ui.notes(page)).not.toHaveAttribute("required", "");
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText("Request received");
    expect(state.calendars.length).toBeGreaterThan(0);
  });

  test("a Just a ride booking submits with an empty Special Notes box", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 10 });
    await page.goto("/#booking");
    await fillRide(page);
    await ui.notes(page).fill("");
    await expect(
      page.getByRole("textbox", { name: "Special Notes", exact: true }),
    ).toBeVisible();
    await expect(ui.notes(page)).not.toHaveAttribute("required", "");
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText("Request received");
    expect(state.calendars.length).toBeGreaterThan(0);
  });

  test("a party booking still blocks an empty Special Notes box", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await fillParty(page, { round: false, second: false, more: false });
    await ui.notes(page).fill("");
    await expect(
      page.getByRole("textbox", { name: "Special Notes *", exact: true }),
    ).toBeVisible();
    await expect(ui.notes(page)).toHaveAttribute("required", "");
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText(PARTY_MSG);
    expect(state.calendars).toEqual([]);
    expect(state.forms).toEqual([]);
  });

  test("a group booking still blocks an empty Trip Description box", async ({
    page,
  }) => {
    const state = await bookingMocks(page, { miles: 4 });
    await page.goto("/#booking");
    await fillGroup(page);
    await ui.notes(page).fill("");
    await expect(
      page.getByRole("textbox", { name: "Trip Description *", exact: true }),
    ).toBeVisible();
    await expect(ui.notes(page)).toHaveAttribute("required", "");
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText(GROUP_MSG);
    expect(state.calendars).toEqual([]);
    expect(state.forms).toEqual([]);
  });

  test("shows an airport form with empty Special Notes accepted", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 2400 });
    await bookingMocks(page);
    await page.goto("/#booking");
    await fillAirport(page, { round: false });
    await ui.notes(page).fill("");
    await expect(ui.notes(page)).toHaveValue("");
    await expect(ui.quote(page)).toContainText("Cash");
    const notesLabel = page.getByText("Special Notes", { exact: true });
    await notesLabel.scrollIntoViewIfNeeded();
    await settled(page);
    const top = await notesLabel.boundingBox();
    const quote = await ui.quote(page).boundingBox();
    if (!top || !quote) throw new Error("Special Notes or quote not on screen");
    const clip = {
      x: 0,
      y: Math.max(0, top.y - 16),
      width: page.viewportSize().width,
      height: quote.y + quote.height - top.y + 32,
    };
    mkdirSync("/workspace/site-ride-option-20261127/shots", {
      recursive: true,
    });
    await page.screenshot({
      path: "/workspace/site-ride-option-20261127/shots/notes-optional-airport.png",
      clip,
    });
    await page.screenshot({
      path: "/workspace/notes-optional-airport-20261127.png",
      clip,
    });
    await ui.submit(page).click();
    await expect(ui.result(page)).toContainText("Request received");
  });
});
