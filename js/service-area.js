/**
 * Service area for Midnight Express LKN.
 *
 * The customer's non-airport end must be in a served North Carolina town.
 * A trip to the airport checks the pickup. A pickup at the airport checks
 * the drop-off. A trip with no airport checks both ends. Charlotte Douglas,
 * Concord Regional, and private airfields count as the airport end, so that
 * end may sit outside the towns.
 *
 * Typed "Denver NC" or a ZIP that belongs only to a served town is enough.
 * "Denver" alone is not, because it is also Denver, Colorado. A shared ZIP
 * is not enough on its own. Geocoding is used only when the typed address
 * does not already decide the town. See docs/service-area.md.
 *
 * The live calendar is created in the browser by posting to Google Forms and
 * the calendar Apps Script. Both of those posts call evaluateTrip first.
 * The script source is apps-script/Code.gs. A request built by hand against
 * the deployed URL is not covered until the same check is pasted there.
 */
(function (root) {
  "use strict";

  var OUT_OF_AREA_MESSAGE = "Sorry, we don't service that area.";
  var UNCLEAR_MESSAGE =
    "Please include the town and state, for example Denver, NC.";

  var SERVED_TOWNS = [
    ["pumpkin center", "Pumpkin Center"],
    ["sherrills ford", "Sherrills Ford"],
    ["sherrill ford", "Sherrills Ford"],
    ["iron station", "Iron Station"],
    ["lowesville", "Lowesville"],
    ["westport", "Westport"],
    ["denver", "Denver"],
    ["terrell", "Terrell"],
    ["catawba", "Catawba"],
    ["maiden", "Maiden"],
  ];

  var UNSERVED_TOWNS = [
    ["huntersville", "Huntersville"],
    ["mooresville", "Mooresville"],
    ["statesville", "Statesville"],
    ["cornelius", "Cornelius"],
    ["charlotte", "Charlotte"],
    ["davidson", "Davidson"],
    ["troutman", "Troutman"],
  ];

  // USPS preferred city is the served town, and the ZIP is not shared with
  // a town we do not serve. Westport mail uses 28037. 28609's alias
  // "Longisland" is the Long Island community in Catawba, which is served.
  var SERVED_ZIPS = {
    28037: "Denver",
    28080: "Iron Station",
    28609: "Catawba",
    28650: "Maiden",
    28673: "Sherrills Ford",
    28682: "Terrell",
  };

  // Preferred city is a town the owner does not serve.
  var UNSERVED_ZIPS = {
    28031: "Cornelius",
    28035: "Davidson",
    28036: "Davidson",
    28070: "Huntersville",
    28078: "Huntersville",
    28115: "Mooresville",
    28117: "Mooresville",
    28166: "Troutman",
    28625: "Statesville",
    28677: "Statesville",
    28687: "Statesville",
  };

  // 28164's preferred city is Stanley. Lowesville is only an alias.
  var BORDER_ZIPS = {
    28164: "Lowesville and Stanley share 28164. Stanley is not served.",
  };

  var UNCERTAIN_NOTES = [
    "28164 is shared by Lowesville (served) and Stanley (not served). The ZIP alone is not accepted.",
    "Pumpkin Center and Westport have no ZIP of their own. Westport is mailed as Denver 28037. Pumpkin Center is accepted only when the address names it. 28092 is Lincolnton and is not a served ZIP.",
    "28677 is Statesville. Its aliases include East Monbo and Eufola, which are not on the served-town list.",
    "28078 is Huntersville. Its aliases include Caldwell, Hicks Crossroads, and Long Creek, which are not served towns.",
    "282xx is Charlotte's ZIP range. No served town uses it. 28227 also reaches Mint Hill, which is not served. 28262 is the ZIP for 8109 Pike Road, Charlotte.",
  ];

  var ABBR = {
    AL: "AL",
    AK: "AK",
    AZ: "AZ",
    AR: "AR",
    CA: "CA",
    CO: "CO",
    CT: "CT",
    DE: "DE",
    DC: "DC",
    FL: "FL",
    GA: "GA",
    HI: "HI",
    ID: "ID",
    IL: "IL",
    IN: "IN",
    IA: "IA",
    KS: "KS",
    KY: "KY",
    LA: "LA",
    ME: "ME",
    MD: "MD",
    MA: "MA",
    MI: "MI",
    MN: "MN",
    MS: "MS",
    MO: "MO",
    MT: "MT",
    NE: "NE",
    NV: "NV",
    NH: "NH",
    NJ: "NJ",
    NM: "NM",
    NY: "NY",
    NC: "NC",
    ND: "ND",
    OH: "OH",
    OK: "OK",
    OR: "OR",
    PA: "PA",
    RI: "RI",
    SC: "SC",
    SD: "SD",
    TN: "TN",
    TX: "TX",
    UT: "UT",
    VT: "VT",
    VA: "VA",
    WA: "WA",
    WV: "WV",
    WI: "WI",
    WY: "WY",
  };

  var STATE_NAME = {
    alabama: "AL",
    alaska: "AK",
    arizona: "AZ",
    arkansas: "AR",
    california: "CA",
    colorado: "CO",
    connecticut: "CT",
    delaware: "DE",
    florida: "FL",
    georgia: "GA",
    hawaii: "HI",
    idaho: "ID",
    illinois: "IL",
    indiana: "IN",
    iowa: "IA",
    kansas: "KS",
    kentucky: "KY",
    louisiana: "LA",
    maine: "ME",
    maryland: "MD",
    massachusetts: "MA",
    michigan: "MI",
    minnesota: "MN",
    mississippi: "MS",
    missouri: "MO",
    montana: "MT",
    nebraska: "NE",
    nevada: "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    ohio: "OH",
    oklahoma: "OK",
    oregon: "OR",
    pennsylvania: "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    tennessee: "TN",
    texas: "TX",
    utah: "UT",
    vermont: "VT",
    virginia: "VA",
    washington: "WA",
    "west virginia": "WV",
    wisconsin: "WI",
    wyoming: "WY",
  };

  // Last-token collisions with street directions and the abbreviation for court.
  var NOT_TRAILING_STATE = { ne: true, nw: true, se: true, sw: true, ct: true };

  var STREET_SUFFIX = {
    dr: true,
    drive: true,
    rd: true,
    road: true,
    st: true,
    street: true,
    ln: true,
    lane: true,
    way: true,
    ct: true,
    court: true,
    blvd: true,
    boulevard: true,
    ave: true,
    avenue: true,
    cir: true,
    circle: true,
    pl: true,
    place: true,
    trl: true,
    trail: true,
    pkwy: true,
    parkway: true,
    hwy: true,
    highway: true,
    pike: true,
  };

  function pad(text) {
    return " " + text + " ";
  }

  function has(text, phrase) {
    return pad(text).indexOf(pad(phrase)) !== -1;
  }

  function blocked(text, phrase) {
    return has(text, "not " + phrase) || has(text, "not the " + phrase);
  }

  function normalize(raw) {
    return String(raw || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function airportNorm(raw) {
    return String(raw || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function matchTown(text, towns) {
    var padded = pad(text);
    var ordered = towns.slice().sort(function (a, b) {
      return b[0].length - a[0].length;
    });
    for (var i = 0; i < ordered.length; i++) {
      if (padded.indexOf(pad(ordered[i][0])) !== -1) return ordered[i][1];
    }
    return null;
  }

  function findZips(text) {
    var found = [];
    var re = /\b(\d{5})(?:\d{4})?\b/g;
    var match;
    while ((match = re.exec(text))) found.push(match[1]);
    return found;
  }

  function zipClass(zip) {
    if (SERVED_ZIPS[zip]) return { kind: "served", town: SERVED_ZIPS[zip] };
    if (BORDER_ZIPS[zip]) return { kind: "border" };
    if (UNSERVED_ZIPS[zip]) return { kind: "unserved", town: UNSERVED_ZIPS[zip] };
    if (/^282\d{2}$/.test(zip)) return { kind: "unserved", town: "Charlotte" };
    return { kind: "unknown" };
  }

  function findState(text) {
    var tokens = text.split(" ").filter(Boolean);
    var zipAt = -1;
    for (var z = 0; z < tokens.length; z++) {
      if (/^\d{5}$/.test(tokens[z])) {
        zipAt = z;
        break;
      }
    }
    if (zipAt > 0) {
      var abbr = tokens[zipAt - 1].toUpperCase();
      if (ABBR[abbr]) return ABBR[abbr];
      if (zipAt >= 2) {
        var pair = tokens[zipAt - 2] + " " + tokens[zipAt - 1];
        if (STATE_NAME[pair]) return STATE_NAME[pair];
      }
    }
    var named = null;
    for (var i = 0; i < tokens.length; i++) {
      var two =
        i + 1 < tokens.length ? tokens[i] + " " + tokens[i + 1] : "";
      if (two && STATE_NAME[two]) named = STATE_NAME[two];
      else if (STATE_NAME[tokens[i]]) named = STATE_NAME[tokens[i]];
    }
    var last = tokens[tokens.length - 1];
    if (ABBR[last.toUpperCase()] && !NOT_TRAILING_STATE[last]) {
      return ABBR[last.toUpperCase()];
    }
    return named;
  }

  function whichAirport(raw) {
    var text = airportNorm(raw);
    if (!text) return null;
    var cltWords = [
      "clt",
      "charlotte douglas",
      "douglas international",
      "douglas intl",
      "charlotte airport",
      "charlotte international",
    ];
    var jqfWords = ["jqf", "concord airport", "concord regional"];
    function hit(list) {
      for (var i = 0; i < list.length; i++) {
        if (has(text, list[i]) && !blocked(text, list[i])) return true;
      }
      return false;
    }
    var clt = hit(cltWords);
    var jqf = hit(jqfWords);
    if (text === "airport" || text === "the airport") clt = true;
    if (clt && jqf) return null;
    if (clt) return "CLT";
    if (jqf) return "JQF";
    return null;
  }

  function isPrivateAirfield(raw) {
    var text = normalize(raw);
    if (!text) return false;
    if (has(text, "private airport")) {
      var after = text.split("private airport")[1].trim().split(" ")[0];
      if (!after || !STREET_SUFFIX[after]) return true;
    }
    var tokens = text.split(" ");
    for (var i = 0; i < tokens.length; i++) {
      if (
        tokens[i] !== "airpark" &&
        tokens[i] !== "airfield" &&
        tokens[i] !== "airstrip"
      ) {
        continue;
      }
      var next = tokens[i + 1] || "";
      if (!STREET_SUFFIX[next]) return true;
    }
    return false;
  }

  function isAirportEnd(raw) {
    return Boolean(whichAirport(raw)) || isPrivateAirfield(raw);
  }

  function classifyAddress(raw) {
    var text = normalize(raw);
    if (!text) return { status: "unclear" };
    var state = findState(text);
    var zips = findZips(text).map(zipClass);
    var unservedTown = matchTown(text, UNSERVED_TOWNS);
    var servedTown = matchTown(text, SERVED_TOWNS);
    if (unservedTown) return { status: "outside", town: unservedTown };
    for (var i = 0; i < zips.length; i++) {
      if (zips[i].kind === "unserved") {
        return { status: "outside", town: zips[i].town };
      }
    }
    if (state && state !== "NC") return { status: "outside" };
    var goodZip = null;
    var border = false;
    for (var j = 0; j < zips.length; j++) {
      if (!goodZip && zips[j].kind === "served") goodZip = zips[j];
      if (zips[j].kind === "border") border = true;
    }
    if (servedTown && (state === "NC" || goodZip || border)) {
      return { status: "served", town: servedTown };
    }
    if (goodZip) return { status: "served", town: goodZip.town };
    if (servedTown) return { status: "unclear", town: servedTown };
    return { status: "unclear" };
  }

  function classifyEnd(text, geo) {
    if (isAirportEnd(text)) return { status: "airport" };
    var fromText = classifyAddress(text);
    if (fromText.status === "unclear" && geo) {
      var line = [geo.city, geo.state, geo.zip].filter(Boolean).join(" ");
      var fromGeo = classifyAddress(line);
      if (fromGeo.status !== "unclear") return fromGeo;
      if (geo.city && geo.state) return { status: "outside", town: geo.city };
    }
    return fromText;
  }

  function evaluateTrip(input) {
    var data = input || {};
    var pickup = classifyEnd(data.pickup, data.pickupGeo);
    var destination = classifyEnd(data.destination, data.destinationGeo);
    var required = [pickup, destination].filter(function (end) {
      return end.status !== "airport";
    });
    for (var i = 0; i < required.length; i++) {
      if (required[i].status === "outside") {
        return { ok: false, code: "outside", message: OUT_OF_AREA_MESSAGE };
      }
    }
    for (var j = 0; j < required.length; j++) {
      if (required[j].status !== "served") {
        return { ok: false, code: "unclear", message: UNCLEAR_MESSAGE };
      }
    }
    return { ok: true, code: "ok", message: "" };
  }

  var api = {
    OUT_OF_AREA_MESSAGE: OUT_OF_AREA_MESSAGE,
    UNCLEAR_MESSAGE: UNCLEAR_MESSAGE,
    SERVED_ZIPS: SERVED_ZIPS,
    UNSERVED_ZIPS: UNSERVED_ZIPS,
    BORDER_ZIPS: BORDER_ZIPS,
    UNCERTAIN_NOTES: UNCERTAIN_NOTES,
    whichAirport: whichAirport,
    isAirportEnd: isAirportEnd,
    isPrivateAirfield: isPrivateAirfield,
    classifyAddress: classifyAddress,
    classifyEnd: classifyEnd,
    evaluateTrip: evaluateTrip,
  };
  root.MidnightServiceArea = api;
})(globalThis);
