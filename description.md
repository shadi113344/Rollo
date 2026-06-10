# Rollo — Application Description

## Overview

**Rollo** is a self-hosted personal media library for photos and videos. It runs as a small Node.js server on your own machine and is designed to be used from phones and tablets on the same Wi‑Fi network or over **Tailscale**, without relying on a cloud service or third-party hosting.

The experience is intentionally mobile-first: dark UI, touch gestures, vertical video feed, and optional **Add to Home Screen** PWA support so it feels like a native app.

---

## Core Concepts

### Libraries (groups)

Media is organized into **libraries** (also called groups or profiles). Each library:

- Maps to a folder on disk: `videos/{LibraryName}/`
- Can have a friendly **display name** separate from the folder name
- Can optionally be **password-protected**
- Maintains its own file list, tags, and favorites

Users switch libraries from the Profile page header. The active library is remembered in the browser and reflected in the URL (`?group=...`) so links to Profile and Feed stay in sync.

### Media items

Each file in a library is a **media item** — either a **video** or an **image**. Supported formats include common web and mobile types (MP4, MOV, WebM, GIF, PNG, JPEG, HEIC, WebP, and others).

Per-item metadata (stored separately from the files):

- **Display name** — editable label shown in the UI (defaults to the filename without extension)
- **Tags** — free-form strings for filtering and grouping
- **Favorite** — boolean heart flag

---

## User Interface

Rollo has two main tabs, shared across both pages via a bottom navigation bar:

| Tab | Page | Role |
|-----|------|------|
| **Profile** | `/` (`index.html`) | Browse, search, upload, and manage the library |
| **Feed** | `/watch.html` | Full-screen, swipeable playback (Reels-style) |

### Profile — library grid

The Profile page is the **management and discovery** view:

- **Header** — library picker, file count, search, and overflow menu
- **Filters** — All, Favorites, and per-tag chips (color-coded)
- **Sort** — Newest, Oldest, Name, By tag (with section headers), Favorites first
- **Grid size** — XS / S / M / L thumbnail density
- **Thumbnail grid** — lazy-loaded previews with play overlay; tap opens the item in Feed
- **Long-press** on a thumbnail — favorite, edit tags, rename, or delete
- **Upload FAB** — multi-file upload from the device (images and videos, up to 4 GB each)
- **More menu** — library settings, export/import tags as CSV

Scrolling happens inside a dedicated scroll container so the fixed bottom tab bar stays pinned on mobile Safari.

### Feed — immersive playback

The Feed page is the **consumption** view, optimized for vertical scrolling through items one at a time:

- **Scroll-snap** — each item fills the viewport; swipe up/down to move between clips
- **Video fit** — portrait content uses `cover` (edge-to-edge); landscape uses `contain` (full frame visible)
- **Tap** — play / pause (videos) or toggle chrome (images)
- **Hold left / right** — 2× rewind or 2× fast-forward
- **Seek bar** — thin scrubber along the top edge of the bottom dock; draggable on touch
- **Controls** — favorite, tag editor, mute/unmute (global mute preference is persisted)
- **Sort modes** — In order, Shuffle, Favorites only, By tag (with expandable tag picker)
- **Auto-advance** — when a video ends, the next item scrolls into view
- **Lazy loading** — only nearby cards load media; distant cards unload to save memory

Chrome (top sort menu, captions, side buttons) auto-hides during playback and reappears on interaction.

---

## Organization & Search

- **Tags** are arbitrary strings (e.g. `diet`, `Varicocele`). They drive filter chips on Profile and sort/filter modes on Feed.
- **Favorites** are per-file flags, filterable on both pages.
- **Search** on Profile matches against display names and filenames.
- **CSV export/import** — bulk tag and favorite data for backup or editing in a spreadsheet; keyed by filename within a library.

Tag colors are assigned deterministically from the tag name for visual consistency.

---

## Security & Privacy

