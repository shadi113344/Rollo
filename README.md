# Rollo

Personal media library — browse photos and videos from your LAN or Tailscale network.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3847` (or the LAN/Tailscale URL printed in the terminal).

Default port is **3847** (avoids common dev ports like 3000). Override with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

On Windows, double-click **`start-rollo.bat`** (sets `PORT=3847`).

To rename the project folder from `video-page` to `Rollo`, close Cursor, run **`rename-folder-to-Rollo.bat`**, then reopen `c:\Storage\Rollo`.

## Environment

| Variable | Purpose |
|----------|---------|
| `VIDEO_SECRET` | HMAC secret for group unlock tokens. Set this in production so tokens cannot be forged. |
| `VIDEOS_DIR` | Override media folder (default: `./videos`). Android app uses `Internal storage/Rollo/Videos`. |
| `DATA_DIR` | Override metadata folder (default: `./data`). Holds `metadata.json` and `groups.json`. |
| `GROUPS_PATH` | Override path to `groups.json` (default: `{DATA_DIR}/groups.json`). |
| `PORT` | HTTP port (default: **3847**). |

Example:

```bash
VIDEO_SECRET=your-long-random-string npm start
```

Android / custom storage example:

```bash
export VIDEOS_DIR="/storage/emulated/0/Rollo/Videos"
export DATA_DIR="$HOME/Rollo/data"
export VIDEO_SECRET=your-long-random-string
npm start
```

## Android app

See [`android/README.md`](android/README.md) for building the APK (Node.js embedded, auto-creates `Rollo/Videos`, foreground service + WebView).

Quick build:

```bash
npm run sync:android
cd android && ./setup-libnode.sh   # or setup-libnode.ps1 on Windows
# Open android/ in Android Studio → Build APK
```

## Libraries

- Media files live in `videos/{LibraryName}/`
- Tags and favorites in `videos/{LibraryName}/_rollo/meta.json` (syncs with Syncthing)
- Passwords and lock mode in `videos/{LibraryName}/_rollo/group.json` (syncs with Syncthing)
- Legacy `data/metadata.json` and `data/groups.json` are imported into `_rollo/` on first run (backups saved as `*.bak`)

Locked libraries require a password; unlock tokens are stored in the browser and sent via the `X-Unlocked` header.

## Documentation

Full architecture, features, deployment modes, and known issues:

- [`docs/APP-STRUCTURE.md`](docs/APP-STRUCTURE.md) — complete app reference
- [`docs/ISSUES-AND-ENHANCEMENTS.md`](docs/ISSUES-AND-ENHANCEMENTS.md) — bugs, security notes, roadmap
- [`docs/README.md`](docs/README.md) — index

## Tests

```bash
npm test
```

## Graphify (optional)

Graphify is available in this project for codebase knowledge graph workflows.

```bash
npm run graphify
```

Useful commands:

```bash
# incremental refresh after file changes
npm run graphify:update

# ask questions against an existing graph
npm run graphify:query -- "Where is group auth handled?"
```

Outputs are written to `graphify-out/` locally (ignored by git).
