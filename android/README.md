# Rollo Android app

Native Android wrapper for Rollo: bundles Node.js via [nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile), runs the server in a foreground service, and opens the UI in a WebView.

## What it does automatically

- Creates **`Internal storage/Rollo/Videos`** for media (visible in My Files)
- Stores tags/passwords in app-private **`data/`**
- Generates and persists **`VIDEO_SECRET`**
- Starts the Node server on port **3847** (configurable in `RolloConfig.kt`)
- Shows a persistent notification while running
- Optional **Update from GitHub** button (pulls latest `server.js`, `lib/`, `public/`)

## Build prerequisites

- [Android Studio](https://developer.android.com/studio) (Ladybug or newer recommended)
- JDK 17+
- Node.js on your PC (to sync server assets)
- **Android NDK** (SDK Manager → SDK Tools → **NDK (Side by side)**) — packages `libc++_shared.so`, which `libnode.so` requires

## Build steps

From the repo root:

```bash
# 1. Copy server + install production node_modules into APK assets
node scripts/sync-android-assets.js

# 2. Download nodejs-mobile native libs (once — or auto on build)
cd android
./setup-libnode.sh        # macOS/Linux
# or: powershell -ExecutionPolicy Bypass -File setup-libnode.ps1

Gradle also runs `ensureLibnode` before each build if `jniLibs/` is empty.

# 3. One-time release signing (same key every build — fewer Play Protect warnings)
cd android
powershell -ExecutionPolicy Bypass -File setup-release-keystore.ps1   # Windows
# or: ./setup-release-keystore.sh                                     # macOS/Linux

# 4. Open android/ in Android Studio and Build > Build APK(s)
#    Or from repo root:
npm run build:android:release

The native `rollo-node` library implements the JNI bridge that calls `node::Start()` (required by nodejs-mobile).
```

Or from Android Studio: **File → Open → `android/`** → run on device.

## Install on phone

**Use the signed release APK** (not debug) for sideloading:

```
android/app/build/outputs/apk/release/app-release.apk
```

Build it with `npm run build:android:release` from the repo root.

### Release signing

| File | Purpose |
|------|---------|
| `android/rollo-release.jks` | Your private signing key — **back this up** |
| `android/keystore.properties` | Passwords (gitignored) |
| `android/setup-release-keystore.ps1` | Creates both files once |

Always sign releases with the **same** `rollo-release.jks`. Reinstalling an update signed with the same key upgrades in place; a new debug or ad-hoc key triggers Play Protect’s “unknown developer” warning again.

Play Protect may still show **Install anyway** the first time you sideload — that’s normal. Publishing via Google Play internal testing removes it for testers.

On first launch:

1. Allow **notifications** (foreground service)
2. Allow **All files access** (creates `Internal storage/Rollo/Videos`)
3. Allow **battery optimization exemption** when prompted (tap **Battery** in the toolbar anytime to re-open)
4. App starts server and opens Rollo

### Toolbar controls

| Control | Purpose |
|---------|---------|
| **Show in Gallery** | Per-library toggles under Settings: each profile folder (Gym, xXx, …) can be shown or hidden in Gallery independently. Hidden libraries stay on disk — nothing is deleted. |
| **Battery** | Opens system dialog to ignore battery optimization so the server keeps running. |
| **Update** | Pull latest `server.js`, `lib/`, `public/` from GitHub. |

## Browser Downloader (yt-dlp)

The Android APK bundles **youtubedl-android** (Python + yt-dlp + ffmpeg) and runs downloads on the phone. The first launch may take **10–30 seconds** before the Download tab shows as ready.

On **PC**, install yt-dlp separately: `winget install yt-dlp`

## Remote access (Tailscale)

Install Tailscale separately on the phone and other devices. Use the S10 Tailscale IP from the Tailscale app (not always what Termux prints):

```
http://100.x.x.x:3847
```

## Environment variables (set by the app)

| Variable | Location |
|----------|----------|
| `VIDEOS_DIR` | `/storage/emulated/0/Rollo/Videos` |
| `DATA_DIR` | App private files dir |
| `VIDEO_SECRET` | Generated once, stored in app prefs |
| `PORT` | Default 3847 |

## Project layout

```
android/
  app/src/main/
    assets/nodejs-project/   # Node bundle (synced before build)
    java/com/rollo/app/      # Kotlin: Service, WebView, updater
    jniLibs/                 # libnode.so (from setup-libnode)
```

## Notes

- APK size is ~60–80 MB (Node runtime + dependencies).
- Disable battery optimization for Rollo on Samsung devices.
- Play Store listing may require extra review for `MANAGE_EXTERNAL_STORAGE` and foreground service types; sideload is fine for personal use.
