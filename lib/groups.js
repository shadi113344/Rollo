const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const GROUPS_PATH =
  process.env.GROUPS_PATH || path.join(__dirname, "..", "data", "groups.json");
const SECRET = process.env.VIDEO_SECRET || "rollo-local-secret";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readGroupsFile() {
  ensureDir(path.dirname(GROUPS_PATH));
  if (!fs.existsSync(GROUPS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(GROUPS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeGroupsFile(data) {
  ensureDir(path.dirname(GROUPS_PATH));
  fs.writeFileSync(GROUPS_PATH, JSON.stringify(data, null, 2));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const attempt = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attempt, "hex"));
  } catch {
    return false;
  }
}


function makeUnlockToken(groupId) {
  const config = getGroupConfig(groupId);
  const version = config.passwordVersion || 0;
  const exp = Date.now() + 30 * 24 * 3600 * 1000;
  const payload = `${groupId}:${exp}:${version}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyUnlockToken(token, groupId) {
  if (!token) return false;
  try {
    const parts = Buffer.from(token, "base64url").toString().split(":");
    if (parts.length !== 4) return false;
    const [gid, exp, version, sig] = parts;
    if (gid !== groupId || Date.now() > Number(exp)) return false;
    const config = getGroupConfig(groupId);
    if (Number(version) !== (config.passwordVersion || 0)) return false;
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(`${gid}:${exp}:${version}`)
      .digest("hex");
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function getGroupConfig(groupId, groupsFile = readGroupsFile()) {
  const saved = groupsFile[groupId] || {};
  return {
    displayName: saved.displayName || groupId,
    passwordHash: saved.passwordHash || null,
    passwordVersion: saved.passwordVersion || 0,
  };
}

function isGroupLocked(groupId) {
  return !!getGroupConfig(groupId).passwordHash;
}

function isGroupUnlocked(groupId, unlockToken) {
  if (!isGroupLocked(groupId)) return true;
  return verifyUnlockToken(unlockToken, groupId);
}

module.exports = {
  readGroupsFile,
  writeGroupsFile,
  getGroupConfig,
  hashPassword,
  verifyPassword,
  makeUnlockToken,
  verifyUnlockToken,
  isGroupLocked,
  isGroupUnlocked,
};
