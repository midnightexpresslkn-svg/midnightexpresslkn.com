import fs from "node:fs";
import { describe, it } from "vitest";
import { JSDOM } from "jsdom";
import { SOURCE } from "./helpers/source-line.js";
import { check, role } from "./helpers/failure.js";

describe("review button", () => {
  it("reads Leave a review on Google and links to the Google review page", () => {
    const { document } = new JSDOM(fs.readFileSync("index.html", "utf8"))
      .window;
    const link = role(
      document,
      "link",
      { name: "Leave a review on Google" },
      {
        label: "review button",
        expected: "Leave a review on Google",
        source: SOURCE.review,
      },
    );
    check(
      link.textContent.replace(/\s+/g, " ").trim(),
      "Leave a review on Google",
      {
        label: "review button text",
        source: SOURCE.review,
      },
    );
    check(
      link.getAttribute("href"),
      "https://g.page/r/Ce81R31gU1X-ECA/review",
      {
        label: "review button link",
        source: SOURCE.review,
      },
    );
  });
});
