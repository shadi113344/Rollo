#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const swPath = path.join(publicDir, "sw.js");

const PAGES = ["index.html", "watch.html", "download.html", "connect.html", "settings.html", "x-login.html"];

const STATIC_ASSETS = [
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/apple-touch-icon-180.png",
];

function collectFromHtml(html) {
  const found = new Set();
  const re = /(?:src|href)="(\/(?!videos\/|api\/)[^"?#]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const asset = m[1];
    if (asset.endsWith(".html") && !PAGES.includes(asset.slice(1))) continue;
    found.add(asset);
  }
  return found;
}

function main() {
  const assets = new Set(["/", ...STATIC_ASSETS, ...PAGES.map((p) => `/${p}`)]);
  for (const page of PAGES) {
    const file = path.join(publicDir, page);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, "utf8");
    collectFromHtml(html).forEach((a) => assets.add(a));
  }

  const sorted = [...assets].sort((a, b) => a.localeCompare(b));
  const sw = fs.readFileSync(swPath, "utf8");
  const list = sorted.map((a) => `  "${a}",`).join("\n");
  const next = sw.replace(
    /const PRECACHE = \[[\s\S]*?\];/,
    `const PRECACHE = [\n${list}\n];`
  );
  if (next === sw) {
    console.error("Could not update PRECACHE block in sw.js");
    process.exit(1);
  }
  fs.writeFileSync(swPath, next, "utf8");
  console.log(`Updated PRECACHE with ${sorted.length} entries`);
}

main();
