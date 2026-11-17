// Party form changes from Donald's Nov 16, 2026 spec.
import { afterEach, describe, it } from "vitest";
import { check } from "./helpers/failure.js";
import {
  drainTimers,
  fillValid,
  formPosts,
  renderBooking,
  resultText,
  submitForm,
} from "./helpers/render-booking.js";

const scripts = ["js/booking.js", "js/booking.min.js"];
const NOTES = "entry.1643147243";
const AGREEMENT =
  "Must be 21 years or older, cannot smoke, and you are responsible for any damages.";

afterEach(() => {
  drainTimers();
});

function pick(view, name, value) {
  const el = view.document.querySelector(
    `input[name="${name}"][value="${value}"]`,
  );
  el.checked = true;
  view.window.jQuery(el).trigger("change");
}

function hidden(view, id) {
  return view.document.querySelector(`#${id}`).hidden;
}

function err(view, id) {
  return view.document.querySelector(`#${id}`).textContent;
}

function notes(view) {
  return Object.fromEntries(formPosts(view.state)[0].formEntries)[NOTES];
}

function calendar(view) {
  const post = view.state.requests.find(
    (r) => r.method === "POST" && r.url.includes("script.google.com"),
  );
  return JSON.parse(post.body);
}

const meta = (script, label, actual) => ({
  label,
  actual,
  source: "js/booking.js",
  loaded: script,
});

