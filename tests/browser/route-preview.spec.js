import { expect, test } from "@playwright/test";
import { hostnameOf } from "../helpers/hostname.js";

// Route preview (Donald, Nov 10, 2026): with a Maps key the booking form draws the route, fits the map
// tightly, loads the Maps script with loading=async, and shows the road miles and minutes next to the
// price. Every Google call is mocked with a test key; no booking is submitted.
const FAKE_SDK = `
(function () {
  var calls = (window.__mapCalls = { maps: [], lines: [], fits: [] });
  function LatLng(lat, lng) { this.lat = function () { return lat; }; this.lng = function () { return lng; }; }
  function LatLngBounds() { this.points = []; }
  LatLngBounds.prototype.extend = function (p) { this.points.push(p); };
  function Map(el, opts) { this.el = el; calls.maps.push(opts); }
  Map.prototype.fitBounds = function (b, padding) { calls.fits.push({ points: b.points.length, padding: padding }); };
  function Polyline(opts) { calls.lines.push(opts.path.length); }
  function Marker() {}
  window.google = { maps: { LatLng: LatLng, LatLngBounds: LatLngBounds, Map: Map, Polyline: Polyline, Marker: Marker } };
  var cb = new URL(document.currentScript.src).searchParams.get("callback");
  setTimeout(function () { window[cb](); }, 0);
})();`;

async function mockGoogle(page) {
  const seen = { posts: [], mapsScript: "" };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    const host = hostnameOf(url);
    if (host === "127.0.0.1" || host === "localhost") {
      if (new URL(url).pathname === "/js/maps-config.js") {
        await route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: 'window.MIDNIGHT_MAPS = { key: "test-browser-key" };',
        });
        return;
      }
      await route.continue();
      return;
    }
    if (
      request.method() === "POST" &&
      (host === "script.google.com" || host === "docs.google.com")
    ) {
      seen.posts.push(url);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (host === "geocoding.geo.census.gov") {
      const callback = new URL(url).searchParams.get("callback") || "callback";
      const data = {
        result: {
          addressMatches: [
            {
              coordinates: { x: -80.9922, y: 35.5565 },
              addressComponents: {
                city: "Sherrills Ford",
                state: "NC",
                zip: "28673",
              },
            },
          ],
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `${callback}(${JSON.stringify(data)});`,
      });
      return;
    }
    if (host === "routes.googleapis.com") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          routes: [
            {
              distanceMeters: 46420,
              duration: "2255s",
              polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
            },
          ],
        }),
      });
      return;
    }
    if (host === "maps.googleapis.com") {
      seen.mapsScript = url;
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: FAKE_SDK,
      });
      return;
    }
    if (host === "places.googleapis.com") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"suggestions":[]}',
      });
      return;
    }
    if (host === "script.google.com") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"bookings":[]}',
      });
      return;
    }
    await route.abort();
  });
  return seen;
}

for (const [name, viewport] of [
  ["desktop", { width: 1366, height: 900 }],
  ["phone", { width: 375, height: 812 }],
]) {
  test(`route preview on ${name}: map, miles, minutes and price together`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const seen = await mockGoogle(page);
    await page.goto("/");
    await page.locator("#trip-type").selectOption("airport");
    await page.locator("#airport-choice").selectOption("CLT");
    await page
      .locator("#booking-pickup")
      .fill("7740 Marlette Ln, Sherrills Ford, NC 28673");
    const quote = page.locator("#quote-details");
    await expect(quote).toContainText("Cash $75.00");
    await expect(quote).toContainText("Card $77.25");
    await expect(quote.locator(".quote-route")).toHaveText(
      "28.8 miles · 38 min",
    );
    await expect(quote.locator(".quote-route")).toBeVisible();
    await expect(page.locator("#ride-map-summary")).toHaveText(
      "28.8 miles · 38 min",
    );
    await expect(page.locator("#ride-map")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__mapCalls?.fits.length || 0))
      .toBeGreaterThan(0);
    const calls = await page.evaluate(() => window.__mapCalls);
    expect(calls.maps[0].isFractionalZoomEnabled).toBe(true);
    expect(calls.fits[0].padding).toBe(12);
    expect(calls.fits[0].points).toBe(calls.lines[0]);
    expect(calls.lines[0]).toBeGreaterThan(1);
    expect(new URL(seen.mapsScript).searchParams.get("loading")).toBe("async");
    expect(seen.posts).toEqual([]);
  });
}
