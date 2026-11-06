import {
  getAllByRole,
  getByPlaceholderText,
  getByRole,
} from "@testing-library/dom";
import { formatSource } from "./source-line.js";

function show(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function callerFrame(fn) {
  const err = {};
  Error.captureStackTrace(err, fn);
  const frames = String(err.stack).split("\n").slice(1);
  for (const frame of frames) {
    const match = frame.match(/\(?((?:file:\/\/)?[^()\s]+):(\d+):\d+\)?$/);
    if (!match) continue;
    let file = match[1];
    if (file.startsWith("file://")) file = file.slice("file://".length);
    if (file.includes("node_modules") || file.includes("/tests/helpers/"))
      continue;
    const rel = file.startsWith(process.cwd())
      ? file.slice(process.cwd().length + 1)
      : file;
    return `${rel}:${match[2]}`;
  }
  return "unknown";
}

function ghEscape(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

function annotate(testAt, sourceAt, title, message) {
  if (process.env.GITHUB_ACTIONS !== "true") return;
  const emit = (loc) => {
    const match = String(loc).match(/^(.+):(\d+)$/);
    if (!match) return;
    process.stdout.write(
      `::error file=${match[1]},line=${match[2]},title=${ghEscape(title)}::${ghEscape(message)}\n`,
    );
  };
  emit(testAt);
  if (sourceAt && sourceAt !== testAt) emit(sourceAt);
}

function resolveSource(source) {
  if (!source) return "js/booking.js (line not found)";
  if (typeof source === "function") return formatSource(source());
  if (typeof source === "string") return source;
  return formatSource(source);
}

function footer({ label, expected, actual, source, loaded }, fn) {
  const testAt = callerFrame(fn);
  const sourceAt = resolveSource(source);
  const message = [
    label,
    `expected: ${show(expected)}`,
    `actual: ${show(actual)}`,
    `test: ${testAt}`,
    `source: ${sourceAt}`,
    loaded ? `loaded: ${loaded}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  annotate(testAt, sourceAt, label, message);
  return message;
}

export function check(actual, expected, meta) {
  const same =
    Object.is(actual, expected) ||
    JSON.stringify(actual) === JSON.stringify(expected);
  if (same) return;
  const error = new Error(footer({ ...meta, actual, expected }, check));
  Error.captureStackTrace(error, check);
  throw error;
}

function decorate(error, meta, fn) {
  const message = footer(
    {
      label: meta.label || error.name || "query failed",
      expected: meta.expected,
      actual: meta.actual || String(error.message).split("\n")[0],
      source: meta.source,
      loaded: meta.loaded,
    },
    fn,
  );
  error.message += `\n\n${message}`;
  Error.captureStackTrace(error, fn);
}

export function role(container, roleName, options, meta = {}) {
  try {
    return getByRole(container, roleName, options);
  } catch (error) {
    decorate(error, meta, role);
    throw error;
  }
}

export function roles(container, roleName, options, meta = {}) {
  try {
    return getAllByRole(container, roleName, options);
  } catch (error) {
    decorate(error, meta, roles);
    throw error;
  }
}

export function placeholder(container, text, meta = {}) {
  try {
    return getByPlaceholderText(container, text);
  } catch (error) {
    decorate(error, meta, placeholder);
    throw error;
  }
}