- All media stays **on your machine** in the `videos/` directory.
- Libraries can be **locked with a password** (PBKDF2-hashed on the server).
- Successful unlock returns a **time-limited HMAC token** stored in the browser; subsequent API calls send it via the `X-Unlocked` header.
- Locked libraries return `403` until unlocked; the UI shows a password sheet.
- Set `VIDEO_SECRET` in production so unlock tokens cannot be forged.

There is no user account system — access control is per-library password plus network reachability to your server.

---

## Technical Architecture

### Stack

| Layer | Technology |
|-------|------------|
| Server | Node.js, Express 5 |
| Uploads | Multer (disk storage, multi-file) |
| Client | Vanilla HTML/CSS/JS (no framework) |
| Persistence | JSON files on disk |

### Server (`server.js`)

- Serves static assets from `public/`
- REST-style JSON API under `/api/`
- Scans library folders for media files; caches directory listings
- Reads/writes `data/metadata.json` (tags, favorites, display names per file)
- Reads/writes `data/groups.json` (display names, password hashes per library)
- On startup, prints **localhost**, **LAN**, and **Tailscale** URLs (default port **3847**)

### Key API surface

| Endpoint | Purpose |
|----------|---------|
| `GET /api/groups` | List libraries and lock state |
| `POST /api/groups` | Create library |
| `POST /api/groups/:id/unlock` | Password unlock → token |
| `PUT /api/groups/:id` | Rename, set/remove password |
| `POST /api/groups/:id/rename` | Rename library folder |
| `DELETE /api/groups/:id` | Delete empty library |
| `GET /api/videos?group=` | List media in a library |
| `POST /api/videos/upload?group=` | Upload files |
| `GET /api/tags?group=` | Distinct tags in a library |
| `PUT /api/videos/:file/metadata` | Update tags / favorite |
| `PUT /api/videos/:file/rename` | Rename file on disk |
| `DELETE /api/videos/:file` | Delete file |
| `GET/POST /api/metadata/export|import` | CSV tag backup |

Media files are served as static content under `/videos/{group}/...`.

### Client modules (`public/`)

| File | Role |
|------|------|
| `index.html` | Profile grid UI |
| `watch.html` | Feed player UI |
| `groups.js` | Active library, unlock tokens, authenticated fetch helpers |
| `media.js` | Shared filename / extension helpers |
| `tag-colors.js` | Tag chip styling |
| `hearts.js` / `heart.css` | Favorite icon component |
| `toast.js` | Transient notifications |
| `layout-metrics.js` | Bottom dock height measurement |
| `bottom-nav.css` | Shared Profile / Feed tab bar |
| `manifest.json` | PWA manifest (standalone, black theme) |

Client state (grid size, sort mode, feed view mode, mute, selected tag) is persisted in **localStorage** where appropriate.

---

## Data Layout

```
Rollo/
├── server.js              # HTTP server and API
├── lib/
│   ├── groups.js          # Library config, passwords, tokens
│   ├── media.js           # Format detection
│   └── network.js         # LAN / Tailscale URL discovery
├── public/                # Web UI (static)
├── videos/
│   └── {LibraryName}/     # Actual media files
└── data/
    ├── groups.json        # Library display names & passwords
    └── metadata.json      # Per-file tags, favorites, display names
```

---

## Deployment & Access

Typical usage:

1. Run `npm install` && `npm start` (or `start-rollo.bat` on Windows).
2. Open the printed URL on a phone — same Wi‑Fi uses the LAN IP; remote access uses **Tailscale** (`100.x.x.x`).
3. Optionally add to home screen for full-screen PWA behavior.

The default port **3847** avoids colliding with common dev servers (e.g. port 3000). Override with the `PORT` environment variable.

---

## Design Intent

Rollo is built for a single owner (or household) who wants:

- A **private**, **local** photo/video collection
- **Phone-friendly** browsing and Reels-style playback
- **Lightweight organization** via tags and favorites rather than albums or databases
- **Optional separation** of sensitive libraries behind passwords
- **Zero subscription** — just a folder of files and a small server

It is not a social platform, transcoding pipeline, or multi-user cloud product; it is a thin, fast layer over files on disk with a polished mobile web front end.
