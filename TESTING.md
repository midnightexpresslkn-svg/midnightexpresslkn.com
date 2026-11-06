# Testing

The live site stays static. `index.html` does not load anything from this test setup, and there is no site build.

## Run the tests

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` checks `js/booking.js` and `js/booking.min.js` with `node --check`, then runs Vitest (with coverage) and the Playwright browser checks.

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
