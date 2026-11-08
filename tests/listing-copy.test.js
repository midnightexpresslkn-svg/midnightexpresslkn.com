import fs from "node:fs";
import { describe, it } from "vitest";
import { JSDOM } from "jsdom";
import { check } from "./helpers/failure.js";

const LISTING =
  "Flat-rate airport rides. Iron Station $65-70, Denver $65-75, Pumpkin Center $65-75, Sherrills Ford $65-85, Maiden $75-100, Terrell $85-100, Catawba $80-100+. Exact fare confirmed when you book. No extra fees for anything. True transparency equals true flat rate pricing. Family-owned, 24/7.";

describe("listing copy", () => {
  it("uses the Google Business listing for airport service and price wording", () => {
    for (const file of ["index.html", "terms.html", "privacy.html"]) {
      const html = fs.readFileSync(file, "utf8").replace(/\s+/g, " ");
      check(html.includes(LISTING), true, {
        label: `${file} includes the listing`,
        expected: true,
        actual: html.includes(LISTING),
      });
    }
    const { document } = new JSDOM(fs.readFileSync("index.html", "utf8"))
      .window;
    const page = document.body.textContent.replace(/\s+/g, " ");
    check(page.includes("competitive prices"), false, {
      label: "home page no longer says competitive prices",
      expected: false,
      actual: page.includes("competitive prices"),
    });
    check(page.includes("Final fare confirmed by phone"), false, {
      label: "home page no longer says the fare is confirmed by phone",
      expected: false,
      actual: page.includes("Final fare confirmed by phone"),
    });
    check(page.includes("$70 minimum"), false, {
      label: "home page does not state a $70 minimum",
      expected: false,
      actual: page.includes("$70 minimum"),
    });
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
