import fs from "node:fs";
import { describe, it } from "vitest";
import { JSDOM } from "jsdom";
import { SOURCE } from "./helpers/source-line.js";
import { check, role } from "./helpers/failure.js";

const WRITE_REVIEW = "https://g.page/r/Ce81R31gU1X-ECA/review";
const GOOGLE_LISTING =
  "https://www.google.com/maps/search/?api=1&query=Midnight+Express+LKN&query_place_id=ChIJKxRQ8TeXoyIR7zVHfWBTVf4";

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
    check(link.getAttribute("href"), WRITE_REVIEW, {
      label: "review button link",
      source: SOURCE.review,
    });
    check(link.className.includes("btn-success"), true, {
      label: "green review button stays the write-a-review link",
      source: SOURCE.review,
    });
  });

  it("opens the round Google icon on the listing people read", () => {
    for (const file of ["index.html", "terms.html", "privacy.html"]) {
      const { document } = new JSDOM(fs.readFileSync(file, "utf8")).window;
      const icon = document.querySelector(
        'a.btn-social[aria-label="Google reviews"]',
      );
      check(Boolean(icon), true, {
        label: `${file} has the round Google icon`,
        expected: true,
        actual: Boolean(icon),
        source: SOURCE.review,
      });
      check(icon.getAttribute("href"), GOOGLE_LISTING, {
        label: `${file} Google icon opens the listing`,
        actual: icon.getAttribute("href"),
        source: SOURCE.review,
      });
      check(icon.getAttribute("target"), "_blank", {
        label: `${file} Google icon opens in a new tab`,
        source: SOURCE.review,
      });
      check(icon.getAttribute("rel"), "noopener", {
        label: `${file} Google icon uses noopener`,
        source: SOURCE.review,
      });
      const writeLinks = [...document.querySelectorAll("a.btn-success")].map(
        (node) => node.getAttribute("href"),
      );
      if (file === "index.html") {
        check(writeLinks.includes(WRITE_REVIEW), true, {
          label: "green button still uses the g.page review link",
          actual: writeLinks,
          source: SOURCE.review,
        });
      }
    }
  });
});
