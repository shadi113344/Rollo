const assert = require("assert");
const { isValidDownloadUrl, parseProgressLine } = require("../lib/downloader");

assert.strictEqual(isValidDownloadUrl("https://www.youtube.com/watch?v=abc"), true);
assert.strictEqual(isValidDownloadUrl("http://example.com/video.mp4"), true);
assert.strictEqual(isValidDownloadUrl("not-a-url"), false);
assert.strictEqual(isValidDownloadUrl("ftp://example.com/x"), false);

const progress = parseProgressLine("[download]  42.5% of 10.00MiB at 1.2MiB/s ETA 00:05");
assert.strictEqual(progress.progress, 42.5);

const dest = parseProgressLine("[download] Destination: C:\\videos\\Gym\\clip [abc].mp4");
assert.strictEqual(dest.filename, "clip [abc].mp4");

const args = require("../lib/downloader").buildYtdlpArgs({
  url: "https://example.com/v",
  outputDir: "/tmp/out",
  quality: "fast",
  ffmpegDir: "C:\\ffmpeg\\bin",
});
assert.ok(args.includes("--concurrent-fragments"));
assert.ok(args.includes("C:\\ffmpeg\\bin"));
assert.ok(args.some((a) => String(a).includes("height<=720")));

const err = require("../lib/downloader").extractYtdlpError(
  "ERROR: [twitter] 123: No video could be found in this tweet\n",
  1
);
assert.ok(/sign in to x|nsfw|private/i.test(err));

const nsfwErr = require("../lib/downloader").extractYtdlpError(
  "[twitter] 999: sensitive content\n",
  2
);
assert.ok(/sensitive|nsfw/i.test(nsfwErr));

const xArgs = require("../lib/downloader").buildYtdlpArgs({
  url: "https://x.com/user/status/1",
  outputDir: "/tmp/out",
  quality: "fast",
  xAuth: { browser: "edge" },
});
assert.ok(xArgs.includes("bv*+ba/b"));
assert.ok(!xArgs.includes("twitter:api=syndication"));

const xGuestArgs = require("../lib/downloader").buildYtdlpArgs({
  url: "https://x.com/user/status/1",
  outputDir: "/tmp/out",
  quality: "fast",
});
assert.ok(xGuestArgs.includes("twitter:api=syndication"));

const fs = require("fs");
const os = require("os");
const path = require("path");
const tmpCookie = path.join(os.tmpdir(), `rollo-test-cookies-${process.pid}.txt`);
fs.writeFileSync(tmpCookie, ".x.com\tTRUE\t/\tTRUE\t1\tauth_token\tx\n.ct0\tTRUE\t/\tTRUE\t1\tct0\ty\n");

const signedAttempts = require("../lib/downloader").buildDownloadAttempts({
  url: "https://x.com/user/status/1?s=20",
  outputDir: "/tmp/out",
  quality: "best",
  xAuth: { cookiesFile: tmpCookie },
});
try {
  fs.unlinkSync(tmpCookie);
} catch {
  /* ignore */
}
assert.ok(signedAttempts.some((args) => args.includes("--cookies")));
assert.ok(signedAttempts.some((args) => !args.includes("--cookies")));
assert.ok(signedAttempts.some((args) => args.includes("twitter:api=syndication")));
assert.ok(
  signedAttempts.every((args) => {
    const urlArg = args.filter((a) => String(a).startsWith("http"))[0];
    return urlArg && !urlArg.includes("?s=");
  })
);

const xSession = require("../lib/x-session");
assert.strictEqual(typeof xSession.isConnected, "function");

const repaired = xSession.repairNetscapeCookiesContent(
  "x.com\tTRUE\t/\tTRUE\t1813281371\tguest_id_marketing\tabc\n"
);
assert.ok(repaired.includes(".x.com\tTRUE"));

assert.strictEqual(
  xSession.hasXAuthCookieNames("x.com\tTRUE\t/\tTRUE\t1\tguest_id\tabc"),
  false
);
assert.strictEqual(
  xSession.hasXAuthCookieNames(".x.com\tTRUE\t/\tTRUE\t1\tauth_token\tabc"),
  true
);

assert.strictEqual(require("../lib/downloader").normalizeQuality("unknown"), "best");

console.log("downloader.test.js: ok");
