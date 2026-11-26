// Donald, Nov 25, 2026 (card t3003s10140): every bar and party ride is measured from the rider's pickup, using Two Trees as the
// center of a 15 road-mile radius with a flat side on the Mooresville edge (8.34 road miles, the Harris Teeter light at Perth Rd).
// A party's address has to be inside the same area. Mooresville is now served for bars and parties inside that flat side.
import { afterEach, describe, it } from "vitest";
import { check } from "./helpers/failure.js";
import {
  bookingPosts,
  chooseTrip,
  drainTimers,
  fillValid,
  renderBooking,
  resultText,
  submitForm,
} from "./helpers/render-booking.js";
import { waitFor } from "@testing-library/dom";

const scripts = ["js/booking.js", "js/booking.min.js"];
const SORRY = "Sorry, we don't service that area.";
const FAR = "out of our service area.";
const MOORES_PICK = "123 Main St, Mooresville NC 28115";
const MOORES_PARTY = "300 Lake Norman Dr, Mooresville NC 28117";
const DENVER = "123 Main Street, Denver NC 28037";

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

function place(miles, city = "Denver", zip = "28037") {
  const n = Math.round(miles * 1000);
  return {
    lat: 35 + (n % 977) / 10000,
    lon: -80.9 - (n % 953) / 10000,
    city,
    state: "NC",
    zip,
    miles,
  };
}

