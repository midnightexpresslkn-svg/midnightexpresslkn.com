// Group form changes from Donald's Nov 16, 2026 spec.
import { afterEach, describe, it } from "vitest";
import { check } from "./helpers/failure.js";
import { waitFor } from "@testing-library/dom";
import {
  drainTimers,
  fillValid,
  formPosts,
  renderBooking,
  resultText,
  submitForm,
} from "./helpers/render-booking.js";

const scripts = ["js/booking.js", "js/booking.min.js"];
const NOTES = "entry.1643147243";
const SPECIAL = "entry.853044875";
const AGREEMENT =
  "Must be 21 years or older, cannot smoke, and you are responsible for any damages.";

afterEach(() => {
  drainTimers();
});

const meta = (script, label, actual) => ({
  label,
  actual,
  source: "js/booking.js",
  loaded: script,
});

/** Text a rider can see on the group form, including placeholders and tooltips. */
function visibleWords(doc) {
  const out = [];
  const shown = (el) => {
    for (let node = el; node; node = node.parentElement) {
      if (node.hidden || node.style?.display === "none") return false;
    }
    return true;
  };
  doc.querySelectorAll("#bookingForm *").forEach((el) => {
    if (!shown(el) || el.tagName === "OPTION") return;
    if (el.closest("select")) return;
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join(" ");
    out.push(
      own,
      el.getAttribute("placeholder") || "",
      el.getAttribute("title") || "",
    );
  });
  return out.join(" ");
}

describe.each(scripts)("group form %s", (script) => {
  it("never mentions an airport, bags, luggage, a wheelchair, or a car seat", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "group" });
    const words = visibleWords(view.document);
    for (const word of [
      /airport/i,
      /bag/i,
      /luggage/i,
      /wheelchair/i,
      /car seat/i,
    ]) {
      check(
        word.test(words),
        false,
        meta(script, `the group form never says ${word}`, words),
      );
    }
    check(
      view.document.querySelector("#booking-passengers").title,
      "Online: up to 6 riders. For more, call (980) 422-9125.",
      meta(script, "the passenger hint has no bag wording"),
    );
    const trip = view.document.querySelector("#trip-type");
    trip.value = "airport";
    view.window.jQuery(trip).trigger("change");
    check(
      view.document
        .querySelector("#booking-passengers")
        .title.includes("checked bags"),
      true,
      meta(script, "airport rides keep the bag capacity hint"),
    );
    trip.value = "group";
    view.window.jQuery(trip).trigger("change");
    check(
      view.document.querySelector("#booking-notes").placeholder,
      "Anything we should know? For example: drinks, music style.",
      meta(script, "the description gives drinks and music examples"),
    );
  });

  it("offers optional 2nd, 3rd, and 4th stops and sends filled ones in Notes", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "group", notes: "Reunion" });
    const doc = view.document;
    check(
      doc.querySelector("#group-stops").hidden,
      false,
      meta(script, "the stops show on a group"),
    );
    check(
      [2, 3, 4].map((n) => doc.querySelector(`#group-stop-${n}`).required),
      [false, false, false],
      meta(script, "no stop is required"),
    );
    check(
      [2, 3, 4].map(
        (n) => doc.querySelector(`label[for="group-stop-${n}"]`).textContent,
      ),
      ["2nd stop (optional)", "3rd stop (optional)", "4th stop (optional)"],
      meta(script, "each stop is labeled optional"),
    );
    view.window
      .jQuery("#group-stop-2")
      .val("Two Trees Bar and Grill")
      .trigger("input");
    view.window
      .jQuery("#group-stop-4")
      .val("100 Main St, Denver NC")
      .trigger("input");
    await submitForm(view);
    check(
      resultText(doc).includes("Request received"),
      true,
      meta(script, "the group is received", resultText(doc)),
    );
    const entries = Object.fromEntries(formPosts(view.state)[0].formEntries);
    check(
      entries[NOTES],
      `Group event. Reunion\nGroup details:\nAgreement (${AGREEMENT}): Yes\nStop 2: Two Trees Bar and Grill\nStop 4: 100 Main St, Denver NC`,
      meta(
        script,
        "Notes carries the agreement and only the filled stops",
        entries[NOTES],
      ),
    );
    check(
      entries[SPECIAL],
      "",
      meta(script, "Special Requirements stays blank on a group"),
    );
    check(
      [
        entries["entry.791508642"],
        entries["entry.285972615"],
        entries["entry.144653274"],
      ],
      [
        "Stop 2: Two Trees Bar and Grill\nStop 4: 100 Main St, Denver NC",
        "Yes",
        "25% deposit: Cash $93.75 · Card $96.56",
      ],
      meta(
        script,
        "the group also sends extra stops, the 21+ agreement, and the deposit",
        [
          entries["entry.791508642"],
          entries["entry.285972615"],
          entries["entry.144653274"],
        ],
      ),
    );
  });

  it("hides and clears the stops when the trip type changes", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "group" });
    view.window.jQuery("#group-stop-3").val("Somewhere").trigger("input");
    const trip = view.document.querySelector("#trip-type");
    trip.value = "airport";
    view.window.jQuery(trip).trigger("change");
    check(
      view.document.querySelector("#group-stops").hidden,
      true,
      meta(script, "airport rides have no group stops"),
    );
    check(
      view.document.querySelector("#group-stop-3").value,
      "",
      meta(script, "leaving group clears the stops"),
    );
  });

  it("shows the trip charge and the 25% deposit on separate lines, paid up front", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "group", hours: "3" });
    const quote = view.document.querySelector("#quote-details");
    await waitFor(
      () => {
        if (!quote.querySelector(".quote-total"))
          throw new Error("waiting for the group quote");
      },
      { timeout: 4000 },
    );
    const html = quote.innerHTML;
    check(
      quote.querySelector(".quote-total").textContent,
      "Trip charge: Cash $375.00 · Card $386.25",
      meta(script, "the trip charge line", html),
    );
    check(
      quote.querySelector(".quote-deposit").textContent,
      "25% deposit: Cash $93.75 · Card $96.56Deposit must be paid up front.",
      meta(
        script,
        "the deposit is its own line and says it is paid up front",
        html,
      ),
    );
    await submitForm(view);
    const price = view.document.querySelector(".confirm-price").textContent;
    for (const line of [
      "Trip charge: Cash $375.00 · Card $386.25",
      "25% deposit: Cash $93.75 · Card $96.56",
      "Deposit must be paid up front.",
    ]) {
      check(
        price.includes(line),
        true,
        meta(script, `the confirmation shows "${line}"`, price),
      );
    }
  });
});
