const { spawn, execFile } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const { resolveExecutable } = require("./bin-finder");
const {
  getAuthForDownload,
  isConnected: isXConnected,
  hasCookieFile,
  clearSession,
  confirmBrowserSession,
} = require("./x-session");
const {
  BRIDGE_NAME,
  isBridgeReady,
  bridgeInitError,
  runAndroidBridgeOnce,
} = require("./android-downloader");

const execFileAsync = promisify(execFile);

const MAX_HISTORY = 50;
const CONCURRENT_FRAGMENTS = 8;

const QUALITY_PRESETS = {
  fast: { maxHeight: 720, label: "720p Fast" },
  hd: { maxHeight: 1080, label: "1080p" },
  best: { maxHeight: 2160, label: "Best" },
};

function normalizeQuality(quality) {
  return QUALITY_PRESETS[quality] ? quality : "fast";
}

function isTwitterUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    return host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com";
  } catch {
    return false;
  }
}

function buildFormatSelector(maxHeight, url) {
  if (isTwitterUrl(url)) {
    return "bv*+ba/b";
  }
  if (maxHeight >= 2160) {
    return "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b";
  }
  return [
    `b[ext=mp4][height<=${maxHeight}]`,
    `b[height<=${maxHeight}]`,
    `bv*[height<=${maxHeight}][ext=mp4]+ba[ext=m4a]`,
    `bv*[height<=${maxHeight}]+ba`,
    "b",
  ].join("/");
}

function hasXAuth(xAuth) {
  return !!(
    (xAuth?.cookiesFile && fs.existsSync(xAuth.cookiesFile)) ||
    xAuth?.browser
  );
}

function buildYtdlpArgs({
  url,
  outputDir,
  quality = "fast",
  xAuth,
  ffmpegDir,
  relaxed = false,
  twitterSyndication = true,
  playlist = false,
}) {
  const preset = QUALITY_PRESETS[normalizeQuality(quality)];
  const outTemplate = path.join(outputDir, "%(title).200B [%(id)s].%(ext)s");
  const args = [];

  if (xAuth?.cookiesFile && fs.existsSync(xAuth.cookiesFile)) {
    args.push("--cookies", xAuth.cookiesFile);
  } else if (xAuth?.browser) {
    args.push("--cookies-from-browser", xAuth.browser);
  }
  if (ffmpegDir) {
    args.push("--ffmpeg-location", ffmpegDir);
  }
  if (isTwitterUrl(url) && twitterSyndication && !hasXAuth(xAuth) && !relaxed) {
    args.push("--extractor-args", "twitter:api=syndication");
  }

  const format = relaxed ? "b/bv*+ba/b" : buildFormatSelector(preset.maxHeight, url);
  args.push("-f", format);
  if (!relaxed && !isTwitterUrl(url)) {
    args.push("-S", `res:${preset.maxHeight}`);
  }

  args.push(
    "--merge-output-format",
    "mp4",
    "--concurrent-fragments",
    String(CONCURRENT_FRAGMENTS),
    "--buffer-size",
    "64K",
    "--http-chunk-size",
    "10M",
    "-o",
    outTemplate,
    "--newline",
    "--no-mtime",
    "--no-embed-metadata",
    "--retries",
    "5",
    "--fragment-retries",
    "5",
    url
  );
  if (!playlist) args.splice(args.indexOf("--newline"), 0, "--no-playlist");

  return args;
}

function uniqueArgLists(lists) {
  const seen = new Set();
  const out = [];
  for (const args of lists) {
    const key = JSON.stringify(args);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(args);
  }
  return out;
}

