// Bar form changes from Donald's Nov 16, 2026 spec.
import { afterEach, describe, it } from "vitest";
import { check } from "./helpers/failure.js";
import {
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
const AGREEMENT =
  "Must be 21 years or older, cannot smoke, and you are responsible for any damages.";

afterEach(() => {
  drainTimers();
});

function pickRound(view, value) {
  const el = view.document.querySelector(
    value === "Yes" ? "#booking-round-trip" : "#booking-round-trip-no",
  );
  el.checked = true;
  view.window.jQuery(el).trigger("change");
}

function fillReturn(view, { passengers, time, place }) {
  const $ = view.window.jQuery;
  if (passengers != null)
    $("#bar-return-passengers").val(passengers).trigger("input");
  if (time != null)
    view.document
      .querySelector("#bar-return-time")
      ._flatpickr.setDate(time, true, "H:i:S");
  if (place != null) $("#bar-return-location").val(place).trigger("input");
}

function err(view, id) {
  return view.document.querySelector(`#${id}`).textContent;
}

function calendar(view) {
  const post = view.state.requests.find(
    (r) => r.method === "POST" && r.url.includes("script.google.com"),
  );
  return JSON.parse(post.body);
}

describe.each(scripts)("bar form %s", (script) => {
  it("leaves round trip unanswered and requires Yes or No", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "local", roundTrip: null });
    check(
      [
        view.document.querySelector("#booking-round-trip").checked,
        view.document.querySelector("#booking-round-trip-no").checked,
      ],
      [false, false],
      {
        label: "round trip is not pre-filled on a bar ride",
        source: "js/booking.js",
        loaded: script,
      },
    );
    await submitForm(view);
    check(
      err(view, "round-trip-error"),
      "Please choose Yes or No for round trip.",
      {
        label: "an unanswered round trip is named",
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(formPosts(view.state).length, 0, {
      label: "an unanswered round trip sends nothing",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("opens the ride-back questions only on Yes and clears them on No", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "local", roundTrip: null });
    const box = view.document.querySelector("#bar-return-details");
    check(box.hidden, true, {
      label: "ride-back questions start closed",
      source: "js/booking.js",
      loaded: script,
    });
    pickRound(view, "Yes");
    check(box.hidden, false, {
      label: "Yes opens the ride-back questions",
      source: "js/booking.js",
      loaded: script,
    });
    check(
      [
        "#bar-return-passengers",
        "#bar-return-time",
        "#bar-return-location",
      ].map((id) => view.document.querySelector(id).required),
      [true, true, true],
      {
        label: "each ride-back question is required",
        source: "js/booking.js",
        loaded: script,
      },
    );
    fillReturn(view, {
      passengers: "3",
      time: "23:30:00",
      place: "Front door",
    });
    pickRound(view, "No");
    check(
      [
        box.hidden,
        view.document.querySelector("#bar-return-passengers").value,
        view.document.querySelector("#bar-return-time").value,
        view.document.querySelector("#bar-return-location").value,
      ],
      [true, "", "", ""],
      {
        label: "No closes and clears the ride-back questions",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("names each missing ride-back answer and too many riders", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "local", roundTrip: null });
    pickRound(view, "Yes");
    await submitForm(view);
    check(
      [
        err(view, "bar-return-passengers-error"),
        err(view, "bar-return-time-error"),
        err(view, "bar-return-location-error"),
      ],
      [
        "Please enter how many passengers ride back.",
        "Please choose a return pickup time.",
        "Please enter where to pick you up for the ride back.",
      ],
      {
        label: "each missing ride-back answer is named",
        actual: resultText(view.document),
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(formPosts(view.state).length, 0, {
      label: "missing ride-back answers send nothing",
      source: "js/booking.js",
      loaded: script,
    });
    fillReturn(view, { passengers: "7" });
    check(err(view, "bar-return-passengers-error"), "", {
      label: "answering clears its error",
      source: "js/booking.js",
      loaded: script,
    });
    await submitForm(view);
    check(
      err(view, "bar-return-passengers-error").includes(
        "For more than 6 passengers, please call (980) 422-9125.",
      ),
      true,
      {
        label: "seven riders back are asked to call",
        actual: err(view, "bar-return-passengers-error"),
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("needs the one agreement box and sends it with the ride back in Notes", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, {
      trip: "local",
      roundTrip: null,
      barAgreement: false,
    });
    pickRound(view, "Yes");
    fillReturn(view, {
      passengers: "3",
      time: "23:30:00",
      place: "Front door",
    });
    await submitForm(view);
    check(err(view, "ride-rules-error"), `Please check the box: ${AGREEMENT}`, {
      label: "the unchecked agreement is named",
      source: "js/booking.js",
      loaded: script,
    });
    check(formPosts(view.state).length, 0, {
      label: "no agreement, no request",
      source: "js/booking.js",
      loaded: script,
    });
    const agree = view.document.querySelector("#rule-bar-agreement");
    agree.checked = true;
    view.window.jQuery(agree).trigger("change");
    check(err(view, "ride-rules-error"), "", {
      label: "checking the box clears its error",
      source: "js/booking.js",
      loaded: script,
    });
    await submitForm(view);
    const posts = formPosts(view.state);
    check(posts.length, 1, {
      label: "a bar round trip is one form row",
      source: "js/booking.js",
      loaded: script,
    });
    const notes = Object.fromEntries(posts[0].formEntries)[NOTES];
    check(
      notes.endsWith(
        `Round trip.\nAgreement (${AGREEMENT}): Yes\nReturn ride:\nPassengers back: 3\nReturn pickup time: 11:30 PM\nReturn pickup location: Front door`,
      ),
      true,
      {
        label: "Notes carry the agreement and the ride back as labeled lines",
        actual: notes,
        source: "js/booking.js",
        loaded: script,
      },
    );
    const body = calendar(view);
    check(
      [body.mustBe21, body.noSmoking, body.damageResponsibility],
      ["Yes", "Yes", "Yes"],
      {
        label: "the one box answers all three calendar fields",
        source: "js/booking.js",
        loaded: script,
      },
    );

    await startAnotherBooking(view);
    check(
      [
        view.document.querySelector("#bar-return-details").hidden,
        view.document.querySelector("#rule-bar-agreement").checked,
      ],
      [true, false],
      {
        label:
          "Make Another Booking closes the ride-back questions and unticks the box",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("writes morning and noon return times in 12-hour time", async () => {
    for (const [time, shown] of [
      ["01:15:00", "1:15 AM"],
      ["12:00:00", "12:00 PM"],
    ]) {
      const view = await renderBooking(script, { miles: 4 });
      await fillValid(view, { trip: "local", roundTrip: null });
      pickRound(view, "Yes");
      fillReturn(view, { passengers: "2", time, place: "Front door" });
      await submitForm(view);
      const notes = Object.fromEntries(formPosts(view.state)[0].formEntries)[
        NOTES
      ];
      check(notes.includes(`Return pickup time: ${shown}`), true, {
        label: `${time} is written as ${shown}`,
        actual: notes,
        source: "js/booking.js",
        loaded: script,
      });
    }
  });

  it("asks for bar or party before anything is sent", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "local", notes: "" });
    const kind = view.document.querySelector("#local-kind");
    kind.value = "";
    view.window.jQuery(kind).trigger("change");
    await submitForm(view);
    check(
      resultText(view.document).includes(
        "Please choose a bar, restaurant, or party",
      ),
      true,
      {
        label: "no bar or party chosen is named",
        actual: resultText(view.document),
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(formPosts(view.state).length, 0, {
      label: "no bar or party chosen sends nothing",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("uses drinks and music examples for bar and party notes", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "local" });
    const box = view.document.querySelector("#booking-notes");
    const hint = view.document.querySelector("#notes-hint");
    const barHint =
      "Anything we should know? For example: drinks, music style.";
    check([box.placeholder, hint.textContent], [barHint, barHint], {
      label:
        "a bar ride gives drinks and music examples on the box and below it",
      source: "js/booking.js",
      loaded: script,
    });
    const kind = view.document.querySelector("#local-kind");
    kind.value = "party";
    view.window.jQuery(kind).trigger("change");
    check([box.placeholder, hint.textContent], [barHint, barHint], {
      label: "a party ride gives the same drinks and music examples",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("keeps the bar ride-back questions off the party form", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, {
      trip: "local",
      localKind: "party",
      roundTrip: null,
    });
    pickRound(view, "Yes");
    check(view.document.querySelector("#bar-return-details").hidden, true, {
      label: "a party round trip does not open the bar ride-back questions",
      source: "js/booking.js",
      loaded: script,
    });
    pickRound(view, "No");
    await submitForm(view);
    const notes = Object.fromEntries(formPosts(view.state)[0].formEntries)[
      NOTES
    ];
    check(notes.includes("Return pickup time:"), false, {
      label: "a party ride has no bar ride-back lines",
      actual: notes,
      source: "js/booking.js",
      loaded: script,
    });
  });
});
