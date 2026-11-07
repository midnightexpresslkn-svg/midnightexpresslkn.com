import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, it } from "vitest";
import { check } from "./helpers/failure.js";

const quoteFile = path.resolve("js/quote-miles.js");
vm.runInThisContext(fs.readFileSync(quoteFile, "utf8"), {
  filename: quoteFile,
});

const source = fs.readFileSync("apps-script/Code.gs", "utf8");
const library = globalThis.MidnightQuoteMiles;
const origin = "7740 Marlette Ln, Sherrills Ford, NC 28673";
const meters29 = 29 * library.METERS_PER_MILE;

function contentService() {
  return {
    MimeType: { JSON: "application/json", JAVASCRIPT: "text/javascript" },
    createTextOutput(text) {
      return {
        text,
        mime: null,
        setMimeType(mime) {
          this.mime = mime;
          return this;
        },
      };
    },
  };
}

function load(options = {}) {
  const calls = [];
  const cacheStore = options.cacheStore || {};
  const cache =
    options.cache === undefined
      ? {
          get(key) {
            if (cacheStore.throwOnGet) throw new Error("cache read failed");
            return Object.prototype.hasOwnProperty.call(cacheStore, key)
              ? cacheStore[key]
              : null;
          },
          put(key, value, seconds) {
            if (cacheStore.throwOnPut) throw new Error("cache write failed");
            cacheStore[key] = value;
            cacheStore.lastSeconds = seconds;
          },
        }
      : options.cache;
  const maps = {
    DirectionFinder: { Mode: { DRIVING: "driving" } },
    newDirectionFinder() {
      if (options.throwOnCreate) throw new Error("maps unavailable");
      const finder = {
        origin: null,
        destination: null,
        mode: null,
        region: null,
        setOrigin(value) {
          this.origin = value;
          return this;
        },
        setDestination(value) {
          this.destination = value;
          return this;
        },
        setMode(value) {
          this.mode = value;
          return this;
        },
        setRegion(value) {
          this.region = value;
          return this;
        },
        getDirections() {
          if (options.throwOnDirections) throw new Error("quota");
          return options.directions;
        },
      };
      calls.push(finder);
      return finder;
    },
  };
  let calendarCalls = 0;
  const context = vm.createContext({
    JSON,
    Date,
    Math,
    isFinite,
    isNaN,
    parseInt,
    String,
    Number,
    RegExp,
    Array,
    Object,
    console,
    Maps: maps,
    CacheService: {
      getScriptCache() {
        if (options.throwOnCacheService) throw new Error("no cache");
        return cache;
      },
    },
    CalendarApp: {
      getCalendarById() {
        calendarCalls += 1;
        if (options.calendarError) throw new Error("calendar down");
        return {
          getEvents() {
            return [
              {
                isAllDayEvent() {
                  return true;
                },
                getStartTime() {
                  return { toISOString: () => "all-day" };
                },
              },
              {
                isAllDayEvent() {
                  return false;
                },
                getStartTime() {
                  return { toISOString: () => "2026-12-15T15:00:00.000Z" };
                },
              },
            ];
          },
        };
      },
      getDefaultCalendar() {
        return null;
      },
    },
    ContentService: contentService(),
  });
  vm.runInContext(source, context, { filename: "apps-script/Code.gs" });
  return { context, calls, cacheStore, calendarCalls: () => calendarCalls };
}

function directionsFor(value) {
  return {
    status: "OK",
    routes: [
      { legs: [{ distance: { value } }] },
      { legs: [{ distance: { value: 1 } }] },
    ],
  };
}

