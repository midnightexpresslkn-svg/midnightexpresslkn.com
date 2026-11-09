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
      "var oneCents=Math.round(Math.max(q([59,56]),mi*q([63,35,58,56]))*100);",
    ),
  airport: () => sourceLine("js/booking.js", "function whichAirport(raw)"),
  excluded: () =>
    sourceLine("js/service-area.js", "function evaluateTrip(input)"),
  serviceArea: () =>
    sourceLine(
      "js/booking.js",
      "async function decideServiceArea(pickup, destination)",
    ),
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
  flight: () => sourceLine("js/booking.js", "function placeFlightField()"),
  group: () => sourceLine("js/booking.js", "function updateTripLayout()"),
  pricing: () => sourceLine("index.html", 'id="group-pricing-note"'),
  escape: () => sourceLine("js/booking.js", "function escapeHtml(value)"),
  review: () => sourceLine("index.html", "Leave a review on Google"),
  manifest: () => sourceLine("manifest.webmanifest", '"start_url"'),
};