function buildDownloadAttempts({ url, outputDir, quality, xAuth, ffmpegDir, playlist = false }) {
  const signedIn = hasXAuth(xAuth);
  const attempts = [];

  if (isTwitterUrl(url)) {
    // Signed-in X accounts must use the authenticated API (syndication cannot see NSFW).
    attempts.push(
      buildYtdlpArgs({
        url,
        outputDir,
        quality,
        xAuth,
        ffmpegDir,
        twitterSyndication: !signedIn,
        playlist,
      })
    );
    if (signedIn) {
      attempts.push(
        buildYtdlpArgs({
          url,
          outputDir,
          quality,
          xAuth,
          ffmpegDir,
          twitterSyndication: false,
          playlist,
        })
      );
    } else {
      attempts.push(
        buildYtdlpArgs({
          url,
          outputDir,
          quality,
          xAuth,
          ffmpegDir,
          twitterSyndication: false,
          playlist,
        })
      );
    }
  } else {
    attempts.push(buildYtdlpArgs({ url, outputDir, quality, xAuth, ffmpegDir, playlist }));
  }

  attempts.push(
    buildYtdlpArgs({
      url,
      outputDir,
      quality,
      xAuth,
      ffmpegDir,
      relaxed: true,
      twitterSyndication: !signedIn,
      playlist,
    })
  );
  if (isTwitterUrl(url) && signedIn) {
    attempts.push(
      buildYtdlpArgs({
        url,
        outputDir,
        quality,
        xAuth,
        ffmpegDir,
        relaxed: true,
        twitterSyndication: false,
        playlist,
      })
    );
  }

  return uniqueArgLists(attempts);
}

function buildYtdlpRetryArgs(baseArgs, url, xAuth) {
  if (!isTwitterUrl(url) || !xAuth) return null;
  const hasCookies =
    (xAuth.cookiesFile && fs.existsSync(xAuth.cookiesFile)) || xAuth.browser;
  if (!hasCookies) return null;

  const args = baseArgs.filter(
    (arg, i) => !(arg === "twitter:api=syndication" && baseArgs[i - 1] === "--extractor-args")
  );
  return args;
}

function isNsfwRelated(text) {
  return /nsfw|sensitive content|age.?restrict|adult content|content warning|marked as sensitive|confirm your age|sensitive media/i.test(
    text
  );
}

function polishYtdlpMessage(msg, log = "") {
  let text = String(msg || "").trim();
  text = text.replace(/^ERROR:\s*/i, "").replace(/^WARNING:\s*/i, "");
  text = text.replace(/^\[[^\]]+\]\s*[\w-]+:\s*/, "");
  if (isNsfwRelated(text) || isNsfwRelated(log)) {
    return (
      "This post is age-restricted or marked sensitive on X. " +
      "Sign in with an X account that can view NSFW content, then try again."
    );
  }
  if (/no video could be found/i.test(text)) {
    text +=
      ". This post may be photo-only, NSFW, or private. Tap Sign in to X on the Download tab.";
  }
  if (/login|cookies/i.test(text) && !/sign in to x/i.test(text)) {
    text += " Tap Sign in to X on the Download tab.";
  }
  return text;
}

function extractYtdlpError(log, code) {
  const lines = log.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errors = lines.filter((l) => /^ERROR:/i.test(l));
  if (errors.length) {
    return polishYtdlpMessage(errors[errors.length - 1], log);
  }

  const informative = lines.find((l) =>
    /requested format|no video formats|format is not available|unable to download|this video is unavailable|private video|sign in|confirm your age|cookies|nsfw|sensitive/i.test(
      l
    )
  );
  if (informative) return polishYtdlpMessage(informative, log);

  const warnings = lines.filter((l) => /^WARNING:/i.test(l));
  if (warnings.length) {
    return polishYtdlpMessage(warnings[warnings.length - 1], log);
  }

  if (code === 2 && /\[twitter\]|x\.com|twitter\.com/i.test(log)) {
    return polishYtdlpMessage(
      "Could not download this X post. It may be NSFW/sensitive, deleted, or blocked for your X login.",
      log
    );
  }

  const tail = lines.slice(-5).join(" ");
  if (tail) return `${polishYtdlpMessage(tail, log)} (exit ${code})`;
  return `yt-dlp exited with code ${code}`;
}

