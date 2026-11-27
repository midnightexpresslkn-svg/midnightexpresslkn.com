import { afterEach, describe, it } from "vitest";
import { waitFor } from "@testing-library/dom";
import { check } from "./helpers/failure.js";
import {
  drainTimers,
  fillValid,
  renderBooking,
  submitForm,
} from "./helpers/render-booking.js";
import { hostnameOf } from "./helpers/hostname.js";

// Donald (Nov 19, 2026): the calendar summary shows the exact cash and card price the customer saw.
const scripts = ["js/booking.js", "js/booking.min.js"];

afterEach(() => {
  drainTimers();
});

async function quoteBox(view) {
  return waitFor(
    () => {
      if (!view.document.querySelector("#quote-details .quote-total"))
        throw new Error("waiting for the quote");
      return view.document
        .querySelector("#quote-details")
        .textContent.replace(/\s+/g, " ");
    },
    { timeout: 4000 },
  );
}

function calendarPost(view) {
  const posts = view.state.requests.filter(
    (r) => r.method === "POST" && hostnameOf(r.url) === "script.google.com",
  );
  return { count: posts.length, body: JSON.parse(posts[0].body) };
}

describe.each(scripts)("price in the calendar summary %s", (script) => {
  const meta = (label, actual, expected) => ({
    label,
    actual,
    expected,
    source: "js/booking.js",
    loaded: script,
  });

  it("sends the one-way airport cash and card price the form showed", async () => {
    const view = await renderBooking(script, { miles: 30 });
    await fillValid(view, { trip: "airport" });
    const shown = await quoteBox(view);
    await submitForm(view);
    const { count, body } = calendarPost(view);
    check(count, 1, meta("one calendar post", count));
    check(body.quoteShown, "Yes", meta("a price was shown", body.quoteShown));
    check(
      shown.includes(`Cash ${body.quoteCash} · Card ${body.quoteCard}`),
      true,
      meta("same totals as the quote box", shown, body),
    );
    check(
      body.quoteDetail,
      "One way to Charlotte Douglas Airport (CLT)",
      meta("the quote label, as plain text", body.quoteDetail),
    );
  });

  it("sends the round-trip total and both legs", async () => {
    const view = await renderBooking(script, { miles: 30 });
    await fillValid(view, { trip: "airport", roundTrip: true });
    const shown = await quoteBox(view);
    await submitForm(view);
    const { body } = calendarPost(view);
    check(
      shown.includes(`Cash ${body.quoteCash} · Card ${body.quoteCard}`),
      true,
      meta("round-trip total from the quote box", shown, body),
    );
    check(
      /^Round trip, Charlotte Douglas Airport \(CLT\) and back\. Outbound: Cash \$[\d.]+ · Card \$[\d.]+; Return: Cash \$[\d.]+ · Card \$[\d.]+$/.test(
        body.quoteDetail,
      ),
      true,
      meta("label and both legs, no HTML", body.quoteDetail),
    );
  });

  it("turns HTML escapes back into the airfield name the customer typed", async () => {
    const view = await renderBooking(script, { miles: 20 });
    await fillValid(view, {
      trip: "airport",
      airportId: "PRIVATE",
      airfieldName: `Lake & Sky "Field" <Hangar> O'Neil`,
    });
    await quoteBox(view);
    await submitForm(view);
    const { body } = calendarPost(view);
    check(
      body.quoteDetail,
      `One way to Lake & Sky "Field" <Hangar> O'Neil`,
      meta("plain airfield name", body.quoteDetail),
    );
  });

  it("sends the bar price", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "local", localKind: "bar" });
    const shown = await quoteBox(view);
    await submitForm(view);
    const { body } = calendarPost(view);
    check(
      shown.includes(`Cash ${body.quoteCash} · Card ${body.quoteCard}`),
      true,
      meta("bar totals from the quote box", shown, body),
    );
    check(
      /^One way to /.test(body.quoteDetail),
      true,
      meta("bar label", body.quoteDetail),
    );
  });

  it("sends the party price", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "local", localKind: "party" });
    const shown = await quoteBox(view);
    await submitForm(view);
    const { body } = calendarPost(view);
    check(
      shown.includes(`Cash ${body.quoteCash} · Card ${body.quoteCard}`),
      true,
      meta("party totals from the quote box", shown, body),
    );
    check(
      body.quoteDetail,
      "One way to the party",
      meta("party label", body.quoteDetail),
    );
  });

  it("sends the group trip charge and the deposit line", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "group", hours: "3" });
    await quoteBox(view);
    await submitForm(view);
    const { body } = calendarPost(view);
    check(body.quoteCash, "$375.00", meta("group cash", body.quoteCash));
    check(body.quoteCard, "$386.25", meta("group card", body.quoteCard));
    check(
      /, 3 hours\. 25% deposit: Cash \$93\.75 · Card \$96\.5\d$/.test(
        body.quoteDetail,
      ),
      true,
      meta(
        "hours and the deposit, without the up-front line",
        body.quoteDetail,
      ),
    );
  });

  it("says no price was shown when the form had none", async () => {
    const view = await renderBooking(script, { miles: 80 });
    await fillValid(view, { trip: "airport" });
    await waitFor(
      () => {
        if (
          !/over 50 miles/.test(
            view.document.querySelector("#quote-details").textContent,
          )
        )
          throw new Error("waiting for the call-for-price message");
      },
      { timeout: 4000 },
    );
    await submitForm(view);
    const { body } = calendarPost(view);
    check(body.quoteShown, "No", meta("no price shown", body.quoteShown));
    check(
      "quoteCash" in body || "quoteCard" in body,
      false,
      meta("no amounts sent", body),
    );
  });
});
