import fs from "node:fs";

const cache = new Map();

export function sourceLine(file, snippet) {
  const key = `${file}\0${snippet}`;
  if (cache.has(key)) return cache.get(key);
  let found = null;
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    const index = lines.findIndex((line) => line.includes(snippet));
    if (index >= 0) found = { file, line: index + 1 };
  }
  cache.set(key, found);
  return found;
}

export function formatSource(loc) {
  if (!loc) return "js/booking.js (line not found)";
  return `${loc.file}:${loc.line}`;
}

export const SOURCE = {
  quote: () =>
    sourceLine(
      "js/booking.js",
      "var one=Math.round(Math.max(q([58,61]),mi*q([63,35,58,56]))*100)/100",
    ),
  airport: () => sourceLine("js/booking.js", "function whichAirport(raw)"),
  excluded: () =>
    sourceLine("js/booking.js", "function addressHasExcludedTown(address)"),
  passengers: () =>
    sourceLine(
      "js/booking.js",
      "function calculatePassengerCapacity(requirements)",
    ),
  passengerRequired: () =>
    sourceLine("js/booking.js", "Please enter the number of passengers."),
  conflict: () =>
    sourceLine(
      "js/booking.js",
      "function hasTimeConflict(dateStr, timeStr, existingBookings)",
    ),
  overlap: () =>
    sourceLine(
      "js/booking.js",
      "return Math.abs(proposedMinutes - existingMinutes) < RIDE_DURATION_MINUTES;",
    ),
  drivers: () => sourceLine("js/booking.js", "const DRIVER_COUNT = 2;"),
  group: () => sourceLine("js/booking.js", "function updateGroupEventUI()"),
  escape: () => sourceLine("js/booking.js", "function escapeHtml(value)"),
  geocode: () => sourceLine("js/booking.js", "function geocode(a)"),
  route: () => sourceLine("js/booking.js", "function driveMiles(g,ap)"),
  submit: () =>
    sourceLine(
      "js/booking.js",
      "function submitToGoogleSheets(submissionData)",
    ),
  calendar: () =>
    sourceLine("js/booking.js", "function postBookingToCalendar(formData)"),
  timeline: () =>
    sourceLine("js/booking.js", "function buildTimeline(bookings)"),
  phone: () => sourceLine("js/booking.js", "function validatePhone(phone)"),
  email: () => sourceLine("js/booking.js", "function validateEmail(email)"),
  flight: () =>
    sourceLine("js/booking.js", "function validateFlightNumber(flightNumber)"),
  advance: () =>
    sourceLine(
      "js/booking.js",
      "Please book at least 3 hours in advance. For urgent bookings, call (980) 422-9125",
    ),
  review: () => sourceLine("index.html", "Leave a review on Google"),
  manifest: () => sourceLine("manifest.webmanifest", '"start_url"'),
};
