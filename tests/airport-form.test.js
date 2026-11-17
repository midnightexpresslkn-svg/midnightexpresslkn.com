// Airport form fields from Donald's Nov 16, 2026 spec.
import { afterEach, describe, it } from "vitest";
import { waitFor } from "@testing-library/dom";
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

  it("asks for the arrival flight only on a round trip", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { roundTrip: null, flight: null });
    const arrival = view.document.querySelector("#booking-flight");
    const group = view.document.querySelector("#flight-group");
    check([group.style.display !== "none", arrival.required], [false, false], {
      label: "before round trip is answered, only the departure flight shows",
      source: "js/booking.js",
      loaded: script,
    });
    tick(view, "#booking-round-trip");
    check([group.style.display !== "none", arrival.required], [true, true], {
      label: "a round trip shows and requires the arrival flight",
      source: "js/booking.js",
      loaded: script,
    });
    type(view, "#booking-flight", "AA2684");
    tick(view, "#booking-round-trip-no");
    check(
      [group.style.display !== "none", arrival.required, arrival.value],
      [false, false, ""],
      {
        label:
          "a one-way ride to the airport hides and clears the arrival flight",
        source: "js/booking.js",
        loaded: script,
      },
    );
    const back = view.document.querySelector("#booking-passengers-back");
    const backGroup = view.document.querySelector("#passengers-back-group");
    check([backGroup.style.display, back.required], ["none", false], {
      label:
        "a one-way ride hides the passengers-back count and does not require it",
      source: "js/booking.js",
      loaded: script,
    });
    tick(view, "#booking-round-trip");
    type(view, "#booking-passengers-back", "3");
    check([backGroup.style.display !== "none", back.required], [true, true], {
      label: "a round trip shows and requires the passengers-back count",
      source: "js/booking.js",
      loaded: script,
    });
    tick(view, "#booking-round-trip-no");
    check(back.value, "", {
      label: "switching to No clears the passengers-back count",
      source: "js/booking.js",
      loaded: script,
    });
    check(
      view.document.querySelector("#booking-departure-flight").required,
      true,
      {
        label: "the departure flight stays required one-way",
        source: "js/booking.js",
        loaded: script,
      },
    );
    await submitForm(view);
    check(resultText(view.document).includes("Request received"), true, {
      label: "a one-way ride sends with only the departure flight",
      actual: resultText(view.document),
      source: "js/booking.js",
      loaded: script,
    });
    check(sent(view)[NOTES].includes("Passengers back"), false, {
      label: "a one-way note leaves out passengers back",
      actual: sent(view)[NOTES],
      source: "js/booking.js",
      loaded: script,
    });
    check(sent(view)[NOTES].includes("Arrival flight"), false, {
      label: "a one-way note has no arrival flight line",
      actual: sent(view)[NOTES],
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("names each missing airport answer and sends nothing", async () => {
    const view = await renderBooking(script);
    await fillValid(view, {
      carryOn: null,
      luggageHelp: null,
      departureFlight: "",
      flight: "",
      passengersBack: "",
      roundTrip: true,
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
    await fillValid(bad, {
      departureFlight: "!!",
      passengersBack: "6",
      roundTrip: true,
    });
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

// Donald (Nov 16, 2026): one Airport trip type with a required direction question.
describe.each(scripts)("airport direction %s", (script) => {
  it("asks which way, with nothing picked, and requires an answer", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { direction: null });
    const radios = [
      ...view.document.querySelectorAll('input[name="airport-direction"]'),
    ];
    check(
      radios.map((r) => [r.checked, r.required]),
      [
        [false, true],
        [false, true],
      ],
      {
        label: "neither direction is pre-picked and one is required",
        source: "js/booking.js",
        loaded: script,
      },
    );
    await submitForm(view);
    check(
      errorText(view, "airport-direction-error"),
      "Please choose To the airport or Pick up from the airport.",
      {
        label: "a missing direction is named",
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(formPosts(view.state).length, 0, {
      label: "no direction, no request",
      source: "js/booking.js",
      loaded: script,
    });
    tick(view, "#airport-direction-to");
    check(errorText(view, "airport-direction-error"), "", {
      label: "picking a direction clears its error",
      source: "js/booking.js",
      loaded: script,
    });
    chooseTrip(view.document, "local");
    check(
      [
        view.document.querySelector("#airport-direction-group").hidden,
        view.document.querySelector("#airport-direction-to").checked,
      ],
      [true, false],
      {
        label: "another trip type hides and clears the direction",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("picks up at the airport one way with only the arrival flight", async () => {
    const view = await renderBooking(script);
    await fillValid(view, {
      direction: "from",
      departureFlight: null,
      flight: "AA2684",
    });
    const shown = (id) =>
      view.document.querySelector(id).style.display !== "none";
    check(
      [
        shown("#flight-group"),
        shown("#departure-flight-group"),
        view.document.querySelector("#booking-flight").required,
        view.document.querySelector("#booking-departure-flight").required,
        view.document.querySelector("#address-label").textContent.trim(),
        view.document.querySelector("#passengers-label").textContent.trim(),
        view.document.querySelector("#airport-choice-row label").textContent,
      ],
      [
        true,
        false,
        true,
        false,
        "Drop-off address *",
        "Passengers from the airport *",
        "Pickup airport",
      ],
      {
        label:
          "from the airport asks for the arrival flight and a drop-off address",
        source: "js/booking.js",
        loaded: script,
      },
    );
    await submitForm(view);
    const row = sent(view);
    check(
      [row["entry.1915297843"], row["entry.814545959"], row[FLIGHT]],
      ["CLT", "123 Main Street, Denver NC 28037", "AA2684"],
      {
        label: "the ride starts at the airport and carries the arrival flight",
        actual: row,
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(
      row[NOTES].includes(
        "Direction: Pick up from the airport\nArrival flight: AA2684\nPassengers from the airport: 2",
      ),
      true,
      {
        label: "Notes name the direction and the arrival flight",
        actual: row[NOTES],
        source: "js/booking.js",
        loaded: script,
      },
    );
    const calendar = JSON.parse(
      view.state.requests.find(
        (r) => r.method === "POST" && r.url.includes("script.google.com"),
      ).body,
    );
    check(
      [
        calendar.pickupAddress,
        calendar.destinationAddress,
        calendar.flightNumber,
      ],
      ["CLT", "123 Main Street, Denver NC 28037", "AA2684"],
      {
        label: "the calendar gets the same direction and flight",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("prices from the airport at the same flat rate and says from", async () => {
    const view = await renderBooking(script, { miles: 10 });
    await fillValid(view, { direction: "to", roundTrip: null });
    const quote = () =>
      view.document.querySelector("#quote-details").textContent;
    await waitFor(() => {
      if (!quote().includes("One way to")) throw new Error(quote());
    });
    const toPrice = quote().replace(/^.*?Cash/, "Cash");
    tick(view, "#airport-direction-from");
    await waitFor(() => {
      if (!quote().includes("One way from")) throw new Error(quote());
    });
    check(quote().replace(/^.*?Cash/, "Cash"), toPrice, {
      label: "the same flat price each way",
      actual: quote(),
      source: "js/booking.js",
      loaded: script,
    });
    tick(view, "#booking-round-trip");
    await waitFor(() => {
      if (!quote().includes("Round trip, from")) throw new Error(quote());
    });
  });

  it("names a missing arrival flight and drop-off address when picking up at the airport", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { direction: "from", flight: "", pickup: "" });
    await submitForm(view);
    check(
      [errorText(view, "flight-error"), errorText(view, "pickup-error")],
      [
        "Please enter your arrival flight number",
        "Drop-off address is required",
      ],
      {
        label: "arrival flight and drop-off address are required",
        actual: resultText(view.document),
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(formPosts(view.state).length, 0, {
      label: "missing answers send nothing",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("sends a from-the-airport round trip back to the airport with the departure flight", async () => {
    const view = await renderBooking(script);
    await fillValid(view, {
      direction: "from",
      flight: "AA2684",
      departureFlight: "UA55",
      passengers: "2",
      passengersBack: "3",
      roundTrip: true,
    });
    check(
      view.document.querySelector("#passengers-back-label").textContent.trim(),
      "Passengers back to the airport *",
      {
        label: "the ride back count is named for the airport",
        source: "js/booking.js",
        loaded: script,
      },
    );
    await submitForm(view);
    const first = sent(view, 0);
    const back = sent(view, 1);
    check(
      [
        first["entry.1915297843"],
        first[FLIGHT],
        first[PASSENGERS],
        back["entry.1915297843"],
        back["entry.814545959"],
        back[FLIGHT],
        back[PASSENGERS],
      ],
      [
        "CLT",
        "AA2684",
        "2",
        "123 Main Street, Denver NC 28037",
        "CLT",
        "UA55",
        "3",
      ],
      {
        label:
          "first leg from the airport on the arrival flight, ride back to the airport on the departure flight",
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(back[NOTES].includes("Passengers back to the airport: 3"), true, {
      label: "Notes count the riders going back to the airport",
      actual: back[NOTES],
      source: "js/booking.js",
      loaded: script,
    });
  });
});
