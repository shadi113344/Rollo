const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const BROWSERS = ["edge", "chrome", "firefox", "brave", "chromium"];

function sessionPath(dataDir) {
  return path.join(dataDir, "x-session.json");
}

function cookiesPath(dataDir) {
  return path.join(dataDir, "cookies.txt");
}

function hasCookieFile(dataDir) {
  const file = cookiesPath(dataDir);
  if (!fs.existsSync(file) || fs.statSync(file).size < 20) return false;
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .some((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("#") && trimmed.includes("\t");
    });
}

function readSession(dataDir) {
  const file = sessionPath(dataDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeSession(dataDir, session) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(sessionPath(dataDir), JSON.stringify(session, null, 2));
}

function clearSession(dataDir) {
  try {
    fs.unlinkSync(sessionPath(dataDir));
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(cookiesPath(dataDir));
  } catch {
    /* ignore */
  }
}

function isConnected(dataDir) {
  if (hasCookieFile(dataDir)) return true;
  const session = readSession(dataDir);
  return !!(session && session.mode === "browser" && session.browser);
}

function getAuthForDownload(dataDir) {
  if (hasCookieFile(dataDir)) {
    return { cookiesFile: cookiesPath(dataDir) };
  }
  const session = readSession(dataDir);
  if (session?.mode === "browser" && session.browser) {
    return { browser: session.browser };
  }
  return null;
}

function probeBrowser(ytdlpCommand, browser) {
  return new Promise((resolve) => {
    let output = "";
    const proc = spawn(
      ytdlpCommand,
      [
        "--cookies-from-browser",
        browser,
        "--simulate",
        "--no-playlist",
        "--encoding",
        "utf-8",
        "https://x.com/i/web/status/20",
      ],
      { windowsHide: true }
    );

    const onData = (chunk) => {
      output += chunk.toString();
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("error", () => resolve({ ok: false }));

    proc.on("close", () => {
      if (
        /Could not copy Chrome cookie database|Failed to decrypt with DPAPI|unsupported browser|Permission denied/i.test(
          output
        )
      ) {
        resolve({ ok: false });
        return;
      }
      if (/\[twitter\]|\[x\.com\]/i.test(output)) {
        resolve({ ok: true, browser });
        return;
      }
      resolve({ ok: false });
    });
  });
}

async function confirmBrowserSession(dataDir, ytdlpCommand) {
  if (!ytdlpCommand) {
    return { ok: false, error: "yt-dlp is not available" };
  }
  if (hasCookieFile(dataDir)) {
    return { ok: true, mode: "file" };
  }

  for (const browser of BROWSERS) {
    const result = await probeBrowser(ytdlpCommand, browser);
    if (result.ok) {
      writeSession(dataDir, {
        mode: "browser",
        browser: result.browser,
        verifiedAt: Date.now(),
      });
      return { ok: true, mode: "browser", browser: result.browser };
    }
  }

  return {
    ok: false,
    error:
      "Could not read your browser login. Sign in at x.com in Edge or Chrome, close that browser completely, then tap Done again.",
  };
}

module.exports = {
  BROWSERS,
  cookiesPath,
  sessionPath,
  hasCookieFile,
  readSession,
  writeSession,
  clearSession,
  isConnected,
  getAuthForDownload,
  confirmBrowserSession,
};
