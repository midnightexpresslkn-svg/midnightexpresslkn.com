import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
fs.mkdirSync(path.join(root, "test-results"), { recursive: true });

const checks = {};
const failures = [];

function run(cmd, args, options = {}) {
  const { silent, ...rest } = options;
  const result = spawnSync(cmd, args, { cwd: root, encoding: "utf8", ...rest });
  if (!silent && result.stdout) process.stdout.write(result.stdout);
  if (!silent && result.stderr) process.stderr.write(result.stderr);
  return result;
}

function addFailure(check, message, file, line) {
  failures.push({
    check,
    message: String(message).split("\n")[0].slice(0, 500),
    file: file || null,
    line: line || null,
  });
}

function parseLocation(text) {
  const source = String(text).match(/source:\s*(\S+):(\d+)/);
  const test = String(text).match(/test:\s*(\S+):(\d+)/);
  const stack = String(text).match(/(tests\/\S+\.(?:test|spec)\.js):(\d+)/);
  if (test)
    return {
      file: test[1],
      line: Number(test[2]),
      source: source ? `${source[1]}:${source[2]}` : null,
    };
  if (stack)
    return {
      file: stack[1],
      line: Number(stack[2]),
      source: source ? `${source[1]}:${source[2]}` : null,
    };
  if (source)
    return {
      file: source[1],
      line: Number(source[2]),
      source: `${source[1]}:${source[2]}`,
    };
  return { file: null, line: null, source: null };
}

console.log("\n== syntax ==");
let syntaxOk = true;
for (const file of [
  "js/service-area.js",
  "js/booking.js",
  "js/booking.min.js",
  "js/install.js",
  "sw.js",
]) {
  const result = run(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) {
    syntaxOk = false;
    addFailure("syntax", `${file} failed node --check`, file, 1);
  }
}
checks.syntax = { status: syntaxOk ? "pass" : "fail" };

console.log("\n== eslint ==");
const eslint = run(
  "npx",
  ["eslint", "js/booking.js", "-f", "json", "-o", "test-results/eslint.json"],
  {
    stdio: "inherit",
  },
);
let eslintSummary = {
  status: eslint.status === 0 ? "pass" : "fail",
  errors: 0,
  warnings: 0,
};
try {
  const report = JSON.parse(
    fs.readFileSync("test-results/eslint.json", "utf8"),
  );
  for (const file of report) {
    eslintSummary.errors += file.errorCount || 0;
    eslintSummary.warnings += file.warningCount || 0;
    for (const message of file.messages || []) {
      if (message.severity === 2) {
        addFailure(
          "eslint",
          message.message,
          path.relative(root, file.filePath),
          message.line,
        );
      }
    }
  }
} catch {
  eslintSummary = { status: "fail", errors: null, warnings: null };
  addFailure("eslint", "ESLint did not write a report", "eslint.config.js", 1);
}
checks.eslint = eslintSummary;

console.log("\n== html-validate ==");
const html = run("npx", ["html-validate", "index.html", "--formatter", "json"]);
fs.writeFileSync("test-results/html.json", html.stdout || "[]");
let htmlSummary = { status: html.status === 0 ? "pass" : "fail", errors: 0 };
try {
  const raw = html.stdout || "[]";
  const report = JSON.parse(raw.slice(raw.indexOf("[")));
  for (const file of report) {
    htmlSummary.errors += file.errorCount || 0;
    for (const message of file.messages || []) {
      if (message.severity >= 2) {
        addFailure(
          "html",
          `${message.ruleId}: ${message.message}`,
          "index.html",
          message.line,
        );
      }
    }
  }
} catch {
  htmlSummary = { status: "fail", errors: null };
  addFailure("html", html.stderr || "html-validate failed", "index.html", 1);
}
checks.html = htmlSummary;

console.log("\n== prettier ==");
const prettier = run("npx", ["prettier", "--check", "."], { stdio: "inherit" });
checks.prettier = { status: prettier.status === 0 ? "pass" : "fail" };
if (prettier.status !== 0)
  addFailure("prettier", "Prettier check failed", null, null);

console.log("\n== unit tests and coverage ==");
const vitest = run("npx", ["vitest", "run", "--coverage"], {
  stdio: "inherit",
});
let unit = {
  status: vitest.status === 0 ? "pass" : "fail",
  passed: 0,
  failed: 0,
  total: 0,
};
try {
  const report = JSON.parse(
    fs.readFileSync("test-results/vitest.json", "utf8"),
  );
  unit.total = report.numTotalTests ?? 0;
  unit.passed = report.numPassedTests ?? 0;
  unit.failed = report.numFailedTests ?? 0;
  for (const file of report.testResults || []) {
    for (const assertion of file.assertionResults || []) {
      if (assertion.status !== "failed") continue;
      const blob = (assertion.failureMessages || []).join("\n");
      const loc = parseLocation(blob);
      addFailure(
        "unit",
        blob || assertion.title,
        loc.file || path.relative(root, file.name || ""),
        loc.line,
      );
    }
  }
} catch {
  if (vitest.status !== 0)
    addFailure("unit", "Vitest failed before writing a report", null, null);
}
checks.unit = unit;

