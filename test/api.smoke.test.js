const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { scanAllSyncHints, isLibraryDeletable } = require("../lib/sync-hints");
const { createDownloader } = require("../lib/downloader");
const { MEDIA_RE } = require("../lib/media");

const tmpVideos = fs.mkdtempSync(path.join(os.tmpdir(), "rollo-smoke-"));
const libraryId = "Library A";

try {
  const dir = path.join(tmpVideos, libraryId);
  fs.mkdirSync(path.join(dir, "_rollo"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".stfolder"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".stfolder", "marker"), "");
  fs.writeFileSync(
    path.join(dir, "_rollo", "meta.sync-conflict-20260101-120000.json"),
    "{}"
  );

  const hints = scanAllSyncHints(tmpVideos, [libraryId]);
  assert.strictEqual(hints.conflictCount, 1);
  assert.strictEqual(hints.syncthingLibraries[0], libraryId);

  const emptyCheck = isLibraryDeletable(tmpVideos, libraryId, MEDIA_RE);
  assert.strictEqual(emptyCheck.ok, true);

  fs.writeFileSync(path.join(tmpVideos, libraryId, "clip.mp4"), "x");
  const blocked = isLibraryDeletable(tmpVideos, libraryId, MEDIA_RE);
  assert.strictEqual(blocked.ok, false);

  const downloader = createDownloader({ dataDir: tmpVideos });
  const queue = downloader.getQueueState();
  assert.ok(Array.isArray(queue.queued));
  assert.strictEqual(queue.activeId, null);

  const cancelMissing = downloader.cancelQueuedJob("missing");
  assert.strictEqual(cancelMissing.ok, false);

  console.log("api smoke tests passed");
} finally {
  fs.rmSync(tmpVideos, { recursive: true, force: true });
}
