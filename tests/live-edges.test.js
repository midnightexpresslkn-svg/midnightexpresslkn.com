import { describe, it } from "vitest";
import { waitFor } from "@testing-library/dom";
import { check } from "./helpers/failure.js";
import {
  fillValid,
  formPosts,
  renderBooking,
  resultText,
  showQuote,
  submitForm,
} from "./helpers/render-booking.js";

function chooseAndQuote(view) {
  const pickup = view.document.querySelector("#booking-pickup");
  const menu = view.document.querySelector("#airport-choice");
  view.document.querySelector("#trip-type").value = "airport";
  view.window.jQuery("#trip-type").trigger("change");
  menu.value = "CLT";
  view.window.jQuery(menu).trigger("change");
  pickup.value = "123 Main Street, Denver NC 28037";
  view.window.jQuery(pickup).trigger("blur");
  pickup.value = "400 Lake Shore Drive, Denver NC 28037";
  view.window.jQuery(pickup).trigger("blur");
}

const scripts = ["js/booking.js", "js/booking.min.js"];
const HINT =
  "Anything we should know? For example, a wheelchair, a car seat, or extra luggage.";

function calendarNotes(view) {
  const post = view.state.requests.find(
    (request) =>
      request.method === "POST" &&
      request.url.includes("script.google.com") &&
      request.body,
  );
  return post ? JSON.parse(post.body).specialNotes : "";
}

