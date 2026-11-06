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
  },
  webServer: {
    command: "node scripts/static-server.mjs",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
  reporter: reporters,
});
