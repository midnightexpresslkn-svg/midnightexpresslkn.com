// User-facing handles for the booking page, so every spec finds fields the way a rider does:
// by role and accessible name first, then visible text, then label or placeholder.
// No CSS classes or ids. (robust-e2e-testing skill, Nov 16 2026.)
import { expect } from "@playwright/test";

export const ui = {
  tripType: (page) => page.getByRole("combobox", { name: "Trip type *" }),
  airport: (page) =>
    page.getByRole("combobox", { name: "Airport", exact: true }),
  localKind: (page) =>
    page.getByRole("combobox", { name: "Bar, restaurant, party, or ride" }),
  bar: (page) =>
    page.getByRole("combobox", { name: "Bar or restaurant", exact: true }),
  name: (page) => page.getByRole("textbox", { name: "Enter your full name" }),
  phone: (page) =>
    page.getByRole("textbox", { name: "Enter your phone number" }),
  email: (page) => page.getByRole("textbox", { name: "Enter valid email" }),
  passengers: (page) => page.getByRole("spinbutton", { name: /^Online:/ }),
  // The pickup label reads Home address, Address, Pickup address, or Pickup Address by trip type.
  // Drop-off is its own field on Just a Ride, so this locator must not also match it.
  pickup: (page) =>
    page.getByRole("textbox", {
      name: /^(home |pickup )?address \*$/i,
    }),
  dropoff: (page) =>
    page.getByRole("textbox", { name: /^drop-off address \*$/i }),
  hours: (page) => page.getByRole("spinbutton", { name: "How many hours *" }),
  // The notes box is Special Notes (optional or required) or Trip Description by trip type.
  notes: (page) =>
    page.getByRole("textbox", {
      name: /^(Special Notes|Trip Description)( \*)?$/,
    }),
  partyAddress: (page) =>
    page.getByRole("textbox", { name: "Party address *", exact: true }),
  airfieldName: (page) =>
    page.getByRole("textbox", { name: "Airfield name *", exact: true }),
  airfieldAddress: (page) =>
    page.getByRole("textbox", { name: "Airfield address *", exact: true }),
  date: (page) => page.getByRole("textbox", { name: "Select date" }).first(),
  roundTrip: (page) => page.getByRole("group", { name: "Round trip *" }),
  agreement: (page) =>
    page.getByRole("checkbox", {
      name: /Must be 21 years or older, cannot smoke, and you are responsible for any damages/,
    }),
  quote: (page) => page.getByRole("status", { name: "Estimated Quote" }),
  quoteHeading: (page) =>
    page.getByRole("heading", { name: "Estimated Quote" }),
  result: (page) => page.getByRole("status", { name: "Booking result" }),
  form: (page) => page.getByRole("form", { name: "Book Your Ride" }),
  submit: (page) =>
    page.getByRole("button", { name: "Request Booking", exact: true }),
  bookingHeading: (page) =>
    page.getByRole("heading", { name: "Book Your Ride" }),
  routeMap: (page) => page.getByRole("region", { name: "Route map" }),
};

/** Asserts a field exists on the page but is hidden, so a renamed field cannot pass by vanishing. */
export async function expectPresentButHidden(locator) {
  await expect(locator).toHaveCount(1);
  await expect(locator).toBeHidden();
}
