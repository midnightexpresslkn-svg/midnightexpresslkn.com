# Testing

The live site stays static. `index.html` does not load anything from this test setup, and there is no site build.

## Run the tests

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` checks `js/service-area.js`, `js/booking.js`, and `js/booking.min.js` with `node --check`, then runs Vitest (with coverage) and the Playwright browser checks.

`npm run verify` is the single gate. It runs those checks plus ESLint, HTML validation, Prettier, `npm audit`, and gitleaks. `npm install` points Git at `.githooks/pre-commit`, which runs `npm run verify` before a commit. Both the command and the hook were added with the service-area check.

`npm run check` also runs ESLint, HTML validation, Prettier, `npm audit` (high and critical fail), and gitleaks. Lighthouse runs in GitHub Actions from `lighthouserc.json`.

## New features get tests first

When you add a feature, write the code, write the tests, run `npm test`, fix what failed, and rerun until the suite is green.

## How to read a failure

Passing tests print a green check, the nested name, and a timing:

```text
✓ booking > js/booking.js > quote > charges at least $70 cash and 3% more on a card
```

Failures are grouped under a red **Failed Tests** heading. Each one names the file, the `describe` path, and the test, then the error and the `file:line`:

```text
FAIL tests/booking.test.js > booking > quote > charges at least $70 cash and 3% more on a card
Error: 10-mile CLT cash and card totals
expected: Cash $70.00 · Card $72.10
actual: Cash $27.50 · Card $28.33
test: tests/booking.test.js:42
source: js/booking.js:1986
 ❯ tests/booking.test.js:42:9
```

`test:` is the assertion in the test file. `source:` is the line in `js/booking.js` that implements that rule, when the suite can find it. A Testing Library error also prints the role it could not find and a snippet of the page.

On GitHub Actions the same spots are annotated on the commit: one mark on the test line and one on the `js/booking.js` line. The job writes `test-summary.json` (uploaded as the `test-summary` artifact) and a table in the job summary. Other agents can read that file for pass and fail counts, coverage, lint, audit, gitleaks, and Lighthouse scores, plus each failure's `file` and `line`.

## Browser test rules (robust-e2e-testing)

Every Playwright spec in `tests/browser/` follows these rules on top of the full-suite standard:

- Find things the way a rider does: `getByRole`, then `getByText`, then `getByLabel` / `getByPlaceholder`. Shared handles live in `tests/browser/helpers/ui.js`. No CSS classes, ids, or XPath. Two documented exceptions are pixel checks with no user-facing handle: the decorative check-mark icons in Why Choose Us (`site.spec.js`) and the all-text overflow walker (`layout.spec.js`).
- No fixed waits. Use web-first `expect(...)` assertions that retry.
- Every spec imports `test` from `tests/browser/helpers/booking-mocks.js`. That fixture records console errors, page errors, and failed requests, and on failure attaches them with a DOM snapshot. Playwright adds the trace and a screenshot.
- Every external call is mocked with `page.route`. The service worker is blocked so it cannot fetch around the mocks. Any external call a spec forgets to mock fails the test.
- Each test builds its own state. `npx playwright test --fully-parallel --repeat-each=3 --workers=4` must pass.
