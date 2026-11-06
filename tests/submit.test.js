import { afterEach, describe, it } from "vitest";
import { waitFor } from "@testing-library/dom";
import { SOURCE } from "./helpers/source-line.js";
import { check, role } from "./helpers/failure.js";
import { hostnameOf } from "./helpers/hostname.js";
import {
  drainTimers,
  fillValid,
  flushTimersOf,
  hasTimer,
  renderBooking,
  resultText,
  submitForm,
} from "./helpers/render-booking.js";

const scripts = ["js/booking.js", "js/booking.min.js"];
const pickup = "123 Main Street, Denver NC 28037";

afterEach(() => {
  drainTimers();
});

function posts(state, host) {
  return state.requests.filter(
    (request) =>
      request.via === "fetch" &&
      request.method === "POST" &&
      hostnameOf(request.url) === host,
  );
}

function values(body, key) {
  return [...body.entries()]
    .filter(([name]) => name === key)
    .map(([, value]) => value);
}

function calendarBody(state) {
  return JSON.parse(posts(state, "script.google.com")[0].body);
}

describe.each(scripts)("booking submit %s", (script) => {
  it("sends one mocked form and one calendar request", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { name: "Jane Smith", notes: undefined });
    view.$("#booking-notes").val("Gate B").trigger("input");
    await submitForm(view);
    const text = resultText(view.document);
    check(text.includes("Request received. We'll call to confirm"), true, {
      label: "success heading",
      actual: text,
      source: SOURCE.submit,
      loaded: script,
    });
    check(text.includes("Thank you, Jane Smith"), true, {
      label: "success names the rider",
      actual: text,
      source: SOURCE.submit,
      loaded: script,
    });
    check(text.includes("Tue, Dec 15, 2026"), true, {
      label: "success names the pickup date",
      actual: text,
      source: SOURCE.submit,
      loaded: script,
    });
    check(text.includes("9804229125"), true, {
      label: "success names the phone number",
      actual: text,
      source: SOURCE.submit,
      loaded: script,
    });
    check(text.includes("not confirmed until you receive a call"), true, {
      label: "success says the ride is not confirmed",
      actual: text,
      source: SOURCE.submit,
      loaded: script,
    });
    const forms = posts(view.state, "docs.google.com");
    check(forms.length, 1, {
      label: "one Google Form post",
      source: SOURCE.submit,
      loaded: script,
    });
    check(values(forms[0].body, "entry.131833412"), ["Jane Smith"], {
      label: "form name",
      source: SOURCE.submit,
      loaded: script,
    });
    check(values(forms[0].body, "entry.1137073125"), [pickup], {
      label: "form pickup",
      source: SOURCE.submit,
      loaded: script,
    });
    check(values(forms[0].body, "entry.1747359283"), ["CLT"], {
      label: "form destination",
      source: SOURCE.submit,
      loaded: script,
    });
    check(
      values(forms[0].body, "entry.1592582104")[0].includes("12/15/2026"),
      true,
      {
        label: "form date is month/day/year",
        actual: values(forms[0].body, "entry.1592582104")[0],
        source: SOURCE.submit,
        loaded: script,
      },
    );
    check(values(forms[0].body, "entry.1761921696"), ["Gate B"], {
      label: "form notes",
      source: SOURCE.submit,
      loaded: script,
    });
    const calendar = calendarBody(view.state);
    check(calendar.name, "Jane Smith", {
      label: "calendar name",
      source: SOURCE.calendar,
      loaded: script,
    });
    check(calendar.pickupAddress, pickup, {
      label: "calendar pickup",
      source: SOURCE.calendar,
      loaded: script,
    });
    check(calendar.destinationAddress, "CLT", {
      label: "calendar destination",
      source: SOURCE.calendar,
      loaded: script,
    });
    check(calendar.flightNumber, "", {
      label: "one-way calendar flight stays empty",
      source: SOURCE.calendar,
      loaded: script,
    });
    check(calendar.specialNotes, "Gate B", {
      label: "calendar notes",
      source: SOURCE.calendar,
      loaded: script,
    });
    check(posts(view.state, "script.google.com").length, 1, {
      label: "one calendar post",
      source: SOURCE.calendar,
      loaded: script,
    });
  });

  it("sends the return ride with the addresses swapped", async () => {
    const view = await renderBooking(script);
    await fillValid(view, {
      roundTrip: true,
      returnDate: "2026-12-16",
      returnTime: "15:00:00",
    });
    view.$("#booking-flight").val("DL 88").trigger("input");
    const bags = role(view.document, "checkbox", { name: /checking bags/i });
    bags.checked = true;
    view.$(bags).trigger("change");
    const wheelchair = role(view.document, "checkbox", {
      name: /^wheelchair$/i,
    });
    wheelchair.checked = true;
    view.$(wheelchair).trigger("change");
    const other = role(view.document, "checkbox", { name: /^other$/i });
    other.checked = true;
    view.$(other).trigger("change");
    view.$("#booking-other-text").val("Booster seat").trigger("input");
    await submitForm(view);
    const text = resultText(view.document);
    check(text.includes("round-trip requests were sent"), true, {
      label: "round trip success copy",
      actual: text,
      source: SOURCE.submit,
      loaded: script,
    });
    check(text.includes("Outbound:"), true, {
      label: "success lists the outbound ride",
      actual: text,
      source: SOURCE.submit,
      loaded: script,
    });
    check(text.includes("Return:"), true, {
      label: "success lists the return ride",
      actual: text,
      source: SOURCE.submit,
      loaded: script,
    });
    check(text.includes("Tue, Dec 15, 2026"), true, {
      label: "success outbound date",
      actual: text,
      source: SOURCE.submit,
      loaded: script,
    });
    check(text.includes("Wed, Dec 16, 2026"), true, {
      label: "success return date",
      actual: text,
      source: SOURCE.submit,
      loaded: script,
    });
    const forms = posts(view.state, "docs.google.com");
    check(forms.length, 2, {
      label: "round trip sends two form posts",
      source: SOURCE.submit,
      loaded: script,
    });
    check(values(forms[0].body, "entry.1747359283"), ["CLT"], {
      label: "outbound destination",
      source: SOURCE.submit,
      loaded: script,
    });
    check(values(forms[0].body, "entry.1389653467"), [""], {
      label: "outbound has no flight number",
      source: SOURCE.flight,
      loaded: script,
    });
    check(values(forms[1].body, "entry.1137073125"), ["CLT"], {
      label: "return pickup is the outbound destination",
      source: SOURCE.submit,
      loaded: script,
    });
    check(values(forms[1].body, "entry.1747359283"), [pickup], {
      label: "return destination is the outbound pickup",
      source: SOURCE.submit,
      loaded: script,
    });
    check(values(forms[1].body, "entry.1389653467"), ["DL 88"], {
      label: "return carries the flight number",
      source: SOURCE.flight,
      loaded: script,
    });
    check(values(forms[1].body, "entry.2044186606"), ["Yes"], {
      label: "checked bags are sent",
      source: SOURCE.passengers,
      loaded: script,
    });
    check(
      values(forms[0].body, "entry.1055055925"),
      ["Wheelchair", "__other_option__"],
      {
        label: "special requirements are sent",
        source: SOURCE.passengers,
        loaded: script,
      },
    );
    check(
      values(forms[0].body, "entry.1055055925.other_option_response"),
      ["Booster seat"],
      {
        label: "other requirement text is sent",
        source: SOURCE.passengers,
        loaded: script,
      },
    );
    const calendar = calendarBody(view.state);
    check(calendar.roundTrip, "Yes", {
      label: "calendar round trip flag",
      source: SOURCE.calendar,
      loaded: script,
    });
    check(calendar.returnDate, "2026-12-16", {
      label: "calendar return date",
      source: SOURCE.calendar,
      loaded: script,
    });
    check(calendar.returnTime, "15:00:00", {
      label: "calendar return time",
      source: SOURCE.calendar,
      loaded: script,
    });
    check(calendar.checkingBags, "Yes", {
      label: "calendar bags flag",
      source: SOURCE.calendar,
      loaded: script,
    });
  });

  it("shows the rider name as text when it contains markup characters", async () => {
    const view = await renderBooking(script);
    const name = `A&B "C" 'D' <E>`;
    await fillValid(view, { name });
    await submitForm(view);
    const box = view.document.querySelector("#booking-success");
    check(box.querySelector("e, img, script"), null, {
      label: "markup in the name is not parsed as HTML",
      source: SOURCE.escape,
      loaded: script,
    });
    check(resultText(view.document).includes(name), true, {
      label: "the typed name is still visible",
      actual: resultText(view.document),
      source: SOURCE.escape,
      loaded: script,
    });
    check(box.innerHTML.includes("&amp;"), true, {
      label: "ampersand is escaped",
      source: SOURCE.escape,
      loaded: script,
    });
    check(box.innerHTML.includes("&lt;"), true, {
      label: "less-than is escaped",
      source: SOURCE.escape,
      loaded: script,
    });
    check(box.innerHTML.includes("&gt;"), true, {
      label: "greater-than is escaped",
      source: SOURCE.escape,
      loaded: script,
    });
  });

  it("tells the rider to call when the form post fails", async () => {
    const view = await renderBooking(script, { formMode: "network" });
    await fillValid(view);
    await submitForm(view);
    const text = resultText(view.document);
    check(text.includes("We could not send your booking request"), true, {
      label: "network failure copy",
      actual: text,
      source: SOURCE.submit,
      loaded: script,
    });
    check(text.includes("(980) 422-9125"), true, {
      label: "network failure gives the phone number",
      actual: text,
      source: SOURCE.submit,
      loaded: script,
    });
    check(text.includes("mocked network failure"), true, {
      label: "network failure includes the error",
      actual: text,
      source: SOURCE.submit,
      loaded: script,
    });
    check(text.includes("Request received"), false, {
      label: "network failure is not treated as received",
      source: SOURCE.submit,
      loaded: script,
    });
    view.state.formMode = "opaque";
    await submitForm(view);
    check(resultText(view.document).includes("Request received"), true, {
      label: "a retry works after the failure",
      actual: resultText(view.document),
      source: SOURCE.submit,
      loaded: script,
    });
  });

  it("tells the rider to call when the form answers with an error", async () => {
    const view = await renderBooking(script, { formMode: "http" });
    await fillValid(view);
    await submitForm(view);
    check(resultText(view.document).includes("HTTP 500"), true, {
      label: "HTTP error is shown",
      actual: resultText(view.document),
      source: SOURCE.submit,
      loaded: script,
    });
  });

  it("tells the rider to call when the form post is cancelled", async () => {
    const view = await renderBooking(script, { formMode: "abort" });
    await fillValid(view);
    await submitForm(view);
    check(
      resultText(view.document).includes("Submission was cancelled"),
      true,
      {
        label: "cancelled submission copy",
        actual: resultText(view.document),
        source: SOURCE.submit,
        loaded: script,
      },
    );
  });

  it("tells the rider to call when the form post times out", async () => {
    const view = await renderBooking(script, { formMode: "timeout" });
    await fillValid(view);
    const pending = submitForm(view);
    await waitFor(() => {
      if (!hasTimer(20000)) throw new Error("the submit timeout was not armed");
    });
    flushTimersOf(20000);
    await pending;
    check(resultText(view.document).includes("Submission timed out"), true, {
      label: "timeout copy",
      actual: resultText(view.document),
      source: SOURCE.submit,
      loaded: script,
    });
    check(posts(view.state, "script.google.com").length, 0, {
      label: "a timed out form does not mirror to the calendar",
      source: SOURCE.calendar,
      loaded: script,
    });
  });

  it.each(["ok", "status0", "redirect", "redirect-basic"])(
    "accepts a %s form response as received",
    async (formMode) => {
      const view = await renderBooking(script, { formMode });
      await fillValid(view);
      await submitForm(view);
      check(resultText(view.document).includes("Request received"), true, {
        label: `${formMode} response is received`,
        actual: resultText(view.document),
        source: SOURCE.submit,
        loaded: script,
      });
    },
  );

  it("still says the request was received when the calendar mirror fails", async () => {
    const view = await renderBooking(script, { calendarMode: "network" });
    await fillValid(view);
    await submitForm(view);
    check(resultText(view.document).includes("Request received"), true, {
      label: "calendar failure still confirms the request was sent",
      actual: resultText(view.document),
      source: SOURCE.calendar,
      loaded: script,
    });
    check(posts(view.state, "script.google.com").length, 1, {
      label: "the calendar mirror was attempted",
      source: SOURCE.calendar,
      loaded: script,
    });
    check(posts(view.state, "docs.google.com").length, 1, {
      label: "the form was still posted",
      source: SOURCE.submit,
      loaded: script,
    });
  });

  it("refuses a pickup Census places in an excluded town", async () => {
    const view = await renderBooking(script, {
      censusCity: "Mooresville",
      censusZip: "28115",
    });
    await fillValid(view, { pickup: "100 Oak Street, Denver NC 28037" });
    await submitForm(view);
    check(
      resultText(view.document).includes("We do not serve Mooresville"),
      true,
      {
        label: "Census town blocks the booking",
        actual: resultText(view.document),
        source: SOURCE.excluded,
        loaded: script,
      },
    );
    check(posts(view.state, "docs.google.com").length, 0, {
      label: "Census town sends no form",
      source: SOURCE.excluded,
      loaded: script,
    });
  });

  it("accepts a pickup when the town lookup fails or finds nothing", async () => {
    const failed = await renderBooking(script, { censusMode: "error" });
    await fillValid(failed);
    await submitForm(failed);
    check(resultText(failed.document).includes("Request received"), true, {
      label: "Census error does not block a Denver pickup",
      actual: resultText(failed.document),
      source: SOURCE.excluded,
      loaded: script,
    });
    const missed = await renderBooking(script, {
      censusMode: "miss",
      censusCity: "",
      censusZip: "",
    });
    await fillValid(missed);
    await submitForm(missed);
    check(resultText(missed.document).includes("Request received"), true, {
      label: "Census miss does not block a Denver pickup",
      actual: resultText(missed.document),
      source: SOURCE.excluded,
      loaded: script,
    });
  });
});
