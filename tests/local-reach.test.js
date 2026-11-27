// Donald, Nov 25, 2026 (card t3003s10140): every bar and party ride is measured from the rider's pickup, using Two Trees as the
// center of a 15 road-mile radius. A party's address has to be inside the same area.
// Donald, Nov 25, 2026 9:50 PM: "Just take Mooresville out completely." Mooresville is refused for every ride type (airport, bar, party,
// group), as a pickup or as a destination or party address, with the wording each ride already had. The 8.34 road-mile allowance
// (118 Argus Ln, the Perth Rd light) is gone.
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
const ARGUS = "118 Argus Ln, Mooresville NC 28117";
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
  });
  await submitForm(view);
  return resultText(view.document);
}

const sent = (text) => text.includes("Request received");

describe.each(scripts)(
  "15 mile radius, and Mooresville out completely %s",
  (script) => {
    const lbl = (label) => ({ label, source: "js/booking.js", loaded: script });

    it("exposes the radius and the reach helpers; the Mooresville allowance is gone", async () => {
      const view = await renderBooking(script, { miles: 5 });
      const rides = view.window.MidnightRides;
      check(rides.LOCAL_MAX_MILES, 15, lbl("radius"));
      check(rides.localReachWhy(15), "", lbl("15 is inside"));
      check(rides.localReachWhy(15.01), "far", lbl("15.01 is far"));
      check(rides.localReachWhy(8.35), "", lbl("8.35 is just a distance now"));
      check(rides.MOORESVILLE_MAX_MILES, undefined, lbl("no flat side"));
      check(rides.evaluateLocal, undefined, lbl("no Mooresville pass-through"));
      check(rides.localDenialText, undefined, lbl("no Mooresville wording"));
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
      const api = view.window.MidnightServiceArea;
      delete view.window.MidnightServiceArea;
      check(
        rides.isMooresvilleEnd("1 A St, Mooresville NC", {}),
        false,
        lbl("no service-area API"),
      );
      view.window.MidnightServiceArea = {};
      check(
        rides.isMooresvilleEnd("1 A St, Mooresville NC", {}),
        false,
        lbl("API without classifyAddress"),
      );
      view.window.MidnightServiceArea = api;
    });

    it("the shared checker refuses a Mooresville end, as a pickup or as a party address, and keeps every other answer", async () => {
      const { window } = await renderBooking(script, { miles: 5 });
      const api = window.MidnightServiceArea;
      const decide = (pickup, destination) =>
        api.evaluateTrip({
          pickup,
          destination,
          destinationIsAirfield: destination === "",
        });
      for (const [pickup, destination, why] of [
        [MOORES_PICK, "", "Mooresville pickup"],
        [MOORES_PICK, MOORES_PARTY, "both Mooresville"],
        [MOORES_PICK, DENVER, "Mooresville then Denver"],
        [DENVER, MOORES_PARTY, "Denver then a Mooresville party address"],
        [ARGUS, DENVER, "118 Argus Ln (inside 8.3 miles) pickup"],
        [DENVER, ARGUS, "118 Argus Ln party address"],
        [MOORES_PICK, "CLT", "Mooresville to an airport"],
        ["CLT", MOORES_PARTY, "an airport pickup with a Mooresville end"],
      ]) {
        const d = decide(pickup, destination);
        check([d.ok, d.code, d.message], [false, "outside", SORRY], lbl(why));
      }
      check(decide(DENVER, "").ok, true, lbl("served"));
      check(
        decide(DENVER, "200 Oak St").code,
        "unclear",
        lbl("no town stays unclear"),
      );
      check(
        decide("1 A St, Cornelius NC 28031", DENVER).code,
        "outside",
        lbl("Cornelius stays out"),
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

    it("refuses a Mooresville party pickup and party address at any distance, 118 Argus Ln included, and sends nothing", async () => {
      for (const miles of [3, 8.3, 8.34, 8.35, 12]) {
        const both = await renderBooking(script, {
          miles: 5,
          places: {
            [MOORES_PICK]: place(miles, "Mooresville", "28115"),
            [MOORES_PARTY]: place(miles, "Mooresville", "28117"),
            [DENVER]: place(5),
          },
        });
        check(
          await quote(both, { party: DENVER, pickup: MOORES_PICK }),
          SORRY,
          lbl(`pickup quote at ${miles}`),
        );
        check(
          (await submitParty(both, MOORES_PICK, DENVER)).includes(SORRY),
          true,
          lbl(`pickup submit at ${miles}`),
        );
        check(
          both.document
            .querySelector("#pickup-error")
            .textContent.includes(SORRY),
          true,
          lbl("pickup box"),
        );
        check(bookingPosts(both.state).length, 0, lbl("pickup sends nothing"));

        const party = await renderBooking(script, {
          miles: 5,
          places: {
            [MOORES_PARTY]: place(miles, "Mooresville", "28117"),
            [DENVER]: place(5),
          },
        });
        check(
          await quote(party, { party: MOORES_PARTY, pickup: DENVER }),
          SORRY,
          lbl(`party address quote at ${miles}`),
        );
        check(
          (await submitParty(party, DENVER, MOORES_PARTY)).includes(SORRY),
          true,
          lbl(`party address submit at ${miles}`),
        );
        check(
          party.document
            .querySelector("#party-address-error")
            .textContent.includes(SORRY),
          true,
          lbl("party box"),
        );
        check(bookingPosts(party.state).length, 0, lbl("party sends nothing"));
      }
      const argus = await renderBooking(script, {
        miles: 8.3,
        places: {
          [ARGUS]: place(8.3, "Mooresville", "28117"),
          [DENVER]: place(5),
        },
      });
      check(
        await quote(argus, { party: DENVER, pickup: ARGUS }),
        SORRY,
        lbl("118 Argus Ln inside 8.3 miles is refused"),
      );
    });

    it("refuses a Mooresville pickup for a bar: Two Trees says out of our service area, every other bar the flat refusal", async () => {
      for (const [bar, wording] of [
        ["two-trees", FAR],
        ["bourbon-bobber", SORRY],
        ["safari-miles", SORRY],
      ]) {
        for (const miles of [5, 8.3, 8.34, 8.35]) {
          const view = await renderBooking(script, {
            miles,
            places: { [ARGUS]: place(miles, "Mooresville", "28117") },
          });
          check(
            await quote(view, { bar, pickup: ARGUS }),
            wording,
            lbl(`${bar} from 118 Argus Ln at ${miles}`),
          );
          await fillValid(view, {
            trip: "local",
            bar,
            pickup: ARGUS,
            notes: "",
          });
          await submitForm(view);
          check(
            resultText(view.document).includes(wording),
            true,
            lbl(`${bar} submit at ${miles}`),
          );
          // The box under the field carries the shared service-area text (as it did before); the summary line carries Two Trees' own wording.
          check(
            view.document
              .querySelector("#pickup-error")
              .textContent.includes(SORRY),
            true,
            lbl("pickup box"),
          );
          check(bookingPosts(view.state).length, 0, lbl("nothing sent"));
        }
      }
    });

    it("recognizes Mooresville from the geocoder or the ZIP when the text has no town, and refuses it", async () => {
      const geo = (miles) => ({
        miles,
        censusCity: "Mooresville",
        censusState: "NC",
        censusZip: "28115",
      });
      for (const miles of [8, 8.35]) {
        check(
          await quote(await renderBooking(script, geo(miles)), {
            bar: "bourbon-bobber",
            pickup: "100 Main Street",
          }),
          SORRY,
          lbl(`geocoded Mooresville at ${miles}`),
        );
      }
      check(
        await quote(await renderBooking(script, geo(8)), {
          bar: "two-trees",
          pickup: "100 Main Street",
        }),
        FAR,
        lbl("Two Trees geocoded Mooresville"),
      );
      const submitted = await renderBooking(script, geo(8));
      await fillValid(submitted, {
        trip: "local",
        bar: "bourbon-bobber",
        pickup: "100 Main Street",
        notes: "",
      });
      await submitForm(submitted);
      check(
        resultText(submitted.document).includes(SORRY),
        true,
        lbl("geocoded Mooresville submit is refused"),
      );
      check(bookingPosts(submitted.state).length, 0, lbl("nothing sent"));
      const byZip = await renderBooking(script, { miles: 5 });
      check(
        await quote(byZip, {
          bar: "bourbon-bobber",
          pickup: "123 Main St 28115",
        }),
        SORRY,
        lbl("ZIP only Mooresville"),
      );
    });

    it("asks for the town when the party address cannot be placed, and when the reach cannot be measured", async () => {
      const unclear = await renderBooking(script, {
        miles: 5,
        censusMode: "miss",
      });
      const text = await quote(unclear, {
        party: "200 Oak St",
        pickup: DENVER,
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

    it("refuses Mooresville for an airport ride (to the airport, from the airport, a private airfield pickup) and leaves the group radius at 20", async () => {
      const airport = await renderBooking(script, { miles: 5 });
      chooseTrip(airport.document, "airport");
      airport.document.querySelector("#booking-pickup").value = MOORES_PICK;
      airport.window.jQuery("#booking-pickup").trigger("blur");
      airport.document.querySelector("#booking-destination").value = "CLT";
      airport.window
        .jQuery("#booking-destination")
        .trigger("input")
        .trigger("blur");
      check(await waitQuote(airport), SORRY, lbl("airport Mooresville quote"));
      for (const direction of ["to", "from"]) {
        const view = await renderBooking(script, { miles: 5 });
        await fillValid(view, { pickup: ARGUS, destination: "CLT", direction });
        await submitForm(view);
        check(
          resultText(view.document).includes(SORRY),
          true,
          lbl(`airport ${direction} Argus Ln submit is refused`),
        );
        check(bookingPosts(view.state).length, 0, lbl("airport sends nothing"));
      }
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

    it("refuses a Mooresville group pickup (typed town, ZIP, geocoder) with the flat refusal, and sends nothing", async () => {
      const groupQuote = async (options, pickup) => {
        const view = await renderBooking(script, options);
        chooseTrip(view.document, "group");
        view.document.querySelector("#group-hours").value = "2";
        view.window.jQuery("#group-hours").trigger("change");
        view.document.querySelector("#booking-pickup").value = pickup;
        view.window.jQuery("#booking-pickup").trigger("blur");
        return { view, text: await waitQuote(view) };
      };
      for (const [options, pickup, why] of [
        [{ miles: 5 }, MOORES_PICK, "typed town"],
        [{ miles: 5 }, ARGUS, "118 Argus Ln"],
        [{ miles: 5 }, "100 Main St 28117", "ZIP only"],
        [
          {
            miles: 5,
            censusCity: "Mooresville",
            censusState: "NC",
            censusZip: "28115",
          },
          "100 Main Street",
          "geocoder only",
        ],
      ]) {
        const { text } = await groupQuote(options, pickup);
        check(text, SORRY, lbl(`group quote, ${why}`));
      }
      const view = await renderBooking(script, { miles: 5 });
      await fillValid(view, { trip: "group", pickup: ARGUS, hours: "3" });
      await submitForm(view);
      check(
        resultText(view.document).includes(SORRY),
        true,
        lbl("group submit from Mooresville is refused"),
      );
      check(
        view.document
          .querySelector("#pickup-error")
          .textContent.includes(SORRY),
        true,
        lbl("group pickup box shows it"),
      );
      check(bookingPosts(view.state).length, 0, lbl("group sends nothing"));
      const served = await renderBooking(script, { miles: 19.9 });
      await fillValid(served, { trip: "group", pickup: DENVER, hours: "3" });
      await submitForm(served);
      check(
        sent(resultText(served.document)),
        true,
        lbl("a Denver group at 19.9 miles is still sent"),
      );
      // Groups have no town check (Nov 10): a group from Cornelius is not refused for its town; only Mooresville is out.
      const cornelius = await renderBooking(script, { miles: 10 });
      await fillValid(cornelius, {
        trip: "group",
        pickup: "10 Main St, Cornelius NC 28031",
        hours: "3",
      });
      await submitForm(cornelius);
      check(
        sent(resultText(cornelius.document)),
        true,
        lbl("a Cornelius group is still sent (no town check for groups)"),
      );
    });

    it("keeps Mooresville bars off the list, and still refuses a Mooresville private airfield", async () => {
      const listed = await renderBooking(script, { miles: 6 });
      const ids = ["blue-parrot", "toucans", "vitale-lakeside"];
      check(
        ids.filter((id) => listed.window.MidnightRides.listedBar(id)),
        [],
        lbl("Blue Parrot, Toucan's, and Vitale Lakeside are not listed"),
      );
      const names = listed.window.MidnightRides.BARS.map((bar) => bar.name);
      check(
        names.some((name) => /blue parrot|toucan|vitale/i.test(name)),
        false,
        lbl("the bookable names do not include the three Mooresville bars"),
      );
      const field = await renderBooking(script, { miles: 12 });
      chooseTrip(field.document, "airport");
      field.document.querySelector("#airport-choice").value = "PRIVATE";
      field.window.jQuery("#airport-choice").trigger("change");
      field.document.querySelector("#airfield-name").value = "Smith Field";
      field.document.querySelector("#airfield-address").value =
        "100 Runway Rd, Mooresville NC 28117";
      field.document.querySelector("#booking-pickup").value = DENVER;
      field.window.jQuery("#booking-pickup").trigger("blur");
      check(
        await waitQuote(field),
        SORRY,
        lbl("Mooresville private airfield quote"),
      );
      await fillValid(field, {
        pickup: DENVER,
        airportId: "PRIVATE",
        airfieldName: "Smith Field",
        airfieldAddress: "100 Runway Rd, Mooresville NC 28117",
      });
      await submitForm(field);
      check(
        resultText(field.document).includes(SORRY),
        true,
        lbl("Mooresville private airfield submit is refused"),
      );
      check(bookingPosts(field.state).length, 0, lbl("airfield sends nothing"));
      const airpark = await renderBooking(script, { miles: 8 });
      await fillValid(airpark, {
        pickup: "Lake Norman Airpark, Mooresville NC",
        destination: DENVER,
      });
      await submitForm(airpark);
      check(
        resultText(airpark.document).includes(SORRY),
        true,
        lbl("Lake Norman Airpark in Mooresville is refused"),
      );
      check(
        bookingPosts(airpark.state).length,
        0,
        lbl("airpark sends nothing"),
      );
      // No town in the typed text: the geocoder's city decides, for a pickup and for a private airfield.
      const geoPick = await renderBooking(script, {
        miles: 12,
        censusCity: "Mooresville",
        censusState: "NC",
        censusZip: "28117",
      });
      chooseTrip(geoPick.document, "airport");
      geoPick.document.querySelector("#airport-choice").value = "CLT";
      geoPick.window.jQuery("#airport-choice").trigger("change");
      geoPick.document.querySelector("#booking-pickup").value =
        "100 Mystery Rd";
      geoPick.window.jQuery("#booking-pickup").trigger("blur");
      check(
        await waitQuote(geoPick),
        SORRY,
        lbl("geocoded Mooresville airport pickup"),
      );
      const geoField = await renderBooking(script, {
        miles: 12,
        censusCity: "Mooresville",
        censusState: "NC",
        censusZip: "28117",
      });
      chooseTrip(geoField.document, "airport");
      geoField.document.querySelector("#airport-choice").value = "PRIVATE";
      geoField.window.jQuery("#airport-choice").trigger("change");
      geoField.document.querySelector("#airfield-name").value = "Smith Field";
      geoField.document.querySelector("#airfield-address").value =
        "100 Runway Rd";
      geoField.document.querySelector("#booking-pickup").value = DENVER;
      geoField.window.jQuery("#booking-pickup").trigger("blur");
      check(
        await waitQuote(geoField),
        SORRY,
        lbl("geocoded Mooresville private airfield quote"),
      );
    });
  },
);
