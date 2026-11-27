// Donald, Nov 25, 2026: an airport or (non-Two-Trees) bar ride from Cornelius, Davidson, Huntersville, Troutman or Statesville
// gets the pop-up "We're sorry, you're a little out of our service area, but if you give us a call, we could probably help you."
// Mooresville (out completely, Nov 25, 2026 9:50 PM), parties, Two Trees and every other refusal keep their existing wording.
import { afterEach, describe, it } from "vitest";
import { check } from "./helpers/failure.js";
import {
  bookingPosts,
  chooseTrip,
  drainTimers,
  fillValid,
  renderBooking,
  resultText,
  showQuote,
  submitForm,
} from "./helpers/render-booking.js";
import { waitFor } from "@testing-library/dom";

const scripts = ["js/booking.js", "js/booking.min.js"];
const CALL_US =
  "We're sorry, you're a little out of our service area, but if you give us a call, we could probably help you.";
const SORRY = "Sorry, we don't service that area.";
const TOWNS = [
  ["Cornelius", "28031"],
  ["Davidson", "28036"],
  ["Huntersville", "28078"],
  ["Troutman", "28166"],
  ["Statesville", "28677"],
];

afterEach(() => {
  drainTimers();
});

const quoteText = (document) =>
  document
    .querySelector("#quote-details")
    ?.textContent?.replace(/\s+/g, " ")
    .trim() || "";

async function waitQuote(view) {
  let text = "";
  await waitFor(
    () => {
      text = quoteText(view.document);
      if (!text || /figuring/i.test(text)) throw new Error("not ready");
    },
    { timeout: 4000 },
  );
  return text;
}

function localQuote(view, { bar, party, pickup }) {
  chooseTrip(view.document, "local");
  const kind = view.document.querySelector("#local-kind");
  kind.value = party ? "party" : "bar";
  view.window.jQuery(kind).trigger("change");
  if (party) view.document.querySelector("#party-address").value = party;
  else {
    const choice = view.document.querySelector("#bar-choice");
    choice.value = bar;
    view.window.jQuery(choice).trigger("change");
  }
  view.document.querySelector("#booking-pickup").value = pickup;
  view.window.jQuery("#booking-pickup").trigger("blur");
  if (party) view.window.jQuery("#party-address").trigger("blur");
  return waitQuote(view);
}

const popup = (document) => document.querySelector("#callus-popup");

