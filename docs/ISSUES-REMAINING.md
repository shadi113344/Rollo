# Rollo — Remaining Issues & Enhancements

> Open work only. Items completed in commits `7ac44fe` and the Mar 2026 backlog sprint are excluded here.  
> See [`ISSUES-AND-ENHANCEMENTS.md`](./ISSUES-AND-ENHANCEMENTS.md) for the full historical backlog and [`APP-STRUCTURE.md`](./APP-STRUCTURE.md) for architecture.

**Last updated:** 2026-06-16

---

## Priority legend

| Label | Meaning |
|-------|---------|
| 🔴 **Critical** | Security risk or data loss — fix before exposing to internet |
| 🟠 **High** | Broken or misleading behavior for common flows |
| 🟡 **Medium** | Annoyance, edge case, or missing polish |
| 🟢 **Low** | Nice-to-have, cleanup, or future work |

---

## 🔴 Critical

_None — default `VIDEO_SECRET` now auto-generated and persisted; production refuses start only when explicitly in production mode without any secret path (env or file)._

---

## 🟠 High

| Item | Area | Notes |
|------|------|-------|
| No file locking on `meta.json` / `group.json` | Data / Syncthing | Merge API + UI added (`POST /api/sync/merge-conflicts`). **Still missing:** automatic merge on sync; true last-write-wins with backup on every write. |
| X/Twitter auth fragility on PC | Downloader | `lib/x-session.js` browser cookie extraction — DPAPI / profile issues on Windows; cookies expire. Re-auth banner on Download tab; underlying reliability still weak. |
| Single active download (by design) | Downloader | Queue UI, cancel/retry, and “one at a time” note added. **Enhancement:** optional concurrent downloads. |

---

## 🟡 Medium

### Security & production

| Item | Notes |
|------|-------|
| `MANAGE_EXTERNAL_STORAGE` on Android | Play Store review risk; sideload path documented in `android/README.md`. |
| `/api/status` exposure | Rate limiting (120/min/IP) added. Optional API key for stricter deployments still open. |

### PWA & service worker

| Item | Notes |
|------|-------|
| iOS standalone viewport quirks | Mitigated via `100lvh` + `ios-standalone` — retest on new iOS versions. |
| Shell updates on iOS | Auto-prompt added (`pwa.js`); Safari PWA update behavior still inconsistent — monitor. |

### Downloader

| Item | Notes |
|------|-------|
| WebSocket progress | SSE stream added for download jobs (`/api/download/:jobId/stream`). WebSocket still open for uploads + unified progress. |
| ffmpeg / yt-dlp not bundled on PC | User installs via `winget`; Android bundles via youtubedl-android. Documented but support burden remains. |

### Android

| Item | Notes |
|------|-------|
| First-launch yt-dlp init delay | 10–30 s before Download tab ready. **Enhancement:** persistent progress in native settings toolbar. |
| GitHub “Update” vs APK update | Web update message improved; **no detection** of when a new APK is required for native/JNI changes. |
| Battery drain on Samsung / OEM kills | Foreground service helps; document disable battery optimization (partially in `android/README.md`). |

### Multi-server & networking

| Item | Notes |
|------|-------|
| Unlock tokens not portable across servers | By design (per-origin `VIDEO_SECRET`). Export/import of unlock state added in Settings. |
| `rolloSeed` URL length | Moved to URL hash; large server lists can still be long. **Enhancement:** compress seed payload. |
| LAN/Tailscale path in UI | Probing works; active path not always surfaced outside Servers hub cards. |

### Data & Syncthing

| Item | Notes |
|------|-------|
| Thumbnails in Syncthing | Regenerated on demand — safe to exclude from sync; document in Syncthing setup guide. |
| Flat folder per library | No nested albums — by design; limits organization for very large libraries. |

### UI / UX

| Item | Notes |
|------|-------|
| Accessibility — radial menu | Sheet focus traps added on profile; radial menu focus trap still open. |
| Full i18n | `i18n.js` scaffold + `data-i18n` hooks; most strings still English inline. |
| Collections vs tag filter overlap | `collection-active` highlight links views; full merge into one navigation model still open. |

### Performance

| Item | Notes |
|------|-------|
| Feed DOM on very long sessions | `content-visibility` + unload beyond ±2; all card shells still in DOM. **Enhancement:** true virtualized feed (destroy/recreate cards). |

### Testing & tooling

| Item | Notes |
|------|-------|
| Full HTTP API integration tests | `test/api.smoke.test.js` covers lib helpers; **still need** supertest against `server.js` routes. |
| Frontend / E2E | No Playwright coverage |
| Android instrumentation | None |
| Snapshot tests | `TagColors`, `VideoGroups.mediaUrl` |

