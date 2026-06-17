const { spawn } = require("child_process");
const path = require("path");

function ffprobePathFromFfmpeg(ffmpegPath) {
  if (!ffmpegPath) return null;
  const dir = path.dirname(ffmpegPath);
  const base = path.basename(ffmpegPath);
  if (/ffmpeg/i.test(base)) {
    return path.join(dir, base.replace(/ffmpeg/i, "ffprobe"));
  }
  return path.join(dir, process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
}

function probeMedia(ffprobeCommand, inputPath) {
  return new Promise((resolve) => {
    if (!ffprobeCommand || !inputPath) return resolve(null);
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      inputPath,
    ];
    const proc = spawn(ffprobeCommand, args, { windowsHide: true });
    let out = "";
    proc.stdout.on("data", (chunk) => {
      out += chunk;
    });
    proc.on("error", () => resolve(null));
    proc.on("close", (code) => {
      if (code !== 0) return resolve(null);
      try {
        const data = JSON.parse(out);
        const stream = data.streams?.[0] || {};
        const duration = Number(data.format?.duration);
        const result = {};
        if (Number.isFinite(duration) && duration > 0) result.durationSec = Math.round(duration * 10) / 10;
        if (stream.width) result.width = stream.width;
        if (stream.height) result.height = stream.height;
        resolve(Object.keys(result).length ? result : null);
      } catch {
        resolve(null);
      }
    });
  });
}

module.exports = { ffprobePathFromFfmpeg, probeMedia };
