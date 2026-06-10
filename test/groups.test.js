const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rollo-test-"));
const videosDir = path.join(tmpDir, "videos");
const legacyPath = path.join(tmpDir, "data", "groups.json");
process.env.VIDEO_SECRET = "test-secret";

fs.mkdirSync(path.join(videosDir, "Secret"), { recursive: true });

const {
  createGroupsStore,
  createGroupAuth,
  hashPassword,
} = require("../lib/groups");

const store = createGroupsStore(videosDir, legacyPath);
const auth = createGroupAuth(store);

store.setGroupConfig("Secret", { passwordHash: hashPassword("abc"), passwordVersion: 0 });

const token = auth.makeUnlockToken("Secret");
assert.ok(auth.verifyUnlockToken(token, "Secret"), "valid token should verify");

const config = store.getGroupConfig("Secret");
config.passwordVersion = 1;
store.setGroupConfig("Secret", { passwordVersion: 1 });
assert.ok(!auth.verifyUnlockToken(token, "Secret"), "token should invalidate after password version bump");

const groupFile = path.join(videosDir, "Secret", "_rollo", "group.json");
assert.ok(fs.existsSync(groupFile), "group.json should live inside the library folder");

console.log("groups.test.js: ok");
