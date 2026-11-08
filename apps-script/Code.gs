/**
 * Midnight Express LKN — Calendar availability + booking requests
 *
 * Deploy as Web App:
 *   Execute as: Me (midnightexpresslkn@gmail.com)
 *   Who has access: Anyone
 *
 * GET  → JSON array of { datetime } busy pickup starts (no customer PII)
 * GET  ?action=miles&origin=...&airport=CLT|JQF
 *      → { ok:true, meters } for Google's recommended driving route.
 *        Uses the built-in Maps service (no API key). Does not create events.
 * POST → create REQUEST (unconfirmed) calendar event(s); skip if notes say TEST, DO NOT BOOK
 *
 * Driving quotes: redeploy as a new version (Execute as Me, Anyone) and
 * re-authorize when Google asks for the Maps permission. Until that deploy
 * is live, the website will not show a computed fare.
 *
 * Group sheet: a groupEvent of Yes adds one row to the spreadsheet
 * "Midnight Express LKN Group Bookings". The first group booking creates
 * that file in this account (midnightexpresslkn@gmail.com) and saves its id.
 * The calendar event is created first. If the sheet write fails, the event
 * stays. After pasting this version: Deploy, Manage deployments, edit the
 * existing deployment, choose New version, and Deploy. Keep the same web
 * app URL. Approve the Sheets permission when Google asks.
 */

var CALENDAR_ID = "midnightexpresslkn@gmail.com";
var DEFAULT_RANGE_DAYS = 90;
var BLOCK_HOURS = 2;
var MAX_PASSENGERS = 5;

function doGet(e) {
  try {
    var params = e && e.parameter ? e.parameter : {};
    if (String(params.action || "") === "miles") {
      return respond_(
        quoteDrivingMeters_(params.origin, params.airport),
        params.callback,
      );
    }
    var start = params.start ? new Date(params.start) : new Date();
    start.setHours(0, 0, 0, 0);
    var end;
    if (params.end) {
      end = new Date(params.end);
    } else {
      end = new Date(start.getTime());
      end.setDate(end.getDate() + DEFAULT_RANGE_DAYS);
    }
    end.setHours(23, 59, 59, 999);

    var cal = getBusinessCalendar_();
    var events = cal.getEvents(start, end);
    // Front end expects [{ datetime: ISO }] and blocks on ANY single booking.
    // Return one entry per event start. Do NOT include titles, names, addresses, or descriptions.
    var out = [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.isAllDayEvent && ev.isAllDayEvent()) continue;
      out.push({ datetime: ev.getStartTime().toISOString() });
    }

    return respond_(out, params.callback);
  } catch (err) {
    return respond_(
      { ok: false, error: String(err && err.message ? err.message : err) },
      e && e.parameter && e.parameter.callback,
    );
  }
}

