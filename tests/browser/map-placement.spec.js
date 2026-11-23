import {
  test,
  expect,
  fillAirport,
  fillBar,
  fillParty,
  fillGroup,
  settled,
} from "./helpers/booking-mocks.js";
import { ui } from "./helpers/ui.js";
import { hostnameOf } from "../helpers/hostname.js";

// Donald, Nov 22, 2026: (2) the Google Map sits low on the form, right above Request Booking;
// (3) when the price shows, the map is on the same screen; (4) the map stays on the confirmation
// screen after Request Booking. Runs on desktop, iPhone (WebKit) and Android (Chromium) projects.
// Every outside call is mocked; the fake Maps SDK draws a labeled stand-in so screenshots show
// where the map sits. Set MELKN_SHOTS_DIR to save the screenshots for Donald.
const SHOTS = process.env.MELKN_SHOTS_DIR || "";
const FAKE_SDK = `
(function () {
  function LatLng(lat, lng) { this.lat = function () { return lat; }; this.lng = function () { return lng; }; }
  function LatLngBounds() {}
  LatLngBounds.prototype.extend = function () {};
  function Map(el) {
    el.innerHTML = '<svg viewBox="0 0 300 120" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">' +
      '<rect width="300" height="120" fill="#e8eef3"/><path d="M20 100 C 90 20, 180 110, 280 25" stroke="#db3040" stroke-width="5" fill="none"/>' +
      '<circle cx="20" cy="100" r="7" fill="#1a73e8"/><circle cx="280" cy="25" r="7" fill="#188038"/>' +
      '<text x="150" y="114" font-size="10" text-anchor="middle" fill="#333">Test stand-in for the Google route map</text></svg>';
  }
  Map.prototype.fitBounds = function () {};
  function Polyline() {}
  function Marker() {}
  window.google = { maps: { LatLng: LatLng, LatLngBounds: LatLngBounds, Map: Map, Polyline: Polyline, Marker: Marker } };
  var cb = new URL(document.currentScript.src).searchParams.get("callback");
  // Google calls the callback asynchronously, so the fake does too (not a test wait).
  setTimeout(function () { window[cb](); }, 0);
})();`;

async function mockAll(page) {
  const sent = { posts: [] };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    const host = hostnameOf(url);
    if (host === "127.0.0.1" || host === "localhost") {
      if (new URL(url).pathname === "/js/maps-config.js") {
        return route.fulfill({
          contentType: "application/javascript",
          body: 'window.MIDNIGHT_MAPS = { key: "test-browser-key" };',
        });
      }
      return route.continue();
    }
    if (
      request.method() === "POST" &&
      (host === "script.google.com" || host === "docs.google.com")
    ) {
      sent.posts.push(url);
      return route.fulfill({ status: 204, body: "" });
    }
    if (host === "script.google.com") {
      return route.fulfill({
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: "[]",
      });
    }
    if (host === "geocoding.geo.census.gov") {
      const callback = new URL(url).searchParams.get("callback") || "callback";
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
    if (host === "routes.googleapis.com") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          routes: [
            {
              distanceMeters: 6437,
              duration: "720s",
              polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
            },
          ],
        }),
      });
    }
    if (host === "maps.googleapis.com")
      return route.fulfill({
        contentType: "application/javascript",
        body: FAKE_SDK,
      });
    if (host === "places.googleapis.com")
      return route.fulfill({
        contentType: "application/json",
        body: '{"suggestions":[]}',
      });
    if (host === "router.project-osrm.org") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          code: "Ok",
          routes: [{ distance: 4 * 1609.344 }],
        }),
      });
    }
    if (host === "nominatim.openstreetmap.org")
      return route.fulfill({ contentType: "application/json", body: "[]" });
    return route.fulfill({ status: 200, contentType: "text/plain", body: "" });
  });
  return sent;
}

const FORMS = [
  [
    "airport",
    (page, phone) => fillAirport(page, { phoneDate: phone }),
    "125 Main Street, Denver NC 28037",
  ],
  ["bar", (page) => fillBar(page), "125 Main Street, Denver NC 28037"],
  [
    "party",
    (page) => fillParty(page, { second: false }),
    "125 Main Street, Denver NC 28037",
  ],
  [
    "group",
    (page) => fillGroup(page, { stops: 0 }),
    "125 Main Street, Denver NC 28037",
  ],
];

// Page-relative boxes for several elements, read in the same frame.
async function framedBoxes(page, locators) {
  const handles = await Promise.all(locators.map((l) => l.elementHandle()));
  return page.evaluate(
    (els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y + window.scrollY,
          width: r.width,
          height: r.height,
        };
      }),
    handles,
  );
}

// The fixed navbar covers the top of the page; "on screen" means below it and above the bottom edge.
// Polled, so a smooth scroll that is still moving is waited for, not measured mid-way.
async function onScreen(page, locator, what) {
  await expect(locator, what + " is in the viewport").toBeInViewport();
  const height = page.viewportSize().height;
  await expect
    .poll(async () => {
      const box = await locator.boundingBox();
      const nav = await page.getByRole("navigation").boundingBox();
      if (box.y < Math.floor(nav.y + nav.height) - 1)
        return what + " is under the menu bar";
      if (box.y + box.height > height + 1)
        return what + " runs past the bottom of the screen";
      return "on screen";
    })
    .toBe("on screen");
}

