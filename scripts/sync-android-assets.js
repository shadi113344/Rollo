#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const dest = path.join(root, "android", "app", "src", "main", "assets", "nodejs-project");

const COPY = ["server.js", "package.json", "package-lock.json", "lib", "public"];

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (entry === "node_modules") continue;
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

fs.mkdirSync(dest, { recursive: true });

for (const item of COPY) {
  const src = path.join(root, item);
  if (!fs.existsSync(src)) {
    console.warn(`skip missing: ${item}`);
    continue;
  }
  const dst = path.join(dest, item);
  if (fs.existsSync(dst)) {
    fs.rmSync(dst, { recursive: true, force: true });
  }
  copyRecursive(src, dst);
  console.log(`copied ${item}`);
}

console.log("running npm install --omit=dev in assets...");
execSync("npm install --omit=dev", { cwd: dest, stdio: "inherit" });

console.log("Android nodejs-project ready at:", dest);
