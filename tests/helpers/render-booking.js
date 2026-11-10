import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { waitFor } from "@testing-library/dom";
import { placeholder, role, roles } from "./failure.js";
import { hostnameOf } from "./hostname.js";

const root = process.cwd();
const pageHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const pageBody = new JSDOM(pageHtml).window.document.body.innerHTML;
const jquerySource = fs.readFileSync(path.join(root, "js/jquery.js"), "utf8");
const flatpickrSource = fs.readFileSync(
  path.join(root, "js/flatpickr.min.js"),
  "utf8",
);
const serviceAreaSource = fs.readFileSync(
  path.join(root, "js/service-area.js"),
  "utf8",
);
const scriptSource = {
  "js/booking.js": fs.readFileSync(path.join(root, "js/booking.js"), "utf8"),
  "js/booking.min.js": fs.readFileSync(
    path.join(root, "js/booking.min.js"),
    "utf8",
  ),
};

const pendingTimers = new Set();
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
let timersWrapped = false;

function wrapTimers() {
  if (timersWrapped) return;
  timersWrapped = true;
  globalThis.setTimeout = (fn, ms, ...args) => {
    const id = nativeSetTimeout(() => {
      pendingTimers.delete(id);
      fn(...args);
    }, ms);
    pendingTimers.add(id);
    return id;
  };
  globalThis.clearTimeout = (id) => {
    pendingTimers.delete(id);
    nativeClearTimeout(id);
  };
}

export function drainTimers() {
  for (const id of pendingTimers) nativeClearTimeout(id);
  pendingTimers.clear();
}

function run(code, filename) {
  vm.runInThisContext(code, { filename: path.resolve(root, filename) });
}

let libsReady = false;

function ensureLibs() {
  wrapTimers();
  if (libsReady) return;
  const savedModule = globalThis.module;
  const savedExports = globalThis.exports;
  try {
    delete globalThis.module;
    delete globalThis.exports;
    run(jquerySource, "js/jquery.js");
    run(flatpickrSource, "js/flatpickr.min.js");
  } finally {
    if (savedModule) globalThis.module = savedModule;
    if (savedExports) globalThis.exports = savedExports;
  }
  window.jQuery.fx.off = true;
  if (!window.jQuery.isReady && document.readyState === "complete") {
    window.jQuery.ready();
  }
  libsReady = true;
}