for (const [kind, fill, retype] of FORMS) {
  test(`${kind} form: map under the price, above Request Booking, on screen with the price and on the confirmation`, async ({
    page,
  }, testInfo) => {
    const sent = await mockAll(page);
    await page.goto("/#booking");
    await fill(page, testInfo.project.name !== "desktop");
    const quote = ui.quote(page);
    const map = ui.routeMap(page);
    await expect(quote).toContainText("Cash $");
    await expect(map).toBeVisible();

    // (2) Placement: below the address fields, right under the price box, above Request Booking.
    // Measured in one frame, so a scroll still moving cannot skew one box against another.
    const [address, price, quoteBox, mapBox, submit] = await framedBoxes(page, [
      ui.pickup(page),
      page.getByRole("heading", { name: "Estimated Quote" }),
      quote,
      map,
      ui.submit(page),
    ]);
    expect(mapBox.y, "map is below the pickup address").toBeGreaterThan(
      address.y + address.height,
    );
    expect(mapBox.y, "map is below the price").toBeGreaterThan(
      quoteBox.y + quoteBox.height - 1,
    );
    expect(
      mapBox.y - (quoteBox.y + quoteBox.height),
      "map is right under the price",
    ).toBeLessThan(80);
    expect(
      mapBox.y + mapBox.height,
      "map is above Request Booking",
    ).toBeLessThan(submit.y);
    expect(price.y, "price heading is above the map").toBeLessThan(mapBox.y);

    // (3) Same screen: the rider changes the address; when the new price shows, price and map are both on screen.
    const newRoute = page.waitForResponse((r) =>
      r.url().startsWith("https://routes.googleapis.com/"),
    );
    await ui.pickup(page).fill(retype);
    await newRoute;
    await expect(quote).toContainText("Cash $");
    // Leaving the address box re-checks the price once more; let that finish before measuring.
    await ui.pickup(page).blur();
    await expect(quote).toContainText("Cash $");
    await expect(map).toBeVisible();
    await settled(page);
    // The price line and the whole map, together. (On a short phone the box's heading may sit just above.)
    await onScreen(
      page,
      quote.getByText(/Cash \$[\d,.]+ · Card \$/).first(),
      "the price",
    );
    await onScreen(page, map, "the map");
    const shotName = `${kind}-${testInfo.project.name}`;
    if (SHOTS)
      await page.screenshot({
        path: `${SHOTS}/${shotName}-1-price-and-map.png`,
      });

    // (4) After Request Booking: confirmation, then the same map, then Make Another Booking.
    await ui.submit(page).click();
    const result = ui.result(page);
    await expect(result).toContainText("Request received");
    await expect(map).toBeVisible();
    await settled(page);
    await onScreen(
      page,
      result.getByRole("heading", { name: /Request received/ }),
      "the confirmation heading",
    );
    const another = page.getByRole("button", { name: "Make Another Booking" });
    const [resultBox, confirmMap, anotherBox] = await framedBoxes(page, [
      result,
      map,
      another,
    ]);
    expect(confirmMap.y, "map is under the confirmation").toBeGreaterThan(
      resultBox.y + resultBox.height - 1,
    );
    expect(
      confirmMap.y - (resultBox.y + resultBox.height),
      "map is right under the confirmation",
    ).toBeLessThan(80);
    expect(
      confirmMap.y + confirmMap.height,
      "map is above Make Another Booking",
    ).toBeLessThan(anotherBox.y);
    await expect(page.getByRole("region", { name: "Route map" })).toHaveCount(
      1,
    );
    expect(sent.posts.length).toBeGreaterThan(0);
    // What the rider sees the moment the confirmation lands.
    if (SHOTS)
      await page.screenshot({
        path: `${SHOTS}/${shotName}-2-confirmation.png`,
      });
    // On a phone the rider scrolls a little to reach the map; it is the next thing under the message.
    await map.scrollIntoViewIfNeeded();
    await expect(map, "the map is on the confirmation screen").toBeInViewport();
    if (SHOTS) {
      // The whole confirmation in one picture: message, map, Make Another Booking.
      await page.screenshot({
        path: `${SHOTS}/${shotName}-3-confirmation-whole.png`,
        fullPage: true,
        // The menu bar and the scroll-up button float over the page; leave them out of this picture.
        style:
          ".navbar-fixed-top, .scroll-top { visibility: hidden !important; }",
        clip: {
          x: 0,
          y: Math.max(0, resultBox.y - 70),
          width: page.viewportSize().width,
          height: anotherBox.y + anotherBox.height - resultBox.y + 90,
        },
      });
    }

    // Make Another Booking: one map, back above Request Booking, hidden until a new route.
    await page.getByRole("button", { name: "Make Another Booking" }).click();
    await expect(ui.submit(page)).toBeVisible();
    await expect(map).toBeHidden();
    await expect(
      page.getByRole("region", { name: "Route map", includeHidden: true }),
    ).toHaveCount(1);
  });
}
