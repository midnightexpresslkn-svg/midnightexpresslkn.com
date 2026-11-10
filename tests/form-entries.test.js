import fs from "node:fs";
import { afterEach, describe, it } from "vitest";
import { check } from "./helpers/failure.js";
import {
  drainTimers,
  fillValid,
  formPosts,
  renderBooking,
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

function checkBoxes(document, { wheelchair = false, carSeat = false } = {}) {
  document.querySelector("#booking-wheelchair").checked = wheelchair;
  document.querySelector("#booking-carseat").checked = carSeat;
}

function latentOther(document, text) {
  const box = document.createElement("input");
  box.type = "checkbox";
  box.id = "booking-other-requirement";
  box.checked = true;
  const field = document.createElement("input");
  field.type = "text";
  field.id = "booking-other-text";
  field.value = text;
  document.body.append(box, field);
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
    it("sends every rebuilt field, including optional text and both requirement labels", async () => {
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
          specialNotes: "gate note",
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

    it("joins one checked requirement label and keeps a typed flight off the outbound form row", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await fillValid(view, {
        trip: "airport",
        flight: "AA1234",
        bags: false,
        bagCount: "0",
      });
      checkBoxes(view.document, { carSeat: true });
      await submitForm(view);
      const entries = formRows(view)[0].entries;
      check(
        entries.find((pair) => pair[0] === ENTRY.specialRequirements)[1],
        "Car Seat",
        {
          label: "car seat label is the paragraph",
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

    it("puts latent free text in the same paragraph, including commas", async () => {
      const view = await renderBooking(script, { miles: 12 });
      await fillValid(view, { trip: "airport", bags: false, bagCount: "0" });
      checkBoxes(view.document, { wheelchair: true });
      latentOther(view.document, "rear seat, extra time");
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
      check(
        entries.find((pair) => pair[0] === ENTRY.specialRequirements)[1],
        "Wheelchair, rear seat, extra time",
        {
          label: "free text stays in the special-requirements paragraph",
          actual: entries,
          source: "js/booking.js",
          loaded: script,
        },
      );
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
      checkBoxes(view.document, { wheelchair: true });
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
          specialRequirements: "Wheelchair",
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
          specialRequirements: "Wheelchair",
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
      checkBoxes(view.document, { wheelchair: true, carSeat: true });
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
          label: "group form row does not send wheelchair or car seat",
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
  });
});
