// Typed time plus a required AM/PM choice on every form (Donald, Nov 16 2026).
import { afterEach, describe, it } from "vitest";
import { check } from "./helpers/failure.js";
import {
  drainTimers,
  fillValid,
  formPosts,
  renderBooking,
  resultText,
  submitForm,
  typeTime,
} from "./helpers/render-booking.js";

const scripts = ["js/booking.js", "js/booking.min.js"];
const PICKUP = "entry.1258152069";

afterEach(() => {
  drainTimers();
});

const meta = (script, label, actual) => ({
  label,
  actual,
  source: "js/booking.js",
  loaded: script,
});

function type(view, id, text, period) {
  const $ = view.window.jQuery;
  $(`#${id}-text`).val(text).trigger("input");
  view.document
    .querySelectorAll(`input[name="${id}-period"]`)
    .forEach((radio) => {
      radio.checked = false;
    });
  if (period) {
    const radio = view.document.querySelector(
      `input[name="${id}-period"][value="${period}"]`,
    );
    radio.checked = true;
    $(radio).trigger("change");
  }
}

describe.each(scripts)("typed time %s", (script) => {
  it("reads forgiving 12-hour times and rejects impossible ones", async () => {
    const view = await renderBooking(script);
    const parse = view.window.MidnightBooking.parseTypedTime;
    for (const [text, period, want] of [
      ["7:30", "AM", "07:30:00"],
      ["730", "PM", "19:30:00"],
      ["0730", "PM", "19:30:00"],
      ["7", "PM", "19:00:00"],
      ["12", "AM", "00:00:00"],
      ["12:05", "PM", "12:05:00"],
      ["11.45", "PM", "23:45:00"],
      [" 9:15 ", "AM", "09:15:00"],
      ["1230", "AM", "00:30:00"],
      ["13:00", "PM", ""],
      ["0", "AM", ""],
      ["7:60", "AM", ""],
      ["7:3", "AM", ""],
      ["19", "PM", ""],
      ["abc", "AM", ""],
      ["7:30pm", "PM", ""],
      ["", "AM", ""],
      ["7:30", "", ""],
      [undefined, "AM", ""],
    ]) {
      check(
        parse(text, period),
        want,
        meta(script, `"${text}" ${period || "(no AM/PM)"} reads as "${want}"`),
      );
    }
  });

  it("starts every time box blank with neither AM nor PM picked", async () => {
    const view = await renderBooking(script);
    const doc = view.document;
    for (const id of [
      "booking-time",
      "booking-return-time",
      "bar-return-time",
    ]) {
      const text = doc.querySelector(`#${id}-text`);
      check(text.value, "", meta(script, `${id} starts empty`));
      check(
        text.inputMode,
        "numeric",
        meta(script, `${id} opens the number keypad`),
      );
      check(
        [...doc.querySelectorAll(`input[name="${id}-period"]`)].map((r) => [
          r.value,
          r.checked,
        ]),
        [
          ["AM", false],
          ["PM", false],
        ],
        meta(script, `${id} has AM and PM with neither picked`),
      );
      check(
        doc.querySelector(`#${id}`).value,
        "",
        meta(script, `${id} sends nothing yet`),
      );
    }
    check(
      doc.querySelector("#booking-time-text").required,
      true,
      meta(script, "pickup time is required"),
    );
  });

  it("blocks a missing, impossible, or AM/PM-less pickup time with a clear message", async () => {
    for (const [text, period, message] of [
      ["", "PM", "Pickup time is required"],
      ["13:30", "PM", "Pickup time: enter a real time, like 7:30"],
      ["7:30", null, "Please choose AM or PM for the pickup time"],
    ]) {
      const view = await renderBooking(script);
      await fillValid(view, { trip: "airport" });
      type(view, "booking-time", text, period);
      await submitForm(view);
      check(
        view.document.querySelector("#time-error").textContent,
        message,
        meta(script, `"${text}" ${period || "no AM/PM"} shows "${message}"`),
      );
      check(
        resultText(view.document).includes(message),
        true,
        meta(script, "the list names it too", resultText(view.document)),
      );
      check(formPosts(view.state).length, 0, meta(script, "nothing is sent"));
      type(view, "booking-time", "7:30", "PM");
      check(
        view.document.querySelector("#time-error").textContent,
        "",
        meta(script, "fixing the time clears its error"),
      );
    }
  });

  it("sends a typed 730 PM to the Form and calendar exactly as before", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "airport" });
    type(view, "booking-time", "730", "PM");
    const text = view.document.querySelector("#booking-time-text");
    view.window.jQuery(text).trigger("blur");
    check(
      text.value,
      "7:30",
      meta(script, "730 tidies to 7:30 when the box is left"),
    );
    await submitForm(view);
    const entries = Object.fromEntries(formPosts(view.state)[0].formEntries);
    check(
      entries[PICKUP],
      "12/15/2026 19:30:00",
      meta(script, "the Form gets the same 24-hour time", entries[PICKUP]),
    );
    const post = view.state.requests.find(
      (r) => r.method === "POST" && r.url.includes("script.google.com"),
    );
    check(
      JSON.parse(post.body).pickupTime,
      "19:30:00",
      meta(script, "the calendar gets HH:MM:SS"),
    );
  });

  it("leaves an untidy box alone when it is not a time", async () => {
    const view = await renderBooking(script);
    const text = view.document.querySelector("#booking-time-text");
    view.window.jQuery(text).val("12").trigger("input").trigger("blur");
    check(text.value, "12:00", meta(script, "12 tidies to 12:00"));
    view.window.jQuery(text).val("99").trigger("input").trigger("blur");
    check(
      text.value,
      "99",
      meta(
        script,
        "an impossible time is left as typed so the rider can fix it",
      ),
    );
  });

  it("checks the airport return time the same way and re-checks it against the pickup", async () => {
    const view = await renderBooking(script);
    await fillValid(view, {
      trip: "airport",
      roundTrip: true,
      returnDate: "2026-12-15",
      returnTime: "15:00:00",
    });
    check(
      view.document.querySelector("#booking-return-time-text").required,
      true,
      meta(script, "the return time is required on a round trip"),
    );
    type(view, "booking-return-time", "3:00", null);
    await submitForm(view);
    check(
      view.document.querySelector("#return-time-error").textContent,
      "Please choose AM or PM for the return pickup time",
      meta(script, "the return time needs AM or PM"),
    );
    type(view, "booking-return-time", "", null);
    await submitForm(view);
    check(
      resultText(view.document).includes(
        "Return pickup time is required for round trips",
      ),
      true,
      meta(script, "an empty return time keeps its round-trip message"),
    );
    type(view, "booking-return-time", "8", "AM");
    check(
      view.document.querySelector("#return-date-error").textContent,
      "Return date must be after pickup date",
      meta(
        script,
        "an 8 AM return before a 10 AM pickup is flagged right away",
      ),
    );
    check(formPosts(view.state).length, 0, meta(script, "nothing is sent"));
  });

  it("checks the bar return time and clears it when round trip is turned off", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "local", roundTrip: true });
    const $ = view.window.jQuery;
    $("#bar-return-passengers").val("2").trigger("input");
    $("#bar-return-location").val("Front door").trigger("input");
    check(
      view.document.querySelector("#bar-return-time-text").required,
      true,
      meta(script, "the bar return time is required"),
    );
    type(view, "bar-return-time", "25", "PM");
    await submitForm(view);
    check(
      view.document.querySelector("#bar-return-time-error").textContent,
      "Return pickup time: enter a real time, like 7:30",
      meta(script, "an impossible bar return time is named"),
    );
    typeTime(view.document, "bar-return-time", "23:30:00");
    const no = view.document.querySelector("#booking-round-trip-no");
    no.checked = true;
    $(no).trigger("change");
    check(
      view.document.querySelector("#bar-return-time-text").value,
      "",
      meta(script, "turning off round trip clears the bar return time"),
    );
    check(
      view.document.querySelector("#bar-return-time-text").required,
      false,
      meta(script, "and it is no longer required"),
    );
  });
});