### Architecture & technical debt

| Item | Notes |
|------|-------|
| Monolithic `index.html` / `watch.html` | Large inline JS — consider ES modules + bundler |
| No TypeScript | Runtime errors possible in client helpers |
| `groups.js` client vs `lib/groups.js` server | Name collision — rename client to `video-groups-client.js`? |
| Global `window.*` namespaces | Works for PWA sans bundler; harder to test |
| Inconsistent error handling | Mix of `showToast`, `throw`, silent `catch` |
| No structured logging | Server or client error reporting |
| Env-only config | No `rollo.config.json` for casual users |

---

## 🟢 Low

| Item | Area | Notes |
|------|------|-------|
| No offline media | PWA | By design — media streams from server |
| Push notifications | PWA | e.g. download complete |
| APK size ~60–80 MB | Android | Expected with embedded Node |
| Choose subfolder within library | Download | Currently flat |
| `.stfolder` in sample data trees | Data | Markers in `videos - Copy` samples only |

---

## Roadmap — not started

### Mid-term

1. WebSocket progress for uploads (downloads have SSE)
2. True virtualized feed (profile grid virtualized)
3. Backup/restore full library metadata (not just server list / unlock tokens)
4. Shared watch progress in `meta.json` (server-side resume, beyond feed `localStorage`)

### Long-term / exploratory

1. Transcoding pipeline — multiple qualities on upload
2. AI tags — auto-tag via local model
3. Cast / AirPlay from feed
4. Multi-user accounts with per-library ACLs
5. Federation between servers
6. iOS native wrapper (APK equivalent)
7. Desktop Electron/Tauri shell

---

## Completed in backlog sprint (reference)

Do not re-open unless regressed:

### From `7ac44fe`
- Complete SW precache + `npm run precache` + shell versioning
- SW auto-update prompt + version in More sheet
- Download queue UI, cancel queued jobs, retry failed jobs
- X re-auth banner + paste-from-clipboard on Download tab
- Download unlock cancel restores library selector
- Stronger group delete (`_rollo/`, `.stfolder` allowed when empty)
- Dev test pages → `dev/public/`
- `public/media.js` → `media-helpers.js`
- Syncthing conflict + `.stfolder` detection in `/api/status`
- Server-side search `GET /api/videos?q=`
- Profile sync-conflict banner, upload retry, feed resume per library
- Multi-server: `rolloSeed` in hash, probe retry/backoff, last-seen + 60 s health refresh
- Android: Node watchdog restart, boot defer until permissions, web-vs-APK update copy
- `test/api.smoke.test.js` (lib-level smoke tests)

### Mar 2026 sprint (UI/UX + security + medium fixes)
- **Security:** `lib/video-secret.js` auto-generate/persist secret; production guard; optional HTTP basic auth (`lib/basic-auth.js`); `/api/status` rate limit; `POST …/revoke-sessions`
- **Syncthing:** `lib/conflict-merge.js` + merge button in More menu
- **Download:** playlist checkbox + yt-dlp `--no-playlist` only when off; SSE job progress; queue concurrency note
- **Profile UX:** bulk select/tag, drag-drop upload, scroll restore, virtualized grid (120+ items), collections filter highlight
- **Feed UX:** PiP, swipe-down to profile, ±3 preload, lock badge, double-tap like, editable captions
- **Locked libs:** re-lock timeout (Settings), biometric/saved-password + Face ID/Touch ID prompt on unlock
- **General:** light/dark theme (`theme.js`), Settings sheet (probe timeouts, network speed opt-out, unlock export/import), `i18n.js` scaffold, keyboard shortcuts (`/`, `b`, `?`), sheet focus traps, Servers bottom-nav tab, Feed link on mobile
- **Performance:** thumb warmup API, feed `content-visibility` for distant cards
- **Android:** foreground notification when Node recovery fails
- **CI:** `.github/workflows/test.yml` runs `npm test`
- **PWA:** shell v16 precache includes new assets

---

## How to use this file

1. **Sprint planning** — pull from 🔴 and 🟠 first, then 🟡 by area.
2. **After fixing something** — remove it here; add a row to §14 in [`ISSUES-AND-ENHANCEMENTS.md`](./ISSUES-AND-ENHANCEMENTS.md).
3. **Before release** — scan 🔴 and 🟠; verify no regressions in the completed list above.

---

*Maintained alongside the codebase. Update when closing or discovering issues.*
