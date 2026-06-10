const fs = require("fs");
const path = require("path");

const ROLLO_DIR = "_rollo";
const META_FILE = "meta.json";

function groupMetaDir(videosDir, groupId) {
  return path.join(videosDir, groupId, ROLLO_DIR);
}

function groupMetaPath(videosDir, groupId) {
  return path.join(groupMetaDir(videosDir, groupId), META_FILE);
}

function normalizeMeta(entry) {
  return {
    tags: Array.isArray(entry?.tags) ? entry.tags : [],
    favorite: !!entry?.favorite,
  };
}

function createMetadataStore(videosDir, legacyPath) {
  const cache = new Map();

  function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  function readLegacy() {
    if (!legacyPath || !fs.existsSync(legacyPath)) return {};
    try {
      return JSON.parse(fs.readFileSync(legacyPath, "utf8"));
    } catch {
      return {};
    }
  }

  function readGroupFile(groupId) {
    const filePath = groupMetaPath(videosDir, groupId);
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

  function writeGroupFile(groupId, data) {
    ensureDir(groupMetaDir(videosDir, groupId));
    const filePath = groupMetaPath(videosDir, groupId);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    cache.set(groupId, { data, mtime: fs.statSync(filePath).mtimeMs });
  }

  function findGroupWithFile(groupIds, filename) {
    for (const groupId of groupIds) {
      const filePath = path.join(videosDir, groupId, filename);
      if (fs.existsSync(filePath)) return groupId;
    }
    return null;
  }

  function migrateFromLegacy(groupIds) {
    const legacy = readLegacy();
    const keys = Object.keys(legacy);
    if (!keys.length) return { migrated: 0 };

    let migrated = 0;
    const groupSet = new Set(groupIds);

    for (const key of keys) {
      const slash = key.indexOf("/");
      if (slash === -1) continue;
      let groupId = key.slice(0, slash);
      const filename = key.slice(slash + 1);
      if (!groupSet.has(groupId)) {
        groupId = findGroupWithFile(groupIds, filename);
        if (!groupId) continue;
      }

      const data = readGroupFile(groupId);
      if (data[filename]) continue;
      data[filename] = normalizeMeta(legacy[key]);
      writeGroupFile(groupId, data);
      migrated++;
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

  function invalidateCache(groupId) {
    if (groupId) cache.delete(groupId);
    else cache.clear();
  }

  function getVideoMeta(groupId, filename) {
    const data = readGroupFile(groupId);
    if (data[filename]) return normalizeMeta(data[filename]);

    const legacy = readLegacy();
    const legacyKey = `${groupId}/${filename}`;
    if (legacy[legacyKey]) {
      const meta = normalizeMeta(legacy[legacyKey]);
      data[filename] = meta;
      writeGroupFile(groupId, data);
      return meta;
    }

    return { tags: [], favorite: false };
  }

  function setVideoMeta(groupId, filename, meta) {
    const data = readGroupFile(groupId);
    data[filename] = normalizeMeta(meta);
    writeGroupFile(groupId, data);
  }

  function deleteVideoMeta(groupId, filename) {
    const data = readGroupFile(groupId);
    if (!data[filename]) return;
    delete data[filename];
    writeGroupFile(groupId, data);
  }

  function renameVideoMeta(groupId, oldName, newName) {
    const data = readGroupFile(groupId);
    if (!data[oldName]) return;
    data[newName] = data[oldName];
    delete data[oldName];
    writeGroupFile(groupId, data);
  }

  return {
    migrateFromLegacy,
    invalidateCache,
    getVideoMeta,
    setVideoMeta,
    deleteVideoMeta,
    renameVideoMeta,
    groupMetaPath,
    ROLLO_DIR,
  };
}

module.exports = {
  createMetadataStore,
  groupMetaPath,
  ROLLO_DIR,
  META_FILE,
  normalizeMeta,
};
