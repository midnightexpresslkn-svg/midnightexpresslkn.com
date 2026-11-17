import { test as base, expect } from "@playwright/test";
// Every external request is fulfilled locally; tests can never create a real ride.
export async function bookingMocks(page, { miles = 10 } = {}) {
  const state = { forms: [], calendars: [], gate: null };
  await page.route("**/*", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost")
      return route.continue();
    if (u.hostname === "docs.google.com" && req.method() === "POST") {
      state.forms.push(req.postData());
      return route.fulfill({ status: 204 });
    }
    if (u.hostname === "script.google.com") {
      if (req.method() === "POST") state.calendars.push(req.postData());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    }
    if (u.hostname === "geocoding.geo.census.gov") {
      if (state.gate) {
        const gate = state.gate;
        gate.hits += 1;
        gate.hit();
        await gate.released;
      }
      const callback = u.searchParams.get("callback") || "callback";
      const data = {
        result: {
          addressMatches: [
            {
              coordinates: { x: -81.03, y: 35.53 },
              addressComponents: { city: "Denver", state: "NC", zip: "28037" },
            },
          ],
        },
      };
      return route.fulfill({
        contentType: "application/javascript",
        body: `${callback}(${JSON.stringify(data)});`,
      });
    }
    if (u.hostname === "router.project-osrm.org")
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          code: "Ok",
          routes: [{ distance: miles * 1609.344 }],
        }),
      });
    if (u.hostname === "nominatim.openstreetmap.org")
      return route.fulfill({ contentType: "application/json", body: "[]" });
    return route.fulfill({ status: 200, contentType: "text/plain", body: "" });
  });
  return state;
}

export async function fillAirport(
  page,
  {
    round = false,
    name = "Isolated QA Rider",
    pickup = "123 Main Street, Denver NC 28037",
  } = {},
) {
  await page
    .getByRole("combobox", { name: "Trip type" })
    .selectOption("airport");
  await page
    .getByRole("combobox", { name: "Airport", exact: true })
    .selectOption("CLT");
  await page.getByPlaceholder("Jane Smith").fill(name);
  await page.getByPlaceholder("5555551234").fill("5555550199");
  await page.getByPlaceholder("email@example.com").fill("qa@example.invalid");
  await page.getByRole("spinbutton", { name: /Online:/ }).fill("2");
  await page.getByPlaceholder("123 Main Street, Denver NC 28037").fill(pickup);
  // "Checked bags? *" has no group role; its Yes/No pair is the first on the form.
  await page.getByRole("radio", { name: "No", exact: true }).first().check();
  // Airport answers Donald made required on Nov 16, 2026.
  await page
    .getByRole("group", { name: /Carry-on bags/ })
    .getByRole("radio", { name: "No", exact: true })
    .check();
  await page
    .getByRole("group", { name: /help with your luggage/ })
    .getByRole("radio", { name: "No", exact: true })
    .check();
  await page
    .getByRole("spinbutton", { name: /Passengers back from the airport/ })
    .fill("2");
  await page.getByLabel(/Departure flight number/).fill("DL100");
  await page.getByLabel(/Arrival flight number/).fill("AA2684");
  await page
    .getByRole("textbox", { name: /Special Notes/ })
    .fill("Departure curb, please.");
  await page
    .getByRole("group", { name: /Round trip/ })
    .getByRole("radio", { name: round ? "Yes" : "No", exact: true })
    .check();
  await pick(
    page.getByRole("textbox", { name: "Select date" }).first(),
    "2026-12-15",
  );
  await pick(
    page.getByRole("textbox", { name: "Select time" }).first(),
    "10:00:00",
  );
  if (round) {
    await pick(
      page.getByRole("textbox", { name: "Select date" }).nth(1),
      "2026-12-16",
    );
    await pick(
      page.getByRole("textbox", { name: "Select time" }).nth(1),
      "12:00:00",
    );
  }
}

/** A one-way-or-round bar ride to Two Trees with every bar answer filled in. */
export async function fillBar(page, { round = false, agree = true } = {}) {
  await page.getByRole("combobox", { name: "Trip type" }).selectOption("local");
  await page.locator("#local-kind").selectOption("bar");
  await page.locator("#bar-choice").selectOption("two-trees");
  await page.getByPlaceholder("Jane Smith").fill("Isolated QA Rider");
  await page.getByPlaceholder("5555551234").fill("5555550199");
  await page.getByPlaceholder("email@example.com").fill("qa@example.invalid");
  await page.getByRole("spinbutton", { name: /Online:/ }).fill("2");
  await page
    .getByPlaceholder("123 Main Street, Denver NC 28037")
    .fill("123 Main Street, Denver NC 28037");
  await page
    .getByRole("group", { name: /Round trip/ })
    .getByRole("radio", { name: round ? "Yes" : "No", exact: true })
    .check();
  if (round) {
    await page.getByLabel(/Passengers for the ride back/).fill("3");
    await pick(
      page.getByRole("textbox", { name: "Select return time" }),
      "23:30:00",
    );
    await page
      .getByLabel(/Return pickup location/)
      .fill("Two Trees front door");
  }
  if (agree) {
    await page
      .getByRole("checkbox", {
        name: /Must be 21 years or older, cannot smoke/,
      })
      .check();
  }
}

// The visible picker box is Flatpickr's alt input; its picker lives on the input just before it.
export async function pick(box, value) {
  await expect(box).toBeVisible();
  await box.evaluate(
    (el, v) => el.previousElementSibling._flatpickr.setDate(v, true),
    value,
  );
}

/** Hold every census lookup (the service-area check run on submit) until release(). */
export function holdChecks(state) {
  let hit, release;
  const gate = { hits: 0 };
  gate.entered = new Promise((resolve) => {
    hit = resolve;
  });
  gate.hit = () => hit();
  gate.released = new Promise((resolve) => {
    release = resolve;
  });
  state.gate = gate;
  return {
    gate,
    release: () => {
      state.gate = null;
      release();
    },
  };
}

/** Collects console errors, page errors, and failed requests; attaches them when a test fails. */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const problems = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") problems.push("console: " + msg.text());
    });
    page.on("pageerror", (err) =>
      problems.push(
        "pageerror: " +
          err.message +
          " " +
          (err.stack || "").split("\n").slice(1, 4).join(" | "),
      ),
    );
    page.on("requestfailed", (req) =>
      problems.push(
        "requestfailed: " +
          req.method() +
          " " +
          req.url() +
          " " +
          (req.failure() || {}).errorText,
      ),
    );
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach("console-and-network-errors", {
        body: problems.join("\n") || "(none)",
        contentType: "text/plain",
      });
      await testInfo.attach("dom-snapshot", {
        body: await page.content(),
        contentType: "text/html",
      });
    }
  },
});
export { expect };
