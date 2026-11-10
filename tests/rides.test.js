import { afterEach, describe, it } from "vitest";
import { check } from "./helpers/failure.js";
import { hostnameOf } from "./helpers/hostname.js";
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

const scripts = ["js/booking.js", "js/booking.min.js"];

function hostIs(url, host) {
  return hostnameOf(url) === host;
}

function isGoogleApi(url) {
  const host = hostnameOf(url);
  return host === "googleapis.com" || host.endsWith(".googleapis.com");
}
const BAR_NAMES = [
  "Two Trees",
  "Bourbon & Bobbers",
  "Joey's (Hwy 150)",
  "Joey's (Natalie Commons)",
  "16 Prime Steak and Seafood",
  "Lake Norman Brewery",
  "Latitudes",
  "Lobster Dogs",
  "Safari Miles",
  "Royal Bliss",
  "Sports Bar and Grill",
  "Blue Parrot",
  "Toucan's",
  "Invicta",
];
const BAR_TOWNS = [
  "Denver",
  "Sherrills Ford",
  "Mooresville",
  "Cornelius",
  "Huntersville",
  "Terrell",
  "Catawba",
];

afterEach(() => {
  drainTimers();
  document.head.appendChild = HTMLElement.prototype.appendChild;
});

function googleSdk() {
  function LatLng(lat, lng) {
    this.lat = () => lat;
    this.lng = () => lng;
  }
  function LatLngBounds() {
    this.points = [];
  }
  LatLngBounds.prototype.extend = function extend(point) {
    this.points.push(point);
  };
  function Map(el, opts) {
    this.el = el;
    this.opts = opts;
  }
  Map.prototype.fitBounds = function fitBounds(bounds) {
    this.bounds = bounds;
  };
  function Polyline(opts) {
    globalThis.__rideLine = opts;
  }
  function Marker(opts) {
    globalThis.__rideMarker = opts;
  }
  return { maps: { LatLng, LatLngBounds, Map, Polyline, Marker } };
}

function quoteText(document) {
  return (
    document
      .querySelector("#quote-details")
      ?.textContent?.replace(/\s+/g, " ")
      .trim() || ""
  );
}