function doPost(e) {
  try {
    var data = parsePostBody_(e);
    var passengers = parseInt(data.passengers, 10) || 1;
    if (passengers > MAX_PASSENGERS) {
      return respond_({
        ok: false,
        error: "For more than 5 passengers, please call (980) 422-9125.",
      });
    }

    var notes = String(data.notes || data.specialNotes || "");
    if (/TEST,\s*DO\s*NOT\s*BOOK/i.test(notes)) {
      return respond_({ ok: true, test: true });
    }

    var name = String(data.name || "Customer").trim() || "Customer";
    var phone = String(data.phone || "").trim();
    var email = String(data.email || "").trim();
    var pickup = String(data.pickup || data.pickupAddress || "").trim();
    var destination = String(
      data.destination || data.destinationAddress || "",
    ).trim();
    var airport = String(data.airport || data.airportTrip || "").trim();
    var bags = String(data.bags || data.checkingBags || "").trim();
    var flight = String(data.flight || data.flightNumber || "").trim();
    var roundTrip = String(data.roundTrip || "").trim();
    var pickupDate = String(data.date || data.pickupDate || "").trim();
    var pickupTime = String(data.time || data.pickupTime || "").trim();
    var returnDate = String(data.returnDate || "").trim();
    var returnTime = String(data.returnTime || "").trim();

    var start = parseLocalDateTime_(pickupDate, pickupTime);
    if (!start) {
      return respond_({
        ok: false,
        error: "Missing or invalid pickup date/time",
      });
    }
    var end = new Date(start.getTime() + BLOCK_HOURS * 60 * 60 * 1000);

    var direction = guessDirection_(pickup, destination, airport);
    var title = "REQUEST (unconfirmed): " + direction + " " + name;
    var description = buildDescription_({
      name: name,
      phone: phone,
      email: email,
      pickup: pickup,
      destination: destination,
      passengers: passengers,
      airport: airport,
      bags: bags,
      flight: flight,
      notes: notes,
      roundTrip: roundTrip,
    });

    var cal = getBusinessCalendar_();
    var event = cal.createEvent(title, start, end, {
      description: description,
      location: pickup,
    });
    var eventIds = event && event.getId ? [event.getId()] : [];

    if (/^yes$/i.test(roundTrip) && returnDate && returnTime) {
      var rStart = parseLocalDateTime_(returnDate, returnTime);
      if (rStart) {
        var rEnd = new Date(rStart.getTime() + BLOCK_HOURS * 60 * 60 * 1000);
        var rTitle = "REQUEST (unconfirmed): Pick up " + name;
        var rDesc = buildDescription_({
          name: name,
          phone: phone,
          email: email,
          pickup: destination,
          destination: pickup,
          passengers: passengers,
          airport: "Yes",
          bags: bags,
          flight: flight,
          notes: notes,
          roundTrip: "Yes (return)",
        });
        var returnEvent = cal.createEvent(rTitle, rStart, rEnd, {
          description: rDesc,
          location: destination,
        });
        if (returnEvent && returnEvent.getId) {
          eventIds.push(returnEvent.getId());
        }
      }
    }

    if (/^yes$/i.test(String(data.groupEvent || ""))) {
      try {
        appendGroupBooking_({
          name: name,
          phone: phone,
          email: email,
          pickup: pickup,
          destination: destination,
          date: pickupDate,
          time: pickupTime,
          passengers: passengers,
          bags: bags,
          flight: flight,
          roundTrip: roundTrip,
          returnTime: returnTime,
          notes: notes,
          eventId: eventIds.join(", "),
        });
      } catch (sheetErr) {
        // The request is already on the calendar. A sheet problem must not erase it.
      }
    }

    return respond_({ ok: true });
  } catch (err) {
    return respond_({
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  }
}

/** ---------- helpers ---------- */

function getBusinessCalendar_() {
  var cal = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!cal) {
    cal = CalendarApp.getDefaultCalendar();
  }
  if (!cal) {
    throw new Error("Business calendar not found");
  }
  return cal;
}

function parsePostBody_(e) {
  if (!e) return {};
  // JSON body
  if (e.postData && e.postData.contents) {
    var type = String(e.postData.type || "");
    var raw = e.postData.contents;
    if (
      type.indexOf("application/json") !== -1 ||
      (raw && raw.charAt(0) === "{")
    ) {
      try {
        return JSON.parse(raw);
      } catch (ignore) {}
    }
    // form-urlencoded
    if (type.indexOf("application/x-www-form-urlencoded") !== -1) {
      return e.parameter || {};
    }
  }
  return e.parameter || {};
}

/**
 * Parse YYYY-MM-DD + HH:MM as America/New_York wall time.
 * Apps Script CalendarApp uses the script timezone (set in appsscript.json).
 */
function parseLocalDateTime_(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  var dParts = String(dateStr).split(/[-/]/);
  var tParts = String(timeStr).split(":");
  if (dParts.length < 3 || tParts.length < 2) return null;
  var y, m, d;
  if (String(dateStr).indexOf("-") !== -1) {
    // YYYY-MM-DD
    y = parseInt(dParts[0], 10);
    m = parseInt(dParts[1], 10) - 1;
    d = parseInt(dParts[2], 10);
  } else {
    // MM/DD/YYYY
    m = parseInt(dParts[0], 10) - 1;
    d = parseInt(dParts[1], 10);
    y = parseInt(dParts[2], 10);
  }
  var hh = parseInt(tParts[0], 10);
  var mm = parseInt(tParts[1], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(hh) || isNaN(mm)) return null;
  return new Date(y, m, d, hh, mm, 0, 0);
}

function guessDirection_(pickup, destination, airport) {
  var dest = String(destination || "").toLowerCase();
  var pick = String(pickup || "").toLowerCase();
  if (/clt|airport|concord/.test(dest)) return "Take";
  if (/clt|airport|concord/.test(pick)) return "Pick up";
  if (/^yes$/i.test(String(airport || ""))) return "Take";
  return "Pick up/Take";
}

function buildDescription_(o) {
  var lines = [];
  lines.push("UNCONFIRMED website request — call customer to confirm.");
  lines.push("Name: " + o.name);
  if (o.phone) lines.push("Phone: " + o.phone);
  if (o.email) lines.push("Email: " + o.email);
  lines.push("Pickup: " + o.pickup);
  lines.push("Destination: " + o.destination);
  lines.push("Passengers: " + o.passengers);
  if (o.airport) lines.push("Airport trip: " + o.airport);
  if (o.bags) lines.push("Checking bags: " + o.bags);
  if (o.flight) lines.push("Flight: " + o.flight);
  if (o.roundTrip) lines.push("Round trip: " + o.roundTrip);
  if (o.notes) lines.push("Notes: " + o.notes);
  // Never put dollar amounts / internal prices here from the website form.
  return lines.join("\n");
}

/**
 * Google's recommended driving distance, in meters, between a pickup and
 * CLT or Concord. The destination is the airport place name, not the airfield
 * reference point (CLT 35.2140, -80.9431). That pin sits on the airfield;
 * the passenger curb is about 35.2224, -80.9423. The place name is what the
 * Maps phone app resolves.
 *
 * Keep metersFromDirections_ in step with js/quote-miles.js. The website
 * converts meters to miles and applies the fare. This response has no price.
 */
var AIRPORT_PLACES = {
  CLT: "Charlotte Douglas Airport (CLT), Charlotte, NC",
  JQF: "Concord Regional Airport, Concord, NC",
};

function airportPlace_(code) {
  return AIRPORT_PLACES[code] || null;
}

function metersFromDirections_(directions) {
  if (!directions || typeof directions !== "object") return null;
  if (directions.status && directions.status !== "OK") return null;
  var routes = directions.routes;
  if (!routes || !routes.length) return null;
  var route = routes[0];
  var legs = route && route.legs;
  if (!legs || !legs.length) return null;
  var total = 0;
  for (var i = 0; i < legs.length; i++) {
    var leg = legs[i];
    var distance = leg && leg.distance;
    var value = distance && distance.value;
    if (typeof value !== "number" || !isFinite(value) || value <= 0)
      return null;
    total += value;
  }
  return total;
}

function milesCacheKey_(airport, origin) {
  var text = airport + "|" + origin.toLowerCase();
  var hash = 5381;
  for (var i = 0; i < text.length; i++) {
    hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  }
  return "melkn-mi-" + airport + "-" + hash.toString(16);
}

function readMilesCache_(airport, origin) {
  try {
    var cache = CacheService.getScriptCache();
    if (!cache) return null;
    var raw = cache.get(milesCacheKey_(airport, origin));
    if (!raw) return null;
    var saved = JSON.parse(raw);
    if (!saved || saved.origin !== origin || saved.airport !== airport)
      return null;
    if (typeof saved.meters !== "number" || !(saved.meters > 0)) return null;
    return { ok: true, meters: saved.meters };
  } catch (ignore) {
    return null;
  }
}

function writeMilesCache_(airport, origin, meters) {
  try {
    var cache = CacheService.getScriptCache();
    if (!cache) return;
    cache.put(
      milesCacheKey_(airport, origin),
      JSON.stringify({
        origin: origin,
        airport: airport,
        meters: meters,
      }),
      21600,
    );
  } catch (ignore) {}
}

function quoteDrivingMeters_(origin, airport) {
  try {
    var code = String(airport || "");
    var place = airportPlace_(code);
    var originText = String(origin || "").replace(/^\s+|\s+$/g, "");
    if (
      !place ||
      originText.length < 6 ||
      originText.length > 240 ||
      !/\d/.test(originText) ||
      !/[A-Za-z,]/.test(originText)
    ) {
      return { ok: false };
    }
    var cached = readMilesCache_(code, originText);
    if (cached) return cached;
    var directions = Maps.newDirectionFinder()
      .setOrigin(originText)
      .setDestination(place)
      .setMode(Maps.DirectionFinder.Mode.DRIVING)
      .setRegion("us")
      .getDirections();
    var meters = metersFromDirections_(directions);
    if (meters == null) return { ok: false };
    writeMilesCache_(code, originText, meters);
    return { ok: true, meters: meters };
  } catch (ignore) {
    return { ok: false };
  }
}

var GROUP_BOOKINGS_NAME = "Midnight Express LKN Group Bookings";
var GROUP_BOOKINGS_PROPERTY = "GROUP_BOOKINGS_SPREADSHEET_ID";
var GROUP_BOOKINGS_HEADERS = [
  "Timestamp received",
  "Name",
  "Phone",
  "Email",
  "Pickup",
  "Drop-off/venue",
  "Date",
  "Pickup time",
  "Passengers",
  "Bags",
  "Flight",
  "Return trip",
  "Return time",
  "Notes",
  "Calendar event id",
];

/**
 * Spreadsheet owned by the account that runs this script.
 * Deployed as Me, that account is midnightexpresslkn@gmail.com.
 * The id is kept in Script Properties so later bookings reuse the same file.
 */
function groupBookingsSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(GROUP_BOOKINGS_PROPERTY);
  var ss = null;
  if (id) {
    try {
      ss = SpreadsheetApp.openById(id);
    } catch (ignore) {
      ss = null;
    }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(GROUP_BOOKINGS_NAME);
    props.setProperty(GROUP_BOOKINGS_PROPERTY, ss.getId());
  }
  var sheet = ss.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(GROUP_BOOKINGS_HEADERS);
  }
  return sheet;
}

function appendGroupBooking_(row) {
  var sheet = groupBookingsSheet_();
  sheet.appendRow([
    new Date(),
    row.name,
    row.phone,
    row.email,
    row.pickup,
    row.destination,
    row.date,
    row.time,
    row.passengers,
    row.bags,
    row.flight,
    row.roundTrip,
    row.returnTime,
    row.notes,
    row.eventId,
  ]);
}

function respond_(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback && /^[A-Za-z0-9_]+$/.test(String(callback))) {
    return ContentService.createTextOutput(
      String(callback) + "(" + json + ");",
    ).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(
    ContentService.MimeType.JSON,
  );
}
