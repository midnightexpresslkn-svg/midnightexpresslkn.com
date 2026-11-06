import { afterEach, describe, it } from "vitest";
import { waitFor } from "@testing-library/dom";
import { SOURCE } from "./helpers/source-line.js";
import { check } from "./helpers/failure.js";
import { hostnameOf } from "./helpers/hostname.js";
import {
  chooseRadio,
  drainTimers,
  flushTimersOf,
  releaseHeld,
  renderBooking,
  showQuote,
} from "./helpers/render-booking.js";

const scripts = ["js/booking.js", "js/booking.min.js"];
const pickup = "123 Main Street, Denver NC 28037";
const ask = "Enter your pickup address and airport to see your price.";
const confirm = "We'll confirm your price when we call.";

afterEach(() => {
  drainTimers();
});

function quoteText(document) {
  return (
    document
      .querySelector("#quote-details")
      ?.textContent?.replace(/\s+/g, " ")
      .trim() || ""
  );
}

function hosts(state, host) {
  return state.requests.filter((request) => hostnameOf(request.url) === host);
}

async function priced(script, options, fields) {
  const view = await renderBooking(script, options);
  const text = await showQuote(view, {
    pickup,
    destination: "CLT",
    ...fields,
  });
  return { view, text };
}

describe.each(scripts)("quote distance %s", (script) => {
  it("asks for an address until the pickup has a street number", async () => {
    const view = await renderBooking(script);
    check(quoteText(view.document), ask, {
      label: "initial quote prompt",
      source: SOURCE.quote,
      loaded: script,
    });
    const tooShort = await showQuote(view, {
      pickup: "12345",
      destination: "CLT",
    });
    check(tooShort, ask, {
      label: "short pickup asks for an address",
      source: SOURCE.geocode,
      loaded: script,
    });
    const noNumber = await showQuote(view, {
      pickup: "Denver NC",
      destination: "CLT",
    });
    check(noNumber, ask, {
      label: "pickup without a number asks for an address",
      source: SOURCE.geocode,
      loaded: script,
    });
    check(hosts(view.state, "geocoding.geo.census.gov").length, 0, {
      label: "incomplete pickup does not call the geocoder",
      source: SOURCE.geocode,
      loaded: script,
    });
  });

  it("asks again when the destination is cleared", async () => {
    const view = await renderBooking(script);
    const text = await showQuote(view, { pickup, destination: "" });
    check(text, ask, {
      label: "missing destination asks for an address",
      source: SOURCE.geocode,
      loaded: script,
    });
  });

  it("does not price a non-airport trip", async () => {
    const { text, view } = await priced(
      script,
      { miles: 40 },
      { airport: "No" },
    );
    check(text, confirm, {
      label: "airport trip No is not priced",
      source: SOURCE.quote,
      loaded: script,
    });
    check(text.includes("$"), false, {
      label: "airport trip No shows no dollars",
      source: SOURCE.quote,
      loaded: script,
    });
    check(hosts(view.state, "router.project-osrm.org").length, 0, {
      label: "airport trip No does not ask for a route",
      source: SOURCE.route,
      loaded: script,
    });
  });

  it.each([
    ["douglas international", "Charlotte Douglas Airport (CLT)"],
    ["douglas intl", "Charlotte Douglas Airport (CLT)"],
    ["charlotte airport", "Charlotte Douglas Airport (CLT)"],
    ["charlotte international", "Charlotte Douglas Airport (CLT)"],
    ["concord airport", "Concord Regional Airport"],
  ])("prices the airport phrase %s", async (destination, label) => {
    const { text } = await priced(script, { miles: 40 }, { destination });
    check(text.includes(label), true, {
      label: `airport label for ${destination}`,
      expected: label,
      actual: text,
      source: SOURCE.airport,
      loaded: script,
    });
    check(text.includes("Cash $110.00"), true, {
      label: `price for ${destination}`,
      source: SOURCE.quote,
      loaded: script,
    });
  });

  it("does not price a destination that says it is not the airport", async () => {
    const { text } = await priced(
      script,
      { miles: 40 },
      { destination: "not the CLT" },
    );
    check(text, confirm, {
      label: "not the CLT is not priced",
      source: SOURCE.airport,
      loaded: script,
    });
  });

  it("prices from OpenStreetMap when Census has no match", async () => {
    const { view, text } = await priced(script, {
      miles: 40,
      censusMode: "miss",
    });
    check(text.includes("Cash $110.00"), true, {
      label: "OSM fallback still prices the trip",
      expected: "Cash $110.00",
      actual: text,
      source: SOURCE.geocode,
      loaded: script,
    });
    check(hosts(view.state, "nominatim.openstreetmap.org").length, 1, {
      label: "Census miss calls OpenStreetMap",
      source: SOURCE.geocode,
      loaded: script,
    });
  });

  it("prices from OpenStreetMap when Census fails", async () => {
    const { view, text } = await priced(script, {
      miles: 40,
      censusMode: "error",
    });
    check(text.includes("Cash $110.00"), true, {
      label: "Census error still prices from OpenStreetMap",
      actual: text,
      source: SOURCE.geocode,
      loaded: script,
    });
    check(hosts(view.state, "nominatim.openstreetmap.org").length > 0, true, {
      label: "Census error calls OpenStreetMap",
      source: SOURCE.geocode,
      loaded: script,
    });
  });

  it("adds North Carolina when the backup geocoder query has no state", async () => {
    const bare = "100 Oak Street 28037";
    const { view } = await priced(
      script,
      { miles: 40, censusMode: "miss" },
      { pickup: bare },
    );
    const url = hosts(view.state, "nominatim.openstreetmap.org")[0].url;
    const query = new URL(url).searchParams.get("q");
    check(query, `${bare}, NC`, {
      label: "OSM query adds NC",
      source: SOURCE.geocode,
      loaded: script,
    });
  });

  it("keeps a North Carolina address unchanged for the backup geocoder", async () => {
    const { view } = await priced(script, { miles: 40, censusMode: "miss" });
    const query = new URL(
      hosts(view.state, "nominatim.openstreetmap.org")[0].url,
    ).searchParams.get("q");
    check(query, pickup, {
      label: "OSM query keeps the NC address",
      source: SOURCE.geocode,
      loaded: script,
    });
  });

  it("confirms by phone when both geocoders miss", async () => {
    const { text } = await priced(script, {
      miles: 40,
      censusMode: "miss",
      osmMode: "empty",
    });
    check(text, confirm, {
      label: "both geocoders miss",
      source: SOURCE.geocode,
      loaded: script,
    });
    check(text.includes("$"), false, {
      label: "a geocoder miss shows no dollars",
      source: SOURCE.quote,
      loaded: script,
    });
  });

  it("confirms by phone when both geocoders fail", async () => {
    const { text } = await priced(script, {
      miles: 40,
      censusMode: "error",
      osmMode: "throw",
    });
    check(text, confirm, {
      label: "both geocoders fail",
      source: SOURCE.geocode,
      loaded: script,
    });
  });

  it("tries the backup geocoder again after a failure", async () => {
    const view = await renderBooking(script, {
      miles: 40,
      censusMode: "miss",
      osmMode: "throw",
    });
    const first = await showQuote(view, { pickup, destination: "CLT" });
    check(first, confirm, {
      label: "first geocoder failure confirms by phone",
      source: SOURCE.geocode,
      loaded: script,
    });
    view.state.osmMode = "ok";
    const second = await showQuote(view, { pickup, destination: "CLT" });
    check(second.includes("Cash $110.00"), true, {
      label: "retry prices the trip",
      actual: second,
      source: SOURCE.geocode,
      loaded: script,
    });
    check(hosts(view.state, "nominatim.openstreetmap.org").length, 2, {
      label: "a failed lookup is not reused",
      source: SOURCE.geocode,
      loaded: script,
    });
  });

  it.each([
    ["latitude south of the area", 34.9, -81.03],
    ["latitude north of the area", 36.2, -81.03],
    ["longitude west of the area", 35.5, -81.8],
    ["longitude east of the area", 35.5, -80.2],
  ])("confirms by phone for a pickup %s", async (label, lat, lon) => {
    const { text } = await priced(script, { miles: 40, lat, lon });
    check(text, confirm, {
      label,
      source: SOURCE.route,
      loaded: script,
    });
  });

  it("prices a pickup just inside the service area", async () => {
    const { text } = await priced(script, {
      miles: 40,
      lat: 34.91,
      lon: -81.79,
    });
    check(text.includes("Cash $110.00"), true, {
      label: "inside edge is priced",
      actual: text,
      source: SOURCE.quote,
      loaded: script,
    });
  });

  it("does not price a pickup Census places in an excluded town", async () => {
    const { text, view } = await priced(script, {
      miles: 40,
      censusCity: "Mooresville",
      censusZip: "28115",
    });
    check(text, confirm, {
      label: "Census city Mooresville is not priced",
      source: SOURCE.excluded,
      loaded: script,
    });
    check(hosts(view.state, "router.project-osrm.org").length, 0, {
      label: "excluded Census city does not ask for a route",
      source: SOURCE.route,
      loaded: script,
    });
  });

  it("does not price a pickup Census places in an excluded ZIP", async () => {
    const { text } = await priced(script, {
      miles: 40,
      censusCity: "",
      censusZip: "28115",
    });
    check(text, confirm, {
      label: "Census ZIP 28115 is not priced",
      source: SOURCE.excluded,
      loaded: script,
    });
  });

  it("confirms by phone when the router has no route", async () => {
    const { view, text } = await priced(script, {
      miles: 40,
      routeMode: "error",
    });
    check(text, confirm, {
      label: "no driving route",
      source: SOURCE.route,
      loaded: script,
    });
    check(hosts(view.state, "router.project-osrm.org").length, 1, {
      label: "a no-route answer still called the router",
      source: SOURCE.route,
      loaded: script,
    });
  });

  it("confirms by phone when the router cannot be reached", async () => {
    const { text } = await priced(script, { miles: 40, routeMode: "throw" });
    check(text, confirm, {
      label: "router network failure",
      source: SOURCE.route,
      loaded: script,
    });
  });

  it("reuses a pickup lookup and a route for the same quote", async () => {
    const view = await renderBooking(script, { miles: 40 });
    const first = await showQuote(view, { pickup, destination: "CLT" });
    const census = hosts(view.state, "geocoding.geo.census.gov").length;
    const routes = hosts(view.state, "router.project-osrm.org").length;
    const second = await showQuote(view, { pickup, destination: "CLT" });
    check(second, first, {
      label: "repeat quote stays the same",
      source: SOURCE.quote,
      loaded: script,
    });
    check(hosts(view.state, "geocoding.geo.census.gov").length, census, {
      label: "repeat quote does not geocode again",
      source: SOURCE.geocode,
      loaded: script,
    });
    check(hosts(view.state, "router.project-osrm.org").length, routes, {
      label: "repeat quote does not route again",
      source: SOURCE.route,
      loaded: script,
    });
  });

  it("asks the router again for the other airport", async () => {
    const view = await renderBooking(script, { miles: 40 });
    await showQuote(view, { pickup, destination: "CLT" });
    await showQuote(view, { pickup, destination: "Concord Regional" });
    check(hosts(view.state, "geocoding.geo.census.gov").length, 1, {
      label: "the same pickup is geocoded once",
      source: SOURCE.geocode,
      loaded: script,
    });
    check(hosts(view.state, "router.project-osrm.org").length, 2, {
      label: "each airport gets its own route",
      source: SOURCE.route,
      loaded: script,
    });
  });

  it("shows the price after the geocoder answers", async () => {
    const view = await renderBooking(script, { miles: 40, holdCensus: true });
    chooseRadio(view.document, "airport-trip", "Yes");
    flushTimersOf(50);
    view
      .$("#booking-pickup")
      .val(pickup)
      .trigger("input")
      .trigger("change")
      .trigger("blur");
    view
      .$("#booking-destination")
      .val("CLT")
      .trigger("input")
      .trigger("change")
      .trigger("blur");
    check(/figuring/i.test(quoteText(view.document)), true, {
      label: "quote says it is figuring the price",
      actual: quoteText(view.document),
      source: SOURCE.quote,
      loaded: script,
    });
    releaseHeld(view.state);
    await waitFor(() => {
      if (!quoteText(view.document).includes("Cash $110.00")) {
        throw new Error(quoteText(view.document));
      }
    });
    check(quoteText(view.document).includes("Cash $110.00"), true, {
      label: "price appears after the geocoder answers",
      actual: quoteText(view.document),
      source: SOURCE.quote,
      loaded: script,
    });
  });

  it("ignores a slow geocoder reply after the destination changed", async () => {
    const view = await renderBooking(script, { miles: 40, holdCensus: true });
    chooseRadio(view.document, "airport-trip", "Yes");
    flushTimersOf(50);
    view.$("#booking-pickup").val(pickup).trigger("blur");
    view.$("#booking-destination").val("CLT").trigger("blur");
    check(/figuring/i.test(quoteText(view.document)), true, {
      label: "first quote is still waiting",
      actual: quoteText(view.document),
      source: SOURCE.quote,
      loaded: script,
    });
    view.$("#booking-destination").val("Concord Mills").trigger("blur");
    check(quoteText(view.document), confirm, {
      label: "newer destination is not priced",
      source: SOURCE.airport,
      loaded: script,
    });
    releaseHeld(view.state);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    check(quoteText(view.document), confirm, {
      label: "a late geocoder reply does not overwrite the newer quote",
      source: SOURCE.geocode,
      loaded: script,
    });
    check(quoteText(view.document).includes("$"), false, {
      label: "a late reply shows no dollars",
      source: SOURCE.quote,
      loaded: script,
    });
  });

  it("drops a late failure after the rider already changed the quote", async () => {
    const view = await renderBooking(script, {
      miles: 40,
      holdCensus: true,
      censusMode: "error",
      osmMode: "throw",
    });
    chooseRadio(view.document, "airport-trip", "Yes");
    flushTimersOf(50);
    view.$("#booking-pickup").val(pickup).trigger("blur");
    view.$("#booking-destination").val("CLT").trigger("blur");
    view.$("#booking-destination").val("Concord Mills").trigger("blur");
    releaseHeld(view.state);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    check(quoteText(view.document), confirm, {
      label: "a late geocoder failure leaves the newer message",
      source: SOURCE.geocode,
      loaded: script,
    });
  });

  it("hides a price that arrives after the rider marks a group event", async () => {
    const view = await renderBooking(script, { miles: 40, holdCensus: true });
    chooseRadio(view.document, "airport-trip", "Yes");
    flushTimersOf(50);
    view.$("#booking-pickup").val(pickup).trigger("blur");
    view.$("#booking-destination").val("CLT").trigger("blur");
    chooseRadio(view.document, "group-event", "Yes");
    releaseHeld(view.state);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    check(view.document.querySelector("#booking-quote").style.display, "none", {
      label: "group event keeps the quote hidden",
      source: SOURCE.group,
      loaded: script,
    });
    check(quoteText(view.document).includes("$"), false, {
      label: "a late price is not shown for a group event",
      actual: quoteText(view.document),
      source: SOURCE.group,
      loaded: script,
    });
  });

  it("prices a quote typed into the fields, without leaving the field", async () => {
    const view = await renderBooking(script, { miles: 40 });
    chooseRadio(view.document, "airport-trip", "Yes");
    flushTimersOf(50);
    view.$("#booking-pickup").val(pickup).trigger("input");
    view.$("#booking-destination").val("charlotte airport").trigger("input");
    check(/Cash/.test(quoteText(view.document)), false, {
      label: "quote waits before pricing a keystroke",
      actual: quoteText(view.document),
      source: SOURCE.quote,
      loaded: script,
    });
    flushTimersOf(900);
    await waitFor(() => {
      if (!quoteText(view.document).includes("Cash $110.00")) {
        throw new Error(quoteText(view.document));
      }
    });
    check(quoteText(view.document).includes("Cash $110.00"), true, {
      label: "typed quote prices after the pause",
      actual: quoteText(view.document),
      source: SOURCE.quote,
      loaded: script,
    });
  });

  it("geocodes once when the rider keeps typing", async () => {
    const view = await renderBooking(script, { miles: 40 });
    chooseRadio(view.document, "airport-trip", "Yes");
    flushTimersOf(50);
    view.$("#booking-pickup").val("123 Main").trigger("input");
    view.$("#booking-pickup").val(pickup).trigger("input");
    view.$("#booking-destination").val("CLT").trigger("input");
    view.$("#booking-destination").val("CLT").trigger("input");
    flushTimersOf(900);
    await waitFor(() => {
      if (!quoteText(view.document).includes("Cash $110.00")) {
        throw new Error(quoteText(view.document));
      }
    });
    check(hosts(view.state, "geocoding.geo.census.gov").length, 1, {
      label: "continued typing starts one lookup",
      source: SOURCE.geocode,
      loaded: script,
    });
  });
});
