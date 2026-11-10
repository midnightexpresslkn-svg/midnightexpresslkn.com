import fs from "node:fs";
import { afterEach, describe, it } from "vitest";
import { hostnameOf } from "./helpers/hostname.js";
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
  showAirfieldQuote,
  showQuote,
  submitForm,
} from "./helpers/render-booking.js";

const scripts = ["js/booking.js", "js/booking.min.js"];

afterEach(() => {
  drainTimers();
});

function nearestFiveCents(cents) {
  const step = 500;
  let units = Math.floor(cents / step);
  if (cents % step > 250) units += 1;
  return units * step;
}

function totals(miles, roundTrip = false) {
  const oneCents = Math.round(Math.max(65, miles * 2.63) * 100);
  const cashCents = nearestFiveCents(roundTrip ? oneCents * 2 : oneCents);
  const cardCents = Math.round(cashCents * 1.03);
  return {
    cash: (cashCents / 100).toFixed(2),
    card: (cardCents / 100).toFixed(2),
  };
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
      it("charges at least $65 cash and 3% more on a card", async () => {
        const view = await renderBooking(script, { miles: 10 });
        await showQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          destination: "CLT",
        });
        check(quoteTotal(view.document), "Cash $65.00 · Card $66.95", {
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

      it("uses miles times 2.63 once the trip is past the $65 minimum", async () => {
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
          { cash: "105.00", card: "108.15" },
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
        check(quoteTotal(view.document), "Cash $80.00 · Card $82.40", {
          label: "30-mile card is 3 percent of cash to the cent",
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
        check(quoteTotal(view.document), "Cash $80.00 · Card $82.40", {
          label: "Denver pickup uses its own miles",
          source: SOURCE.quote,
          loaded: script,
        });
        await showQuote(view, { pickup: maiden, destination: "CLT" });
        check(quoteTotal(view.document), "Cash $105.00 · Card $108.15", {
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

      it("keeps the $65 minimum on a very short trip", async () => {
        const view = await renderBooking(script, { miles: 1 });
        await showQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          destination: "airport",
        });
        check(quoteTotal(view.document), "Cash $65.00 · Card $66.95", {
          label: "minimum fare",
          source: SOURCE.quote,
          loaded: script,
        });
      });

      it("gives no online price past 50 miles, the same limit as Ara", async () => {
        const at50 = await renderBooking(script, { miles: 50 });
        await showQuote(at50, {
          pickup: "123 Main Street, Denver NC 28037",
          destination: "CLT",
        });
        check(quoteTotal(at50.document), "Cash $130.00 · Card $133.90", {
          label: "exactly 50 miles still gets a price",
          source: SOURCE.quote,
          loaded: script,
        });
        for (const miles of [50.01, 55, 150]) {
          const view = await renderBooking(script, { miles });
          await showQuote(view, {
            pickup: "123 Main Street, Denver NC 28037",
            destination: "CLT",
          });
          check(
            view.document.querySelector("#quote-details").textContent,
            "For trips over 50 miles, please call (980) 422-9125 for your price.",
            {
              label: `${miles} miles shows no price and says to call`,
              source: SOURCE.quote,
              loaded: script,
            },
          );
          check(
            view.document
              .querySelector("#quote-details a")
              ?.getAttribute("href"),
            "tel:+19804229125",
            {
              label: `${miles} miles call link dials Donald`,
              source: SOURCE.quote,
              loaded: script,
            },
          );
        }
      });

      it("prices the shortest alternative route, not the fastest", async () => {
        const view = await renderBooking(script, {
          routesMiles: [32.7, 27.2],
        });
        await showQuote(view, {
          pickup: "2169 NC 73 Hwy, Iron Station NC",
          destination: "CLT",
        });
        const routes = view.state.requests.filter((request) =>
          request.url.includes("router.project-osrm.org"),
        );
        check(routes[routes.length - 1].url.includes("alternatives=3"), true, {
          label: "the route request asks for three alternatives",
          actual: routes[routes.length - 1].url,
          source: SOURCE.quote,
          loaded: script,
        });
        check(quoteTotal(view.document), "Cash $70.00 · Card $72.10", {
          label: "27.2 miles is used instead of the 32.7-mile fastest route",
          actual: quoteTotal(view.document),
          source: SOURCE.quote,
          loaded: script,
        });
      });

      it("adds exactly 3 percent when cash is $65 and when cash is $75", async () => {
        const minimum = await renderBooking(script, { miles: 10 });
        await showQuote(minimum, {
          pickup: "123 Main Street, Denver NC 28037",
          destination: "CLT",
        });
        check(quoteTotal(minimum.document), "Cash $65.00 · Card $66.95", {
          label: "a $65 cash fare is $66.95 on a card",
          source: SOURCE.quote,
          loaded: script,
        });
        const seventyFive = await renderBooking(script, { miles: 7251 / 263 });
        await showQuote(seventyFive, {
          pickup: "123 Main Street, Denver NC 28037",
          destination: "CLT",
        });
        check(quoteTotal(seventyFive.document), "Cash $75.00 · Card $77.25", {
          label: "a $75 cash fare is $77.25 on a card",
          source: SOURCE.quote,
          loaded: script,
        });
      });

      it("rounds cash to the nearest $5 and adds 3 percent on the card", async () => {
        const cases = [
          [7250 / 263, "Cash $70.00 · Card $72.10"],
          [7251 / 263, "Cash $75.00 · Card $77.25"],
          [7750 / 263, "Cash $75.00 · Card $77.25"],
          [7751 / 263, "Cash $80.00 · Card $82.40"],
          [8500 / 263, "Cash $85.00 · Card $87.55"],
        ];
        for (const [miles, expected] of cases) {
          const view = await renderBooking(script, { miles });
          await showQuote(view, {
            pickup: "123 Main Street, Denver NC 28037",
            destination: "CLT",
          });
          check(quoteTotal(view.document), expected, {
            label: `fare for ${miles} miles rounds to a whole $5`,
            actual: quoteTotal(view.document),
            source: SOURCE.quote,
            loaded: script,
          });
        }
      });

      it("doubles the cash total for a round trip before the card fee", async () => {
        const view = await renderBooking(script, { miles: 10 });
        await showQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          destination: "CLT",
          roundTrip: true,
        });
        check(quoteTotal(view.document), "Cash $130.00 · Card $133.90", {
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
        check(quoteTotal(view.document).includes("Cash $105.00"), true, {
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
          const routes = view.state.requests.filter(
            (request) => hostnameOf(request.url) === "router.project-osrm.org",
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

      it("keeps one airport menu at the start of the airport form", async () => {
        const view = await renderBooking(script);
        chooseTrip(view.document, "airport");
        const airline = view.document.querySelector("#airport-choice");
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
            label: "the single menu is labeled Airport",
            source: SOURCE.airport,
            loaded: script,
          },
        );
        check(view.document.querySelector("#airfield-choice"), null, {
          label: "there is no second airport menu",
          source: SOURCE.airport,
          loaded: script,
        });
        check(airline.className, tripSelect.className, {
          label: "airport menu uses the trip type drop-down style",
          actual: airline.className,
          source: SOURCE.airport,
          loaded: script,
        });
        check(
          view.document.querySelector("#trip-type-group").nextElementSibling.id,
          "airport-choice-row",
          {
            label: "airport menu sits under the trip type",
            source: SOURCE.airport,
            loaded: script,
          },
        );
        check(airline.closest("#address-group"), null, {
          label: "home address and airport stay separate controls",
          source: SOURCE.airport,
          loaded: script,
        });
        check(shown(airline), true, {
          label: "the airport menu is visible",
          source: SOURCE.airport,
          loaded: script,
        });
        check(shown(destination), false, {
          label: "the destination box stays hidden",
          source: SOURCE.airport,
          loaded: script,
        });
        check(
          [...airline.options].map((option) => option.textContent),
          [
            "Select an airport",
            "Charlotte Douglas International (CLT)",
            "Concord-Padgett Regional (JQF)",
            "Lincolnton (KIPJ)",
            "Charlotte private jets (Wilson/Signature, Modern Aviation)",
            "Concord private jets",
            "Charlotte-Monroe Executive (EQY)",
            "Wilgrove Air Park (8A6)",
            "Little Mountain (Airport Rd, Maiden)",
            "Private airfield",
          ],
          {
            label: "airport menu lists every field in order",
            source: SOURCE.airport,
            loaded: script,
          },
        );
        check(
          [...airline.options].map((option) => option.value),
          [
            "",
            "CLT",
            "JQF-PAX",
            "KIPJ",
            "CLT-PRIVATE",
            "JQF",
            "EQY",
            "8A6",
            "LITTLE-MOUNTAIN",
            "PRIVATE",
          ],
          {
            label: "airport menu keeps the existing option values",
            source: SOURCE.airport,
            loaded: script,
          },
        );
        airline.value = "KIPJ";
        view.window.jQuery(airline).trigger("change");
        check(destination.value, "KIPJ", {
          label: "the chosen airport fills the destination",
          source: SOURCE.airport,
          loaded: script,
        });
        airline.value = "JQF-PAX";
        view.window.jQuery(airline).trigger("change");
        check(destination.value, "Allegiant", {
          label: "Concord-Padgett still uses the passenger terminal",
          source: SOURCE.airport,
          loaded: script,
        });
        check(shown(destination), false, {
          label: "a listed choice keeps the text box hidden",
          source: SOURCE.airport,
          loaded: script,
        });
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
          label: "group form hides the airport menu",
          source: SOURCE.group,
          loaded: script,
        });
        check(shown(destination), false, {
          label: "group form no longer asks for a typed drop-off",
          source: SOURCE.group,
          loaded: script,
        });
        check(
          view.document.querySelector("#trip-type").options[1].textContent,
          "Airport",
          {
            label: "trip type still says Airport",
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(
          view.document.querySelector("#trip-type").options[2].textContent,
          "Local Bars and Parties",
          {
            label: "local bars sit under Airport",
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(
          view.document.querySelector("#trip-type").options[3].textContent,
          "Group",
          {
            label: "trip type still says Group",
            source: SOURCE.group,
            loaded: script,
          },
        );
      });

      it("keeps the airport fare formula in one place", () => {
        const source = fs.readFileSync("js/booking.js", "utf8");
        check(source.split("function airportFare(").length - 1, 1, {
          label: "one airport fare function",
          source: SOURCE.quote,
          loaded: script,
        });
        check(source.split("q([63,35,59,62])").length - 1, 1, {
          label: "the per-mile rate is not copied for airfields",
          source: SOURCE.quote,
          loaded: script,
        });
      });

      it("prices a typed private airfield with the airport fare", async () => {
        const home = "123 Main Street, Denver NC 28037";
        const address = "100 Runway Rd, Charlotte NC 28202";
        const name = "Smith Field";
        const milesList = [1, 10, 27.2, 40, 50, 8500 / 263];
        for (const miles of milesList) {
          const view = await renderBooking(script, {
            miles,
            places: {
              [home]: {
                lat: 35.53,
                lon: -81.03,
                city: "Denver",
                state: "NC",
                zip: "28037",
                miles,
              },
              [address]: {
                lat: 35.71,
                lon: -80.89,
                city: "Charlotte",
                state: "NC",
                zip: "28202",
                miles: 999,
              },
            },
          });
          await showAirfieldQuote(view, { pickup: home, name, address });
          const expected = totals(miles);
          check(
            quoteTotal(view.document),
            `Cash $${expected.cash} · Card $${expected.card}`,
            {
              label: `private airfield fare for ${miles} miles`,
              actual: quoteTotal(view.document),
              source: SOURCE.quote,
              loaded: script,
            },
          );
          check(quoteLabel(view.document), `One way to ${name}`, {
            label: `private airfield label for ${miles} miles`,
            source: SOURCE.quote,
            loaded: script,
          });
          const routes = view.state.requests.filter(
            (request) => hostnameOf(request.url) === "router.project-osrm.org",
          );
          const route = routes[routes.length - 1].url;
          check(route.includes("-81.03,35.53;-80.89,35.71"), true, {
            label:
              "distance runs from the home address to the airfield address",
            actual: route,
            source: SOURCE.quote,
            loaded: script,
          });
          check(route.includes("-80.9423,35.2224"), false, {
            label: "a typed airfield does not use the CLT door",
            actual: route,
            source: SOURCE.quote,
            loaded: script,
          });
        }
      });

      it("prices a private airfield round trip and stops at 50 miles", async () => {
        const home = "123 Main Street, Denver NC 28037";
        const address = "100 Runway Rd, Charlotte NC 28202";
        const round = await renderBooking(script, { miles: 10 });
        await showAirfieldQuote(round, {
          pickup: home,
          name: "Smith Field",
          address,
          roundTrip: true,
        });
        check(quoteTotal(round.document), "Cash $130.00 · Card $133.90", {
          label: "private airfield round trip doubles cash before the card fee",
          source: SOURCE.quote,
          loaded: script,
        });
        check(quoteLabel(round.document), "Round trip, Smith Field and back", {
          label: "private airfield round trip label",
          source: SOURCE.quote,
          loaded: script,
        });
        for (const miles of [50.01, 55, 150]) {
          const view = await renderBooking(script, { miles });
          const text = await showAirfieldQuote(view, {
            pickup: home,
            name: "Smith Field",
            address,
          });
          check(
            text,
            "For trips over 50 miles, please call (980) 422-9125 for your price.",
            {
              label: `${miles} mile airfield shows the same too-far message`,
              source: SOURCE.quote,
              loaded: script,
            },
          );
          check(
            view.document
              .querySelector("#quote-details a")
              ?.getAttribute("href"),
            "tel:+19804229125",
            {
              label: `${miles} mile airfield call link`,
              source: SOURCE.quote,
              loaded: script,
            },
          );
        }
      });

      it("uses the typed address even when the airfield name matches a listed airport", async () => {
        const home = "123 Main Street, Denver NC 28037";
        const address = "100 Runway Rd, Charlotte NC 28202";
        const view = await renderBooking(script, {
          miles: 40,
          places: {
            [home]: {
              lat: 35.53,
              lon: -81.03,
              city: "Denver",
              state: "NC",
              zip: "28037",
              miles: 40,
            },
            [address]: {
              lat: 35.71,
              lon: -80.89,
              city: "Charlotte",
              state: "NC",
              zip: "28202",
              miles: 999,
            },
          },
        });
        await showAirfieldQuote(view, {
          pickup: home,
          name: "EQY",
          address,
        });
        check(quoteLabel(view.document), "One way to EQY", {
          label: "the quote uses the name the customer typed",
          source: SOURCE.quote,
          loaded: script,
        });
        check(quoteTotal(view.document), "Cash $105.00 · Card $108.15", {
          label: "the named airfield still uses the address distance",
          source: SOURCE.quote,
          loaded: script,
        });
        const routes = view.state.requests.filter(
          (request) => hostnameOf(request.url) === "router.project-osrm.org",
        );
        const route = routes[routes.length - 1].url;
        check(route.includes("-80.89,35.71"), true, {
          label: "EQY as a name still routes to the typed address",
          actual: route,
          source: SOURCE.quote,
          loaded: script,
        });
        check(route.includes("-80.620083,35.016833"), false, {
          label: "EQY as a name does not use the listed EQY door",
          actual: route,
          source: SOURCE.quote,
          loaded: script,
        });
      });

      it("asks for the airfield address and does not keep an old airport fare", async () => {
        const view = await renderBooking(script, { miles: 10 });
        await showQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          destination: "CLT",
        });
        const choice = view.document.querySelector("#airport-choice");
        choice.value = "PRIVATE";
        view.window.jQuery(choice).trigger("change");
        check(
          view.document.querySelector("#quote-details").textContent,
          "Enter your home address and the airfield address to see your price.",
          {
            label: "choosing private airfield drops the previous airport fare",
            source: SOURCE.quote,
            loaded: script,
          },
        );
        check(shown(view.document.querySelector("#airfield-name")), true, {
          label: "private airfield asks for a name",
          source: SOURCE.airport,
          loaded: script,
        });
        check(shown(view.document.querySelector("#airfield-address")), true, {
          label: "private airfield asks for an address",
          source: SOURCE.airport,
          loaded: script,
        });
        check(
          shown(view.document.querySelector("#booking-destination")),
          false,
          {
            label: "the airport destination box stays hidden",
            source: SOURCE.airport,
            loaded: script,
          },
        );
        view.window.jQuery("#airfield-name").val("A").trigger("blur");
        view.window
          .jQuery("#airfield-address")
          .val("Main Street")
          .trigger("blur");
        check(
          view.document.querySelector("#quote-details").textContent,
          "Enter your home address and the airfield address to see your price.",
          {
            label: "a name and address that cannot be routed stay unpriced",
            source: SOURCE.quote,
            loaded: script,
          },
        );
        view.window.jQuery("#booking-pickup").val("12").trigger("blur");
        check(
          view.document.querySelector("#quote-details").textContent,
          "Enter your home address and the airfield address to see your price.",
          {
            label: "a short home address asks for the airfield address",
            source: SOURCE.quote,
            loaded: script,
          },
        );
      });

      it("does not price a private airfield outside the service area or past the map", async () => {
        const outside = await renderBooking(script, { miles: 12 });
        const outsideText = await showAirfieldQuote(outside, {
          pickup: "100 Main St, Mooresville NC 28115",
          name: "Smith Field",
          address: "100 Runway Rd, Charlotte NC 28202",
        });
        check(outsideText, "Sorry, we don't service that area.", {
          label: "a Mooresville pickup is still outside",
          source: SOURCE.serviceArea,
          loaded: script,
        });
        check(outsideText.includes("$"), false, {
          label: "an outside pickup has no airfield fare",
          source: SOURCE.quote,
          loaded: script,
        });
        const unclear = await renderBooking(script, { censusMode: "miss" });
        const unclearText = await showAirfieldQuote(unclear, {
          pickup: "999999 Mystery Lane",
          name: "Smith Field",
          address: "100 Runway Rd, Charlotte NC 28202",
        });
        check(
          unclearText,
          "Please include the town and state, for example Denver, NC.",
          {
            label: "an airfield pickup with no town asks for the town",
            source: SOURCE.serviceArea,
            loaded: script,
          },
        );
        const missed = await renderBooking(script, {
          censusMode: "miss",
          osmMode: "miss",
        });
        const missedText = await showAirfieldQuote(missed, {
          pickup: "999999 Mystery Lane",
          name: "Smith Field",
          address: "100 Runway Rd, Charlotte NC 28202",
        });
        check(missedText, "We'll confirm your price when we call.", {
          label: "a private airfield with no map result is not priced",
          source: SOURCE.quote,
          loaded: script,
        });
        const away = await renderBooking(script, {
          lat: 40,
          lon: -105,
          miles: 12,
        });
        const awayText = await showAirfieldQuote(away, {
          pickup: "123 Main Street, Denver NC 28037",
          name: "Smith Field",
          address: "100 Runway Rd, Charlotte NC 28202",
        });
        check(awayText, "We'll confirm your price when we call.", {
          label: "a home pin outside the driving box is not priced",
          source: SOURCE.quote,
          loaded: script,
        });
        const noroute = await renderBooking(script, {
          routeMode: "error",
          miles: 12,
        });
        const norouteText = await showAirfieldQuote(noroute, {
          pickup: "123 Main Street, Denver NC 28037",
          name: "Smith Field",
          address: "100 Runway Rd, Charlotte NC 28202",
        });
        check(norouteText, "We'll confirm your price when we call.", {
          label: "a private airfield with no driving route is not priced",
          source: SOURCE.quote,
          loaded: script,
        });
      });

      it("escapes the airfield name and hides the fare for a group ride", async () => {
        const view = await renderBooking(script, { miles: 40 });
        const payload = '<img id="airfield-xss" src=x>';
        await showAirfieldQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          name: payload,
          address: "100 Runway Rd, Charlotte NC 28202",
        });
        check(view.document.getElementById("airfield-xss"), null, {
          label: "airfield name was not inserted as HTML",
          source: SOURCE.escape,
          loaded: script,
        });
        check(quoteLabel(view.document).includes(payload), true, {
          label: "airfield name is still visible as text",
          source: SOURCE.quote,
          loaded: script,
        });
        chooseTrip(view.document, "group");
        check(quoteTotal(view.document).includes("Cash"), false, {
          label: "switching to group clears the airfield fare",
          source: SOURCE.group,
          loaded: script,
        });
        check(quoteLabel(view.document).includes(payload), false, {
          label: "the airfield name does not stay on the group quote",
          source: SOURCE.group,
          loaded: script,
        });
        check(shown(view.document.querySelector("#airfield-name")), false, {
          label: "group form hides the airfield name",
          source: SOURCE.group,
          loaded: script,
        });
        chooseTrip(view.document, "airport");
        check(shown(view.document.querySelector("#airfield-name")), true, {
          label:
            "coming back to an airport trip shows the airfield fields again",
          source: SOURCE.airport,
          loaded: script,
        });
      });

      it("books a private airfield in an unserved town when the home is served", async () => {
        const view = await renderBooking(script, { miles: 18 });
        await fillValid(view, {
          trip: "airport",
          airportId: "PRIVATE",
          airfieldName: "Smith Field",
          airfieldAddress: "100 Runway Rd, Charlotte NC 28202",
          pickup: "123 Main Street, Denver NC 28037",
        });
        await submitForm(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "a private airfield request is accepted",
          actual: resultText(view.document),
          source: SOURCE.serviceArea,
          loaded: script,
        });
        const payload = calendarPayload(view);
        check(
          payload.destinationAddress,
          "Smith Field, 100 Runway Rd, Charlotte NC 28202",
          {
            label: "calendar destination is the airfield name and address",
            actual: payload.destinationAddress,
            source: SOURCE.airport,
            loaded: script,
          },
        );
        check(payload.airportTrip, "Yes", {
          label: "a private airfield is still an airport trip",
          actual: payload.airportTrip,
          source: SOURCE.airport,
          loaded: script,
        });
        check(payload.pickupAddress, "123 Main Street, Denver NC 28037", {
          label: "calendar pickup stays the home address",
          actual: payload.pickupAddress,
          source: SOURCE.airport,
          loaded: script,
        });
        const form = bookingPosts(view.state).find((request) =>
          request.url.includes("docs.google.com"),
        );
        const destination = form.formEntries.find(
          (entry) => entry[0] === "entry.814545959",
        );
        check(
          destination[1],
          "Smith Field, 100 Runway Rd, Charlotte NC 28202",
          {
            label: "the form receives the airfield name and address",
            actual: destination && destination[1],
            source: SOURCE.airport,
            loaded: script,
          },
        );
      });

      it("ignores an airfield lookup that finishes after the address changes", async () => {
        const address = "100 Runway Rd, Charlotte NC 28202";
        const view = await renderBooking(script, { miles: 12 });
        const ajax = view.window.jQuery.ajax;
        let bumped = false;
        view.window.jQuery.ajax = (settings) => {
          const typed = settings.data && settings.data.address;
          if (!bumped && typed === address) {
            bumped = true;
            view.window.jQuery("#airfield-address").val("12");
            view.window.jQuery("#airfield-address").trigger("blur");
          }
          return ajax(settings);
        };
        const text = await showAirfieldQuote(view, {
          pickup: "123 Main Street, Denver NC 28037",
          name: "Smith Field",
          address,
        });
        check(
          text,
          "Enter your home address and the airfield address to see your price.",
          {
            label: "a late airfield lookup does not bring back a fare",
            source: SOURCE.quote,
            loaded: script,
          },
        );
        check(bumped, true, {
          label: "the airfield address was sent to the map",
          source: SOURCE.quote,
          loaded: script,
        });
      });

      it("requires the airfield name and address before it sends a request", async () => {
        const missingName = await renderBooking(script);
        await fillValid(missingName, {
          trip: "airport",
          airportId: "PRIVATE",
          airfieldName: "",
          airfieldAddress: "100 Runway Rd, Charlotte NC 28202",
        });
        await submitForm(missingName);
        check(
          resultText(missingName.document).includes(
            "Airfield name is required",
          ),
          true,
          {
            label: "submit requires the airfield name",
            actual: resultText(missingName.document),
            source: SOURCE.airport,
            loaded: script,
          },
        );
        check(bookingPosts(missingName.state).length, 0, {
          label: "a missing airfield name sends no booking",
          source: SOURCE.airport,
          loaded: script,
        });
        const missingAddress = await renderBooking(script);
        await fillValid(missingAddress, {
          trip: "airport",
          airportId: "PRIVATE",
          airfieldName: "Smith Field",
          airfieldAddress: "",
        });
        await submitForm(missingAddress);
        check(
          resultText(missingAddress.document).includes(
            "Airfield address is required",
          ),
          true,
          {
            label: "submit requires the airfield address",
            actual: resultText(missingAddress.document),
            source: SOURCE.airport,
            loaded: script,
          },
        );
        const homeOutside = await renderBooking(script);
        await fillValid(homeOutside, {
          trip: "airport",
          airportId: "PRIVATE",
          pickup: "100 Main St, Charlotte NC",
          airfieldName: "Smith Field",
          airfieldAddress: "100 Runway Rd, Charlotte NC 28202",
        });
        await submitForm(homeOutside);
        check(
          resultText(homeOutside.document),
          "Sorry, we don't service that area.",
          {
            label: "a Charlotte home is still outside for an airfield ride",
            source: SOURCE.serviceArea,
            loaded: script,
          },
        );
        check(bookingPosts(homeOutside.state).length, 0, {
          label: "an outside home sends no airfield booking",
          source: SOURCE.serviceArea,
          loaded: script,
        });
      });

      it("refuses an airport trip until one menu is chosen", async () => {
        const view = await renderBooking(script);
        await fillValid(view, { trip: "airport" });
        view.document.querySelector("#airport-choice").value = "";
        view.document.querySelector("#booking-destination").value = "";
        await submitForm(view);
        check(
          resultText(view.document).includes("Please choose an airport"),
          true,
          {
            label: "submit requires an airport",
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
        const payload = calendarPayload(view);
        check(payload.checkingBags, "No (0 bags)", {
          label: "no checked bags still sends the bag count",
          actual: payload && payload.checkingBags,
          source: SOURCE.passengers,
          loaded: script,
        });
        check(payload.bagCount, 0, {
          label: "zero bags is sent as 0",
          actual: payload && payload.bagCount,
          source: SOURCE.passengers,
          loaded: script,
        });
      });

      it("asks for checked bags and a bag count before an airport request is sent", async () => {
        const view = await renderBooking(script);
        await fillValid(view, { trip: "airport" });
        view.document.querySelector("#booking-checking-bags-yes").checked =
          false;
        view.document.querySelector("#booking-checking-bags-no").checked =
          false;
        view.document.querySelector("#booking-bag-count").value = "";
        await submitForm(view);
        const text = resultText(view.document);
        check(text.includes("Please choose Yes or No for checked bags"), true, {
          label: "skipped checked bags show the yes or no error",
          actual: text,
          source: SOURCE.passengers,
          loaded: script,
        });
        check(text.includes("Please enter how many bags"), true, {
          label: "an empty bag count shows an error",
          actual: text,
          source: SOURCE.passengers,
          loaded: script,
        });
        check(bookingPosts(view.state).length, 0, {
          label: "skipped bag answers send no request",
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
        const payload = calendarPayload(view);
        check(payload.checkingBags, "Yes (2 bags)", {
          label: "checked bags sends Yes and the bag count",
          actual: payload && payload.checkingBags,
          source: SOURCE.passengers,
          loaded: script,
        });
        check(payload.bagCount, 2, {
          label: "calendar payload includes the bag count",
          actual: payload && payload.bagCount,
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
        check(shown(quote), true, {
          label: "group form shows the hourly quote",
          actual: quote.textContent,
          source: SOURCE.group,
          loaded: script,
        });
        check(quote.textContent.includes("Cash $65"), false, {
          label: "group form does not keep the airport fare",
          actual: quote.textContent,
          source: SOURCE.group,
          loaded: script,
        });
        check(
          view.document.querySelector("#group-vehicle").textContent,
          "2026 Toyota Sienna Platinum minivan, $125 per hour.",
          {
            label: "group form names the Sienna and the hourly rate",
            source: SOURCE.group,
            loaded: script,
          },
        );
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
          false,
          {
            label: "group form does not ask for a separate drop-off",
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(shown(view.document.querySelector("#group-hours")), true, {
          label: "group form asks for hours",
          source: SOURCE.group,
          loaded: script,
        });
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
          shown(view.document.querySelector("#checking-bags-section")),
          false,
          {
            label: "group form does not ask about bags",
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(shown(view.document.querySelector("#booking-flight")), false, {
          label: "group form does not ask for a flight number",
          source: SOURCE.group,
          loaded: script,
        });
        check(
          shown(view.document.querySelector("#booking-round-trip")),
          false,
          {
            label: "group form does not ask about a return trip",
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(
          shown(view.document.querySelector("#booking-wheelchair")),
          false,
          {
            label: "group form hides the wheelchair box",
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(shown(view.document.querySelector("#booking-carseat")), false, {
          label: "group form hides the car seat box",
          source: SOURCE.group,
          loaded: script,
        });
        check(
          view.document.querySelector("#notes-label")?.textContent.trim(),
          "Trip Description *",
          {
            label: "group notes ask for a trip description",
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(
          view.document
            .querySelector("#booking-notes")
            .getAttribute("placeholder"),
          "Anything we should know? For example, a wheelchair, a car seat, or extra luggage.",
          {
            label: "trip description hint names a wheelchair and a car seat",
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(shown(view.document.querySelector("#rule-age")), true, {
          label: "group form asks the rider to confirm they are 21",
          source: SOURCE.group,
          loaded: script,
        });
        check(shown(view.document.querySelector("#booking-notes")), true, {
          label: "group form asks for a trip description",
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
        check(shown(view.document.querySelector("#trip-type-group")), false, {
          label: "a group link does not ask for the trip type again",
          source: SOURCE.group,
          loaded: script,
        });
        check(shown(view.document.querySelector("#group-hours")), true, {
          label: "preselected group form is the booking form",
          source: SOURCE.group,
          loaded: script,
        });
      });

      it("opens the airport form from the home page link without asking again", async () => {
        const view = await renderBooking(script, {
          url: "/?type=airport#booking",
        });
        const link = view.document.querySelector("#book-airport-ride");
        check(link?.textContent.trim(), "Book an Airport Ride", {
          label: "home page has Book an Airport Ride",
          actual: link?.textContent,
          source: SOURCE.airport,
          loaded: script,
        });
        check(link?.getAttribute("href"), "/?type=airport#booking", {
          label: "airport link opens the booking form with airport selected",
          actual: link?.getAttribute("href"),
          source: SOURCE.airport,
          loaded: script,
        });
        check(view.document.querySelector("#trip-type").value, "airport", {
          label: "type=airport preselects Airport",
          source: SOURCE.airport,
          loaded: script,
        });
        check(shown(view.document.querySelector("#trip-type-group")), false, {
          label: "an airport link does not ask for the trip type again",
          source: SOURCE.airport,
          loaded: script,
        });
        check(shown(view.document.querySelector("#airport-choice")), true, {
          label: "the airport list stays after the trip type is already chosen",
          source: SOURCE.airport,
          loaded: script,
        });
      });

      it("keeps one trip type chooser when the page did not choose", async () => {
        const view = await renderBooking(script, { url: "/#booking" });
        check(shown(view.document.querySelector("#trip-type-group")), true, {
          label: "Book Your Ride still asks for the trip type once",
          source: SOURCE.group,
          loaded: script,
        });
      });

      it("accepts a stadium name when the geocoder has no match", async () => {
        const view = await renderBooking(script, { censusMode: "miss" });
        await fillValid(view, {
          trip: "group",
          name: "TEST, DO NOT BOOK",
          pickup: "7740 Marlette Ln, Sherrills Ford NC",
          destination: "Bank of America stadium",
        });
        check(shown(view.document.querySelector("#group-hours")), true, {
          label: "a group request asks for hours instead of a venue box",
          source: SOURCE.group,
          loaded: script,
        });
        await submitForm(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "a venue name without a town is accepted",
          actual: resultText(view.document),
          source: SOURCE.group,
          loaded: script,
        });
        check(
          resultText(view.document).includes("Please include the town"),
          false,
          {
            label: "a venue name is not asked for a town",
            actual: resultText(view.document),
            source: SOURCE.group,
            loaded: script,
          },
        );
      });

      it("accepts a pickup with a comma after the house number", async () => {
        const view = await renderBooking(script, { censusMode: "miss" });
        await fillValid(view, {
          trip: "group",
          name: "TEST, DO NOT BOOK",
          pickup: "7740, Marlette Ln, Sherrills Ford NC",
          destination: "Bank of America stadium",
        });
        await submitForm(view);
        check(resultText(view.document).includes("Request received"), true, {
          label: "Sherrills Ford NC without a comma before NC is accepted",
          actual: resultText(view.document),
          source: SOURCE.group,
          loaded: script,
        });
        const payload = calendarPayload(view);
        check(payload.pickupAddress, "7740, Marlette Ln, Sherrills Ford NC", {
          label: "calendar keeps the typed pickup",
          actual: payload && payload.pickupAddress,
          source: SOURCE.group,
          loaded: script,
        });
        check(
          payload.destinationAddress,
          "Hourly charter, 2026 Toyota Sienna Platinum",
          {
            label: "calendar records the hourly charter",
            actual: payload && payload.destinationAddress,
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
          notes: "reunion",
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
        check(
          payload.destinationAddress,
          "Hourly charter, 2026 Toyota Sienna Platinum",
          {
            label: "group calendar names the hourly charter",
            actual: payload.destinationAddress,
            source: SOURCE.group,
            loaded: script,
          },
        );
        check(payload.mustBe21, "Yes", {
          label: "group calendar records the age confirmation",
          actual: payload.mustBe21,
          source: SOURCE.group,
          loaded: script,
        });
        check(payload.hoursBilled, "3", {
          label: "group calendar records the billed hours",
          actual: payload.hoursBilled,
          source: SOURCE.group,
          loaded: script,
        });
        check(payload.checkingBags, "No", {
          label: "group booking does not send bags",
          actual: payload.checkingBags,
          source: SOURCE.group,
          loaded: script,
        });
        check(payload.flightNumber, "", {
          label: "group booking does not send a flight number",
          actual: payload.flightNumber,
          source: SOURCE.group,
          loaded: script,
        });
        check(payload.roundTrip, "No", {
          label: "group booking does not send a return trip",
          actual: payload.roundTrip,
          source: SOURCE.group,
          loaded: script,
        });
        check(/wheelchair|car\s?seat/i.test(JSON.stringify(payload)), false, {
          label: "group booking does not send wheelchair or car seat",
          actual: payload,
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
            "The 2026 Toyota Sienna Platinum seats 6. For more than 6 passengers, please call (980) 422-9125.",
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
          flight: "AA1234",
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
