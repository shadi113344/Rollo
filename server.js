const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const appRoot = __dirname;
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(appRoot, "data");
const videosDir = process.env.VIDEOS_DIR
  ? path.resolve(process.env.VIDEOS_DIR)
  : path.join(appRoot, "videos");
const metadataPath = path.join(dataDir, "metadata.json");

if (!process.env.GROUPS_PATH) {
  process.env.GROUPS_PATH = path.join(dataDir, "groups.json");
}

const { createMetadataStore } = require("./lib/metadata");
const { getAccessInfo, printAccessInfo } = require("./lib/network");
const {
  MEDIA_RE,
  stripMediaExt,
  extFromMime,
  mediaTypeFor,
  isAllowedUpload,
} = require("./lib/media");
const {
  createGroupsStore,
  createGroupAuth,
  hashPassword,
  verifyPassword,
} = require("./lib/groups");

const app = express();
const PORT = Number(process.env.PORT) || 3847;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h", etag: true }));

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const groupsPath = process.env.GROUPS_PATH || path.join(dataDir, "groups.json");
const metadataStore = createMetadataStore(videosDir, metadataPath);
const groupsStore = createGroupsStore(videosDir, groupsPath);
const groupAuth = createGroupAuth(groupsStore);
const { makeUnlockToken, isGroupUnlocked } = groupAuth;

const videoListCache = new Map();

function listVideoFilesCached(groupId) {
  const dir = path.join(videosDir, groupId);
  if (!fs.existsSync(dir)) return [];
  const mtime = fs.statSync(dir).mtimeMs;
  const cached = videoListCache.get(groupId);
  if (cached && cached.mtime === mtime) return cached.files;
  const files = listVideoFiles(groupId);
  videoListCache.set(groupId, { mtime, files });
  return files;
}

function invalidateVideoListCache(groupId) {
  if (groupId) videoListCache.delete(groupId);
  else videoListCache.clear();
}

function metaKey(groupId, filename) {
  return `${groupId}/${filename}`;
}

function getFileExt(filename) {
  const match = filename.match(/(\.[a-z0-9]+)$/i);
  return match ? match[1] : "";
}

function stripExt(filename) {
  return stripMediaExt(filename);
}

function sanitizeBaseName(name) {
  return String(name)
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ");
}