function jsonResponse(data) {
  return {
    ok: true,
    status: 200,
    type: "basic",
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function headerMap(headers) {
  const out = {};
  if (!headers) return out;
  if (typeof headers.forEach === "function") {
    headers.forEach((value, key) => {
      out[String(key).toLowerCase()] = String(value);
    });
    return out;
  }
  for (const [key, value] of Object.entries(headers)) {
    out[String(key).toLowerCase()] = String(value);
  }
  return out;
}

function formEntriesOf(body) {
  if (typeof FormData === "undefined" || !(body instanceof FormData))
    return null;
  const entries = [];
  for (const [key, value] of body.entries()) entries.push([key, String(value)]);
  return entries;
}

export function bookingPosts(state) {
  return state.requests.filter((request) => {
    if (request.method !== "POST") return false;
    const host = hostnameOf(request.url);
    return host === "script.google.com" || host === "docs.google.com";
  });
}

export function sameEndpoint(value, origin, pathname) {
  try {
    const url = new URL(String(value));
    return url.origin === origin && url.pathname === pathname;
  } catch {
    return false;
  }
}

const FORM_ORIGIN = "https://docs.google.com";
const FORM_PATH =
  "/forms/d/e/1FAIpQLSelLJ8Yqj8jHXreIB3DW8MvsBUtHea8DB7UTjyaYkM3Q2RbTA/formResponse";

export function formPosts(state) {
  return bookingPosts(state).filter((request) =>
    sameEndpoint(request.url, FORM_ORIGIN, FORM_PATH),
  );
}

export async function renderBooking(script, options = {}) {
  ensureLibs();
  drainTimers();
  document.body.innerHTML = pageBody;
  const state = {
    miles: options.miles ?? 10,
    bookings: options.bookings ?? [],
    censusCity: options.censusCity ?? "Denver",
    censusState: options.censusState ?? "NC",
    censusZip: options.censusZip ?? "28037",
    lat: options.lat ?? 35.53,
    lon: options.lon ?? -81.03,
    places: options.places ?? null,
    censusMode: options.censusMode ?? "ok",
    routeMode: options.routeMode ?? "ok",
    routesMiles: options.routesMiles ?? null,
    failPost: options.failPost ?? false,
    bookingsMode: options.bookingsMode ?? "ok",
    requests: [],
  };

  const $ = window.jQuery;
  $.ajax = (settings) => {
    const url = settings.url || "";
    const host = hostnameOf(url);
    const method = (settings.method || settings.type || "GET").toUpperCase();
    state.requests.push({
      via: "ajax",
      method,
      url,
      address: settings.data && settings.data.address,
      mocked: true,
    });
    if (host === "geocoding.geo.census.gov") {
      const place =
        state.places && settings.data
          ? state.places[settings.data.address]
          : null;
      if (state.censusMode === "error") {
        settings.error && settings.error({}, "error", "mocked");
      } else if (state.censusMode === "miss") {
        settings.success &&
          settings.success({ result: { addressMatches: [] } });
      } else {
        settings.success &&
          settings.success({
            result: {
              addressMatches: [
                {
                  coordinates: {
                    x: place ? place.lon : state.lon,
                    y: place ? place.lat : state.lat,
                  },
                  addressComponents: {
                    city: place ? place.city : state.censusCity,
                    state: place ? place.state : state.censusState,
                    zip: place ? place.zip : state.censusZip,
                  },
                },
              ],
            },
          });
      }
    } else if (host === "script.google.com") {
      if (state.bookingsMode === "error") {
        settings.error && settings.error({}, "error", "mocked");
      } else {
        settings.success && settings.success(state.bookings);
      }
    } else if (settings.error) {
      settings.error({}, "error", "blocked");
    }
    return { abort() {} };
  };

  window.fetch = async (url, init = {}) => {
    const href = String(url);
    const host = hostnameOf(href);
    const method = (init.method || "GET").toUpperCase();
    state.requests.push({
      via: "fetch",
      method,
      url: href,
      body: typeof init.body === "string" ? init.body : "",
      formEntries: formEntriesOf(init.body),
      headers: headerMap(init.headers),
      mode: init.mode || "",
      credentials: init.credentials || "",
      mocked: true,
    });
    if (state.failPost && method === "POST") {
      throw new Error("mocked network failure");
    }
    if (host === "router.project-osrm.org") {
      if (state.routeMode === "error") return jsonResponse({ code: "NoRoute" });
      let miles = state.miles;
      if (state.places) {
        const match = href.match(/driving\/([-\d.]+),([-\d.]+);/);
        if (match) {
          const lon = Number(match[1]);
          const lat = Number(match[2]);
          for (const place of Object.values(state.places)) {
            if (
              Math.abs(place.lon - lon) < 0.00001 &&
              Math.abs(place.lat - lat) < 0.00001
            ) {
              miles = place.miles;
            }
          }
        }
      }
      const distances = state.routesMiles || [miles];
      return jsonResponse({
        code: "Ok",
        routes: distances.map((routeMiles) => ({
          distance: routeMiles * 1609.344,
        })),
      });
    }
    if (host === "nominatim.openstreetmap.org") {
      return jsonResponse([{ lat: String(state.lat), lon: String(state.lon) }]);
    }
    if (host === "script.google.com" || host === "docs.google.com") {
      return {
        ok: true,
        status: 200,
        type: "opaque",
        json: async () => [],
        text: async () => "",
      };
    }
    throw new Error(`Blocked network call: ${method} ${href}`);
  };
  window.XMLHttpRequest = function XMLHttpRequest() {};
  window.XMLHttpRequest.prototype.open = function open(method, url) {
    this._method = method;
    this._url = url;
  };
  window.XMLHttpRequest.prototype.send = function send() {
    throw new Error(`Unexpected XHR ${this._method} ${this._url}`);
  };
  window.XMLHttpRequest.prototype.setRequestHeader =
    function setRequestHeader() {};
  window.XMLHttpRequest.prototype.abort = function abort() {};

  const quiet = () => {};
  console.log = quiet;
  console.info = quiet;
  console.warn = quiet;

  window.history.replaceState(null, "", options.url || "/");
  if (options.withoutForm) document.querySelector("#bookingForm")?.remove();
  run(serviceAreaSource, "js/service-area.js");
  run(scriptSource[script], script);
  await new Promise((resolve) => nativeSetTimeout(resolve, 0));
  return { script, document, window, state, $: window.jQuery };
}

function setControl(el, value) {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  window
    .jQuery(el)
    .val(value)
    .trigger("input")
    .trigger("change")
    .trigger("blur");
}

export function chooseTrip(document, value) {
  const el = document.querySelector("#trip-type");
  if (!el) throw new Error("Trip type dropdown is missing");
  el.value = value;
  window.jQuery(el).trigger("change");
  return el;
}

export function chooseRadio(document, inputName, value, meta = {}) {
  const matches = roles(
    document,
    "radio",
    { name: new RegExp(`^${value}$`, "i") },
    {
      ...meta,
      expected: `${inputName} = ${value}`,
      actual: "radio not found",
    },
  );
  const el = matches.find(
    (node) => node.name === inputName && node.value === value,
  );
  if (!el) {
    throw new Error(`No radio ${inputName}=${value}`);
  }
  el.checked = true;
  window.jQuery(el).trigger("click").trigger("change");
  return el;
}

export function setWhen(document, date, time, prefix = "") {
  const dateEl = document.querySelector(
    prefix ? `#booking-${prefix}date`.replace("--", "-") : "#booking-date",
  );
  const timeEl = document.querySelector(
    prefix ? `#booking-${prefix}time` : "#booking-time",
  );
  const dateId =
    prefix === "return-" ? "#booking-return-date" : "#booking-date";
  const timeId =
    prefix === "return-" ? "#booking-return-time" : "#booking-time";
  const dateNode = document.querySelector(dateId);
  const timeNode = document.querySelector(timeId);
  if (dateNode._flatpickr) dateNode._flatpickr.setDate(date, true);
  dateNode.value = date;
  if (timeNode._flatpickr) timeNode._flatpickr.setDate(time, true);
  timeNode.value = time;
  void dateEl;
  void timeEl;
}

export async function fillValid(view, overrides = {}) {
  const doc = view.document;
  const trip =
    overrides.trip || (overrides.group === "Yes" ? "group" : "airport");
  chooseTrip(doc, trip);
  setControl(
    placeholder(doc, "Jane Smith"),
    overrides.name ?? "TEST, DO NOT BOOK",
  );
  setControl(placeholder(doc, "5555551234"), overrides.phone ?? "9804229125");
  setControl(
    placeholder(doc, "email@example.com"),
    overrides.email ?? "jane@example.com",
  );
  const passengers = roles(doc, "spinbutton").find(
    (el) => el.id === "booking-passengers",
  );
  setControl(passengers, overrides.passengers ?? "2");
  setControl(
    placeholder(doc, "123 Main Street, Denver NC 28037"),
    overrides.pickup ?? "123 Main Street, Denver NC 28037",
  );
  const destination =
    overrides.destination ??
    (trip === "group" ? "200 Oak St, Sherrills Ford NC" : "CLT");
  if (trip === "group") {
    setControl(doc.querySelector("#booking-destination"), destination);
  } else {
    const api = view.window.MidnightServiceArea;
    const found =
      api && api.lookupAirport ? api.lookupAirport(destination) : null;
    const airline = doc.querySelector("#airport-choice");
    if (found && airline) {
      airline.value = found.id;
      view.window.jQuery(airline).trigger("change");
    } else {
      setControl(doc.querySelector("#booking-destination"), destination);
      if (airline && !airline.value && overrides.airportId !== "") {
        airline.value = overrides.airportId || "CLT";
      }
    }
  }
  if (trip === "group") {
    const groupPickup = doc.querySelector("#group-pickup");
    const groupDropoff = doc.querySelector("#group-dropoff");
    const groupDescription = doc.querySelector("#group-description");
    const groupHours = doc.querySelector("#group-hours");
    if (groupPickup) {
      setControl(
        groupPickup,
        overrides.groupPickup ?? "100 Main St, Denver NC",
      );
    }
    if (groupDropoff) {
      setControl(
        groupDropoff,
        overrides.groupDropoff ?? "200 Oak St, Sherrills Ford NC",
      );
    }
    if (groupDescription) {
      setControl(groupDescription, overrides.description ?? "Family reunion");
    }
    if (groupHours) setControl(groupHours, overrides.hours ?? "3");
  }
  if (overrides.flight) {
    setControl(doc.querySelector("#booking-flight"), overrides.flight);
  }
  if (overrides.notes) {
    setControl(doc.querySelector("#booking-notes"), overrides.notes);
  }
  if (trip === "airport") {
    const choice = doc.querySelector(
      overrides.bags
        ? "#booking-checking-bags-yes"
        : "#booking-checking-bags-no",
    );
    const count = doc.querySelector("#booking-bag-count");
    if (choice) {
      choice.checked = true;
      window.jQuery(choice).trigger("change");
    }
    if (count) {
      count.value = overrides.bagCount ?? (overrides.bags ? "2" : "0");
      window.jQuery(count).trigger("input");
    }
  }
  if (overrides.roundTrip) {
    const roundTrip = role(doc, "checkbox", { name: /round trip/i });
    roundTrip.checked = true;
    window.jQuery(roundTrip).trigger("change");
    setWhen(
      doc,
      overrides.returnDate ?? "2026-12-16",
      overrides.returnTime ?? "15:00:00",
      "return-",
    );
  }
  setWhen(doc, overrides.date ?? "2026-12-15", overrides.time ?? "10:00:00");
}

export async function submitForm(view) {
  window.jQuery("#bookingForm").trigger("submit");
  await waitFor(
    () => {
      const text =
        view.document.querySelector("#booking-success")?.textContent?.trim() ||
        "";
      if (!text) throw new Error("waiting for the booking result");
    },
    { timeout: 4000 },
  );
}

export async function showQuote(
  view,
  { pickup, destination, roundTrip = false, airport = "Yes" },
) {
  chooseTrip(view.document, airport === "No" ? "group" : "airport");
  if (roundTrip) {
    const box = role(view.document, "checkbox", { name: /round trip/i });
    box.checked = true;
    window.jQuery(box).trigger("change");
  }
  setControl(
    placeholder(view.document, "123 Main Street, Denver NC 28037"),
    pickup,
  );
  setControl(view.document.querySelector("#booking-destination"), destination);
  window.jQuery("#booking-destination").trigger("blur");
  let text = "";
  await waitFor(
    () => {
      text =
        view.document
          .querySelector("#quote-details")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() || "";
      if (!text || /figuring/i.test(text))
        throw new Error(`quote not ready: ${text}`);
    },
    { timeout: 4000 },
  );
  return text;
}

export function resultText(document) {
  return (document.querySelector("#booking-success")?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function atLocal(ymd, hours, minutes) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
}
