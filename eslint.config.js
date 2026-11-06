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
    files: ["js/booking.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: browserGlobals,
    },
    rules: {
      // Flatpickr's onChange callbacks keep unused dateStr and instance args.
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
];