describe.each(scripts)("party form %s", (script) => {
  it("drops the bar list and puts the pickup right under the party address", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, { trip: "local", localKind: "party" });
    const doc = view.document;
    check(
      hidden(view, "local-bar-list"),
      true,
      meta(script, "no bar list on the party form"),
    );
    check(
      hidden(view, "bar-choice-row"),
      true,
      meta(script, "no bar picker on the party form"),
    );
    const order = [
      ...doc.querySelectorAll(
        "#party-address, #booking-pickup, input[name='party-second-pickup'], #booking-name",
      ),
    ].map((el) => el.id || el.name);
    check(
      order.join(","),
      "party-address,booking-pickup,party-second-pickup-yes,party-second-pickup-no,booking-name",
      meta(
        script,
        "party address, then pickup, then the second-pickup question, then contact",
      ),
    );
    check(
      doc.querySelector("#address-label").textContent,
      "Pickup address *",
      meta(script, "the party pickup is labeled as a pickup"),
    );
    check(
      [...doc.querySelectorAll("input[name='party-second-pickup']")].every(
        (r) => r.required,
      ),
      true,
      meta(script, "the second-pickup question is required"),
    );
    check(
      hidden(view, "party-requests-group"),
      false,
      meta(script, "the special requests box shows"),
    );
    check(
      doc
        .querySelector("#party-requests")
        .placeholder.startsWith("For example:"),
      true,
      meta(script, "the special requests box has examples"),
    );
    const kind = doc.querySelector("#local-kind");
    kind.value = "bar";
    view.window.jQuery(kind).trigger("change");
    check(
      hidden(view, "local-bar-list"),
      false,
      meta(script, "the bar form keeps its list"),
    );
    check(
      hidden(view, "party-pickup-extra"),
      true,
      meta(script, "bar rides skip the second pickup"),
    );
    check(
      hidden(view, "party-requests-group"),
      true,
      meta(script, "bar rides skip special requests"),
    );
    check(
      doc.querySelector("#address-label").textContent,
      "Address *",
      meta(script, "bar rides keep the plain address label"),
    );
    check(
      doc
        .querySelector("#a-places")
        .contains(doc.querySelector("#booking-pickup")),
      true,
      meta(script, "bar rides keep the pickup in its usual place"),
    );
  });

  it("opens the second pickup address only on Yes and requires it", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, {
      trip: "local",
      localKind: "party",
      secondPickup: null,
    });
    check(
      hidden(view, "party-second-pickup-group"),
      true,
      meta(script, "no second address before Yes"),
    );
    await submitForm(view);
    check(
      err(view, "party-second-pickup-error"),
      "Please choose Yes or No for a second pickup location.",
      meta(script, "the second-pickup question must be answered"),
    );
    check(
      formPosts(view.state).length,
      0,
      meta(script, "nothing is sent without it"),
    );
    pick(view, "party-second-pickup", "Yes");
    check(
      err(view, "party-second-pickup-error"),
      "",
      meta(script, "answering clears the error"),
    );
    check(
      hidden(view, "party-second-pickup-group"),
      false,
      meta(script, "Yes opens the second address"),
    );
    check(
      view.document.querySelector("#party-second-pickup-address").required,
      true,
      meta(script, "the second address is required"),
    );
    await submitForm(view);
    check(
      err(view, "party-second-pickup-address-error"),
      "Please enter the second pickup address.",
      meta(script, "an empty second address is blocked"),
    );
    view.window
      .jQuery("#party-second-pickup-address")
      .val("300 Pine St, Denver NC")
      .trigger("input");
    check(
      err(view, "party-second-pickup-address-error"),
      "",
      meta(script, "typing clears the error"),
    );
    pick(view, "party-second-pickup", "No");
    check(
      hidden(view, "party-second-pickup-group"),
      true,
      meta(script, "No closes the second address"),
    );
    check(
      view.document.querySelector("#party-second-pickup-address").value,
      "",
      meta(script, "closing clears the second address"),
    );
  });

  it("asks round trip with no answer picked, and Yes opens the ride-back questions", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, {
      trip: "local",
      localKind: "party",
      roundTrip: null,
    });
    const doc = view.document;
    check(
      [
        doc.querySelector("#booking-round-trip").checked,
        doc.querySelector("#booking-round-trip-no").checked,
      ],
      [false, false],
      meta(script, "round trip is not pre-picked"),
    );
    await submitForm(view);
    check(
      err(view, "round-trip-error"),
      "Please choose Yes or No for round trip.",
      meta(script, "round trip is required"),
    );
    check(
      hidden(view, "party-return-details"),
      true,
      meta(script, "ride-back questions wait for Yes"),
    );
    pick(view, "round-trip", "Yes");
    check(
      hidden(view, "party-return-details"),
      false,
      meta(script, "Yes opens the ride-back questions"),
    );
    check(
      [
        "#party-dropoff",
        "#party-people",
        "#party-more-dropoffs-yes",
        "#party-more-dropoffs-no",
      ].map((s) => doc.querySelector(s).required),
      [true, true, true, true],
      meta(script, "drop-off, more drop-offs, and people are required"),
    );
    check(
      hidden(view, "party-extra-dropoff-group"),
      true,
      meta(script, "no extra drop-off before Yes"),
    );
    await submitForm(view);
    check(
      [
        err(view, "party-dropoff-error"),
        err(view, "party-more-dropoffs-error"),
        err(view, "party-people-error"),
      ],
      [
        "Please enter where to drop you off after the party.",
        "Please choose Yes or No for more than one drop-off location.",
        "Please enter how many people ride back.",
      ],
      meta(script, "each ride-back answer is required"),
    );
    pick(view, "party-more-dropoffs", "Yes");
    check(
      hidden(view, "party-extra-dropoff-group"),
      false,
      meta(script, "Yes opens the extra drop-off"),
    );
    view.window.jQuery("#party-people").val("7").trigger("input");
    await submitForm(view);
    check(
      err(view, "party-extra-dropoff-error"),
      "Please enter the other drop-off location.",
      meta(script, "the extra drop-off is required once opened"),
    );
    check(
      err(view, "party-people-error").includes("6"),
      true,
      meta(
        script,
        "more than six riders back is blocked",
        err(view, "party-people-error"),
      ),
    );
    check(
      formPosts(view.state).length,
      0,
      meta(script, "nothing is sent while answers are missing"),
    );
    pick(view, "party-more-dropoffs", "No");
    check(
      hidden(view, "party-extra-dropoff-group"),
      true,
      meta(script, "No closes the extra drop-off"),
    );
    pick(view, "round-trip", "No");
    check(
      hidden(view, "party-return-details"),
      true,
      meta(script, "No closes the ride-back questions"),
    );
    check(
      doc.querySelector("#party-people").value,
      "",
      meta(script, "closing clears the ride-back answers"),
    );
  });

  it("uses the one agreement box and sends every answer as a labeled Notes block", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, {
      trip: "local",
      localKind: "party",
      notes: "Bring water",
      roundTrip: true,
      secondPickup: "Yes",
      moreDropoffs: "Yes",
      partyPeople: "3",
      requests: "Birthday banner",
    });
    const rules = [
      ...view.document.querySelectorAll("#ride-rules input[type=checkbox]"),
    ].filter((box) => !box.closest("label").hidden);
    check(
      rules.map((box) => box.id),
      ["rule-bar-agreement"],
      meta(script, "only the one agreement box shows"),
    );
    check(
      view.document
        .querySelector("#bar-agreement-rule")
        .textContent.includes(AGREEMENT),
      true,
      meta(script, "the agreement text matches the bar form"),
    );
    await submitForm(view);
    check(
      resultText(view.document).includes("Request received"),
      true,
      meta(script, "the party request is received", resultText(view.document)),
    );
    const sent = notes(view);
    for (const line of [
      "Party ride. Bring water Round trip.",
      `Agreement (${AGREEMENT}): Yes`,
      "Party details:",
      "Second pickup: Yes",
      "Second pickup address: 300 Pine St, Denver NC",
      "Return ride:",
      "Drop-off location: 100 Main St, Denver NC",
      "More than one drop-off: Yes",
      "Other drop-off location: 50 Lake Rd, Cornelius NC",
      "People for the ride back: 3",
      "Special requests: Birthday banner",
    ]) {
      check(
        sent.includes(line),
        true,
        meta(script, `Notes carries "${line}"`, sent),
      );
    }
    check(
      formPosts(view.state).length,
      1,
      meta(script, "a party round trip is one Form post"),
    );
    const cal = calendar(view);
    check(
      [cal.mustBe21, cal.noSmoking, cal.damageResponsibility],
      ["Yes", "Yes", "Yes"],
      meta(script, "the one box answers all three calendar fields"),
    );
  });

  it("keeps a one-way party block short and blocks an unchecked agreement", async () => {
    const view = await renderBooking(script, { miles: 4 });
    await fillValid(view, {
      trip: "local",
      localKind: "party",
      barAgreement: false,
    });
    await submitForm(view);
    check(
      err(view, "ride-rules-error"),
      `Please check the box: ${AGREEMENT}`,
      meta(script, "the agreement box is required"),
    );
    check(
      formPosts(view.state).length,
      0,
      meta(script, "nothing is sent unchecked"),
    );
    const box = view.document.querySelector("#rule-bar-agreement");
    box.checked = true;
    view.window.jQuery(box).trigger("change");
    await submitForm(view);
    const sent = notes(view);
    check(
      sent.includes("Second pickup: No"),
      true,
      meta(script, "one-way notes say no second pickup", sent),
    );
    for (const line of [
      "Second pickup address",
      "Return ride:",
      "Special requests:",
    ]) {
      check(
        sent.includes(line),
        false,
        meta(script, `one-way notes skip "${line}"`, sent),
      );
    }
  });
});
