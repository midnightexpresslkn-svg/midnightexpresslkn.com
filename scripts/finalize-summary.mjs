import fs from "node:fs";
import path from "node:path";

const summaryPath = "test-summary.json";
const summary = fs.existsSync(summaryPath)
  ? JSON.parse(fs.readFileSync(summaryPath, "utf8"))
  : {
      generatedAt: new Date().toISOString(),
      status: "fail",
      checks: {},
      failures: [],
    };

const budgets = {
  performance: 65,
  accessibility: 70,
  "best-practices": 90,
  seo: 90,
};
const scores = {};

function walk(dir) {
  if (!dir || !fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".json")) files.push(full);
  }
}

const files = [];
walk(process.env.LHCI_RESULTS || "");
walk(".lighthouseci");
walk("lighthouse-results");

for (const file of files) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const categories = data.categories || data.lhr?.categories;
    if (!categories) continue;
    for (const key of Object.keys(budgets)) {
      const score = categories[key]?.score;
      if (typeof score === "number") scores[key] = Math.round(score * 100);
    }
  } catch {
    // ignore unrelated json
  }
}

const missing = Object.keys(budgets).filter((key) => scores[key] == null);
const below = Object.entries(budgets).filter(
  ([key, min]) => scores[key] != null && scores[key] < min,
);
const lighthouse = {
  status: missing.length || below.length ? "fail" : "pass",
  ...scores,
  budgets,
};
if (missing.length) {
  summary.failures.push({
    check: "lighthouse",
    message: `missing scores: ${missing.join(", ")}`,
    file: "lighthouserc.json",
    line: 1,
  });
}
for (const [key, min] of below) {
  summary.failures.push({
    check: "lighthouse",
    message: `${key} score ${scores[key]} is below budget ${min}`,
    file: "lighthouserc.json",
    line: 1,
  });
}
summary.checks.lighthouse = lighthouse;
summary.status = (summary.failures || []).length === 0 ? "pass" : "fail";
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

const step = process.env.GITHUB_STEP_SUMMARY;
if (step) {
  const lines = [
    "",
    "## Lighthouse",
    "",
    `| Category | Score | Budget |`,
    `| --- | --- | --- |`,
  ];
  for (const [key, min] of Object.entries(budgets)) {
    lines.push(`| ${key} | ${scores[key] ?? "missing"} | ${min} |`);
  }
  fs.appendFileSync(step, `${lines.join("\n")}\n`);
}

console.log(JSON.stringify(lighthouse, null, 2));
process.exit(summary.status === "pass" ? 0 : 1);