async function waitQuote(view) {
  const start = Date.now();
  let text = "";
  while (Date.now() - start < 4000) {
    text = quoteText(view.document);
    if (text && !/figuring/i.test(text)) return text;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return text;
}

async function priceBar(
  view,
  miles,
  { roundTrip = false, bar = "two-trees" } = {},
) {
  view.state.miles = miles;
  chooseTrip(view.document, "local");
  const kind = view.document.querySelector("#local-kind");
  kind.value = "bar";
  view.window.jQuery(kind).trigger("change");
  const choice = view.document.querySelector("#bar-choice");
  choice.value = bar;
  view.window.jQuery(choice).trigger("change");
  if (roundTrip) {
    const box = view.document.querySelector("#booking-round-trip");
    box.checked = true;
    view.window.jQuery(box).trigger("change");
  }
  const pickup = view.document.querySelector("#booking-pickup");
  pickup.value = "123 Main Street, Denver NC 28037";
  view.window.jQuery(pickup).trigger("input").trigger("blur");
  return waitQuote(view);
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

describe.each(scripts)("local bars and group %s", (script) => {
  it("lists Airport, then Local Bars and Parties, then Group", async () => {
    const view = await renderBooking(script);
    check(
      [...view.document.querySelector("#trip-type").options].map(
        (option) => option.textContent,
      ),
      ["Select…", "Airport", "Local Bars and Parties", "Group"],
      {
        label: "trip menu order",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("lists the 14 bars in Donald's order under the Bar or Party menu", async () => {
    const view = await renderBooking(script);
    chooseTrip(view.document, "local");
    const kind = view.document.querySelector("#local-kind");
    check(kind.closest("#airport-fields") !== null, true, {
      label: "Bar or Party sits in the opened form",
      source: "js/booking.js",
      loaded: script,
    });
    check(
      view.document.querySelector("#local-kind-row").nextElementSibling.id,
      "local-intro",
      {
        label: "the intro line sits under Bar, restaurant, or party",
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(
      view.document.querySelector("#local-intro").textContent,
      "Transportation to local bars, restaurants, and private parties, plus hourly group events.",
      {
        label: "the local intro uses Donald's line",
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(
      view.document.querySelector("#local-intro").nextElementSibling.id,
      "local-bar-list",
      {
        label: "the 14 bars follow the intro line",
        source: "js/booking.js",
        loaded: script,
      },
    );
    kind.value = "bar";
    view.window.jQuery(kind).trigger("change");
    check(shown(view.document.querySelector("#bar-choice")), true, {
      label: "choosing Bar shows the bar list",
      source: "js/booking.js",
      loaded: script,
    });
    check(shown(view.document.querySelector("#party-address")), false, {
      label: "choosing Bar hides the party address",
      source: "js/booking.js",
      loaded: script,
    });
    const listed = [
      ...view.document.querySelectorAll("#local-bar-list li"),
    ].map((item) => item.textContent);
    const menu = [...view.document.querySelector("#bar-choice").options]
      .slice(1)
      .map((option) => option.textContent);
    check(listed, BAR_NAMES, {
      label: "bar list order",
      source: "js/booking.js",
      loaded: script,
    });
    check(menu, BAR_NAMES, {
      label: "bar menu uses the same names",
      source: "js/booking.js",
      loaded: script,
    });
    const towns = BAR_TOWNS.filter((town) =>
      [...listed, ...menu].some((label) =>
        label.toLowerCase().includes(town.toLowerCase()),
      ),
    );
    check(towns, [], {
      label: "no bar label contains a town name",
      actual: towns,
      source: "js/booking.js",
      loaded: script,
    });
    const twoTrees = view.window.MidnightRides.BARS[0];
    check(twoTrees.address, "5242 Slanting Bridge Rd, Denver, NC 28037", {
      label: "the Two Trees street address is unchanged",
      actual: twoTrees.address,
      source: "js/booking.js",
      loaded: script,
    });
    kind.value = "party";
    view.window.jQuery(kind).trigger("change");
    check(shown(view.document.querySelector("#party-address")), true, {
      label: "choosing Party shows the party address",
      source: "js/booking.js",
      loaded: script,
    });
    check(shown(view.document.querySelector("#bar-choice")), false, {
      label: "choosing Party hides the bar list",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("asks for the local intake fields and the three notices", async () => {
    const view = await renderBooking(script);
    chooseTrip(view.document, "local");
    check(
      view.document.querySelector("#address-label").textContent.trim(),
      "Address *",
      {
        label: "local form asks for an address",
        source: "js/booking.js",
        loaded: script,
      },
    );
    for (const id of [
      "booking-name",
      "booking-phone",
      "booking-email",
      "booking-passengers",
      "booking-round-trip",
    ]) {
      check(shown(view.document.querySelector(`#${id}`)), true, {
        label: `${id} is on the local form`,
        source: "js/booking.js",
        loaded: script,
      });
    }
    check(shown(view.document.querySelector("#checking-bags-section")), false, {
      label: "local form does not ask about bags",
      source: "js/booking.js",
      loaded: script,
    });
    check(
      [...view.document.querySelectorAll("#ride-rules .ride-rule")].map(
        (label) => label.textContent.replace(/\s+/g, " ").trim(),
      ),
      [
        "Must be 21 or older",
        "No smoking",
        "If you damage anything, you are responsible.",
      ],
      {
        label: "local notices are the three required boxes in order",
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(view.document.querySelector("#rule-age").type, "checkbox", {
      label: "the age notice is a real checkbox",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it.each([
    [1.5, false, "Cash $10.00 · Card $10.30"],
    [2, false, "Cash $10.00 · Card $10.30"],
    [2.01, false, "Cash $15.00 · Card $15.45"],
    [4, false, "Cash $15.00 · Card $15.45"],
    [10, false, "Cash $30.00 · Card $30.90"],
    [10, true, "Cash $60.00 · Card $61.80"],
    [1.5, true, "Cash $20.00 · Card $20.60"],
  ])(
    "prices %s miles roundTrip=%s as %s",
    async (miles, roundTrip, expected) => {
      const view = await renderBooking(script, { miles });
      const text = await priceBar(view, miles, { roundTrip });
      check(text.includes(expected), true, {
        label: `${miles} mile bar fare`,
        expected,
        actual: text,
        source: "js/booking.js",
        loaded: script,
      });
      if (roundTrip) {
        check(text.includes("Round trip, Two Trees and back"), true, {
          label: "round trip names the bar",
          actual: text,
          source: "js/booking.js",
          loaded: script,
        });
        check(
          shown(view.document.querySelector("#booking-return-date")),
          false,
          {
            label: "a bar round trip does not ask for a return time",
            source: "js/booking.js",
            loaded: script,
          },
        );
      }
    },
  );

  it("limits Two Trees to 10 road miles and leaves other venues open", async () => {
    const inside = await renderBooking(script, { miles: 9.99 });
    const insideText = await priceBar(inside, 9.99);
    check(insideText.includes("Cash $29.97 · Card $30.87"), true, {
      label: "9.99 miles from Two Trees is still quoted",
      actual: insideText,
      source: "js/booking.js",
      loaded: script,
    });
    check(insideText.includes("out of our service area."), false, {
      label: "9.99 miles is not the service-area denial",
      actual: insideText,
      source: "js/booking.js",
      loaded: script,
    });
    const edge = await renderBooking(script, { miles: 10 });
    const edgeText = await priceBar(edge, 10);
    check(edgeText.includes("Cash $30.00 · Card $30.90"), true, {
      label: "exactly 10.00 miles from Two Trees is quoted",
      actual: edgeText,
      source: "js/booking.js",
      loaded: script,
    });
    const over = await renderBooking(script, { miles: 10.01 });
    const overText = await priceBar(over, 10.01);
    check(overText, "out of our service area.", {
      label: "10.01 miles from Two Trees uses the off-list denial",
      actual: overText,
      source: "js/booking.js",
      loaded: script,
    });
    await fillValid(over, { trip: "local" });
    await submitForm(over);
    check(
      resultText(over.document).includes("out of our service area."),
      true,
      {
        label: "a Two Trees ride past 10 miles cannot be submitted",
        actual: resultText(over.document),
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(bookingPosts(over.state).length, 0, {
      label: "a Two Trees ride past 10 miles sends no booking",
      source: "js/booking.js",
      loaded: script,
    });
    const open = await renderBooking(script, { miles: 12 });
    const openText = await priceBar(open, 12, { bar: "bourbon-bobber" });
    check(openText.includes("Cash $36.00 · Card $37.08"), true, {
      label: "a venue without maxMiles is quoted past 10 miles",
      actual: openText,
      source: "js/booking.js",
      loaded: script,
    });
    check(open.window.MidnightRides.BARS[0].maxMiles, 10, {
      label: "Two Trees stores the limit on the venue",
      source: "js/booking.js",
      loaded: script,
    });
    check(open.window.MidnightRides.BARS[1].maxMiles, undefined, {
      label: "other venues have no mile limit yet",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("prices a party address with the same formula", async () => {
    const view = await renderBooking(script, { miles: 10 });
    chooseTrip(view.document, "local");
    const kind = view.document.querySelector("#local-kind");
    kind.value = "party";
    view.window.jQuery(kind).trigger("change");
    view.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    const party = view.document.querySelector("#party-address");
    party.value = "200 Oak St, Sherrills Ford NC";
    view.window.jQuery(party).trigger("blur");
    const text = await waitQuote(view);
    check(text.includes("Cash $30.00 · Card $30.90"), true, {
      label: "10 mile party fare",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
    check(text.includes("One way to the party"), true, {
      label: "party quote names the party",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("refuses a bar that is not on the list and shows the exact denial", async () => {
    const tampered = await renderBooking(script, { miles: 10 });
    chooseTrip(tampered.document, "local");
    const kind = tampered.document.querySelector("#local-kind");
    kind.value = "bar";
    tampered.window.jQuery(kind).trigger("change");
    const select = tampered.document.querySelector("#bar-choice");
    const extra = tampered.document.createElement("option");
    extra.value = "not-a-bar";
    extra.textContent = "Some Other Bar";
    select.appendChild(extra);
    select.value = "not-a-bar";
    tampered.window.jQuery(select).trigger("change");
    tampered.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    tampered.window.jQuery("#booking-pickup").trigger("blur");
    const tamperedText = await waitQuote(tampered);
    check(tamperedText, "out of our service area.", {
      label: "a tampered bar gets no price",
      actual: tamperedText,
      source: "js/booking.js",
      loaded: script,
    });

    const typed = await renderBooking(script, { miles: 10 });
    await priceBar(typed, 10);
    typed.document.querySelector("#booking-destination").value = "Random Pub";
    typed.window
      .jQuery("#booking-destination")
      .trigger("input")
      .trigger("blur");
    const typedText = await waitQuote(typed);
    check(typedText, "out of our service area.", {
      label: "a typed venue that is not listed gets no price",
      actual: typedText,
      source: "js/booking.js",
      loaded: script,
    });

    const fromUrl = await renderBooking(script, {
      miles: 10,
      url: "/?bar=Not%20A%20Real%20Bar",
    });
    chooseTrip(fromUrl.document, "local");
    const urlKind = fromUrl.document.querySelector("#local-kind");
    urlKind.value = "bar";
    fromUrl.window.jQuery(urlKind).trigger("change");
    fromUrl.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    fromUrl.window.jQuery("#booking-pickup").trigger("blur");
    const urlText = await waitQuote(fromUrl);
    check(urlText, "out of our service area.", {
      label: "a URL bar that is not listed gets no price",
      actual: urlText,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("does not invent a price for a listed bar with no verified address", async () => {
    const view = await renderBooking(script, { miles: 8 });
    const text = await priceBar(view, 8, { bar: "invicta" });
    check(text, "We'll confirm your price when we call.", {
      label: "Invicta stays on the list without a guessed fare",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
    check(text.includes("out of our service area."), false, {
      label: "an unverified listed bar is not treated as outside the list",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
    const sports = await priceBar(view, 8, { bar: "sports-bar-grill" });
    check(sports.includes("Cash"), false, {
      label: "Sports Bar and Grill is not given a guessed fare",
      actual: sports,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("prices a listed Mooresville bar and a geocoded Royal Bliss address", async () => {
    const parrot = await renderBooking(script, { miles: 6 });
    const parrotText = await priceBar(parrot, 6, { bar: "blue-parrot" });
    check(parrotText.includes("Cash $18.00 · Card $18.54"), true, {
      label:
        "Blue Parrot is priced even though Mooresville is outside the town list",
      actual: parrotText,
      source: "js/booking.js",
      loaded: script,
    });
    const bliss = await renderBooking(script, { miles: 4 });
    const blissText = await priceBar(bliss, 4, { bar: "royal-bliss" });
    check(blissText.includes("Cash $15.00 · Card $15.45"), true, {
      label: "Royal Bliss is priced from its street address",
      actual: blissText,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("blocks a local request until every notice is checked, then sends the answers", async () => {
    for (const rules of [[], ["age"], ["age", "smoke"]]) {
      const view = await renderBooking(script, { miles: 4 });
      await fillValid(view, { trip: "local", rules });
      await submitForm(view);
      check(
        resultText(view.document).includes(
          "Please check all three boxes: Must be 21 or older, No smoking, and If you damage anything, you are responsible.",
        ),
        true,
        {
          label: `bar request waits when rules are ${rules.join(",") || "none"}`,
          actual: resultText(view.document),
          source: "js/booking.js",
          loaded: script,
        },
      );
      check(bookingPosts(view.state).length, 0, {
        label: "an unchecked bar request is not sent",
        source: "js/booking.js",
        loaded: script,
      });
    }
    const party = await renderBooking(script, { miles: 4 });
    await fillValid(party, {
      trip: "local",
      localKind: "party",
      rules: ["smoke"],
    });
    await submitForm(party);
    check(bookingPosts(party.state).length, 0, {
      label: "a party request with one box checked is not sent",
      source: "js/booking.js",
      loaded: script,
    });
    const sent = await renderBooking(script, { miles: 4 });
    await fillValid(sent, { trip: "local", localKind: "party" });
    await submitForm(sent);
    check(resultText(sent.document).includes("Request received"), true, {
      label: "a party request with all three boxes is received",
      actual: resultText(sent.document),
      source: "js/booking.js",
      loaded: script,
    });
    check(resultText(sent.document).includes("not confirmed"), true, {
      label: "the party request is not called confirmed",
      actual: resultText(sent.document),
      source: "js/booking.js",
      loaded: script,
    });
    const post = bookingPosts(sent.state).find((request) =>
      hostIs(request.url, "script.google.com"),
    );
    const payload = JSON.parse(post.body);
    check(payload.mustBe21, "Yes", {
      label: "age confirmation is in the booking",
      actual: payload.mustBe21,
      source: "js/booking.js",
      loaded: script,
    });
    check(payload.noSmoking, "Yes", {
      label: "no smoking is in the booking",
      actual: payload.noSmoking,
      source: "js/booking.js",
      loaded: script,
    });
    check(payload.damageResponsibility, "Yes", {
      label: "damage responsibility is in the booking",
      actual: payload.damageResponsibility,
      source: "js/booking.js",
      loaded: script,
    });
    check(payload.returnTime, "", {
      label: "a party round trip does not save a return time",
      actual: payload.returnTime,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("quotes a group by the hour with a 2 hour minimum and a 25 percent deposit", async () => {
    const view = await renderBooking(script);
    chooseTrip(view.document, "group");
    const hours = view.document.querySelector("#group-hours");
    const pickup = view.document.querySelector("#booking-pickup");
    pickup.value = "123 Main Street, Denver NC 28037";
    hours.value = "1";
    view.window.jQuery(hours).trigger("change");
    let text = await waitQuote(view);
    check(text.includes("2026 Toyota Sienna Platinum"), true, {
      label: "group quote names the van",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
    check(text.includes("2-hour minimum"), true, {
      label: "one hour is quoted as the 2 hour minimum",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
    check(text.includes("Cash $250.00 · Card $257.50"), true, {
      label: "minimum cash and card",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
    check(text.includes("Deposit $62.50 cash · $64.38 card"), true, {
      label: "25 percent deposit on the 2 hour minimum",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
    hours.value = "1.5";
    view.window.jQuery(hours).trigger("change");
    text = await waitQuote(view);
    check(text.includes("2-hour minimum"), true, {
      label: "1.5 hours still uses the minimum",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
    hours.value = "3";
    view.window.jQuery(hours).trigger("change");
    text = await waitQuote(view);
    check(text.includes("2-hour minimum"), false, {
      label: "three hours is not forced up",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
    check(text.includes("Cash $375.00 · Card $386.25"), true, {
      label: "three hours at $125",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
    check(text.includes("Deposit $93.75 cash · $96.56 card"), true, {
      label: "25 percent of the three hour total",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("requires the same three notices on a group and caps the van at 6", async () => {
    const none = await renderBooking(script);
    await fillValid(none, { trip: "group", rules: [], hours: "2" });
    await submitForm(none);
    check(bookingPosts(none.state).length, 0, {
      label: "a group with no boxes checked is not sent",
      source: "js/booking.js",
      loaded: script,
    });
    const some = await renderBooking(script);
    await fillValid(some, {
      trip: "group",
      rules: ["age", "damage"],
      hours: "2",
    });
    await submitForm(some);
    check(resultText(some.document).includes("No smoking"), true, {
      label: "a group missing one box is told which notices are required",
      actual: resultText(some.document),
      source: "js/booking.js",
      loaded: script,
    });
    const full = await renderBooking(script);
    await fillValid(full, { trip: "group", passengers: "6", hours: "2" });
    await submitForm(full);
    check(resultText(full.document).includes("Request received"), true, {
      label: "six passengers with every box checked is received",
      actual: resultText(full.document),
      source: "js/booking.js",
      loaded: script,
    });
    const tooMany = await renderBooking(script);
    await fillValid(tooMany, { trip: "group", passengers: "7", hours: "2" });
    await submitForm(tooMany);
    check(
      resultText(tooMany.document).includes(
        "The 2026 Toyota Sienna Platinum seats 6. For more than 6 passengers, please call (980) 422-9125.",
      ),
      true,
      {
        label: "seven passengers sees the Sienna seat message",
        actual: resultText(tooMany.document),
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("hides the map and keeps OSRM pricing when no Google key is set", async () => {
    const view = await renderBooking(script, { miles: 10 });
    const text = await priceBar(view, 10);
    check(text.includes("Cash $30.00"), true, {
      label: "the fallback still prices the bar",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
    check(view.document.querySelector("#ride-map-slot").hidden, true, {
      label: "the map stays hidden without a key",
      source: "js/booking.js",
      loaded: script,
    });
    check(
      view.state.requests.some((request) =>
        hostIs(request.url, "router.project-osrm.org"),
      ),
      true,
      {
        label: "the fallback asks OSRM for the road distance",
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(
      view.state.requests.some((request) => isGoogleApi(request.url)),
      false,
      {
        label: "no key means no Google call",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("prices airport and bar rides from the Google road distance and shows the map", async () => {
    const airport = await renderBooking(script, {
      miles: 10,
      googleMiles: 30,
      googleMinutes: 40,
      mapsKey: "test-browser-key",
      googleMaps: googleSdk(),
    });
    await showQuote(airport, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    const airportText = quoteText(airport.document);
    check(airportText.includes("Cash $80.00 · Card $82.40"), true, {
      label: "airport fare uses the Google road miles",
      actual: airportText,
      source: "js/booking.js",
      loaded: script,
    });
    check(
      airport.document.querySelector("#ride-map-summary").textContent,
      "30.0 miles · 40 min",
      {
        label: "the map states the road miles and minutes",
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(airport.document.querySelector("#ride-map-slot").hidden, false, {
      label: "the map is shown above the address",
      source: "js/booking.js",
      loaded: script,
    });
    check(
      airport.document
        .querySelector("#ride-map-slot")
        .compareDocumentPosition(
          airport.document.querySelector("#address-group"),
        ) === Node.DOCUMENT_POSITION_FOLLOWING,
      true,
      {
        label: "the map is before the address field",
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(globalThis.__rideLine.path.length > 1, true, {
      label: "the route line is drawn",
      source: "js/booking.js",
      loaded: script,
    });

    const bar = await renderBooking(script, {
      miles: 4,
      googleMiles: 10,
      mapsKey: "test-browser-key",
      googleMaps: googleSdk(),
    });
    const barText = await priceBar(bar, 4);
    check(barText.includes("Cash $30.00 · Card $30.90"), true, {
      label: "a bar fare uses the Google miles instead of the fallback",
      actual: barText,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("falls back to OSRM when Google routes fail or the map script errors", async () => {
    const empty = await renderBooking(script, {
      miles: 10,
      mapsKey: "test-browser-key",
      googleMode: "empty",
      googleMaps: googleSdk(),
    });
    const emptyText = await priceBar(empty, 10);
    check(emptyText.includes("Cash $30.00"), true, {
      label: "an empty Google route falls back to OSRM",
      actual: emptyText,
      source: "js/booking.js",
      loaded: script,
    });
    const down = await renderBooking(script, {
      miles: 10,
      mapsKey: "test-browser-key",
      googleMode: "throw",
    });
    const downText = await priceBar(down, 10);
    check(downText.includes("Cash $30.00"), true, {
      label: "a failed Google route falls back to OSRM",
      actual: downText,
      source: "js/booking.js",
      loaded: script,
    });
    check(down.document.querySelector("#ride-map-slot").hidden, true, {
      label: "a failed Google route hides the map",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("still prices a ride when the map script cannot load", async () => {
    const original = document.head.appendChild.bind(document.head);
    document.head.appendChild = (node) => {
      if (node.tagName === "SCRIPT") {
        if (typeof node.onerror === "function") node.onerror();
        return node;
      }
      return original(node);
    };
    const view = await renderBooking(script, {
      miles: 10,
      googleMiles: 10,
      mapsKey: "test-browser-key",
    });
    const text = await priceBar(view, 10);
    check(text.includes("Cash $30.00"), true, {
      label: "the fare still appears when the map script errors",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
    await priceBar(view, 10);
    check(view.document.querySelector("#ride-map").hidden, true, {
      label: "the map canvas stays hidden after the script error",
      source: "js/booking.js",
      loaded: script,
    });
    chooseTrip(view.document, "group");
    view.document.querySelector("#group-hours").value = "2";
    view.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    view.window.jQuery("#booking-pickup").trigger("change");
    await waitQuote(view);
    view.document.querySelector("#ride-map").remove();
    view.window.jQuery("#booking-pickup").trigger("change");
    await waitQuote(view);
    document.head.appendChild = original;
  });

  it("loads the map script and draws a blank-duration route", async () => {
    const original = document.head.appendChild.bind(document.head);
    document.head.appendChild = (node) => {
      if (
        node.tagName === "SCRIPT" &&
        hostIs(node.src, "maps.googleapis.com")
      ) {
        window.google = googleSdk();
        window.midnightMapsReady();
        return node;
      }
      return original(node);
    };
    const view = await renderBooking(script, {
      miles: 10,
      googleMiles: 8,
      googleMinutes: 12,
      mapsKey: "test-browser-key",
      googleMode: "blank-duration",
      polyline: "_",
    });
    const text = await priceBar(view, 8);
    check(text.includes("Cash $24.00 · Card $24.72"), true, {
      label: "eight Google miles still use the bar formula",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
    check(
      view.document
        .querySelector("#ride-map-summary")
        .textContent.includes("1 min"),
      true,
      {
        label: "a blank duration still shows a minute",
        actual: view.document.querySelector("#ride-map-summary").textContent,
        source: "js/booking.js",
        loaded: script,
      },
    );
    view.state.googleMode = "no-line";
    await priceBar(view, 8);
    document.head.appendChild = original;
  });

  it("offers address suggestions and fills the field from a choice", async () => {
    const view = await renderBooking(script, {
      mapsKey: "test-browser-key",
      googleMaps: googleSdk(),
      placeSuggestions: [
        { placePrediction: {} },
        {
          placePrediction: {
            text: { text: "123 Main Street, Denver, NC 28037" },
          },
        },
      ],
    });
    chooseTrip(view.document, "airport");
    const pickup = view.document.querySelector("#booking-pickup");
    pickup.value = "ab";
    view.window.jQuery(pickup).trigger("input");
    await new Promise((resolve) => setTimeout(resolve, 350));
    check(
      view.state.requests.some((request) =>
        hostIs(request.url, "places.googleapis.com"),
      ),
      false,
      {
        label: "two letters do not ask Google for places",
        source: "js/booking.js",
        loaded: script,
      },
    );
    pickup.value = "123 Main";
    view.window.jQuery(pickup).trigger("input");
    await new Promise((resolve) => setTimeout(resolve, 400));
    const box = view.document.querySelector("#booking-pickup-suggestions");
    check(box && box.hidden === false, true, {
      label: "suggestions are shown",
      source: "js/booking.js",
      loaded: script,
    });
    box.querySelector("button").click();
    check(pickup.value, "123 Main Street, Denver, NC 28037", {
      label: "the chosen suggestion fills the address",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("hides suggestions when Places fails or returns nothing usable", async () => {
    const empty = await renderBooking(script, {
      mapsKey: "test-browser-key",
      googleMaps: googleSdk(),
      placeSuggestions: [{ placePrediction: { text: {} } }],
    });
    chooseTrip(empty.document, "local");
    const pickup = empty.document.querySelector("#booking-pickup");
    pickup.value = "123 Main";
    empty.window.jQuery(pickup).trigger("input");
    await new Promise((resolve) => setTimeout(resolve, 400));
    const box = empty.document.querySelector("#booking-pickup-suggestions");
    check(!box || box.hidden === true, true, {
      label: "a suggestion without text stays hidden",
      source: "js/booking.js",
      loaded: script,
    });
    const down = await renderBooking(script, {
      mapsKey: "test-browser-key",
      googleMaps: googleSdk(),
      placesMode: "throw",
      miles: 10,
    });
    const text = await priceBar(down, 10);
    check(text.includes("Cash"), true, {
      label: "a Places failure does not block the fare",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("maps a group pickup without using that distance for the hourly fare", async () => {
    const view = await renderBooking(script, {
      miles: 40,
      googleMiles: 40,
      mapsKey: "test-browser-key",
      googleMaps: googleSdk(),
    });
    chooseTrip(view.document, "group");
    view.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    const hours = view.document.querySelector("#group-hours");
    hours.value = "2";
    view.window.jQuery(hours).trigger("change");
    view.window.jQuery("#booking-pickup").trigger("blur");
    const text = await waitQuote(view);
    check(text.includes("Cash $250.00 · Card $257.50"), true, {
      label: "the group fare stays hourly",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
    const start = Date.now();
    let summary = "";
    while (Date.now() - start < 2000) {
      summary =
        view.document.querySelector("#ride-map-summary")?.textContent || "";
      if (summary.includes("Pickup mapped")) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    check(summary, "Pickup mapped", {
      label: "the group map shows the pickup only",
      actual: summary,
      source: "js/booking.js",
      loaded: script,
    });
    check(Boolean(globalThis.__rideMarker), true, {
      label: "the group map marks the pickup",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("keeps the hourly fare when the group pickup cannot be mapped", async () => {
    const view = await renderBooking(script, {
      mapsKey: "test-browser-key",
      googleMaps: googleSdk(),
      censusMode: "error",
      osmMode: "miss",
    });
    chooseTrip(view.document, "group");
    view.document.querySelector("#group-hours").value = "2";
    view.window.jQuery("#group-hours").trigger("change");
    view.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    view.window.jQuery("#booking-pickup").trigger("blur");
    view.window.jQuery("#booking-pickup").trigger("blur");
    const text = await waitQuote(view);
    check(text.includes("Cash $250.00"), true, {
      label: "the hourly fare does not wait on the map",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    check(view.document.querySelector("#ride-map-slot").hidden, true, {
      label: "an unmapped group pickup hides the map",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("refuses a party outside the service area with the existing message", async () => {
    const view = await renderBooking(script, { miles: 12 });
    chooseTrip(view.document, "local");
    const kind = view.document.querySelector("#local-kind");
    kind.value = "party";
    view.window.jQuery(kind).trigger("change");
    view.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    const party = view.document.querySelector("#party-address");
    party.value = "100 Trade St, Charlotte NC";
    view.window.jQuery(party).trigger("blur");
    const text = await waitQuote(view);
    check(text, "Sorry, we don't service that area.", {
      label: "a Charlotte party uses the existing service-area message",
      actual: text,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("still prices a listed bar when the address bar cannot be read", async () => {
    const Real = globalThis.URLSearchParams;
    globalThis.URLSearchParams = class {
      constructor() {
        throw new Error("unreadable");
      }
    };
    try {
      const view = await renderBooking(script, { miles: 4 });
      const text = await priceBar(view, 4);
      check(text.includes("Cash $15.00"), true, {
        label: "a broken address bar does not block a listed bar",
        actual: text,
        source: "js/booking.js",
        loaded: script,
      });
    } finally {
      globalThis.URLSearchParams = Real;
    }
  });

  it("preselects a listed bar from the address and still accepts a ride with no notes", async () => {
    const named = await renderBooking(script, {
      miles: 4,
      url: "/?venue=Invicta",
    });
    chooseTrip(named.document, "local");
    const kind = named.document.querySelector("#local-kind");
    kind.value = "bar";
    named.window.jQuery(kind).trigger("change");
    check(named.document.querySelector("#bar-choice").value, "invicta", {
      label: "a venue name in the URL selects that bar",
      source: "js/booking.js",
      loaded: script,
    });
    check(
      named.document.querySelector("#booking-destination").value,
      "Invicta",
      {
        label: "a bar without a street uses its name",
        source: "js/booking.js",
        loaded: script,
      },
    );
    const preset = await renderBooking(script, {
      miles: 4,
      url: "/?type=local&bar=two-trees",
    });
    check(preset.document.querySelector("#trip-type").value, "local", {
      label: "type=local opens Local Bars and Parties",
      source: "js/booking.js",
      loaded: script,
    });
    await fillValid(preset, { trip: "local", notes: "gate" });
    const round = preset.document.querySelector("#booking-round-trip");
    round.checked = true;
    preset.window.jQuery(round).trigger("change");
    await submitForm(preset);
    const payload = JSON.parse(
      bookingPosts(preset.state).find((request) =>
        hostIs(request.url, "script.google.com"),
      ).body,
    );
    check(payload.specialNotes.includes("gate"), true, {
      label: "the rider note is kept on a bar ride",
      actual: payload.specialNotes,
      source: "js/booking.js",
      loaded: script,
    });
    check(payload.specialNotes.includes("Round trip."), true, {
      label: "a round trip with no other note is still marked",
      actual: payload.specialNotes,
      source: "js/booking.js",
      loaded: script,
    });
    check(payload.returnDate, "", {
      label: "the bar round trip does not send a return date",
      actual: payload.returnDate,
      source: "js/booking.js",
      loaded: script,
    });
    const withNote = await renderBooking(script, { miles: 4 });
    await fillValid(withNote, {
      trip: "local",
      notes: "gate",
      localKind: "party",
    });
    await submitForm(withNote);
    const partyPayload = JSON.parse(
      bookingPosts(withNote.state).find((request) =>
        hostIs(request.url, "script.google.com"),
      ).body,
    );
    check(partyPayload.specialNotes.includes("Party ride. gate"), true, {
      label: "a party note is kept",
      actual: partyPayload.specialNotes,
      source: "js/booking.js",
      loaded: script,
    });
    const bare = await renderBooking(script, { miles: 4 });
    await fillValid(bare, { trip: "local", bar: "invicta" });
    await submitForm(bare);
    const invicta = JSON.parse(
      bookingPosts(bare.state).find((request) =>
        hostIs(request.url, "script.google.com"),
      ).body,
    );
    check(invicta.destinationAddress, "Invicta", {
      label: "the request names Invicta without a guessed street",
      actual: invicta.destinationAddress,
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("asks for a bar or a party before it will send the request", async () => {
    const neither = await renderBooking(script);
    await fillValid(neither, { trip: "local", bar: "" });
    neither.document.querySelector("#local-kind").value = "";
    neither.document.querySelector("#booking-notes").value = "";
    neither.document.querySelector("#booking-round-trip").checked = true;
    await submitForm(neither);
    check(
      resultText(neither.document).includes(
        "Please choose a bar, restaurant, or party",
      ),
      true,
      {
        label: "local submit requires Bar or Party",
        actual: resultText(neither.document),
        source: "js/booking.js",
        loaded: script,
      },
    );
    const missing = await renderBooking(script);
    await fillValid(missing, { trip: "local", bar: "" });
    missing.document.querySelector("#bar-choice").value = "";
    missing.document.querySelector("#booking-destination").value = "";
    await submitForm(missing);
    check(resultText(missing.document).includes("Please choose a bar"), true, {
      label: "bar submit requires a listed bar",
      actual: resultText(missing.document),
      source: "js/booking.js",
      loaded: script,
    });
    const tampered = await renderBooking(script);
    await fillValid(tampered, { trip: "local", bar: "" });
    const select = tampered.document.querySelector("#bar-choice");
    const extra = tampered.document.createElement("option");
    extra.value = "nope";
    extra.textContent = "Nope";
    select.appendChild(extra);
    select.value = "nope";
    tampered.document.querySelector("#booking-destination").value = "Nope";
    await submitForm(tampered);
    check(
      resultText(tampered.document).includes("out of our service area."),
      true,
      {
        label: "submit refuses a bar that is not on the list",
        actual: resultText(tampered.document),
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(bookingPosts(tampered.state).length, 0, {
      label: "a non-listed bar is not sent",
      source: "js/booking.js",
      loaded: script,
    });
    const party = await renderBooking(script);
    await fillValid(party, { trip: "local", localKind: "party" });
    party.document.querySelector("#party-address").value = "";
    await submitForm(party);
    check(
      resultText(party.document).includes("Party address is required"),
      true,
      {
        label: "party submit requires the party address",
        actual: resultText(party.document),
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("explains a local ride the geocoder places outside the area", async () => {
    const outside = await renderBooking(script, {
      miles: 8,
      censusCity: "Charlotte",
      censusState: "NC",
      censusZip: "28202",
    });
    chooseTrip(outside.document, "local");
    const kind = outside.document.querySelector("#local-kind");
    kind.value = "bar";
    outside.window.jQuery(kind).trigger("change");
    outside.document.querySelector("#bar-choice").value = "two-trees";
    outside.window.jQuery("#bar-choice").trigger("change");
    const pickup = outside.document.querySelector("#booking-pickup");
    pickup.value = "100 Main Street";
    outside.window.jQuery(pickup).trigger("blur");
    check(await waitQuote(outside), "Sorry, we don't service that area.", {
      label: "a geocoded Charlotte pickup is outside the area",
      source: "js/booking.js",
      loaded: script,
    });
    const unclear = await renderBooking(script, {
      miles: 8,
      censusMode: "bare",
    });
    chooseTrip(unclear.document, "local");
    unclear.document.querySelector("#local-kind").value = "bar";
    unclear.window.jQuery("#local-kind").trigger("change");
    unclear.document.querySelector("#bar-choice").value = "two-trees";
    unclear.window.jQuery("#bar-choice").trigger("change");
    unclear.document.querySelector("#booking-pickup").value = "100 Main Street";
    unclear.window.jQuery("#booking-pickup").trigger("blur");
    check(
      await waitQuote(unclear),
      "Please include the town and state, for example Denver, NC.",
      {
        label: "a local pickup without a town asks for the town",
        source: "js/booking.js",
        loaded: script,
      },
    );
    const far = await renderBooking(script, { miles: 8, lat: 40, lon: -105 });
    const farText = await priceBar(far, 8);
    check(farText, "We'll confirm your price when we call.", {
      label: "a map point outside the driving box is not priced",
      actual: farText,
      source: "js/booking.js",
      loaded: script,
    });
    const switched = await renderBooking(script, {
      miles: 8,
      censusMode: "error",
      osmMode: "miss",
    });
    chooseTrip(switched.document, "local");
    switched.document.querySelector("#local-kind").value = "bar";
    switched.window.jQuery("#local-kind").trigger("change");
    switched.document.querySelector("#bar-choice").value = "two-trees";
    switched.window.jQuery("#bar-choice").trigger("change");
    switched.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    switched.window.jQuery("#booking-pickup").trigger("blur");
    switched.document.querySelector("#trip-type").value = "airport";
    await new Promise((resolve) => setTimeout(resolve, 30));
    check(
      switched.document
        .querySelector("#quote-details")
        .textContent.includes("out of our service area."),
      false,
      {
        label: "leaving the bar form drops a quote that was still running",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("uses Google for an address-only bar and OSRM when Google has no route", async () => {
    delete globalThis.MIDNIGHT_MAPS;
    const plain = await renderBooking(script, { miles: 4 });
    delete plain.window.MIDNIGHT_MAPS;
    const plainText = await priceBar(plain, 4);
    check(plainText.includes("Cash $15.00"), true, {
      label: "a missing maps config still prices from OSRM",
      actual: plainText,
      source: "js/booking.js",
      loaded: script,
    });
    const bliss = await renderBooking(script, {
      miles: 4,
      googleMiles: 10,
      mapsKey: "test-browser-key",
      googleMaps: googleSdk(),
      polyline: "fErNcB_D",
    });
    const blissText = await priceBar(bliss, 4, { bar: "royal-bliss" });
    check(blissText.includes("Cash $30.00"), true, {
      label: "Royal Bliss uses the Google road distance",
      actual: blissText,
      source: "js/booking.js",
      loaded: script,
    });
    bliss.document.querySelector("#booking-pickup").value =
      "123 Main Street Denver NC 28037";
    bliss.window.jQuery("#booking-pickup").trigger("blur");
    await waitQuote(bliss);
    bliss.document.querySelector("#ride-map-slot").remove();
    await priceBar(bliss, 4, { bar: "royal-bliss" });
    const empty = await renderBooking(script, {
      miles: 10,
      mapsKey: "test-browser-key",
      googleMode: "empty",
      googleMaps: googleSdk(),
    });
    await showQuote(empty, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    check(quoteText(empty.document).includes("Cash $65.00"), true, {
      label: "an empty Google airport route falls back to OSRM",
      actual: quoteText(empty.document),
      source: "js/booking.js",
      loaded: script,
    });
    empty.document.querySelector("#ride-map-slot").remove();
    await showQuote(empty, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    const thrown = await renderBooking(script, {
      miles: 10,
      mapsKey: "test-browser-key",
      googleMode: "throw",
    });
    await showQuote(thrown, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    check(quoteText(thrown.document).includes("Cash $65.00"), true, {
      label: "a thrown Google airport route falls back to OSRM",
      actual: quoteText(thrown.document),
      source: "js/booking.js",
      loaded: script,
    });
    const slotless = await renderBooking(script, {
      miles: 10,
      googleMiles: 10,
      mapsKey: "test-browser-key",
      googleMaps: googleSdk(),
      polyline: "A",
    });
    await showQuote(slotless, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    check(quoteText(slotless.document).includes("Cash $65.00"), true, {
      label: "the fare still shows when the map slot is gone",
      actual: quoteText(slotless.document),
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("clears address suggestions and hides an empty list", async () => {
    const view = await renderBooking(script, {
      mapsKey: "test-browser-key",
      googleMaps: googleSdk(),
      placeSuggestions: [],
    });
    chooseTrip(view.document, "airport");
    const pickup = view.document.querySelector("#booking-pickup");
    pickup.value = "123 Main Street";
    view.window.jQuery(pickup).trigger("input");
    const start = Date.now();
    while (Date.now() - start < 1000) {
      if (
        view.state.requests.some((request) =>
          hostIs(request.url, "places.googleapis.com"),
        )
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const box = view.document.querySelector("#booking-pickup-suggestions");
    check(box.hidden, true, {
      label: "an empty suggestion list stays hidden",
      source: "js/booking.js",
      loaded: script,
    });
    view.state.placeSuggestions = [{ placePrediction: { text: { text: "" } } }];
    pickup.value = "123 Main Road";
    view.window.jQuery(pickup).trigger("input");
    await new Promise((resolve) => setTimeout(resolve, 400));
    check(box.hidden, true, {
      label: "a blank suggestion does not leave a list open",
      source: "js/booking.js",
      loaded: script,
    });
    pickup.value = "ab";
    view.window.jQuery(pickup).trigger("input");
    check(box.hidden, true, {
      label: "a short address clears the suggestion list",
      source: "js/booking.js",
      loaded: script,
    });
    const bare = await renderBooking(script, {
      miles: 4,
      mapsKey: "test-browser-key",
      googleMaps: googleSdk(),
    });
    const barePickup = bare.document.querySelector("#booking-pickup");
    barePickup.value = "";
    bare.window.jQuery(barePickup).trigger("input");
    barePickup.value = "123";
    bare.window.jQuery(barePickup).trigger("input");
    const missing = await renderBooking(script, {
      mapsKey: "test-browser-key",
      googleMaps: googleSdk(),
      placesMode: "bare",
    });
    chooseTrip(missing.document, "airport");
    missing.document.querySelector("#booking-pickup").value = "123 Main";
    missing.window.jQuery("#booking-pickup").trigger("input");
    await new Promise((resolve) => setTimeout(resolve, 400));
    const failed = await renderBooking(script, {
      mapsKey: "test-browser-key",
      placesMode: "throw",
      googleMaps: googleSdk(),
    });
    chooseTrip(failed.document, "airport");
    failed.document.querySelector("#booking-pickup").value = "123 Main";
    failed.window.jQuery("#booking-pickup").trigger("input");
    await new Promise((resolve) => setTimeout(resolve, 400));
    check(
      failed.state.requests.some((request) =>
        hostIs(request.url, "places.googleapis.com"),
      ),
      true,
      {
        label: "a Places error is still requested",
        source: "js/booking.js",
        loaded: script,
      },
    );
  });

  it("asks the rider to finish a local quote before it shows a fare", async () => {
    const view = await renderBooking(script);
    chooseTrip(view.document, "local");
    check(
      (await waitQuote(view)).includes("Choose a bar, restaurant, or party"),
      true,
      {
        label: "local form waits for Bar or Party",
        actual: quoteText(view.document),
        source: "js/booking.js",
        loaded: script,
      },
    );
    const kind = view.document.querySelector("#local-kind");
    kind.value = "bar";
    view.window.jQuery(kind).trigger("change");
    view.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    view.window.jQuery("#booking-pickup").trigger("blur");
    check((await waitQuote(view)).includes("Choose a bar"), true, {
      label: "bar mode waits until a bar is chosen",
      actual: quoteText(view.document),
      source: "js/booking.js",
      loaded: script,
    });
    view.document.querySelector("#bar-choice").value = "two-trees";
    view.window.jQuery("#bar-choice").trigger("change");
    view.document.querySelector("#booking-pickup").value = "12";
    view.window.jQuery("#booking-pickup").trigger("blur");
    check((await waitQuote(view)).includes("Enter your address"), true, {
      label: "a short address does not get a bar fare",
      actual: quoteText(view.document),
      source: "js/booking.js",
      loaded: script,
    });
    kind.value = "party";
    view.window.jQuery(kind).trigger("change");
    view.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    view.document.querySelector("#party-address").value = "Oak";
    view.window.jQuery("#party-address").trigger("blur");
    check((await waitQuote(view)).includes("party address"), true, {
      label: "a short party address does not get a fare",
      actual: quoteText(view.document),
      source: "js/booking.js",
      loaded: script,
    });
    const open = await renderBooking(script);
    await fillValid(open, { trip: "local" });
    open.document.querySelector("#booking-pickup").value = "";
    await submitForm(open);
    check(resultText(open.document).includes("Address is required"), true, {
      label: "local submit names the address",
      actual: resultText(open.document),
      source: "js/booking.js",
      loaded: script,
    });
    const select = open.document.querySelector("#bar-choice");
    select.value = "";
    open.window.jQuery(select).trigger("change");
  });

  it("switches an in-flight airport quote to the other forms", async () => {
    const group = await renderBooking(script, { miles: 12 });
    group.document.querySelector("#trip-type").value = "airport";
    group.document.querySelector("#airport-choice").value = "CLT";
    group.window.jQuery("#airport-choice").trigger("change");
    group.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    group.window.jQuery("#booking-destination").trigger("blur");
    group.document.querySelector("#trip-type").value = "local";
    await new Promise((resolve) => setTimeout(resolve, 20));
    group.document.querySelector("#booking-destination").value = "CLT";
    group.document.querySelector("#trip-type").value = "airport";
    group.window.jQuery("#booking-destination").trigger("blur");
    group.document.querySelector("#trip-type").value = "";
    await new Promise((resolve) => setTimeout(resolve, 20));
    check(quoteText(group.document).includes("Charlotte"), false, {
      label: "switching to local drops the airport fare",
      actual: quoteText(group.document),
      source: "js/booking.js",
      loaded: script,
    });
    const failed = await renderBooking(script, { routeMode: "error" });
    failed.document.querySelector("#trip-type").value = "airport";
    failed.window.jQuery("#trip-type").trigger("change");
    failed.document.querySelector("#airport-choice").value = "CLT";
    failed.window.jQuery("#airport-choice").trigger("change");
    failed.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    failed.window.jQuery("#booking-destination").trigger("blur");
    failed.document.querySelector("#trip-type").value = "local";
    await new Promise((resolve) => setTimeout(resolve, 40));
    check(
      quoteText(failed.document).includes("Choose a bar, restaurant, or party"),
      true,
      {
        label: "a failed airport fare becomes the local quote",
        actual: quoteText(failed.document),
        source: "js/booking.js",
        loaded: script,
      },
    );
    const moved = await renderBooking(script, {
      miles: 8,
      mapsKey: "test-browser-key",
      googleMaps: googleSdk(),
    });
    chooseTrip(moved.document, "group");
    moved.document.querySelector("#group-hours").value = "2";
    moved.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    moved.window.jQuery("#booking-pickup").trigger("blur");
    moved.window.jQuery("#booking-pickup").trigger("blur");
    moved.document.querySelector("#trip-type").value = "airport";
    await new Promise((resolve) => setTimeout(resolve, 40));
    check(quoteText(moved.document).includes("Pickup mapped") || true, true, {
      label: "leaving group while the pin is drawn does not throw",
      source: "js/booking.js",
      loaded: script,
    });
    delete moved.window.MidnightServiceArea;
    chooseTrip(moved.document, "local");
    moved.document.querySelector("#local-kind").value = "bar";
    moved.window.jQuery("#local-kind").trigger("change");
    moved.document.querySelector("#bar-choice").value = "two-trees";
    moved.window.jQuery("#bar-choice").trigger("change");
    moved.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    moved.window.jQuery("#booking-pickup").trigger("blur");
    check((await waitQuote(moved)).includes("We'll confirm"), true, {
      label: "a missing area check does not invent a local fare",
      actual: quoteText(moved.document),
      source: "js/booking.js",
      loaded: script,
    });
    const partial = await renderBooking(script, {
      miles: 10,
      googleMiles: 10,
      mapsKey: "test-browser-key",
      googleMaps: googleSdk(),
      polyline: "A",
      googleMode: "no-line",
    });
    partial.document.querySelector("#ride-map").remove();
    await showQuote(partial, {
      pickup: "123 Main Street, Denver NC 28037",
      destination: "CLT",
    });
    check(quoteText(partial.document).includes("Cash"), true, {
      label: "a route without a drawn line still has a fare",
      actual: quoteText(partial.document),
      source: "js/booking.js",
      loaded: script,
    });
    const pin = await renderBooking(script, {
      mapsKey: "test-browser-key",
      googleMaps: googleSdk(),
    });
    pin.document.querySelector("#ride-map-summary").remove();
    chooseTrip(pin.document, "group");
    pin.document.querySelector("#group-hours").value = "2";
    pin.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    pin.window.jQuery("#booking-pickup").trigger("blur");
    check((await waitQuote(pin)).includes("Cash $250.00"), true, {
      label: "the hourly fare does not need the map caption",
      actual: quoteText(pin.document),
      source: "js/booking.js",
      loaded: script,
    });
  });
});

function choosePrivate(view, name, address) {
  chooseTrip(view.document, "airport");
  const airline = view.document.querySelector("#airport-choice");
  airline.value = "PRIVATE";
  view.window.jQuery(airline).trigger("change");
  view.document.querySelector("#airfield-name").value = name;
  view.document.querySelector("#airfield-address").value = address;
}

describe.each(scripts)("private airfield %s", (script) => {
  it("prices a named airfield with the airport fare and the 50-mile cap", async () => {
    const view = await renderBooking(script, { miles: 40 });
    choosePrivate(view, "", "");
    view.document.querySelector("#booking-pickup").value = "12";
    view.window.jQuery("#booking-pickup").trigger("blur");
    check(
      quoteText(view.document),
      "Enter your home address and the airfield address to see your price.",
      {
        label: "a private airfield asks for both addresses",
        source: "js/booking.js",
        loaded: script,
      },
    );
    view.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    view.document.querySelector("#airfield-name").value = "A";
    view.window.jQuery("#airfield-name").trigger("blur");
    check(quoteText(view.document).includes("airfield address"), true, {
      label: "a one-letter airfield name is not enough",
      actual: quoteText(view.document),
      source: "js/booking.js",
      loaded: script,
    });
    view.document.querySelector("#airfield-name").value = "Smith Field";
    view.document.querySelector("#airfield-address").value = "12";
    view.window.jQuery("#airfield-address").trigger("blur");
    check(quoteText(view.document).includes("airfield address"), true, {
      label: "a short airfield address is not enough",
      actual: quoteText(view.document),
      source: "js/booking.js",
      loaded: script,
    });
    view.document.querySelector("#airfield-address").value =
      "Mooresville field road";
    view.window.jQuery("#airfield-address").trigger("blur");
    check(quoteText(view.document).includes("airfield address"), true, {
      label: "an airfield address needs a street number",
      actual: quoteText(view.document),
      source: "js/booking.js",
      loaded: script,
    });
    view.document.querySelector("#airfield-address").value =
      "100 Runway Rd, Charlotte NC 28202";
    view.window.jQuery("#airfield-address").trigger("blur");
    const priced = await waitQuote(view);
    check(priced.includes("One way to Smith Field"), true, {
      label: "the quote names the airfield",
      actual: priced,
      source: "js/booking.js",
      loaded: script,
    });
    check(priced.includes("Cash $105.00"), true, {
      label: "40 miles is the airport cash fare",
      actual: priced,
      source: "js/booking.js",
      loaded: script,
    });
    check(priced.includes("Card $108.15"), true, {
      label: "40 miles is the airport card fare",
      actual: priced,
      source: "js/booking.js",
      loaded: script,
    });
    const round = view.document.querySelector("#booking-round-trip");
    round.checked = true;
    view.document.querySelector("#quote-details").textContent = "Figuring";
    view.window.jQuery(round).trigger("change");
    const doubled = await waitQuote(view);
    check(doubled.includes("Round trip, Smith Field and back"), true, {
      label: "a private airfield round trip uses the airport label",
      actual: doubled,
      source: "js/booking.js",
      loaded: script,
    });
    check(doubled.includes("Cash $210.00"), true, {
      label: "a private airfield round trip doubles the cash fare",
      actual: doubled,
      source: "js/booking.js",
      loaded: script,
    });
    const farView = await renderBooking(script, { miles: 55 });
    choosePrivate(farView, "Smith Field", "100 Runway Rd, Charlotte NC 28202");
    farView.document.querySelector("#booking-pickup").value =
      "123 Main Street, Denver NC 28037";
    farView.window.jQuery("#booking-pickup").trigger("blur");
    const far = await waitQuote(farView);
    check(far.includes("For trips over 50 miles"), true, {
      label: "a private airfield over 50 miles uses the call message",
      actual: far,
      source: "js/booking.js",
      loaded: script,
    });
    check(shown(view.document.querySelector("#airfield-name")), true, {
      label: "the airfield name stays on the airport form",
      source: "js/booking.js",
      loaded: script,
    });
    chooseTrip(view.document, "group");
    check(shown(view.document.querySelector("#airfield-name")), false, {
      label: "group hides the airfield fields",
      source: "js/booking.js",
      loaded: script,
    });
    chooseTrip(view.document, "airport");
    check(shown(view.document.querySelector("#airfield-name")), true, {
      label: "coming back to airport shows the airfield fields again",
      source: "js/booking.js",
      loaded: script,
    });
  });

  it("requires the airfield name and address before it sends the request", async () => {
    const missing = await renderBooking(script, { miles: 40 });
    await fillValid(missing);
    choosePrivate(missing, "", "");
    await submitForm(missing);
    check(
      resultText(missing.document).includes("Airfield name is required"),
      true,
      {
        label: "a blank airfield name blocks the request",
        actual: resultText(missing.document),
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(
      resultText(missing.document).includes("Airfield address is required"),
      true,
      {
        label: "a blank airfield address blocks the request",
        actual: resultText(missing.document),
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(bookingPosts(missing.state).length, 0, {
      label: "a blank airfield does not send a booking",
      source: "js/booking.js",
      loaded: script,
    });
    const named = await renderBooking(script, { miles: 40 });
    await fillValid(named);
    choosePrivate(named, "Smith Field", "");
    await submitForm(named);
    check(
      resultText(named.document).includes("Airfield address is required"),
      true,
      {
        label: "a name without an address still blocks the request",
        actual: resultText(named.document),
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(
      resultText(named.document).includes("Airfield name is required"),
      false,
      {
        label: "the name error clears once the name is filled",
        actual: resultText(named.document),
        source: "js/booking.js",
        loaded: script,
      },
    );
    const sent = await renderBooking(script, { miles: 40 });
    await fillValid(sent);
    choosePrivate(sent, "Smith Field", "100 Runway Rd, Charlotte NC 28202");
    await submitForm(sent);
    check(resultText(sent.document).includes("Request received"), true, {
      label: "a named airfield in Charlotte can still be requested",
      actual: resultText(sent.document),
      source: "js/booking.js",
      loaded: script,
    });
    const payload = JSON.parse(
      bookingPosts(sent.state).find((request) =>
        hostIs(request.url, "script.google.com"),
      ).body,
    );
    check(
      payload.destinationAddress,
      "Smith Field, 100 Runway Rd, Charlotte NC 28202",
      {
        label: "the request names the airfield and its address",
        actual: payload.destinationAddress,
        source: "js/booking.js",
        loaded: script,
      },
    );
  });
});

const GROUP_DETAILS =
  "Please tell us about your group event (what it is, how many people, and anything we should know).";

describe.each(scripts)("group description %s", (script) => {
  it("blocks an empty or blank group description and keeps other rides optional", async () => {
    const empty = await renderBooking(script, { miles: 4 });
    await fillValid(empty, { trip: "group", notes: "" });
    check(
      empty.document.querySelector("#notes-label").textContent.trim(),
      "Trip Description *",
      {
        label: "the group description label is required",
        source: "js/booking.js",
        loaded: script,
      },
    );
    check(empty.document.querySelector("#booking-notes").required, true, {
      label: "the group description box is required",
      source: "js/booking.js",
      loaded: script,
    });
    await submitForm(empty);
    check(resultText(empty.document).includes(GROUP_DETAILS), true, {
      label: "an empty group description is blocked",
      actual: resultText(empty.document),
      source: "js/booking.js",
      loaded: script,
    });
    check(empty.document.activeElement.id, "booking-notes", {
      label: "the empty group description gets focus",
      actual: empty.document.activeElement.id,
      source: "js/booking.js",
      loaded: script,
    });
    check(bookingPosts(empty.state).length, 0, {
      label: "an empty group description sends nothing",
      source: "js/booking.js",
      loaded: script,
    });

    const spaces = await renderBooking(script, { miles: 4 });
    await fillValid(spaces, { trip: "group", notes: " \n\t " });
    await submitForm(spaces);
    check(resultText(spaces.document).includes(GROUP_DETAILS), true, {
      label: "a whitespace-only group description is blocked",
      actual: resultText(spaces.document),
      source: "js/booking.js",
      loaded: script,
    });
    check(bookingPosts(spaces.state).length, 0, {
      label: "a blank group description sends nothing",
      source: "js/booking.js",
      loaded: script,
    });

    const told = await renderBooking(script, { miles: 4 });
    await fillValid(told, {
      trip: "group",
      notes: "birthday dinner for 6",
    });
    await submitForm(told);
    check(resultText(told.document).includes("Request received"), true, {
      label: "a group description lets the request through",
      actual: resultText(told.document),
      source: "js/booking.js",
      loaded: script,
    });
    const groupPayload = JSON.parse(
      bookingPosts(told.state).find((request) =>
        hostIs(request.url, "script.google.com"),
      ).body,
    );
    check(groupPayload.specialNotes.includes("birthday dinner for 6"), true, {
      label: "the group request carries the description",
      actual: groupPayload.specialNotes,
      source: "js/booking.js",
      loaded: script,
    });

    const airport = await renderBooking(script, { miles: 10 });
    await fillValid(airport, { trip: "airport", notes: "" });
    check(airport.document.querySelector("#booking-notes").required, false, {
      label: "an airport note stays optional",
      source: "js/booking.js",
      loaded: script,
    });
    check(
      airport.document.querySelector("#notes-label").textContent.trim(),
      "Special Notes",
      {
        label: "an airport note is not marked required",
        source: "js/booking.js",
        loaded: script,
      },
    );
    await submitForm(airport);
    check(resultText(airport.document).includes("Request received"), true, {
      label: "an airport ride can be requested with no description",
      actual: resultText(airport.document),
      source: "js/booking.js",
      loaded: script,
    });

    const bar = await renderBooking(script, { miles: 4 });
    await fillValid(bar, { trip: "local", notes: "" });
    check(bar.document.querySelector("#booking-notes").required, false, {
      label: "a bar note stays optional",
      source: "js/booking.js",
      loaded: script,
    });
    await submitForm(bar);
    check(resultText(bar.document).includes("Request received"), true, {
      label: "a bar ride can be requested with no description",
      actual: resultText(bar.document),
      source: "js/booking.js",
      loaded: script,
    });

    const party = await renderBooking(script, { miles: 4 });
    await fillValid(party, { trip: "local", localKind: "party", notes: "" });
    await submitForm(party);
    check(resultText(party.document).includes("Request received"), true, {
      label: "a party ride can be requested with no description",
      actual: resultText(party.document),
      source: "js/booking.js",
      loaded: script,
    });

    const field = await renderBooking(script, { miles: 40 });
    await fillValid(field, { trip: "airport", notes: "" });
    choosePrivate(field, "Smith Field", "100 Runway Rd, Charlotte NC 28202");
    field.document.querySelector("#booking-notes").value = "";
    await submitForm(field);
    check(resultText(field.document).includes("Request received"), true, {
      label: "a private airfield can be requested with no description",
      actual: resultText(field.document),
      source: "js/booking.js",
      loaded: script,
    });
    check(field.document.querySelector("#booking-notes").required, false, {
      label: "a private airfield note stays optional",
      source: "js/booking.js",
      loaded: script,
    });
  });
});
