import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const blocked = new Set([
  "node_modules",
  ".git",
  "coverage",
  "test-results",
  "lighthouse-results",
]);

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const parts = pathname.split("/").filter(Boolean);
  if (parts.some((part) => part === ".." || blocked.has(part))) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const file = path.join(root, pathname);
  if (!file.startsWith(root)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  fs.readFile(file, (error, body) => {
    if (error) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
    });
    res.end(body);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ready http://127.0.0.1:${port}/`);
});
