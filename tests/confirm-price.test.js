import { afterEach, describe, it } from "vitest";
import { waitFor } from "@testing-library/dom";
import { check } from "./helpers/failure.js";
import {
  drainTimers,
  fillValid,
  renderBooking,
  resultText,
  startAnotherBooking,
  submitForm,
} from "./helpers/render-booking.js";

const scripts = ["js/booking.js", "js/booking.min.js"];

afterEach(() => {
  drainTimers();
});

async function quoteShown(view) {
  return waitFor(
    () => {
      const total = view.document.querySelector("#quote-details .quote-total");
      if (!total) throw new Error("waiting for the quote");
      return view.document.querySelector("#quote-details").textContent;
    },
    { timeout: 4000 },
  );
}

function priceText(view) {
  return (
    view.document.querySelector("#booking-success .confirm-price")
      ?.textContent || ""
  );
}

describe.each(scripts)("confirmation price %s", (script) => {
  const opts = { source: "js/booking.js", loaded: script };

  it("copies the one-way quote exactly", async () => {
    const view = await renderBooking(script, { miles: 30 });
    await fillValid(view, { trip: "airport" });
    const quote = await quoteShown(view);
    await submitForm(view);
    const price = priceText(view);
    check(price.includes("Estimated price:"), true, {
      label: "price heading",
      actual: price,
      ...opts,
    });
    const total = /Cash \$[\d.]+ · Card \$[\d.]+/.exec(quote)[0];
    check(price.includes(total), true, {
      label: "same totals as the quote box",
      actual: price,
      expected: total,
      ...opts,
    });
    check(
      resultText(view.document).includes(
        "If you don't hear from us within 30 minutes, please call (980) 422-9125.",
      ),
      true,
      { label: "call text kept", ...opts },
    );
  });

  it("splits a round trip so the two legs add up to the quoted total", async () => {
    const view = await renderBooking(script, { miles: 30 });
    await fillValid(view, { trip: "airport", roundTrip: true });
    const quote = await quoteShown(view);
    await submitForm(view);
    const price = priceText(view);
    const cents = (text) => Math.round(Number(text.replace("$", "")) * 100);
    const legs = [
      ...price.matchAll(
        /(Outbound|Return): Cash (\$[\d.]+) · Card (\$[\d.]+)/g,
      ),
    ];
    const total = /Total: Cash (\$[\d.]+) · Card (\$[\d.]+)/.exec(price);
    check(view.document.querySelectorAll("#booking-success li").length, 0, {
      label: "no date/time bullet lines",
      ...opts,
    });
    check(
      resultText(view.document).includes("Your round-trip requests were sent."),
      true,
      { label: "natural lead-in", ...opts },
    );
    check(legs.length, 2, { label: "two legs", actual: price, ...opts });
    check(quote.includes("Cash " + total[1] + " · Card " + total[2]), true, {
      label: "total is the quote",
      actual: quote,
      ...opts,
    });
    check(cents(legs[0][2]) + cents(legs[1][2]), cents(total[1]), {
      label: "cash legs add up",
      ...opts,
    });
    check(cents(legs[0][3]) + cents(legs[1][3]), cents(total[2]), {
      label: "card legs add up",
      ...opts,
    });
  });

  it("shows a group price with its deposit", async () => {
    const view = await renderBooking(script);
    await fillValid(view, { trip: "group", hours: "3" });
    const quote = await quoteShown(view);
    await submitForm(view);
    const price = priceText(view);
    const deposit = /25% deposit: Cash \$[\d.]+ · Card \$[\d.]+/.exec(quote)[0];
    check(price.includes(deposit), true, {
      label: "same deposit as the quote box",
      actual: price,
      expected: deposit,
      ...opts,
    });
    check(price.includes("Trip charge: Cash $375.00 · Card $386.25"), true, {
      label: "the trip charge is its own line",
      actual: price,
      ...opts,
    });
    check(price.includes("Deposit must be paid up front."), true, {
      label: "the confirmation says the deposit is paid up front",
      actual: price,
      ...opts,
    });
    check(price.includes("3 hours"), true, {
      label: "billed hours",
      actual: price,
      ...opts,
    });
  });

  it("shows no price when the form had no price", async () => {
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
    check(priceText(view), "", { label: "no price block", ...opts });
    check(resultText(view.document).includes("$"), false, {
      label: "no dollar amount",
      actual: resultText(view.document),
      ...opts,
    });
  });

  it("drops the old price after Make Another Booking", async () => {
    const view = await renderBooking(script, { miles: 30 });
    await fillValid(view, { trip: "airport" });
    await quoteShown(view);
    await submitForm(view);
    check(priceText(view).length > 0, true, {
      label: "first price shown",
      ...opts,
    });
    await startAnotherBooking(view);
    check(priceText(view), "", { label: "old price gone", ...opts });
    check(view.window.MidnightQuote.current(), null, {
      label: "no price is kept for the next booking",
      ...opts,
    });
  });
});
