import fs from "node:fs";
import { afterEach, describe, it } from "vitest";
import { check } from "./helpers/failure.js";
import { hostnameOf } from "./helpers/hostname.js";
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

const FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSelLJ8Yqj8jHXreIB3DW8MvsBUtHea8DB7UTjyaYkM3Q2RbTA/formResponse";
const CALENDAR_URL =
  "https://script.google.com/macros/s/AKfycbyUfrtvd64b5GKnkaHONJ7YDGGAXAAWGTxYK3lBASguhUjlO_iXXHiM4-iflODhJTYP4w/exec";

const ENTRY = {
  name: "entry.38734242",
  phone: "entry.1464100699",
  email: "entry.412484716",
  pickupDateTime: "entry.1258152069",
  pickup: "entry.1915297843",
  destination: "entry.814545959",
  passengers: "entry.419038207",
  notes: "entry.1643147243",
  airportTrip: "entry.825490469",
  flight: "entry.149520789",
  checkingBags: "entry.214097981",
  specialRequirements: "entry.853044875",
};

const RETIRED = [
  "entry.131833412",
  "entry.776900145",
  "entry.121804187",
  "entry.1592582104",
  "entry.1137073125",
  "entry.1747359283",
  "entry.240227114",
  "entry.1761921696",
  "entry.1268043435",
  "entry.1389653467",
  "entry.2044186606",
  "entry.1055055925",
];

afterEach(() => {
  drainTimers();
});

function formRows(view) {
  return formPosts(view.state).map((post) => ({
    url: post.url,
    mode: post.mode,
    credentials: post.credentials,
    headers: post.headers,
    entries: post.formEntries,
  }));
}

function calendarPosts(view) {
  const target = new URL(CALENDAR_URL);
  return view.state.requests.filter(
    (request) =>
      request.method === "POST" &&
      sameEndpoint(request.url, target.origin, target.pathname),
  );
}

function sourceHasEndpoint(source, expected) {
  const target = new URL(expected);
  for (const match of source.matchAll(/'([^'\n]+)'|"([^"\n]+)"/g)) {
    const token = match[1] || match[2];
    if (sameEndpoint(token, target.origin, target.pathname)) return true;
  }
  return false;
}

function calendarBody(view) {
  const posts = calendarPosts(view);
  check(posts.length, 1, {
    label: "one calendar post",
    actual: posts.map((post) => post.url),
    source: "js/booking.js",
  });
  return {
    url: posts[0].url,
    mode: posts[0].mode,
    credentials: posts[0].credentials,
    headers: posts[0].headers,
    body: JSON.parse(posts[0].body),
  };
}

function row(values) {
  return [
    [ENTRY.name, values.name],
    [ENTRY.phone, values.phone],
    [ENTRY.email, values.email],
    [ENTRY.pickupDateTime, values.pickupDateTime],
    [ENTRY.pickup, values.pickup],
    [ENTRY.destination, values.destination],
    [ENTRY.passengers, values.passengers],
    [ENTRY.notes, values.notes],
    [ENTRY.airportTrip, values.airportTrip],
    [ENTRY.flight, values.flight],
    [ENTRY.checkingBags, values.checkingBags],
    [ENTRY.specialRequirements, values.specialRequirements],
  ];
}

const NOTES_HINT =
  "Anything we should know? For example, a wheelchair, a car seat, or extra luggage.";

function checkBoxes(document, { wheelchair = false, carSeat = false } = {}) {
  document.querySelector("#booking-wheelchair").checked = wheelchair;
  document.querySelector("#booking-carseat").checked = carSeat;
}