function listGroupIds() {
  ensureDir(videosDir);
  return fs
    .readdirSync(videosDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "_rollo")
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function listVideoFiles(groupId) {
  const dir = path.join(videosDir, groupId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => MEDIA_RE.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function getUnlockTokensFromRequest(req) {
  const fromHeader = String(req.headers["x-unlocked"] || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const fromQuery = String(req.query?.unlocked || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return [...fromHeader, ...fromQuery];
}

function isGroupUnlockedForRequest(groupId, req) {
  if (!isGroupLocked(groupId)) return true;
  return getUnlockTokensFromRequest(req).some((token) => isGroupUnlocked(groupId, token));
}

function requireGroup(groupId, req, res) {
  if (!groupId) {
    res.status(400).json({ error: "group query parameter required" });
    return false;
  }
  if (!listGroupIds().includes(groupId)) {
    res.status(404).json({ error: "Group not found" });
    return false;
  }
  if (!isGroupUnlockedForRequest(groupId, req)) {
    res.status(403).json({ error: "Group is locked", locked: true });
    return false;
  }
  return true;
}

function requireVideoAccess(req, res, next) {
  const rel = decodeURIComponent(req.path || "").replace(/^\/+/, "");
  const slash = rel.indexOf("/");
  if (slash === -1) return next();
  const groupId = rel.slice(0, slash);
  const filename = rel.slice(slash + 1);
  if (!filename || !listGroupIds().includes(groupId)) return next();
  if (!isGroupUnlockedForRequest(groupId, req)) {
    return res.status(403).json({ error: "Group is locked", locked: true });
  }
  next();
}

app.use(
  "/videos",
  requireVideoAccess,
  express.static(videosDir, { maxAge: "7d", etag: true, immutable: false })
);

function buildVideo(groupId, filename) {
  const stat = fs.statSync(path.join(videosDir, groupId, filename));
  const relPath = metaKey(groupId, filename);
  return {
    name: filename,
    group: groupId,
    path: relPath,
    displayName: stripExt(filename),
    url: `/videos/${encodeURIComponent(groupId)}/${encodeURIComponent(filename)}`,
    mtime: stat.mtimeMs,
    mediaType: mediaTypeFor(filename),
    ...metadataStore.getVideoMeta(groupId, filename),
  };
}

app.get("/api/groups", (req, res) => {
  const ids = listGroupIds();
  ids.forEach((id) => groupsStore.invalidateCache(id));
  const groups = ids.map((id) => {
    const config = groupsStore.getGroupConfig(id);
    const locked = !!config.passwordHash;
    return {
      id,
      name: id,
      displayName: config.displayName,
      locked,
      lockMode: locked ? config.lockMode : null,
      unlocked: isGroupUnlockedForRequest(id, req),
      videoCount: listVideoFilesCached(id).length,
    };
  });
  res.json(groups);
});

function sanitizeGroupId(name) {
  return sanitizeBaseName(name).slice(0, 64) || null;
}

function nextDefaultGroupId() {
  const ids = new Set(listGroupIds());
  let n = 1;
  while (ids.has(`Group ${n}`)) n++;
  return `Group ${n}`;
}

function uniqueGroupId(desired) {
  const ids = new Set(listGroupIds());
  if (!ids.has(desired)) return desired;
  let n = 2;
  while (ids.has(`${desired} (${n})`)) n++;
  return `${desired} (${n})`;
}

app.post("/api/groups", (req, res) => {
  const rawName = String(req.body?.displayName || req.body?.name || "").trim();
  let groupId = rawName ? sanitizeGroupId(rawName) : null;
  if (!groupId) groupId = nextDefaultGroupId();
  else groupId = uniqueGroupId(groupId);

  const dir = path.join(videosDir, groupId);
  if (fs.existsSync(dir)) {
    return res.status(409).json({ error: "A library with that name already exists" });
  }

  try {
    ensureDir(dir);
  } catch {
    return res.status(500).json({ error: "Could not create library folder" });
  }

  if (rawName) groupsStore.setGroupConfig(groupId, { displayName: rawName });
  invalidateVideoListCache(groupId);

  res.status(201).json({
    id: groupId,
    name: groupId,
    displayName: groupsStore.getGroupConfig(groupId).displayName,
    locked: false,
    unlocked: true,
    videoCount: 0,
  });
});

app.post("/api/groups/:groupId/unlock", (req, res) => {
  const groupId = decodeURIComponent(req.params.groupId);
  if (!listGroupIds().includes(groupId)) {
    return res.status(404).json({ error: "Group not found" });
  }
  const config = groupsStore.getGroupConfig(groupId);
  if (!config.passwordHash) {
    return res.json({ ok: true, token: null });
  }
  const password = String(req.body?.password || "");
  if (!verifyPassword(password, config.passwordHash)) {
    return res.status(401).json({ error: "Wrong password" });
  }
  res.json({ ok: true, token: makeUnlockToken(groupId) });
});

app.put("/api/groups/:groupId", (req, res) => {
  const groupId = decodeURIComponent(req.params.groupId);
  if (!listGroupIds().includes(groupId)) {
    return res.status(404).json({ error: "Group not found" });
  }
  if (!isGroupUnlockedForRequest(groupId, req)) {
    return res.status(403).json({ error: "Group is locked", locked: true });
  }

  const existing = groupsStore.getGroupConfig(groupId);
  const patch = { displayName: existing.displayName };
  const { displayName, password, removePassword, lockMode } = req.body || {};

  if (displayName !== undefined) {
    const trimmed = String(displayName).trim();
    if (trimmed) patch.displayName = trimmed;
  }

  if (removePassword) {
    patch.passwordHash = null;
    patch.lockMode = null;
    patch.passwordVersion = (existing.passwordVersion || 0) + 1;
  } else if (password !== undefined && password !== "") {
    patch.passwordHash = hashPassword(String(password));
    patch.passwordVersion = (existing.passwordVersion || 0) + 1;
    if (!existing.lockMode) patch.lockMode = "always";
  }

  if (lockMode === "once" || lockMode === "always") {
    const nextHash = patch.passwordHash !== undefined ? patch.passwordHash : existing.passwordHash;
    if (nextHash) patch.lockMode = lockMode;
  }

  const current = groupsStore.setGroupConfig(groupId, patch);

  res.json({
    id: groupId,
    displayName: current.displayName || groupId,
    locked: !!current.passwordHash,
    lockMode: current.passwordHash
      ? current.lockMode === "once"
        ? "once"
        : "always"
      : null,
    passwordChanged: !!(removePassword || (password !== undefined && password !== "")),
    lockModeChanged: lockMode === "once" || lockMode === "always",
  });
});

app.post("/api/groups/:groupId/rename", (req, res) => {
  const oldId = decodeURIComponent(req.params.groupId);
  if (!listGroupIds().includes(oldId)) {
    return res.status(404).json({ error: "Group not found" });
  }
  if (!isGroupUnlockedForRequest(oldId, req)) {
    return res.status(403).json({ error: "Group is locked", locked: true });
  }

  const rawName = String(req.body?.newId || req.body?.name || "").trim();
  let newId = rawName ? sanitizeGroupId(rawName) : null;
  if (!newId) return res.status(400).json({ error: "Invalid library name" });
  if (newId === oldId) {
    return res.json({
      id: oldId,
      displayName: groupsStore.getGroupConfig(oldId).displayName,
    });
  }
  if (listGroupIds().includes(newId)) {
    return res.status(409).json({ error: "A library with that name already exists" });
  }

  try {
    fs.renameSync(path.join(videosDir, oldId), path.join(videosDir, newId));
  } catch {
    return res.status(500).json({ error: "Could not rename library folder" });
  }

  groupsStore.invalidateCache(oldId);
  groupsStore.invalidateCache(newId);

  metadataStore.invalidateCache(oldId);
  metadataStore.invalidateCache(newId);

  invalidateVideoListCache(oldId);
  invalidateVideoListCache(newId);

  res.json({
    id: newId,
    displayName: groupsStore.getGroupConfig(newId).displayName,
  });
});

app.delete("/api/groups/:groupId", (req, res) => {
  const groupId = decodeURIComponent(req.params.groupId);
  if (!listGroupIds().includes(groupId)) {
    return res.status(404).json({ error: "Group not found" });
  }
  if (!isGroupUnlockedForRequest(groupId, req)) {
    return res.status(403).json({ error: "Group is locked", locked: true });
  }

  const files = listVideoFilesCached(groupId);
  if (files.length > 0) {
    return res.status(400).json({ error: "Library must be empty before deleting" });
  }

  try {
    fs.rmdirSync(path.join(videosDir, groupId));
  } catch {
    return res.status(500).json({ error: "Could not delete library folder" });
  }

  invalidateVideoListCache(groupId);

  res.json({ ok: true });
});

app.get("/api/videos", (req, res) => {
  const groupId = req.query.group;
  if (!requireGroup(groupId, req, res)) return;

  metadataStore.invalidateCache(groupId);
  const videos = listVideoFilesCached(groupId).map((file) => buildVideo(groupId, file));
  res.json(videos);
});

function sanitizeUploadName(originalName, mime) {
  let ext = getFileExt(originalName).toLowerCase();
  if (!ext || !MEDIA_RE.test("x" + ext)) ext = extFromMime(mime);
  const base = sanitizeBaseName(stripExt(originalName)) || "media";
  return base + ext;
}

function uniqueVideoFilename(groupId, desiredName) {
  const files = listVideoFilesCached(groupId);
  if (!files.includes(desiredName)) return desiredName;
  const ext = getFileExt(desiredName);
  const base = stripExt(desiredName);
  let n = 2;
  while (files.includes(`${base} (${n})${ext}`)) n++;
  return `${base} (${n})${ext}`;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const groupId = req.query.group;
      const dir = path.join(videosDir, groupId);
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const groupId = req.query.group;
      const safeName = sanitizeUploadName(file.originalname || "media", file.mimetype);
      cb(null, uniqueVideoFilename(groupId, safeName));
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedUpload(file.originalname, file.mimetype)) cb(null, true);
    else cb(new Error("Unsupported file type — use images (GIF, PNG, JPG, HEIC…) or videos (MP4, MOV…). Restart server if this persists."));
  },
});

app.post("/api/videos/upload", (req, res) => {
  const groupId = req.query.group;
  if (!requireGroup(groupId, req, res)) return;

  upload.array("videos", 20)(req, res, (err) => {
    if (err) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "File too large (max 4 GB)" : err.message;
      return res.status(400).json({ error: message });
    }
    if (!req.files?.length) {
      return res.status(400).json({ error: "No media files uploaded" });
    }

    invalidateVideoListCache(groupId);
    const uploaded = req.files.map((file) => buildVideo(groupId, file.filename));
    res.json({ uploaded, count: uploaded.length });
  });
});

app.get("/api/tags", (req, res) => {
  const groupId = req.query.group;
  if (!requireGroup(groupId, req, res)) return;

  metadataStore.invalidateCache(groupId);
  const tagSet = new Set();
  for (const file of listVideoFilesCached(groupId)) {
    const meta = metadataStore.getVideoMeta(groupId, file);
    meta.tags.forEach((tag) => tagSet.add(tag));
  }
  res.json([...tagSet].sort((a, b) => a.localeCompare(b)));
});

app.get("/api/access", (req, res) => {
  res.json(getAccessInfo(PORT));
});

app.put("/api/videos/:filename/metadata", (req, res) => {
  const groupId = req.query.group;
  if (!requireGroup(groupId, req, res)) return;

  const filename = decodeURIComponent(req.params.filename);
  if (!listVideoFilesCached(groupId).includes(filename)) {
    return res.status(404).json({ error: "Video not found" });
  }

  const current = metadataStore.getVideoMeta(groupId, filename);
  const { tags, favorite } = req.body;

  if (tags !== undefined) {
    if (!Array.isArray(tags)) return res.status(400).json({ error: "tags must be an array" });
    current.tags = [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];
  }
  if (favorite !== undefined) current.favorite = !!favorite;

  metadataStore.setVideoMeta(groupId, filename, current);
  res.json(current);
});

app.put("/api/videos/:filename/rename", (req, res) => {
  const groupId = req.query.group;
  if (!requireGroup(groupId, req, res)) return;

  const oldName = decodeURIComponent(req.params.filename);
  const files = listVideoFilesCached(groupId);
  if (!files.includes(oldName)) return res.status(404).json({ error: "Video not found" });

  const baseName = sanitizeBaseName(req.body?.name);
  if (!baseName) return res.status(400).json({ error: "Name cannot be empty" });

  const ext = getFileExt(oldName);
  const newName = baseName + ext;
  const groupDir = path.join(videosDir, groupId);

  if (newName === oldName) {
    return res.json(buildVideo(groupId, oldName));
  }
  if (files.includes(newName)) return res.status(409).json({ error: "A video with that name already exists" });

  try {
    fs.renameSync(path.join(groupDir, oldName), path.join(groupDir, newName));
    invalidateVideoListCache(groupId);
  } catch {
    return res.status(500).json({ error: "Could not rename file" });
  }

  metadataStore.renameVideoMeta(groupId, oldName, newName);

  res.json(buildVideo(groupId, newName));
});

app.delete("/api/videos/:filename", (req, res) => {
  const groupId = req.query.group;
  if (!requireGroup(groupId, req, res)) return;

  const filename = decodeURIComponent(req.params.filename);
  if (!listVideoFilesCached(groupId).includes(filename)) {
    return res.status(404).json({ error: "Video not found" });
  }

  try {
    fs.unlinkSync(path.join(videosDir, groupId, filename));
    invalidateVideoListCache(groupId);
  } catch {
    return res.status(500).json({ error: "Could not delete file" });
  }

  metadataStore.deleteVideoMeta(groupId, filename);

  res.json({ ok: true });
});

function escapeCsvField(value) {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { fields.push(current); current = ""; }
    else current += ch;
  }
  fields.push(current);
  return fields;
}

