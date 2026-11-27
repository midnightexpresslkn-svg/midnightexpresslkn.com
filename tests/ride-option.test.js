// Just-a-Ride option (Donald, Nov 27, 2026): 30 road miles from Two Trees, Charlotte
// allowed on this form only, other across-the-lake towns still out. Party and group
// forms stay as they are.
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
const DENVER = "123 Main Street, Denver NC 28037";
const CHARLOTTE = "100 Tryon St, Charlotte NC 28202";
const MOORES = "123 Main St, Mooresville NC 28115";
const CORNELIUS = "100 Catawba Ave, Cornelius NC 28031";
const DAVIDSON = "200 Main St, Davidson NC 28036";
const HUNTERS = "300 Gilead Rd, Huntersville NC 28078";
const SHERRILLS = "200 Oak St, Sherrills Ford NC 28673";

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

async function quoteRide(view, pickup, destination) {
  chooseTrip(view.document, "local");
  const kind = view.document.querySelector("#local-kind");
  kind.value = "ride";
  view.window.jQuery(kind).trigger("change");
  view.document.querySelector("#booking-pickup").value = pickup;
  view.document.querySelector("#booking-destination").value = destination;
  view.window.jQuery("#booking-pickup").trigger("blur");
  view.window.jQuery("#booking-destination").trigger("blur");
  return waitQuote(view);
}

