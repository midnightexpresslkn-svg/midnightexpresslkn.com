import fs from "node:fs";
import { describe, it } from "vitest";
import { JSDOM } from "jsdom";
import { check } from "./helpers/failure.js";

const REMOVED_PRICE_LIST =
  "Flat-rate airport rides. Iron Station $65-70, Denver $65-75, Pumpkin Center $65-75, Sherrills Ford $65-85, Maiden $75-100, Terrell $85-100, Catawba $80-100+. Exact fare confirmed when you book. No extra fees for anything. True transparency equals true flat rate pricing. Family-owned, 24/7.";

const WHY_CHOOSE = [
  "Five Star Rated Service - Trusted by travelers throughout the Lake Norman region",
  "Flat-rate pricing",
  "Family Owned & Operated - Personal service you can count on, not a faceless corporation",
  "Flight Tracking Included - We monitor your flight and adjust pickup times automatically",
  "Professional Licensed Drivers - Courteous, punctual, and focused on your comfort",
  "Clean, Well-Maintained Vehicles - Spotless minivans ready for your journey",
  "Serving Sherrills Ford & Denver - We specialize in areas other services overlook",
  "24/7 Availability - Early morning flights or late night arrivals, we're here",
];

describe("listing copy", () => {
  it("keeps Flat-rate pricing without the town prices", () => {
    const html = fs.readFileSync("index.html", "utf8");
    const { document } = new JSDOM(html).window;
    const checks = [
      ...document.querySelectorAll("#why-choose-us .feature-list li"),
    ].map((item) => item.textContent.replace(/\s+/g, " ").trim());
    check(checks, WHY_CHOOSE, {
      label: "why choose us keeps Flat-rate pricing and the other checks",
      expected: WHY_CHOOSE,
      actual: checks,
    });
    const page = document.body.textContent.replace(/\s+/g, " ");
    check(page.includes(REMOVED_PRICE_LIST), false, {
      label: "home page does not show the town price list",
      expected: false,
      actual: page.includes(REMOVED_PRICE_LIST),
    });
    check(
      document
        .querySelector(".skills")
        .textContent.includes(REMOVED_PRICE_LIST),
      false,
      {
        label: "hero does not use the listing",
        expected: false,
        actual: document.querySelector(".skills").textContent,
      },
    );
    check(
      document.querySelector(".skills").textContent,
      "Midnight Express LKN - Lake Norman's top-rated, family-owned airport transportation service, serving the Denver and Sherrills Ford side of Lake Norman.",
      {
        label: "hero line names Midnight Express LKN",
        actual: document.querySelector(".skills").textContent,
      },
    );
    for (const file of ["terms.html", "privacy.html"]) {
      const text = fs.readFileSync(file, "utf8");
      check(text.includes("Iron Station $65-70"), false, {
        label: `${file} does not repeat the town price list`,
        expected: false,
        actual: text.includes("Iron Station $65-70"),
      });
    }
    check(page.includes("$70 minimum"), false, {
      label: "home page does not state a $70 minimum",
      expected: false,
      actual: page.includes("$70 minimum"),
    });
    check(
      document.querySelector(".quote-disclaimer").textContent,
      "*Final fare confirmed by phone",
      {
        label: "quote note is the original phone line",
        actual: document.querySelector(".quote-disclaimer").textContent,
      },
    );
    const group = document
      .querySelector("#group-fields")
      .textContent.replace(/\s+/g, " ");
    check(/\$\d|price|pricing|fare/i.test(group), false, {
      label: "group form has no price",
      expected: false,
      actual: group,
    });
  });
});
