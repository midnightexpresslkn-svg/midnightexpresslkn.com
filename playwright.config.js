import { defineConfig } from "@playwright/test";

const reporters = [
  ["list"],
  ["json", { outputFile: "test-results/playwright.json" }],
];
if (process.env.GITHUB_ACTIONS) reporters.push(["github"]);

export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    // The site's service worker would fetch the Apps Script itself, around page.route mocks.
    // Blocking it keeps every external call inside the specs' mocks (robust-e2e-testing, Nov 16 2026).
    serviceWorkers: "block",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/static-server.mjs",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
  reporter: reporters,
});
