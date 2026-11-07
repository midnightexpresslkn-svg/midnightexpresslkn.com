/**
 * Turn a Google driving-distance payload into miles.
 *
 * The page asks the calendar Apps Script for the meters on Google's
 * recommended driving route. This file does not know the fare. A shorter
 * "miles" field on the payload is ignored so a fallback cannot undercut Google.
 */
(function (root) {
  "use strict";

  var METERS_PER_MILE = 1609.344;

  var AIRPORTS = {
    CLT: "Charlotte Douglas Airport (CLT), Charlotte, NC",
    JQF: "Concord Regional Airport, Concord, NC",
  };

  function airportPlace(code) {
    return AIRPORTS[code] || null;
  }

  function milesFromMeters(meters) {
    if (typeof meters !== "number" || !isFinite(meters) || meters <= 0) {
      return null;
    }
    return meters / METERS_PER_MILE;
  }

  /**
   * Meters on Google's recommended route (routes[0]), not a shorter alternative.
   * Returns null when the response is not a usable driving route.
   */
  function metersFromDirections(directions) {
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
      if (typeof value !== "number" || !isFinite(value) || value <= 0) {
        return null;
      }
      total += value;
    }
    return total;
  }

  function milesFromPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }
    if (payload.ok !== true) return null;
    return milesFromMeters(payload.meters);
  }

  root.MidnightQuoteMiles = {
    METERS_PER_MILE: METERS_PER_MILE,
    airportPlace: airportPlace,
    milesFromMeters: milesFromMeters,
    metersFromDirections: metersFromDirections,
    milesFromPayload: milesFromPayload,
  };
})(globalThis);