function isValidDownloadUrl(url) {
  try {
    const parsed = new URL(String(url).trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parseProgressLine(line) {
  const pct = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
  if (pct) return { progress: parseFloat(pct[1]) };

  if (/\[Merger\]|Merging formats|ExtractAudio|Post-process/.test(line)) {
    return { status: "processing", progress: 99 };
  }

  const dest = line.match(/\[download\]\s+Destination:\s+(.+)/);
  if (dest) return { filename: path.basename(dest[1].trim()) };

  const already = line.match(/\[download\]\s+(.+)\s+has already been downloaded/);
  if (already) return { filename: path.basename(already[1].trim()) };

  const info = line.match(/\[info\]\s+(.+?):\s+Downloading/);
  if (info) return { title: info[1].trim() };

  return null;
}

function listMediaInDir(dir) {
  const { MEDIA_RE } = require("./media");
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => MEDIA_RE.test(name))
      .map((name) => ({
        name,
        mtime: fs.statSync(path.join(dir, name)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

function createDownloader({ onComplete, dataDir } = {}) {
  const jobs = new Map();
  const jobOrder = [];
  let ytdlpCommand = null;
  let ffmpegCommand = null;
  let availabilityChecked = false;
  let activeJobId = null;
  const queue = [];

  async function findYtdlp() {
    if (process.platform === "android" && process.env.DATA_DIR) {
      const bundled = path.join(process.env.DATA_DIR, "bin", "yt-dlp");
      if (fs.existsSync(bundled)) {
        try {
          await execFileAsync(bundled, ["--version"], { timeout: 8000 });
          return bundled;
        } catch {
          /* fall through */
        }
      }
    }
    const names = process.platform === "win32" ? ["yt-dlp", "yt-dlp.exe"] : ["yt-dlp"];
    return resolveExecutable("yt-dlp.exe", names);
  }

  async function findFfmpeg() {
    const names = process.platform === "win32" ? ["ffmpeg", "ffmpeg.exe"] : ["ffmpeg"];
    return resolveExecutable("ffmpeg.exe", names);
  }

  function ffmpegDir() {
    return ffmpegCommand ? path.dirname(ffmpegCommand) : null;
  }

  async function checkAvailability(force = false) {
    if (force) availabilityChecked = false;
    if (!availabilityChecked) {
      if (process.platform === "android" && dataDir && isBridgeReady(dataDir)) {
        ytdlpCommand = BRIDGE_NAME;
        ffmpegCommand = BRIDGE_NAME;
      } else {
        ytdlpCommand = await findYtdlp();
        ffmpegCommand = await findFfmpeg();
      }
      availabilityChecked = true;
    }
    return !!ytdlpCommand;
  }

  function usesAndroidBridge() {
    return ytdlpCommand === BRIDGE_NAME;
  }

  function isAndroidServer() {
    return process.platform === "android";
  }

  function getInstallHint() {
    if (isAndroidServer()) {
      const bridgeErr = dataDir ? bridgeInitError(dataDir) : null;
      if (bridgeErr) {
        return `Android downloader failed to start: ${bridgeErr}. Rebuild the Rollo APK with the latest update.`;
      }
      return "Android downloader is starting… wait a few seconds and pull to refresh. If this persists, rebuild the app from the latest GitHub release.";
    }
    if (process.platform === "win32") {
      return "yt-dlp is not installed on this server. On your PC run: winget install yt-dlp, then restart Rollo.";
    }
    return "yt-dlp is not installed on this server. Install it (e.g. pip install yt-dlp), then restart Rollo.";
  }

  function getFfmpegHint() {
    if (isAndroidServer()) return null;
    if (process.platform === "win32") {
      return "ffmpeg not found. Install with winget install Gyan.FFmpeg, then restart Rollo.";
    }
    return "ffmpeg not found. Install ffmpeg on this server, then restart Rollo.";
  }

  function getInfo() {
    const tips = [];
    const xConnected = dataDir ? isXConnected(dataDir) : false;
    const ffmpegHint = ytdlpCommand && !ffmpegCommand ? getFfmpegHint() : null;
    if (ffmpegHint) tips.push(ffmpegHint);
    if (!xConnected) {
      tips.push("Sign in to X from the Download tab before pasting X / Twitter links");
    }
    const auth = dataDir ? getAuthForDownload(dataDir) : null;
    return {
      available: !!ytdlpCommand,
      command: ytdlpCommand || null,
      ffmpeg: !!ffmpegCommand,
      ffmpegPath: ffmpegCommand || null,
      platform: process.platform,
      androidServer: isAndroidServer(),
      androidBridge: usesAndroidBridge(),
      installHint: getInstallHint(),
      ffmpegHint,
      xConnected,
      cookies: xConnected,
      xMode: auth?.browser ? "browser" : auth?.cookiesFile ? "file" : null,
      xBrowser: auth?.browser || null,
      concurrentFragments: CONCURRENT_FRAGMENTS,
      defaultQuality: "fast",
      tips,
    };
  }

  async function confirmXSession() {
    await checkAvailability(true);
    if (!dataDir) return { ok: false, error: "Server data folder unavailable" };
    if (hasCookieFile(dataDir)) {
      return { ok: true, mode: "file" };
    }
    return confirmBrowserSession(dataDir, ytdlpCommand);
  }

  function clearXSession() {
    if (dataDir) clearSession(dataDir);
  }

  function touchJob(job) {
    job.updatedAt = Date.now();
  }

  function rememberJob(job) {
    jobs.set(job.id, job);
    const idx = jobOrder.indexOf(job.id);
    if (idx !== -1) jobOrder.splice(idx, 1);
    jobOrder.unshift(job.id);
    while (jobOrder.length > MAX_HISTORY) {
      const oldId = jobOrder.pop();
      if (oldId !== activeJobId) jobs.delete(oldId);
      else jobOrder.unshift(oldId);
      if (jobOrder.length > MAX_HISTORY) break;
    }
  }

  function publicJob(job) {
    return {
      id: job.id,
      url: job.url,
      groupId: job.groupId,
      status: job.status,
      progress: job.progress,
      title: job.title,
      filename: job.filename,
      quality: job.quality,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  function getJob(id) {
    const job = jobs.get(id);
    return job ? publicJob(job) : null;
  }

  function listJobs(limit = 20) {
    return jobOrder
      .slice(0, limit)
      .map((id) => jobs.get(id))
      .filter(Boolean)
      .map(publicJob);
  }

  function getQueueState() {
    const active = activeJobId ? jobs.get(activeJobId) : null;
    return {
      activeId: activeJobId,
      active: active ? publicJob(active) : null,
      queued: queue.map(publicJob),
    };
  }

  function cancelQueuedJob(id) {
    if (activeJobId === id) {
      return { ok: false, error: "Cannot cancel the active download" };
    }
    const idx = queue.findIndex((j) => j.id === id);
    if (idx < 0) return { ok: false, error: "Job not found in queue" };
    const job = queue.splice(idx, 1)[0];
    job.status = "cancelled";
    job.error = null;
    touchJob(job);
    return { ok: true, job: publicJob(job) };
  }

  async function retryJob(id) {
    const old = jobs.get(id);
    if (!old) return null;
    if (old.status !== "failed" && old.status !== "cancelled") {
      throw new Error("Only failed or cancelled jobs can be retried");
    }
    return startDownload({
      url: old.url,
      groupId: old.groupId,
      outputDir: old.outputDir,
      quality: old.quality,
      playlist: old.playlist,
    });
  }

  function applyLine(job, line) {
    const parsed = parseProgressLine(line);
    if (!parsed) return;
    if (parsed.progress != null) {
      job.progress = parsed.progress;
      if (job.status === "queued") job.status = "downloading";
    }
    if (parsed.status) job.status = parsed.status;
    if (parsed.filename) job.filename = parsed.filename;
    if (parsed.title) job.title = parsed.title;
    touchJob(job);
  }

  function runYtdlpOnce(job, outputDir, args) {
    if (usesAndroidBridge()) {
      const xAuth = dataDir ? getAuthForDownload(dataDir) : null;
      return runAndroidBridgeOnce(job, outputDir, {
        dataDir,
        cookiesFile: xAuth?.cookiesFile || "",
      }).then((code) => {
        if (code === 0) {
          if (!job.filename) {
            const after = listMediaInDir(outputDir);
            if (after[0]) job.filename = after[0].name;
          }
          job.status = "completed";
          job.progress = 100;
          job.error = null;
          touchJob(job);
          if (job.filename && typeof onComplete === "function") {
            onComplete(job.groupId, job.filename);
          }
        }
        return code;
      });
    }

    return new Promise((resolve) => {
      const before = new Set(listMediaInDir(outputDir).map((f) => f.name));
      let lineBuffer = "";
      job.lastLog = "";

      const proc = spawn(ytdlpCommand, args, { windowsHide: true });

      const onData = (chunk) => {
        const text = chunk.toString();
        job.lastLog += text;
        lineBuffer += text;
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop() || "";
        for (const line of lines) applyLine(job, line);
      };

      proc.stdout.on("data", onData);
      proc.stderr.on("data", onData);

      proc.on("error", (err) => {
        job.status = "failed";
        job.error = err.message || String(err);
        touchJob(job);
        resolve(-1);
      });

      proc.on("close", (code) => {
        if (lineBuffer) applyLine(job, lineBuffer);

        if (code === 0) {
          if (!job.filename) {
            const after = listMediaInDir(outputDir);
            const fresh = after.find((f) => !before.has(f.name));
            if (fresh) job.filename = fresh.name;
            else if (after[0]) job.filename = after[0].name;
          }
          job.status = "completed";
          job.progress = 100;
          job.error = null;
          touchJob(job);
          if (job.filename && typeof onComplete === "function") {
            onComplete(job.groupId, job.filename);
          }
          resolve(0);
          return;
        }

        job.error = extractYtdlpError(job.lastLog, code);
        touchJob(job);
        resolve(code ?? 1);
      });
    });
  }

  async function runJob(job, outputDir) {
    const xAuth = dataDir ? getAuthForDownload(dataDir) : null;

    if (usesAndroidBridge()) {
      job.status = "downloading";
      job.progress = 0;
      job.error = null;
      touchJob(job);
      const code = await runYtdlpOnce(job, outputDir, []);
      if (code !== 0 && job.status !== "completed") {
        job.status = "failed";
        job.error = job.error || "Download failed";
        touchJob(job);
      }
      return;
    }

    const attempts = buildDownloadAttempts({
      url: job.url,
      outputDir,
      quality: job.quality,
      xAuth,
      ffmpegDir: ffmpegDir(),
      playlist: !!job.playlist,
    });

    job.status = "downloading";
    job.progress = 0;
    job.error = null;
    job.lastLog = "";
    touchJob(job);

    let code = 1;
    for (let i = 0; i < attempts.length; i++) {
      if (i > 0) {
        job.status = "downloading";
        job.progress = 0;
        job.error = null;
        job.lastLog = "";
        touchJob(job);
      }
      code = await runYtdlpOnce(job, outputDir, attempts[i]);
      if (code === 0) return;
    }

    job.status = "failed";
    job.error = extractYtdlpError(job.lastLog || "", code);
    touchJob(job);
  }

  async function pumpQueue() {
    if (activeJobId || !queue.length) return;
    const job = queue.shift();
    activeJobId = job.id;
    try {
      await runJob(job, job.outputDir);
    } finally {
      activeJobId = null;
      pumpQueue();
    }
  }

  async function startDownload({ url, groupId, outputDir, quality = "fast", playlist = false }) {
    const trimmed = String(url || "").trim();
    if (!isValidDownloadUrl(trimmed)) {
      throw new Error("Enter a valid http or https link");
    }
    if (!groupId) throw new Error("groupId required");
    if (!outputDir) throw new Error("outputDir required");

    const available = await checkAvailability();
    if (!available) {
      throw new Error(getInstallHint());
    }

    if (isTwitterUrl(trimmed) && dataDir && !isXConnected(dataDir)) {
      const err = new Error("Sign in to X before downloading X / Twitter links");
      err.code = "X_SIGN_IN_REQUIRED";
      throw err;
    }

    fs.mkdirSync(outputDir, { recursive: true });

    const job = {
      id: crypto.randomUUID(),
      url: trimmed,
      groupId,
      outputDir,
      quality: normalizeQuality(quality),
      playlist: !!playlist,
      status: "queued",
      progress: 0,
      title: null,
      filename: null,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    rememberJob(job);
    queue.push(job);
    pumpQueue();
    return publicJob(job);
  }

  return {
    isValidDownloadUrl,
    checkAvailability,
    getInfo,
    confirmXSession,
    clearXSession,
    startDownload,
    getJob,
    listJobs,
    getQueueState,
    cancelQueuedJob,
    retryJob,
  };
}

module.exports = {
  createDownloader,
  isValidDownloadUrl,
  isTwitterUrl,
  parseProgressLine,
  buildYtdlpArgs,
  buildYtdlpRetryArgs,
  buildDownloadAttempts,
  extractYtdlpError,
  polishYtdlpMessage,
  normalizeQuality,
  QUALITY_PRESETS,
};
