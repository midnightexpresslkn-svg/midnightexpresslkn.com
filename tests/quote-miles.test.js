import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, it } from "vitest";
import { check } from "./helpers/failure.js";

const filename = path.resolve("js/quote-miles.js");
vm.runInThisContext(fs.readFileSync(filename, "utf8"), { filename });
const miles = globalThis.MidnightQuoteMiles;
const meters29 = 29 * miles.METERS_PER_MILE;

function route(value, extra = {}) {
  return {
    status: "OK",
    routes: [{ legs: [{ distance: { value } }] }],
    ...extra,
  };
}

describe("quote miles", () => {
  it("names the airport places the phone search uses", () => {
    check(
      miles.airportPlace("CLT"),
      "Charlotte Douglas Airport (CLT), Charlotte, NC",
      { label: "CLT place", source: "js/quote-miles.js:1" },
    );
    check(miles.airportPlace("JQF"), "Concord Regional Airport, Concord, NC", {
      label: "Concord place",
      source: "js/quote-miles.js:1",
    });
    check(miles.airportPlace("RDU"), null, {
      label: "unknown airport",
      source: "js/quote-miles.js:1",
    });
    check(miles.airportPlace("clt"), null, {
      label: "airport code is case sensitive",
      source: "js/quote-miles.js:1",
    });
    check(miles.airportPlace(""), null, {
      label: "blank airport",
      source: "js/quote-miles.js:1",
    });
  });

  it("converts Google's meters with the international mile", () => {
    check(miles.milesFromMeters(meters29), 29, {
      label: "29.0 miles from meters",
      source: "js/quote-miles.js:1",
    });
    for (const bad of [
      0,
      -1,
      NaN,
      Infinity,
      -Infinity,
      "46670.976",
      null,
      undefined,
    ]) {
      check(miles.milesFromMeters(bad), null, {
        label: `reject meters ${String(bad)}`,
        source: "js/quote-miles.js:1",
      });
    }
  });

  it("uses only the recommended route's meters", () => {
    const directions = {
      status: "OK",
      routes: [
        {
          legs: [{ distance: { value: 1000 } }, { distance: { value: 2500 } }],
        },
        { legs: [{ distance: { value: 1 } }] },
      ],
    };
    check(miles.metersFromDirections(directions), 3500, {
      label: "sum the recommended legs and ignore a shorter alternative",
      source: "js/quote-miles.js:1",
    });
    check(
      miles.metersFromDirections(route(meters29, { status: undefined })),
      meters29,
      {
        label: "missing status still reads the route",
        source: "js/quote-miles.js:1",
      },
    );
    const rejected = [
      null,
      0,
      "route",
      [],
      {
        status: "ZERO_RESULTS",
        routes: [{ legs: [{ distance: { value: 1 } }] }],
      },
      { status: "", routes: [] },
      { status: "OK" },
      { status: "OK", routes: [] },
      { status: "OK", routes: [null] },
      { status: "OK", routes: [{}] },
      { status: "OK", routes: [{ legs: [] }] },
      { status: "OK", routes: [{ legs: [null] }] },
      { status: "OK", routes: [{ legs: [{}] }] },
      { status: "OK", routes: [{ legs: [{ distance: {} }] }] },
      { status: "OK", routes: [{ legs: [{ distance: { value: "10" } }] }] },
      { status: "OK", routes: [{ legs: [{ distance: { value: NaN } }] }] },
      { status: "OK", routes: [{ legs: [{ distance: { value: Infinity } }] }] },
      { status: "OK", routes: [{ legs: [{ distance: { value: 0 } }] }] },
      { status: "OK", routes: [{ legs: [{ distance: { value: -5 } }] }] },
    ];
    for (const sample of rejected) {
      check(miles.metersFromDirections(sample), null, {
        label: "unusable directions",
        source: "js/quote-miles.js:1",
      });
    }
  });

  it("reads meters from the script payload and ignores a shorter miles hint", () => {
    check(
      miles.milesFromPayload({ ok: true, meters: meters29, miles: 1 }),
      29,
      {
        label: "payload miles hint cannot undercut meters",
        source: "js/quote-miles.js:1",
      },
    );
    for (const bad of [
      null,
      0,
      "ok",
      5,
      [],
      [{ datetime: "2026-12-15T15:00:00.000Z" }],
      { ok: false, meters: meters29 },
      { meters: meters29 },
      { ok: "true", meters: meters29 },
      { ok: true },
      { ok: true, meters: 0 },
      { ok: true, meters: "46670.976" },
    ]) {
      check(miles.milesFromPayload(bad), null, {
        label: "reject unusable payload",
        source: "js/quote-miles.js:1",
      });
    }
  });
});
