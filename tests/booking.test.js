import { afterEach, describe, it } from "vitest";
import { SOURCE } from "./helpers/source-line.js";
import { check, role, roles } from "./helpers/failure.js";
import {
  atLocal,
  bookingPosts,
  drainTimers,
  fillValid,
  renderBooking,
  resultText,
  showQuote,
  submitForm,
} from "./helpers/render-booking.js";

const scripts = ["js/booking.js", "js/booking.min.js"];

afterEach(() => {
  drainTimers();
});

function totals(miles, roundTrip = false) {
  const one = Math.round(Math.max(70, miles * 2.75) * 100) / 100;
  const cash = roundTrip ? one * 2 : one;
  const card = Math.round(cash * 1.03 * 100) / 100;
  return { cash: cash.toFixed(2), card: card.toFixed(2) };
}

function quoteTotal(document) {
  return (
    document
      .querySelector(".quote-total")
      ?.textContent?.replace(/\s+/g, " ")
      .trim() || ""
  );
}

function quoteLabel(document) {
  return document.querySelector(".quote-label")?.textContent?.trim() || "";
}

describe("booking", () => {
  describe.each(scripts)("%s", (script) => {
    describe("quote", () => {
      it("charges at least $70 cash and 3% more on a card", async () => {
        const view = await renderBooking(script, { miles: 10 });
        await showQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          destination: "CLT",
        });
        check(quoteTotal(view.document), "Cash $70.00 · Card $72.10", {
          label: "10-mile CLT cash and card totals",
          source: SOURCE.quote,
          loaded: script,
        });
        check(
          quoteLabel(view.document),
          "One way to Charlotte Douglas Airport (CLT)",
          {
            label: "CLT quote label",
            source: SOURCE.airport,
            loaded: script,
          },
        );
        check(
          /2\.75|per[\s-]?mile|\$\s*\/\s*mi/i.test(
            view.document.querySelector("#quote-details").textContent,
          ),
          false,
          {
            label: "quote shows a per-mile rate",
            source: SOURCE.quote,
            loaded: script,
          },
        );
      });

      it("uses miles times 2.75 once the trip is past the $70 minimum", async () => {
        const view = await renderBooking(script, { miles: 40 });
        await showQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          destination: "Charlotte Douglas",
        });
        check(
          quoteTotal(view.document),
          `Cash $${totals(40).cash} · Card $${totals(40).card}`,
          {
            label: "40-mile cash and card totals",
            source: SOURCE.quote,
            loaded: script,
          },
        );
        check(
          totals(40),
          { cash: "110.00", card: "113.30" },
          {
            label: "40-mile fare rule",
            source: SOURCE.quote,
            loaded: script,
          },
        );
      });

      it("rounds the card total to the nearest cent", async () => {
        const view = await renderBooking(script, { miles: 30 });
        await showQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          destination: "CLT",
        });
        check(quoteTotal(view.document), "Cash $82.50 · Card $84.98", {
          label: "30-mile card rounding",
          source: SOURCE.quote,
          loaded: script,
        });
      });

      it("keeps the $70 minimum on a very short trip", async () => {
        const view = await renderBooking(script, { miles: 1 });
        await showQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          destination: "airport",
        });
        check(quoteTotal(view.document), "Cash $70.00 · Card $72.10", {
          label: "minimum fare",
          source: SOURCE.quote,
          loaded: script,
        });
      });

      it("doubles the cash total for a round trip before the card fee", async () => {
        const view = await renderBooking(script, { miles: 10 });
        await showQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          destination: "CLT",
          roundTrip: true,
        });
        check(quoteTotal(view.document), "Cash $140.00 · Card $144.20", {
          label: "round trip doubles cash",
          source: SOURCE.quote,
          loaded: script,
        });
        check(/round trip/i.test(quoteLabel(view.document)), true, {
          label: "round trip label",
          source: SOURCE.quote,
          loaded: script,
        });
      });

      it.each([
        ["airport", "Charlotte Douglas Airport (CLT)"],
        ["the airport", "Charlotte Douglas Airport (CLT)"],
        ["Concord Regional", "Concord Regional Airport"],
        ["JQF", "Concord Regional Airport"],
      ])("prices %s as %s", async (destination, label) => {
        const view = await renderBooking(script, { miles: 40 });
        await showQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          destination,
        });
        check(quoteLabel(view.document), `One way to ${label}`, {
          label: `airport name for ${destination}`,
          source: SOURCE.airport,
          loaded: script,
        });
        check(quoteTotal(view.document).includes("Cash $110.00"), true, {
          label: `priced ${destination}`,
          source: SOURCE.quote,
          loaded: script,
        });
      });

      it.each([
        "Airport Road, Denver NC",
        "Concord Mills",
        "RDU Airport",
        "not CLT",
        "CLT and Concord Regional",
      ])("shows no price for lookalike destination %s", async (destination) => {
        const view = await renderBooking(script, { miles: 40 });
        const text = await showQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          destination,
        });
        check(text, "We'll confirm your price when we call.", {
          label: `no price for ${destination}`,
          source: SOURCE.airport,
          loaded: script,
        });
        check(text.includes("$"), false, {
          label: `dollar amount for ${destination}`,
          source: SOURCE.quote,
          loaded: script,
        });
      });

      it("refuses Charlotte Motor Speedway instead of pricing it", async () => {
        const view = await renderBooking(script, { miles: 40 });
        const text = await showQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          destination: "Charlotte Motor Speedway",
        });
        check(text, "Sorry, we don't service that area.", {
          label: "Charlotte Motor Speedway is outside the service area",
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(text.includes("$"), false, {
          label: "Charlotte Motor Speedway shows no fare",
          source: SOURCE.quote,
          loaded: script,
        });
      });

      it("shows no price when the pickup is an excluded town", async () => {
        const view = await renderBooking(script, { miles: 40 });
        const text = await showQuote(view, {
          pickup: "100 Main St, Mooresville NC 28115",
          destination: "CLT",
        });
        check(text, "Sorry, we don't service that area.", {
          label: "excluded town quote",
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(text.includes("$"), false, {
          label: "excluded town quote has no fare",
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(/call|980|422-9125/i.test(text), false, {
          label: "excluded town quote does not ask for a call",
          source: SOURCE.serviceArea,
          loaded: script,
        });
      });
    });

    describe("excluded towns", () => {
      const towns = [
        "Mooresville",
        "Davidson",
        "Huntersville",
        "Cornelius",
        "Troutman",
        "Statesville",
      ];
      const zips = [
        ["28115", "Mooresville"],
        ["28117", "Mooresville"],
        ["28035", "Davidson"],
        ["28036", "Davidson"],
        ["28070", "Huntersville"],
        ["28078", "Huntersville"],
        ["28031", "Cornelius"],
        ["28166", "Troutman"],
        ["28625", "Statesville"],
        ["28677", "Statesville"],
        ["28687", "Statesville"],
      ];

      it.each(towns)("refuses a pickup in %s", async (town) => {
        const view = await renderBooking(script);
        await fillValid(view, { pickup: `100 Main St, ${town} NC` });
        await submitForm(view);
        check(resultText(view.document), "Sorry, we don't service that area.", {
          label: `refuse ${town}`,
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(/call|980|422-9125/i.test(resultText(view.document)), false, {
          label: `${town} refusal does not ask for a call`,
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(bookingPosts(view.state).length, 0, {
          label: `${town} sends no booking`,
          source: SOURCE.excluded,
          loaded: script,
        });
      });

      it.each(zips)("refuses a pickup in ZIP %s (%s)", async (zip, town) => {
        const view = await renderBooking(script);
        await fillValid(view, { pickup: `100 Main St ${zip}` });
        await submitForm(view);
        check(resultText(view.document), "Sorry, we don't service that area.", {
          label: `refuse ZIP ${zip}`,
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(bookingPosts(view.state).length, 0, {
          label: `ZIP ${zip} sends no booking`,
          source: SOURCE.excluded,
          loaded: script,
        });
      });

      it("refuses an excluded destination", async () => {
        const view = await renderBooking(script);
        await fillValid(view, {
          destination: "200 Center St, Statesville NC 28625",
        });
        await submitForm(view);
        check(resultText(view.document), "Sorry, we don't service that area.", {
          label: "refuse Statesville destination",
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(bookingPosts(view.state).length, 0, {
          label: "excluded destination sends no booking",
          source: SOURCE.excluded,
          loaded: script,
        });
      });
    });

    describe("service area", () => {
      const outside = "Sorry, we don't service that area.";
      const unclear =
        "Please include the town and state, for example Denver, NC.";

      function refusal(view, label) {
        check(resultText(view.document), outside, {
          label,
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(/call|980|422-9125/i.test(resultText(view.document)), false, {
          label: `${label} does not ask for a call`,
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(bookingPosts(view.state).length, 0, {
          label: `${label} sends no booking`,
          source: SOURCE.serviceArea,
          loaded: script,
        });
      }

      it("rejects a Charlotte pickup with the exact message", async () => {
        const view = await renderBooking(script);
        await fillValid(view, {
          name: "TEST, DO NOT BOOK",
          pickup: "8109 pike road charlotte",
          destination: "Suya king restaurant",
          airport: "No",
        });
        await submitForm(view);
        refusal(view, "Charlotte pickup");
      });

      it("rejects a Charlotte pickup going to CLT", async () => {
        const view = await renderBooking(script);
        await fillValid(view, {
          name: "TEST, DO NOT BOOK",
          pickup: "8109 Pike Rd, Charlotte NC 28262",
          destination: "CLT",
        });
        await submitForm(view);
        refusal(view, "Charlotte to CLT");
      });

      it("rejects Mooresville", async () => {
        const view = await renderBooking(script);
        await fillValid(view, {
          name: "TEST, DO NOT BOOK",
          pickup: "100 Main St, Mooresville NC",
          destination: "CLT",
        });
        await submitForm(view);
        refusal(view, "Mooresville pickup");
      });

      it("accepts a Denver NC pickup to CLT", async () => {
        const view = await renderBooking(script, { miles: 10 });
        await fillValid(view, {
          name: "TEST, DO NOT BOOK",
          pickup: "123 Main Street, Denver NC 28037",
          destination: "CLT",
        });
        await submitForm(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "Denver NC to CLT is accepted",
          expected: "Request received",
          actual: resultText(view.document),
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(resultText(view.document).includes("TEST, DO NOT BOOK"), true, {
          label: "accepted request uses the test name",
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(bookingPosts(view.state).length > 0, true, {
          label: "Denver NC to CLT sends a mocked request",
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(
          view.state.requests.every((request) => request.mocked),
          true,
          {
            label: "Denver NC to CLT never leaves the test",
            source: SOURCE.serviceArea,
            loaded: script,
          },
        );
      });

      it("accepts a CLT pickup with a Sherrills Ford drop-off", async () => {
        const view = await renderBooking(script);
        await fillValid(view, {
          name: "TEST, DO NOT BOOK",
          pickup: "Charlotte Douglas Airport (CLT)",
          destination: "100 Lake Shore Drive, Sherrills Ford NC 28673",
        });
        await submitForm(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "CLT to Sherrills Ford is accepted",
          expected: "Request received",
          actual: resultText(view.document),
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(bookingPosts(view.state).length > 0, true, {
          label: "CLT to Sherrills Ford sends a mocked request",
          source: SOURCE.serviceArea,
          loaded: script,
        });
      });

      it("accepts a ride between two served towns", async () => {
        const view = await renderBooking(script);
        await fillValid(view, {
          name: "TEST, DO NOT BOOK",
          pickup: "123 Main Street, Denver NC 28037",
          destination: "50 School Street, Sherrills Ford NC 28673",
          airport: "No",
        });
        await submitForm(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "Denver to Sherrills Ford is accepted",
          source: SOURCE.serviceArea,
          loaded: script,
        });
      });

      it("rejects a served pickup when the other end is Charlotte", async () => {
        const view = await renderBooking(script);
        await fillValid(view, {
          name: "TEST, DO NOT BOOK",
          pickup: "123 Main Street, Denver NC 28037",
          destination: "100 Trade Street, Charlotte NC",
          airport: "No",
        });
        await submitForm(view);
        refusal(view, "Denver to Charlotte");
      });

      it("asks for the town when the place cannot be resolved", async () => {
        const view = await renderBooking(script, { censusMode: "miss" });
        await fillValid(view, {
          name: "TEST, DO NOT BOOK",
          pickup: "100 Main Street",
          destination: "200 Second Street",
          airport: "No",
        });
        await submitForm(view);
        check(resultText(view.document), unclear, {
          label: "missing town asks for the town and state",
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(/call|980|422-9125/i.test(resultText(view.document)), false, {
          label: "missing town does not ask for a call",
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(bookingPosts(view.state).length, 0, {
          label: "missing town sends no booking",
          source: SOURCE.serviceArea,
          loaded: script,
        });
      });

      it("rejects a street with no town when geocoding returns Charlotte", async () => {
        const view = await renderBooking(script, {
          censusCity: "Charlotte",
          censusState: "NC",
          censusZip: "28262",
        });
        await fillValid(view, {
          name: "TEST, DO NOT BOOK",
          pickup: "8109 Pike Road",
          destination: "CLT",
        });
        await submitForm(view);
        refusal(view, "geocoded Charlotte");
      });

      it("rejects Denver when the state is Colorado", async () => {
        const view = await renderBooking(script);
        await fillValid(view, {
          name: "TEST, DO NOT BOOK",
          pickup: "123 Main Street, Denver CO 80202",
          destination: "CLT",
        });
        await submitForm(view);
        refusal(view, "Denver CO");
      });

      it("uses the geocoder to tell Denver NC from Denver with no state", async () => {
        const confirmed = await renderBooking(script, {
          censusCity: "Denver",
          censusState: "NC",
          censusZip: "28037",
        });
        await fillValid(confirmed, {
          name: "TEST, DO NOT BOOK",
          pickup: "123 Main Street, Denver",
          destination: "CLT",
        });
        await submitForm(confirmed);
        check(
          resultText(confirmed.document).includes("Request received"),
          true,
          {
            label: "geocoded Denver NC is accepted",
            source: SOURCE.serviceArea,
            loaded: script,
          },
        );

        const colorado = await renderBooking(script, {
          censusCity: "Denver",
          censusState: "CO",
          censusZip: "80202",
        });
        await fillValid(colorado, {
          name: "TEST, DO NOT BOOK",
          pickup: "123 Main Street, Denver",
          destination: "CLT",
        });
        await submitForm(colorado);
        refusal(colorado, "geocoded Denver CO");
      });

      it("accepts a private airfield in Mooresville when the other end is Denver", async () => {
        const view = await renderBooking(script);
        await fillValid(view, {
          name: "TEST, DO NOT BOOK",
          pickup: "Lake Norman Airpark, Mooresville NC",
          destination: "123 Main Street, Denver NC 28037",
          airport: "Yes",
        });
        await submitForm(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "Lake Norman Airpark to Denver is accepted",
          source: SOURCE.serviceArea,
          loaded: script,
        });
      });

      it("rejects a Mooresville house on a street named Airpark", async () => {
        const view = await renderBooking(script);
        await fillValid(view, {
          name: "TEST, DO NOT BOOK",
          pickup: "123 Airpark Drive, Mooresville NC",
          destination: "CLT",
        });
        await submitForm(view);
        refusal(view, "Airpark Drive in Mooresville");
      });

      it("does not book when the service-area checker is missing", async () => {
        const view = await renderBooking(script);
        const saved = globalThis.MidnightServiceArea;
        delete globalThis.MidnightServiceArea;
        try {
          await fillValid(view, { name: "TEST, DO NOT BOOK" });
          await submitForm(view);
          check(resultText(view.document), unclear, {
            label: "missing checker does not book",
            source: SOURCE.serviceArea,
            loaded: script,
          });
          check(bookingPosts(view.state).length, 0, {
            label: "missing checker sends no booking",
            source: SOURCE.serviceArea,
            loaded: script,
          });
        } finally {
          globalThis.MidnightServiceArea = saved;
        }
      });
    });

    describe("passengers", () => {
      it("requires a passenger count", async () => {
        const view = await renderBooking(script);
        await fillValid(view, { passengers: "" });
        await submitForm(view);
        check(
          resultText(view.document).includes(
            "Please enter the number of passengers.",
          ),
          true,
          {
            label: "passenger count required",
            expected: "Please enter the number of passengers.",
            actual: resultText(view.document),
            source: SOURCE.passengerRequired,
            loaded: script,
          },
        );
        check(bookingPosts(view.state).length, 0, {
          label: "blank passengers sends no booking",
          source: SOURCE.passengerRequired,
          loaded: script,
        });
      });

      it("accepts five passengers with carry-on only", async () => {
        const view = await renderBooking(script);
        await fillValid(view, { passengers: "5" });
        await submitForm(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "five carry-on passengers can request a ride",
          expected: "Request received",
          actual: resultText(view.document),
          source: SOURCE.passengers,
          loaded: script,
        });
        check(bookingPosts(view.state).length > 0, true, {
          label: "five carry-on passengers send a mocked request",
          source: SOURCE.passengers,
          loaded: script,
        });
      });

      it("accepts four passengers with checked bags", async () => {
        const view = await renderBooking(script);
        await fillValid(view, { passengers: "4", bags: true });
        await submitForm(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "four passengers with bags can request a ride",
          source: SOURCE.passengers,
          loaded: script,
        });
      });

      it("tells the rider to call when six people need carry-on only", async () => {
        const view = await renderBooking(script);
        await fillValid(view, { passengers: "6" });
        await submitForm(view);
        check(
          resultText(view.document).includes(
            "For more than 5 passengers, please call (980) 422-9125.",
          ),
          true,
          {
            label: "six passengers must call",
            expected: "For more than 5 passengers, please call (980) 422-9125.",
            actual: resultText(view.document),
            source: SOURCE.passengers,
            loaded: script,
          },
        );
        check(bookingPosts(view.state).length, 0, {
          label: "six passengers send no booking",
          source: SOURCE.passengers,
          loaded: script,
        });
      });

      it("tells the rider to call when five people have checked bags", async () => {
        const view = await renderBooking(script);
        await fillValid(view, { passengers: "5", bags: true });
        await submitForm(view);
        check(
          resultText(view.document).includes(
            "For more than 4 passengers, please call (980) 422-9125.",
          ),
          true,
          {
            label: "five passengers with bags must call",
            expected: "For more than 4 passengers, please call (980) 422-9125.",
            actual: resultText(view.document),
            source: SOURCE.passengers,
            loaded: script,
          },
        );
        check(bookingPosts(view.state).length, 0, {
          label: "five with bags send no booking",
          source: SOURCE.passengers,
          loaded: script,
        });
      });
    });

    describe("group event", () => {
      it("shows the call-us message and blocks submit", async () => {
        const view = await renderBooking(script, { miles: 40 });
        await showQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          destination: "CLT",
        });
        const yesRadios = roles(
          view.document,
          "radio",
          { name: /^yes$/i },
          {
            label: "Group event Yes control",
            expected: "a Group event Yes radio",
            source: SOURCE.group,
            loaded: script,
          },
        );
        const yes = yesRadios.find((node) => node.name === "group-event");
        check(Boolean(yes), true, {
          label: "Group event Yes control",
          expected: "a Group event Yes radio",
          actual: yes ? "found" : "missing",
          source: SOURCE.group,
          loaded: script,
        });
        yes.checked = true;
        window.jQuery(yes).trigger("change");
        const status = role(
          view.document,
          "status",
          {},
          {
            label: "group event call message",
            expected: "Group events must be booked by phone",
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(
          /Group events must be booked by phone/.test(status.textContent),
          true,
          {
            label: "group event call copy",
            source: SOURCE.group,
            loaded: script,
          },
        );
        const link = role(
          status,
          "link",
          { name: "(980) 422-9125" },
          {
            label: "group event phone link",
            expected: "tel:+19804229125",
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(link.getAttribute("href"), "tel:+19804229125", {
          label: "group event telephone link",
          source: SOURCE.group,
          loaded: script,
        });
        check(
          view.document.querySelector("#booking-quote").style.display,
          "none",
          {
            label: "group event hides the quote",
            source: SOURCE.group,
            loaded: script,
          },
        );
        const submit = role(view.document, "button", {
          name: /request booking/i,
        });
        check(submit.disabled, true, {
          label: "group event disables submit",
          source: SOURCE.group,
          loaded: script,
        });
        window.jQuery("#bookingForm").trigger("submit");
        await new Promise((resolve) => setTimeout(resolve, 30));
        check(bookingPosts(view.state).length, 0, {
          label: "group event sends no request",
          source: SOURCE.group,
          loaded: script,
        });
      });
    });

    describe("availability", () => {
      const day = "2026-12-15";

      it("keeps a time open when only one driver is busy", async () => {
        const view = await renderBooking(script, {
          bookings: [{ datetime: atLocal(day, 10, 0) }],
        });
        await fillValid(view, { date: day, time: "10:00:00" });
        await submitForm(view);
        check(resultText(view.document).includes("not available"), false, {
          label: "one busy driver does not block the pickup",
          expected: "time accepted",
          actual: resultText(view.document),
          source: SOURCE.drivers,
          loaded: script,
        });
        check(resultText(view.document).includes("Request received"), true, {
          label: "one busy driver still accepts the request",
          source: SOURCE.conflict,
          loaded: script,
        });
      });

      it("blocks a time only when both drivers are busy", async () => {
        const view = await renderBooking(script, {
          bookings: [
            { datetime: atLocal(day, 10, 0) },
            { datetime: atLocal(day, 10, 0) },
          ],
        });
        await fillValid(view, { date: day, time: "10:00:00" });
        await submitForm(view);
        check(
          resultText(view.document).includes("This time slot is not available"),
          true,
          {
            label: "both drivers busy blocks the pickup",
            expected: "This time slot is not available",
            actual: resultText(view.document),
            source: SOURCE.conflict,
            loaded: script,
          },
        );
        check(bookingPosts(view.state).length, 0, {
          label: "blocked time sends no booking",
          source: SOURCE.conflict,
          loaded: script,
        });
      });

      it("frees the pickup exactly two hours later", async () => {
        const view = await renderBooking(script, {
          bookings: [
            { datetime: atLocal(day, 10, 0) },
            { datetime: atLocal(day, 10, 0) },
          ],
        });
        await fillValid(view, { date: day, time: "12:00:00" });
        await submitForm(view);
        check(resultText(view.document).includes("not available"), false, {
          label: "a ride blocks two hours, not the minute at two hours",
          expected: "time accepted",
          actual: resultText(view.document),
          source: SOURCE.overlap,
          loaded: script,
        });
      });

      it("blocks a pickup one minute inside the two-hour window when both drivers are busy", async () => {
        const view = await renderBooking(script, {
          bookings: [
            { datetime: atLocal(day, 10, 0) },
            { datetime: atLocal(day, 10, 30) },
          ],
        });
        await fillValid(view, { date: day, time: "11:00:00" });
        await submitForm(view);
        check(
          resultText(view.document).includes("This time slot is not available"),
          true,
          {
            label: "11:00 overlaps both the 10:00 and 10:30 rides",
            source: SOURCE.overlap,
            loaded: script,
          },
        );
      });
    });
  });
});
