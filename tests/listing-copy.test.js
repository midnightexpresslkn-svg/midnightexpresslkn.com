import fs from "node:fs";
import { describe, it } from "vitest";
import { JSDOM } from "jsdom";
import { check } from "./helpers/failure.js";

const LISTING =
  "Flat-rate airport rides. Iron Station $65-70, Denver $65-75, Pumpkin Center $65-75, Sherrills Ford $65-85, Maiden $75-100, Terrell $85-100, Catawba $80-100+. Exact fare confirmed when you book. No extra fees for anything. True transparency equals true flat rate pricing. Family-owned, 24/7.";

describe("listing copy", () => {
  it("keeps the Google listing on the red check mark only", () => {
    const html = fs.readFileSync("index.html", "utf8");
    const { document } = new JSDOM(html).window;
    const checks = [
      ...document.querySelectorAll("#why-choose-us .feature-list li"),
    ].map((item) => item.textContent.replace(/\s+/g, " ").trim());
    check(checks.includes(LISTING), true, {
      label: "why choose us check mark keeps the listing",
      expected: true,
      actual: checks.includes(LISTING),
    });
    const page = document.body.textContent.replace(/\s+/g, " ");
    const visible = page.split(LISTING).length - 1;
    check(visible, 1, {
      label: "home page shows the listing once",
      expected: 1,
      actual: visible,
    });
    check(
      document.querySelector(".skills").textContent.includes(LISTING),
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
