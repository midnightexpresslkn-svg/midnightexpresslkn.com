// Airport one-way "Are you sure?" from Donald's Nov 19, 2026 request: the first No on an
// airport round trip is cleared and the message shows; Yes hides it; a second No is kept.
import { afterEach, describe, it } from "vitest";
import { queryAllByRole } from "@testing-library/dom";
import { check } from "./helpers/failure.js";
import {
  chooseTrip,
  drainTimers,
  fillValid,
  formPosts,
  renderBooking,
  startAnotherBooking,
  submitForm,
} from "./helpers/render-booking.js";

const scripts = ["js/booking.js", "js/booking.min.js"];
const MESSAGE =
  "Are you sure? We track inbound flights and adjust pickup times accordingly, and we always have a driver waiting on you.";

afterEach(() => {
  drainTimers();
});

function answer(view, value) {
  const el = view.document.querySelector(
    value === "Yes" ? "#booking-round-trip" : "#booking-round-trip-no",
  );
  el.checked = true;
  view.window.jQuery(el).trigger("change");
}

function picked(view) {
  return [
    view.document.querySelector("#booking-round-trip").checked,
    view.document.querySelector("#booking-round-trip-no").checked,
  ];
}

/** The live region the rider hears, found by its alert role, or null when it is hidden. */
function shownAlert(view) {
  const alerts = queryAllByRole(view.document, "alert");
  return alerts.find((el) => el.textContent === MESSAGE && !el.hidden) || null;
}

function confirmBox(view) {
  return view.document.querySelector("#round-trip-confirm");
}

describe.each(scripts)("airport one-way confirm %s", (script) => {
  const meta = (label) => ({ label, source: "js/booking.js", loaded: script });

  it("clears the first No, shows Are you sure? as an alert, and still needs an answer", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { roundTrip: null });
    check(confirmBox(view).hidden, true, meta("no message before an answer"));
    answer(view, "No");
    check(picked(view), [false, false], meta("the first No is unchecked"));
    check(
      shownAlert(view) === confirmBox(view),
      true,
      meta("Are you sure? shows in a role=alert region"),
    );
    check(
      confirmBox(view).closest("#round-trip-section") !== null,
      true,
      meta("the message sits with the Round trip question"),
    );
    await submitForm(view);
    check(
      view.document.querySelector("#round-trip-error").textContent,
      "Please choose Yes or No for round trip.",
      meta("round trip is required again after the first No"),
    );
    check(formPosts(view.state).length, 0, meta("nothing is sent"));
  });

  it("hides the message on Yes and keeps Yes", async () => {
    const view = await renderBooking(script);
    chooseTrip(view.document, "airport");
    answer(view, "No");
    check(confirmBox(view).hidden, false, meta("message shown after first No"));
    answer(view, "Yes");
    check(picked(view), [true, false], meta("Yes stays picked"));
    check(
      [confirmBox(view).hidden, confirmBox(view).textContent],
      [true, ""],
      meta("Yes hides and empties the message"),
    );
    check(shownAlert(view), null, meta("no alert is left on the page"));
  });

  it("keeps a second No and books the ride one way", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { roundTrip: null });
    answer(view, "No");
    answer(view, "No");
    check(picked(view), [false, true], meta("the second No is kept"));
    check(
      confirmBox(view).hidden,
      true,
      meta("the second No hides the message"),
    );
    answer(view, "Yes");
    answer(view, "No");
    check(picked(view), [false, true], meta("a later No is kept too"));
    await submitForm(view);
    const posts = formPosts(view.state);
    check(posts.length, 1, meta("a one-way airport ride sends one entry"));
    const calendar = JSON.parse(
      view.state.requests.find(
        (r) => r.method === "POST" && r.url.includes("script.google.com"),
      ).body,
    );
    check(calendar.roundTrip, "No", meta("the booking is sent as one way"));
  });

  it("keeps the first No on a bar ride with no message", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "local", roundTrip: null });
    answer(view, "No");
    check(picked(view), [false, true], meta("a bar ride keeps the first No"));
    check(confirmBox(view).hidden, true, meta("a bar ride shows no message"));
  });

  it("keeps the first No on a party ride with no message", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, {
      trip: "local",
      localKind: "party",
      roundTrip: null,
    });
    answer(view, "No");
    check(picked(view), [false, true], meta("a party ride keeps the first No"));
    check(confirmBox(view).hidden, true, meta("a party ride shows no message"));
  });

  it("hides the message when the trip type changes away from airport", async () => {
    const view = await renderBooking(script);
    chooseTrip(view.document, "airport");
    answer(view, "No");
    check(confirmBox(view).hidden, false, meta("message shown on airport"));
    chooseTrip(view.document, "local");
    check(
      [confirmBox(view).hidden, confirmBox(view).textContent],
      [true, ""],
      meta("switching to a local ride hides the message"),
    );
  });

  it("asks again on the next booking after Book another ride", async () => {
    const view = await renderBooking(script);
    await fillValid(view);
    await submitForm(view);
    check(formPosts(view.state).length, 1, meta("first booking sent one way"));
    await startAnotherBooking(view);
    check(confirmBox(view).hidden, true, meta("a fresh form shows no message"));
    chooseTrip(view.document, "airport");
    answer(view, "No");
    check(
      picked(view),
      [false, false],
      meta("a new booking clears the first No"),
    );
    check(confirmBox(view).hidden, false, meta("and asks Are you sure? again"));
  });
});