app.get("/api/metadata/export", (req, res) => {
  const groupId = req.query.group;
  if (!requireGroup(groupId, req, res)) return;

  const lines = ["filename,tags,favorite"];
  for (const file of listVideoFilesCached(groupId)) {
    const meta = metadataStore.getVideoMeta(groupId, file);
    lines.push([escapeCsvField(file), escapeCsvField(meta.tags.join(";")), meta.favorite ? "true" : "false"].join(","));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(groupId)}-tags.csv"`);
  res.send(lines.join("\n"));
});

app.post("/api/metadata/import", (req, res) => {
  const groupId = req.query.group;
  if (!requireGroup(groupId, req, res)) return;

  const csv = req.body?.csv;
  if (typeof csv !== "string" || !csv.trim()) return res.status(400).json({ error: "csv field required" });

  const files = new Set(listVideoFilesCached(groupId));
  const rows = csv.trim().split(/\r?\n/);
  if (rows.length < 2) return res.status(400).json({ error: "CSV must include header and data rows" });

  const header = parseCsvLine(rows[0]).map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf("filename");
  const tagsIdx = header.indexOf("tags");
  const favIdx = header.indexOf("favorite");
  if (nameIdx === -1) return res.status(400).json({ error: "CSV must include filename column" });

  let updated = 0;
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const line = rows[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(line);
    let filename = cols[nameIdx]?.trim();
    if (filename?.includes("/")) filename = filename.split("/").pop();
    if (!filename || !files.has(filename)) { skipped++; continue; }

    const current = metadataStore.getVideoMeta(groupId, filename);
    if (tagsIdx !== -1 && cols[tagsIdx] !== undefined) {
      current.tags = [...new Set(cols[tagsIdx].split(";").map((t) => t.trim()).filter(Boolean))];
    }
    if (favIdx !== -1 && cols[favIdx] !== undefined) {
      const val = cols[favIdx].trim().toLowerCase();
      current.favorite = val === "true" || val === "1" || val === "yes";
    }
    metadataStore.setVideoMeta(groupId, filename, current);
    updated++;
  }

  res.json({ updated, skipped });
});

const groupIds = listGroupIds();
const migratedMeta = metadataStore.migrateFromLegacy(groupIds);
if (migratedMeta.migrated > 0) {
  console.log(`[Rollo] Migrated ${migratedMeta.migrated} tag entries into library _rollo/meta.json files`);
}
const migratedGroups = groupsStore.migrateFromLegacy(groupIds);
if (migratedGroups.migrated > 0) {
  console.log(`[Rollo] Migrated ${migratedGroups.migrated} lock settings into library _rollo/group.json files`);
}

app.listen(PORT, "0.0.0.0", () => {
  if (!process.env.VIDEO_SECRET) {
    console.warn("[Rollo] VIDEO_SECRET is not set — unlock tokens use a local default.");
  }
  console.log(`[Rollo] videos: ${videosDir}`);
  console.log(`[Rollo] data:   ${dataDir}`);
  printAccessInfo(PORT);
});
