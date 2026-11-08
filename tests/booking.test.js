import { afterEach, describe, it } from "vitest";
import { SOURCE } from "./helpers/source-line.js";
import { check, role, roles } from "./helpers/failure.js";
import {
  atLocal,
  bookingPosts,
  chooseTrip,
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

async function submitAnother(view) {
  const form = view.document.querySelector("#bookingForm");
  view.window.jQuery(form).show();
  const success = view.document.querySelector("#booking-success");
  success.innerHTML = "";
  view.window.jQuery(success).hide();
  await submitForm(view);
}

function quotedAddresses(view) {
  return view.state.requests
    .filter((request) => request.address)
    .map((request) => request.address);
}

function shown(element) {
  let node = element;
  while (node && node.nodeType === 1) {
    if (node.hidden) return false;
    if (node.style && node.style.display === "none") return false;
    node = node.parentElement;
  }
  return Boolean(element);
}

function visibleFormText(document) {
  const root = document.querySelector("#bookingForm");
  const parts = [];
  const walker = document.createTreeWalker(root, 4);
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent || "";
    if (!text.trim()) continue;
    if (!shown(walker.currentNode.parentElement)) continue;
    parts.push(text);
  }
  return parts.join(" ").replace(/\s+/g, " ");
}

function calendarPayload(view) {
  const post = bookingPosts(view.state).find((request) =>
    request.url.includes("script.google.com"),
  );
  return post && post.body ? JSON.parse(post.body) : null;
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

      it("prices each typed pickup from that address, not a saved one", async () => {
        const denver = "3738 NC-16, Denver, NC 28037";
        const maiden = "19 N Main Ave, Maiden, NC 28650";
        const view = await renderBooking(script, {
          places: {
            [denver]: {
              lat: 35.53,
              lon: -81.03,
              city: "Denver",
              state: "NC",
              zip: "28037",
              miles: 30,
            },
            [maiden]: {
              lat: 35.58,
              lon: -81.21,
              city: "Maiden",
              state: "NC",
              zip: "28650",
              miles: 40,
            },
          },
        });
        chooseTrip(view.document, "airport");
        check(
          view.document.querySelector("#quote-details").textContent,
          "Enter your home address and airport to see your price.",
          {
            label: "airport quote starts blank",
            source: SOURCE.quote,
            loaded: script,
          },
        );
        check(quoteTotal(view.document).includes("Cash"), false, {
          label: "blank form has no fare",
          source: SOURCE.quote,
          loaded: script,
        });
        await showQuote(view, { pickup: denver, destination: "CLT" });
        check(quoteTotal(view.document), "Cash $82.50 · Card $84.98", {
          label: "Denver pickup uses its own miles",
          source: SOURCE.quote,
          loaded: script,
        });
        await showQuote(view, { pickup: maiden, destination: "CLT" });
        check(quoteTotal(view.document), "Cash $110.00 · Card $113.30", {
          label: "Maiden pickup gets a different fare",
          source: SOURCE.quote,
          loaded: script,
        });
        const routes = view.state.requests
          .filter((request) => request.url.includes("router.project-osrm.org"))
          .map((request) => request.url);
        check(
          routes.some((url) => url.includes("-81.03,35.53")),
          true,
          {
            label: "Denver quote asks for Denver's coordinates",
            actual: routes,
            source: SOURCE.quote,
            loaded: script,
          },
        );
        check(
          routes.some((url) => url.includes("-81.21,35.58")),
          true,
          {
            label: "Maiden quote asks for Maiden's coordinates",
            actual: routes,
            source: SOURCE.quote,
            loaded: script,
          },
        );
        check(quotedAddresses(view).includes(denver), true, {
          label: "geocoder receives the Denver text the customer typed",
          actual: quotedAddresses(view),
          source: SOURCE.quote,
          loaded: script,
        });
        check(quotedAddresses(view).includes(maiden), true, {
          label: "geocoder receives the Maiden text the customer typed",
          actual: quotedAddresses(view),
          source: SOURCE.quote,
          loaded: script,
        });
        view.window.jQuery("#booking-pickup").val("12").trigger("blur");
        check(
          view.document.querySelector("#quote-details").textContent,
          "Enter your home address and airport to see your price.",
          {
            label: "clearing the pickup drops the previous fare",
            source: SOURCE.quote,
            loaded: script,
          },
        );
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

      it("prices each known airfield from its own door", async () => {
        const view = await renderBooking(script, { miles: 12 });
        const airports = view.window.MidnightServiceArea.AIRPORTS;
        for (const airport of airports) {
          await showQuote(view, {
            pickup: "123 Main Street, Denver NC 28037",
            destination: airport.typed,
          });
          const routes = view.state.requests.filter((request) =>
            request.url.includes("router.project-osrm.org"),
          );
          const route = routes[routes.length - 1];
          check(route.url.includes(`${airport.lon},${airport.lat}`), true, {
            label: `${airport.id} quote uses its door`,
            actual: route.url,
            source: SOURCE.quote,
            loaded: script,
          });
          check(quoteLabel(view.document), `One way to ${airport.name}`, {
            label: `${airport.id} quote names the airfield`,
            actual: quoteLabel(view.document),
            source: SOURCE.quote,
            loaded: script,
          });
        }
      });

      it("confirms an other private airfield and still sends the request", async () => {
        const view = await renderBooking(script);
        view.document.querySelector("#airfield-choice").value = "other";
        await fillValid(view, {
          trip: "airport",
          destination: "Smith Field, Charlotte NC",
        });
        check(
          await showQuote(view, {
            pickup: "123 Main Street, Denver NC 28037",
            destination: "Smith Field, Charlotte NC",
          }),
          "We'll confirm your price when we call.",
          {
            label: "unknown private airfield has no computed price",
            source: SOURCE.quote,
            loaded: script,
          },
        );
        view.document.querySelector("#airfield-choice").value = "other";
        await submitForm(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "unknown private airfield is still booked",
          actual: resultText(view.document),
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(bookingPosts(view.state).length > 0, true, {
          label: "unknown private airfield is sent",
          source: SOURCE.serviceArea,
          loaded: script,
        });
      });

      it("keeps home address, airline airports, and private airfields separate", async () => {
        const view = await renderBooking(script);
        chooseTrip(view.document, "airport");
        const airline = view.document.querySelector("#airport-choice");
        const airfield = view.document.querySelector("#airfield-choice");
        const destination = view.document.querySelector("#booking-destination");
        const tripSelect = view.document.querySelector("#trip-type");
        check(
          view.document.querySelector("#address-label").textContent.trim(),
          "Home address *",
          {
            label: "airport trip asks for the home address",
            source: SOURCE.airport,
            loaded: script,
          },
        );
        check(
          view.document
            .querySelector("#airport-choice-row label")
            .textContent.trim(),
          "Airport",
          {
            label: "airline menu is its own field",
            source: SOURCE.airport,
            loaded: script,
          },
        );
        check(
          view.document
            .querySelector("#airfield-choice-row label")
            .textContent.trim(),
          "Private airfield",
          {
            label: "private airfield menu is its own field",
            source: SOURCE.airport,
            loaded: script,
          },
        );
        check(airline.className, tripSelect.className, {
          label: "airline menu uses the trip type drop-down style",
          actual: airline.className,
          source: SOURCE.airport,
          loaded: script,
        });
        check(airfield.className, tripSelect.className, {
          label: "private airfield menu uses the trip type drop-down style",
          actual: airfield.className,
          source: SOURCE.airport,
          loaded: script,
        });
        check(
          view.document.querySelector("#trip-type-group").nextElementSibling.id,
          "airfield-choice-row",
          {
            label: "private airfield menu sits under the trip type",
            source: SOURCE.airport,
            loaded: script,
          },
        );
        check(airfield.closest("#a-places"), null, {
          label: "private airfield menu is not in the address row",
          source: SOURCE.airport,
          loaded: script,
        });
        check(airline.closest("#a-places") != null, true, {
          label: "airline menu sits with the home address",
          source: SOURCE.airport,
          loaded: script,
        });
        check(airline.closest("#address-group"), null, {
          label: "home address and airport stay separate controls",
          source: SOURCE.airport,
          loaded: script,
        });
        check(shown(airline) && shown(airfield), true, {
          label: "both menus are visible",
          source: SOURCE.airport,
          loaded: script,
        });
        check(shown(destination), false, {
          label: "destination box stays hidden until Other",
          source: SOURCE.airport,
          loaded: script,
        });
        check(
          [...airline.options].map((option) => option.textContent),
          [
            "Select an airport",
            "CLT main terminal",
            "Concord passenger terminal",
          ],
          {
            label: "airline menu lists only passenger terminals",
            source: SOURCE.airport,
            loaded: script,
          },
        );
        check(
          [...airfield.options].map((option) => option.textContent),
          [
            "Select a private airfield",
            "Charlotte private (Wilson/Signature)",
            "Concord private FBO",
            "Lincolnton KIPJ",
            "Salisbury KRUQ",
            "Hickory KHKY",
            "Little Mountain (Airport Rd, Maiden)",
            "Other private airfield",
          ],
          {
            label: "private airfield menu lists the fields",
            source: SOURCE.airport,
            loaded: script,
          },
        );
        airline.value = "CLT";
        view.window.jQuery(airline).trigger("change");
        airfield.value = "KHKY";
        view.window.jQuery(airfield).trigger("change");
        check(airline.value, "", {
          label: "choosing a private airfield clears the airline menu",
          actual: airline.value,
          source: SOURCE.airport,
          loaded: script,
        });
        check(destination.value, "KHKY", {
          label: "the private airfield fills the destination",
          source: SOURCE.airport,
          loaded: script,
        });
        airline.value = "JQF-PAX";
        view.window.jQuery(airline).trigger("change");
        check(airfield.value, "", {
          label: "choosing an airline airport clears the private airfield",
          actual: airfield.value,
          source: SOURCE.airport,
          loaded: script,
        });
        check(destination.value, "Allegiant", {
          label: "the airline airport fills the destination",
          source: SOURCE.airport,
          loaded: script,
        });
        check(shown(destination), false, {
          label: "a listed choice keeps the text box hidden",
          source: SOURCE.airport,
          loaded: script,
        });
        airfield.value = "other";
        view.window.jQuery(airfield).trigger("change");
        check(airline.value, "", {
          label: "Other private airfield clears the airline menu",
          actual: airline.value,
          source: SOURCE.airport,
          loaded: script,
        });
        check(shown(destination), true, {
          label: "Other private airfield reveals the text box",
          source: SOURCE.airport,
          loaded: script,
        });
        check(
          destination.getAttribute("placeholder"),
          "Name the private airfield",
          {
            label: "Other private airfield asks for the field name",
            source: SOURCE.airport,
            loaded: script,
          },
        );
        chooseTrip(view.document, "group");
        check(
          view.document.querySelector("#address-label").textContent.trim(),
          "Pickup Address *",
          {
            label: "group form still asks for a pickup address",
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(shown(airline), false, {
          label: "group form hides the airline menu",
          source: SOURCE.group,
          loaded: script,
        });
        check(shown(airfield), false, {
          label: "group form hides the private airfield menu",
          source: SOURCE.group,
          loaded: script,
        });
        check(shown(destination), true, {
          label: "group form keeps the typed drop-off",
          source: SOURCE.group,
          loaded: script,
        });
      });

      it("refuses an airport trip until one menu is chosen", async () => {
        const view = await renderBooking(script);
        await fillValid(view, { trip: "airport" });
        view.document.querySelector("#airport-choice").value = "";
        view.document.querySelector("#airfield-choice").value = "";
        await submitForm(view);
        check(
          resultText(view.document).includes(
            "Please choose an airport or a private airfield",
          ),
          true,
          {
            label: "submit requires an airline airport or a private airfield",
            actual: resultText(view.document),
            source: SOURCE.airport,
            loaded: script,
          },
        );
        check(resultText(view.document).includes("Request received"), false, {
          label: "a filled destination alone does not book",
          actual: resultText(view.document),
          source: SOURCE.airport,
          loaded: script,
        });
      });

      it("sends the home address and airport on the calendar, including a return", async () => {
        const view = await renderBooking(script, { miles: 12 });
        await fillValid(view, {
          trip: "airport",
          pickup: "123 Main Street, Denver NC 28037",
          roundTrip: true,
          returnDate: "2026-12-16",
          returnTime: "15:00:00",
        });
        const choice = view.document.querySelector("#airport-choice");
        choice.value = "CLT";
        view.window.jQuery(choice).trigger("change");
        await submitForm(view);
        const payload = calendarPayload(view);
        check(payload.pickupAddress, "123 Main Street, Denver NC 28037", {
          label: "calendar pickup is the home address",
          actual: payload.pickupAddress,
          source: SOURCE.airport,
          loaded: script,
        });
        check(payload.destinationAddress, "CLT", {
          label: "calendar destination is the airport",
          actual: payload.destinationAddress,
          source: SOURCE.airport,
          loaded: script,
        });
        check(payload.airportTrip, "Yes", {
          label: "calendar post is an airport trip",
          actual: payload.airportTrip,
          source: SOURCE.airport,
          loaded: script,
        });
        check(payload.roundTrip, "Yes", {
          label: "return trip is still marked on the calendar post",
          actual: payload.roundTrip,
          source: SOURCE.airport,
          loaded: script,
        });
        check(payload.returnDate, "2026-12-16", {
          label: "return date is still sent",
          actual: payload.returnDate,
          source: SOURCE.airport,
          loaded: script,
        });
        check(payload.returnTime, "15:00:00", {
          label: "return time is still sent",
          actual: payload.returnTime,
          source: SOURCE.airport,
          loaded: script,
        });
        const alert = resultText(view.document);
        check(alert.includes("Outbound"), true, {
          label: "confirmation names the outbound leg",
          actual: alert,
          source: SOURCE.airport,
          loaded: script,
        });
        check(alert.includes("Return"), true, {
          label: "confirmation names the return leg",
          actual: alert,
          source: SOURCE.airport,
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
      it("starts with no trip selected and no schedule bar", async () => {
        const view = await renderBooking(script);
        const select = view.document.querySelector("#trip-type");
        check(select.value, "", {
          label: "trip type starts on Select",
          source: SOURCE.group,
          loaded: script,
        });
        check(view.document.querySelector("#timeline-container"), null, {
          label: "schedule bar is not on the page",
          source: SOURCE.group,
          loaded: script,
        });
        check(
          view.document.body.textContent.includes(
            "Group events must be booked by phone",
          ),
          false,
          {
            label: "group events are not phone-only",
            source: SOURCE.group,
            loaded: script,
          },
        );
      });

      it("hides the airport fare when Group is chosen", async () => {
        const view = await renderBooking(script, { miles: 40 });
        await showQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          destination: "CLT",
        });
        check(quoteTotal(view.document).includes("Cash"), true, {
          label: "airport quote is visible before switching",
          source: SOURCE.quote,
          loaded: script,
        });
        view.document.querySelector("#trip-type").value = "group";
        window.jQuery("#trip-type").trigger("change");
        const quote = view.document.querySelector("#booking-quote");
        check(
          quote.hidden ||
            quote.style.display === "none" ||
            quote.offsetParent === null,
          true,
          {
            label: "group event hides the quote",
            actual: quote.style.display,
            source: SOURCE.group,
            loaded: script,
          },
        );
        const formText = visibleFormText(view.document);
        check(/\$\d|price|pricing|fare|\bcost\b/i.test(formText), false, {
          label: "group form shows no price or cost wording",
          actual: formText,
          source: SOURCE.group,
          loaded: script,
        });
        check(view.document.querySelector("#group-pricing-note"), null, {
          label: "call for pricing line is gone",
          source: SOURCE.group,
          loaded: script,
        });
        check(shown(view.document.querySelector("#booking-name")), true, {
          label: "group form asks for a name",
          source: SOURCE.group,
          loaded: script,
        });
        check(shown(view.document.querySelector("#booking-phone")), true, {
          label: "group form asks for a phone",
          source: SOURCE.group,
          loaded: script,
        });
        check(shown(view.document.querySelector("#booking-email")), true, {
          label: "group form asks for an email",
          source: SOURCE.group,
          loaded: script,
        });
        check(shown(view.document.querySelector("#booking-pickup")), true, {
          label: "group form asks for a pickup address",
          source: SOURCE.group,
          loaded: script,
        });
        check(
          shown(view.document.querySelector("#booking-destination")),
          true,
          {
            label: "group form asks for a drop-off",
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(
          view.document.querySelector("#destination-label")?.textContent.trim(),
          "Drop-off / venue *",
          {
            label: "drop-off is labeled as the venue",
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(shown(view.document.querySelector("#booking-date")), true, {
          label: "group form asks for a date",
          source: SOURCE.group,
          loaded: script,
        });
        check(shown(view.document.querySelector("#booking-time")), true, {
          label: "group form asks for a pickup time",
          source: SOURCE.group,
          loaded: script,
        });
        check(shown(view.document.querySelector("#booking-passengers")), true, {
          label: "group form asks for passengers",
          source: SOURCE.group,
          loaded: script,
        });
        check(
          shown(view.document.querySelector("#booking-checking-bags")),
          true,
          {
            label: "group form asks about bags",
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(shown(view.document.querySelector("#booking-flight")), true, {
          label: "group form asks for an optional flight number",
          source: SOURCE.group,
          loaded: script,
        });
        check(shown(view.document.querySelector("#booking-round-trip")), true, {
          label: "group form asks about a return trip",
          source: SOURCE.group,
          loaded: script,
        });
        check(shown(view.document.querySelector("#booking-notes")), true, {
          label: "group form asks for notes",
          source: SOURCE.group,
          loaded: script,
        });
      });

      it("opens the group form from the home page link", async () => {
        const view = await renderBooking(script, {
          url: "/?type=group#booking",
        });
        const link = view.document.querySelector("#book-group-ride");
        check(link?.textContent.trim(), "Book a Group Ride", {
          label: "home page has Book a Group Ride",
          actual: link?.textContent,
          source: SOURCE.group,
          loaded: script,
        });
        check(link?.getAttribute("href"), "/?type=group#booking", {
          label: "group link opens the booking form with group selected",
          actual: link?.getAttribute("href"),
          source: SOURCE.group,
          loaded: script,
        });
        check(view.document.querySelector("#trip-type").value, "group", {
          label: "type=group preselects Group",
          source: SOURCE.group,
          loaded: script,
        });
        check(
          shown(view.document.querySelector("#booking-destination")),
          true,
          {
            label: "preselected group form is the booking form",
            source: SOURCE.group,
            loaded: script,
          },
        );
      });

      it("sends a group booking to the calendar as an unconfirmed group request", async () => {
        const view = await renderBooking(script);
        await fillValid(view, {
          trip: "group",
          passengers: "4",
          destination: "200 Oak St, Sherrills Ford NC",
          bags: true,
          flight: "AA1234",
          notes: "reunion",
          roundTrip: true,
          returnDate: "2026-12-16",
          returnTime: "15:00:00",
          time: "10:00:00",
        });
        await submitForm(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "group booking is accepted",
          actual: resultText(view.document),
          source: SOURCE.group,
          loaded: script,
        });
        check(/\$\d|price|fare/i.test(resultText(view.document)), false, {
          label: "group confirmation has no price",
          source: SOURCE.group,
          loaded: script,
        });
        const payload = calendarPayload(view);
        check(Boolean(payload), true, {
          label: "group booking posts to the calendar script",
          actual: payload,
          source: SOURCE.group,
          loaded: script,
        });
        check(payload.groupEvent, "Yes", {
          label: "calendar post is labeled as a group event",
          actual: payload.groupEvent,
          source: SOURCE.group,
          loaded: script,
        });
        check(String(payload.specialNotes).includes("Group event"), true, {
          label: "calendar notes say it is a group event",
          actual: payload.specialNotes,
          source: SOURCE.group,
          loaded: script,
        });
        check(payload.pickupAddress, "123 Main Street, Denver NC 28037", {
          label: "group pickup is the address the customer typed",
          actual: payload.pickupAddress,
          source: SOURCE.group,
          loaded: script,
        });
        check(payload.destinationAddress, "200 Oak St, Sherrills Ford NC", {
          label: "group drop-off is the venue",
          actual: payload.destinationAddress,
          source: SOURCE.group,
          loaded: script,
        });
        check(payload.checkingBags, "Yes", {
          label: "group bags are sent",
          actual: payload.checkingBags,
          source: SOURCE.group,
          loaded: script,
        });
        check(payload.flightNumber, "AA1234", {
          label: "group flight number is sent",
          actual: payload.flightNumber,
          source: SOURCE.group,
          loaded: script,
        });
        check(payload.roundTrip, "Yes", {
          label: "group return trip is sent",
          actual: payload.roundTrip,
          source: SOURCE.group,
          loaded: script,
        });
        check(payload.returnTime, "15:00:00", {
          label: "group return time is sent",
          actual: payload.returnTime,
          source: SOURCE.group,
          loaded: script,
        });
        check(String(payload.specialNotes).includes("reunion"), true, {
          label: "group notes are sent",
          actual: payload.specialNotes,
          source: SOURCE.group,
          loaded: script,
        });
      });

      it("asks a group larger than six to call", async () => {
        const view = await renderBooking(script);
        await fillValid(view, { trip: "group", passengers: "7" });
        await submitForm(view);
        check(
          resultText(view.document).includes(
            "Please call (980) 422-9125 to book a group that size.",
          ),
          true,
          {
            label: "seven people must call",
            actual: resultText(view.document),
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(bookingPosts(view.state).length, 0, {
          label: "oversized group sends no request",
          source: SOURCE.group,
          loaded: script,
        });
      });

      it("sends a group of six with the requested hours and no fare", async () => {
        const view = await renderBooking(script);
        await fillValid(view, {
          trip: "group",
          passengers: "6",
          hours: "4",
          time: "06:30:00",
        });
        await submitForm(view);
        const text = resultText(view.document);
        check(text.includes("Request received"), true, {
          label: "group of six is accepted",
          actual: text,
          source: SOURCE.group,
          loaded: script,
        });
        check(text.includes("6:30 AM"), true, {
          label: "confirmation time is 6:30 AM",
          actual: text,
          source: SOURCE.group,
          loaded: script,
        });
        check(text.includes("06:30:00"), false, {
          label: "confirmation does not show seconds",
          actual: text,
          source: SOURCE.group,
          loaded: script,
        });
        check(/\$\d/.test(text), false, {
          label: "confirmation has no price",
          source: SOURCE.group,
          loaded: script,
        });
        const posts = bookingPosts(view.state);
        check(posts.length > 0, true, {
          label: "group request is sent",
          actual: posts.length,
          source: SOURCE.group,
          loaded: script,
        });
      });
    });

    describe("clock", () => {
      it("shows 12-hour times with AM and PM", async () => {
        const view = await renderBooking(script);
        const fmt = view.window.MidnightBooking.formatDisplayTime;
        check(fmt("00:00:00"), "12:00 AM", {
          label: "midnight",
          source: SOURCE.group,
          loaded: script,
        });
        check(fmt("00:05"), "12:05 AM", {
          label: "after midnight",
          source: SOURCE.group,
          loaded: script,
        });
        check(fmt("06:30:00"), "6:30 AM", {
          label: "morning",
          source: SOURCE.group,
          loaded: script,
        });
        check(fmt("12:00"), "12:00 PM", {
          label: "noon",
          source: SOURCE.group,
          loaded: script,
        });
        check(fmt("15:09:00"), "3:09 PM", {
          label: "afternoon",
          source: SOURCE.group,
          loaded: script,
        });
        check(fmt("23:59"), "11:59 PM", {
          label: "late night",
          source: SOURCE.group,
          loaded: script,
        });
        check(fmt(""), "", {
          label: "blank time",
          source: SOURCE.group,
          loaded: script,
        });
        check(fmt("99:99"), "", {
          label: "impossible time",
          source: SOURCE.group,
          loaded: script,
        });
        check(fmt(null), "", {
          label: "missing time",
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
        check(resultText(view.document).includes("That time is booked"), true, {
          label: "both drivers busy blocks the pickup",
          expected: "That time is booked",
          actual: resultText(view.document),
          source: SOURCE.conflict,
          loaded: script,
        });
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
        check(resultText(view.document).includes("That time is booked"), true, {
          label: "11:00 overlaps both the 10:00 and 10:30 rides",
          source: SOURCE.overlap,
          loaded: script,
        });
      });

      it("accepts two rides at the same time and refuses the third", async () => {
        const view = await renderBooking(script);
        await fillValid(view, { date: day, time: "10:00:00" });
        await submitForm(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "first ride at 10:00 is accepted",
          actual: resultText(view.document),
          source: SOURCE.drivers,
          loaded: script,
        });
        const afterFirst = bookingPosts(view.state).length;
        check(afterFirst > 0, true, {
          label: "first ride is sent",
          actual: afterFirst,
          source: SOURCE.drivers,
          loaded: script,
        });
        await submitAnother(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "second ride at the same time is accepted",
          actual: resultText(view.document),
          source: SOURCE.drivers,
          loaded: script,
        });
        const afterSecond = bookingPosts(view.state).length;
        check(afterSecond > afterFirst, true, {
          label: "second ride is sent",
          actual: afterSecond,
          source: SOURCE.drivers,
          loaded: script,
        });
        await submitAnother(view);
        check(resultText(view.document).includes("That time is booked"), true, {
          label: "third ride at the same time is refused",
          expected: "That time is booked",
          actual: resultText(view.document),
          source: SOURCE.conflict,
          loaded: script,
        });
        check(bookingPosts(view.state).length, afterSecond, {
          label: "third ride sends nothing",
          source: SOURCE.conflict,
          loaded: script,
        });
      });

      it("accepts two group events at the same start and refuses the third", async () => {
        const view = await renderBooking(script);
        await fillValid(view, {
          trip: "group",
          date: day,
          time: "10:00:00",
          hours: "4",
        });
        await submitForm(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "first group event is accepted",
          actual: resultText(view.document),
          source: SOURCE.group,
          loaded: script,
        });
        await submitAnother(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "second group event at the same start is accepted",
          actual: resultText(view.document),
          source: SOURCE.drivers,
          loaded: script,
        });
        const sent = bookingPosts(view.state).length;
        await submitAnother(view);
        check(resultText(view.document).includes("That time is booked"), true, {
          label: "third group event is refused",
          expected: "That time is booked",
          actual: resultText(view.document),
          source: SOURCE.conflict,
          loaded: script,
        });
        check(bookingPosts(view.state).length, sent, {
          label: "third group event sends nothing",
          source: SOURCE.conflict,
          loaded: script,
        });
      });

      it("refuses a pickup one minute before the two-hour mark when both drivers are busy", async () => {
        const view = await renderBooking(script, {
          bookings: [
            { datetime: atLocal(day, 10, 0) },
            { datetime: atLocal(day, 10, 0) },
          ],
        });
        await fillValid(view, { date: day, time: "11:59:00" });
        await submitForm(view);
        check(resultText(view.document).includes("That time is booked"), true, {
          label: "11:59 still overlaps two 10:00 rides",
          expected: "That time is booked",
          actual: resultText(view.document),
          source: SOURCE.overlap,
          loaded: script,
        });
        check(bookingPosts(view.state).length, 0, {
          label: "11:59 sends nothing",
          source: SOURCE.overlap,
          loaded: script,
        });
      });

      it("refuses 12:30 AM when both drivers are still out from 11:30 PM", async () => {
        const view = await renderBooking(script, {
          bookings: [
            { datetime: atLocal("2026-12-14", 23, 30) },
            { datetime: atLocal("2026-12-14", 23, 30) },
          ],
        });
        await fillValid(view, { date: day, time: "00:30:00" });
        await submitForm(view);
        check(resultText(view.document).includes("That time is booked"), true, {
          label: "a ride can stay busy across midnight",
          expected: "That time is booked",
          actual: resultText(view.document),
          source: SOURCE.overlap,
          loaded: script,
        });
        check(bookingPosts(view.state).length, 0, {
          label: "cross-midnight overlap sends nothing",
          source: SOURCE.overlap,
          loaded: script,
        });
      });

      it("accepts 12:30 AM when only one driver is still out from the night before", async () => {
        const view = await renderBooking(script, {
          bookings: [{ datetime: atLocal("2026-12-14", 23, 30) }],
        });
        await fillValid(view, { date: day, time: "00:30:00" });
        await submitForm(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "one overnight ride still leaves a driver",
          actual: resultText(view.document),
          source: SOURCE.drivers,
          loaded: script,
        });
      });

      it("accepts midnight when both evening rides ended on the dot", async () => {
        const view = await renderBooking(script, {
          bookings: [
            { datetime: atLocal("2026-12-14", 22, 0) },
            { datetime: atLocal("2026-12-14", 22, 0) },
          ],
        });
        await fillValid(view, { date: day, time: "00:00:00" });
        await submitForm(view);
        check(
          resultText(view.document).includes("That time is booked"),
          false,
          {
            label: "back-to-back across midnight is open",
            actual: resultText(view.document),
            source: SOURCE.overlap,
            loaded: script,
          },
        );
        check(resultText(view.document).includes("Request received"), true, {
          label: "midnight pickup is accepted",
          source: SOURCE.overlap,
          loaded: script,
        });
      });

      it("keeps a 4-hour group busy past the normal two-hour mark", async () => {
        const blocked = await renderBooking(script, {
          bookings: [
            { datetime: atLocal(day, 10, 0), durationMinutes: 240 },
            { datetime: atLocal(day, 10, 0), durationMinutes: 240 },
          ],
        });
        await fillValid(blocked, { date: day, time: "12:00:00" });
        await submitForm(blocked);
        check(
          resultText(blocked.document).includes("That time is booked"),
          true,
          {
            label:
              "noon still overlaps two 4-hour groups that started at 10:00",
            expected: "That time is booked",
            actual: resultText(blocked.document),
            source: SOURCE.overlap,
            loaded: script,
          },
        );
        const open = await renderBooking(script, {
          bookings: [
            { datetime: atLocal(day, 10, 0), durationMinutes: 240 },
            { datetime: atLocal(day, 10, 0), durationMinutes: 240 },
          ],
        });
        await fillValid(open, { date: day, time: "14:00:00" });
        await submitForm(open);
        check(resultText(open.document).includes("Request received"), true, {
          label: "2:00 PM is free once the 4-hour groups have ended",
          actual: resultText(open.document),
          source: SOURCE.overlap,
          loaded: script,
        });
        const oneGroup = await renderBooking(script, {
          bookings: [{ datetime: atLocal(day, 10, 0), durationMinutes: 240 }],
        });
        await fillValid(oneGroup, { date: day, time: "12:00:00" });
        await submitForm(oneGroup);
        check(
          resultText(oneGroup.document).includes("Request received"),
          true,
          {
            label: "one 4-hour group leaves the second driver free",
            actual: resultText(oneGroup.document),
            source: SOURCE.drivers,
            loaded: script,
          },
        );
      });

      it("accepts a same-day return that needs the second driver", async () => {
        const view = await renderBooking(script);
        await fillValid(view, {
          date: day,
          time: "10:00:00",
          roundTrip: true,
          returnDate: day,
          returnTime: "10:30:00",
        });
        await submitForm(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "a round trip may use both drivers",
          actual: resultText(view.document),
          source: SOURCE.drivers,
          loaded: script,
        });
      });

      it("refuses a same-day return that would need a third driver", async () => {
        const view = await renderBooking(script, {
          bookings: [{ datetime: atLocal(day, 10, 0) }],
        });
        await fillValid(view, {
          date: day,
          time: "10:00:00",
          roundTrip: true,
          returnDate: day,
          returnTime: "10:30:00",
        });
        await submitForm(view);
        check(
          resultText(view.document).includes(
            "Return flight time conflicts with outbound flight",
          ),
          true,
          {
            label: "return plus outbound plus one ride is three drivers",
            actual: resultText(view.document),
            source: SOURCE.conflict,
            loaded: script,
          },
        );
        check(bookingPosts(view.state).length, 0, {
          label: "overbooked round trip sends nothing",
          source: SOURCE.conflict,
          loaded: script,
        });
      });
    });
  });
});