let coverage = {
  status: "fail",
  lines: null,
  statements: null,
  functions: null,
  branches: null,
};
try {
  const summary = JSON.parse(
    fs.readFileSync("coverage/coverage-summary.json", "utf8"),
  ).total;
  coverage = {
    status: vitest.status === 0 ? "pass" : "fail",
    lines: summary.lines.pct,
    statements: summary.statements.pct,
    functions: summary.functions.pct,
    branches: summary.branches.pct,
    thresholds: { lines: 90, statements: 90, functions: 90, branches: 78 },
  };
} catch {
  addFailure(
    "coverage",
    "Coverage summary was not written",
    "js/booking.js",
    1,
  );
}
checks.coverage = coverage;

console.log("\n== browser tests ==");
const browser = run("npx", ["playwright", "test"], { stdio: "inherit" });
let browserSummary = {
  status: browser.status === 0 ? "pass" : "fail",
  passed: 0,
  failed: 0,
};
try {
  const report = JSON.parse(
    fs.readFileSync("test-results/playwright.json", "utf8"),
  );
  browserSummary.passed = report.stats?.expected ?? 0;
  browserSummary.failed =
    (report.stats?.unexpected ?? 0) + (report.stats?.flaky ?? 0);
  const walk = (suite) => {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        for (const result of test.results || []) {
          if (result.status === "passed" || result.status === "skipped")
            continue;
          const message = (result.errors || [])
            .map((error) => error.message || "")
            .join("\n");
          const loc = parseLocation(message);
          addFailure(
            "browser",
            message || spec.title,
            loc.file || spec.file,
            loc.line || spec.line,
          );
        }
      }
    }
    for (const child of suite.suites || []) walk(child);
  };
  for (const suite of report.suites || []) walk(suite);
} catch {
  if (browser.status !== 0)
    addFailure(
      "browser",
      "Playwright failed before writing a report",
      null,
      null,
    );
}
checks.browser = browserSummary;

console.log("\n== npm audit ==");
const audit = run("npm", ["audit", "--json", "--audit-level=high"], {
  silent: true,
});
let auditSummary = {
  status: audit.status === 0 ? "pass" : "fail",
  critical: 0,
  high: 0,
  moderate: 0,
};
try {
  const report = JSON.parse(audit.stdout || "{}");
  const counts = report.metadata?.vulnerabilities || {};
  auditSummary = {
    status: audit.status === 0 ? "pass" : "fail",
    critical: counts.critical || 0,
    high: counts.high || 0,
    moderate: counts.moderate || 0,
  };
  if ((counts.high || 0) > 0 || (counts.critical || 0) > 0) {
    addFailure(
      "audit",
      `high=${counts.high || 0} critical=${counts.critical || 0}`,
      "package.json",
      1,
    );
  }
} catch {
  addFailure("audit", "npm audit did not return JSON", "package.json", 1);
}
checks.audit = auditSummary;

console.log("\n== gitleaks ==");
const gitleaksBin = fs.existsSync("/tmp/gitleaks")
  ? "/tmp/gitleaks"
  : "gitleaks";
const leaks = run(gitleaksBin, [
  "detect",
  "--source",
  ".",
  "--redact",
  "--no-banner",
  "--report-format",
  "json",
  "--report-path",
  "test-results/gitleaks.json",
]);
let leakCount = 0;
try {
  const report = JSON.parse(
    fs.readFileSync("test-results/gitleaks.json", "utf8"),
  );
  leakCount = Array.isArray(report) ? report.length : 0;
  for (const finding of Array.isArray(report) ? report : []) {
    addFailure(
      "gitleaks",
      finding.Description || finding.RuleID || "secret",
      finding.File,
      finding.StartLine,
    );
  }
} catch {
  leakCount = leaks.status === 0 ? 0 : null;
}
checks.gitleaks = {
  status: leaks.status === 0 ? "pass" : "fail",
  leaks: leakCount,
};
if (leaks.status !== 0 && leakCount === null) {
  addFailure("gitleaks", "gitleaks failed to scan", null, null);
}

checks.lighthouse = {
  status: "pending",
  performance: null,
  accessibility: null,
  "best-practices": null,
  seo: null,
  budgets: {
    performance: 65,
    accessibility: 70,
    "best-practices": 90,
    seo: 90,
  },
};

const summary = {
  generatedAt: new Date().toISOString(),
  commit:
    run("git", ["rev-parse", "HEAD"], { silent: true }).stdout?.trim() || null,
  status: failures.length === 0 ? "pass" : "fail",
  checks,
  failures,
};
fs.writeFileSync("test-summary.json", JSON.stringify(summary, null, 2));
writeStepSummary(summary);
console.log(`\nSummary written to test-summary.json (${summary.status})`);
process.exit(failures.length === 0 ? 0 : 1);

function writeStepSummary(summary) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const lines = ["# Test summary", "", `| Check | Result |`, `| --- | --- |`];
  for (const [name, value] of Object.entries(summary.checks)) {
    const detail = Object.entries(value)
      .filter(
        ([key]) =>
          key !== "status" && key !== "thresholds" && key !== "budgets",
      )
      .map(([key, item]) => `${key} ${item}`)
      .join(", ");
    lines.push(`| ${name} | ${value.status}${detail ? ` (${detail})` : ""} |`);
  }
  if (summary.failures.length) {
    lines.push("", "## Failures", "");
    for (const failure of summary.failures) {
      const where = failure.file
        ? `${failure.file}${failure.line ? `:${failure.line}` : ""}`
        : "unknown";
      lines.push(`- **${failure.check}** \`${where}\` ${failure.message}`);
    }
  }
  fs.appendFileSync(file, `${lines.join("\n")}\n`);
}
