import { afterEach, describe, it, vi } from "vitest";
import { SOURCE } from "./helpers/source-line.js";
import { check, role } from "./helpers/failure.js";
import {
  chooseRadio,
  drainTimers,
  fillValid,
  flushTimersOf,
  renderBooking,
  resultText,
  showQuote,
  submitForm,
} from "./helpers/render-booking.js";

const scripts = ["js/booking.js", "js/booking.min.js"];
const pickup = "123 Main Street, Denver NC 28037";

afterEach(() => {
  drainTimers();
  vi.useRealTimers();
});

function textOf(document, selector) {
  return (
    document
      .querySelector(selector)
      ?.textContent?.replace(/\s+/g, " ")
      .trim() || ""
  );
}

function shown(view, selector) {
  return view.document.querySelector(selector).style.display !== "none";
}

async function paint() {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

describe.each(scripts)("form validation %s", (script) => {
  it("requires a name, phone, email format, and both addresses", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { name: "   ", phone: "", email: "not-an-email" });
    view.$("#booking-pickup").val("").trigger("input");
    view.$("#booking-destination").val("").trigger("input");
    await submitForm(view);
    const text = resultText(view.document);
    check(text.includes("Name is required"), true, {
      label: "blank name",
      actual: text,
      source: SOURCE.phone,
      loaded: script,
    });
    check(text.includes("Phone number is required"), true, {
      label: "blank phone",
      actual: text,
      source: SOURCE.phone,
      loaded: script,
    });
    check(text.includes("Please enter a valid email address"), true, {
      label: "bad email",
      actual: text,
      source: SOURCE.email,
      loaded: script,
    });
    check(text.includes("Pickup address is required"), true, {
      label: "blank pickup",
      actual: text,
      source: SOURCE.excluded,
      loaded: script,
    });
    check(text.includes("Destination address is required"), true, {
      label: "blank destination",
      actual: text,
      source: SOURCE.excluded,
      loaded: script,
    });
  });

  it("rejects a phone number that is not 10 digits", async () => {
    const view = await renderBooking(script);
    await fillValid(view);
    view.$("#booking-phone").val("980422").trigger("input");
    check(view.document.querySelector("#booking-phone").value, "(980) 422", {
      label: "phone formats as it is typed",
      source: SOURCE.phone,
      loaded: script,
    });
    await submitForm(view);
    check(
      resultText(view.document).includes(
        "Please enter a valid 10-digit phone number",
      ),
      true,
      {
        label: "short phone is rejected",
        actual: resultText(view.document),
        source: SOURCE.phone,
        loaded: script,
      },
    );
  });

  it("keeps only the first 10 phone digits", async () => {
    const view = await renderBooking(script);
    view.$("#booking-phone").val("9804229125999").trigger("input");
    check(
      view.document.querySelector("#booking-phone").value,
      "(980) 422-9125",
      {
        label: "extra phone digits are dropped",
        source: SOURCE.phone,
        loaded: script,
      },
    );
    view.$("#booking-phone").val("980").trigger("input");
    check(view.document.querySelector("#booking-phone").value, "(980", {
      label: "a short phone keeps the opening parenthesis",
      source: SOURCE.phone,
      loaded: script,
    });
  });

  it("accepts a blank email", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { email: "" });
    await submitForm(view);
    check(resultText(view.document).includes("Request received"), true, {
      label: "email is optional",
      actual: resultText(view.document),
      source: SOURCE.email,
      loaded: script,
    });
  });

  it("requires the airport and group answers", async () => {
    const view = await renderBooking(script);
    await fillValid(view);
    view.$('input[name="airport-trip"]').prop("checked", false);
    await submitForm(view);
    check(
      resultText(view.document).includes(
        "Please indicate if this is an airport trip",
      ),
      true,
      {
        label: "airport answer required",
        actual: resultText(view.document),
        source: SOURCE.airport,
        loaded: script,
      },
    );
    await fillValid(view);
    view.$('input[name="group-event"]').prop("checked", false);
    await submitForm(view);
    check(
      resultText(view.document).includes(
        "Please indicate if this is a group event",
      ),
      true,
      {
        label: "group answer required",
        actual: resultText(view.document),
        source: SOURCE.group,
        loaded: script,
      },
    );
  });

  it("requires a pickup date and time", async () => {
    const view = await renderBooking(script);
    await fillValid(view);
    view.$("#booking-date").val("");
    view.$("#booking-time").val("");
    await submitForm(view);
    const text = resultText(view.document);
    check(text.includes("Pickup date is required"), true, {
      label: "date required",
      actual: text,
      source: SOURCE.conflict,
      loaded: script,
    });
    check(text.includes("Pickup time is required"), true, {
      label: "time required",
      actual: text,
      source: SOURCE.conflict,
      loaded: script,
    });
  });

  it("rejects zero passengers and a passenger count that is not a number", async () => {
    const zero = await renderBooking(script);
    await fillValid(zero, { passengers: "0" });
    await submitForm(zero);
    check(
      resultText(zero.document).includes(
        "Please enter the number of passengers.",
      ),
      true,
      {
        label: "zero passengers",
        actual: resultText(zero.document),
        source: SOURCE.passengerRequired,
        loaded: script,
      },
    );
    const words = await renderBooking(script);
    await fillValid(words, { passengers: "abc" });
    await submitForm(words);
    check(
      resultText(words.document).includes(
        "Please enter the number of passengers.",
      ),
      true,
      {
        label: "non-numeric passengers",
        actual: resultText(words.document),
        source: SOURCE.passengerRequired,
        loaded: script,
      },
    );
  });

  it("lowers the online maximum by one for a wheelchair or a car seat", async () => {
    const view = await renderBooking(script);
    const wheelchair = role(view.document, "checkbox", {
      name: /^wheelchair$/i,
    });
    const carSeat = role(view.document, "checkbox", { name: /^car seat$/i });
    wheelchair.checked = true;
    carSeat.checked = true;
    view.$(wheelchair).trigger("change");
    view.$(carSeat).trigger("change");
    check(
      textOf(view.document, "#passenger-capacity-message"),
      "Maximum passengers: 4 (reduced for mobility aid)",
      {
        label: "wheelchair and car seat share one seat",
        source: SOURCE.passengers,
        loaded: script,
      },
    );
    await fillValid(view, { passengers: "5" });
    wheelchair.checked = true;
    carSeat.checked = true;
    view.$(wheelchair).trigger("change");
    await submitForm(view);
    check(
      resultText(view.document).includes(
        "For more than 4 passengers, please call (980) 422-9125.",
      ),
      true,
      {
        label: "five riders with a mobility aid must call",
        actual: resultText(view.document),
        source: SOURCE.passengers,
        loaded: script,
      },
    );
    await fillValid(view, { passengers: "4" });
    wheelchair.checked = true;
    view.$(wheelchair).trigger("change");
    await submitForm(view);
    check(resultText(view.document).includes("Request received"), true, {
      label: "four riders with a mobility aid can request",
      actual: resultText(view.document),
      source: SOURCE.passengers,
      loaded: script,
    });
  });

  it("lowers the online maximum for bags and a mobility aid together", async () => {
    const view = await renderBooking(script);
    chooseRadio(view.document, "airport-trip", "Yes");
    const bags = role(view.document, "checkbox", {
      name: /checking bags/i,
      hidden: true,
    });
    const wheelchair = role(view.document, "checkbox", {
      name: /^wheelchair$/i,
    });
    bags.checked = true;
    wheelchair.checked = true;
    view.$(bags).trigger("change");
    view.$(wheelchair).trigger("change");
    check(
      textOf(view.document, "#passenger-capacity-message"),
      "Maximum passengers: 3 (reduced for mobility aid, checked bags)",
      {
        label: "bags and a mobility aid each take a seat",
        source: SOURCE.passengers,
        loaded: script,
      },
    );
    await fillValid(view, { passengers: "4", bags: true });
    wheelchair.checked = true;
    view.$(wheelchair).trigger("change");
    await submitForm(view);
    check(
      resultText(view.document).includes(
        "For more than 3 passengers, please call (980) 422-9125.",
      ),
      true,
      {
        label: "four riders with bags and a wheelchair must call",
        actual: resultText(view.document),
        source: SOURCE.passengers,
        loaded: script,
      },
    );
  });

  it("requires the other-requirement note and then sends it", async () => {
    const view = await renderBooking(script);
    await fillValid(view);
    const other = role(view.document, "checkbox", { name: /^other$/i });
    other.checked = true;
    view.$(other).trigger("change");
    await paint();
    check(shown(view, "#other-requirement-section"), true, {
      label: "other requirement shows the note",
      source: SOURCE.passengers,
      loaded: script,
    });
    await submitForm(view);
    check(
      resultText(view.document).includes(
        "Please specify your other special requirements",
      ),
      true,
      {
        label: "other requirement note is required",
        actual: resultText(view.document),
        source: SOURCE.passengers,
        loaded: script,
      },
    );
    view.$("#booking-other-text").val("Folding walker").trigger("input");
    check(
      view
        .$("#booking-other-text")
        .closest(".form-group")
        .hasClass("has-error"),
      false,
      {
        label: "typing the note clears the field error",
        source: SOURCE.passengers,
        loaded: script,
      },
    );
    other.checked = false;
    view.$(other).trigger("change");
    await paint();
    check(shown(view, "#other-requirement-section"), false, {
      label: "clearing Other hides the note",
      source: SOURCE.passengers,
      loaded: script,
    });
    check(view.document.querySelector("#booking-other-text").value, "", {
      label: "clearing Other removes the note",
      source: SOURCE.passengers,
      loaded: script,
    });
  });

  it("warns when the return date is moved before the pickup", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { date: "2026-12-15", time: "10:00:00" });
    const roundTrip = role(view.document, "checkbox", { name: /round trip/i });
    roundTrip.checked = true;
    view.$(roundTrip).trigger("change");
    flushTimersOf(100);
    view.$("#booking-return-time").val("09:00:00");
    view.document
      .querySelector("#booking-return-date")
      ._flatpickr.setDate("2026-12-15", true);
    check(
      textOf(view.document, "#return-date-error").includes(
        "Return date must be after pickup date",
      ),
      true,
      {
        label: "changing the return date shows the order error",
        actual: textOf(view.document, "#return-date-error"),
        source: SOURCE.conflict,
        loaded: script,
      },
    );
  });

  it("formats a flight number and rejects one that does not match", async () => {
    const view = await renderBooking(script);
    chooseRadio(view.document, "airport-trip", "Yes");
    flushTimersOf(100);
    const flight = view.$("#booking-flight");
    flight.val("aa1234567extra").trigger("input");
    check(flight.val(), "AA 12345", {
      label: "flight number is shortened and spaced",
      source: SOURCE.flight,
      loaded: script,
    });
    flight.val("1234").trigger("input");
    check(flight.val(), "1234", {
      label: "digits stay digits",
      source: SOURCE.flight,
      loaded: script,
    });
    flight.val("ab").trigger("input");
    check(flight.val(), "AB", {
      label: "letters stay letters",
      source: SOURCE.flight,
      loaded: script,
    });
    await fillValid(view);
    flushTimersOf(100);
    flight.val("A").trigger("input");
    await submitForm(view);
    check(
      resultText(view.document).includes(
        "Please enter a valid flight number (e.g., AA1234)",
      ),
      true,
      {
        label: "bad flight number",
        actual: resultText(view.document),
        source: SOURCE.flight,
        loaded: script,
      },
    );
    flight.val("aa123").trigger("input");
    check(flight.val(), "AA 123", {
      label: "a valid flight is formatted",
      source: SOURCE.flight,
      loaded: script,
    });
    check(flight.closest(".form-group").find(".help-block").text(), "", {
      label: "a valid flight clears the field error",
      source: SOURCE.flight,
      loaded: script,
    });
  });

  it("requires the return date and time on a round trip", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { roundTrip: true });
    view.$("#booking-return-date").val("");
    view.$("#booking-return-time").val("");
    await submitForm(view);
    const text = resultText(view.document);
    check(
      text.includes("Return flight date is required for round trips"),
      true,
      {
        label: "return date required",
        actual: text,
        source: SOURCE.conflict,
        loaded: script,
      },
    );
    check(
      text.includes("Return flight time is required for round trips"),
      true,
      {
        label: "return time required",
        actual: text,
        source: SOURCE.conflict,
        loaded: script,
      },
    );
  });

  it("clears a field error when the rider edits it", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { name: "" });
    await submitForm(view);
    check(resultText(view.document).includes("Name is required"), true, {
      label: "name error is shown",
      source: SOURCE.phone,
      loaded: script,
    });
    view.$("#booking-name").trigger("focus");
    check(textOf(view.document, "#booking-success"), "", {
      label: "focusing a field clears the error summary",
      source: SOURCE.phone,
      loaded: script,
    });
    view.$("#booking-name").val("Jane Smith").trigger("input");
    check(
      view.$("#booking-name").closest(".form-group").find(".help-block").text(),
      "",
      {
        label: "typing a name clears the name error",
        source: SOURCE.phone,
        loaded: script,
      },
    );
    view.$("#booking-email").val("not-an-email").trigger("input");
    view.$("#booking-email").val("jane@example.com").trigger("input");
    check(
      view
        .$("#booking-email")
        .closest(".form-group")
        .find(".help-block")
        .text(),
      "",
      {
        label: "a valid email clears the email error",
        source: SOURCE.email,
        loaded: script,
      },
    );
  });

  it("clears the date, pickup, and destination errors while editing", async () => {
    const view = await renderBooking(script);
    await fillValid(view);
    view.$("#booking-date").val("");
    view.$("#booking-pickup").val("");
    view.$("#booking-destination").val("");
    await submitForm(view);
    view.$("#booking-date").trigger("change");
    view.$("#booking-time").trigger("change");
    check(textOf(view.document, "#date-error"), "", {
      label: "changing the date clears the date error",
      source: SOURCE.conflict,
      loaded: script,
    });
    check(textOf(view.document, "#time-error"), "", {
      label: "changing the time clears the time error",
      source: SOURCE.conflict,
      loaded: script,
    });
    view.$("#booking-pickup").val(pickup).trigger("input");
    view.$("#booking-destination").val("CLT").trigger("input");
    check(textOf(view.document, "#pickup-error"), "", {
      label: "typing the pickup clears the pickup error",
      source: SOURCE.excluded,
      loaded: script,
    });
    check(textOf(view.document, "#destination-error"), "", {
      label: "typing the destination clears the destination error",
      source: SOURCE.excluded,
      loaded: script,
    });
  });

  it("shows checked bags only for an airport trip", async () => {
    const view = await renderBooking(script);
    chooseRadio(view.document, "airport-trip", "Yes");
    const bags = role(view.document, "checkbox", {
      name: /checking bags/i,
      hidden: true,
    });
    bags.checked = true;
    view.$(bags).trigger("change");
    await paint();
    check(shown(view, "#checking-bags-section"), true, {
      label: "bags are shown for an airport trip",
      source: SOURCE.passengers,
      loaded: script,
    });
    chooseRadio(view.document, "airport-trip", "No");
    await paint();
    check(shown(view, "#checking-bags-section"), false, {
      label: "bags are hidden when it is not an airport trip",
      source: SOURCE.passengers,
      loaded: script,
    });
    check(bags.checked, false, {
      label: "bags are unchecked when the airport trip is cleared",
      source: SOURCE.passengers,
      loaded: script,
    });
    check(shown(view, "#round-trip-section"), true, {
      label: "round trip stays available",
      source: SOURCE.passengers,
      loaded: script,
    });
  });

  it("shows and clears the return fields with the round-trip box", async () => {
    const view = await renderBooking(script);
    const roundTrip = role(view.document, "checkbox", { name: /round trip/i });
    roundTrip.checked = true;
    view.$(roundTrip).trigger("change");
    flushTimersOf(100);
    view.$("#booking-return-date").val("2026-12-16");
    view.$("#booking-return-time").val("15:00:00");
    view.document
      .querySelector("#booking-return-time")
      ._flatpickr.setDate("15:00:00", true);
    view.$("#booking-flight").val("AA 1");
    await paint();
    check(shown(view, "#return-flight-section"), true, {
      label: "return fields are shown",
      source: SOURCE.conflict,
      loaded: script,
    });
    roundTrip.checked = false;
    view.$(roundTrip).trigger("change");
    await paint();
    check(shown(view, "#return-flight-section"), false, {
      label: "return fields are hidden",
      source: SOURCE.conflict,
      loaded: script,
    });
    check(view.document.querySelector("#booking-return-date").value, "", {
      label: "return date is cleared",
      source: SOURCE.conflict,
      loaded: script,
    });
    check(view.document.querySelector("#booking-return-time").value, "", {
      label: "return time is cleared",
      source: SOURCE.conflict,
      loaded: script,
    });
    check(view.document.querySelector("#booking-flight").value, "", {
      label: "flight number is cleared",
      source: SOURCE.flight,
      loaded: script,
    });
  });

  it("shows the quote again when the rider says it is not a group event", async () => {
    const view = await renderBooking(script, { miles: 40 });
    await showQuote(view, { pickup, destination: "CLT" });
    chooseRadio(view.document, "group-event", "Yes");
    check(view.document.querySelector("#booking-quote").style.display, "none", {
      label: "group event hides the quote",
      source: SOURCE.group,
      loaded: script,
    });
    const submit = role(view.document, "button", { name: /request booking/i });
    check(submit.disabled, true, {
      label: "group event disables submit",
      source: SOURCE.group,
      loaded: script,
    });
    chooseRadio(view.document, "group-event", "No");
    flushTimersOf(50);
    check(shown(view, "#group-event-call"), false, {
      label: "the call message is hidden again",
      source: SOURCE.group,
      loaded: script,
    });
    check(submit.disabled, false, {
      label: "submit is enabled again",
      source: SOURCE.group,
      loaded: script,
    });
    check(shown(view, "#booking-quote"), true, {
      label: "the quote is shown again",
      source: SOURCE.quote,
      loaded: script,
    });
  });

  it("offers another booking after a request is sent", async () => {
    const view = await renderBooking(script);
    await fillValid(view);
    await submitForm(view);
    await paint();
    check(shown(view, "#bookingForm"), false, {
      label: "the form hides after a request",
      source: SOURCE.submit,
      loaded: script,
    });
    flushTimersOf(2000);
    const again = role(view.document, "button", {
      name: /make another booking/i,
    });
    view.$(again).trigger("click");
    await paint();
    check(textOf(view.document, "#booking-success"), "", {
      label: "another booking clears the confirmation",
      source: SOURCE.submit,
      loaded: script,
    });
    check(shown(view, "#bookingForm"), true, {
      label: "the form is shown again",
      source: SOURCE.submit,
      loaded: script,
    });
    check(view.document.querySelector("#booking-name").value, "", {
      label: "another booking clears the name",
      source: SOURCE.submit,
      loaded: script,
    });
  });

  it("leaves the page alone when there is no booking form", async () => {
    const view = await renderBooking(script, { bare: true });
    check(view.document.getElementById("bookingForm"), null, {
      label: "no booking form",
      source: SOURCE.submit,
      loaded: script,
    });
    check(view.document.getElementById("quote-details"), null, {
      label: "no quote on a page without the form",
      source: SOURCE.quote,
      loaded: script,
    });
  });

  it("defaults a morning visit to three hours ahead, rounded up", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 6, 10, 2, 30));
    const view = await renderBooking(script);
    check(view.document.querySelector("#booking-date").value, "2026-11-06", {
      label: "morning default date",
      source: SOURCE.advance,
      loaded: script,
    });
    check(view.document.querySelector("#booking-time").value, "13:05:00", {
      label: "morning default time rounds up to five minutes",
      source: SOURCE.advance,
      loaded: script,
    });
  });

  it("defaults an evening visit to 8:00 the next morning", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 6, 17, 10, 0));
    const view = await renderBooking(script);
    check(view.document.querySelector("#booking-date").value, "2026-11-07", {
      label: "late afternoon moves to the next morning",
      source: SOURCE.advance,
      loaded: script,
    });
    check(view.document.querySelector("#booking-time").value, "08:00:00", {
      label: "late afternoon default time is 8:00",
      source: SOURCE.advance,
      loaded: script,
    });
  });

  it("defaults a night visit to 8:00 the next morning", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 6, 21, 15, 0));
    const view = await renderBooking(script);
    check(view.document.querySelector("#booking-date").value, "2026-11-07", {
      label: "night default date",
      source: SOURCE.advance,
      loaded: script,
    });
    check(view.document.querySelector("#booking-time").value, "08:00:00", {
      label: "night default time",
      source: SOURCE.advance,
      loaded: script,
    });
  });
});
