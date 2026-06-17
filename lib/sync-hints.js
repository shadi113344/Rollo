const fs = require("fs");
const path = require("path");

const CONFLICT_RE = /\.sync-conflict-.*\.json$/i;

function scanLibrarySyncHints(videosDir, groupId) {
  const libraryDir = path.join(videosDir, groupId);
  const conflicts = [];
  let syncthing = false;

  if (!fs.existsSync(libraryDir)) {
    return { conflicts, syncthing };
  }

  if (fs.existsSync(path.join(libraryDir, ".stfolder"))) {
    syncthing = true;
  }

  const rolloDir = path.join(libraryDir, "_rollo");
  if (!fs.existsSync(rolloDir)) {
    return { conflicts, syncthing };
  }

  try {
    for (const name of fs.readdirSync(rolloDir)) {
      if (CONFLICT_RE.test(name)) {
        conflicts.push({ library: groupId, file: `_rollo/${name}` });
      }
    }
  } catch {
    /* ignore */
  }

  return { conflicts, syncthing };
}

function scanAllSyncHints(videosDir, groupIds) {
  const conflicts = [];
  const syncthingLibraries = [];
  for (const id of groupIds) {
    const hint = scanLibrarySyncHints(videosDir, id);
    conflicts.push(...hint.conflicts);
    if (hint.syncthing) syncthingLibraries.push(id);
  }
  return {
    conflictCount: conflicts.length,
    conflicts,
    syncthingLibraries,
  };
}

function isLibraryDeletable(videosDir, groupId, mediaRe) {
  const dir = path.join(videosDir, groupId);
  if (!fs.existsSync(dir)) return { ok: true };
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === "_rollo" || ent.name === ".stfolder") continue;
      if (ent.isDirectory()) {
        return { ok: false, reason: "Library folder contains subfolders" };
      }
      if (mediaRe.test(ent.name)) {
        return { ok: false, reason: "Library must be empty before deleting" };
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message || "Could not read library folder" };
  }
}

module.exports = {
  scanLibrarySyncHints,
  scanAllSyncHints,
  isLibraryDeletable,
};
