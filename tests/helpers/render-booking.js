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

export function bookingPosts(state) {
  return state.requests.filter((request) => {
    if (request.method !== "POST") return false;
    const host = hostnameOf(request.url);
    return host === "script.google.com" || host === "docs.google.com";
  });
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
    censusMode: options.censusMode ?? "ok",
    routeMode: options.routeMode ?? "ok",
    failPost: options.failPost ?? false,
    requests: [],
  };

  const $ = window.jQuery;
  $.ajax = (settings) => {
    const url = settings.url || "";
    const host = hostnameOf(url);
    const method = (settings.method || settings.type || "GET").toUpperCase();
    state.requests.push({ via: "ajax", method, url, mocked: true });
    if (host === "geocoding.geo.census.gov") {
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
                  coordinates: { x: state.lon, y: state.lat },
                  addressComponents: {
                    city: state.censusCity,
                    state: state.censusState,
                    zip: state.censusZip,
                  },
                },
              ],
            },
          });
      }
    } else if (host === "script.google.com") {
      settings.success && settings.success(state.bookings);
    } else if (settings.error) {
      settings.error({}, "error", "blocked");
    }
    return { abort() {} };
  };

  window.fetch = async (url, init = {}) => {
    const href = String(url);
    const host = hostnameOf(href);
    const method = (init.method || "GET").toUpperCase();
    state.requests.push({ via: "fetch", method, url: href, mocked: true });
    if (state.failPost && method === "POST") {
      throw new Error("mocked network failure");
    }
    if (host === "router.project-osrm.org") {
      if (state.routeMode === "error") return jsonResponse({ code: "NoRoute" });
      return jsonResponse({
        code: "Ok",
        routes: [{ distance: state.miles * 1609.344 }],
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
  setControl(placeholder(doc, "CLT Airport"), overrides.destination ?? "CLT");
  chooseRadio(doc, "airport-trip", overrides.airport ?? "Yes");
  chooseRadio(doc, "group-event", overrides.group ?? "No");
  if (overrides.bags) {
    const bags = role(doc, "checkbox", {
      name: /checking bags/i,
      hidden: true,
    });
    bags.checked = true;
    window.jQuery(bags).trigger("change");
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
  if (airport) chooseRadio(view.document, "airport-trip", airport);
  if (roundTrip) {
    const box = role(view.document, "checkbox", { name: /round trip/i });
    box.checked = true;
    window.jQuery(box).trigger("change");
  }
  setControl(
    placeholder(view.document, "123 Main Street, Denver NC 28037"),
    pickup,
  );
  setControl(placeholder(view.document, "CLT Airport"), destination);
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
