const fs = require("fs");
const path = require("path");

const BRIDGE_NAME = "android-bridge";
const POLL_MS = 400;
const TIMEOUT_MS = 2 * 60 * 60 * 1000;

function bridgeDir(dataDir) {
  return path.join(dataDir, "android-downloader");
}

function isBridgeReady(dataDir) {
  if (!dataDir) return false;
  return fs.existsSync(path.join(bridgeDir(dataDir), "ready"));
}

function bridgeInitError(dataDir) {
  if (!dataDir) return null;
  const errFile = path.join(bridgeDir(dataDir), "init-error");
  if (!fs.existsSync(errFile)) return null;
  try {
    return fs.readFileSync(errFile, "utf8").trim() || "Android downloader failed to start";
  } catch {
    return "Android downloader failed to start";
  }
}

function ensureDirs(dataDir) {
  const root = bridgeDir(dataDir);
  fs.mkdirSync(path.join(root, "requests"), { recursive: true });
  fs.mkdirSync(path.join(root, "jobs"), { recursive: true });
  return root;
}

function readJobState(jobPath) {
  try {
    return JSON.parse(fs.readFileSync(jobPath, "utf8"));
  } catch {
    return null;
  }
}

function mapBridgeStatus(status) {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "downloading") return "downloading";
  return "queued";
}

function runAndroidBridgeOnce(job, outputDir, { dataDir, cookiesFile }) {
  const root = ensureDirs(dataDir);
  const reqPath = path.join(root, "requests", `request-${job.id}.json`);
  const jobPath = path.join(root, "jobs", `${job.id}.json`);

  fs.writeFileSync(
    jobPath,
    JSON.stringify({
      id: job.id,
      status: "queued",
      progress: 0,
      title: null,
      filename: null,
      error: null,
    })
  );

  fs.writeFileSync(
    reqPath,
    JSON.stringify({
      id: job.id,
      url: job.url,
      outputDir,
      quality: job.quality || "fast",
      cookiesFile: cookiesFile || "",
    })
  );

  const started = Date.now();

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (Date.now() - started > TIMEOUT_MS) {
        clearInterval(timer);
        job.status = "failed";
        job.error = "Download timed out";
        resolve(1);
        return;
      }

      const state = readJobState(jobPath);
      if (!state) return;

      if (state.progress != null) job.progress = state.progress;
      if (state.title) job.title = state.title;
      if (state.filename) job.filename = state.filename;
      if (state.status) job.status = mapBridgeStatus(state.status);

      if (state.status === "completed") {
        clearInterval(timer);
        job.status = "completed";
        job.progress = 100;
        job.error = null;
        resolve(0);
        return;
      }

      if (state.status === "failed") {
        clearInterval(timer);
        job.status = "failed";
        job.error = state.error || "Download failed";
        resolve(1);
      }
    }, POLL_MS);
  });
}

module.exports = {
  BRIDGE_NAME,
  bridgeDir,
  isBridgeReady,
  bridgeInitError,
  runAndroidBridgeOnce,
};
