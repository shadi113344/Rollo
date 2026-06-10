const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createMetadataStore } = require("../lib/metadata");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rollo-meta-"));
const videosDir = path.join(tmp, "videos");
const legacyPath = path.join(tmp, "data", "metadata.json");
const groupId = "Gym";

fs.mkdirSync(path.join(videosDir, groupId), { recursive: true });
fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
fs.writeFileSync(
  legacyPath,
  JSON.stringify({
    "Gym/a.mp4": { tags: ["Legs"], favorite: true },
  })
);

const store = createMetadataStore(videosDir, legacyPath);
const { migrated } = store.migrateFromLegacy([groupId]);
assert.strictEqual(migrated, 1, "should migrate one entry");

const meta = store.getVideoMeta(groupId, "a.mp4");
assert.deepStrictEqual(meta.tags, ["Legs"]);
assert.strictEqual(meta.favorite, true);

store.setVideoMeta(groupId, "b.mp4", { tags: ["Core"], favorite: false });
assert.deepStrictEqual(store.getVideoMeta(groupId, "b.mp4").tags, ["Core"]);

store.renameVideoMeta(groupId, "b.mp4", "c.mp4");
assert.deepStrictEqual(store.getVideoMeta(groupId, "c.mp4").tags, ["Core"]);

store.deleteVideoMeta(groupId, "c.mp4");
assert.deepStrictEqual(store.getVideoMeta(groupId, "c.mp4").tags, []);

const metaFile = path.join(videosDir, groupId, "_rollo", "meta.json");
assert.ok(fs.existsSync(metaFile), "meta.json should live inside the library folder");

console.log("metadata.test.js: ok");
