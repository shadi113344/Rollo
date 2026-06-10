const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rollo-test-"));
process.env.VIDEO_SECRET = "test-secret";
process.env.GROUPS_PATH = path.join(tmpDir, "groups.json");

const {
  hashPassword,
  makeUnlockToken,
  verifyUnlockToken,
  writeGroupsFile,
  readGroupsFile,
} = require("../lib/groups");

writeGroupsFile({
  Secret: { passwordHash: hashPassword("abc"), passwordVersion: 0 },
});

const token = makeUnlockToken("Secret");
assert.ok(verifyUnlockToken(token, "Secret"), "valid token should verify");

const groups = readGroupsFile();
groups.Secret.passwordVersion = 1;
writeGroupsFile(groups);
assert.ok(!verifyUnlockToken(token, "Secret"), "token should invalidate after password version bump");

console.log("groups.test.js: ok");
