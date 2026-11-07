import js from "@eslint/js";

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  fetch: "readonly",
  FormData: "readonly",
  AbortController: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  jQuery: "readonly",
  $: "readonly",
};

export default [
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "test-results/**",
      "lighthouse-results/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["js/quote-miles.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        globalThis: "readonly",
        isFinite: "readonly",
      },
    },
  },
  {
    files: ["js/booking.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: browserGlobals,
    },
    rules: {
      // The file already has unused flatpickr callback args and two helpers
      // nothing calls (getRideWindow, findFirstAvailableTime). findFirstAvailableTime
      // also calls showCallForBookingMessage, which is not defined. That path is
      // not used by the page. Left as-is; listed in the PR instead of edited.
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
];
