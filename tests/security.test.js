import fs from "node:fs";
import { afterEach, describe, it } from "vitest";
import { JSDOM } from "jsdom";
import { SOURCE } from "./helpers/source-line.js";
import { check } from "./helpers/failure.js";
import {
  drainTimers,
  fillValid,
  renderBooking,
  resultText,
  submitForm,
} from "./helpers/render-booking.js";

afterEach(() => {
  drainTimers();
});

const page = fs.readFileSync("index.html", "utf8");

function visibleText(html) {
  const { document } = new JSDOM(html).window;
  document.querySelectorAll("script, style").forEach((node) => node.remove());
  return document.body.textContent.replace(/\s+/g, " ");
}

describe("security", () => {
  it("does not show a per-mile rate or the internal price formula on the page", () => {
    const text = visibleText(page);
    check(
      /2\.75|2\.63|per[\s-]?mile|\$\s*\/\s*mi|miles\s*[x×]\s*2/i.test(text),
      false,
      {
        label: "visible page text contains internal pricing",
        expected: "no per-mile rate in visible text",
        actual: /2\.75|2\.63/.test(text) ? "found a rate" : "no rate found",
        source: SOURCE.quote,
      },
    );
  });

  it("gives every external target=_blank link rel=noopener", () => {
    const { document } = new JSDOM(page).window;
    const links = [...document.querySelectorAll('a[target="_blank"]')];
    const missing = links
      .filter((link) => !/\bnoopener\b/i.test(link.getAttribute("rel") || ""))
      .map((link) => link.getAttribute("href"));
    check(missing, [], {
      label: "target=_blank without rel=noopener",
      source: SOURCE.review,
    });
    check(links.length > 0, true, {
      label: "page has external links to check",
      source: SOURCE.review,
    });
  });

  it("does not turn a rider name into HTML when the request is shown", async () => {
    const view = await renderBooking("js/booking.js");
    const payload = '<img id="xss-name" src=x>';
    await fillValid(view, { name: payload });
    await submitForm(view);
    check(view.document.getElementById("xss-name"), null, {
      label: "rider name was inserted as HTML",
      expected: null,
      actual: view.document.getElementById("xss-name")
        ? "img element created"
        : null,
      source: SOURCE.escape,
      loaded: "js/booking.js",
    });
    check(resultText(view.document).includes(payload), true, {
      label: "rider name is still visible as text",
      expected: payload,
      actual: resultText(view.document),
      source: SOURCE.escape,
      loaded: "js/booking.js",
    });
  });

  it("does not turn a rider name into HTML in the minified script", async () => {
    const view = await renderBooking("js/booking.min.js");
    const payload = '<img id="xss-min" src=x>';
    await fillValid(view, { name: payload });
    await submitForm(view);
    check(view.document.getElementById("xss-min"), null, {
      label: "minified script inserted the rider name as HTML",
      expected: null,
      actual: view.document.getElementById("xss-min")
        ? "img element created"
        : null,
      source: SOURCE.escape,
      loaded: "js/booking.min.js",
    });
  });

  it("escapes rider values before they are passed to .html()", () => {
    const source = fs.readFileSync("js/booking.js", "utf8");
    const min = fs.readFileSync("js/booking.min.js", "utf8");
    const raw = [
      [source, /\+\s*formData\.name\s*\+/],
      [source, /\+\s*formData\.phone\s*\+/],
      [source, /\+\s*formData\.pickupTime\s*\+/],
      [source, /'<li>'\s*\+\s*error\s*\+/],
      [source, /Error:<\/strong> '\s*\+\s*error\.message/],
      [min, /\+f\.name\+/],
      [min, /\+f\.phone\+/],
      [min, /\+f\.pickupTime\+/],
      [min, /\+f\.returnTime\+/],
      [min, /"<li>"\+e\+/],
      [min, /\+t\.message\+/],
    ];
    const hits = raw
      .filter(([, pattern]) => pattern.test(source) || pattern.test(min))
      .map(([, pattern]) => String(pattern));
    const found = raw
      .filter(([text, pattern]) => pattern.test(text))
      .map(([, pattern]) => String(pattern));
    check(found, [], {
      label: "user values concatenated into HTML",
      expected: [],
      actual: found,
      source: SOURCE.escape,
    });
    void hits;
  });
});