describe.each(scripts)("live edges %s", (script) => {
  it("pads a January date and keeps an empty note optional", async () => {
    const view = await renderBooking(script);
    await fillValid(view, {
      trip: "airport",
      date: "2027-01-05",
      time: "09:00:00",
      notes: "",
    });
    await submitForm(view);
    const entries = Object.fromEntries(formPosts(view.state)[0].formEntries);
    check(entries["entry.1258152069"], "01/05/2027 09:00:00", {
      label: "January 5 is sent with a leading zero",
      source: "js/booking.js",
      loaded: script,
    });
    check(entries["entry.1643147243"], "", {
      label: "a blank note is still accepted",
      source: "js/booking.js",
      loaded: script,
    });
    check(view.document.querySelector("#notes-hint").textContent, HINT, {
      label: "the example hint stays on the page",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("groups a phone number while it is still being typed", async () => {
    const view = await renderBooking(script);
    const phone = view.document.querySelector("#booking-phone");
    phone.value = "980422";
    phone.dispatchEvent(new view.window.Event("input", { bubbles: true }));
    check(phone.value, "(980) 422", {
      label: "four to six digits include the closing parenthesis",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("puts a wheelchair, and a car seat alone, on the calendar description", async () => {
    const onlyChair = await renderBooking(script);
    await fillValid(onlyChair, { trip: "airport", notes: "" });
    onlyChair.document.querySelector("#booking-wheelchair").checked = true;
    await submitForm(onlyChair);
    check(calendarNotes(onlyChair), "Special requirements: Wheelchair", {
      label: "a wheelchair with no typed note is the calendar description",
      source: "js/booking.js",
      loaded: script,
    });
    const chairSheet = Object.fromEntries(
      formPosts(onlyChair.state)[0].formEntries,
    );
    check(chairSheet["entry.853044875"], "Wheelchair", {
      label: "the wheelchair label is the sheet column",
      source: "js/booking.js",
      loaded: script,
    });

    const onlySeat = await renderBooking(script);
    await fillValid(onlySeat, {
      trip: "airport",
      notes: "Driver asked for Car Seat",
    });
    onlySeat.document.querySelector("#booking-carseat").checked = true;
    await submitForm(onlySeat);
    check(calendarNotes(onlySeat), "Driver asked for Car Seat", {
      label: "a note that already names the car seat is not repeated",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("asks the rider to call when the driving route cannot be measured", async () => {
    const view = await renderBooking(script, { routeMode: "error" });
    const quote = await showQuote(view, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    check(quote, "We'll confirm your price when we call.", {
      label: "a missing route does not invent a fare",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("asks the rider to call when the backup map is outside the service box", async () => {
    const view = await renderBooking(script, {
      censusMode: "miss",
      lat: 10,
      lon: 10,
    });
    const quote = await showQuote(view, {
      pickup: "100 Main Street Denver",
      destination: "CLT",
    });
    check(quote.includes("Cash"), false, {
      label: "a point outside the area is not priced",
      actual: quote,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("prices the same drive a second time from the saved route", async () => {
    const view = await renderBooking(script, { miles: 12 });
    const first = await showQuote(view, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    const second = await showQuote(view, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    check(second, first, {
      label: "the second quote matches the first",
      source: "js/booking.js",
      loaded: script,
    });
    check(second.includes("Cash $"), true, {
      label: "the saved route still shows a cash fare",
      actual: second,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("hides the fare after the trip type changes to a group", async () => {
    const view = await renderBooking(script, { miles: 12 });
    await showQuote(view, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    view.document.querySelector("#trip-type").value = "group";
    view.window.jQuery("#trip-type").trigger("change");
    await new Promise((resolve) => setTimeout(resolve, 80));
    check(view.document.querySelector("#booking-quote").style.display, "none", {
      label: "a group trip does not keep the airport fare",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("scrolls a quote into view and skips a scroll when the page cannot move", async () => {
    const view = await renderBooking(script);
    const quote = view.document.querySelector("#booking-quote");
    const scrolls = [];
    view.window.scrollTo = (arg) => {
      scrolls.push(arg);
    };
    view.window.MidnightBooking.placeInView(quote, "center");
    check(scrolls.length > 0, true, {
      label: "centering a quote asks the page to scroll",
      source: "js/booking.js",
      loaded: script,
    });
    const previous = view.window.HTMLElement.prototype.getBoundingClientRect;
    view.window.HTMLElement.prototype.getBoundingClientRect = () => ({
      top: -4000,
      bottom: -3900,
      height: 100,
      left: 0,
      right: 100,
      width: 100,
    });
    view.window.pageYOffset = 0;
    try {
      view.window.MidnightBooking.placeInView(quote, "nearest");
    } finally {
      view.window.HTMLElement.prototype.getBoundingClientRect = previous;
    }
    check(scrolls.at(-1).top, 0, {
      label: "a target above the page stops at the top",
      actual: scrolls.at(-1),
      source: "js/booking.js",
      loaded: script,
    });
    view.window.HTMLElement.prototype.getBoundingClientRect = () => ({
      top: 400,
      bottom: 900,
      height: 500,
      left: 0,
      right: 100,
      width: 100,
    });
    view.window.pageYOffset = 0;
    view.window.MidnightBooking.placeInView(quote, "nearest");
    check(scrolls.at(-1).top > 0, true, {
      label: "a target below the top bar is scrolled to its place",
      actual: scrolls.at(-1),
      source: "js/booking.js",
      loaded: script,
    });
    view.window.HTMLElement.prototype.getBoundingClientRect = previous;
    const nav = view.document.querySelector(".navbar-fixed-top");
    Object.defineProperty(nav, "offsetHeight", {
      configurable: true,
      value: 48,
    });
    view.window.MidnightBooking.placeInView(quote, "nearest");
    check(scrolls.at(-1).top >= 0, true, {
      label: "a tall top bar is included in the scroll position",
      actual: scrolls.at(-1),
      source: "js/booking.js",
      loaded: script,
    });
    view.document.querySelector(".navbar-fixed-top").remove();
    check(view.document.querySelector(".navbar-fixed-top"), null, {
      label: "the top bar is gone before the next scroll",
      source: "js/booking.js",
      loaded: script,
    });
    view.window.innerHeight = 0;
    view.window.MidnightBooking.placeInView(quote, "nearest");
    check(scrolls.length > 1, true, {
      label: "a page with no top bar still scrolls the quote",
      source: "js/booking.js",
      loaded: script,
    });
    const saved = view.window.scrollTo;
    view.window.scrollTo = undefined;
    view.window.MidnightBooking.placeInView(quote, "nearest");
    view.window.scrollTo = saved;
    check(view.document.querySelector("#bookingForm") !== null, true, {
      label: "a page that cannot scroll still shows the form",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("clears the destination when the airport menu is cleared", async () => {
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
    const extra = view.document.createElement("option");
    extra.value = "ZZZ";
    extra.textContent = "Not a published airport";
    menu.appendChild(extra);
    const savedArea = globalThis.MidnightServiceArea;
    globalThis.MidnightServiceArea = null;
    menu.value = "CLT";
    view.window.jQuery(menu).trigger("change");
    globalThis.MidnightServiceArea = savedArea;
    check(view.document.querySelector("#bookingForm") !== null, true, {
      label: "the form stays up when the airport list cannot be read",
      source: "js/booking.js",
      loaded: script,
    });
    menu.value = "ZZZ";
    view.window.jQuery(menu).trigger("change");
    check(view.document.querySelector("#booking-destination").value, "", {
      label: "an unknown airport does not invent a destination",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("prices from the airport menu and still asks for a call when both maps miss", async () => {
    const priced = await renderBooking(script, { miles: 12 });
    const menu = priced.document.querySelector("#airport-choice");
    menu.value = "CLT";
    priced.window.jQuery(menu).trigger("change");
    const quote = await showQuote(priced, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    menu.value = "JQF";
    priced.window.jQuery(menu).trigger("change");
    const concord = await showQuote(priced, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "JQF",
    });
    check(concord.includes("Concord"), true, {
      label: "Concord is priced from its own menu entry",
      actual: concord,
      source: "js/booking.js",
      loaded: script,
    });
    const extra = priced.document.createElement("option");
    extra.value = "ZZZ";
    extra.textContent = "Not a published airport";
    menu.appendChild(extra);
    menu.value = "ZZZ";
    const unknown = await showQuote(priced, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "200 Oak Street, Denver NC",
    });
    check(unknown.includes("Cash $"), false, {
      label: "an unknown menu entry does not invent a fare",
      actual: unknown,
      source: "js/booking.js",
      loaded: script,
    });
    check(quote.includes("Cash $"), true, {
      label: "choosing CLT in the menu still shows a cash fare",
      actual: quote,
      source: "js/booking.js",
      loaded: script,
    });

    const missed = await renderBooking(script, {
      censusMode: "error",
      osmMode: "miss",
    });
    const fallback = await showQuote(missed, {
      pickup: "100 Main Street, Denver NC",
      destination: "CLT",
    });
    check(fallback, "We'll confirm your price when we call.", {
      label: "no map result does not invent a fare",
      source: "js/booking.js",
      loaded: script,
    });
    const lookup = missed.state.requests.find((request) =>
      request.url.includes("nominatim.openstreetmap.org"),
    );
    check(decodeURIComponent(lookup.url).endsWith("Denver NC"), true, {
      label: "an address that already says NC is not given a second state",
      actual: decodeURIComponent(lookup.url),
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("prices a census point that has coordinates but no city", async () => {
    const view = await renderBooking(script, { censusMode: "bare", miles: 12 });
    const quote = await showQuote(view, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    check(quote.includes("Cash $"), true, {
      label: "coordinates without a city still produce a fare",
      actual: quote,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("ignores a route leg that is not a distance and uses the shorter one", async () => {
    const view = await renderBooking(script, { routesMiles: [0, 12, 8] });
    const quote = await showQuote(view, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    check(quote.includes("Cash $"), true, {
      label: "a usable route leg still shows a fare",
      actual: quote,
      source: "js/booking.js",
      loaded: script,
    });
    const longer = await renderBooking(script, { routesMiles: [12, 20] });
    const second = await showQuote(longer, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    check(second.includes("Cash $"), true, {
      label: "a longer alternate route does not replace the shorter fare",
      actual: second,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("asks for a call when every route leg has no distance", async () => {
    const view = await renderBooking(script, { routesMiles: [0] });
    const quote = await showQuote(view, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    check(quote, "We'll confirm your price when we call.", {
      label: "a route with no distance is not priced",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("keeps the latest fare when the rider changes the pickup mid-quote", async () => {
    const view = await renderBooking(script, {
      miles: 10,
      places: {
        "123 Main Street, Denver NC 28037": {
          lat: 35.53,
          lon: -81.03,
          city: "Denver",
          state: "NC",
          zip: "28037",
          miles: 10,
        },
        "400 Lake Shore Drive, Denver NC 28037": {
          lat: 35.54,
          lon: -81.04,
          city: "Denver",
          state: "NC",
          zip: "28037",
          miles: 18,
        },
      },
    });
    chooseAndQuote(view);
    let quote = "";
    await waitFor(() => {
      quote = view.document
        .querySelector("#quote-details")
        .textContent.replace(/\s+/g, " ")
        .trim();
      if (!quote || /figuring/i.test(quote)) throw new Error(quote);
    });
    check(quote.includes("Cash $"), true, {
      label: "the fare that finishes last is the one on the page",
      actual: quote,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("shows a send error when the form post fails without an error message", async () => {
    const view = await renderBooking(script);
    const realFetch = view.window.fetch;
    view.window.fetch = async (url, init) => {
      if (String(url).includes("docs.google.com")) throw "network down";
      return realFetch(url, init);
    };
    await fillValid(view, { trip: "airport" });
    await submitForm(view);
    const message = view.document.querySelector("#booking-success").textContent;
    check(message.includes("(980) 422-9125"), true, {
      label: "a failed send still gives the phone number",
      actual: message,
      source: "js/booking.js",
      loaded: script,
    });
    check(message.includes("undefined"), false, {
      label: "a failure without a message does not print undefined",
      actual: message,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("asks for the town when the census point has no city", async () => {
    const view = await renderBooking(script, { censusMode: "bare" });
    await fillValid(view, {
      trip: "airport",
      pickup: "100 Main Street",
      destination: "CLT",
    });
    await submitForm(view);
    check(
      resultText(view.document).includes("Please include the town and state"),
      true,
      {
        label: "coordinates without a city still ask for the town",
        actual: resultText(view.document),
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("keeps the form usable when the busy-time feed is not a list", async () => {
    const view = await renderBooking(script, { bookings: { nope: true } });
    await fillValid(view, { trip: "airport" });
    check(view.document.querySelector("#booking-date").value !== "", true, {
      label: "a bad busy-time feed does not wipe the pickup date",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("asks for a call when a Denver address geocodes outside the service box", async () => {
    const view = await renderBooking(script, {
      censusMode: "miss",
      lat: 10,
      lon: 10,
    });
    const quote = await showQuote(view, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    check(quote.includes("Cash"), false, {
      label: "a point outside the driving box is not priced",
      actual: quote,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("clears both pending rides ten seconds after a round trip is sent", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport", roundTrip: true });
    await submitForm(view);
    check(resultText(view.document).includes("both"), true, {
      label: "a round trip tells the rider both rides were sent",
      actual: resultText(view.document),
      source: "js/booking.js",
      loaded: script,
    });
    view.document.querySelector("#booking-success").textContent = "";
    await submitForm(view);
    check(resultText(view.document).length > 0, true, {
      label: "a second request still gets an answer while the first is pending",
      actual: resultText(view.document),
      source: "js/booking.js",
      loaded: script,
    });
    await new Promise((resolve) => setTimeout(resolve, 11000));
    check(view.document.querySelector("#bookingForm") !== null, true, {
      label: "the form is still on the page after the hold ends",
      source: "js/booking.js",
      loaded: script,
    });
  }, 20000);

  it("leaves a field alone when its value is cleared", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport" });
    view.window.jQuery("#booking-name").val("").trigger("input");
    check(view.document.querySelector("#booking-name").value, "", {
      label: "clearing the name leaves the box blank",
      source: "js/booking.js",
      loaded: script,
    });
    view.window.jQuery("#booking-name").val("Jane Rider").trigger("input");
    const phone = view.document.querySelector("#booking-phone");
    phone.value = "";
    phone.dispatchEvent(new view.window.Event("input", { bubbles: true }));
    check(phone.value, "", {
      label: "clearing the phone number leaves it blank",
      source: "js/booking.js",
      loaded: script,
    });
    const pickup = view.document.querySelector("#booking-pickup");
    pickup.value = "";
    pickup.dispatchEvent(new view.window.Event("input", { bubbles: true }));
    const email = view.document.querySelector("#booking-email");
    email.value = "not-an-email";
    email.dispatchEvent(new view.window.Event("input", { bubbles: true }));
    email.value = "";
    email.dispatchEvent(new view.window.Event("input", { bubbles: true }));
    view.document.querySelector("#booking-name").focus();
    check(view.document.querySelector("#booking-name").value !== "", true, {
      label: "focusing the name does not clear a filled-in name",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("drops the fare when the trip becomes a group before the price returns", async () => {
    const view = await renderBooking(script, { miles: 12 });
    view.document.querySelector("#trip-type").value = "airport";
    view.window.jQuery("#trip-type").trigger("change");
    const pickup = view.document.querySelector("#booking-pickup");
    const destination = view.document.querySelector("#booking-destination");
    pickup.value = "123 Main Street, Denver NC 28037";
    destination.value = "CLT";
    view.window.jQuery(destination).trigger("blur");
    view.document.querySelector("#trip-type").value = "group";
    await new Promise((resolve) => setTimeout(resolve, 30));
    check(view.document.querySelector("#booking-quote").style.display, "none", {
      label: "a group trip does not keep a fare that was still being figured",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("refuses a street whose map point is in Charlotte", async () => {
    const view = await renderBooking(script, {
      censusCity: "Charlotte",
      censusState: "NC",
      censusZip: "28202",
    });
    const quote = await showQuote(view, {
      pickup: "100 Main Street",
      destination: "CLT",
    });
    check(quote, "Sorry, we don't service that area.", {
      label: "a Charlotte map point is outside the service area",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("does not price a private airfield that is not on the menu", async () => {
    const view = await renderBooking(script, { miles: 12 });
    const quote = await showQuote(view, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "grass airstrip",
    });
    check(quote, "We'll confirm your price when we call.", {
      label: "an unlisted airfield is not given an online fare",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("asks for a call when the service-area checker is missing", async () => {
    const view = await renderBooking(script, { miles: 12 });
    delete globalThis.MidnightServiceArea;
    const quote = await showQuote(view, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    check(quote, "We'll confirm your price when we call.", {
      label: "a missing checker does not invent a fare",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("hides a failed fare when the rider switches to a group", async () => {
    const view = await renderBooking(script, { routeMode: "error" });
    view.document.querySelector("#trip-type").value = "airport";
    view.window.jQuery("#trip-type").trigger("change");
    view.document.querySelector("#airport-choice").value = "CLT";
    view.window.jQuery("#airport-choice").trigger("change");
    view.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    view.window.jQuery("#booking-destination").trigger("blur");
    view.document.querySelector("#trip-type").value = "group";
    await new Promise((resolve) => setTimeout(resolve, 40));
    check(view.document.querySelector("#booking-quote").style.display, "none", {
      label: "a group trip does not keep a fare that failed",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("checks a return date that is cleared and one chosen before the pickup", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport", roundTrip: true });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const returnDate = view.document.querySelector("#booking-return-date");
    check(Boolean(returnDate._flatpickr), true, {
      label: "the return date picker is ready",
      source: "js/booking.js",
      loaded: script,
    });
    returnDate._flatpickr.clear();
    view.document.querySelector("#booking-date").value = "";
    returnDate._flatpickr.setDate("2026-12-20", true);
    check(
      view.document.querySelector("#booking-return-date").value !== "",
      true,
      {
        label: "the return date can be chosen before the pickup date",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("keeps the receipt when the calendar post fails without an error", async () => {
    const view = await renderBooking(script);
    const realFetch = view.window.fetch;
    view.window.fetch = async (url, init) => {
      if (
        String(url).includes("script.google.com") &&
        init &&
        String(init.method).toUpperCase() === "POST"
      ) {
        throw undefined;
      }
      return realFetch(url, init);
    };
    await fillValid(view, { trip: "airport" });
    await submitForm(view);
    check(resultText(view.document).includes("Request received"), true, {
      label: "the form receipt stays when the calendar sends nothing back",
      actual: resultText(view.document),
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("opens a fresh form when the date picker is already gone", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport" });
    await submitForm(view);
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const date = view.document.querySelector("#booking-date");
    const time = view.document.querySelector("#booking-time");
    delete date._flatpickr;
    delete time._flatpickr;
    view.document.querySelector("#new-booking-btn").click();
    check(
      view.document.querySelector("#bookingForm").style.display !== "none",
      true,
      {
        label: "another booking opens even without the date picker",
        source: "js/booking.js",
        loaded: script,
      },
    );
  }, 10000);

  it("names both a wheelchair and checked bags in the seat count", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport", bags: true, bagCount: "1" });
    const chair = view.document.querySelector("#booking-wheelchair");
    chair.checked = true;
    view.window.jQuery(chair).trigger("change");
    const message = view.document.querySelector(
      "#passenger-capacity-message",
    ).textContent;
    check(message.includes("mobility aid"), true, {
      label: "a wheelchair is named in the seat count",
      actual: message,
      source: "js/booking.js",
      loaded: script,
    });
    check(message.includes("checked bags"), true, {
      label: "checked bags are named along with the wheelchair",
      actual: message,
      source: "js/booking.js",
      loaded: script,
    });
  });
});
