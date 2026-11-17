import { test, expect } from "./helpers/booking-mocks.js";
import { ui } from "./helpers/ui.js";

// Donald, Nov 10, 2026 6:57 PM: the required agreement shows the same required star as the other required fields.
// Donald, Nov 16, 2026: bar, party, and group all use one combined required box instead of three.
const AGREEMENT =
  "Must be 21 years or older, cannot smoke, and you are responsible for any damages. *";

async function blockNetwork(page) {
  await page.route("**/*", async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === "127.0.0.1" || host === "localhost") return route.continue();
    return route.fulfill({ status: 200, contentType: "text/plain", body: "" });
  });
}

async function expectOneStarredBox(page) {
  const box = page.getByRole("checkbox", { name: AGREEMENT });
  await expect(box).toBeVisible();
  await expect(box).toHaveAttribute("required", "");
  await expect(
    page
      .getByRole("group", { name: "Before you request this ride" })
      .getByRole("checkbox"),
  ).toHaveCount(1);
  // same marker as the other required labels, e.g. "Trip type *"
  await expect(
    page.getByRole("combobox", { name: /^Trip type \*$/ }),
  ).toBeVisible();
  await expect(page.getByText("Trip type *", { exact: true })).toHaveText(
    / \*$/,
  );
}

for (const [name, trip, kind] of [
  ["bar ride", "local", "bar"],
  ["party ride", "local", "party"],
  ["group event", "group", null],
]) {
  test(`${name} form shows the required star on its one agreement box`, async ({
    page,
  }) => {
    await blockNetwork(page);
    await page.goto("/");
    await ui.tripType(page).selectOption(trip);
    if (kind) await ui.localKind(page).selectOption(kind);
    await expectOneStarredBox(page);
  });
}
