const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SECRET_FILE = ".video-secret";

function readPersistedSecret(dataDir) {
  try {
    const file = path.join(dataDir, SECRET_FILE);
    if (!fs.existsSync(file)) return null;
    const value = fs.readFileSync(file, "utf8").trim();
    return value.length >= 32 ? value : null;
  } catch {
    return null;
  }
}

function writePersistedSecret(dataDir, secret) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, SECRET_FILE), secret, { mode: 0o600 });
}

function generateSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function resolveVideoSecret(dataDir) {
  if (process.env.VIDEO_SECRET) return process.env.VIDEO_SECRET;

  const persisted = readPersistedSecret(dataDir);
  if (persisted) {
    process.env.VIDEO_SECRET = persisted;
    return persisted;
  }

  const generated = generateSecret();
  writePersistedSecret(dataDir, generated);
  process.env.VIDEO_SECRET = generated;
  return generated;
}

function assertProductionSecret(dataDir) {
  const isProd = process.env.NODE_ENV === "production" || process.env.ROLLO_PRODUCTION === "1";
  if (!isProd) return;

  if (!process.env.VIDEO_SECRET && !readPersistedSecret(dataDir)) {
    throw new Error("VIDEO_SECRET must be set in production (or allow auto-generation on first run)");
  }
}

module.exports = {
  resolveVideoSecret,
  assertProductionSecret,
  generateSecret,
};
