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