describe("form entries", () => {
  it("keeps the published form and calendar addresses in both scripts", () => {
    for (const file of scripts) {
      const source = fs.readFileSync(file, "utf8");
      check(sourceHasEndpoint(source, FORM_URL), true, {
        label: `${file} posts to the same form`,
        source: file,
      });
      check(sourceHasEndpoint(source, CALENDAR_URL), true, {
        label: `${file} posts to the same calendar`,
        source: file,
      });
      for (const id of Object.values(ENTRY)) {
        check(source.includes(id), true, {
          label: `${file} maps ${id}`,
          source: file,
        });
      }
      for (const id of RETIRED) {
        check(source.includes(id), false, {
          label: `${file} no longer sends ${id}`,
          actual: id,
          source: file,
        });
      }
      check(source.includes("other_option_response"), false, {
        label: `${file} does not use a Google Forms Other field`,
        source: file,
      });
    }
  });

  describe.each(scripts)("%s", (script) => {
    it("keeps wheelchair and car seat boxes and an optional notes hint", async () => {
      const view = await renderBooking(script);
      check(
        view.document.querySelector("#booking-wheelchair").type,
        "checkbox",
        {
          label: "the wheelchair box is on the form",
          source: "js/booking.js",
          loaded: script,
        },
      );
      check(view.document.querySelector("#booking-carseat").type, "checkbox", {
        label: "the car seat box is on the form",
        source: "js/booking.js",
        loaded: script,
      });
      check(view.document.querySelector("#booking-notes").required, false, {
        label: "notes stay optional",
        source: "js/booking.js",
        loaded: script,
      });
      check(
        view.document.querySelector("#notes-hint").textContent,
        NOTES_HINT,
        {
          label: "the notes hint stays visible",
          source: "js/booking.js",
          loaded: script,
        },
      );
      check(
        view.document
          .querySelector("#booking-notes")
          .getAttribute("placeholder"),
        NOTES_HINT,
        {
          label:
            "the notes box tells riders to mention a wheelchair or car seat",
          source: "js/booking.js",
          loaded: script,
        },
      );
      await fillValid(view, { trip: "group", notes: "" });
      check(
        view.document
          .querySelector("#booking-notes")
          .getAttribute("placeholder"),
        NOTES_HINT,
        {
          label: "the group description keeps the same hint",
          source: "js/booking.js",
          loaded: script,
        },
      );
    });

    it("sends every rebuilt field, including a typed note, and leaves special requirements blank", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await fillValid(view, {
        trip: "airport",
        email: "jane@example.com",
        notes: "gate note",
        flight: "AA1234",
        bags: true,
        bagCount: "2",
      });
      checkBoxes(view.document, { wheelchair: true, carSeat: true });
      await submitForm(view);
      const forms = formRows(view);
      check(forms.length, 1, {
        label: "one form post for a one-way airport ride",
        source: "js/booking.js",
        loaded: script,
      });
      check(forms[0].url, FORM_URL, {
        label: "form post URL",
        actual: forms[0].url,
        source: "js/booking.js",
        loaded: script,
      });
      check(forms[0].mode, "no-cors", {
        label: "form post stays no-cors",
        source: "js/booking.js",
        loaded: script,
      });
      check(forms[0].credentials, "omit", {
        label: "form post omits credentials",
        source: "js/booking.js",
        loaded: script,
      });
      check(
        forms[0].headers,
        {},
        {
          label: "form post adds no extra headers",
          source: "js/booking.js",
          loaded: script,
        },
      );
      check(
        forms[0].entries,
        row({
          name: "TEST, DO NOT BOOK",
          phone: "9804229125",
          email: "jane@example.com",
          pickupDateTime: "12/15/2026 10:00:00",
          pickup: "123 Main Street, Denver NC 28037",
          destination: "CLT",
          passengers: "2",
          notes: "gate note",
          airportTrip: "Yes",
          flight: "",
          checkingBags: "Yes",
          specialRequirements: "Wheelchair, Car Seat",
        }),
        {
          label: "exact form fields for a filled airport ride",
          actual: forms[0].entries,
          source: "js/booking.js",
          loaded: script,
        },
      );
      const calendar = calendarBody(view);
      check(calendar.url, CALENDAR_URL, {
        label: "calendar URL",
        actual: calendar.url,
        source: "js/booking.js",
        loaded: script,
      });
      check(calendar.mode, "no-cors", {
        label: "calendar post stays no-cors",
        source: "js/booking.js",
        loaded: script,
      });
      check(calendar.credentials, "omit", {
        label: "calendar post omits credentials",
        source: "js/booking.js",
        loaded: script,
      });
      check(
        calendar.headers,
        { "content-type": "text/plain;charset=utf-8" },
        {
          label: "calendar body stays text/plain JSON",
          actual: calendar.headers,
          source: "js/booking.js",
          loaded: script,
        },
      );
      check(
        calendar.body,
        {
          name: "TEST, DO NOT BOOK",
          phone: "9804229125",
          email: "jane@example.com",
          pickupDate: "2026-12-15",
          pickupTime: "10:00:00",
          pickupAddress: "123 Main Street, Denver NC 28037",
          destinationAddress: "CLT",
          passengers: "2",
          specialNotes: "gate note\nSpecial requirements: Wheelchair, Car Seat",
          airportTrip: "Yes",
          flightNumber: "AA1234",
          checkingBags: "Yes (2 bags)",
          bagCount: 2,
          roundTrip: "No",
          returnDate: "",
          returnTime: "",
          groupEvent: "No",
          durationMinutes: 120,
          contactAddress: "123 Main Street, Denver NC 28037",
        },
        {
          label: "calendar JSON is unchanged",
          actual: calendar.body,
          source: "js/booking.js",
          loaded: script,
        },
      );
    });

    it("sends blank optional answers without a special-requirements value", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await fillValid(view, {
        trip: "airport",
        email: "",
        notes: "",
        bags: false,
        bagCount: "0",
      });
      await submitForm(view);
      const forms = formRows(view);
      check(
        forms[0].entries,
        row({
          name: "TEST, DO NOT BOOK",
          phone: "9804229125",
          email: "",
          pickupDateTime: "12/15/2026 10:00:00",
          pickup: "123 Main Street, Denver NC 28037",
          destination: "CLT",
          passengers: "2",
          notes: "",
          airportTrip: "Yes",
          flight: "",
          checkingBags: "No",
          specialRequirements: "",
        }),
        {
          label: "blank optional form fields stay present and empty",
          actual: forms[0].entries,
          source: "js/booking.js",
          loaded: script,
        },
      );
      check(calendarBody(view).body.checkingBags, "No (0 bags)", {
        label: "calendar still describes zero bags",
        actual: calendarBody(view).body.checkingBags,
        source: "js/booking.js",
        loaded: script,
      });
      check(calendarBody(view).body.flightNumber, "", {
        label: "calendar flight stays blank when none was typed",
        source: "js/booking.js",
        loaded: script,
      });
    });

    it("keeps a typed flight off the outbound form row", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await fillValid(view, {
        trip: "airport",
        flight: "AA1234",
        bags: false,
        bagCount: "0",
      });
      await submitForm(view);
      const entries = formRows(view)[0].entries;
      check(
        entries.find((pair) => pair[0] === ENTRY.specialRequirements)[1],
        "",
        {
          label: "the special-requirements sheet column stays blank",
          actual: entries,
          source: "js/booking.js",
          loaded: script,
        },
      );
      check(entries.find((pair) => pair[0] === ENTRY.flight)[1], "", {
        label: "outbound form row still has no flight number",
        actual: entries,
        source: "js/booking.js",
        loaded: script,
      });
      check(calendarBody(view).body.flightNumber, "AA1234", {
        label: "calendar still receives the flight number",
        actual: calendarBody(view).body.flightNumber,
        source: "js/booking.js",
        loaded: script,
      });
    });

    it("sends a note that mentions a wheelchair and a car seat in the notes column", async () => {
      const view = await renderBooking(script, { miles: 12 });
      const note = "rear seat, extra time, wheelchair and car seat";
      await fillValid(view, {
        trip: "airport",
        notes: note,
        bags: false,
        bagCount: "0",
      });
      await submitForm(view);
      const entries = formRows(view)[0].entries;
      check(
        entries.map((pair) => pair[0]),
        Object.values(ENTRY),
        {
          label: "form keys are the twelve rebuilt questions once each",
          actual: entries.map((pair) => pair[0]),
          source: "js/booking.js",
          loaded: script,
        },
      );
      check(entries.find((pair) => pair[0] === ENTRY.notes)[1], note, {
        label:
          "the typed note, including a wheelchair and a car seat, is the notes answer",
        actual: entries,
        source: "js/booking.js",
        loaded: script,
      });
      check(
        entries.find((pair) => pair[0] === ENTRY.specialRequirements)[1],
        "",
        {
          label: "that note does not fill the special-requirements column",
          actual: entries,
          source: "js/booking.js",
          loaded: script,
        },
      );
      check(calendarBody(view).body.specialNotes, note, {
        label: "the same note is the calendar description",
        actual: calendarBody(view).body.specialNotes,
        source: "js/booking.js",
        loaded: script,
      });
      check(JSON.stringify(entries).includes("other_option"), false, {
        label: "free text is not sent as a Google Forms Other answer",
        actual: entries,
        source: "js/booking.js",
        loaded: script,
      });
    });

    it("sends the return leg as its own form row and leaves the calendar JSON alone", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await fillValid(view, {
        trip: "airport",
        flight: "DL99",
        bags: true,
        bagCount: "2",
        roundTrip: true,
        returnDate: "2026-12-16",
        returnTime: "15:00:00",
      });
      await submitForm(view);
      const forms = formRows(view);
      check(forms.length, 2, {
        label: "round trip sends two form rows",
        actual: forms.length,
        source: "js/booking.js",
        loaded: script,
      });
      check(
        forms[0].entries,
        row({
          name: "TEST, DO NOT BOOK",
          phone: "9804229125",
          email: "jane@example.com",
          pickupDateTime: "12/15/2026 10:00:00",
          pickup: "123 Main Street, Denver NC 28037",
          destination: "CLT",
          passengers: "2",
          notes: "",
          airportTrip: "Yes",
          flight: "",
          checkingBags: "Yes",
          specialRequirements: "",
        }),
        {
          label: "outbound form row",
          actual: forms[0].entries,
          source: "js/booking.js",
          loaded: script,
        },
      );
      check(
        forms[1].entries,
        row({
          name: "TEST, DO NOT BOOK",
          phone: "9804229125",
          email: "jane@example.com",
          pickupDateTime: "12/16/2026 15:00:00",
          pickup: "CLT",
          destination: "123 Main Street, Denver NC 28037",
          passengers: "2",
          notes: "",
          airportTrip: "Yes",
          flight: "DL99",
          checkingBags: "Yes",
          specialRequirements: "",
        }),
        {
          label: "return form row swaps the ends and keeps the flight",
          actual: forms[1].entries,
          source: "js/booking.js",
          loaded: script,
        },
      );
      check(
        calendarBody(view).body,
        {
          name: "TEST, DO NOT BOOK",
          phone: "9804229125",
          email: "jane@example.com",
          pickupDate: "2026-12-15",
          pickupTime: "10:00:00",
          pickupAddress: "123 Main Street, Denver NC 28037",
          destinationAddress: "CLT",
          passengers: "2",
          specialNotes: "",
          airportTrip: "Yes",
          flightNumber: "DL99",
          checkingBags: "Yes (2 bags)",
          bagCount: 2,
          roundTrip: "Yes",
          returnDate: "2026-12-16",
          returnTime: "15:00:00",
          groupEvent: "No",
          durationMinutes: 120,
          contactAddress: "123 Main Street, Denver NC 28037",
        },
        {
          label: "round-trip calendar JSON is unchanged",
          actual: calendarBody(view).body,
          source: "js/booking.js",
          loaded: script,
        },
      );
    });

    it("sends a group ride with empty special requirements and the same calendar JSON", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await fillValid(view, {
        trip: "group",
        notes: "reunion",
        passengers: "4",
        destination: "200 Oak St, Sherrills Ford NC",
        time: "10:00:00",
      });
      await submitForm(view);
      const forms = formRows(view);
      check(
        forms[0].entries,
        row({
          name: "TEST, DO NOT BOOK",
          phone: "9804229125",
          email: "jane@example.com",
          pickupDateTime: "12/15/2026 10:00:00",
          pickup: "123 Main Street, Denver NC 28037",
          destination: "200 Oak St, Sherrills Ford NC",
          passengers: "4",
          notes: "Group event. reunion",
          airportTrip: "No",
          flight: "",
          checkingBags: "No",
          specialRequirements: "",
        }),
        {
          label:
            "group notes are sent and the special-requirements column stays blank",
          actual: forms[0].entries,
          source: "js/booking.js",
          loaded: script,
        },
      );
      check(
        calendarBody(view).body,
        {
          name: "TEST, DO NOT BOOK",
          phone: "9804229125",
          email: "jane@example.com",
          pickupDate: "2026-12-15",
          pickupTime: "10:00:00",
          pickupAddress: "123 Main Street, Denver NC 28037",
          destinationAddress: "200 Oak St, Sherrills Ford NC",
          passengers: "4",
          specialNotes: "Group event. reunion",
          airportTrip: "No",
          flightNumber: "",
          checkingBags: "No",
          bagCount: 0,
          roundTrip: "No",
          returnDate: "",
          returnTime: "",
          groupEvent: "Yes",
          durationMinutes: 120,
          contactAddress: "123 Main Street, Denver NC 28037",
        },
        {
          label: "group calendar JSON is unchanged",
          actual: calendarBody(view).body,
          source: "js/booking.js",
          loaded: script,
        },
      );
    });

    async function failFormPost(view, outcome) {
      const win = view.window;
      const previousFetch = win.fetch;
      const previousSetTimeout = win.setTimeout;
      win.setTimeout = (fn, ms, ...args) =>
        previousSetTimeout(fn, ms === 20000 ? 0 : ms, ...args);
      win.fetch = async (url, init = {}) => {
        const host = hostnameOf(String(url));
        const method = (init.method || "GET").toUpperCase();
        if (host === "docs.google.com" && method === "POST") {
          if (outcome === "timeout") {
            return new Promise((resolve, reject) => {
              const fail = () => {
                const err = new Error("The operation was aborted");
                err.name = "AbortError";
                reject(err);
              };
              if (init.signal?.aborted) fail();
              else init.signal?.addEventListener("abort", fail);
            });
          }
          if (outcome === "http") {
            return { ok: false, status: 500, type: "basic" };
          }
          if (outcome === "status") {
            return { ok: false, status: 204, type: "basic" };
          }
          if (outcome === "missing") return null;
          if (outcome === "abort") {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            throw err;
          }
          if (outcome === "empty") return Promise.reject();
          throw new Error("mocked network failure");
        }
        return previousFetch(url, init);
      };
      try {
        await fillValid(view, {
          trip: "airport",
          notes: "QA note",
          bags: false,
          bagCount: "0",
          roundTrip: outcome === "round",
          returnDate: "2026-12-16",
          returnTime: "15:00:00",
        });
        await submitForm(view);
      } finally {
        win.fetch = previousFetch;
        win.setTimeout = previousSetTimeout;
      }
    }

    function showsSendFailure(view, detail) {
      const text = resultText(view.document);
      check(text.includes("We could not send your booking request"), true, {
        label: "a failed form post tells the rider to call",
        actual: text,
        source: "js/booking.js",
        loaded: view.script,
      });
      check(text.includes("Please call (980) 422-9125 to book."), true, {
        label: "a failed form post gives the phone number",
        actual: text,
        source: "js/booking.js",
        loaded: view.script,
      });
      check(text.includes(detail), true, {
        label: "the page shows the form failure",
        actual: text,
        source: "js/booking.js",
        loaded: view.script,
      });
      check(text.includes("Request received"), false, {
        label: "a failed form post does not say the request was received",
        actual: text,
        source: "js/booking.js",
        loaded: view.script,
      });
      check(calendarPosts(view).length, 0, {
        label: "a failed form post does not mirror to the calendar",
        actual: calendarPosts(view).map((post) => post.url),
        source: "js/booking.js",
        loaded: view.script,
      });
      check(
        view.document.querySelector("#bookingForm").style.display === "none",
        false,
        {
          label: "the form stays on the page after a failed post",
          source: "js/booking.js",
          loaded: view.script,
        },
      );
    }

    it("shows a timeout when the form post is aborted by its 20 second timer", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await failFormPost(view, "timeout");
      showsSendFailure(view, "Submission timed out");
    });

    it("shows the HTTP status when Google answers with a readable error", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await failFormPost(view, "http");
      showsSendFailure(view, "Submission failed (HTTP 500)");
    });

    it("shows a network failure from the form post itself", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await failFormPost(view, "network");
      showsSendFailure(view, "mocked network failure");
    });

    it("says the form post was cancelled when it is aborted before the timer", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await failFormPost(view, "abort");
      showsSendFailure(view, "Submission was cancelled");
    });

    it("says the form post failed when the response has no status", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await failFormPost(view, "missing");
      showsSendFailure(view, "Submission failed (HTTP null)");
    });

    it("names a network error when the form post rejects with nothing", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await failFormPost(view, "empty");
      showsSendFailure(view, "Network error submitting booking");
    });

    it("accepts a readable success status without calling it booked", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await failFormPost(view, "status");
      const text = resultText(view.document);
      check(text.includes("Request received"), true, {
        label: "a readable success status still means the request was sent",
        actual: text,
        source: "js/booking.js",
        loaded: script,
      });
      check(text.includes("not confirmed until you receive a call"), true, {
        label: "a readable success status is still not a confirmed booking",
        actual: text,
        source: "js/booking.js",
        loaded: script,
      });
      check(calendarPosts(view).length, 1, {
        label: "a readable success status still mirrors to the calendar",
        actual: calendarPosts(view).length,
        source: "js/booking.js",
        loaded: script,
      });
    });

    it("clears both pending rides when a round trip form post fails", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await failFormPost(view, "round");
      showsSendFailure(view, "mocked network failure");
      view.document.querySelector("#booking-success").textContent = "";
      await fillValid(view, {
        trip: "airport",
        notes: "QA note",
        bags: false,
        bagCount: "0",
      });
      await submitForm(view);
      check(resultText(view.document).includes("Request received"), true, {
        label: "the next ride can be sent after the failed round trip",
        actual: resultText(view.document),
        source: "js/booking.js",
        loaded: script,
      });
    });

    it("puts a typed note in the sheet notes column and the calendar description", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await fillValid(view, {
        trip: "airport",
        notes: "QA note",
        bags: true,
        bagCount: "1",
      });
      await submitForm(view);
      const form = Object.fromEntries(formRows(view)[0].entries);
      const calendar = calendarBody(view).body;
      check(form[ENTRY.notes], "QA note", {
        label: "form notes stay the typed note",
        actual: form[ENTRY.notes],
        source: "js/booking.js",
        loaded: script,
      });
      check(form[ENTRY.specialRequirements], "", {
        label: "the special-requirements column stays blank",
        actual: form[ENTRY.specialRequirements],
        source: "js/booking.js",
        loaded: script,
      });
      check(
        Object.keys(calendar).sort(),
        [
          "airportTrip",
          "bagCount",
          "checkingBags",
          "contactAddress",
          "destinationAddress",
          "durationMinutes",
          "email",
          "flightNumber",
          "groupEvent",
          "name",
          "passengers",
          "phone",
          "pickupAddress",
          "pickupDate",
          "pickupTime",
          "returnDate",
          "returnTime",
          "roundTrip",
          "specialNotes",
        ].sort(),
        {
          label: "calendar JSON keeps the fields the script already reads",
          actual: Object.keys(calendar).sort(),
          source: "js/booking.js",
          loaded: script,
        },
      );
      check(calendar.checkingBags, "Yes (1 bag)", {
        label: "calendar bag line stays the existing bag sentence",
        actual: calendar.checkingBags,
        source: "js/booking.js",
        loaded: script,
      });
      check(calendar.roundTrip, "No", {
        label: "calendar round trip stays No",
        actual: calendar.roundTrip,
        source: "js/booking.js",
        loaded: script,
      });
      check(calendar.specialNotes, "QA note", {
        label: "calendar description is the typed note",
        actual: calendar.specialNotes,
        source: "js/booking.js",
        loaded: script,
      });
    });
  });
});
