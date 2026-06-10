"use strict";

const fs = require("fs");
const path = require("path");

const root = __dirname;
const configFile = process.env.ROLLO_CONFIG || path.join(root, "rollo-config.json");

if (fs.existsSync(configFile)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
    for (const [key, value] of Object.entries(cfg)) {
      if (value != null && value !== "") process.env[key] = String(value);
    }
  } catch (err) {
    console.error("[Rollo] Failed to read rollo-config.json:", err);
  }
}

if (process.env.DATA_DIR && !process.env.GROUPS_PATH) {
  process.env.GROUPS_PATH = path.join(process.env.DATA_DIR, "groups.json");
}

require("./server.js");
