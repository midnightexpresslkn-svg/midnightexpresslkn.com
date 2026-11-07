import { execFileSync } from "node:child_process";
import { describe, it } from "vitest";
import { check } from "./helpers/failure.js";

describe("scripts", () => {
  it("booking scripts pass node --check", () => {
    for (const file of [
      "js/service-area.js",
      "js/booking.js",
      "js/booking.min.js",
    ]) {
      let status = 0;
      let stderr = "";
      try {
        execFileSync(process.execPath, ["--check", file], {
          stdio: ["ignore", "ignore", "pipe"],
        });
      } catch (error) {
        status = error.status || 1;
        stderr = error.stderr ? error.stderr.toString() : error.message;
      }
      check(status, 0, {
        label: `${file} node --check`,
        expected: 0,
        actual: status === 0 ? 0 : stderr,
        source: `${file}:1`,
      });
    }
  });
});
