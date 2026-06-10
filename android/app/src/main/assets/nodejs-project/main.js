"use strict";

const fs = require("fs");
const path = require("path");

const root = __dirname;
process.chdir(root);

function logCrash(label, err) {
  const msg = `[${label}] ${err && err.stack ? err.stack : String(err)}\n`;
  try {
    fs.appendFileSync(path.join(root, "node.log"), msg);
  } catch (_) {
    /* ignore */
  }
  console.error(msg);
}

process.on("uncaughtException", (err) => logCrash("uncaughtException", err));
process.on("unhandledRejection", (err) => logCrash("unhandledRejection", err));

const configFile = process.env.ROLLO_CONFIG || path.join(root, "rollo-config.json");

if (fs.existsSync(configFile)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
    for (const [key, value] of Object.entries(cfg)) {
      if (value != null && value !== "") process.env[key] = String(value);
    }
  } catch (err) {
    logCrash("config", err);
  }
}

if (process.env.DATA_DIR && !process.env.GROUPS_PATH) {
  process.env.GROUPS_PATH = path.join(process.env.DATA_DIR, "groups.json");
}

try {
  require("./server.js");
} catch (err) {
  logCrash("startup", err);
  throw err;
}
