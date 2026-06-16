const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function findExecutableInTree(dir, exeName, maxDepth, depth = 0) {
  if (depth > maxDepth) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const target = exeName.toLowerCase();
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === target) return full;
    if (entry.isDirectory()) {
      const found = findExecutableInTree(full, exeName, maxDepth, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function findWinGetExe(exeName) {
  if (process.platform !== "win32") return null;
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;
  const root = path.join(localAppData, "Microsoft", "WinGet", "Packages");
  if (!fs.existsSync(root)) return null;
  try {
    for (const pkg of fs.readdirSync(root)) {
      const found = findExecutableInTree(path.join(root, pkg), exeName, 6);
      if (found) return found;
    }
  } catch {
    return null;
  }
  return null;
}

async function findOnPath(names) {
  for (const cmd of names) {
    try {
      await execFileAsync(cmd, ["--version"], { timeout: 8000, windowsHide: true });
      return cmd;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function resolveExecutable(exeName, pathNames) {
  const fromPath = await findOnPath(pathNames);
  if (fromPath) return fromPath;
  const fromWinGet = findWinGetExe(exeName);
  if (fromWinGet) return fromWinGet;
  return null;
}

module.exports = {
  findExecutableInTree,
  findWinGetExe,
  resolveExecutable,
};
