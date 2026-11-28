// Phone numbers (Donald, Nov 27, 2026). Nikki Millburn typed "+1 (740) 627-0080" and the form saved 1740627008:
// the leading 1 was kept and the last digit was cut off. A rider must be able to type or paste a number any way
// (Apple Contacts puts +1 and invisible marks in front) and it must save as the same 10 digits as before.
// Numbers outside the US save whole, with + and the country code. Nothing is ever cut short.
import { afterEach, describe, it } from "vitest";
import { check } from "./helpers/failure.js";
import {
  drainTimers,
  fillValid,
  formPosts,
  renderBooking,
  resultText,
  sameEndpoint,
  submitForm,
} from "./helpers/render-booking.js";

const scripts = ["js/booking.js", "js/booking.min.js"];
const PHONE_ENTRY = "entry.1464100699";
const CALENDAR_URL =
  "https://script.google.com/macros/s/AKfycbyUfrtvd64b5GKnkaHONJ7YDGGAXAAWGTxYK3lBASguhUjlO_iXXHiM4-iflODhJTYP4w/exec";
const US_ERROR =
  "Please enter a valid 10-digit phone number (like 740-627-0080), or start with + and your country code if you are outside the US";
const WORLD_ERROR =
  "Please enter a valid phone number with + and your country code (like +44 20 7946 0958)";

// What Apple Contacts puts on the clipboard: left-to-right marks around the number and non-breaking spaces.
const APPLE = "\u202A+1\u00A0(740)\u00A0627-0080\u202C";
const APPLE_MARKS = "\u200E+1 (740) 627\u2011\u200F0080\u200E".replace(
  "\u2011",
  "-",
);

// Show invisible characters as \uXXXX so a test name reads the same everywhere.
const visible = (text) =>
  JSON.stringify(text).replace(
    /[^\x20-\x7e]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );

afterEach(() => {
  drainTimers();
});

// Every way a US/Canada number is typed or pasted; all must save 7406270080.
const US_FORMS = [
  ["7406270080", "plain 10 digits"],
  ["740-627-0080", "dashes"],
  ["(740) 627-0080", "parentheses"],
  ["(740)627-0080", "parentheses, no space"],
  ["+1 (740) 627-0080", "Apple Contacts"],
  [APPLE, "Apple Contacts with direction marks and non-breaking spaces"],
  [APPLE_MARKS, "invisible marks between digits"],
  ["1-740-627-0080", "leading 1 with dashes"],
  ["1 (740) 627-0080", "leading 1 with parentheses"],
  ["17406270080", "leading 1, 11 digits"],
  ["+17406270080", "+1 with no spaces"],
  ["+1-740-627-0080", "+1 with dashes"],
  ["740 627 0080", "spaces"],
  ["740.627.0080", "dots"],
  ["+1 740.627.0080", "+1 with dots"],
  ["  740-627-0080  ", "outer spaces"],
  ["\u00A0740\u00A0627\u00A00080\u00A0", "non-breaking spaces"],
  ["７４０-６２７-００８０", "full-width digits"],
  ["001 740 627 0080", "00 1 dial prefix"],
  ["011 1 740 627 0080", "011 1 dial prefix"],
];

// Other countries save whole, with + and the country code.
const WORLD_FORMS = [
  ["+44 20 7946 0958", "+442079460958", "UK with spaces"],
  ["+442079460958", "+442079460958", "UK no spaces"],
  [
    "\u202A+44\u00A020\u00A07946\u00A00958\u202C",
    "+442079460958",
    "UK pasted from Apple",
  ],
  ["+44 (0) 20 7946 0958", "+442079460958", "UK with the trunk (0)"],
  ["+44-20-7946-0958", "+442079460958", "UK with dashes"],
  ["0044 20 7946 0958", "+442079460958", "UK with 00 dial prefix"],
  ["011 44 20 7946 0958", "+442079460958", "UK with 011 dial prefix"],
  [
    "+30 (0) 21 0123 4567",
    "+302101234567",
    "Greece keeps the 0 in its country code",
  ],
  ["+52 55 1234 5678", "+525512345678", "Mexico"],
  ["+61 4 1234 5678", "+61412345678", "Australia"],
  ["+49 30 901820", "+4930901820", "Germany, short"],
  ["+852 2123 4567", "+85221234567", "Hong Kong"],
  ["+353 1 234 5678", "+35312345678", "Ireland"],
  ["+449999999999999", "+449999999999999", "15 digits is the longest allowed"],
];