describe("apps script driving meters", () => {
  it("matches the website's reading of a Google directions payload", () => {
    const { context } = load();
    const samples = [
      null,
      {
        status: "ZERO_RESULTS",
        routes: [{ legs: [{ distance: { value: 1 } }] }],
      },
      directionsFor(meters29),
      {
        routes: [
          {
            legs: [
              { distance: { value: 1000 } },
              { distance: { value: 2500 } },
            ],
          },
        ],
      },
      { status: "OK", routes: [{ legs: [{ distance: { value: 0 } }] }] },
    ];
    for (const sample of samples) {
      check(
        context.metersFromDirections_(sample),
        library.metersFromDirections(sample),
        {
          label: "script and website read the same meters",
          source: "apps-script/Code.gs:1",
        },
      );
    }
    check(context.airportPlace_("CLT"), library.airportPlace("CLT"), {
      label: "script CLT place matches the website",
      source: "apps-script/Code.gs:1",
    });
    check(context.airportPlace_("JQF"), library.airportPlace("JQF"), {
      label: "script Concord place matches the website",
      source: "apps-script/Code.gs:1",
    });
    check(context.airportPlace_("RDU"), null, {
      label: "script rejects an unknown airport",
      source: "apps-script/Code.gs:1",
    });
  });

  it("asks Google for the recommended drive to the airport place", () => {
    const { context, calls, cacheStore, calendarCalls } = load({
      directions: directionsFor(meters29),
    });
    const result = context.quoteDrivingMeters_(`  ${origin}  `, "CLT");
    check(
      result,
      { ok: true, meters: meters29 },
      {
        label: "29.0 miles in meters",
        source: "apps-script/Code.gs:1",
      },
    );
    check(calls.length, 1, {
      label: "one directions lookup",
      source: "apps-script/Code.gs:1",
    });
    check(calls[0].origin, origin, {
      label: "trimmed pickup is the origin",
      source: "apps-script/Code.gs:1",
    });
    check(calls[0].destination, library.airportPlace("CLT"), {
      label: "destination is the CLT place, not the airfield pin",
      source: "apps-script/Code.gs:1",
    });
    check(calls[0].mode, "driving", {
      label: "driving mode",
      source: "apps-script/Code.gs:1",
    });
    check(calls[0].region, "us", {
      label: "US region",
      source: "apps-script/Code.gs:1",
    });
    check(cacheStore.lastSeconds, 21600, {
      label: "successful lookup is cached for six hours",
      source: "apps-script/Code.gs:1",
    });
    check(calendarCalls(), 0, {
      label: "a miles lookup does not read the calendar",
      source: "apps-script/Code.gs:1",
    });
    const again = context.quoteDrivingMeters_(origin, "CLT");
    check(again.meters, meters29, {
      label: "cached meters are reused",
      source: "apps-script/Code.gs:1",
    });
    check(calls.length, 1, {
      label: "cache hit does not call Google again",
      source: "apps-script/Code.gs:1",
    });
  });

  it("sums legs and does not keep a failed Google response", () => {
    const { context } = load({
      directions: {
        routes: [
          {
            legs: [
              { distance: { value: 1000 } },
              { distance: { value: 2500 } },
            ],
          },
          { legs: [{ distance: { value: 1 } }] },
        ],
      },
    });
    check(
      context.quoteDrivingMeters_(origin, "JQF"),
      { ok: true, meters: 3500 },
      {
        label: "Concord uses the recommended legs",
        source: "apps-script/Code.gs:1",
      },
    );
    const failed = load({
      directions: {
        status: "ZERO_RESULTS",
        routes: [{ legs: [{ distance: { value: 1 } }] }],
      },
    });
    check(
      failed.context.quoteDrivingMeters_(origin, "CLT"),
      { ok: false },
      {
        label: "a failed Google status is not a fare",
        source: "apps-script/Code.gs:1",
      },
    );
    check(failed.calls[0].destination, library.airportPlace("CLT"), {
      label: "failed lookup still targeted CLT",
      source: "apps-script/Code.gs:1",
    });
  });

  it("rejects bad input without calling Google", () => {
    const cases = [
      ["", "CLT"],
      ["12345", "CLT"],
      ["123456", "CLT"],
      ["Marlette Lane, NC", "CLT"],
      [`A1${"b".repeat(239)}`, "CLT"],
      [origin, "RDU"],
      [origin, "clt"],
      [origin, ""],
    ];
    for (const [from, airport] of cases) {
      const { context, calls } = load({ directions: directionsFor(meters29) });
      check(
        context.quoteDrivingMeters_(from, airport),
        { ok: false },
        {
          label: `reject ${airport || "blank"} origin length ${String(from).length}`,
          source: "apps-script/Code.gs:1",
        },
      );
      check(calls.length, 0, {
        label: "bad input does not call Google",
        source: "apps-script/Code.gs:1",
      });
    }
    const point = load({ directions: directionsFor(1000) });
    check(
      point.context.quoteDrivingMeters_("35.531200,-81.029400", "CLT").ok,
      true,
      {
        label: "a census point is a valid origin",
        source: "apps-script/Code.gs:1",
      },
    );
  });

  it("still returns Google's meters when the cache is missing or stale", () => {
    const mismatched = load({
      directions: directionsFor(meters29),
      cacheStore: {},
    });
    const key = mismatched.context.milesCacheKey_("CLT", origin);
    mismatched.cacheStore[key] = JSON.stringify({
      origin: "other",
      airport: "CLT",
      meters: 1,
    });
    check(
      mismatched.context.quoteDrivingMeters_(origin, "CLT").meters,
      meters29,
      {
        label: "a cache entry for another pickup is ignored",
        source: "apps-script/Code.gs:1",
      },
    );

    const otherAirport = load({ directions: directionsFor(meters29) });
    const cltKey = otherAirport.context.milesCacheKey_("CLT", origin);
    otherAirport.cacheStore[cltKey] = JSON.stringify({
      origin,
      airport: "JQF",
      meters: 1,
    });
    check(
      otherAirport.context.quoteDrivingMeters_(origin, "CLT").meters,
      meters29,
      {
        label: "a cache entry for the other airport is ignored",
        source: "apps-script/Code.gs:1",
      },
    );

    const badMeters = load({ directions: directionsFor(meters29) });
    const badKey = badMeters.context.milesCacheKey_("CLT", origin);
    badMeters.cacheStore[badKey] = JSON.stringify({
      origin,
      airport: "CLT",
      meters: 0,
    });
    check(
      badMeters.context.quoteDrivingMeters_(origin, "CLT").meters,
      meters29,
      {
        label: "a non-positive cached distance is ignored",
        source: "apps-script/Code.gs:1",
      },
    );

    const textMeters = load({ directions: directionsFor(meters29) });
    const textKey = textMeters.context.milesCacheKey_("CLT", origin);
    textMeters.cacheStore[textKey] = JSON.stringify({
      origin,
      airport: "CLT",
      meters: "1",
    });
    check(
      textMeters.context.quoteDrivingMeters_(origin, "CLT").meters,
      meters29,
      {
        label: "a text cached distance is ignored",
        source: "apps-script/Code.gs:1",
      },
    );

    const broken = load({ directions: directionsFor(meters29) });
    const brokenKey = broken.context.milesCacheKey_("CLT", origin);
    broken.cacheStore[brokenKey] = "not-json";
    check(broken.context.quoteDrivingMeters_(origin, "CLT").meters, meters29, {
      label: "broken cache JSON falls through to Google",
      source: "apps-script/Code.gs:1",
    });

    const emptyJson = load({ directions: directionsFor(meters29) });
    const emptyKey = emptyJson.context.milesCacheKey_("CLT", origin);
    emptyJson.cacheStore[emptyKey] = "null";
    check(
      emptyJson.context.quoteDrivingMeters_(origin, "CLT").meters,
      meters29,
      {
        label: "null cache JSON falls through to Google",
        source: "apps-script/Code.gs:1",
      },
    );
  });

  it("falls closed when Google or the cache service throws", () => {
    check(
      load({ throwOnDirections: true }).context.quoteDrivingMeters_(
        origin,
        "CLT",
      ),
      { ok: false },
      {
        label: "directions error has no meters",
        source: "apps-script/Code.gs:1",
      },
    );
    check(
      load({ throwOnCreate: true }).context.quoteDrivingMeters_(origin, "CLT"),
      { ok: false },
      {
        label: "Maps service error has no meters",
        source: "apps-script/Code.gs:1",
      },
    );
    const read = load({
      directions: directionsFor(meters29),
      cacheStore: { throwOnGet: true },
    });
    check(read.context.quoteDrivingMeters_(origin, "CLT").meters, meters29, {
      label: "a cache read error still uses Google",
      source: "apps-script/Code.gs:1",
    });
    const write = load({
      directions: directionsFor(meters29),
      cacheStore: { throwOnPut: true },
    });
    check(write.context.quoteDrivingMeters_(origin, "CLT").meters, meters29, {
      label: "a cache write error still returns Google's meters",
      source: "apps-script/Code.gs:1",
    });
    const missing = load({ directions: directionsFor(meters29), cache: null });
    check(missing.context.quoteDrivingMeters_(origin, "CLT").meters, meters29, {
      label: "no cache service still returns Google's meters",
      source: "apps-script/Code.gs:1",
    });
    const service = load({
      directions: directionsFor(meters29),
      throwOnCacheService: true,
    });
    check(service.context.quoteDrivingMeters_(origin, "CLT").meters, meters29, {
      label: "cache service error still returns Google's meters",
      source: "apps-script/Code.gs:1",
    });
  });

  it("serves miles JSON without touching the busy-calendar response", () => {
    const quoted = load({ directions: directionsFor(meters29) });
    const wrapped = quoted.context.doGet({
      parameter: {
        action: "miles",
        origin,
        airport: "CLT",
        callback: "cb",
      },
    });
    check(wrapped.mime, "text/javascript", {
      label: "jsonp mime type",
      source: "apps-script/Code.gs:1",
    });
    check(
      wrapped.text,
      `cb(${JSON.stringify({ ok: true, meters: meters29 })});`,
      {
        label: "jsonp body",
        source: "apps-script/Code.gs:1",
      },
    );
    check(quoted.calendarCalls(), 0, {
      label: "jsonp miles request skips the calendar",
      source: "apps-script/Code.gs:1",
    });
    const raw = quoted.context.doGet({
      parameter: {
        action: "miles",
        origin,
        airport: "CLT",
        callback: "cb;alert(1)",
      },
    });
    check(raw.mime, "application/json", {
      label: "unsafe callback is not wrapped",
      source: "apps-script/Code.gs:1",
    });
    check(JSON.parse(raw.text).meters, meters29, {
      label: "unsafe callback still returns meters",
      source: "apps-script/Code.gs:1",
    });

    const busy = load();
    const calendar = busy.context.doGet({ parameter: {} });
    check(
      JSON.parse(calendar.text),
      [{ datetime: "2026-12-15T15:00:00.000Z" }],
      {
        label: "plain GET is still the busy list",
        source: "apps-script/Code.gs:1",
      },
    );
    check(busy.calendarCalls(), 1, {
      label: "plain GET reads the calendar",
      source: "apps-script/Code.gs:1",
    });
    const down = load({ calendarError: true });
    const error = down.context.doGet({ parameter: { callback: "cb" } });
    check(JSON.parse(error.text.slice(3, -2)).ok, false, {
      label: "calendar failure is still an error payload",
      source: "apps-script/Code.gs:1",
    });
  });
});
