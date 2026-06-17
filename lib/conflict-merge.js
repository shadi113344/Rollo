const fs = require("fs");
const path = require("path");

const CONFLICT_RE = /\.sync-conflict-.*\.json$/i;

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function mergeMeta(a, b) {
  const left = a && typeof a === "object" ? a : {};
  const right = b && typeof b === "object" ? b : {};
  const tags = [...new Set([...(left.tags || []), ...(right.tags || [])])];
  return {
    tags,
    favorite: !!(left.favorite || right.favorite),
  };
}

function mergeLibraryConflicts(videosDir, groupId) {
  const rolloDir = path.join(videosDir, groupId, "_rollo");
  if (!fs.existsSync(rolloDir)) return { merged: 0, groupId };

  const conflicts = fs.readdirSync(rolloDir).filter((name) => CONFLICT_RE.test(name));
  if (!conflicts.length) return { merged: 0, groupId };

  const mainPath = path.join(rolloDir, "meta.json");
  let main = readJson(mainPath) || {};
  const backupPath = path.join(rolloDir, `meta.backup-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(main, null, 2));

  for (const name of conflicts) {
    const conflictPath = path.join(rolloDir, name);
    const data = readJson(conflictPath);
    if (data && typeof data === "object") {
      for (const [filename, meta] of Object.entries(data)) {
        main[filename] = mergeMeta(main[filename], meta);
      }
    }
    fs.unlinkSync(conflictPath);
  }

  fs.writeFileSync(mainPath, JSON.stringify(main, null, 2));
  return { merged: conflicts.length, groupId, backup: `_rollo/${path.basename(backupPath)}` };
}

function mergeAllConflicts(videosDir, groupIds) {
  const results = [];
  for (const id of groupIds) {
    results.push(mergeLibraryConflicts(videosDir, id));
  }
  return {
    total: results.reduce((n, r) => n + r.merged, 0),
    libraries: results.filter((r) => r.merged > 0),
  };
}

module.exports = {
  mergeLibraryConflicts,
  mergeAllConflicts,
  mergeMeta,
};