async function submitRide(view, pickup, destination, extra = {}) {
  await fillValid(view, {
    trip: "local",
    localKind: "ride",
    pickup,
    destination,
    notes: extra.notes ?? "",
    passengers: extra.passengers ?? "2",
    roundTrip: extra.roundTrip ?? false,
  });
  await submitForm(view);
  return resultText(view.document);
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

const sent = (text) => text.includes("Request received");

const meta = (script, label, actual) => ({
  label,
  actual,
  source: "js/booking.js",
  loaded: script,
});

describe.each(scripts)("just a Ride option %s", (script) => {
  it("uses a 30 mile radius and switches to airportFare when $3/mile reaches the airport minimum", async () => {
    const view = await renderBooking(script, { miles: 10 });
    const rides = view.window.MidnightRides;
    check(rides.RIDE_MAX_MILES, 30, meta(script, "Ride radius"));
    check(rides.RIDE_PER_MILE_DOLLARS, 3, meta(script, "Ride $3/mile"));
    check(
      rides.RIDE_AIRPORT_AFTER_MILES,
      rides.AIRPORT_MIN_DOLLARS / rides.RIDE_PER_MILE_DOLLARS,
      meta(script, "breakpoint is airport minimum / $3"),
    );
    check(
      rides.RIDE_AIRPORT_AFTER_MILES === 23,
      false,
      meta(script, "breakpoint is not hardcoded 23"),
    );
    check(
      rides.LOCAL_MAX_MILES,
      15,
      meta(script, "bar/party radius unchanged"),
    );
    check(rides.rideReachWhy(30), "", meta(script, "30 is inside"));
    check(rides.rideReachWhy(30.01), "far", meta(script, "30.01 is far"));
    check(rides.rideReachWhy(31), "far", meta(script, "31 is far"));

    function cash(miles) {
      return rides.rideFare(miles, false).cashCents;
    }
    const at216 = rides.rideFare(21.6, false);
    check(at216.cashCents, 6500, meta(script, "21.6 mi cash $65 ($3/mile)"));
    check(at216.cardCents, 6695, meta(script, "21.6 mi card $66.95"));
    const at217 = rides.rideFare(21.7, false);
    check(
      at217.cashCents,
      rides.airportFare(21.7, false).cashCents,
      meta(script, "21.7 uses airportFare"),
    );
    check(at217.cashCents, 6500, meta(script, "21.7 mi cash $65"));
    const at22 = rides.rideFare(22, false);
    check(
      at22.cashCents,
      rides.airportFare(22, false).cashCents,
      meta(script, "22 uses airportFare"),
    );
    check(at22.cashCents, 6500, meta(script, "22 mi cash $65"));
    const at24 = rides.rideFare(24, false);
    check(
      at24.cashCents,
      rides.airportFare(24, false).cashCents,
      meta(script, "24 uses airportFare"),
    );
    check(at24.cashCents, 6500, meta(script, "24 cash $65"));
    const at30 = rides.rideFare(30, false);
    check(
      at30.cashCents,
      rides.airportFare(30, false).cashCents,
      meta(script, "30 uses airportFare"),
    );
    check(at30.cashCents, 8000, meta(script, "30 cash $80"));
    const rt216 = rides.rideFare(21.6, true);
    check(rt216.cashCents, 13000, meta(script, "21.6 mi round cash $130"));
    const rt22 = rides.rideFare(22, true);
    check(
      rt22.cashCents,
      rides.airportFare(22, true).cashCents,
      meta(script, "22 mi round uses airportFare"),
    );
    check(rt22.cashCents, 13000, meta(script, "22 mi round cash $130"));
    const rt24 = rides.rideFare(24, true);
    check(
      rt24.cashCents,
      rides.airportFare(24, true).cashCents,
      meta(script, "24 mi round uses airportFare"),
    );

    const justUnder = rides.RIDE_AIRPORT_AFTER_MILES - 1e-9;
    const atBreak = rides.RIDE_AIRPORT_AFTER_MILES;
    check(
      cash(justUnder) > 0,
      true,
      meta(script, "just under breakpoint has a fare"),
    );
    check(
      rides.rideFare(atBreak, false).cashCents,
      rides.airportFare(atBreak, false).cashCents,
      meta(script, "at breakpoint uses airportFare"),
    );

    const localShort = rides.localFare(2, false);
    check(
      localShort.cashCents,
      1000,
      meta(script, "bar/party still $10 at 2 miles"),
    );
    const rideShort = rides.rideFare(2, false);
    check(
      rideShort.cashCents,
      1500,
      meta(script, "Ride $15 minimum, no $10 short rate"),
    );
  });

  it("never lets the Ride cash fare drop as miles go up from 0 to 30", async () => {
    const view = await renderBooking(script, { miles: 10 });
    const rides = view.window.MidnightRides;
    let prev = 0;
    let drops = [];
    for (let tenths = 0; tenths <= 300; tenths += 1) {
      const miles = tenths / 10;
      const cash = rides.rideFare(miles, false).cashCents;
      if (cash < prev) {
        drops.push(
          `${prev / 100} at ${(tenths - 1) / 10} mi down to ${cash / 100} at ${miles} mi`,
        );
      }
      prev = cash;
    }
    check(
      drops,
      [],
      meta(script, "no cash drop from 0 to 30 in 0.1-mi steps", drops),
    );
    let prevRt = 0;
    let rtDrops = [];
    for (let tenths = 0; tenths <= 300; tenths += 1) {
      const miles = tenths / 10;
      const cash = rides.rideFare(miles, true).cashCents;
      if (cash < prevRt) {
        rtDrops.push(
          `${prevRt / 100} at ${(tenths - 1) / 10} mi down to ${cash / 100} at ${miles} mi`,
        );
      }
      prevRt = cash;
    }
    check(
      rtDrops,
      [],
      meta(script, "no round-trip cash drop from 0 to 30", rtDrops),
    );
  });

  it("lets a Charlotte work trip through on Ride and still refuses it on the party form", async () => {
    const ride = await renderBooking(script, { miles: 20 });
    const api = ride.window.MidnightServiceArea;
    const allowed = api.evaluateTrip({
      pickup: DENVER,
      destination: CHARLOTTE,
      allowCharlotte: true,
    });
    check(
      allowed.ok,
      true,
      meta(script, "evaluateTrip allows Charlotte on Ride"),
    );
    const blocked = api.evaluateTrip({
      pickup: DENVER,
      destination: CHARLOTTE,
    });
    check(
      [blocked.ok, blocked.code, blocked.message],
      [false, "outside", SORRY],
      meta(script, "Charlotte still refused without the Ride flag"),
    );

    const quote = await quoteRide(ride, DENVER, CHARLOTTE);
    check(
      quote.includes("Cash $60.00"),
      true,
      meta(script, "Charlotte work quote", quote),
    );
    const result = await submitRide(ride, DENVER, CHARLOTTE);
    check(
      sent(result),
      true,
      meta(script, "Charlotte work trip sends", result),
    );
    check(
      bookingPosts(ride.state).length > 0,
      true,
      meta(script, "Charlotte work posts"),
    );

    const party = await renderBooking(script, { miles: 8 });
    await fillValid(party, {
      trip: "local",
      localKind: "party",
      pickup: DENVER,
      party: CHARLOTTE,
    });
    await submitForm(party);
    check(
      resultText(party.document).includes(SORRY),
      true,
      meta(script, "party form still refuses Charlotte"),
    );
    check(
      bookingPosts(party.state).length,
      0,
      meta(script, "party Charlotte sends nothing"),
    );
  });

  it("refuses Mooresville and Cornelius on a Ride, and the other across-the-lake towns", async () => {
    for (const [town, pickup, destination, why] of [
      ["Mooresville pickup", MOORES, DENVER, "Mooresville pickup"],
      ["Mooresville drop-off", DENVER, MOORES, "Mooresville drop-off"],
      ["Cornelius pickup", CORNELIUS, DENVER, "Cornelius pickup"],
      ["Cornelius drop-off", DENVER, CORNELIUS, "Cornelius drop-off"],
      ["Davidson", DENVER, DAVIDSON, "Davidson drop-off"],
      ["Huntersville", HUNTERS, DENVER, "Huntersville pickup"],
    ]) {
      void town;
      const view = await renderBooking(script, { miles: 10 });
      check(
        await quoteRide(view, pickup, destination),
        SORRY,
        meta(script, `${why} quote`),
      );
      const result = await submitRide(view, pickup, destination);
      check(
        result.includes(SORRY),
        true,
        meta(script, `${why} submit`, result),
      );
      check(
        bookingPosts(view.state).length,
        0,
        meta(script, `${why} sends nothing`),
      );
    }
  });

  it("quotes 21.6, 21.7, 22, 24, and 30 mile trips at the Ride price boundaries and refuses 31 miles", async () => {
    const expectCash = {
      21.6: "Cash $65.00",
      21.7: "Cash $65.00",
      22: "Cash $65.00",
      24: "Cash $65.00",
      30: "Cash $80.00",
    };
    for (const [miles, cash] of Object.entries(expectCash)) {
      const view = await renderBooking(script, { miles: Number(miles) });
      const quote = await quoteRide(view, DENVER, SHERRILLS);
      check(
        quote.includes(cash),
        true,
        meta(script, `${miles} mile quote ${cash}`, quote),
      );
    }
    const at22 = await renderBooking(script, { miles: 22 });
    check(
      sent(await submitRide(at22, DENVER, SHERRILLS)),
      true,
      meta(script, "22 mile sends"),
    );

    const at30 = await renderBooking(script, { miles: 30 });
    check(
      sent(await submitRide(at30, DENVER, SHERRILLS)),
      true,
      meta(script, "30 mile sends"),
    );

    const at31 = await renderBooking(script, { miles: 31 });
    check(
      await quoteRide(at31, DENVER, SHERRILLS),
      FAR,
      meta(script, "31 mile quote refused"),
    );
    const result = await submitRide(at31, DENVER, SHERRILLS);
    check(
      result.includes(FAR),
      true,
      meta(script, "31 mile submit refused", result),
    );
    check(
      bookingPosts(at31.state).length,
      0,
      meta(script, "31 mile sends nothing"),
    );
  });

  it("keeps the party 15 mile radius and does not show the 21+ box on a Ride", async () => {
    const partyOk = await renderBooking(script, { miles: 15 });
    await fillValid(partyOk, {
      trip: "local",
      localKind: "party",
      pickup: DENVER,
      party: SHERRILLS,
    });
    await submitForm(partyOk);
    check(
      sent(resultText(partyOk.document)),
      true,
      meta(script, "party still books at 15 miles"),
    );

    const partyFar = await renderBooking(script, { miles: 15.01 });
    await fillValid(partyFar, {
      trip: "local",
      localKind: "party",
      pickup: DENVER,
      party: SHERRILLS,
    });
    await submitForm(partyFar);
    check(
      resultText(partyFar.document).includes(FAR),
      true,
      meta(script, "party still refuses 15.01"),
    );
    check(
      bookingPosts(partyFar.state).length,
      0,
      meta(script, "party 15.01 sends nothing"),
    );

    const ride = await renderBooking(script, { miles: 10 });
    chooseTrip(ride.document, "local");
    const kind = ride.document.querySelector("#local-kind");
    kind.value = "ride";
    ride.window.jQuery(kind).trigger("change");
    check(
      ride.document.querySelector("#ride-rules").hidden,
      true,
      meta(script, "Ride hides the 21+ agreement"),
    );
    check(
      ride.document.querySelector("#local-bar-list").hidden,
      true,
      meta(script, "Ride hides the bar list"),
    );
    check(
      ride.document.querySelector("#party-address-row").hidden,
      true,
      meta(script, "Ride hides the party address"),
    );
    const dest = ride.document.querySelector("#dest-group");
    const destShown = dest && !dest.hidden && dest.style.display !== "none";
    check(destShown, true, meta(script, "Ride shows the drop-off box"));
    check(
      ride.document.querySelector("#destination-label").textContent,
      "Drop-off address *",
      meta(script, "drop-off label"),
    );

    const over = await renderBooking(script, { miles: 10 });
    const result = await submitRide(over, DENVER, SHERRILLS, {
      passengers: "5",
    });
    check(
      result.includes("For more than 4 passengers"),
      true,
      meta(script, "Ride caps passengers at 4", result),
    );
    check(
      bookingPosts(over.state).length,
      0,
      meta(script, "5 passengers sends nothing"),
    );
  });

  it("asks for a drop-off and does not send a Ride with a blank destination", async () => {
    const view = await renderBooking(script, { miles: 10 });
    chooseTrip(view.document, "local");
    const kind = view.document.querySelector("#local-kind");
    kind.value = "ride";
    view.window.jQuery(kind).trigger("change");
    let hint = "";
    await waitFor(
      () => {
        hint = quoteText(view.document);
        if (!hint.includes("Enter your pickup and drop-off"))
          throw new Error("not ready");
      },
      { timeout: 4000 },
    );
    check(
      hint.includes("Enter your pickup and drop-off"),
      true,
      meta(script, "empty drop-off quote hint", hint),
    );
    await fillValid(view, {
      trip: "local",
      localKind: "ride",
      pickup: DENVER,
      destination: "   ",
    });
    view.document.querySelector("#booking-destination").value = "";
    view.window.jQuery("#booking-destination").trigger("input");
    await submitForm(view);
    check(
      view.document.querySelector("#destination-error").textContent,
      "Drop-off address is required",
      meta(script, "blank drop-off error"),
    );
    check(
      bookingPosts(view.state).length,
      0,
      meta(script, "blank drop-off sends nothing"),
    );
  });

  it("opens from kind=ride, keeps Ride notes, and refuses only a far drop-off", async () => {
    const preset = await renderBooking(script, {
      url: "/?type=local&kind=ride#booking",
    });
    check(
      preset.document.querySelector("#local-kind").value,
      "ride",
      meta(script, "kind=ride preselects Just a ride"),
    );

    const noted = await renderBooking(script, { miles: 10 });
    check(
      sent(await submitRide(noted, DENVER, SHERRILLS, { notes: "Work at 8." })),
      true,
      meta(script, "Ride with notes sends"),
    );

    const farDest = await renderBooking(script, {
      miles: 10,
      places: {
        [DENVER]: place(10),
        [SHERRILLS]: place(31),
      },
    });
    check(
      await quoteRide(farDest, DENVER, SHERRILLS),
      FAR,
      meta(script, "31 mile drop-off quote"),
    );
    const result = await submitRide(farDest, DENVER, SHERRILLS);
    check(
      result.includes(FAR),
      true,
      meta(script, "31 mile drop-off submit", result),
    );
    check(
      farDest.document.querySelector("#destination-error").textContent,
      FAR,
      meta(script, "far drop-off error sits on the drop-off box"),
    );
    check(
      bookingPosts(farDest.state).length,
      0,
      meta(script, "far drop-off sends nothing"),
    );

    const known = await renderBooking(script, { miles: 10 });
    const inside = await known.window.MidnightRides.rideReach(
      DENVER,
      SHERRILLS,
      10,
    );
    check(inside, null, meta(script, "known 10 miles is inside"));
    const far = await known.window.MidnightRides.rideReach(DENVER, "", 31);
    check(far && far.why, "far", meta(script, "known 31 miles is far"));
    check(
      far && far.party,
      false,
      meta(script, "known miles apply to the pickup"),
    );
  });
});
