import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";
import { SOURCE } from "./helpers/source-line.js";
import { check } from "./helpers/failure.js";

describe("manifest", () => {
  it("is valid JSON and its start url opens the booking section", () => {
    const raw = fs.readFileSync("manifest.webmanifest", "utf8");
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      check(error.message, "valid JSON", {
        label: "manifest.webmanifest is valid JSON",
        source: SOURCE.manifest,
      });
    }
    check(String(data.start_url).includes("#booking"), true, {
      label: "start_url opens #booking",
      expected: "a start_url containing #booking",
      actual: data.start_url,
      source: SOURCE.manifest,
    });
  });

  it("names the home screen Midnight Express LKN", () => {
    const data = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
    check(data.short_name, "Midnight Express LKN", {
      label: "manifest short_name",
      expected: "Midnight Express LKN",
      actual: data.short_name,
      source: SOURCE.manifest,
    });
    const pages = fs.readdirSync(".").filter((name) => name.endsWith(".html"));
    const titles = [];
    for (const page of pages) {
      const html = fs.readFileSync(page, "utf8");
      const match = html.match(
        /<meta name="apple-mobile-web-app-title" content="([^"]*)">/,
      );
      if (match) titles.push({ page, title: match[1] });
    }
    check(titles.length > 0, true, {
      label: "a page sets the Apple home screen title",
      expected: true,
      actual: titles.length > 0,
      source: SOURCE.manifest,
    });
    for (const item of titles) {
      check(item.title, "Midnight Express LKN", {
        label: `${item.page} apple-mobile-web-app-title`,
        expected: "Midnight Express LKN",
        actual: item.title,
        source: SOURCE.manifest,
      });
    }
  });

  it("lists icon files that exist", () => {
    const data = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
    const missing = (data.icons || [])
      .map((icon) => icon.src)
      .filter(
        (src) =>
          !fs.existsSync(path.join(process.cwd(), src.replace(/^\//, ""))),
      );
    check(missing, [], {
      label: "manifest icon files",
      expected: [],
      actual: missing,
      source: SOURCE.manifest,
    });
    check((data.icons || []).length > 0, true, {
      label: "manifest lists icons",
      source: SOURCE.manifest,
    });
  });
});