const BAD = [
  [null, "", "empty"],
  [undefined, "", "empty"],
  ["", "", "empty"],
  ["   \u200E ", "", "only spaces and marks"],
  ["12345", US_ERROR, "too short"],
  ["740627008", US_ERROR, "9 digits"],
  ["74062700801", US_ERROR, "11 digits not starting with 1"],
  ["+1 740 627 0080 1", US_ERROR, "+1 with an extra digit"],
  ["1-740-627-00800", US_ERROR, "1 and 11 more digits"],
  ["1234567890", US_ERROR, "area code starts with 1"],
  ["0407270080", US_ERROR, "area code starts with 0"],
  ["740-027-0080", US_ERROR, "exchange starts with 0"],
  ["740-127-0080", US_ERROR, "exchange starts with 1"],
  ["abcdefghij", US_ERROR, "letters"],
  ["740-627-0080 ext 5", US_ERROR, "letters after the number"],
  ["740/627/0080", US_ERROR, "slashes"],
  ["740+627+0080", US_ERROR, "plus inside the number"],
  ["+", WORLD_ERROR, "only a plus"],
  ["+44", WORLD_ERROR, "country code only"],
  ["+44 20 79", WORLD_ERROR, "world number too short"],
  ["+0 123 456 7890", WORLD_ERROR, "country code cannot start with 0"],
  ["+4412345678901234", WORLD_ERROR, "16 digits is too many"],
  ["00", WORLD_ERROR, "only 00"],
  ["()", US_ERROR, "only brackets"],
  ["+12345678", US_ERROR, "+1 is the US, so 7 digits is too short"],
];

