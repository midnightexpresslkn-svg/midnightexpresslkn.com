// Charlotte Ride fix (Donald, Nov 27, 2026): the calendar post tells the script which local ride this is, and only a
// Ride says a Charlotte end is allowed. Also: "Just a ride" is on the first dropdown and opens the Ride form.
// Every request is mocked by tests/helpers/render-booking.js; nothing reaches Google.
import { afterEach, describe, it } from "vitest";
import { check } from "./helpers/failure.js";
import {
  chooseTrip,
  drainTimers,
  fillValid,
  renderBooking,
  submitForm,
} from "./helpers/render-booking.js";
import { hostnameOf } from "./helpers/hostname.js";

const scripts = ["js/booking.js", "js/booking.min.js"];

afterEach(() => {
  drainTimers();
});

function calendarBody(view) {
  const posts = view.state.requests.filter(
    (r) => r.method === "POST" && hostnameOf(r.url) === "script.google.com",
  );
  return { count: posts.length, body: JSON.parse(posts[0].body) };
}

describe.each(scripts)("calendar post names the local ride %s", (script) => {
  const meta = (label, actual) => ({
    label,
    actual,
    source: "js/booking.js",
    loaded: script,
  });

  it("sends localKind ride and allowCharlotte true for a Ride inside the lake towns", async () => {
    const view = await renderBooking(script, { miles: 8 });
    await fillValid(view, {
      trip: "local",
      localKind: "ride",
      destination: "200 Oak St, Sherrills Ford NC 28673",
    });
    await submitForm(view);
    const { count, body } = calendarBody(view);
    check(count, 1, meta("one calendar post", count));
    check(body.localKind, "ride", meta("localKind", body));
    check(body.allowCharlotte, true, meta("allowCharlotte", body));
    check(body.airportTrip, "No", meta("a Ride is not an airport trip", body));
    check(body.groupEvent, "No", meta("a Ride is not a group", body));
  });

  it("sends the same two fields for a Ride to Charlotte", async () => {
    const view = await renderBooking(script, { miles: 20 });
    await fillValid(view, {
      trip: "local",
      localKind: "ride",
      destination: "100 Tryon St, Charlotte NC 28202",
    });
    await submitForm(view);
    const { count, body } = calendarBody(view);
    check(count, 1, meta("one calendar post", count));
    check(body.localKind, "ride", meta("localKind", body));
    check(body.allowCharlotte, true, meta("allowCharlotte", body));
    check(
      body.destinationAddress,
      "100 Tryon St, Charlotte NC 28202",
      meta("Charlotte drop-off", body),
    );
  });

  it("sends localKind bar and no allowCharlotte for a bar ride", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "local", localKind: "bar" });
    await submitForm(view);
    const { body } = calendarBody(view);
    check(body.localKind, "bar", meta("localKind", body));
    check("allowCharlotte" in body, false, meta("no allowCharlotte", body));
  });

  it("sends localKind party and no allowCharlotte for a party ride", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "local", localKind: "party" });
    await submitForm(view);
    const { body } = calendarBody(view);
    check(body.localKind, "party", meta("localKind", body));
    check("allowCharlotte" in body, false, meta("no allowCharlotte", body));
  });

  it("sends neither field for an airport ride or a group ride", async () => {
    const airport = await renderBooking(script, { miles: 30 });
    await fillValid(airport, { trip: "airport" });
    await submitForm(airport);
    const a = calendarBody(airport).body;
    check(
      ["localKind" in a, "allowCharlotte" in a],
      [false, false],
      meta("airport sends neither", a),
    );

    const group = await renderBooking(script);
    await fillValid(group, { trip: "group", hours: "3" });
    await submitForm(group);
    const g = calendarBody(group).body;
    check(
      ["localKind" in g, "allowCharlotte" in g],
      [false, false],
      meta("group sends neither", g),
    );
  });
});

describe.each(scripts)("Just a ride on the first dropdown %s", (script) => {
  const meta = (label, actual) => ({
    label,
    actual,
    source: "js/booking.js",
    loaded: script,
  });

  it("lists Just a ride on the first dropdown", async () => {
    const view = await renderBooking(script);
    const labels = [...view.document.querySelector("#trip-type").options].map(
      (option) => option.textContent,
    );
    check(
      labels,
      ["Select…", "Airport", "Local Bars and Parties", "Just a ride", "Group"],
      meta("first dropdown", labels),
    );
  });

  it("opens the Ride form when it is chosen, with tripKind local and the Ride kind", async () => {
    const view = await renderBooking(script, { miles: 8 });
    const doc = view.document;
    chooseTrip(doc, "ride");
    check(
      [
        doc.querySelector("#trip-type").value,
        doc.querySelector("#local-kind").value,
      ],
      ["local", "ride"],
      meta("remapped to local + ride"),
    );
    check(
      doc.querySelector("#destination-label").textContent,
      "Drop-off address *",
      meta("Ride shows the drop-off box"),
    );
    check(
      doc.querySelector("#local-bar-list").hidden ||
        doc.querySelector("#local-bar-list").style.display === "none",
      true,
      meta("Ride hides the bar list"),
    );
  });

  it("books a Ride picked from the first dropdown with the Ride payload", async () => {
    const view = await renderBooking(script, { miles: 8 });
    await fillValid(view, {
      trip: "local",
      localKind: "ride",
      destination: "200 Oak St, Sherrills Ford NC 28673",
    });
    // Clear the choice, then pick Just a ride from the first dropdown only.
    const kind = view.document.querySelector("#local-kind");
    kind.value = "";
    view.window.jQuery(kind).trigger("change");
    chooseTrip(view.document, "");
    chooseTrip(view.document, "ride");
    check(
      [view.document.querySelector("#trip-type").value, kind.value],
      ["local", "ride"],
      meta("first dropdown set trip type and kind"),
    );
    // Picking a new trip type clears the round-trip answer, so answer it again, then send.
    const no = view.document.querySelector(
      'input[name="round-trip"][value="No"]',
    );
    no.checked = true;
    view.window.jQuery(no).trigger("change");
    await submitForm(view);
    const { body } = calendarBody(view);
    check(
      [body.localKind, body.allowCharlotte, body.specialNotes],
      ["ride", true, "Ride."],
      meta("payload from the first dropdown choice", body),
    );
  });

  it("still asks for a trip type and names Just a ride", async () => {
    const view = await renderBooking(script);
    await submitForm(view);
    const text = view.document.querySelector("#trip-type-error").textContent;
    check(
      text,
      "Please choose Airport, Local Bars and Parties, Just a ride, or Group",
      meta("error text", text),
    );
  });
});
