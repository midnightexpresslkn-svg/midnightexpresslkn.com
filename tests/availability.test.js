import { afterEach, describe, it, vi } from "vitest";
import { SOURCE } from "./helpers/source-line.js";
import { check, role } from "./helpers/failure.js";
import { hostnameOf } from "./helpers/hostname.js";
import {
  atLocal,
  drainTimers,
  fillValid,
  flushTimersOf,
  renderBooking,
  resultText,
  setWhen,
  submitForm,
} from "./helpers/render-booking.js";

const scripts = ["js/booking.js", "js/booking.min.js"];
const day = "2026-12-15";

afterEach(() => {
  drainTimers();
  vi.useRealTimers();
});

function pad(number) {
  return String(number).padStart(2, "0");
}

function stamp(date) {
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  };
}

function ajaxCount(state) {
  return state.requests.filter(
    (request) =>
      request.via === "ajax" && hostnameOf(request.url) === "script.google.com",
  ).length;
}

function timelineText(document) {
  return (
    document
      .querySelector("#timeline-visual")
      ?.textContent?.replace(/\s+/g, " ")
      .trim() || ""
  );
}

describe.each(scripts)("availability %s", (script) => {
  it("says every time is open when the calendar is empty", async () => {
    const view = await renderBooking(script, { bookings: [] });
    check(timelineText(view.document).includes("All times available!"), true, {
      label: "empty calendar copy",
      actual: timelineText(view.document),
      source: SOURCE.timeline,
      loaded: script,
    });
  });

  it("tells the rider to call when the calendar cannot be loaded", async () => {
    const view = await renderBooking(script, { bookingsMode: "error" });
    check(
      timelineText(view.document).includes(
        "Call (980) 422-9125 to confirm availability",
      ),
      true,
      {
        label: "calendar failure copy",
        actual: timelineText(view.document),
        source: SOURCE.timeline,
        loaded: script,
      },
    );
  });

  it("treats a malformed calendar as having no rides", async () => {
    const view = await renderBooking(script, { bookingsMode: "bad" });
    check(timelineText(view.document).includes("All times available!"), true, {
      label: "malformed calendar copy",
      actual: timelineText(view.document),
      source: SOURCE.drivers,
      loaded: script,
    });
  });

  it("draws two unavailable ranges and the 12-hour labels", async () => {
    const view = await renderBooking(script, {
      bookings: [
        { datetime: atLocal(day, 0, 0) },
        { datetime: atLocal(day, 0, 0) },
        { datetime: atLocal(day, 13, 59) },
        { datetime: atLocal(day, 13, 59) },
      ],
    });
    setWhen(view.document, day, "10:00:00");
    const text = timelineText(view.document);
    check(text.includes("Unavailable: 12:00 AM - 2:00 AM"), true, {
      label: "midnight range",
      actual: text,
      source: SOURCE.timeline,
      loaded: script,
    });
    check(text.includes("Unavailable: 12:00 PM - 3:59 PM"), true, {
      label: "afternoon range",
      source: SOURCE.timeline,
      loaded: script,
    });
    check(text.split("Unavailable:").length - 1, 2, {
      label: "two separate unavailable ranges",
      actual: text,
      source: SOURCE.timeline,
      loaded: script,
    });
    check(
      view.document.querySelector("#timeline-date").textContent,
      "Tue, Dec 15, 2026",
      {
        label: "timeline date",
        source: SOURCE.timeline,
        loaded: script,
      },
    );
  });

  it("shows a busy day without a red range when only one driver is booked", async () => {
    const view = await renderBooking(script, {
      bookings: [{ datetime: atLocal(day, 10, 0) }],
    });
    setWhen(view.document, day, "10:00:00");
    check(timelineText(view.document).includes("Unavailable:"), false, {
      label: "one driver does not paint a red range",
      actual: timelineText(view.document),
      source: SOURCE.drivers,
      loaded: script,
    });
    check(
      view.document.querySelector("#timeline-instruction").style.display !==
        "none",
      true,
      {
        label: "one booking still shows the timeline",
        source: SOURCE.timeline,
        loaded: script,
      },
    );
  });

  it("updates the timeline when the pickup date changes", async () => {
    const view = await renderBooking(script, { bookings: [] });
    setWhen(view.document, "2026-12-20", "10:00:00");
    check(
      view.document.querySelector("#timeline-date").textContent,
      "Sun, Dec 20, 2026",
      {
        label: "timeline follows the pickup date",
        source: SOURCE.timeline,
        loaded: script,
      },
    );
  });

  it("shows the return timeline for the return date", async () => {
    const view = await renderBooking(script, {
      bookings: [
        { datetime: atLocal("2026-12-16", 15, 0) },
        { datetime: atLocal("2026-12-16", 15, 0) },
      ],
    });
    const roundTrip = role(view.document, "checkbox", { name: /round trip/i });
    roundTrip.checked = true;
    view.$(roundTrip).trigger("change");
    flushTimersOf(100);
    setWhen(view.document, "2026-12-16", "15:00:00", "return-");
    const text =
      view.document
        .querySelector("#return-timeline-visual")
        ?.textContent?.replace(/\s+/g, " ")
        .trim() || "";
    check(text.includes("Unavailable:"), true, {
      label: "return timeline marks the busy return",
      actual: text,
      source: SOURCE.timeline,
      loaded: script,
    });
    check(
      view.document.querySelector("#return-timeline-date").textContent,
      "Wed, Dec 16, 2026",
      {
        label: "return timeline date",
        source: SOURCE.timeline,
        loaded: script,
      },
    );
  });

  it("asks for a call on the return timeline when the calendar failed", async () => {
    const view = await renderBooking(script, { bookingsMode: "error" });
    const roundTrip = role(view.document, "checkbox", { name: /round trip/i });
    roundTrip.checked = true;
    view.$(roundTrip).trigger("change");
    flushTimersOf(100);
    setWhen(view.document, "2026-12-16", "15:00:00", "return-");
    const text = view.document.querySelector(
      "#return-timeline-visual",
    ).textContent;
    check(text.includes("Call (980) 422-9125 to confirm availability"), true, {
      label: "return timeline calendar failure",
      actual: text,
      source: SOURCE.timeline,
      loaded: script,
    });
  });

  it("can rebuild the return pickers when round trip is selected twice", async () => {
    const view = await renderBooking(script);
    const roundTrip = role(view.document, "checkbox", { name: /round trip/i });
    roundTrip.checked = true;
    view.$(roundTrip).trigger("change");
    flushTimersOf(100);
    roundTrip.checked = false;
    view.$(roundTrip).trigger("change");
    roundTrip.checked = true;
    view.$(roundTrip).trigger("change");
    flushTimersOf(100);
    setWhen(view.document, "2026-12-16", "15:00:00", "return-");
    check(
      view.document.querySelector("#booking-return-date").value,
      "2026-12-16",
      {
        label: "return date still accepts a date",
        source: SOURCE.timeline,
        loaded: script,
      },
    );
    check(
      view.document
        .querySelector("#return-timeline-visual")
        .textContent.includes("All times available!"),
      true,
      {
        label: "rebuilt return timeline loads",
        actual: view.document.querySelector("#return-timeline-visual")
          .textContent,
        source: SOURCE.timeline,
        loaded: script,
      },
    );
  });

  it("rejects a pickup in the past", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { date: "2020-01-02", time: "10:00:00" });
    await submitForm(view);
    check(
      resultText(view.document).includes("Pickup time cannot be in the past"),
      true,
      {
        label: "past pickup is rejected",
        actual: resultText(view.document),
        source: SOURCE.conflict,
        loaded: script,
      },
    );
  });

  it("rejects a pickup inside the three-hour window", async () => {
    const view = await renderBooking(script);
    const soon = stamp(new Date(Date.now() + 30 * 60 * 1000));
    await fillValid(view, soon);
    await submitForm(view);
    check(
      resultText(view.document).includes(
        "Please book at least 3 hours in advance",
      ),
      true,
      {
        label: "inside three hours is rejected",
        actual: resultText(view.document),
        source: SOURCE.advance,
        loaded: script,
      },
    );
  });

  it("accepts a pickup exactly three hours out", async () => {
    const view = await renderBooking(script);
    const fixed = new Date();
    fixed.setMilliseconds(0);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(fixed);
    const ready = stamp(new Date(fixed.getTime() + 3 * 60 * 60 * 1000));
    await fillValid(view, ready);
    await submitForm(view);
    check(resultText(view.document).includes("Request received"), true, {
      label: "exactly three hours is accepted",
      actual: resultText(view.document),
      source: SOURCE.advance,
      loaded: script,
    });
  });

  it("does not let a ride on another day block this one", async () => {
    const view = await renderBooking(script, {
      bookings: [
        { datetime: atLocal("2026-12-16", 10, 0) },
        { datetime: atLocal("2026-12-16", 10, 0) },
      ],
    });
    await fillValid(view, { date: day, time: "10:00:00" });
    await submitForm(view);
    check(resultText(view.document).includes("Request received"), true, {
      label: "a different day stays open",
      actual: resultText(view.document),
      source: SOURCE.conflict,
      loaded: script,
    });
  });

  it("uses the cached calendar for the first minute", async () => {
    const view = await renderBooking(script, { bookings: [] });
    const before = ajaxCount(view.state);
    await fillValid(view, { date: "2026-12-20", time: "10:00:00" });
    await submitForm(view);
    check(ajaxCount(view.state), before, {
      label: "submit reuses the calendar fetched on load",
      source: SOURCE.drivers,
      loaded: script,
    });
  });

  it("loads the calendar again after a minute", async () => {
    const view = await renderBooking(script, { bookings: [] });
    const before = ajaxCount(view.state);
    const started = Date.now();
    const original = Date.now;
    Date.now = () => started + 61000;
    try {
      await fillValid(view, { date: "2026-12-20", time: "11:00:00" });
      await submitForm(view);
    } finally {
      Date.now = original;
    }
    check(ajaxCount(view.state) > before, true, {
      label: "an old calendar is fetched again",
      actual: ajaxCount(view.state),
      source: SOURCE.drivers,
      loaded: script,
    });
    check(resultText(view.document).includes("Request received"), true, {
      label: "the refreshed calendar still accepts an open time",
      actual: resultText(view.document),
      source: SOURCE.submit,
      loaded: script,
    });
  });

  it("keeps a known conflict when a later calendar refresh fails", async () => {
    const view = await renderBooking(script, {
      bookings: [
        { datetime: atLocal(day, 10, 0) },
        { datetime: atLocal(day, 10, 0) },
      ],
    });
    const started = Date.now();
    const original = Date.now;
    Date.now = () => started + 61000;
    view.state.bookingsMode = "error";
    try {
      await fillValid(view, { date: day, time: "10:00:00" });
      await submitForm(view);
    } finally {
      Date.now = original;
    }
    check(
      resultText(view.document).includes("This time slot is not available"),
      true,
      {
        label: "a failed refresh does not forget the busy time",
        actual: resultText(view.document),
        source: SOURCE.conflict,
        loaded: script,
      },
    );
  });

  it("holds the time until the pending request expires", async () => {
    const view = await renderBooking(script, {
      bookings: [{ datetime: atLocal(day, 10, 0) }],
    });
    await fillValid(view, { date: day, time: "10:00:00" });
    await submitForm(view);
    check(resultText(view.document).includes("Request received"), true, {
      label: "the first request is received",
      source: SOURCE.drivers,
      loaded: script,
    });
    await submitForm(view);
    check(
      resultText(view.document).includes("This time slot is not available"),
      true,
      {
        label: "the pending request counts as the second driver",
        actual: resultText(view.document),
        source: SOURCE.conflict,
        loaded: script,
      },
    );
    flushTimersOf(10000);
    await submitForm(view);
    check(resultText(view.document).includes("Request received"), true, {
      label: "the time opens again after the pending request expires",
      actual: resultText(view.document),
      source: SOURCE.conflict,
      loaded: script,
    });
  });

  it("rejects a return that overlaps the outbound ride", async () => {
    const view = await renderBooking(script, {
      bookings: [{ datetime: atLocal(day, 15, 0) }],
    });
    await fillValid(view, {
      date: day,
      time: "15:00:00",
      roundTrip: true,
      returnDate: day,
      returnTime: "15:30:00",
    });
    await submitForm(view);
    check(
      resultText(view.document).includes(
        "Return flight time conflicts with outbound flight",
      ),
      true,
      {
        label: "same-day return overlaps the outbound ride",
        actual: resultText(view.document),
        source: SOURCE.overlap,
        loaded: script,
      },
    );
  });

  it("rejects a return time both drivers are already using", async () => {
    const view = await renderBooking(script, {
      bookings: [
        { datetime: atLocal(day, 18, 0) },
        { datetime: atLocal(day, 18, 0) },
      ],
    });
    await fillValid(view, {
      date: day,
      time: "10:00:00",
      roundTrip: true,
      returnDate: day,
      returnTime: "18:00:00",
    });
    await submitForm(view);
    check(
      resultText(view.document).includes(
        "Return flight: This time slot is not available",
      ),
      true,
      {
        label: "return time is already fully booked",
        actual: resultText(view.document),
        source: SOURCE.conflict,
        loaded: script,
      },
    );
  });

  it("rejects a return that is not after the pickup", async () => {
    const view = await renderBooking(script);
    await fillValid(view, {
      date: day,
      time: "10:00:00",
      roundTrip: true,
      returnDate: day,
      returnTime: "09:00:00",
    });
    await submitForm(view);
    check(
      resultText(view.document).includes(
        "Return date must be after pickup date",
      ),
      true,
      {
        label: "return before pickup is rejected",
        actual: resultText(view.document),
        source: SOURCE.conflict,
        loaded: script,
      },
    );
  });
});
