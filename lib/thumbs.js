const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { ROLLO_DIR } = require("./metadata");

const SEEK_SECONDS = [2, 4, 7, 11, 1, 15, 0.6];

function thumbPath(videosDir, groupId, filename) {
  const safe = String(filename).replace(/[^\w.\-()+ ]/g, "_");
  return path.join(videosDir, groupId, ROLLO_DIR, "thumbs", `${safe}.jpg`);
}

function runFfmpegFrame(ffmpegCommand, input, output, seekSec) {
  return new Promise((resolve) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(seekSec),
      "-i",
      input,
      "-frames:v",
      "1",
      "-q:v",
      "4",
      "-y",
      output,
    ];
    const proc = spawn(ffmpegCommand, args, { windowsHide: true });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0 && fs.existsSync(output) && fs.statSync(output).size > 400));
  });
}

function createThumbService(videosDir, getFfmpegCommand) {
  const inflight = new Map();

  async function ensureThumb(groupId, filename) {
    const out = thumbPath(videosDir, groupId, filename);
    if (fs.existsSync(out) && fs.statSync(out).size > 400) return out;

    const input = path.join(videosDir, groupId, filename);
    if (!fs.existsSync(input)) return null;

    const key = `${groupId}/${filename}`;
    if (inflight.has(key)) return inflight.get(key);

    const task = (async () => {
      const ffmpeg = getFfmpegCommand?.();
      if (!ffmpeg) return null;
      fs.mkdirSync(path.dirname(out), { recursive: true });
      try {
        fs.unlinkSync(out);
      } catch {
        /* ignore */
      }
      for (const seek of SEEK_SECONDS) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await runFfmpegFrame(ffmpeg, input, out, seek);
        if (ok) return out;
      }
      return fs.existsSync(out) ? out : null;
    })().finally(() => inflight.delete(key));

    inflight.set(key, task);
    return task;
  }

  function thumbExists(groupId, filename) {
    const out = thumbPath(videosDir, groupId, filename);
    return fs.existsSync(out) && fs.statSync(out).size > 400;
  }

  function moveThumb(groupId, targetGroup, filename, destName) {
    const src = thumbPath(videosDir, groupId, filename);
    const dest = thumbPath(videosDir, targetGroup, destName);
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      fs.renameSync(src, dest);
    } catch {
      try {
        fs.copyFileSync(src, dest);
        fs.unlinkSync(src);
      } catch {
        /* ignore */
      }
    }
  }

  function deleteThumb(groupId, filename) {
    const out = thumbPath(videosDir, groupId, filename);
    try {
      fs.unlinkSync(out);
    } catch {
      /* ignore */
    }
  }

  return { ensureThumb, thumbPath, thumbExists, moveThumb, deleteThumb };
}

module.exports = { createThumbService, thumbPath };
