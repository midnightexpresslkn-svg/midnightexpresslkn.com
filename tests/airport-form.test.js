// Airport form fields from Donald's Nov 16, 2026 spec.
import { afterEach, describe, it } from "vitest";
import { check } from "./helpers/failure.js";
import {
  chooseTrip,
  drainTimers,
  fillValid,
  formPosts,
  renderBooking,
  resultText,
  startAnotherBooking,
  submitForm,
} from "./helpers/render-booking.js";

const scripts = ["js/booking.js", "js/booking.min.js"];
const NOTES = "entry.1643147243";
const SPECIAL = "entry.853044875";
const PASSENGERS = "entry.419038207";
const FLIGHT = "entry.149520789";

afterEach(() => {
  drainTimers();
});

function type(view, selector, value) {
  const el = view.document.querySelector(selector);
  view.window.jQuery(el).val(value).trigger("input");
  return el;
}

function tick(view, selector, checked = true) {
  const el = view.document.querySelector(selector);
  el.checked = checked;
  view.window.jQuery(el).trigger("change");
  return el;
}

function sent(view, index = 0) {
  return Object.fromEntries(formPosts(view.state)[index].formEntries);
}

function errorText(view, id) {
  return view.document.querySelector(`#${id}`).textContent;
}

describe.each(scripts)("airport form %s", (script) => {
  it("shows every new airport question only on an airport ride", async () => {
    const view = await renderBooking(script);
    chooseTrip(view.document, "airport");
    const details = view.document.querySelector("#airport-details");
    check(details.hidden, false, {
      label: "airport questions are shown for an airport ride",
      source: "js/booking.js",
      loaded: script,
    });
    for (const id of [
      "booking-carryon-yes",
      "booking-luggage-help-yes",
      "booking-passengers-back",
      "booking-departure-flight",
      "booking-flight",
    ]) {
      check(details.contains(view.document.getElementById(id)), true, {
        label: `${id} sits with the airport questions, one-way too`,
        source: "js/booking.js",
        loaded: script,
      });
    }
    check(
      view.document.querySelector("#passengers-label").textContent.trim(),
      "Passengers to the airport *",
      {
        label: "the first passenger count is to the airport",
        source: "js/booking.js",
        loaded: script,
      },
    );
    type(view, "#booking-departure-flight", "DL100");
    tick(view, "#booking-carryon-yes");
    chooseTrip(view.document, "local");
    check(details.hidden, true, {
      label: "a bar ride hides the airport questions",
      source: "js/booking.js",
      loaded: script,
    });
    check(
      [
        view.document.querySelector("#booking-departure-flight").value,
        view.document.querySelector("#booking-carryon-yes").checked,
      ],
      ["", false],
      {
        label: "leaving the airport ride clears its answers",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("names each missing airport answer and sends nothing", async () => {
    const view = await renderBooking(script);
    await fillValid(view, {
      carryOn: null,
      luggageHelp: null,
      departureFlight: "",
      flight: "",
      passengersBack: "",
    });
    await submitForm(view);
    check(formPosts(view.state).length, 0, {
      label: "an airport ride with missing answers is not sent",
      source: "js/booking.js",
      loaded: script,
    });
    const expected = {
      "carryon-error": "Please choose Yes or No for carry-on bags",
      "luggage-help-error":
        "Please choose Yes or No for help with your luggage",
      "departure-flight-error": "Please enter your departure flight number",
      "flight-error": "Please enter your arrival flight number",
      "passengers-back-error":
        "Please enter how many passengers come back from the airport.",
    };
    for (const [id, message] of Object.entries(expected)) {
      check(errorText(view, id), message, {
        label: `${id} explains what is missing`,
        actual: resultText(view.document),
        source: "js/booking.js",
        loaded: script,
      });
    }
    type(view, "#booking-departure-flight", "DL100");
    check(errorText(view, "departure-flight-error"), "", {
      label: "typing an answer clears its error",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("asks How many? only after Yes and needs a whole number from 1 to 20", async () => {
    for (const [field, count, id] of [
      ["carryOn", undefined, "carryon-count-error"],
      ["carryOn", "21", "carryon-count-error"],
      ["carryOn", "0", "carryon-count-error"],
      ["bags", "0", "bag-count-error"],
    ]) {
      const view = await renderBooking(script);
      const overrides =
        field === "bags"
          ? { bags: true, bagCount: count }
          : { carryOn: "Yes", carryOnCount: count };
      await fillValid(view, overrides);
      await submitForm(view);
      check(formPosts(view.state).length, 0, {
        label: `${field} Yes with How many? ${count} is not sent`,
        source: "js/booking.js",
        loaded: script,
      });
      check(errorText(view, id).startsWith("Please enter how many"), true, {
        label: `${field} Yes with How many? ${count} explains the count`,
        actual: errorText(view, id),
        source: "js/booking.js",
        loaded: script,
      });
    }
    const view = await renderBooking(script);
    await fillValid(view, {
      carryOn: "Yes",
      carryOnCount: "2",
      luggageHelp: "Yes",
      bags: false,
      bagCount: "",
    });
    await submitForm(view);
    check(
      sent(view)[NOTES].includes(
        "Checked bags: No\nCarry-on bags: Yes (2)\nHelp with luggage: Yes",
      ),
      true,
      {
        label: "No needs no count, and Yes sends its count",
        actual: sent(view)[NOTES],
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("checks both flight numbers and the passengers coming back", async () => {
    const bad = await renderBooking(script);
    await fillValid(bad, { departureFlight: "!!", passengersBack: "6" });
    await submitForm(bad);
    check(
      errorText(bad, "departure-flight-error"),
      "Please enter a valid departure flight number (e.g., AA1234)",
      {
        label: "a bad departure flight is named",
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(
      errorText(bad, "passengers-back-error"),
      "For more than 5 passengers, please call (980) 422-9125.",
      {
        label: "too many riders coming back are asked to call",
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(formPosts(bad.state).length, 0, {
      label: "bad flight or return count sends nothing",
      source: "js/booking.js",
      loaded: script,
    });

    const view = await renderBooking(script);
    await fillValid(view, {
      passengers: "2",
      passengersBack: "4",
      departureFlight: "UA55",
      flight: "AA2684",
      roundTrip: true,
    });
    await submitForm(view);
    check([sent(view, 0)[PASSENGERS], sent(view, 0)[FLIGHT]], ["2", "UA55"], {
      label: "the ride to the airport has its riders and departure flight",
      source: "js/booking.js",
      loaded: script,
    });
    check([sent(view, 1)[PASSENGERS], sent(view, 1)[FLIGHT]], ["4", "AA2684"], {
      label: "the ride back has its riders and arrival flight",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("keeps every special item optional and names the ones picked", async () => {
    const view = await renderBooking(script);
    await fillValid(view);
    const ids = [
      "#booking-wheelchair",
      "#booking-carseat",
      "#booking-golf",
      "#booking-skis",
      "#booking-other-item",
      "#booking-other-desc",
    ];
    check(
      ids.map((id) => view.document.querySelector(id).required),
      ids.map(() => false),
      {
        label: "no special item or description is required",
        source: "js/booking.js",
        loaded: script,
      },
    );
    const box = view.document.querySelector("#other-item-group");
    tick(view, "#booking-other-item");
    check(box.hidden, false, {
      label: "Other items opens the describe box",
      source: "js/booking.js",
      loaded: script,
    });
    type(view, "#booking-other-desc", "a guitar");
    tick(view, "#booking-other-item", false);
    check(
      [box.hidden, view.document.querySelector("#booking-other-desc").value],
      [true, ""],
      {
        label: "unticking Other closes and clears the describe box",
        source: "js/booking.js",
        loaded: script,
      },
    );
    tick(view, "#booking-golf");
    tick(view, "#booking-skis");
    tick(view, "#booking-other-item");
    type(view, "#booking-other-desc", "a stroller");
    await submitForm(view);
    check(sent(view)[SPECIAL], "Golf Clubs, Skis, Other: a stroller", {
      label: "picked items go in Special Requirements",
      source: "js/booking.js",
      loaded: script,
    });

    await startAnotherBooking(view);
    check(box.hidden, true, {
      label: "Make Another Booking closes the describe box",
      source: "js/booking.js",
      loaded: script,
    });

    const plain = await renderBooking(script);
    await fillValid(plain);
    tick(plain, "#booking-other-item");
    await submitForm(plain);
    check(sent(plain)[SPECIAL], "Other items", {
      label: "Other with no description is still named",
      source: "js/booking.js",
      loaded: script,
    });
  });
});
