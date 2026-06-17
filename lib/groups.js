const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROLLO_DIR = "_rollo";
const GROUP_FILE = "group.json";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function groupConfigPath(videosDir, groupId) {
  return path.join(videosDir, groupId, ROLLO_DIR, GROUP_FILE);
}

function normalizeLockMode(saved) {
  return saved.lockMode === "once" ? "once" : "always";
}

function normalizeConfig(groupId, saved) {
  const passwordHash = saved.passwordHash || null;
  return {
    displayName: saved.displayName || groupId,
    passwordHash,
    passwordVersion: saved.passwordVersion || 0,
    lockMode: passwordHash ? normalizeLockMode(saved) : null,
  };
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

function createGroupsStore(videosDir, legacyPath) {
  const cache = new Map();

  function readLegacy() {
    if (!legacyPath || !fs.existsSync(legacyPath)) return {};
    try {
      return JSON.parse(fs.readFileSync(legacyPath, "utf8"));
    } catch {
      return {};
    }
  }

  function readGroupRaw(groupId) {
    const filePath = groupConfigPath(videosDir, groupId);
    const mtime = fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : 0;
    const cached = cache.get(groupId);
    if (cached && cached.mtime === mtime) return cached.data;

    let data = {};
    if (fs.existsSync(filePath)) {
      try {
        data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch {
        data = {};
      }
    }
    cache.set(groupId, { data, mtime });
    return data;
  }

  function writeGroupRaw(groupId, data) {
    ensureDir(path.join(videosDir, groupId, ROLLO_DIR));
    const filePath = groupConfigPath(videosDir, groupId);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      cache.set(groupId, { data, mtime: fs.statSync(filePath).mtimeMs });
      return true;
    } catch (err) {
      console.warn(`[Rollo] Could not write ${filePath}:`, err.message || err);
      cache.set(groupId, { data, mtime: 0 });
      return false;
    }
  }

  function getGroupConfig(groupId) {
    const raw = readGroupRaw(groupId);
    if (Object.keys(raw).length) return normalizeConfig(groupId, raw);

    const legacy = readLegacy();
    if (legacy[groupId]) {
      writeGroupRaw(groupId, legacy[groupId]);
      return normalizeConfig(groupId, legacy[groupId]);
    }

    return normalizeConfig(groupId, {});
  }

  function setGroupConfig(groupId, patch) {
    const raw = readGroupRaw(groupId);
    const merged = { ...raw, ...patch };
    if (!merged.displayName) merged.displayName = groupId;
    if (merged.passwordHash == null) delete merged.passwordHash;
    if (merged.lockMode == null) delete merged.lockMode;
    writeGroupRaw(groupId, merged);
    return normalizeConfig(groupId, merged);
  }

  function deleteGroupConfig(groupId) {
    cache.delete(groupId);
    const filePath = groupConfigPath(videosDir, groupId);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  function invalidateCache(groupId) {
    if (groupId) cache.delete(groupId);
    else cache.clear();
  }

  function revokeAllUnlocks(groupId) {
    const raw = readGroupRaw(groupId);
    raw.passwordVersion = (raw.passwordVersion || 0) + 1;
    writeGroupRaw(groupId, raw);
    return normalizeConfig(groupId, raw);
  }

  function migrateFromLegacy(groupIds) {
    const legacy = readLegacy();
    let migrated = 0;
    for (const groupId of groupIds) {
      if (!legacy[groupId]) continue;
      const raw = readGroupRaw(groupId);
      if (Object.keys(raw).length) continue;
      if (writeGroupRaw(groupId, legacy[groupId])) migrated++;
    }

    if (migrated > 0 && legacyPath && fs.existsSync(legacyPath)) {
      const bak = `${legacyPath}.bak`;
      if (!fs.existsSync(bak)) {
        try {
          fs.copyFileSync(legacyPath, bak);
        } catch {
          /* ignore */
        }
      }
    }

    return { migrated };
  }

  return {
    getGroupConfig,
    setGroupConfig,
    deleteGroupConfig,
    migrateFromLegacy,
    invalidateCache,
    revokeAllUnlocks,
  };
}

function createGroupAuth(groupsStore, secret = process.env.VIDEO_SECRET || "rollo-local-secret") {
  function makeUnlockToken(groupId) {
    const config = groupsStore.getGroupConfig(groupId);
    const version = config.passwordVersion || 0;
    const exp = Date.now() + 30 * 24 * 3600 * 1000;
    const payload = `${groupId}:${exp}:${version}`;
    const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return Buffer.from(`${payload}:${sig}`).toString("base64url");
  }

  function verifyUnlockToken(token, groupId) {
    if (!token) return false;
    try {
      const parts = Buffer.from(token, "base64url").toString().split(":");
      if (parts.length !== 4) return false;
      const [gid, exp, version, sig] = parts;
      if (gid !== groupId || Date.now() > Number(exp)) return false;
      const config = groupsStore.getGroupConfig(groupId);
      if (Number(version) !== (config.passwordVersion || 0)) return false;
      const expected = crypto
        .createHmac("sha256", secret)
        .update(`${gid}:${exp}:${version}`)
        .digest("hex");
      return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  }

  function isGroupLocked(groupId) {
    return !!groupsStore.getGroupConfig(groupId).passwordHash;
  }

  function isGroupUnlocked(groupId, unlockToken) {
    if (!isGroupLocked(groupId)) return true;
    return verifyUnlockToken(unlockToken, groupId);
  }

  return {
    makeUnlockToken,
    verifyUnlockToken,
    isGroupLocked,
    isGroupUnlocked,
  };
}

module.exports = {
  createGroupsStore,
  createGroupAuth,
  hashPassword,
  verifyPassword,
  ROLLO_DIR,
  GROUP_FILE,
  normalizeConfig,
};
