import { afterEach, describe, it } from "vitest";
import { waitFor } from "@testing-library/dom";
import { check } from "./helpers/failure.js";
import {
  atLocal,
  drainTimers,
  fillValid,
  formPosts,
  renderBooking,
  resultText,
  setWhen,
  showQuote,
  submitForm,
} from "./helpers/render-booking.js";

const scripts = ["js/booking.js", "js/booking.min.js"];

afterEach(() => {
  drainTimers();
});

function text(view) {
  return resultText(view.document);
}

async function expectVisible(view, snippet) {
  await submitForm(view);
  check(text(view).includes(snippet), true, {
    label: snippet,
    actual: text(view),
    source: "js/booking.js",
    loaded: view.script,
  });
}

describe.each(scripts)("booking gaps %s", (script) => {
  it("names each missing or invalid field before it sends a ride", async () => {
    const view = await renderBooking(script);
    view.document.querySelector("#booking-name").value = "";
    view.document.querySelector("#booking-phone").value = "";
    view.document.querySelector("#booking-phone").dataset.rawValue = "";
    view.window.jQuery("#booking-phone").removeData("raw-value");
    view.document.querySelector("#booking-email").value = "not-an-email";
    const date = view.document.querySelector("#booking-date");
    const time = view.document.querySelector("#booking-time");
    if (date._flatpickr) date._flatpickr.clear();
    if (time._flatpickr) time._flatpickr.clear();
    date.value = "";
    time.value = "";
    view.document.querySelector("#booking-pickup").value = "";
    view.document.querySelector("#trip-type").value = "";
    await expectVisible(view, "Name is required");
    check(text(view).includes("Phone number is required"), true, {
      label: "blank phone",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    check(text(view).includes("Please enter a valid email address"), true, {
      label: "bad email",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    check(text(view).includes("Pickup date is required"), true, {
      label: "blank date",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    check(text(view).includes("Pickup time is required"), true, {
      label: "blank time",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    check(text(view).includes("Pickup address is required"), true, {
      label: "blank pickup before a trip type is chosen",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    check(text(view).includes("Please choose a trip type"), true, {
      label: "no trip type",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    check(
      view.document.querySelector("#trip-type-error").textContent,
      "Please choose Airport or Group",
      {
        label: "the trip menu says how to choose",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("rejects a short phone number and a bad flight number", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport", flight: "!!" });
    const phone = view.document.querySelector("#booking-phone");
    phone.value = "12345";
    view.window.jQuery(phone).trigger("input");
    await expectVisible(view, "Please enter a valid 10-digit phone number");
    check(text(view).includes("Please enter a valid flight number"), true, {
      label: "bad flight number",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("asks for a home address on an airport trip and a destination on a group trip", async () => {
    const airport = await renderBooking(script);
    await fillValid(airport, { trip: "airport" });
    airport.document.querySelector("#booking-pickup").value = "";
    await expectVisible(airport, "Home address is required");

    const group = await renderBooking(script);
    await fillValid(group, { trip: "group" });
    group.document.querySelector("#booking-destination").value = "";
    await expectVisible(group, "Destination address is required");
  });

  it("lowers the seat count when a wheelchair or car seat is requested", async () => {
    const view = await renderBooking(script);
    const box = view.document.querySelector("#booking-wheelchair");
    box.checked = true;
    view.window.jQuery(box).trigger("change");
    const message = view.document.querySelector(
      "#passenger-capacity-message",
    ).textContent;
    check(message.includes("reduced for mobility aid"), true, {
      label: "a wheelchair tells the rider the seat count dropped",
      actual: message,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("still opens the form when the address bar cannot be read", async () => {
    const Real = globalThis.URLSearchParams;
    globalThis.URLSearchParams = class {
      constructor() {
        throw new Error("unreadable");
      }
    };
    try {
      const view = await renderBooking(script, { url: "/?type=airport" });
      check(view.document.querySelector("#bookingForm") !== null, true, {
        label: "the form still loads",
        source: "js/booking.js",
        loaded: script,
      });
      check(view.document.querySelector("#trip-type").value, "", {
        label: "a broken address bar does not force a trip type",
        source: "js/booking.js",
        loaded: script,
      });
    } finally {
      globalThis.URLSearchParams = Real;
    }
  });

  it("requires a return date and time, and a return that is after the pickup", async () => {
    const missing = await renderBooking(script);
    await fillValid(missing, {
      trip: "airport",
      roundTrip: true,
      returnDate: "2026-12-16",
      returnTime: "15:00:00",
    });
    const returnDate = missing.document.querySelector("#booking-return-date");
    const returnTime = missing.document.querySelector("#booking-return-time");
    if (returnDate._flatpickr) returnDate._flatpickr.clear();
    if (returnTime._flatpickr) returnTime._flatpickr.clear();
    returnDate.value = "";
    returnTime.value = "";
    await expectVisible(
      missing,
      "Return flight date is required for round trips",
    );
    check(
      text(missing).includes("Return flight time is required for round trips"),
      true,
      {
        label: "blank return time",
        actual: text(missing),
        source: "js/booking.js",
        loaded: script,
      },
    );

    const early = await renderBooking(script);
    await fillValid(early, {
      trip: "airport",
      date: "2026-12-15",
      time: "15:00:00",
      roundTrip: true,
      returnDate: "2026-12-15",
      returnTime: "10:00:00",
    });
    await expectVisible(early, "Return date must be after pickup date");
  });

  it("asks for the town when the geocoder fails", async () => {
    const view = await renderBooking(script, { censusMode: "error" });
    await fillValid(view, {
      name: "TEST, DO NOT BOOK",
      pickup: "100 Main Street",
      destination: "200 Second Street",
      trip: "group",
    });
    await submitForm(view);
    check(text(view).includes("Please include the town and state"), true, {
      label: "geocoder failure asks for the town",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("tells the rider to call when the busy list cannot be loaded", async () => {
    const view = await renderBooking(script, { bookingsMode: "error" });
    const box = view.document.createElement("div");
    box.innerHTML =
      '<div id="timeline-container"><div id="timeline-date"></div><div id="timeline-instruction"></div><div id="timeline-visual"></div></div>';
    view.document.body.append(box);
    setWhen(view.document, "2026-12-15", "10:00:00");
    check(
      view.document.querySelector("#timeline-visual").textContent,
      "Call (980) 422-9125 to confirm availability",
      {
        label: "a failed busy-list load does not claim every time is open",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("shows two separate unavailable ranges when both drivers are busy twice", async () => {
    const day = "2026-12-15";
    const view = await renderBooking(script, {
      bookings: [
        { datetime: atLocal(day, 8, 0) },
        { datetime: atLocal(day, 8, 0) },
        { datetime: atLocal(day, 16, 0) },
        { datetime: atLocal(day, 16, 0) },
      ],
    });
    const box = view.document.createElement("div");
    box.innerHTML =
      '<div id="timeline-container"><div id="timeline-date"></div><div id="timeline-instruction"></div><div id="timeline-visual"></div></div>';
    view.document.body.append(box);
    setWhen(view.document, day, "12:00:00");
    const shown = view.document.querySelector("#timeline-visual").textContent;
    const ranges = shown.match(/Unavailable:/g) || [];
    check(ranges.length, 2, {
      label: "two busy periods stay two ranges",
      actual: shown,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("offers another booking after a request is sent", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport", notes: "QA note" });
    await submitForm(view);
    const button = await waitFor(
      () => {
        const found = view.document.querySelector("#new-booking-btn");
        if (!found) throw new Error("waiting for another booking");
        return found;
      },
      { timeout: 4000 },
    );
    button.click();
    check(view.document.querySelector("#booking-name").value, "", {
      label: "another booking starts with an empty name",
      source: "js/booking.js",
      loaded: script,
    });
    check(text(view), "", {
      label: "the previous confirmation is cleared",
      source: "js/booking.js",
      loaded: script,
    });
    check(
      view.document.querySelector("#bookingForm").style.display === "none",
      false,
      {
        label: "the form is shown again",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("still shows a validation error when smooth scrolling throws", async () => {
    const view = await renderBooking(script);
    const scrolls = [];
    view.window.scrollTo = (arg) => {
      if (arg && typeof arg === "object") throw new Error("no smooth scroll");
      scrolls.push(arg);
    };
    view.document.querySelector("#booking-name").value = "";
    await expectVisible(view, "Name is required");
    check(scrolls.length > 0, true, {
      label: "the page falls back to an immediate scroll",
      actual: scrolls,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("does not scroll when the error is already on screen", async () => {
    const view = await renderBooking(script);
    let scrolled = false;
    view.window.scrollTo = () => {
      scrolled = true;
    };
    const proto = view.window.HTMLElement.prototype;
    const previousRect = proto.getBoundingClientRect;
    proto.getBoundingClientRect = () => ({
      top: 40,
      bottom: 80,
      height: 40,
      left: 0,
      right: 100,
      width: 100,
    });
    try {
      view.document.querySelector("#booking-name").value = "";
      await expectVisible(view, "Name is required");
    } finally {
      proto.getBoundingClientRect = previousRect;
    }
    check(scrolled, false, {
      label: "an error already in view does not move the page",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("clears the airport and asks for one when the menu is set back to blank", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport" });
    const menu = view.document.querySelector("#airport-choice");
    menu.value = "";
    view.window.jQuery(menu).trigger("change");
    check(view.document.querySelector("#booking-destination").value, "", {
      label: "clearing the airport clears the destination",
      source: "js/booking.js",
      loaded: script,
    });
    await submitForm(view);
    check(text(view).includes("Please choose an airport"), true, {
      label: "a cleared airport menu must be chosen again",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("refuses a pickup in the past and one inside the three-hour window", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport" });
    view.document.querySelector("#booking-date").value = "2020-01-01";
    view.document.querySelector("#booking-time").value = "12:00:00";
    await expectVisible(view, "Pickup time cannot be in the past");
    check(formPosts(view.state).length, 0, {
      label: "a past pickup is not sent",
      source: "js/booking.js",
      loaded: script,
    });

    const soon = new Date(Date.now() + 90 * 60 * 1000);
    const y = soon.getFullYear();
    const m = String(soon.getMonth() + 1).padStart(2, "0");
    const d = String(soon.getDate()).padStart(2, "0");
    const hh = String(soon.getHours()).padStart(2, "0");
    const mm = String(soon.getMinutes()).padStart(2, "0");
    view.document.querySelector("#booking-success").textContent = "";
    view.document.querySelector("#booking-date").value = `${y}-${m}-${d}`;
    view.document.querySelector("#booking-time").value = `${hh}:${mm}:00`;
    await expectVisible(view, "Please book at least 3 hours in advance");
    check(formPosts(view.state).length, 0, {
      label: "a rush pickup is not sent",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("formats a phone number as the rider types and keeps ten digits", async () => {
    const view = await renderBooking(script);
    const phone = view.document.querySelector("#booking-phone");
    phone.value = "980422912599";
    phone.dispatchEvent(new view.window.Event("input", { bubbles: true }));
    check(phone.value, "(980) 422-9125", {
      label: "extra digits are dropped and the rest is grouped",
      source: "js/booking.js",
      loaded: script,
    });
    check(view.window.jQuery(phone).data("raw-value"), "9804229125", {
      label: "the stored phone is the ten digits",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("warns when the return date picked on the calendar is before the pickup", async () => {
    const view = await renderBooking(script);
    await fillValid(view, {
      trip: "airport",
      date: "2026-12-15",
      time: "10:00:00",
      roundTrip: true,
      returnDate: "2026-12-16",
      returnTime: "15:00:00",
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const returnDate = view.document.querySelector("#booking-return-date");
    check(Boolean(returnDate._flatpickr), true, {
      label: "checking round trip opens the return date calendar",
      source: "js/booking.js",
      loaded: script,
    });
    returnDate._flatpickr.setDate("2026-12-14", true);
    check(
      view.document.querySelector("#return-date-error").textContent,
      "Return date must be after pickup date",
      {
        label: "a return calendar day before pickup is rejected",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("rejects a bag count that is not a whole number and one above twenty", async () => {
    const fraction = await renderBooking(script);
    await fillValid(fraction, { trip: "airport", bags: true, bagCount: "2.5" });
    check(fraction.document.querySelector("#booking-bag-count").value, "2.5", {
      label: "a fractional bag count stays in the number field",
      source: "js/booking.js",
      loaded: script,
    });
    await expectVisible(fraction, "Please enter how many bags");
    check(formPosts(fraction.state).length, 0, {
      label: "a fractional bag count is not sent",
      source: "js/booking.js",
      loaded: script,
    });

    const tooMany = await renderBooking(script);
    await fillValid(tooMany, { trip: "airport", bags: true, bagCount: "21" });
    await expectVisible(tooMany, "Please enter how many bags");
    check(formPosts(tooMany.state).length, 0, {
      label: "more than twenty bags is not sent",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("starts the phone grouping as soon as the first digits are typed", async () => {
    const view = await renderBooking(script);
    const phone = view.document.querySelector("#booking-phone");
    phone.value = "98";
    phone.dispatchEvent(new view.window.Event("input", { bubbles: true }));
    check(phone.value, "(98", {
      label: "one to three digits stay inside the opening parenthesis",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("warns when the return time picked is before the pickup on the same day", async () => {
    const view = await renderBooking(script);
    await fillValid(view, {
      trip: "airport",
      date: "2026-12-15",
      time: "10:00:00",
      roundTrip: true,
      returnDate: "2026-12-15",
      returnTime: "15:00:00",
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const returnTime = view.document.querySelector("#booking-return-time");
    check(Boolean(returnTime._flatpickr), true, {
      label: "checking round trip opens the return time menu",
      source: "js/booking.js",
      loaded: script,
    });
    returnTime._flatpickr.setDate("08:00:00", true);
    check(
      view.document.querySelector("#return-date-error").textContent,
      "Return date must be after pickup date",
      {
        label: "an earlier return time on the pickup day is rejected",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("clears a send error when the rider focuses the form again", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport" });
    const original = view.window.fetch;
    view.window.fetch = (url, options) => {
      const target = new URL(String(url), view.window.location.href);
      if (target.hostname === "docs.google.com") {
        return Promise.reject(new Error("mocked network failure"));
      }
      return original.call(view.window, url, options);
    };
    await submitForm(view);
    check(text(view).includes("We could not send your booking request"), true, {
      label: "a failed send shows the call message",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    view.document
      .querySelector("#booking-name")
      .dispatchEvent(new view.window.Event("focus", { bubbles: true }));
    check(text(view), "", {
      label: "focusing the form removes the send error",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("opens tomorrow morning when the form is opened after 8 PM", async () => {
    const RealDate = Date;
    const evening = new RealDate(2026, 10, 10, 21, 30, 0);
    function Clock(...args) {
      if (args.length === 0) return new RealDate(evening.getTime());
      return new RealDate(...args);
    }
    Clock.now = () => evening.getTime();
    Clock.parse = RealDate.parse;
    Clock.UTC = RealDate.UTC;
    Clock.prototype = RealDate.prototype;
    globalThis.Date = Clock;
    let view;
    try {
      view = await renderBooking(script);
    } finally {
      globalThis.Date = RealDate;
    }
    check(view.document.querySelector("#booking-date").value, "2026-11-11", {
      label: "after 8 PM the pickup date starts on the next morning",
      source: "js/booking.js",
      loaded: script,
    });
    check(view.document.querySelector("#booking-time").value, "08:00:00", {
      label: "after 8 PM the pickup time starts at 8:00 AM",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("opens tomorrow morning when three hours from now would pass 8 PM", async () => {
    const RealDate = Date;
    const afternoon = new RealDate(2026, 10, 10, 17, 30, 0);
    function Clock(...args) {
      if (args.length === 0) return new RealDate(afternoon.getTime());
      return new RealDate(...args);
    }
    Clock.now = () => afternoon.getTime();
    Clock.parse = RealDate.parse;
    Clock.UTC = RealDate.UTC;
    Clock.prototype = RealDate.prototype;
    globalThis.Date = Clock;
    let view;
    try {
      view = await renderBooking(script);
    } finally {
      globalThis.Date = RealDate;
    }
    check(view.document.querySelector("#booking-date").value, "2026-11-11", {
      label: "a 5:30 PM opening does not offer an 8:30 PM pickup",
      source: "js/booking.js",
      loaded: script,
    });
    check(view.document.querySelector("#booking-time").value, "08:00:00", {
      label: "the pickup moves to 8:00 AM the next day",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("prices a pickup that leaves the state off the address", async () => {
    const view = await renderBooking(script, { censusMode: "miss" });
    const quote = await showQuote(view, {
      pickup: "100 Main Street, Denver",
      destination: "CLT",
    });
    const backup = view.state.requests.find(
      (request) =>
        request.via === "fetch" &&
        request.url.includes("nominatim.openstreetmap.org"),
    );
    check(Boolean(backup), true, {
      label: "a census miss asks the backup map",
      source: "js/booking.js",
      loaded: script,
    });
    check(
      decodeURIComponent(backup.url).includes("100 Main Street, Denver, NC"),
      true,
      {
        label: "a missing state is searched as North Carolina",
        actual: decodeURIComponent(backup.url),
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(quote, "Please include the town and state, for example Denver, NC.", {
      label: "a backup hit with no town asks for the town instead of a price",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("rejects a return that is already in the past", async () => {
    const view = await renderBooking(script);
    await fillValid(view, {
      trip: "airport",
      roundTrip: true,
      returnDate: "2026-12-16",
      returnTime: "15:00:00",
    });
    view.document.querySelector("#booking-return-date").value = "2020-01-01";
    view.document.querySelector("#booking-return-time").value = "12:00:00";
    await expectVisible(
      view,
      "Return flight: Pickup time cannot be in the past",
    );
    check(formPosts(view.state).length, 0, {
      label: "a past return is not sent",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("still tells the rider the request was received when the calendar mirror fails", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport", notes: "gate note" });
    const original = view.window.fetch;
    view.window.fetch = (url, options) => {
      const target = new URL(String(url), view.window.location.href);
      if (
        target.hostname === "script.google.com" &&
        options &&
        options.method === "POST"
      ) {
        return Promise.reject(new Error("calendar down"));
      }
      return original.call(view.window, url, options);
    };
    await submitForm(view);
    check(text(view).includes("Request received"), true, {
      label: "a calendar failure does not hide the form receipt",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    check(formPosts(view.state).length, 1, {
      label: "the form row was still sent",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("confirms both legs when a round trip is sent", async () => {
    const view = await renderBooking(script);
    await fillValid(view, {
      trip: "airport",
      roundTrip: true,
      notes: "gate note",
    });
    await submitForm(view);
    check(text(view).includes("Your round-trip requests were sent"), true, {
      label: "both legs are named after a round trip is sent",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    check(text(view).includes("confirm both bookings"), true, {
      label: "the rider is told both bookings need a call",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    check(formPosts(view.state).length, 2, {
      label: "a round trip sends the outbound row and the return row",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("holds the second driver for ten seconds so a third request cannot take that time", async () => {
    const view = await renderBooking(script, {
      bookings: [{ datetime: atLocal("2026-12-15", 10, 0) }],
    });
    await fillValid(view, {
      trip: "airport",
      date: "2026-12-15",
      time: "10:00:00",
    });
    await submitForm(view);
    check(text(view).includes("Request received"), true, {
      label:
        "the second driver can still take a time that already has one ride",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    const button = await waitFor(
      () => {
        const found = view.document.querySelector("#new-booking-btn");
        if (!found) throw new Error("waiting for another booking");
        return found;
      },
      { timeout: 4000 },
    );
    button.click();
    await fillValid(view, {
      trip: "airport",
      date: "2026-12-15",
      time: "10:00:00",
    });
    view.document.querySelector("#booking-success").textContent = "";
    await expectVisible(view, "That time is booked");
    check(formPosts(view.state).length, 1, {
      label:
        "a third request is stopped while the second driver is still pending",
      source: "js/booking.js",
      loaded: script,
    });
    await new Promise((resolve) => setTimeout(resolve, 11000));
    view.document.querySelector("#booking-success").textContent = "";
    await submitForm(view);
    check(text(view).includes("Request received"), true, {
      label: "the third request can be sent after the ten-second hold ends",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    check(formPosts(view.state).length, 2, {
      label: "the later request is the second form row",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("keeps the pickup at the three-hour mark when the clock has leftover seconds", async () => {
    const RealDate = Date;
    const instant = new RealDate(2026, 10, 10, 10, 0, 30);
    function Clock(...args) {
      if (args.length === 0) return new RealDate(instant.getTime());
      return new RealDate(...args);
    }
    Clock.now = () => instant.getTime();
    Clock.parse = RealDate.parse;
    Clock.UTC = RealDate.UTC;
    Clock.prototype = RealDate.prototype;
    globalThis.Date = Clock;
    let view;
    try {
      view = await renderBooking(script);
    } finally {
      globalThis.Date = RealDate;
    }
    check(view.document.querySelector("#booking-date").value, "2026-11-10", {
      label: "a 10:00:30 AM opening stays on the same day",
      source: "js/booking.js",
      loaded: script,
    });
    check(view.document.querySelector("#booking-time").value, "13:00:00", {
      label: "the pickup opens at 1:00 PM",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("leaves a page alone when that page has no booking form", async () => {
    delete globalThis.MidnightBooking;
    const view = await renderBooking(script, { withoutForm: true });
    check(view.document.querySelector("#bookingForm"), null, {
      label: "the booking form stays absent",
      source: "js/booking.js",
      loaded: script,
    });
    check(view.document.querySelector("#booking-date"), null, {
      label: "no pickup calendar is created",
      source: "js/booking.js",
      loaded: script,
    });
    check(view.window.MidnightBooking, undefined, {
      label: "booking tools are not installed without the form",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("still rejects an early return after the round-trip section is closed and opened", async () => {
    const view = await renderBooking(script);
    await fillValid(view, {
      trip: "airport",
      date: "2026-12-15",
      time: "10:00:00",
      roundTrip: true,
      returnDate: "2026-12-16",
      returnTime: "15:00:00",
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const box = view.document.querySelector("#booking-round-trip");
    box.checked = false;
    view.window.jQuery(box).trigger("change");
    box.checked = true;
    view.window.jQuery(box).trigger("change");
    await new Promise((resolve) => setTimeout(resolve, 150));
    const returnDate = view.document.querySelector("#booking-return-date");
    check(Boolean(returnDate._flatpickr), true, {
      label: "opening round trip again rebuilds the return calendar",
      source: "js/booking.js",
      loaded: script,
    });
    view.document
      .querySelector("#booking-return-time")
      ._flatpickr.setDate("15:00:00", true);
    returnDate._flatpickr.setDate("2026-12-14", true);
    check(
      view.document.querySelector("#return-date-error").textContent,
      "Return date must be after pickup date",
      {
        label: "the rebuilt calendar still rejects a day before pickup",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("still checks the return day when the busy list failed and the timeline is not on the page", async () => {
    const failed = await renderBooking(script, { bookingsMode: "error" });
    await fillValid(failed, {
      trip: "airport",
      date: "2026-12-15",
      time: "10:00:00",
      roundTrip: true,
      returnDate: "2026-12-16",
      returnTime: "15:00:00",
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    failed.document
      .querySelector("#booking-return-date")
      ._flatpickr.setDate("2026-12-14", true);
    check(
      failed.document.querySelector("#return-date-error").textContent,
      "Return date must be after pickup date",
      {
        label: "a failed busy list does not skip the return-day check",
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(failed.document.querySelector("#return-timeline-visual"), null, {
      label: "the page does not invent a return timeline",
      source: "js/booking.js",
      loaded: script,
    });

    const busy = await renderBooking(script, {
      bookings: [{ datetime: atLocal("2026-12-14", 9, 0) }],
    });
    await fillValid(busy, {
      trip: "airport",
      date: "2026-12-15",
      time: "10:00:00",
      roundTrip: true,
      returnDate: "2026-12-16",
      returnTime: "15:00:00",
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    busy.document
      .querySelector("#booking-return-date")
      ._flatpickr.setDate("2026-12-14", true);
    check(
      busy.document.querySelector("#return-date-error").textContent,
      "Return date must be after pickup date",
      {
        label:
          "an existing ride that day does not replace the return-day check",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("does not let a held ride on another day block a same-day round trip", async () => {
    const view = await renderBooking(script);
    await fillValid(view, {
      trip: "airport",
      date: "2026-12-16",
      time: "10:00:00",
    });
    await submitForm(view);
    const button = await waitFor(
      () => {
        const found = view.document.querySelector("#new-booking-btn");
        if (!found) throw new Error("waiting for another booking");
        return found;
      },
      { timeout: 4000 },
    );
    button.click();
    await fillValid(view, {
      trip: "airport",
      date: "2026-12-15",
      time: "10:00:00",
      roundTrip: true,
      returnDate: "2026-12-15",
      returnTime: "15:00:00",
    });
    view.document.querySelector("#booking-success").textContent = "";
    await submitForm(view);
    check(text(view).includes("Request received"), true, {
      label: "Monday's round trip is accepted while Tuesday is still held",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    check(text(view).includes("Conflicts with outbound flight"), false, {
      label: "Tuesday's hold is not reported as a same-day return conflict",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("keeps the last busy list when a later refresh fails", async () => {
    const view = await renderBooking(script, {
      bookings: [
        { datetime: atLocal("2026-12-15", 10, 0) },
        { datetime: atLocal("2026-12-15", 10, 0) },
      ],
    });
    await fillValid(view, {
      trip: "airport",
      date: "2026-12-15",
      time: "10:00:00",
    });
    const jq = view.window.jQuery;
    const original = jq.ajax;
    jq.ajax = (settings) => {
      const host = new URL(String(settings.url), view.window.location.href)
        .hostname;
      const method = (settings.method || settings.type || "GET").toUpperCase();
      if (host === "script.google.com" && method === "GET") {
        settings.error && settings.error({}, "error", "stale");
        return { abort() {} };
      }
      return original(settings);
    };
    const realNow = Date.now;
    Date.now = () => realNow() + 61000;
    try {
      await expectVisible(view, "That time is booked");
    } finally {
      Date.now = realNow;
      jq.ajax = original;
    }
    check(formPosts(view.state).length, 0, {
      label: "a failed refresh does not free a time both drivers already have",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("says the submission failed when the form post rejects without a message", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport" });
    const original = view.window.fetch;
    view.window.fetch = (url, options) => {
      const target = new URL(String(url), view.window.location.href);
      if (target.hostname === "docs.google.com") {
        return Promise.reject(new Error(""));
      }
      return original.call(view.window, url, options);
    };
    await submitForm(view);
    check(text(view).includes("Submission failed"), true, {
      label: "a blank network error still tells the rider the send failed",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    check(text(view).includes("Request received"), false, {
      label: "a blank failure is not treated as a receipt",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    check(formPosts(view.state).length, 0, {
      label: "the form row was not recorded",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("stops the send when the town check succeeds and the next geocoder call fails", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport" });
    view.document.querySelector("#booking-pickup").value = "100 Main Street";
    let lookedUp = 0;
    const jq = view.window.jQuery;
    const original = jq.ajax;
    jq.ajax = (settings) => {
      const host = new URL(String(settings.url), view.window.location.href)
        .hostname;
      if (host === "geocoding.geo.census.gov") {
        lookedUp += 1;
        if (lookedUp === 1) {
          settings.success({
            result: {
              addressMatches: [
                {
                  addressComponents: {
                    city: "Denver",
                    state: "NC",
                    zip: "28037",
                  },
                },
              ],
            },
          });
        } else if (settings.error) {
          settings.error({}, "error", "later");
        }
        return { abort() {} };
      }
      return original(settings);
    };
    await submitForm(view);
    check(
      text(view).includes(
        "Please include the town and state, for example Denver, NC.",
      ),
      true,
      {
        label: "the second geocoder failure asks for the town",
        actual: text(view),
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(text(view).includes("Request received"), false, {
      label: "the ride is not accepted after the geocoder changes its answer",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    check(formPosts(view.state).length, 0, {
      label: "no form row is sent",
      source: "js/booking.js",
      loaded: script,
    });
    check(
      view.document.querySelector("#bookingForm").style.display === "none",
      false,
      {
        label: "the form stays on screen",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("keeps the form receipt when the calendar geocoder fails after the form was sent", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport", notes: "gate note" });
    view.document.querySelector("#booking-pickup").value = "100 Main Street";
    let lookedUp = 0;
    const jq = view.window.jQuery;
    const original = jq.ajax;
    jq.ajax = (settings) => {
      const host = new URL(String(settings.url), view.window.location.href)
        .hostname;
      if (host === "geocoding.geo.census.gov") {
        lookedUp += 1;
        if (lookedUp < 3) {
          settings.success({
            result: {
              addressMatches: [
                {
                  addressComponents: {
                    city: "Denver",
                    state: "NC",
                    zip: "28037",
                  },
                },
              ],
            },
          });
        } else if (settings.error) {
          settings.error({}, "error", "later");
        }
        return { abort() {} };
      }
      return original(settings);
    };
    await submitForm(view);
    check(text(view).includes("Request received"), true, {
      label: "the form receipt stays after the calendar geocoder fails",
      actual: text(view),
      source: "js/booking.js",
      loaded: script,
    });
    check(formPosts(view.state).length, 1, {
      label: "the form row was sent before the calendar check",
      source: "js/booking.js",
      loaded: script,
    });
    const calendarPosts = view.state.requests.filter((request) => {
      if (request.method !== "POST") return false;
      return (
        new URL(request.url, view.window.location.href).hostname ===
        "script.google.com"
      );
    });
    check(calendarPosts.length, 0, {
      label: "the calendar mirror is not posted after the geocoder fails",
      source: "js/booking.js",
      loaded: script,
    });
  });
});
