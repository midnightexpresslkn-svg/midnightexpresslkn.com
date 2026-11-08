import fs from "node:fs";
import vm from "node:vm";
import { describe, it } from "vitest";
import { check } from "./helpers/failure.js";

const source = fs.readFileSync("apps-script/Code.gs", "utf8");

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
  const events = [];
  const properties = {};
  const spreadsheets = [];
  let nextEvent = 1;
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
    CalendarApp: {
      getCalendarById() {
        return {
          createEvent(title, start, end, details) {
            const id = "evt-" + nextEvent;
            nextEvent += 1;
            events.push({ id, title, start, end, details });
            return { getId: () => id };
          },
        };
      },
      getDefaultCalendar() {
        return null;
      },
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) {
            return Object.prototype.hasOwnProperty.call(properties, key)
              ? properties[key]
              : null;
          },
          setProperty(key, value) {
            properties[key] = value;
          },
        };
      },
    },
    SpreadsheetApp: {
      create(name) {
        if (options.failSheet) throw new Error("sheets unavailable");
        const rows = [];
        const ss = {
          id: "sheet-" + (spreadsheets.length + 1),
          name,
          getId() {
            return this.id;
          },
          getSheets() {
            return [
              {
                appendRow(row) {
                  rows.push(row.slice());
                },
                getLastRow() {
                  return rows.length;
                },
              },
            ];
          },
        };
        spreadsheets.push({ ss, rows, name });
        return ss;
      },
      openById(id) {
        if (options.missingSheet) throw new Error("spreadsheet deleted");
        const found = spreadsheets.find((item) => item.ss.id === id);
        if (!found) throw new Error("spreadsheet not found");
        return found.ss;
      },
    },
    ContentService: contentService(),
  });
  vm.runInContext(source, context, { filename: "apps-script/Code.gs" });
  return { context, events, properties, spreadsheets };
}

function post(context, data) {
  const output = context.doPost({
    postData: {
      type: "application/json",
      contents: JSON.stringify(data),
    },
  });
  return JSON.parse(output.text);
}

const groupBooking = {
  name: "Ada Rider",
  phone: "9804229125",
  email: "ada@example.com",
  pickupAddress: "123 Main Street, Denver NC 28037",
  destinationAddress: "200 Oak St, Sherrills Ford NC",
  pickupDate: "2026-12-15",
  pickupTime: "10:00",
  passengers: "4",
  checkingBags: "Yes",
  flightNumber: "AA1234",
  roundTrip: "Yes",
  returnDate: "2026-12-16",
  returnTime: "15:00",
  specialNotes: "Group event. reunion",
  groupEvent: "Yes",
};

describe("group booking sheet", () => {
  it("creates the group spreadsheet once and appends the booking row", () => {
    const { context, events, properties, spreadsheets } = load();
    const first = post(context, groupBooking);
    check(first.ok, true, {
      label: "group booking is accepted",
      source: "apps-script/Code.gs:1",
    });
    check(spreadsheets.length, 1, {
      label: "the spreadsheet is created on the first group booking",
      source: "apps-script/Code.gs:1",
    });
    check(spreadsheets[0].name, "Midnight Express LKN Group Bookings", {
      label: "the spreadsheet has Donald's name",
      source: "apps-script/Code.gs:1",
    });
    check(properties.GROUP_BOOKINGS_SPREADSHEET_ID, "sheet-1", {
      label: "the spreadsheet id is stored in Script Properties",
      actual: properties.GROUP_BOOKINGS_SPREADSHEET_ID,
      source: "apps-script/Code.gs:1",
    });
    check(
      spreadsheets[0].rows[0],
      ["Pickup address", "Name", "Phone", "Email"],
      {
        label: "the headings come from the column list",
        source: "apps-script/Code.gs:1",
      },
    );
    check(
      spreadsheets[0].rows[0].length,
      context.GROUP_BOOKINGS_COLUMNS.length,
      {
        label: "the sheet has one column per entry in the column list",
        source: "apps-script/Code.gs:1",
      },
    );
    check(
      spreadsheets[0].rows[1],
      [
        "123 Main Street, Denver NC 28037",
        "Ada Rider",
        "9804229125",
        "ada@example.com",
      ],
      {
        label: "the row is pickup address, name, phone, and email",
        actual: spreadsheets[0].rows[1],
        source: "apps-script/Code.gs:1",
      },
    );
    check(spreadsheets[0].rows[1].indexOf("AA1234"), -1, {
      label: "flight number is not a column",
      source: "apps-script/Code.gs:1",
    });
    check(events.length, 2, {
      label: "the outbound and return events are on the calendar",
      source: "apps-script/Code.gs:1",
    });

    const second = post(context, {
      ...groupBooking,
      roundTrip: "No",
      returnTime: "",
      name: "Bea Rider",
    });
    check(second.ok, true, {
      label: "a later group booking is accepted",
      source: "apps-script/Code.gs:1",
    });
    check(spreadsheets.length, 1, {
      label: "a later booking reuses the saved spreadsheet",
      source: "apps-script/Code.gs:1",
    });
    check(spreadsheets[0].rows.length, 3, {
      label: "the second booking adds one row and does not repeat the headings",
      source: "apps-script/Code.gs:1",
    });
    check(spreadsheets[0].rows[2][1], "Bea Rider", {
      label: "the second row is the later customer",
      source: "apps-script/Code.gs:1",
    });
  });

  it("does not log an airport trip or a test booking", () => {
    const { context, events, spreadsheets } = load();
    const airport = post(context, { ...groupBooking, groupEvent: "No" });
    check(airport.ok, true, {
      label: "an airport trip is still accepted",
      source: "apps-script/Code.gs:1",
    });
    check(spreadsheets.length, 0, {
      label: "an airport trip does not create the group spreadsheet",
      source: "apps-script/Code.gs:1",
    });
    check(events.length, 2, {
      label: "an airport trip is still put on the calendar",
      source: "apps-script/Code.gs:1",
    });

    const testRun = post(context, {
      ...groupBooking,
      specialNotes: "TEST, DO NOT BOOK",
    });
    check(testRun.test, true, {
      label: "a test booking is skipped",
      source: "apps-script/Code.gs:1",
    });
    check(spreadsheets.length, 0, {
      label: "a test booking is not written to the sheet",
      source: "apps-script/Code.gs:1",
    });
  });

  it("keeps the calendar event when the sheet write fails", () => {
    const { context, events, spreadsheets } = load({ failSheet: true });
    const result = post(context, groupBooking);
    check(result.ok, true, {
      label: "the customer still gets a successful request",
      actual: result,
      source: "apps-script/Code.gs:1",
    });
    check(events.length, 2, {
      label: "the calendar events exist even though the sheet failed",
      source: "apps-script/Code.gs:1",
    });
    check(spreadsheets.length, 0, {
      label: "a failed sheet write does not leave a spreadsheet",
      source: "apps-script/Code.gs:1",
    });
  });
});
