# Rollo — Application Structure & Feature Reference

> Personal media library: browse photos and videos from your LAN or Tailscale network.  
> Default HTTP port: **3847** · Stack: **Node.js / Express** backend · **Vanilla JS PWA** frontend · optional **Windows tray launcher** · optional **Android APK** with embedded Node.js.

---

## Table of contents

1. [High-level architecture](#1-high-level-architecture)
2. [Repository layout](#2-repository-layout)
3. [Backend server](#3-backend-server)
4. [Data storage & Syncthing](#4-data-storage--syncthing)
5. [Client architecture (PWA)](#5-client-architecture-pwa)
6. [Profile page](#6-profile-page)
7. [Feed page](#7-feed-page)
8. [Download page](#8-download-page)
9. [Servers hub (multi-server)](#9-servers-hub-multi-server)
10. [Dynamic UI patterns](#10-dynamic-ui-patterns)
11. [Locked libraries & unlock flow](#11-locked-libraries--unlock-flow)
12. [PWA & offline shell](#12-pwa--offline-shell)
13. [Windows tray launcher (Rollo.exe)](#13-windows-tray-launcher-rolloexe)
14. [Android standalone APK](#14-android-standalone-apk)
15. [Build, deploy & scripts](#15-build-deploy--scripts)
16. [Environment variables](#16-environment-variables)
17. [API reference](#17-api-reference)
18. [Client-side storage keys](#18-client-side-storage-keys)
19. [Terminology](#19-terminology)

---

## 1. High-level architecture

Rollo is a **self-hosted media server** with a **mobile-first web UI**. Each installation is independent: its own disk, libraries, metadata, and unlock secrets. Multiple installations can be registered in a **Servers hub** on the client; the browser navigates between them by origin URL.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         User devices (browser / APK)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │ Profile PWA  │  │  Feed PWA    │  │ Download PWA │  … connect.html   │
│  │ index.html   │  │ watch.html   │  │ download.html│                   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                   │
│         │                 │                 │                            │
│         └─────────────────┼─────────────────┘                            │
│                           │ fetch / XHR / media                          │
└───────────────────────────┼─────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Node.js Express (server.js)                           │
│  REST API · static public/ · multer uploads · yt-dlp jobs · ffmpeg     │
│  lib/groups.js · lib/metadata.js · lib/downloader.js · lib/thumbs.js …   │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   videos/{Library}/    data/ (global)    yt-dlp / ffmpeg (PATH)
   media + _rollo/      X cookies,         or Android native worker
                        android bridge
```

### Deployment modes

| Mode | How it runs | Media location |
|------|-------------|----------------|
| **PC — `npm start`** | Node in terminal | `./videos` |
| **PC — `start-rollo.bat`** | Same, sets `PORT=3847` | `./videos` |
| **PC — `Rollo.exe`** | .NET tray app spawns `node server.js` | Next to exe / configured path |
| **Phone — APK** | nodejs-mobile in foreground service + WebView | `Internal storage/Rollo/Videos` |
| **Remote** | Tailscale IP `:3847` | Same as host |

There is **no central cloud** and **no federation API**. Multi-server = multiple full Rollo instances + client-side server list.

---

## 2. Repository layout

```
Rollo/
├── server.js                 # Express entry point, all routes
├── package.json              # npm scripts & dependencies
├── start-rollo.bat           # Windows double-click launcher
├── Rollo.exe                 # Built Windows tray app (from launcher/)
├── README.md
│
├── lib/                      # Server-side modules
│   ├── groups.js             # Libraries: group.json, passwords, HMAC tokens
│   ├── metadata.js           # Per-file tags & favorites (meta.json)
│   ├── media.js              # Extensions, MIME, upload validation
│   ├── downloader.js         # yt-dlp job queue, X/Twitter handling
│   ├── android-downloader.js # File bridge to Kotlin yt-dlp worker
│   ├── x-session.js          # X/Twitter cookies (file or browser)
│   ├── thumbs.js             # ffmpeg JPEG thumbnails
│   ├── network.js            # LAN + Tailscale IP detection
│   └── bin-finder.js         # Locate yt-dlp/ffmpeg on PATH / WinGet
│
├── public/                   # Static PWA (served at /)
│   ├── index.html            # Profile tab
│   ├── watch.html            # Feed tab
│   ├── download.html         # Download tab
│   ├── connect.html          # Servers hub
│   ├── x-login.html          # X sign-in helper (PC)
│   ├── sw.js                 # Service worker (app shell cache)
│   ├── manifest.json         # PWA manifest
│   ├── groups.js             # Client library + unlock token helpers
│   ├── servers.js            # Multi-server list & probing
│   ├── unlock-flow.js/css    # Glass unlock UI
│   ├── press-radial-menu.js  # Long-press radial actions
│   ├── anchored-tag-palette.js # Tag flyout (feed + profile)
│   ├── network-speed.js      # Throughput indicator
│   ├── bottom-nav.js         # Tab bar + profile gestures
│   └── … (icons, hearts, toast, pwa, layout-metrics, …)
│
├── android/                  # Kotlin + nodejs-mobile APK
├── launcher/RolloTray/       # .NET 8 Windows tray application
├── scripts/
│   ├── sync-android-assets.js
│   └── generate-pwa-icons.mjs
├── test/                     # Node unit tests
├── data/                     # Legacy + global server data
├── videos/                   # Default media root (one folder per library)
└── docs/                     # This documentation
```

---

## 3. Backend server

**Entry:** `server.js`  
**Dependencies:** `express`, `multer`  
**Default port:** `3847` (chosen to avoid common dev ports like 3000)

### Responsibilities

- Serve `public/` as static files
- List libraries and media per active `?group=` query parameter
- Enforce **locked library** access via `X-Unlocked` header or `?unlocked=` on media URLs
- Handle multipart uploads (up to **20 files**, **4 GB** each per request)
- Generate thumbnails on demand (`ffmpeg`)
- Run **yt-dlp** download jobs (PC) or delegate to Android native worker
- Expose `/api/status` with CORS for cross-origin server probing
- Migrate legacy `data/metadata.json` and `data/groups.json` into per-library `_rollo/` files on first access

### Library (group) resolution

- A **library** is a folder under `VIDEOS_DIR` (e.g. `videos/Gym/`)
- Active library comes from `?group=` on API calls; client stores choice in `localStorage.activeGroup`
- Each library has `videos/{id}/_rollo/group.json` (display name, optional password hash, lock mode)
- Each library has `videos/{id}/_rollo/meta.json` (per-filename tags and favorites)

### Media serving

- Static route: `GET /videos/:group/:filename`
- Locked libraries return **403** unless a valid unlock token is presented
- Unlock tokens are HMAC-signed, bound to `passwordVersion`, expire after **30 days**

---

## 4. Data storage & Syncthing

Rollo has **no Syncthing integration code**. The design is **Syncthing-compatible by filesystem layout**: sync the `videos/` tree and metadata travels with it.

### On-disk layout

```
videos/
  {LibraryName}/                 # e.g. Gym, Travel, xXx
    video1.mp4
    photo.jpg
    …                            # flat — no nested album folders
    _rollo/
      meta.json                  # { "file.mp4": { tags: [], favorite: bool } }
      group.json                 # { displayName, passwordHash?, lockMode?, passwordVersion? }
      thumbs/
        video1.mp4.jpg           # ffmpeg-generated JPEG

data/                            # server-global (not per-library)
  metadata.json                  # legacy → migrated to _rollo/meta.json
  groups.json                    # legacy → migrated to _rollo/group.json
  x-session.json                 # browser cookie mode marker
  cookies.txt                    # Netscape cookies for X / yt-dlp
  android-downloader/            # Android only
    requests/                    # job request JSON from Node
    jobs/                        # status JSON from Kotlin worker
    ready                        # marker when native worker is up
```

### What Syncthing should sync

| Path | Sync? | Notes |
|------|-------|-------|
| `videos/{Library}/*.mp4` etc. | ✅ | Media files |
| `videos/{Library}/_rollo/meta.json` | ✅ | Tags & favorites |
| `videos/{Library}/_rollo/group.json` | ✅ | Display name & lock settings |
| `videos/{Library}/_rollo/thumbs/` | Optional | Regenerated on demand |
| `data/` | ⚠️ | X cookies & Android bridge — usually **per device** |
| Browser `localStorage` | ❌ | Unlock tokens, server list, UI prefs — **not on disk** |

### Lock modes (`group.json`)

| `lockMode` | Behavior |
|------------|----------|
| `always` | Ask for password when switching to this library |
| `once` | Default checkbox “Stay unlocked on this device” in unlock UI |

Passwords stored as **PBKDF2** hash in `group.json`. Changing password bumps `passwordVersion` and invalidates old tokens.

### Legacy migration

On first run, `data/metadata.json` and `data/groups.json` are imported into each library’s `_rollo/` folder. Backups saved as `*.bak`.

---

## 5. Client architecture (PWA)

All main pages share:

| Module | Role |
|--------|------|
| `groups.js` | Active library, unlock tokens, `apiFetch`, `mediaUrl` auth query |
| `bottom-nav.js` | Profile / Feed / Download tabs; profile long-press & double-tap |
| `pwa.js` | Service worker registration; blocks pinch-zoom during menus |
| `layout-metrics.js` | `ios-standalone` class for iOS PWA viewport (`100lvh` dock) |
| `icons.js` | SVG icon strings |
| `hearts.js` | Animated favorite hearts |
| `tag-colors.js` | Deterministic tag chip colors |
| `toast.js` | Ephemeral status messages |
| `servers.js` | Multi-server list (imported on every page via `RolloServers.importSeedFromUrl()`) |

### Bottom navigation

Three tabs on all main pages:

1. **Profile** → `/` (`index.html`)
2. **Feed** → `/watch.html`
3. **Download** → `/download.html`

**Profile tab gestures** (`bottom-nav.js`):

- **Single tap** → navigate to Profile (respects `?group=` in URL)
- **Long press (500 ms)** → compact menu of other libraries
- **Double tap (320 ms window)** → cycle to next library in `groupOrder`

### URL parameters

| Param | Pages | Purpose |
|-------|-------|---------|
| `group` | All | Active library ID |
| `video` | Feed | Start at specific file |
| `mode` | Feed | `order`, `shuffle`, `favorites`, `tag`, `untagged` |
| `tag` | Feed | Pre-select tag filter |
| `rolloSeed` | All (transient) | Base64 server list sync when switching origins |

---

## 6. Profile page

**File:** `public/index.html`  
**Purpose:** Grid/collections browser, uploads, library management.

### Header

- **Library picker** (chevron button) → full library sheet: list, star default, drag reorder, add profile
- **Video count** under library name
- **Search** toggle (⌕)
- **More** (⋯) → settings sheet
- **Network speed badge** (tiny KB/s in header actions)

### Views

| View | Storage key | Description |
|------|-------------|-------------|
| **Grid** | `profileView=grid` | Thumbnail grid with lazy thumb loading |
| **Collections** | `profileView=collections` | Tag-grouped mosaic cards; tap to drill in |

### Filters & sort

- **Filters:** All · Favorites · per-tag chips · search text
- **Sort:** Newest · Oldest · Name · By tag (default) · Favorites first
- **Grid size:** XS / S / M / L (`gridSize` in localStorage)

### Upload queue

- **FAB (+)** opens multi-file picker
- Supported: images, videos, GIF, HEIC, WebP, MP4, WebM, MOV, MKV, etc.
- **Sequential XHR** uploads to `POST /api/videos/upload`
- Queue panel shows: pending → uploading (progress bar) → done / failed / cancelled
- **Cancel (×)** aborts in-flight XHR
- Max aligned with server: 20 files, 4 GB each
- Blocked if active library is locked without token

### More menu

- **Group settings** (display name, password, lock mode, folder rename, delete empty library)
- **Servers** → `/connect.html`
- **Export tags** (CSV download)
- **Import tags** (CSV upload)
- **Update** (PWA shell refresh via service worker)

### Per-video actions (long-press radial menu)

Built dynamically per card via `getVideoActionOptions()`:

1. **Favorite** — toggle heart (label/icon updates)
2. **Edit tags** — quick tap opens tags sheet; **hold 520 ms** opens anchored tag palette spread
3. **Move to…** — submenu lists other libraries (with lock icons)
4. **Edit name** — rename sheet
5. **Delete** — confirm sheet

### Sheets (modal bottom panels)

Group picker · More · Rename · Delete · Move · Group settings · Tag editor · Action sheet

### Locked library on Profile

- Switching to locked library **does not change active group** until unlock succeeds
- **Inline unlock** in library picker (glass panel under tapped row)
- **Grid overlay** when switching via bottom nav or on startup
- `RolloUnlockFlow`: password, remember toggle, saved-password button, inline error + shake

---

## 7. Feed page

**File:** `public/watch.html`  
**Purpose:** TikTok-style vertical full-screen player.

### Scroll model

- `#feed` is fixed full-viewport with `scroll-snap-type: y mandatory`
- One `.video-card` per media item, `scroll-snap-align: start`
- **IntersectionObserver** + scroll-end settling picks active card
- **Android optimizations:** debounced play/pause, no scroll reset during swipe, GPU layer on media, `scroll-snap-stop: normal`

### View modes

| Mode | Label | Behavior |
|------|-------|----------|
| `order` | In order | Filename / date order |
| `shuffle` | Shuffle | Random order (regenerated per session key) |
| `favorites` | Favorites | `favorite: true` only |
| `tag` | By tag | Filter by `selectedTag` |
| `untagged` | Untagged | No tags |

Persisted in `localStorage.viewMode`; overridable via URL `?mode=` and `?tag=`.

### Per-card chrome

| Control | Position | Action |
|---------|----------|--------|
| Aspect | Right column | Toggle contain vs cover (`feedAspectMode`) |
| Favorite | Right column | Toggle heart |
| Tag | Right column | Tap → tag sheet; hold → anchored palette |
| Mute | Right column | Global mute (`watchMuted`) |
| **Network speed** | Fixed below right stack | Ring + KB/s label |
| Seek bar | Bottom | Scrub video; hidden for images |
| Overlay | Bottom-left | Title, time, tag chips |

### Gestures

- **Tap center** — play/pause (images toggle overlay visibility)
- **Hold left** — rewind at 2×
- **Hold right** — fast-forward at 2×
- **Chrome** auto-hides after idle; seek bar appears on interaction

### Media handling

- **Videos:** `playsInline`, lazy `src`, preload nearby cards (±2), unload distant (±3) when scroll settled
- **Images:** `<img>` with `decoding=async`, no seek bar

---

## 8. Download page

**File:** `public/download.html`  
**Purpose:** Paste URLs, run yt-dlp, manage X/Twitter auth.

### Flow

1. Select target **library** (respects locks)
2. Choose **quality:** fast (720p) · hd (1080p) · best (2160p)
3. Paste URL → `POST /api/download?group=`
4. Poll `GET /api/download/:jobId` until complete/failed
5. **Recent downloads** from `GET /api/downloads` with tag chips on completed items

### Platform differences

| Feature | PC | Android APK |
|---------|-----|-------------|
| yt-dlp | System PATH / WinGet | **youtubedl-android** native worker |
| ffmpeg | System PATH | Bundled in worker |
| X auth | `x-login.html` + browser cookies | `RolloBridge.connectX()` → WebView |
| Ready check | `GET /api/downloader/status` | Same + `android-downloader/ready` marker |

### X / Twitter

- Many X URLs require signed-in cookies before download
- PC: probe browser cookies via `POST /api/downloader/x-session/confirm`
- Android: `window.RolloBridge` JS interface → `XLoginActivity`
- Clear session: `DELETE /api/downloader/x-session`

### Warnings

- UI shows banners when yt-dlp or ffmpeg missing (PC)
- Android shows bridge initialization state (10–30 s first launch)

---

## 9. Servers hub (multi-server)

**Files:** `public/connect.html`, `public/servers.js`  
**Access:** Profile → More → **Servers** (not a bottom tab — by design)

### Concept

Each Rollo instance is a **separate origin** (e.g. `http://192.168.1.10:3847`, `http://100.x.x.x:3847`). The client keeps a list in `localStorage.rolloServers`:

```json
[
  {
    "id": "srv-…",
    "name": "Home PC",
    "lanUrl": "http://192.168.1.10:3847",
    "remoteUrl": "http://100.64.0.5:3847"
  }
]
```

### Probing (`RolloServers.probe`)

1. Try **LAN URL** first — timeout **1.8 s** → `GET /api/status`
2. On failure, try **remote URL** (Tailscale) — timeout **3.2 s**
3. Status: online (lan/tailscale) · offline · checking

`/api/status` returns CORS `*` so any installed PWA can probe other machines.

### Server list sync (`rolloSeed`)

When navigating to another server, the full list is appended as base64 JSON in `?rolloSeed=`. The destination page calls `RolloServers.importSeedFromUrl()`, merges into localStorage, and strips the param from the URL.

```
Phone PWA  ──tap server──►  PC Rollo
     │                         │
     │  rolloSeed in URL       │
     └────────────────────────►│ merge server lists
```

### Hub features

- **Add this device** — auto-fill from local `/api/status` (hostname, LAN, Tailscale URLs)
- **Manual add/edit** name + LAN + Tailscale URLs
- **Backup / restore** server list as JSON file
- **Remove** server from list
- Tap **online** card → navigate to that origin’s `/`

### Independence per server

- Libraries, media, passwords, tags = **on that machine’s disk**
- Unlock tokens in browser = **per origin** (not shared across servers)
- No sync of metadata between servers except what you replicate via Syncthing on the files themselves

---

## 10. Dynamic UI patterns

Rollo avoids heavy frameworks. Interactive behavior is built from **small reusable modules** that generate DOM and wire pointer events at runtime.

### Press radial menu (`press-radial-menu.js`)

**Trigger:** long-press ~**420 ms** on profile grid cards (and some download UI).

**Options array** is built fresh each open — labels, icons, tones, and submenus are **dynamic per video**:

```javascript
PressRadialMenu.bindCardLongPress(card, () => [
  { id: "fav", label: video.favorite ? "Unfavorite" : "Favorite", … },
  { id: "tags", label: "Edit tags", tagPalette: { … } },
  { id: "move", label: "Move to…", submenu: otherLibraries.map(…) },
  { id: "rename", label: "Edit name", … },
  { id: "delete", label: "Delete", tone: "delete", … },
]);
```

**Layout adaptation** based on card position in viewport:

| Layout | When |
|--------|------|
| `arc-left` / `arc-right` | Default at screen edges |
| `arc-up` / `arc-down` | Near top/bottom |
| `linear-top` / `linear-bottom` | Tight vertical space |

**Submenus:** e.g. “Move to…” opens a second row of library chips without closing the menu.

**Tag palette integration:** holding the “Edit tags” option **520 ms** opens `AnchoredTagPalette` in spread mode; quick release opens the full tags sheet.

**Safari:** touch handlers prevent default on long-press to avoid video grab / context menu.

### Anchored tag palette (`anchored-tag-palette.js`)

- Flyout of tag chips anchored to a button
- Used on **Feed** tag button and **Profile** via radial menu
- **Blurry glass** chip backgrounds (`backdrop-filter`)
- Scroll-lock on feed while open
- `onTap` vs hold behavior configured per binding site

### Bottom nav profile menu (`bottom-nav.js`)

- Dynamically renders other libraries from `getGroups()` callback
- Respects `groupOrder` from localStorage
- Shows lock icon for locked libraries

### Connect server cards (`servers.js` + `connect.html`)

- Cards rebuilt on each probe cycle
- States: checking · online (LAN/Tailscale badge) · offline
- “This device” card when current origin matches

### Icon system (`icons.js` + `hearts.js`)

- `RolloIcons.*` returns inline SVG strings (lock, star, volume, etc.)
- `HeartIcon.mount(el, favorited, { size, pop })` — used in filters, cards, feed buttons

### Network speed (`network-speed.js`)

- Hooks `fetch`, XHR, `PerformanceObserver`, video `progress`
- **Profile variant:** small text in header
- **Feed variant:** fixed ring widget below right control column
- States: `idle` · `loading` · `active` · `stalled`

### Unlock flow (`unlock-flow.js`)

- **Inline** panel inserted under library row in picker
- **Grid overlay** with blurred backdrop for other entry points
- Dynamically wires biometric/saved-password button when available

### Sheet pattern

Shared across pages:

```html
<div class="sheet-backdrop"></div>
<div class="sheet">…</div>
```

Opened via `openSheet(backdrop, sheet)` — CSS transform slide-up. Used for rename, delete, move, group settings, tags, more menu.

### Menu popovers

Sort and grid-size use `.menu-popover` toggled by `toggleMenu()`; closed on document click.

---

## 11. Locked libraries & unlock flow

### Server

- `POST /api/groups/:id/unlock` with `{ password }` → `{ token }` or 401
- Token sent as header `X-Unlocked` on API calls
- Media URLs get `?unlocked=` query param via `VideoGroups.mediaUrl()`

### Client (`public/groups.js` + `unlock-flow.js`)

| Storage | Key | Purpose |
|---------|-----|---------|
| `sessionStorage` | `rolloSessionUnlocks` | Session-only tokens |
| `localStorage` | `groupUnlocks` | “Stay unlocked on this device” |
| `localStorage` | `activeGroup` | Current library (unchanged until unlock OK) |

**`RolloUnlockFlow` behaviors:**

- Glass card with lock icon, password field, remember checkbox
- **Enter** submits; wrong password → shake + haptic + inline error (no toast)
- **Use saved password** when Credential Management API available
- Cancel restores previous state without flashing empty locked grid

---

## 12. PWA & offline shell

**Manifest:** `public/manifest.json` — `standalone`, maskable icons, `start_url: /`

**Service worker:** `public/sw.js` — cache name `rollo-shell-v13`

### Precached (app shell only)

HTML pages, CSS, JS modules listed in `PRECACHE` array — **not** `/api/*` or `/videos/*`.

### Install behavior

- `pwa.js` registers SW on load
- iOS: `apple-mobile-web-app-capable`, `black-translucent` status bar
- `layout-metrics.js` fixes bottom dock vs `100lvh` on iOS standalone

### Offline limitations

- Media and API require network (or local server on same device)
- Shell UI loads offline; content does not
- Some newer assets may lag precache list — bump `CACHE` version and use **More → Update**

---

## 13. Windows tray launcher (Rollo.exe)

**Source:** `launcher/RolloTray/` (.NET 8 WinForms)  
**Build:** `launcher/build-launcher.bat` → copies `Rollo.exe` to repo root

### Features

| Feature | Implementation |
|---------|----------------|
| Start / stop server | Spawns `node server.js` with configured port |
| Open in browser | Opens `http://localhost:{port}` |
| System tray icon | Double-click to show window |
| **Start with Windows** | Registry `Run` key via `StartupRegistry.cs` |
| **Auto-start server** | `AutoStartServer` in config — starts Node minimized at launch |
| `--startup` arg | Launched at login → minimize to tray |

### Config (`RolloConfig`)

Persisted settings: port, paths, `AutoStartWithWindows`, `AutoStartServer`.

### Requirements

- **.NET 8 Desktop Runtime** on target PC (unless built self-contained)
- **Node.js** on PATH (tray app shells out to `node server.js`)

### vs `start-rollo.bat`

| | `start-rollo.bat` | `Rollo.exe` |
|--|-------------------|-------------|
| UI | Console window | Tray + optional settings form |
| Auto-start | Manual | Registry + auto-start server |
| Stop server | Close console | Tray menu Stop |

---

## 14. Android standalone APK

**Docs:** `android/README.md`  
**Build:** `npm run build:android:release`

### Architecture

```
MainActivity (WebView → http://127.0.0.1:3847/)
       │
RolloService (foreground notification)
       │
NodeRunner (JNI → libnode.so → nodejs-mobile)
       │
main.js → server.js (bundled in assets/nodejs-project/)
       │
AndroidDownloadWorker (youtubedl-android) ←→ lib/android-downloader.js
```

### First-launch permissions

1. Notifications (foreground service)
2. **All files access** — creates `Internal storage/Rollo/Videos`
3. Battery optimization exemption (toolbar **Battery** button to re-open)

### Toolbar (native over WebView)

| Control | Purpose |
|---------|---------|
| **Show in Gallery** | Per-library `.nomedia` toggle (`GalleryVisibility.kt`) |
| **Battery** | Request ignore battery optimizations |
| **Update** | Pull latest `server.js`, `lib/`, `public/` from GitHub |

### Asset sync before build

`scripts/sync-android-assets.js` copies `server.js`, `lib/`, `public/`, `package.json` into `android/app/src/main/assets/nodejs-project/` and runs `npm install --omit=dev`.

### Native bridges

| Bridge | Direction | Purpose |
|--------|-----------|---------|
| `RolloJsBridge` | JS → Kotlin | X login: `connectX()`, `isXConnected()`, `disconnectX()` |
| `android-downloader/` files | Node ↔ Kotlin | yt-dlp job requests & progress JSON |

### Environment (set by app)

| Variable | Typical value |
|----------|---------------|
| `VIDEOS_DIR` | `/storage/emulated/0/Rollo/Videos` |
| `DATA_DIR` | App private files directory |
| `VIDEO_SECRET` | Generated once, stored in app prefs |
| `PORT` | `3847` |

### APK notes

- Size ~**60–80 MB** (Node runtime + deps)
- Release signing: `android/rollo-release.jks` (back up key)
- `MANAGE_EXTERNAL_STORAGE` may complicate Play Store; sideload is fine for personal use

---

## 15. Build, deploy & scripts

| Command | Action |
|---------|--------|
| `npm install` | Install dependencies |
| `npm start` | Run `node server.js` |
| `npm test` | Run groups, metadata, downloader unit tests |
| `npm run sync:android` | Copy server bundle into APK assets |
| `npm run build:android:release` | Sync + PowerShell release build → `app-release.apk` |
| `npm run android:keystore` | Create release signing keystore |
| `npm run icons:pwa` | Generate PNG icons from SVG (sharp) |
| `npm run graphify` | Build knowledge graph → `graphify-out/` |
| `npm run graphify:update` | Incremental graph refresh |
| `npm run graphify:query -- "…"` | Query existing graph |
| `launcher/build-launcher.bat` | Build `Rollo.exe` tray app |
| `start-rollo.bat` | Quick Windows start |

### Android native libs

`android/setup-libnode.ps1` / `.sh` downloads **nodejs-mobile** `libnode.so` into `jniLibs/`. Gradle task `ensureLibnode` runs if missing.

### Remote access

Install **Tailscale** on phone and PC. Use Tailscale IP from the app:

```
http://100.x.x.x:3847
```

Add both LAN and Tailscale URLs in Servers hub for automatic path selection.

---

## 16. Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3847` | HTTP listen port |
| `VIDEOS_DIR` | `./videos` | Media root (library subfolders) |
| `DATA_DIR` | `./data` | Global data, X cookies, Android bridge |
| `GROUPS_PATH` | `{DATA_DIR}/groups.json` | Legacy groups file path |
| `VIDEO_SECRET` | `rollo-local-secret` | HMAC secret for unlock tokens — **set in production** |
| `LIBRARY_IDS` | — | JSON array fallback when disk listing fails (Android) |

---

## 17. API reference

All group-scoped routes use `?group={libraryId}` unless noted. Locked libraries require `X-Unlocked` header.

### Status & network

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Hostname, libraries, video counts, network URLs, hints (CORS `*`) |
| GET | `/api/access` | Network URLs only |

### Libraries

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/groups` | List libraries with lock state, counts |
| POST | `/api/groups` | Create library folder |
| POST | `/api/groups/:id/unlock` | Password → unlock token |
| PUT | `/api/groups/:id` | Display name, password, lock mode |
| POST | `/api/groups/:id/rename` | Rename folder on disk |
| DELETE | `/api/groups/:id` | Delete if empty |

### Media

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/videos` | List with metadata |
| GET | `/api/videos/:file/thumb` | Thumbnail (generates via ffmpeg) |
| POST | `/api/videos/upload` | Multipart upload |
| PUT | `/api/videos/:file/metadata` | Tags, favorite |
| PUT | `/api/videos/:file/rename` | Rename file |
| POST | `/api/videos/:file/move` | Move to another library |
| DELETE | `/api/videos/:file` | Delete file + meta + thumb |
| GET | `/videos/:group/:file` | Stream media file |

### Tags

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tags` | Distinct tags in library |
| GET | `/api/metadata/export` | CSV download |
| POST | `/api/metadata/import` | CSV import |

### Downloader

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/downloader/status` | yt-dlp, ffmpeg, X session info |
| POST | `/api/download` | Start job → 202 + jobId |
| GET | `/api/download/:jobId` | Job status |
| GET | `/api/downloads` | Recent jobs |
| DELETE | `/api/downloader/x-session` | Clear X cookies |
| POST | `/api/downloader/x-session/confirm` | Probe browser cookies |

---

## 18. Client-side storage keys

| Key | Content |
|-----|---------|
| `activeGroup` | Current library ID |
| `defaultGroup` | Starred default library |
| `groupOrder` | Drag order array for library list |
| `groupUnlocks` | Persistent unlock tokens (localStorage) |
| `rolloSessionUnlocks` | Session unlock tokens |
| `rolloServers` | Multi-server connection list |
| `sortMode` | Profile sort preference |
| `gridSize` | Profile grid size (xs–lg) |
| `profileView` | `grid` or `collections` |
| `viewMode` | Feed view mode |
| `selectedTag` | Feed tag filter |
| `watchMuted` | Feed global mute |
| `feedAspectMode` | `original` or `fill` |

---

## 19. Terminology

| Code / file | UI label |
|-------------|----------|
| `group` / `groupId` | Library · Profile |
| `VideoGroups` | Client library manager |
| `meta.json` | Tags & favorites |
| `group.json` | Library settings & lock |
| `_rollo/` | Hidden metadata folder per library |

---

*Last updated to reflect commit `9015515` and documentation in `docs/`.*
