const express = require("express");
const fs = require("fs");
const os = require("os");
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
const { createDownloader } = require("./lib/downloader");
const { scanAllSyncHints, isLibraryDeletable } = require("./lib/sync-hints");
const { mergeAllConflicts } = require("./lib/conflict-merge");
const { resolveVideoSecret, assertProductionSecret } = require("./lib/video-secret");
const { createBasicAuthMiddleware } = require("./lib/basic-auth");
const { createThumbService, thumbPath } = require("./lib/thumbs");

resolveVideoSecret(dataDir);
try {
  assertProductionSecret(dataDir);
} catch (err) {
  console.error(`[Rollo] ${err.message}`);
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT) || 3847;

const statusHits = new Map();
function rateLimitStatus(ip) {
  const now = Date.now();
  const bucket = statusHits.get(ip) || [];
  const recent = bucket.filter((t) => now - t < 60000);
  recent.push(now);
  statusHits.set(ip, recent);
  return recent.length <= 120;
}

const basicAuth = createBasicAuthMiddleware();

app.use((req, res, next) => {
  if (req.path === "/api/status") return next();
  return basicAuth(req, res, next);
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h", etag: true }));

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const groupsPath = process.env.GROUPS_PATH || path.join(dataDir, "groups.json");
const metadataStore = createMetadataStore(videosDir, metadataPath);
const groupsStore = createGroupsStore(videosDir, groupsPath);
const groupAuth = createGroupAuth(groupsStore);
const { makeUnlockToken, isGroupUnlocked, isGroupLocked } = groupAuth;

const downloader = createDownloader({
  onComplete(groupId, filename) {
    invalidateVideoListCache(groupId);
    if (filename) {
      downloader.checkAvailability().then(() => {
        thumbService.ensureThumb(groupId, filename).catch(() => {});
      });
    }
  },
  dataDir,
});

const thumbService = createThumbService(videosDir, () => {
  const info = downloader.getInfo?.();
  return info?.ffmpegPath || null;
});

const videoListCache = new Map();

function listVideoFilesCached(groupId) {
  const dir = path.join(videosDir, groupId);
  if (!fs.existsSync(dir)) return [];
  try {
    const mtime = fs.statSync(dir).mtimeMs;
    const cached = videoListCache.get(groupId);
    if (cached && cached.mtime === mtime) return cached.files;
    const files = listVideoFiles(groupId);
    videoListCache.set(groupId, { mtime, files });
    return files;
  } catch (err) {
    console.warn(`[Rollo] Cannot scan library “${groupId}”:`, err.message || err);
    return [];
  }
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

function parseLibraryIdsEnv() {
  const raw = process.env.LIBRARY_IDS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id) : [];
  } catch {
    return [];
  }
}

function sortGroupIds(ids) {
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function listGroupIdsFromDisk() {
  ensureDir(videosDir);
  return fs
    .readdirSync(videosDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "_rollo")
    .map((d) => d.name);
}

function listGroupIds() {
  let fromDisk = [];
  let diskError = null;
  try {
    fromDisk = listGroupIdsFromDisk();
  } catch (err) {
    diskError = err;
    console.error("[Rollo] Cannot read videos folder:", videosDir, err.message || err);
  }

  if (fromDisk.length) return sortGroupIds(fromDisk);

  const fromEnv = parseLibraryIdsEnv();
  if (fromEnv.length) {
    console.warn(
      `[Rollo] Disk listing empty; using ${fromEnv.length} librar${fromEnv.length === 1 ? "y" : "ies"} from LIBRARY_IDS`
    );
    return sortGroupIds(fromEnv);
  }

  if (diskError) throw diskError;
  return [];
}

function diagnoseVideosLayout() {
  const ids = listGroupIds();
  const hints = [];
  if (!ids.length) {
    hints.push("No library folders found. Each library should be a subfolder of the videos directory.");
    return hints;
  }
  for (const id of ids) {
    const dir = path.join(videosDir, id);
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      hints.push(`Cannot read library folder “${id}”.`);
      continue;
    }
    const mediaHere = entries.filter((name) => MEDIA_RE.test(name)).length;
    const subdirs = entries.filter((name) => {
      if (name === "_rollo") return false;
      try {
        return fs.statSync(path.join(dir, name)).isDirectory() && !name.startsWith(".");
      } catch {
        return false;
      }
    });
    const nestedLibraries = subdirs.filter((sub) => {
      try {
        return fs
          .readdirSync(path.join(dir, sub))
          .some((name) => MEDIA_RE.test(name));
      } catch {
        return false;
      }
    });
    if (!mediaHere && nestedLibraries.length) {
      hints.push(
        `“${id}/${nestedLibraries[0]}” contains media but “${id}” is not a library itself. ` +
          `Move each library folder up so files live in videos/${nestedLibraries[0]}/, not videos/${id}/${nestedLibraries[0]}/.`
      );
    }
  }
  return hints;
}

function listVideoFiles(groupId) {
  const dir = path.join(videosDir, groupId);
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((file) => MEDIA_RE.test(file))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  } catch (err) {
    console.warn(`[Rollo] Cannot list media in ${dir}:`, err.message || err);
    return [];
  }
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
  if (Array.isArray(groupId)) groupId = groupId[0];
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

app.get("/api/status", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!rateLimitStatus(ip)) {
    return res.status(429).json({ error: "Too many requests" });
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  let ids = [];
  let readError = null;
  try {
    ids = listGroupIds();
  } catch (err) {
    readError = err.message || String(err);
  }
  const counts = {};
  for (const id of ids) {
    try {
      counts[id] = listVideoFilesCached(id).length;
    } catch {
      counts[id] = 0;
    }
  }
  let sync = { conflictCount: 0, conflicts: [], syncthingLibraries: [] };
  try {
    sync = scanAllSyncHints(videosDir, ids);
  } catch {
    /* ignore */
  }

  let shellVersion = null;
  try {
    const sw = fs.readFileSync(path.join(appRoot, "public", "sw.js"), "utf8");
    const m = sw.match(/const CACHE = "([^"]+)"/);
    shellVersion = m ? m[1] : null;
  } catch {
    /* ignore */
  }

  res.json({
    hostname: os.hostname(),
    videosDir,
    dataDir,
    libraries: ids,
    libraryCount: ids.length,
    videoCounts: counts,
    hints: diagnoseVideosLayout(),
    readError,
    network: getAccessInfo(PORT),
    sync,
    shellVersion,
    appVersion: require("./package.json").version,
  });
});

