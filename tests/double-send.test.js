import { afterEach, describe, it } from "vitest";
import { waitFor } from "@testing-library/dom";
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

afterEach(() => {
  drainTimers();
});

async function settle(view, count) {
  await waitFor(
    () => {
      if (formPosts(view.state).length < count)
        throw new Error("waiting for posts");
      if (!resultText(view.document).includes("Request received"))
        throw new Error("waiting for the confirmation");
    },
    { timeout: 4000 },
  );
}

describe.each(scripts)("one send per booking %s", (script) => {
  const opts = { source: "js/booking.js", loaded: script };

  it("sends once when submit fires twice during the checks", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport" });
    const $form = view.window.jQuery("#bookingForm");
    $form.trigger("submit");
    $form.trigger("submit");
    $form.trigger("submit");
    await settle(view, 1);
    check(formPosts(view.state).length, 1, {
      label: "three taps, one row",
      ...opts,
    });
    check(
      view.document.querySelector('#bookingForm button[type="submit"]')
        .disabled,
      true,
      { label: "the sent booking keeps its button locked", ...opts },
    );
  });

  it("never re-sends a booking that already went", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport" });
    await submitForm(view);
    const before = formPosts(view.state).length;
    view.window.jQuery("#bookingForm").show().trigger("submit");
    await new Promise((resolve) => setTimeout(resolve, 0));
    check(formPosts(view.state).length, before, {
      label: "the same booking is blocked",
      ...opts,
    });
  });

  it("unlocks the button again when the checks refuse the ride", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport" });
    view.document.querySelector("#booking-name").value = "";
    await submitForm(view);
    check(resultText(view.document).includes("Name is required"), true, {
      label: "error shown",
      ...opts,
    });
    check(
      view.document.querySelector('#bookingForm button[type="submit"]')
        .disabled,
      false,
      { label: "a refused ride can be fixed and sent", ...opts },
    );
    check(formPosts(view.state).length, 0, { label: "nothing sent", ...opts });
  });

  it("re-sends only the leg that failed when a round trip is retried", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport", roundTrip: true });
    // Legs go out outbound first, then return: fail only the first try of the return leg.
    let formTries = 0;
    view.state.failPost = (request) => {
      if (!request.url.includes("docs.google.com")) return false;
      formTries += 1;
      return formTries === 2;
    };
    await submitForm(view);
    check(resultText(view.document).includes("Submission Error"), true, {
      label: "the failed leg shows an error",
      ...opts,
    });
    check(formPosts(view.state).length, 2, {
      label: "both legs tried once",
      ...opts,
    });
    view.document.querySelector("#booking-success").innerHTML = "";
    view.window.jQuery("#bookingForm").trigger("submit");
    await settle(view, 3);
    check(formPosts(view.state).length, 3, {
      label: "retry sends only the return leg",
      ...opts,
    });
    const urls = formPosts(view.state).map((post) => post.url);
    check(new Set(urls).size, 1, {
      label: "every row goes to the one booking form",
      ...opts,
    });
  });

  it("Make Another Booking appears once, clears everything, and sends nothing", async () => {
    const view = await renderBooking(script, {
      url: "/?type=bar&bar=two-trees",
    });
    await fillValid(view, {
      trip: "airport",
      roundTrip: true,
      notes: "Gate C",
    });
    view.document.querySelector("#booking-wheelchair").checked = true;
    // Wait for the return-date and return-time pickers so clearing them is exercised too.
    await waitFor(
      () => {
        if (!view.document.querySelector("#booking-return-date")._flatpickr)
          throw new Error("waiting for return pickers");
      },
      { timeout: 2000 },
    );
    await submitForm(view);
    const sent = formPosts(view.state).length;
    await startAnotherBooking(view);
    const doc = view.document;
    check(doc.querySelectorAll("#new-booking-btn").length, 1, {
      label: "one button",
      ...opts,
    });
    check(
      doc.querySelector("#new-booking-btn").getAttribute("type"),
      "button",
      { label: "never a submit button", ...opts },
    );
    for (const id of [
      "booking-name",
      "booking-phone",
      "booking-email",
      "booking-pickup",
      "booking-destination",
      "booking-notes",
      "booking-flight",
      "booking-passengers",
      "booking-return-date",
      "booking-return-time",
      "booking-bag-count",
    ]) {
      check(doc.querySelector("#" + id).value, "", {
        label: id + " is empty",
        ...opts,
      });
    }
    for (const id of [
      "trip-type",
      "local-kind",
      "bar-choice",
      "airport-choice",
    ]) {
      check(doc.querySelector("#" + id).value, "", {
        label: id + " is reset",
        ...opts,
      });
    }
    check(doc.querySelectorAll("#bookingForm input:checked").length, 0, {
      label: "no box or choice stays checked",
      ...opts,
    });
    check(view.window.jQuery("#booking-phone").data("raw-value"), undefined, {
      label: "the old phone is forgotten",
      ...opts,
    });
    check(
      doc.querySelector("#trip-type-group").style.display !== "none",
      true,
      { label: "trip type can be picked again", ...opts },
    );
    const trip = doc.querySelector("#trip-type");
    trip.value = "local";
    view.window.jQuery(trip).trigger("change");
    const kind = doc.querySelector("#local-kind");
    kind.value = "bar";
    view.window.jQuery(kind).trigger("change");
    check(doc.querySelector("#bar-choice").value, "", {
      label: "the old ?bar= link does not refill the bar",
      ...opts,
    });
    check(view.window.location.search, "", {
      label: "the link preset is forgotten",
      ...opts,
    });
    check(formPosts(view.state).length, sent, {
      label: "clearing sends nothing",
      ...opts,
    });

    await fillValid(view, {
      trip: "airport",
      name: "Second Rider",
      date: "2026-12-21",
    });
    await submitForm(view);
    check(formPosts(view.state).length, sent + 1, {
      label: "the new booking sends once",
      ...opts,
    });
    check(resultText(view.document).includes("Second Rider"), true, {
      label: "the new rider is confirmed",
      ...opts,
    });
    await startAnotherBooking(view);
    check(doc.querySelectorAll("#new-booking-btn").length, 1, {
      label: "still one button after two bookings",
      ...opts,
    });
  });
});
