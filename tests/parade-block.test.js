// Donald, Nov 25, 2026: no ride on Dec 5, 2026 from 7:00 AM up to (not including) 4:00 PM Eastern, for the pickup or the
// ride back. April's phone block (7 AM to 3 PM) is separate and not changed. Before 7:00 AM, at 4:00 PM or later, and every other day still book.
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { check } from "./helpers/failure.js";
import {
  drainTimers,
  fillValid,
  formPosts,
  renderBooking,
  resultText,
  submitForm,
  typeTime,
} from "./helpers/render-booking.js";

const scripts = ["js/booking.js", "js/booking.min.js"];
const MESSAGE =
  "We're sorry, we are in the Denver Christmas parade today. We're sorry, we couldn't help you. You can book after 4 PM.";

beforeEach(() => {
  // Only the clock: the parade day is a future date no matter when this suite runs.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T15:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  drainTimers();
});

function err(view, id) {
  return view.document.querySelector(`#${id}`).textContent;
}

describe.each(scripts)("Dec 5 parade block %s", (script) => {
  async function pickup(date, time, extra = {}) {
    const view = await renderBooking(script);
    await fillValid(view, { date, time, ...extra });
    await submitForm(view);
    return view;
  }

  function blocked(view, label) {
    check(resultText(view.document).includes(MESSAGE), true, {
      label: `${label}: the rider sees the parade message`,
      actual: resultText(view.document),
      source: "js/booking.js",
      loaded: script,
    });
    check(formPosts(view.state).length, 0, {
      label: `${label}: nothing is sent`,
      source: "js/booking.js",
      loaded: script,
    });
  }

  function sent(view, label) {
    check(resultText(view.document).includes("parade"), false, {
      label: `${label}: no parade message`,
      actual: resultText(view.document),
      source: "js/booking.js",
      loaded: script,
    });
    check(formPosts(view.state).length > 0, true, {
      label: `${label}: the ride is sent`,
      actual: resultText(view.document),
      source: "js/booking.js",
      loaded: script,
    });
  }

  it("Dec 5 at 6:59 AM books", async () => {
    sent(await pickup("2026-12-05", "06:59:00"), "6:59 AM");
  });

  it("Dec 5 at 7:00 AM is blocked, and the date box shows the message", async () => {
    const view = await pickup("2026-12-05", "07:00:00");
    blocked(view, "7:00 AM");
    check(err(view, "date-error"), MESSAGE, {
      label: "the message sits under the pickup date",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("Dec 5 at 10:00 AM is blocked, and a pop-up shows Donald's words until the rider presses OK", async () => {
    const view = await pickup("2026-12-05", "10:00:00");
    blocked(view, "10:00 AM");
    const popup = () => view.document.querySelector("#parade-popup");
    check(
      popup().querySelector('[role="alertdialog"]').textContent,
      MESSAGE + "OK",
      {
        label: "the pop-up says exactly Donald's words and has an OK button",
        source: "js/booking.js",
        loaded: script,
      },
    );
    // Submitting again replaces the pop-up instead of stacking a second one.
    await submitForm(view);
    check(view.document.querySelectorAll("#parade-popup").length, 1, {
      label: "one pop-up at a time",
      source: "js/booking.js",
      loaded: script,
    });
    view.window.jQuery("#parade-popup-ok").trigger("click");
    check(popup(), null, {
      label: "OK closes the pop-up",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("the Escape key also closes the pop-up, and other keys do not", async () => {
    const view = await pickup("2026-12-05", "10:00:00");
    view.window
      .jQuery(view.document)
      .trigger(view.window.jQuery.Event("keydown", { key: "a" }));
    check(Boolean(view.document.querySelector("#parade-popup")), true, {
      label: "another key leaves the pop-up open",
      source: "js/booking.js",
      loaded: script,
    });
    view.window
      .jQuery(view.document)
      .trigger(view.window.jQuery.Event("keydown", { key: "Escape" }));
    check(view.document.querySelector("#parade-popup"), null, {
      label: "Escape closes the pop-up",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("a ride that books shows no pop-up", async () => {
    const view = await pickup("2026-12-05", "16:00:00");
    check(view.document.querySelector("#parade-popup"), null, {
      label: "no pop-up for a bookable time",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("Dec 5 at 3:59 PM is blocked", async () => {
    blocked(await pickup("2026-12-05", "15:59:00"), "3:59 PM");
  });

  it("Dec 5 at 3:00 PM is blocked (the old end time)", async () => {
    blocked(await pickup("2026-12-05", "15:00:00"), "3:00 PM");
  });

  it("Dec 5 at 4:00 PM books", async () => {
    sent(await pickup("2026-12-05", "16:00:00"), "4:00 PM");
  });

  it("Dec 4 and Dec 6 at 10:00 AM book", async () => {
    sent(await pickup("2026-12-04", "10:00:00"), "Dec 4 10:00 AM");
    sent(await pickup("2026-12-06", "10:00:00"), "Dec 6 10:00 AM");
  });

  it("the same time on the parade day next year is not blocked", async () => {
    sent(await pickup("2027-12-05", "10:00:00"), "Dec 5, 2027 10:00 AM");
  });

  it("a round trip whose return leg is Dec 5 at 10:00 AM is blocked", async () => {
    const view = await pickup("2026-12-04", "10:00:00", {
      roundTrip: true,
      returnDate: "2026-12-05",
      returnTime: "10:00:00",
      flight: "AA1234",
    });
    blocked(view, "return leg 10:00 AM");
    check(err(view, "return-date-error"), MESSAGE, {
      label: "the message sits under the return date",
      source: "js/booking.js",
      loaded: script,
    });
    check(resultText(view.document).includes("Return pickup:"), true, {
      label: "the list says it is the return pickup",
      actual: resultText(view.document),
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("a round trip whose return leg is Dec 5 at 6:59 AM or 4:00 PM books", async () => {
    for (const returnTime of ["06:59:00", "16:00:00"]) {
      sent(
        await pickup("2026-12-04", "10:00:00", {
          roundTrip: true,
          returnDate: "2026-12-05",
          returnTime,
          flight: "AA1234",
        }),
        `return leg ${returnTime}`,
      );
    }
  });

  describe("a bar round trip", () => {
    async function barRound(date, time, backTime) {
      const view = await renderBooking(script, { miles: 4 });
      await fillValid(view, { trip: "local", roundTrip: null, date, time });
      const yes = view.document.querySelector("#booking-round-trip");
      yes.checked = true;
      view.window.jQuery(yes).trigger("change");
      view.window.jQuery("#bar-return-passengers").val("2").trigger("input");
      typeTime(view.document, "bar-return-time", backTime);
      view.window
        .jQuery("#bar-return-location")
        .val("Front door")
        .trigger("input");
      await submitForm(view);
      return view;
    }

    it("is blocked when the ride back is Dec 5 at 10:00 AM, even if the pickup is not", async () => {
      const view = await barRound("2026-12-05", "06:00:00", "10:00:00");
      blocked(view, "bar ride back 10:00 AM");
      check(err(view, "bar-return-time-error"), MESSAGE, {
        label: "the message sits under the ride-back time",
        source: "js/booking.js",
        loaded: script,
      });
    });

    it("books when the ride back is Dec 5 at 6:59 AM or 4:00 PM", async () => {
      sent(
        await barRound("2026-12-05", "06:00:00", "06:59:00"),
        "bar back 6:59 AM",
      );
      sent(
        await barRound("2026-12-05", "06:00:00", "16:00:00"),
        "bar back 4:00 PM",
      );
    });

    it("books when the ride is Dec 4 with the ride back at 10:00 AM", async () => {
      sent(await barRound("2026-12-04", "08:00:00", "10:00:00"), "bar Dec 4");
    });
  });
});