app.options("/api/status", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.sendStatus(204);
});

app.get("/api/groups", (req, res) => {
  try {
    const ids = listGroupIds();
    ids.forEach((id) => groupsStore.invalidateCache(id));
    const groups = ids.map((id) => {
      try {
        const config = groupsStore.getGroupConfig(id);
        const locked = !!config.passwordHash;
        return {
          id,
          name: id,
          displayName: config.displayName || id,
          locked,
          lockMode: locked ? config.lockMode : null,
          unlocked: isGroupUnlockedForRequest(id, req),
          videoCount: listVideoFilesCached(id).length,
        };
      } catch (err) {
        console.error(`[Rollo] Could not load library “${id}”:`, err);
        return {
          id,
          name: id,
          displayName: id,
          locked: false,
          lockMode: null,
          unlocked: true,
          videoCount: 0,
          error: err.message || String(err),
        };
      }
    });
    res.json(groups);
  } catch (err) {
    console.error("[Rollo] /api/groups failed:", err);
    res.status(500).json({ error: `Cannot read videos folder: ${err.message || err}` });
  }
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

app.post("/api/groups/:groupId/revoke-sessions", (req, res) => {
  const groupId = decodeURIComponent(req.params.groupId);
  if (!listGroupIds().includes(groupId)) {
    return res.status(404).json({ error: "Group not found" });
  }
  if (!isGroupUnlockedForRequest(groupId, req)) {
    return res.status(403).json({ error: "Group is locked", locked: true });
  }
  const raw = groupsStore.getGroupConfig(groupId);
  groupsStore.revokeAllUnlocks(groupId);
  res.json({ ok: true, passwordVersion: (raw.passwordVersion || 0) + 1 });
});

app.post("/api/sync/merge-conflicts", (req, res) => {
  try {
    const ids = listGroupIds();
    metadataStore.invalidateCache();
    const result = mergeAllConflicts(videosDir, ids);
    ids.forEach((id) => metadataStore.invalidateCache(id));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "Could not merge conflicts" });
  }
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

  const deletable = isLibraryDeletable(videosDir, groupId, MEDIA_RE);
  if (!deletable.ok) {
    return res.status(400).json({ error: deletable.reason || "Library must be empty before deleting" });
  }

  try {
    fs.rmSync(path.join(videosDir, groupId), { recursive: true, force: true });
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
  let videos = listVideoFilesCached(groupId).map((file) => buildVideo(groupId, file));
  const q = String(req.query.q || "").trim().toLowerCase();
  if (q) {
    videos = videos.filter((v) => {
      const hay = [
        v.name,
        v.displayName || "",
        ...(v.tags || []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }
  res.json(videos);
});

app.get("/api/videos/:filename/thumb", async (req, res) => {
  const groupId = req.query.group;
  if (!requireGroup(groupId, req, res)) return;

  const filename = decodeURIComponent(req.params.filename);
  if (!listVideoFilesCached(groupId).includes(filename)) {
    return res.status(404).end();
  }

  const existing = thumbPath(videosDir, groupId, filename);
  if (thumbService.thumbExists(groupId, filename)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.sendFile(existing);
  }

  try {
    await downloader.checkAvailability();
    const thumb = await thumbService.ensureThumb(groupId, filename);
    if (!thumb) return res.status(404).end();
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(thumb);
  } catch {
    res.status(500).end();
  }
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

app.get("/api/downloader/status", async (_req, res) => {
  await downloader.checkAvailability(true);
  res.json(downloader.getInfo());
});

app.post("/api/download", async (req, res) => {
  const groupId = req.query.group || req.body?.groupId;
  if (!requireGroup(groupId, req, res)) return;

  const url = req.body?.url;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url required" });
  }

  try {
    const outputDir = path.join(videosDir, groupId);
    const quality = req.body?.quality;
    const playlist = !!req.body?.playlist;
    const job = await downloader.startDownload({ url, groupId, outputDir, quality, playlist });
    res.status(202).json(job);
  } catch (err) {
    if (err.code === "X_SIGN_IN_REQUIRED") {
      return res.status(401).json({ error: err.message, code: err.code });
    }
    res.status(400).json({ error: err.message || "Download failed to start" });
  }
});

app.get("/api/download/:jobId", (req, res) => {
  const job = downloader.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Download job not found" });
  res.json(job);
});

app.get("/api/download/:jobId/stream", (req, res) => {
  const jobId = req.params.jobId;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = () => {
    const job = downloader.getJob(jobId);
    if (!job) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "not found" })}\n\n`);
      clearInterval(timer);
      return res.end();
    }
    res.write(`data: ${JSON.stringify(job)}\n\n`);
    if (["completed", "failed", "cancelled"].includes(job.status)) {
      clearInterval(timer);
      res.end();
    }
  };

  send();
  const timer = setInterval(send, 500);
  req.on("close", () => clearInterval(timer));
});

app.get("/api/downloads", (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const jobs = downloader.listJobs(limit).map((job) => {
    if (job.status === "completed" && job.groupId && job.filename) {
      const meta = metadataStore.getVideoMeta(job.groupId, job.filename);
      return { ...job, tags: meta.tags || [] };
    }
    return job;
  });
  res.json(jobs);
});

app.post("/api/thumbs/warmup", async (req, res) => {
  const groupId = req.query.group;
  if (!requireGroup(groupId, req, res)) return;
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const files = listVideoFilesCached(groupId).slice(0, limit);
  let warmed = 0;
  try {
    await downloader.checkAvailability();
    for (const file of files) {
      if (await thumbService.ensureThumb(groupId, file)) warmed++;
    }
    res.json({ warmed, total: files.length });
  } catch (err) {
    res.status(500).json({ error: err.message || "Warmup failed" });
  }
});

app.get("/api/downloader/queue", (_req, res) => {
  res.json(downloader.getQueueState());
});

app.delete("/api/download/:jobId", (req, res) => {
  const result = downloader.cancelQueuedJob(req.params.jobId);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result);
});

app.post("/api/download/:jobId/retry", async (req, res) => {
  try {
    const job = await downloader.retryJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Download job not found" });
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message || "Could not retry download" });
  }
});

app.delete("/api/downloader/x-session", (_req, res) => {
  try {
    downloader.clearXSession();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Could not clear X session" });
  }
});

app.post("/api/downloader/x-session/confirm", async (_req, res) => {
  try {
    const result = await downloader.confirmXSession();
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "Could not confirm X session" });
  }
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

app.post("/api/videos/:filename/move", (req, res) => {
  const groupId = req.query.group;
  if (!requireGroup(groupId, req, res)) return;

  const targetGroup = String(req.body?.targetGroup || "").trim();
  if (!targetGroup) return res.status(400).json({ error: "targetGroup required" });
  if (!listGroupIds().includes(targetGroup)) {
    return res.status(404).json({ error: "Target library not found" });
  }
  if (targetGroup === groupId) {
    return res.status(400).json({ error: "Video is already in this library" });
  }

  const filename = decodeURIComponent(req.params.filename);
  if (!listVideoFilesCached(groupId).includes(filename)) {
    return res.status(404).json({ error: "Video not found" });
  }

  const targetFiles = listVideoFilesCached(targetGroup);
  let destName = filename;
  if (targetFiles.includes(destName)) {
    const ext = getFileExt(filename);
    const base = stripExt(filename);
    let n = 1;
    while (targetFiles.includes(`${base} (${n})${ext}`)) n += 1;
    destName = `${base} (${n})${ext}`;
  }

  try {
    fs.renameSync(
      path.join(videosDir, groupId, filename),
      path.join(videosDir, targetGroup, destName)
    );
    invalidateVideoListCache(groupId);
    invalidateVideoListCache(targetGroup);
  } catch {
    return res.status(500).json({ error: "Could not move file" });
  }

  metadataStore.moveVideoMeta(groupId, targetGroup, filename, destName);
  thumbService.moveThumb(groupId, targetGroup, filename, destName);

  res.json(buildVideo(targetGroup, destName));
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
  thumbService.deleteThumb(groupId, filename);

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

let groupIds = [];
try {
  groupIds = listGroupIds();
} catch (err) {
  console.error("[Rollo] Startup library scan failed:", err.message || err);
}
const migratedMeta = metadataStore.migrateFromLegacy(groupIds);
if (migratedMeta.migrated > 0) {
  console.log(`[Rollo] Migrated ${migratedMeta.migrated} tag entries into library _rollo/meta.json files`);
}
const migratedGroups = groupsStore.migrateFromLegacy(groupIds);
if (migratedGroups.migrated > 0) {
  console.log(`[Rollo] Migrated ${migratedGroups.migrated} lock settings into library _rollo/group.json files`);
}

app.listen(PORT, "0.0.0.0", async () => {
  if (!process.env.VIDEO_SECRET) {
    console.log("[Rollo] VIDEO_SECRET auto-generated and saved to data folder.");
  } else {
    console.log("[Rollo] VIDEO_SECRET loaded from environment.");
  }
  if (process.env.ROLLO_BASIC_USER) {
    console.log("[Rollo] HTTP basic auth enabled for non-status routes.");
  }
  const ytdlpOk = await downloader.checkAvailability();
  const ytdlpInfo = downloader.getInfo();
  if (ytdlpOk) {
    console.log(`[Rollo] downloader: yt-dlp ready (${ytdlpInfo.command})`);
  } else {
    console.warn("[Rollo] downloader: yt-dlp not found — install with: winget install yt-dlp");
  }
  console.log(`[Rollo] videos: ${videosDir}`);
  console.log(`[Rollo] data:   ${dataDir}`);
  if (groupIds.length) {
    const summary = groupIds
      .map((id) => `${id} (${listVideoFilesCached(id).length})`)
      .join(", ");
    console.log(`[Rollo] libraries: ${summary}`);
  } else {
    console.warn("[Rollo] No libraries found — check VIDEOS_DIR and folder layout.");
    for (const hint of diagnoseVideosLayout()) console.warn(`[Rollo] ${hint}`);
  }
  printAccessInfo(PORT);
});
