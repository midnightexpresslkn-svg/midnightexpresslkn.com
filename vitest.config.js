import { defineConfig } from "vitest/config";

const reporters = ["verbose", "json"];
if (process.env.GITHUB_ACTIONS) reporters.push("github-actions");

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.js"],
    testTimeout: 20000,
    hookTimeout: 20000,
    reporters,
    outputFile: {
      json: "test-results/vitest.json",
    },
    coverage: {
      provider: "v8",
      include: ["js/booking.js"],
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      thresholds: {
        lines: 72.03,
        statements: 73.31,
        functions: 85.82,
        branches: 61.16,
      },
    },
  },
});