describe("phone numbers", () => {
  for (const script of scripts) {
    describe(script, () => {
      it("reads a US/Canada number typed or pasted any way as the same 10 digits", async () => {
        const view = await renderBooking(script);
        const { parsePhone } = view.window.MidnightRides;
        for (const [input, label] of US_FORMS) {
          const got = parsePhone(input);
          check(got.saved, "7406270080", {
            label: `US ${label} saves 10 digits`,
            actual: got,
            source: "js/booking.js",
            loaded: script,
          });
          check([got.complete, got.kind, got.error], [true, "us", ""], {
            label: `US ${label} is complete`,
            actual: got,
            source: "js/booking.js",
            loaded: script,
          });
          check(got.display, "(740) 627-0080", {
            label: `US ${label} is shown tidy`,
            actual: got,
            source: "js/booking.js",
            loaded: script,
          });
        }
      });

      it("saves other countries whole, with + and the country code", async () => {
        const view = await renderBooking(script);
        const { parsePhone } = view.window.MidnightRides;
        for (const [input, saved, label] of WORLD_FORMS) {
          const got = parsePhone(input);
          check(got.saved, saved, {
            label: `${label} saves whole`,
            actual: got,
            source: "js/booking.js",
            loaded: script,
          });
          check(got.complete, true, {
            label: `${label} is accepted`,
            actual: got,
            source: "js/booking.js",
            loaded: script,
          });
        }
      });

      it("refuses an obviously invalid number with a clear message", async () => {
        const view = await renderBooking(script);
        const { parsePhone } = view.window.MidnightRides;
        for (const [input, error, label] of BAD) {
          const got = parsePhone(input);
          check([got.complete, got.saved, got.error], [false, "", error], {
            label: `${label} is refused`,
            actual: got,
            source: "js/booking.js",
            loaded: script,
          });
        }
      });

      it("never cuts a number short while it is shown", async () => {
        const view = await renderBooking(script);
        const { parsePhone } = view.window.MidnightRides;
        check(parsePhone("17406270080123").display, "(740) 627-0080123", {
          label: "extra digits stay visible so the rider sees the problem",
          source: "js/booking.js",
          loaded: script,
        });
        check(parsePhone("+1").display, "+1", {
          label: "+1 alone waits for the rest",
          source: "js/booking.js",
          loaded: script,
        });
        check(parsePhone("(").display, "", {
          label: "an opening bracket alone is empty",
          source: "js/booking.js",
          loaded: script,
        });
        check(parsePhone("7").display, "(7", {
          label: "first digit",
          source: "js/booking.js",
          loaded: script,
        });
        check(parsePhone("7406").display, "(740) 6", {
          label: "fourth digit",
          source: "js/booking.js",
          loaded: script,
        });
      });

      it("tidies the box as a number is typed one key at a time, with or without +1", async () => {
        const view = await renderBooking(script);
        const box = view.document.querySelector("#booking-phone");
        const typeKeys = (text) => {
          const shown = [];
          box.value = "";
          for (const key of text) {
            box.value += key;
            view.window.jQuery(box).trigger("input");
            shown.push(box.value);
          }
          return shown;
        };
        const plus = typeKeys("+17406270080");
        check(plus[1], "+1", {
          label: "+1 waits",
          actual: plus,
          source: "js/booking.js",
          loaded: script,
        });
        check(plus.at(-1), "(740) 627-0080", {
          label: "typing +17406270080 ends as a tidy US number",
          actual: plus,
          source: "js/booking.js",
          loaded: script,
        });
        check(view.window.jQuery(box).data("raw-value"), "7406270080", {
          label: "the saved value is 10 digits",
          source: "js/booking.js",
          loaded: script,
        });
        const one = typeKeys("17406270080");
        check(one.at(-1), "(740) 627-0080", {
          label: "typing 17406270080 ends as a tidy US number",
          actual: one,
          source: "js/booking.js",
          loaded: script,
        });
        const plain = typeKeys("7406270080");
        check(plain.at(-1), "(740) 627-0080", {
          label: "typing 7406270080 ends as a tidy US number",
          actual: plain,
          source: "js/booking.js",
          loaded: script,
        });
        const world = typeKeys("+44 20 7946 0958");
        check(world.at(-1), "+44 20 7946 0958", {
          label: "a UK number stays as typed",
          actual: world,
          source: "js/booking.js",
          loaded: script,
        });
        check(view.window.jQuery(box).data("raw-value"), "+442079460958", {
          label: "the saved UK value keeps + and the whole number",
          source: "js/booking.js",
          loaded: script,
        });
        const letters = typeKeys("7a4b0");
        check(letters.at(-1), "(740", {
          label: "letters are dropped while typing",
          actual: letters,
          source: "js/booking.js",
          loaded: script,
        });
      });

      it("takes a pasted Apple Contacts number in one go", async () => {
        const view = await renderBooking(script);
        const box = view.document.querySelector("#booking-phone");
        for (const pasted of [APPLE, APPLE_MARKS, "+1 (740) 627-0080"]) {
          box.value = pasted;
          view.window.jQuery(box).trigger("input");
          check(box.value, "(740) 627-0080", {
            label: "pasted number is tidied",
            actual: box.value,
            source: "js/booking.js",
            loaded: script,
          });
          check(view.window.jQuery(box).data("raw-value"), "7406270080", {
            label: "pasted number saves 10 digits",
            source: "js/booking.js",
            loaded: script,
          });
        }
      });

      it("keeps a failed submit's message away once the number becomes valid", async () => {
        const view = await renderBooking(script);
        await fillValid(view, { trip: "airport", phone: "12345" });
        view.window.jQuery("#bookingForm").trigger("submit");
        const help = () =>
          view.document
            .querySelector("#phone-group .help-block")
            .textContent.trim();
        check(help(), US_ERROR, {
          label: "a short number is refused with the message",
          source: "js/booking.js",
          loaded: script,
        });
        const box = view.document.querySelector("#booking-phone");
        box.value = "+1 (740) 627-0080";
        view.window.jQuery(box).trigger("input");
        check(help(), "", {
          label: "the message clears when the number is valid",
          source: "js/booking.js",
          loaded: script,
        });
      });

      it("asks for a phone when it is empty and explains a bad + number", async () => {
        const view = await renderBooking(script);
        await fillValid(view, { trip: "airport", phone: "" });
        view.window.jQuery("#bookingForm").trigger("submit");
        const help = () =>
          view.document
            .querySelector("#phone-group .help-block")
            .textContent.trim();
        check(help(), "Phone number is required", {
          label: "empty phone",
          source: "js/booking.js",
          loaded: script,
        });
        const again = await renderBooking(script);
        await fillValid(again, { trip: "airport", phone: "+44 20" });
        again.window.jQuery("#bookingForm").trigger("submit");
        const help2 = () =>
          again.document
            .querySelector("#phone-group .help-block")
            .textContent.trim();
        check(help2(), WORLD_ERROR, {
          label: "short + number",
          source: "js/booking.js",
          loaded: script,
        });
      });

      // Every form on the page shares the one phone box, and each ride type posts it the same way.
      const forms = [
        ["airport", { trip: "airport" }],
        ["bar", { trip: "local", localKind: "bar" }],
        ["party", { trip: "local", localKind: "party" }],
        ["Just a ride", { trip: "local", localKind: "ride" }],
        ["group", { trip: "group" }],
      ];
      for (const [name, overrides] of forms) {
        for (const [typed, saved] of [
          [APPLE, "7406270080"],
          ["+1 (740) 627-0080", "7406270080"],
          ["1-740-627-0080", "7406270080"],
          ["7406270080", "7406270080"],
          ["+44 20 7946 0958", "+442079460958"],
        ]) {
          it(`${name} form posts ${saved} when the rider enters ${visible(typed)}`, async () => {
            const view = await renderBooking(script, { miles: 12 });
            await fillValid(view, { ...overrides, phone: typed });
            await submitForm(view);
            check(resultText(view.document).length > 0, true, {
              label: "the booking went through",
              source: "js/booking.js",
              loaded: script,
            });
            const form = formPosts(view.state);
            check(form.length > 0, true, {
              label: "a form post was sent",
              source: "js/booking.js",
              loaded: script,
            });
            for (const post of form) {
              const entry = post.formEntries.find(
                ([key]) => key === PHONE_ENTRY,
              );
              check(entry && entry[1], saved, {
                label: "the Google Form phone",
                actual: post.formEntries,
                source: "js/booking.js",
                loaded: script,
              });
            }
            const target = new URL(CALENDAR_URL);
            const calendar = view.state.requests.filter(
              (request) =>
                request.method === "POST" &&
                sameEndpoint(request.url, target.origin, target.pathname),
            );
            check(calendar.length > 0, true, {
              label: "a calendar post was sent",
              source: "js/booking.js",
              loaded: script,
            });
            for (const post of calendar) {
              check(JSON.parse(post.body).phone, saved, {
                label: "the calendar script phone",
                actual: post.body,
                source: "js/booking.js",
                loaded: script,
              });
            }
          });
        }
      }

      it("a round-trip airport booking sends the same phone on both legs", async () => {
        const view = await renderBooking(script, { miles: 12 });
        await fillValid(view, {
          trip: "airport",
          roundTrip: true,
          phone: APPLE,
        });
        await submitForm(view);
        const phones = formPosts(view.state).map(
          (post) => post.formEntries.find(([key]) => key === PHONE_ENTRY)[1],
        );
        check(phones, ["7406270080", "7406270080"], {
          label: "both legs",
          actual: phones,
          source: "js/booking.js",
          loaded: script,
        });
      });
    });
  }
});