describe.each(scripts)("call-us pop-up %s", (script) => {
  const lbl = (label) => ({ label, source: "js/booking.js", loaded: script });

  it.each(TOWNS)(
    "an airport quote from %s says the call-us text",
    async (town, zip) => {
      const view = await renderBooking(script, { miles: 10 });
      check(
        await showQuote(view, {
          pickup: `10 Main St, ${town} NC ${zip}`,
          destination: "CLT",
        }),
        CALL_US,
        lbl(`${town} airport quote`),
      );
    },
  );

  it("an airport quote from Mooresville and from out of state keeps the flat refusal", async () => {
    const moores = await renderBooking(script, { miles: 10 });
    check(
      await showQuote(moores, {
        pickup: "10 Main St, Mooresville NC 28115",
        destination: "CLT",
      }),
      SORRY,
      lbl("Mooresville airport quote"),
    );
    const sc = await renderBooking(script, { miles: 10 });
    check(
      await showQuote(sc, {
        pickup: "10 Main St, Rock Hill SC 29730",
        destination: "CLT",
      }),
      SORRY,
      lbl("out-of-state airport quote"),
    );
  });

  it("an airport quote where only the geocoder knows the town (Cornelius) says the call-us text", async () => {
    const view = await renderBooking(script, {
      miles: 10,
      censusCity: "Cornelius",
      censusState: "NC",
      censusZip: "28031",
    });
    check(
      await showQuote(view, { pickup: "100 Main Street", destination: "CLT" }),
      CALL_US,
      lbl("geocoded Cornelius airport quote"),
    );
  });

  it.each(TOWNS)(
    "an airport request from %s shows the pop-up, the same words under the address, and sends nothing",
    async (town, zip) => {
      const view = await renderBooking(script, { miles: 10 });
      await fillValid(view, { pickup: `10 Main St, ${town} NC ${zip}` });
      await submitForm(view);
      check(resultText(view.document), CALL_US, lbl(`${town} summary`));
      check(
        view.document.querySelector("#pickup-error").textContent,
        CALL_US,
        lbl(`${town} field message`),
      );
      const box = popup(view.document);
      check(
        box.querySelector("p").textContent,
        CALL_US,
        lbl(`${town} pop-up text`),
      );
      check(
        box.querySelector("[role=alertdialog]") !== null,
        true,
        lbl("pop-up is a dialog"),
      );
      check(bookingPosts(view.state).length, 0, lbl(`${town} sends nothing`));
    },
  );

  it("OK closes the pop-up, Escape closes it, other keys do not, and only one is ever open", async () => {
    const view = await renderBooking(script, { miles: 10 });
    await fillValid(view, { pickup: "10 Main St, Cornelius NC 28031" });
    await submitForm(view);
    await submitForm(view);
    check(
      view.document.querySelectorAll("#callus-popup").length,
      1,
      lbl("one pop-up"),
    );
    view.document.dispatchEvent(
      new view.window.KeyboardEvent("keydown", { key: "a" }),
    );
    check(
      popup(view.document) !== null,
      true,
      lbl("another key leaves it open"),
    );
    view.document.querySelector("#callus-popup-ok").click();
    check(popup(view.document), null, lbl("OK closes it"));
    await submitForm(view);
    check(popup(view.document) !== null, true, lbl("it opens again"));
    view.document.dispatchEvent(
      new view.window.KeyboardEvent("keydown", { key: "Escape" }),
    );
    check(popup(view.document), null, lbl("Escape closes it"));
  });

  it("an airport request from a served town has no pop-up, and Mooresville has the flat refusal and no pop-up", async () => {
    const ok = await renderBooking(script, { miles: 10 });
    await fillValid(ok, {});
    await submitForm(ok);
    check(popup(ok.document), null, lbl("served pickup, no pop-up"));
    const moores = await renderBooking(script, { miles: 10 });
    await fillValid(moores, { pickup: "10 Main St, Mooresville NC 28115" });
    await submitForm(moores);
    check(resultText(moores.document), SORRY, lbl("Mooresville summary"));
    check(popup(moores.document), null, lbl("Mooresville has no pop-up"));
  });

  it("a Bourbon & Bobbers quote and request from Huntersville say the call-us text with the pop-up", async () => {
    const view = await renderBooking(script, { miles: 8 });
    check(
      await localQuote(view, {
        bar: "bourbon-bobber",
        pickup: "10 Main St, Huntersville NC 28078",
      }),
      CALL_US,
      lbl("other-bar quote"),
    );
    await fillValid(view, {
      trip: "local",
      bar: "bourbon-bobber",
      pickup: "10 Main St, Huntersville NC 28078",
      notes: "",
    });
    await submitForm(view);
    check(resultText(view.document), CALL_US, lbl("other-bar summary"));
    check(popup(view.document) !== null, true, lbl("other-bar pop-up"));
    check(bookingPosts(view.state).length, 0, lbl("other-bar sends nothing"));
  });

  it("a bar quote where only the geocoder knows the town (Davidson) says the call-us text", async () => {
    const view = await renderBooking(script, {
      miles: 8,
      censusCity: "Davidson",
      censusState: "NC",
      censusZip: "28036",
    });
    check(
      await localQuote(view, {
        bar: "bourbon-bobber",
        pickup: "100 Main Street",
      }),
      CALL_US,
      lbl("geocoded Davidson bar quote"),
    );
  });

  it("Two Trees, Mooresville bars, parties and a bar not yet chosen keep their existing wording and have no pop-up", async () => {
    const tt = await renderBooking(script, { miles: 5 });
    check(
      await localQuote(tt, {
        bar: "two-trees",
        pickup: "10 Main St, Cornelius NC 28031",
      }),
      "out of our service area.",
      lbl("Two Trees quote"),
    );
    await fillValid(tt, {
      trip: "local",
      pickup: "10 Main St, Cornelius NC 28031",
      notes: "",
    });
    await submitForm(tt);
    check(popup(tt.document), null, lbl("Two Trees has no pop-up"));
    // Mooresville is out completely (Donald, Nov 25, 2026): the old flat wording, no pop-up, at any distance.
    const moores = await renderBooking(script, { miles: 3 });
    check(
      await localQuote(moores, {
        bar: "bourbon-bobber",
        pickup: "10 Main St, Mooresville NC 28115",
      }),
      SORRY,
      lbl("Mooresville bar quote is refused at any distance"),
    );
    const party = await renderBooking(script, { miles: 8 });
    check(
      await localQuote(party, {
        party: "200 Oak St, Sherrills Ford NC",
        pickup: "10 Main St, Statesville NC 28677",
      }),
      SORRY,
      lbl("party quote"),
    );
    await fillValid(party, {
      trip: "local",
      localKind: "party",
      pickup: "10 Main St, Statesville NC 28677",
    });
    await submitForm(party);
    check(resultText(party.document), SORRY, lbl("party summary"));
    check(popup(party.document), null, lbl("party has no pop-up"));
    const none = await renderBooking(script, { miles: 8 });
    await fillValid(none, {
      trip: "local",
      bar: "",
      pickup: "10 Main St, Cornelius NC 28031",
      notes: "",
    });
    await submitForm(none);
    check(popup(none.document), null, lbl("no bar chosen, no pop-up"));
  });

  it("a group 17 miles away (the old limit was 15) is quoted", async () => {
    const view = await renderBooking(script, { miles: 17 });
    chooseTrip(view.document, "group");
    view.document.querySelector("#group-hours").value = "2";
    view.window.jQuery("#group-hours").trigger("change");
    view.document.querySelector("#booking-pickup").value =
      "100 N Main St, Denver NC 28037";
    view.window.jQuery("#booking-pickup").trigger("blur");
    check(
      (await waitQuote(view)).includes("Cash $250.00"),
      true,
      lbl("17 miles group quote"),
    );
  });
});
