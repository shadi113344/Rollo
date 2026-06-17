# Rollo — Issues, Bugs & Enhancement Opportunities

> Living document of known problems, technical debt, security notes, and suggested improvements.  
> Complements [`APP-STRUCTURE.md`](./APP-STRUCTURE.md).

---

## Table of contents

1. [Severity legend](#1-severity-legend)
2. [Security & production](#2-security--production)
3. [Known bugs & regressions](#3-known-bugs--regressions)
4. [PWA & service worker gaps](#4-pwa--service-worker-gaps)
5. [Downloader & X/Twitter](#5-downloader--xtwitter)
6. [Android-specific](#6-android-specific)
7. [Multi-server & networking](#7-multi-server--networking)
8. [Data integrity & Syncthing](#8-data-integrity--syncthing)
9. [UI / UX improvements](#9-ui--ux-improvements)
10. [Performance](#10-performance)
11. [Testing & tooling](#11-testing--tooling)
12. [Architecture & technical debt](#12-architecture--technical-debt)
13. [Feature ideas (roadmap)](#13-feature-ideas-roadmap)
14. [Recently addressed (for reference)](#14-recently-addressed-for-reference)

---

## 1. Severity legend

| Label | Meaning |
|-------|---------|
| 🔴 **Critical** | Security risk or data loss — fix before exposing to internet |
| 🟠 **High** | Broken or misleading behavior for common flows |
| 🟡 **Medium** | Annoyance, edge case, or missing polish |
| 🟢 **Low** | Nice-to-have, cleanup, or future work |

---

## 2. Security & production

### 🔴 Default `VIDEO_SECRET` is weak

- **Where:** `server.js` — falls back to `rollo-local-secret` if env unset
- **Risk:** Anyone on the LAN can forge unlock tokens for locked libraries
- **Fix:** Always set `VIDEO_SECRET` to a long random string in production; Android app generates one automatically
- **Enhancement:** Refuse to start in production mode without `VIDEO_SECRET` set

### 🟠 Unlock tokens valid 30 days with no revocation list

- **Where:** `lib/groups.js` HMAC token expiry
- **Risk:** Stolen token works until expiry even after password change (partially mitigated by `passwordVersion` bump on password change)
- **Enhancement:** Server-side token version / short-lived tokens + refresh; optional “log out all devices” in group settings

### 🟠 `/api/status` is open with CORS `*`

- **Where:** `server.js` — intentional for multi-server probing
- **Risk:** Exposes hostname, library names, video counts to any website if user visits malicious page while on same network
- **Mitigation:** Only expose on trusted networks (LAN / Tailscale)
- **Enhancement:** Optional API key for status; rate limiting

### 🟡 No authentication for the app itself

- Rollo assumes **network trust** (home LAN / Tailscale). Not suitable for public internet without a reverse proxy + auth layer
- **Enhancement:** Optional basic auth or Tailscale-only bind address

### 🟡 `MANAGE_EXTERNAL_STORAGE` on Android

- Required for flexible video folder access; may trigger Play Protect / Play Store review
- Documented in `android/README.md` — sideload is the intended path for personal use

---

## 3. Known bugs & regressions

### 🟡 Service worker precache incomplete

- **Where:** `public/sw.js` `PRECACHE` array
- **Missing from cache (as of v13):** `anchored-tag-palette.js`, `anchored-tag-palette.css`, `heart.css` (if not pulled transitively — verify)
- **Symptom:** Feed tag flyout or profile radial tag palette may fail offline after shell load
- **Fix:** Add all page dependencies to `PRECACHE`; automate precache generation from HTML script tags

### 🟡 `download.html` unlock flow on cancel

- After `RolloUnlockFlow` migration, cancel on locked library during download may leave library selector in inconsistent state if user had changed selection before lock prompt — verify edge case

### 🟡 Group delete only checks `videoCount` from API

- **Where:** `DELETE /api/groups/:id`
- Empty folder with leftover `_rollo/` or hidden files may block delete or leave orphans
- **Enhancement:** Clear `_rollo/` when deleting; stronger empty check

### 🟢 Dev/test pages shipped in production

- **Files:** `public/test2.html`, `public/test-footer.html`, `public/test2-manifest.json`
- **Fix:** Move to `dev/` or exclude from sync-android / release builds

### 🟢 Duplicate `media.js`

- `lib/media.js` (server) vs `public/media.js` (client) — similar names, different roles; easy to confuse when editing

---

## 4. PWA & service worker gaps

| Issue | Severity | Notes |
|-------|----------|-------|
| No offline media | 🟢 | By design — media streams from server |
| Shell update requires manual “Update” or hard refresh | 🟡 | Users on old SW may miss new JS until bump + refresh |
| iOS standalone viewport quirks | 🟡 | Mitigated via `100lvh` + `ios-standalone` class — test on new iOS versions |
| No push notifications | 🟢 | Could notify download complete |
| `connect.html` not always in user mental model | 🟡 | Servers only via More menu — discoverability |

### Suggestions

- Add version display in More sheet (read from SW cache name or `/api/status` build hash)
- Auto-prompt when SW update waiting (`registration.waiting`)
- Precache complete dependency tree per page

---

## 5. Downloader & X/Twitter

### 🟠 Single active download job (server-side)

- **Where:** `lib/downloader.js` internal queue
- **Symptom:** Starting a second download while first runs may queue silently; UI shows one status card
- **Enhancement:** Visible queue with position; cancel queued jobs

### 🟠 X/Twitter auth fragility on PC

- **Where:** `lib/x-session.js` — browser cookie extraction
- **Symptom:** DPAPI / browser profile issues on Windows; cookies expire
- **Mitigation:** `x-login.html` flow; Android WebView login more reliable
- **Enhancement:** Clearer re-auth prompt in Download tab when `X_SIGN_IN_REQUIRED`

### 🟡 Polling-only progress

- **Where:** Download page polls `GET /api/download/:jobId` every ~1–2 s
- **Enhancement:** SSE or WebSocket for smoother progress bar

### 🟡 No download retry button

- Failed jobs stay in history but require re-pasting URL
- **Enhancement:** “Retry” on failed history items

### 🟡 ffmpeg / yt-dlp not bundled on PC

- User must install separately (`winget install yt-dlp`)
- Android bundles via youtubedl-android — asymmetry is documented but still a support burden

---

## 6. Android-specific

### 🟠 Node process no auto-restart on crash

- **Where:** `NodeRunner` / `RolloService`
- **Symptom:** If Node exits, service shows failed state without automatic recovery loop
- **Enhancement:** Exponential backoff restart; notification “Tap to restart server”

### 🟠 Boot receiver vs permission timing

- **Where:** `BootReceiver.kt`
- **Symptom:** Auto-start on boot may fail before user grants all-files access on fresh install
- **Enhancement:** Defer boot start until permissions granted once

### 🟡 GitHub Update does not update native code

- **Where:** `UpdateManager.kt`
- **Symptom:** “Update” pulls JS/CSS/server only — **new APK required** for native bridge changes (yt-dlp, JNI)
- **Fix:** Show in UI: “App update available” vs “Web update applied”

### 🟡 First launch yt-dlp init delay

- 10–30 s before Download tab ready — show persistent progress in native toolbar

### 🟡 APK size ~60–80 MB

- Expected with embedded Node; no mitigation unless split APK or on-demand modules

### 🟡 Battery drain on Samsung devices

- Documented: disable battery optimization; foreground service helps but OEM kills remain possible

---

## 7. Multi-server & networking

### 🟡 Unlock tokens not portable across servers

- By design — each origin has its own `VIDEO_SECRET` and storage
- **UX:** User unlocking “Gym” on PC must unlock again on phone even if Syncthing synced files (tokens are browser-local)
- **Enhancement:** Document clearly; optional export/import of unlock state (encrypted)

### 🟡 `rolloSeed` in URL can be long

- Large server lists → long URLs; some proxies limit length
- **Enhancement:** Compress seed or use fragment `#` instead of query

### 🟡 Probe timeouts fixed

- LAN 1.8 s / Tailscale 3.2 s may fail on slow networks
- **Enhancement:** Configurable timeouts; retry with backoff in UI

### 🟢 No health check / uptime monitoring

- **Enhancement:** Optional ping from Servers hub on interval; show last seen

---

## 8. Data integrity & Syncthing

### 🟠 No file locking on `meta.json` / `group.json` writes

- **Risk:** Syncthing conflict copies (`meta.sync-conflict-*.json`) if two devices edit tags simultaneously
- **Mitigation:** README says sync metadata — avoid editing same library on two writers at once
- **Enhancement:** Detect conflict files in `/api/status`; merge strategy or last-write-wins with backup

### 🟡 Thumbnails not required for sync

- Regenerated on demand — safe to exclude from Syncthing to save bandwidth

### 🟡 No server-side search

- Profile search filters **loaded** `allVideos` client-side only
- Large libraries → slow initial load + search limited to memory
- **Enhancement:** `GET /api/videos?q=` server-side filter

### 🟡 Flat folder per library

- No nested albums — by design but limits organization for large collections

### 🟢 `.stfolder` markers in test data

- Syncthing folder markers exist in sample `videos - Copy` trees — not used programmatically
- **Enhancement:** Detect `.stfolder` in `/api/status` hints for sync-aware UI

---

## 9. UI / UX improvements

### Profile

| Suggestion | Priority | Notes |
|------------|----------|-------|
| Bulk tag edit | Medium | Select multiple thumbs |
| Drag-drop upload to grid | Medium | In addition to FAB |
| Remember scroll position in grid | Low | When returning from feed |
| Collections vs tag filter overlap | Low | Consider merging UX |
| Show sync conflict warning | Medium | If conflict files detected |
| Upload queue: retry failed | Medium | One-click retry |
| Hidden `#feed-link` in header | Low | Dead code — remove or use |

### Feed

| Suggestion | Priority | Notes |
|------------|----------|-------|
| Picture-in-picture | Medium | Mobile browsers supporting PiP |
| Double-tap to like | Low | Instagram pattern |
| Swipe-down to close / back to profile | Medium | Gesture navigation |
| Remember position per library | Medium | Resume where left off |
| Preload next video earlier | Low | Reduce start latency |
| Caption / description field | Low | Beyond filename display |

### Download

| Suggestion | Priority | Notes |
|------------|----------|-------|
| Paste from clipboard button | Low | One-tap |
| Playlist / channel batch download | High | yt-dlp supports — expose in UI |
| Choose subfolder within library | Low | Currently flat |

### Locked libraries

| Suggestion | Priority | Notes |
|------------|----------|-------|
| Biometric unlock (WebAuthn) | Medium | Beyond Credential Management password fill |
| Per-library lock icon in feed when wrong group | Low | Clearer state |
| Timeout re-lock after N minutes | Medium | Security vs convenience slider |

### Servers hub

| Suggestion | Priority | Notes |
|------------|----------|-------|
| Dedicated tab vs More menu | Low | Trade-off: clutter vs discoverability |
| Show library count on server card | Low | From last successful `/api/status` |
| LAN/Tailscale auto-switch when roaming | Medium | Already probes — surface active path in UI |

### General

| Suggestion | Priority | Notes |
|------------|----------|-------|
| Dark/light theme toggle | Low | Currently dark-only |
| Keyboard shortcuts on desktop | Low | Feed j/k navigation exists |
| Accessibility audit | Medium | aria labels partial; radial menu focus trap |
| i18n / localization | Low | All strings English inline |

---

## 10. Performance

### 🟡 Profile grid with thousands of items

- All thumbs in DOM with IntersectionObserver — may lag on low-end phones
- **Enhancement:** Virtualized grid (only render visible rows)

### 🟡 Feed memory with many videos

- `unloadDistantCards` helps; Android scroll fixes reduced flicker — monitor long sessions
- **Enhancement:** Hard cap on mounted video elements

### 🟡 Thumbnail generation on first view

- ffmpeg spawn per thumb — CPU spike when opening large library
- **Enhancement:** Background thumb warmup job; persistent thumb cache headers

### 🟢 Network speed hook overhead

- Patches `fetch` and XHR globally — negligible but ever-present
- **Enhancement:** Opt-out in settings

---

## 11. Testing & tooling

### Current coverage

| Area | Tested? | File |
|------|---------|------|
| Group auth / unlock tokens | ✅ | `test/groups.test.js` |
| Metadata migration | ✅ | `test/metadata.test.js` |
| Downloader helpers | ✅ | `test/downloader.test.js` |
| HTTP API integration | ❌ | — |
| Frontend / E2E | ❌ | — |
| Android instrumentation | ❌ | — |

### Suggestions

- Add supertest-based API smoke tests for `/api/groups`, `/api/videos`, upload
- Playwright flow: upload → tag → feed play → download
- CI on GitHub Actions: `npm test` + lint
- Snapshot tests for `TagColors`, `VideoGroups.mediaUrl`

---

## 12. Architecture & technical debt

| Item | Notes |
|------|-------|
| Monolithic `index.html` / `watch.html` | Large inline JS — hard to maintain; consider ES modules + bundler (optional) |
| No TypeScript | Runtime errors possible in client helpers |
| `groups.js` client vs `lib/groups.js` server | Name collision — rename client to `video-groups-client.js`? |
| Global `window.*` namespaces | `RolloIcons`, `VideoGroups`, `PressRadialMenu`, etc. — works for PWA sans bundler |
| Error handling inconsistent | Some paths `showToast`, others `throw`, others silent `catch` |
| Logging | No structured server logs or client error reporting |
| Config file | Env vars only — no `rollo.config.json` for casual users |

---

## 13. Feature ideas (roadmap)

### Near-term (high value, moderate effort)

1. **Complete SW precache** — all JS/CSS deps
2. **Download queue UI** — visible list, cancel, retry
3. **Server-side search** — `?q=` on videos API
4. **Syncthing conflict detection** — scan for `*.sync-conflict-*`
5. **Android Node auto-restart**
6. **SW update prompt** — auto when new shell available

### Mid-term

1. **WebSocket progress** for uploads and downloads
2. **Playlist / channel import** in Download tab
3. **Virtualized profile grid**
4. **Optional HTTP basic auth** or Tailscale Serve integration docs
5. **Backup/restore** full library metadata (not just server list)
6. **Shared watch progress** in `meta.json` (resume position)

### Long-term / exploratory

1. **Transcoding pipeline** — generate multiple qualities on upload
2. **AI tags** — auto-tag on upload via local model
3. **Cast / AirPlay** support from feed
4. **Multi-user accounts** with per-user libraries
5. **Federation** — optional sync between servers (complex; conflicts with current independent-instance model)
6. **iOS native wrapper** — similar to Android APK
7. **Desktop Electron/Tauri** — alternative to tray + browser

---

## 14. Recently addressed (for reference)

These were fixed in recent development — keep for regression awareness:

| Item | Resolution |
|------|------------|
| Feed network speed indicator invisible | z-index + position fix (`network-speed.css`); SW v12+ |
| Locked library ugly full-screen modal | `RolloUnlockFlow` glass inline + overlay (`unlock-flow.js`) |
| Locked grid flash before unlock | Don't switch `activeGroup` until unlock succeeds |
| Wrong password toast only | Inline error, shake, haptic |
| Android feed scroll flicker | Removed `restoreScrollPosition` from `playCard`; scroll-end settling; debounced observer |
| `pruneStaleUnlocks` wiped all device tokens | Now only removes tokens for deleted libraries |
| `setUnlockToken` ignored persist mode | `device` vs `session` parameter fixed |
| Upload queue missing | Sequential XHR queue with cancel |
| Servers hub missing from nav | Profile → More → Servers |
| Android yt-dlp | youtubedl-android bridge |
| Radial menu tag overlap / Safari long-press | `press-radial-menu.js` + div thumb + touch prevent |
| Profile tag hold → spread palette | `TAG_PALETTE_HOLD_MS` + blurry chips |

---

## How to use this document

- **Before a release:** scan 🔴 and 🟠 items
- **When triaging user reports:** add new rows under §3 with date and commit
- **When planning sprints:** pull from §13 roadmap
- **When onboarding:** read with [`APP-STRUCTURE.md`](./APP-STRUCTURE.md)

---

*Maintained alongside the codebase. Update when fixing or discovering issues.*
