import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, it } from "vitest";
import { check } from "./helpers/failure.js";
import { SOURCE } from "./helpers/source-line.js";

const filename = path.resolve("js/service-area.js");
vm.runInThisContext(fs.readFileSync(filename, "utf8"), { filename });
const area = globalThis.MidnightServiceArea;

const outside = "Sorry, we don't service that area.";
const unclear = "Please include the town and state, for example Denver, NC.";

function trip(pickup, destination, extra = {}) {
  return area.evaluateTrip({ pickup, destination, ...extra });
}

describe("service area rules", () => {
  it("uses the exact refusal and a separate message when the town is unclear", () => {
    check(area.OUT_OF_AREA_MESSAGE, outside, {
      label: "out-of-area message",
      source: SOURCE.excluded,
    });
    check(area.UNCLEAR_MESSAGE, unclear, {
      label: "unclear-town message",
      source: SOURCE.excluded,
    });
    check(/call|980|422-9125/i.test(outside + unclear), false, {
      label: "service-area messages do not ask for a call",
      source: SOURCE.excluded,
    });
  });

  it("documents the border ZIPs instead of treating them as served", () => {
    check(area.SERVED_ZIPS["28164"], undefined, {
      label: "28164 is not a served ZIP",
      source: SOURCE.excluded,
    });
    check(area.SERVED_ZIPS["28092"], undefined, {
      label: "28092 Lincolnton is not a served ZIP",
      source: SOURCE.excluded,
    });
    check(Boolean(area.BORDER_ZIPS["28164"]), true, {
      label: "28164 is recorded as a shared ZIP",
      source: SOURCE.excluded,
    });
    const notes = area.UNCERTAIN_NOTES.join(" ");
    for (const zip of ["28164", "28092", "28677", "28078", "28262"]) {
      check(notes.includes(zip), true, {
        label: `uncertain note mentions ${zip}`,
        source: SOURCE.excluded,
      });
    }
  });

  it("loads before the live booking script", () => {
    const html = fs.readFileSync("index.html", "utf8");
    const checker = html.indexOf('src="js/service-area.js"');
    const booking = html.indexOf('src="js/booking.min.js"');
    check(checker > -1 && checker < booking, true, {
      label: "service-area.js is loaded before booking.min.js",
      expected: "checker script first",
      actual: `checker ${checker}, booking ${booking}`,
      source: SOURCE.serviceArea,
    });
    const source = fs.readFileSync("js/booking.js", "utf8");
    const guard = source.indexOf("async function decideServiceArea");
    const formPost = source.indexOf("fetch(GOOGLE_FORM_URL");
    const calendarPost = source.indexOf("fetch(NEW_SCRIPT_URL");
    check(guard > -1 && guard < formPost && guard < calendarPost, true, {
      label: "request posts are behind the service-area guard",
      source: SOURCE.serviceArea,
    });
  });

  it.each([
    ["Denver", "28037"],
    ["Iron Station", "28080"],
    ["Catawba", "28609"],
    ["Maiden", "28650"],
    ["Sherrills Ford", "28673"],
    ["Terrell", "28682"],
  ])("accepts %s from its ZIP %s", (town, zip) => {
    check(trip(`100 Main St ${zip}`, "CLT").ok, true, {
      label: `${town} ZIP ${zip}`,
      source: SOURCE.excluded,
    });
    check(trip(`100 Main St, ${town} NC`, "CLT").ok, true, {
      label: `${town} NC`,
      source: SOURCE.excluded,
    });
  });

  it("accepts Pumpkin Center and Westport by name, and Sherrill's Ford spelling", () => {
    check(trip("10 Church St, Pumpkin Center NC", "CLT").ok, true, {
      label: "Pumpkin Center NC",
      source: SOURCE.excluded,
    });
    check(trip("Pumpkin Center NC 28092", "CLT").ok, true, {
      label: "Pumpkin Center with the Lincolnton ZIP still names the town",
      source: SOURCE.excluded,
    });
    check(trip("1 Marina Rd, Westport NC", "CLT").ok, true, {
      label: "Westport NC",
      source: SOURCE.excluded,
    });
    check(trip("1 Main, Sherrill's Ford, North Carolina", "CLT").ok, true, {
      label: "Sherrill's Ford spelled with an apostrophe",
      source: SOURCE.excluded,
    });
    check(trip("1 Main, Sherrill Ford NC", "CLT").ok, true, {
      label: "Sherrill Ford spelling",
      source: SOURCE.excluded,
    });
    check(trip("7740 Marlette Ln, Sherrills Ford NC", "CLT").ok, true, {
      label: "Marlette Lane with NC and no comma before the state",
      source: SOURCE.excluded,
    });
    check(trip("7740, Marlette Ln, Sherrills Ford NC", "CLT").ok, true, {
      label: "a comma after the house number still names Sherrills Ford",
      source: SOURCE.excluded,
    });
  });

  it("accepts Lowesville when the town is named and not from ZIP 28164 alone", () => {
    check(trip("100 Main St, Lowesville NC", "CLT").ok, true, {
      label: "Lowesville NC",
      source: SOURCE.excluded,
    });
    check(trip("100 Main St, Lowesville 28164", "CLT").ok, true, {
      label: "Lowesville plus the shared ZIP",
      source: SOURCE.excluded,
    });
    check(
      trip("100 Main St 28164", "CLT"),
      {
        ok: false,
        code: "unclear",
        message: unclear,
      },
      {
        label: "28164 alone is unclear",
        source: SOURCE.excluded,
      },
    );
    check(
      trip("100 Main St 28164", "CLT", {
        pickupGeo: { city: "Stanley", state: "NC", zip: "28164" },
      }).code,
      "outside",
      {
        label: "28164 geocoded to Stanley is outside",
        source: SOURCE.excluded,
      },
    );
    check(
      trip("100 Main St 28164", "CLT", {
        pickupGeo: { city: "Lowesville", state: "NC", zip: "28164" },
      }).ok,
      true,
      {
        label: "28164 geocoded to Lowesville is served",
        source: SOURCE.excluded,
      },
    );
  });

  it.each([
    "Mooresville",
    "Davidson",
    "Huntersville",
    "Cornelius",
    "Troutman",
    "Statesville",
    "Charlotte",
  ])("rejects %s", (town) => {
    check(trip(`100 Main St, ${town}`, "CLT").code, "outside", {
      label: town,
      source: SOURCE.excluded,
    });
  });

  it.each([
    ["28031", "Cornelius"],
    ["28035", "Davidson"],
    ["28036", "Davidson"],
    ["28070", "Huntersville"],
    ["28078", "Huntersville"],
    ["28115", "Mooresville"],
    ["28117", "Mooresville"],
    ["28166", "Troutman"],
    ["28625", "Statesville"],
    ["28677", "Statesville"],
    ["28687", "Statesville"],
    ["28262", "Charlotte"],
    ["28202", "Charlotte"],
    ["28227", "Charlotte"],
  ])("rejects ZIP %s (%s)", (zip) => {
    check(trip(`100 Main St ${zip}`, "CLT").message, outside, {
      label: `ZIP ${zip}`,
      source: SOURCE.excluded,
    });
  });

  it("rejects Denver, Colorado and accepts Denver, North Carolina", () => {
    check(trip("123 Main Street, Denver", "CLT").code, "unclear", {
      label: "Denver with no state is unclear",
      source: SOURCE.excluded,
    });
    check(trip("123 Main Street, Denver CO 80202", "CLT").message, outside, {
      label: "Denver CO",
      source: SOURCE.excluded,
    });
    check(trip("123 Main Street, Denver, Colorado", "CLT").message, outside, {
      label: "Denver, Colorado",
      source: SOURCE.excluded,
    });
    check(trip("123 Main Street, Denver NC 28037", "CLT").ok, true, {
      label: "Denver NC 28037",
      source: SOURCE.excluded,
    });
    check(trip("123 Main, Denver, North Carolina", "CLT").ok, true, {
      label: "Denver, North Carolina",
      source: SOURCE.excluded,
    });
    check(trip("Denver NC 28037-4821", "CLT").ok, true, {
      label: "ZIP+4 still reads the served ZIP",
      source: SOURCE.excluded,
    });
    check(trip("Denver CO 28037", "CLT").code, "outside", {
      label: "Colorado wins over a typed North Carolina ZIP",
      source: SOURCE.excluded,
    });
  });

  it("checks the non-airport end and both ends of a local trip", () => {
    check(
      trip("8109 pike road charlotte", "Suya king restaurant").message,
      outside,
      {
        label: "Charlotte to a restaurant",
        source: SOURCE.excluded,
      },
    );
    check(
      trip("123 Main Street, Denver NC 28037", "100 Trade St, Charlotte NC")
        .message,
      outside,
      {
        label: "Denver to Charlotte",
        source: SOURCE.excluded,
      },
    );
    check(
      trip(
        "Charlotte Douglas Airport (CLT)",
        "100 Lake Shore, Sherrills Ford NC",
      ).ok,
      true,
      {
        label: "CLT pickup to Sherrills Ford",
        source: SOURCE.excluded,
      },
    );
    check(trip("CLT", "Concord Regional").ok, true, {
      label: "airport to airport",
      source: SOURCE.excluded,
    });
    check(trip("123 Main, Denver NC", "50 School St, Terrell NC").ok, true, {
      label: "two served towns",
      source: SOURCE.excluded,
    });
    check(trip("", "").code, "unclear", {
      label: "blank ends are unclear",
      source: SOURCE.excluded,
    });
    check(area.evaluateTrip().code, "unclear", {
      label: "missing input is unclear",
      source: SOURCE.excluded,
    });
  });

  it("lets a geocoded city decide an address that did not name a town", () => {
    check(
      trip("8109 Pike Road", "CLT", {
        pickupGeo: { city: "Charlotte", state: "NC", zip: "28262" },
      }).message,
      outside,
      {
        label: "geocoded Charlotte",
        source: SOURCE.excluded,
      },
    );
    check(
      trip("100 Main Street", "CLT", {
        pickupGeo: { city: "Concord", state: "NC", zip: "28027" },
      }).message,
      outside,
      {
        label: "geocoded Concord NC is not served",
        source: SOURCE.excluded,
      },
    );
    check(
      trip("123 Main Street, Denver", "CLT", {
        pickupGeo: { city: "Denver", state: "NC", zip: "28037" },
      }).ok,
      true,
      {
        label: "geocoded Denver NC",
        source: SOURCE.excluded,
      },
    );
    check(
      trip("123 Main Street, Denver", "CLT", {
        pickupGeo: { city: "Denver", state: "CO", zip: "80202" },
      }).code,
      "outside",
      {
        label: "geocoded Denver CO",
        source: SOURCE.excluded,
      },
    );
    check(
      trip("100 Main Street", "CLT", {
        pickupGeo: { city: "", state: "NC", zip: "" },
      }).code,
      "unclear",
      {
        label: "geocoder state without a city stays unclear",
        source: SOURCE.excluded,
      },
    );
    check(
      trip("100 Main Street", "CLT", {
        pickupGeo: { city: "Denver", state: "", zip: "" },
      }).code,
      "unclear",
      {
        label: "geocoder city without a state stays unclear",
        source: SOURCE.excluded,
      },
    );
    check(trip("100 Main Street", "CLT", { pickupGeo: null }).code, "unclear", {
      label: "no geocoder result stays unclear",
      source: SOURCE.excluded,
    });
    check(
      trip("100 Oak St", "200 Pine St", {
        pickupGeo: { zip: "28037" },
        destinationGeo: { city: "Maiden", state: "NC", zip: "28650" },
      }).ok,
      true,
      {
        label: "ZIP-only geocode and a served city",
        source: SOURCE.excluded,
      },
    );
  });

  it("recognizes the priced airports and does not treat lookalikes as airports", () => {
    const cases = [
      ["CLT", "CLT"],
      ["airport", "CLT"],
      ["the airport", "CLT"],
      ["Charlotte Douglas", "CLT"],
      ["douglas international", "CLT"],
      ["douglas intl", "CLT"],
      ["charlotte airport", "CLT"],
      ["charlotte international", "CLT"],
      ["JQF", "JQF"],
      ["Concord Regional", "JQF"],
      ["concord airport", "JQF"],
      ["not CLT", null],
      ["not the clt", null],
      ["Airport Road, Denver NC", null],
      ["Concord Mills", null],
      ["RDU Airport", null],
      ["Charlotte Motor Speedway", null],
      ["CLT and Concord Regional", null],
      ["", null],
    ];
    for (const [input, expected] of cases) {
      check(area.whichAirport(input), expected, {
        label: `airport phrase ${input || "(blank)"}`,
        source: SOURCE.airport,
      });
    }
  });

  it("treats private airfields as an airport end and streets named Airpark as houses", () => {
    check(area.isPrivateAirfield("Lake Norman Airpark"), true, {
      label: "airpark",
      source: SOURCE.excluded,
    });
    check(area.isPrivateAirfield("Long Island Airfield"), true, {
      label: "airfield",
      source: SOURCE.excluded,
    });
    check(area.isPrivateAirfield("grass airstrip"), true, {
      label: "airstrip",
      source: SOURCE.excluded,
    });
    check(area.isPrivateAirfield("private airport"), true, {
      label: "private airport",
      source: SOURCE.excluded,
    });
    check(area.isPrivateAirfield("private airport terminal"), true, {
      label: "private airport terminal",
      source: SOURCE.excluded,
    });
    check(area.isPrivateAirfield("private airport road"), false, {
      label: "private airport road is a street",
      source: SOURCE.excluded,
    });
    check(area.isPrivateAirfield("123 Airpark Drive, Mooresville NC"), false, {
      label: "Airpark Drive is a street",
      source: SOURCE.excluded,
    });
    check(area.isPrivateAirfield("123 Airpark Dr, Lake Norman Airpark"), true, {
      label: "a later airpark name still counts",
      source: SOURCE.excluded,
    });
    check(area.isPrivateAirfield(""), false, {
      label: "blank is not an airfield",
      source: SOURCE.excluded,
    });
    check(area.lookupAirport(""), null, {
      label: "blank is not a known airport",
      source: SOURCE.excluded,
    });
    check(area.lookupAirport("KIPJ and EQY"), null, {
      label: "two named airfields is not one airport",
      source: SOURCE.excluded,
    });
    const aliases = [
      ["CLT", "CLT"],
      ["Charlotte Douglas", "CLT"],
      ["Wilson Air Center", "CLT-PRIVATE"],
      ["Wilson Air Center, Charlotte NC", "CLT-PRIVATE"],
      ["Signature at CLT", "CLT-PRIVATE"],
      ["Signature Flight Support, Charlotte NC", "CLT-PRIVATE"],
      ["Charlotte private airport", "CLT-PRIVATE"],
      ["CLT private", "CLT-PRIVATE"],
      ["5400 Airport Drive", "CLT-PRIVATE"],
      ["Concord Regional", "JQF"],
      ["Concord-Padgett Regional", "JQF-PAX"],
      ["KJQF", "JQF"],
      ["9000 Aviation Blvd", "JQF"],
      ["Allegiant", "JQF-PAX"],
      ["7435 Zephyr Place NW", "JQF-PAX"],
      ["Concord passenger terminal", "JQF-PAX"],
      ["KIPJ", "KIPJ"],
      ["Lincolnton airport", "KIPJ"],
      ["Lincolnton-Lincoln County Regional", "KIPJ"],
      ["Little Mountain Airport", "LITTLE-MOUNTAIN"],
      ["Modern Aviation", "CLT-PRIVATE"],
      ["EQY", "EQY"],
      ["Charlotte-Monroe Executive", "EQY"],
      ["8A6", "8A6"],
      ["Wilgrove Air Park", "8A6"],
    ];
    for (const [input, id] of aliases) {
      check(area.whichAirport(input), id, {
        label: `known airfield ${input}`,
        source: SOURCE.excluded,
      });
      const found = area.lookupAirport(input);
      check(
        found && typeof found.lat === "number" && typeof found.lon === "number",
        true,
        {
          label: `${input} has a door coordinate`,
          source: SOURCE.excluded,
        },
      );
    }
    check(
      trip(
        "123 Main Street, Denver NC 28037",
        "Wilson Air Center, Charlotte NC",
      ).ok,
      true,
      {
        label:
          "Wilson Air Center in Charlotte is an airport, not an outside town",
        source: SOURCE.excluded,
      },
    );
    check(
      trip(
        "123 Main Street, Denver NC 28037",
        "Signature Flight Support, Charlotte NC",
      ).ok,
      true,
      {
        label: "Signature in Charlotte is an airport, not an outside town",
        source: SOURCE.excluded,
      },
    );
    check(
      trip("123 Main Street, Denver NC 28037", "Concord-Padgett Regional").ok,
      true,
      {
        label: "Concord-Padgett is the Concord airport",
        source: SOURCE.excluded,
      },
    );
    check(trip("100 Main St, Charlotte NC", "KIPJ").code, "outside", {
      label: "a Charlotte pickup is still outside",
      source: SOURCE.excluded,
    });
    check(
      trip("Smith Field, Charlotte NC", "123 Main Street, Denver NC 28037", {
        pickupIsAirfield: true,
      }).ok,
      true,
      {
        label:
          "an unmarked private pickup is allowed when marked as an airfield",
        source: SOURCE.excluded,
      },
    );
    check(
      trip("123 Main Street, Denver NC 28037", "Smith Field, Charlotte NC", {
        destinationIsAirfield: true,
      }).ok,
      true,
      {
        label:
          "an unmarked private destination is allowed when marked as an airfield",
        source: SOURCE.excluded,
      },
    );
    check(
      trip("Smith Field, Charlotte NC", "123 Main Street, Denver NC 28037")
        .code,
      "outside",
      {
        label: "Charlotte text is still outside when it is not an airfield",
        source: SOURCE.excluded,
      },
    );
    check(
      trip("Lake Norman Airpark, Mooresville NC", "123 Main, Denver NC").ok,
      true,
      {
        label: "airpark in Mooresville to Denver",
        source: SOURCE.excluded,
      },
    );
    check(trip("123 Airpark Drive, Mooresville NC", "CLT").code, "outside", {
      label: "Airpark Drive in Mooresville",
      source: SOURCE.excluded,
    });
  });

  it("reads state names that are not two-letter abbreviations", () => {
    check(
      area.classifyAddress("100 Main Hartford CT 06103").status,
      "outside",
      {
        label: "Connecticut before a ZIP",
        source: SOURCE.excluded,
      },
    );
    check(area.classifyAddress("north carolina 28037").status, "served", {
      label: "state name before a ZIP",
      source: SOURCE.excluded,
    });
    check(area.classifyAddress("100 Main St NE").status, "unclear", {
      label: "NE at the end is a direction",
      source: SOURCE.excluded,
    });
    check(area.classifyAddress("100 Main Ct").status, "unclear", {
      label: "Ct at the end is court",
      source: SOURCE.excluded,
    });
    check(area.classifyAddress("main 28037").status, "served", {
      label: "served ZIP after a street word",
      source: SOURCE.excluded,
    });
    check(area.classifyAddress("foo bar 28037").status, "served", {
      label: "served ZIP after two unknown words",
      source: SOURCE.excluded,
    });
    check(area.classifyAddress("99999").status, "unclear", {
      label: "unknown ZIP is not a town",
      source: SOURCE.excluded,
    });
    check(area.isPrivateAirfield("airpark road"), false, {
      label: "airpark road is a street",
      source: SOURCE.excluded,
    });
    check(area.classifyAddress("").status, "unclear", {
      label: "blank address is unclear",
      source: SOURCE.excluded,
    });
    check(area.classifyAddress("28037").status, "served", {
      label: "served ZIP with no town name",
      source: SOURCE.excluded,
    });
    check(
      area.classifyAddress("100 Main St, Lowesville 28164").status,
      "served",
      {
        label: "shared ZIP with the served town name",
        source: SOURCE.excluded,
      },
    );
    check(area.classifyAddress("").status, "unclear", {
      label: "blank address",
      source: SOURCE.excluded,
    });
    check(
      area.classifyEnd("Charlotte Douglas Airport", {
        city: "Charlotte",
        state: "NC",
        zip: "28219",
      }).status,
      "airport",
      {
        label: "airport end is not reclassified as Charlotte",
        source: SOURCE.excluded,
      },
    );
  });
});