// Quote a party (or a bar) and return the quote text.
function quote(view, { bar, party, pickup }) {
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

async function submitParty(view, pickup, party) {
  await fillValid(view, {
    trip: "local",
    localKind: "party",
    pickup,
    party,
    notes: "",
  });
  await submitForm(view);
  return resultText(view.document);
}

const sent = (text) => text.includes("Request received");

describe.each(scripts)(
  "15 mile radius and Mooresville flat side %s",
  (script) => {
    const lbl = (label) => ({ label, source: "js/booking.js", loaded: script });

    it("exposes the two limits and the reach helpers", async () => {
      const view = await renderBooking(script, { miles: 5 });
      const rides = view.window.MidnightRides;
      check(rides.LOCAL_MAX_MILES, 15, lbl("radius"));
      check(rides.MOORESVILLE_MAX_MILES, 8.34, lbl("flat side"));
      check(rides.localReachWhy(15, false), "", lbl("15 is inside"));
      check(rides.localReachWhy(15.01, false), "far", lbl("15.01 is far"));
      check(
        rides.localReachWhy(8.34, true),
        "",
        lbl("8.34 Mooresville inside"),
      );
      check(rides.localReachWhy(8.35, true), "moores", lbl("8.35 past flat"));
      check(
        rides.localReachWhy(15.5, true),
        "moores",
        lbl("Mooresville first"),
      );
      check(
        rides.localDenialText({ blockUnservedTowns: true }, "moores"),
        rides.LOCAL_DENIAL,
        lbl("TT moores"),
      );
      check(
        rides.localDenialText({ blockUnservedTowns: true }, "far"),
        rides.LOCAL_DENIAL,
        lbl("TT far"),
      );
      check(rides.localDenialText({}, "moores"), SORRY, lbl("other moores"));
      check(rides.localDenialText(null, "moores"), SORRY, lbl("party moores"));
      check(
        rides.localDenialText({}, "far"),
        rides.LOCAL_DENIAL,
        lbl("other far"),
      );
      check(
        rides.isMooresvilleEnd("1 A St, Mooresville NC", {}),
        true,
        lbl("typed"),
      );
      check(rides.isMooresvilleEnd("1 A St 28115", {}), true, lbl("zip"));
      check(
        rides.isMooresvilleEnd("1 A St", {
          city: "Mooresville",
          state: "NC",
          zip: "",
        }),
        true,
        lbl("geo"),
      );
      check(
        rides.isMooresvilleEnd("1 A St, Denver NC 28037", {}),
        false,
        lbl("served"),
      );
      check(
        rides.isMooresvilleEnd("1 A St, Cornelius NC 28031", {}),
        false,
        lbl("other outside"),
      );
    });

    it("evaluateLocal lets a Mooresville end through and keeps every other refusal", async () => {
      const { window } = await renderBooking(script, { miles: 5 });
      const rides = window.MidnightRides;
      const decide = (pickup, destination) =>
        rides.evaluateLocal({
          pickup,
          destination,
          destinationIsAirfield: destination === "",
        });
      check(decide(MOORES_PICK, "").ok, true, lbl("Mooresville pickup"));
      check(
        decide(MOORES_PICK, MOORES_PARTY).ok,
        true,
        lbl("both Mooresville"),
      );
      check(
        decide(MOORES_PICK, DENVER).ok,
        true,
        lbl("Mooresville then Denver"),
      );
      check(decide(MOORES_PICK, "CLT").ok, true, lbl("an airport end is fine"));
      check(
        decide("1 A St, Cornelius NC 28031", MOORES_PARTY).code,
        "outside",
        lbl("Cornelius stays out"),
      );
      check(
        decide(MOORES_PICK, "2 B St, Cornelius NC 28031").code,
        "outside",
        lbl("party in Cornelius stays out"),
      );
      check(
        decide(MOORES_PICK, "200 Oak St").code,
        "unclear",
        lbl("no town stays unclear"),
      );
      check(
        decide(MOORES_PICK, "200 Oak St").message,
        window.MidnightServiceArea.UNCLEAR_MESSAGE,
        lbl("unclear text"),
      );
      check(decide(DENVER, "").ok, true, lbl("served"));
      check(
        rides.evaluateLocal({
          pickup: "CLT",
          pickupIsAirfield: true,
          destination: MOORES_PARTY,
        }).ok,
        true,
        lbl("an airfield pickup with a Mooresville end"),
      );
    });

    it("books Two Trees and another bar at exactly 15 road miles and refuses 15.01", async () => {
      for (const bar of ["two-trees", "bourbon-bobber"]) {
        const inside = await renderBooking(script, { miles: 15 });
        check(
          (await quote(inside, { bar, pickup: DENVER })).includes(
            "Cash $45.00",
          ),
          true,
          lbl(`${bar} 15.00`),
        );
        const over = await renderBooking(script, { miles: 15.01 });
        check(
          await quote(over, { bar, pickup: DENVER }),
          FAR,
          lbl(`${bar} 15.01`),
        );
        await fillValid(over, { trip: "local", bar, notes: "" });
        await submitForm(over);
        check(
          resultText(over.document).includes(FAR),
          true,
          lbl(`${bar} submit refused`),
        );
        check(
          over.document
            .querySelector("#pickup-error")
            .textContent.includes(FAR),
          true,
          lbl("shown by the pickup box"),
        );
        check(bookingPosts(over.state).length, 0, lbl(`${bar} sends nothing`));
      }
    });

    it("measures a party from the pickup and from the party address", async () => {
      const places = {
        [DENVER]: place(14),
        "200 Oak St, Sherrills Ford NC": place(14.5),
      };
      const ok = await renderBooking(script, { miles: 5, places });
      check(
        (
          await quote(ok, {
            party: "200 Oak St, Sherrills Ford NC",
            pickup: DENVER,
          })
        ).includes("Cash"),
        true,
        lbl("party quote inside"),
      );
      check(
        sent(await submitParty(ok, DENVER, "200 Oak St, Sherrills Ford NC")),
        true,
        lbl("party inside is sent"),
      );

      const farPickup = await renderBooking(script, {
        miles: 5,
        places: {
          [DENVER]: place(15.01),
          "200 Oak St, Sherrills Ford NC": place(14),
        },
      });
      check(
        await quote(farPickup, {
          party: "200 Oak St, Sherrills Ford NC",
          pickup: DENVER,
        }),
        FAR,
        lbl("party pickup far quote"),
      );
      check(
        (
          await submitParty(farPickup, DENVER, "200 Oak St, Sherrills Ford NC")
        ).includes(FAR),
        true,
        lbl("party pickup far submit"),
      );
      check(
        farPickup.document
          .querySelector("#pickup-error")
          .textContent.includes(FAR),
        true,
        lbl("pickup box shows it"),
      );

      const farParty = await renderBooking(script, {
        miles: 5,
        places: {
          [DENVER]: place(14),
          "200 Oak St, Sherrills Ford NC": place(15.01),
        },
      });
      check(
        await quote(farParty, {
          party: "200 Oak St, Sherrills Ford NC",
          pickup: DENVER,
        }),
        FAR,
        lbl("party address far quote"),
      );
      check(
        (
          await submitParty(farParty, DENVER, "200 Oak St, Sherrills Ford NC")
        ).includes(FAR),
        true,
        lbl("party address far submit"),
      );
      check(
        farParty.document
          .querySelector("#party-address-error")
          .textContent.includes(FAR),
        true,
        lbl("party box shows it"),
      );
      check(
        bookingPosts(farParty.state).length,
        0,
        lbl("far party sends nothing"),
      );
    });

    it("serves Mooresville to 8.34 road miles and refuses 8.35 for a party pickup and party address", async () => {
      const okPlaces = {
        [MOORES_PICK]: place(8.34, "Mooresville", "28115"),
        [MOORES_PARTY]: place(8, "Mooresville", "28117"),
      };
      const ok = await renderBooking(script, { miles: 5, places: okPlaces });
      check(
        (
          await quote(ok, { party: MOORES_PARTY, pickup: MOORES_PICK })
        ).includes("Cash"),
        true,
        lbl("Mooresville party quote"),
      );
      check(
        sent(await submitParty(ok, MOORES_PICK, MOORES_PARTY)),
        true,
        lbl("Mooresville both inside is sent"),
      );

      const pickPast = await renderBooking(script, {
        miles: 5,
        places: {
          [MOORES_PICK]: place(8.35, "Mooresville", "28115"),
          [DENVER]: place(5),
        },
      });
      check(
        await quote(pickPast, { party: DENVER, pickup: MOORES_PICK }),
        SORRY,
        lbl("pickup past flat side quote"),
      );
      check(
        (await submitParty(pickPast, MOORES_PICK, DENVER)).includes(SORRY),
        true,
        lbl("pickup past flat side submit"),
      );
      check(
        pickPast.document
          .querySelector("#pickup-error")
          .textContent.includes(SORRY),
        true,
        lbl("pickup box"),
      );

      const partyPast = await renderBooking(script, {
        miles: 5,
        places: {
          [DENVER]: place(5),
          [MOORES_PARTY]: place(8.35, "Mooresville", "28117"),
        },
      });
      check(
        await quote(partyPast, { party: MOORES_PARTY, pickup: DENVER }),
        SORRY,
        lbl("party past flat side quote"),
      );
      check(
        (await submitParty(partyPast, DENVER, MOORES_PARTY)).includes(SORRY),
        true,
        lbl("party past flat side submit"),
      );
      check(
        partyPast.document
          .querySelector("#party-address-error")
          .textContent.includes(SORRY),
        true,
        lbl("party box"),
      );
      check(bookingPosts(partyPast.state).length, 0, lbl("nothing sent"));
    });

    it("recognizes Mooresville from the geocoder or the ZIP when the text has no town", async () => {
      const byGeo = await renderBooking(script, {
        miles: 8,
        censusCity: "Mooresville",
        censusState: "NC",
        censusZip: "28115",
      });
      check(
        (
          await quote(byGeo, {
            bar: "bourbon-bobber",
            pickup: "100 Main Street",
          })
        ).includes("Cash"),
        true,
        lbl("geocoded Mooresville inside"),
      );
      const byGeoPast = await renderBooking(script, {
        miles: 8.35,
        censusCity: "Mooresville",
        censusState: "NC",
        censusZip: "28115",
      });
      check(
        await quote(byGeoPast, {
          bar: "bourbon-bobber",
          pickup: "100 Main Street",
        }),
        SORRY,
        lbl("geocoded Mooresville past"),
      );
      check(
        await quote(
          await renderBooking(script, {
            miles: 8.35,
            censusCity: "Mooresville",
            censusState: "NC",
            censusZip: "28115",
          }),
          { bar: "two-trees", pickup: "100 Main Street" },
        ),
        FAR,
        lbl("Two Trees geocoded Mooresville past"),
      );
      const byZip = await renderBooking(script, { miles: 9 });
      check(
        await quote(byZip, {
          bar: "bourbon-bobber",
          pickup: "123 Main St 28115",
        }),
        SORRY,
        lbl("ZIP only Mooresville past"),
      );
    });

    it("asks for the town when the party address cannot be placed, and when the reach cannot be measured", async () => {
      const unclear = await renderBooking(script, {
        miles: 5,
        censusMode: "miss",
      });
      const text = await quote(unclear, {
        party: "200 Oak St",
        pickup: MOORES_PICK,
      });
      check(
        text,
        unclear.window.MidnightServiceArea.UNCLEAR_MESSAGE,
        lbl("party without a town"),
      );

      const broken = await renderBooking(script, {
        miles: 5,
        censusMode: "error",
        routeMode: "error",
      });
      await fillValid(broken, { trip: "local", bar: "two-trees", notes: "" });
      await submitForm(broken);
      const shown = resultText(broken.document);
      check(
        shown.includes(broken.window.MidnightServiceArea.UNCLEAR_MESSAGE),
        true,
        lbl("unmeasurable pickup asks for town and state"),
      );
      check(bookingPosts(broken.state).length, 0, lbl("nothing sent"));
    });

    it("measures with Google when a map key is set and falls back to OSRM", async () => {
      const places = {
        [DENVER]: place(5),
        "200 Oak St, Sherrills Ford NC": place(5),
      };
      const far = await renderBooking(script, {
        miles: 5,
        places,
        googleMiles: 16,
        mapsKey: "test-browser-key",
      });
      check(
        await quote(far, {
          party: "200 Oak St, Sherrills Ford NC",
          pickup: DENVER,
        }),
        FAR,
        lbl("Google 16 miles"),
      );
      const near = await renderBooking(script, {
        miles: 5,
        places,
        googleMiles: 10,
        mapsKey: "test-browser-key",
      });
      check(
        (
          await quote(near, {
            party: "200 Oak St, Sherrills Ford NC",
            pickup: DENVER,
          })
        ).includes("Cash"),
        true,
        lbl("Google 10 miles"),
      );
      const farEmpty = await renderBooking(script, {
        miles: 16,
        mapsKey: "test-browser-key",
        googleMode: "empty",
      });
      check(
        await quote(farEmpty, {
          party: "200 Oak St, Sherrills Ford NC",
          pickup: DENVER,
        }),
        FAR,
        lbl("empty Google route falls back"),
      );
      const okThrow = await renderBooking(script, {
        miles: 10,
        mapsKey: "test-browser-key",
        googleMode: "throw",
      });
      check(
        (
          await quote(okThrow, {
            party: "200 Oak St, Sherrills Ford NC",
            pickup: DENVER,
          })
        ).includes("Cash"),
        true,
        lbl("failed Google route falls back"),
      );
    });

    it("leaves the airport from Mooresville and the group radius as they were", async () => {
      const airport = await renderBooking(script, { miles: 5 });
      chooseTrip(airport.document, "airport");
      airport.document.querySelector("#booking-pickup").value = MOORES_PICK;
      airport.window.jQuery("#booking-pickup").trigger("blur");
      airport.document.querySelector("#booking-destination").value = "CLT";
      airport.window
        .jQuery("#booking-destination")
        .trigger("input")
        .trigger("blur");
      check(
        await waitQuote(airport),
        SORRY,
        lbl("airport Mooresville is still refused"),
      );
      const group = await renderBooking(script, { miles: 19.9 });
      chooseTrip(group.document, "group");
      group.document.querySelector("#group-hours").value = "2";
      group.window.jQuery("#group-hours").trigger("change");
      group.document.querySelector("#booking-pickup").value = DENVER;
      group.window.jQuery("#booking-pickup").trigger("blur");
      check(
        (await waitQuote(group)).includes("Cash"),
        true,
        lbl("group 19.9 still quoted"),
      );
    });
  },
);
