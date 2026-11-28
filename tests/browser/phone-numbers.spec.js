// Phone numbers (Donald, Nov 27, 2026). Nikki Millburn typed "+1 (740) 627-0080" and the form saved 1740627008.
// Each form is filled with the usual helper, then the phone box is cleared and the number is TYPED key by key or
// PASTED from the clipboard, exactly as a rider would. The Google Form post and the calendar post must both carry
// the same saved number.
import {
  test,
  expect,
  bookingMocks,
  fillAirport,
  fillBar,
  fillParty,
  fillGroup,
  settled,
  typeTimeAt,
  pick,
  formFields,
} from "./helpers/booking-mocks.js";
import { ui } from "./helpers/ui.js";

const shots = process.env.MELKN_SHOTS_DIR;
const PHONE_ENTRY = "entry.1464100699";
const APPLE = "\u202A+1\u00A0(740)\u00A0627-0080\u202C";
const US_ERROR =
  "Please enter a valid 10-digit phone number (like 740-627-0080), or start with + and your country code if you are outside the US";

test.use({ viewport: { width: 390, height: 844 } });
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

async function fillRide(page) {
  await page.getByRole("combobox", { name: "Trip type" }).selectOption("local");
  await ui.localKind(page).selectOption("ride");
  await expect(ui.dropoff(page)).toBeVisible();
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

const FORMS = [
  ["airport", (page) => fillAirport(page)],
  ["bar", (page) => fillBar(page)],
  ["party", (page) => fillParty(page)],
  ["Just a ride", fillRide],
  ["group", (page) => fillGroup(page)],
];

// Show invisible characters as \uXXXX so a test name reads the same everywhere.
const visible = (text) =>
  JSON.stringify(text).replace(
    /[^\x20-\x7e]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );

async function typeInto(page, text) {
  const box = ui.phone(page);
  await box.fill("");
  await box.pressSequentially(text);
}

async function pasteInto(page, text) {
  const box = ui.phone(page);
  await box.fill("");
  await page.evaluate((value) => navigator.clipboard.writeText(value), text);
  await box.focus();
  await page.keyboard.press("ControlOrMeta+V");
}

const WAYS = [
  ["typing", typeInto],
  ["pasting", pasteInto],
];

for (const [formName, fill] of FORMS) {
  test.describe(`${formName} form phone`, () => {
    for (const [way, enter] of WAYS) {
      for (const [entered, shown, saved] of [
        ["+1 (740) 627-0080", "(740) 627-0080", "7406270080"],
        [APPLE, "(740) 627-0080", "7406270080"],
        ["1-740-627-0080", "(740) 627-0080", "7406270080"],
        ["7406270080", "(740) 627-0080", "7406270080"],
        ["+44 20 7946 0958", "+44 20 7946 0958", "+442079460958"],
      ]) {
        test(`${way} ${visible(entered)} saves ${saved}`, async ({
          page,
        }, testInfo) => {
          const state = await bookingMocks(page, { miles: 10 });
          await page.goto("/#booking");
          await fill(page);
          await enter(page, entered);
          await expect(ui.phone(page)).toHaveValue(shown);
          const main = way === "pasting" && entered === "+1 (740) 627-0080";
          if (shots && main) {
            await ui.phone(page).scrollIntoViewIfNeeded();
            await settled(page);
            await page.screenshot({
              path: `${shots}/phone-pasted-plus1-${formName.replace(/ /g, "-")}.png`,
            });
          }
          await ui.submit(page).click();
          await expect(
            page.getByRole("heading", { name: /Request received/ }),
          ).toBeVisible();
          expect(state.forms.length).toBeGreaterThan(0);
          for (const body of state.forms) {
            expect(formFields(body)[PHONE_ENTRY]).toBe(saved);
          }
          expect(state.calendars.length).toBeGreaterThan(0);
          for (const body of state.calendars) {
            expect(JSON.parse(body).phone).toBe(saved);
          }
          testInfo.annotations.push({
            type: "posted-phone",
            description: `${formName}: ${saved}`,
          });
        });
      }
    }

    test("an invalid phone is refused with a clear message and nothing is sent", async ({
      page,
    }) => {
      const state = await bookingMocks(page, { miles: 10 });
      await page.goto("/#booking");
      await fill(page);
      await typeInto(page, "12345");
      await ui.submit(page).click();
      await expect(ui.form(page).getByText(US_ERROR)).toBeVisible();
      await expect(ui.result(page).getByText(US_ERROR)).toBeVisible();
      expect(state.forms).toEqual([]);
      expect(state.calendars).toEqual([]);
    });
  });
}
