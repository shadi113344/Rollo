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

# 3. Open android/ in Android Studio and Build > Build APK(s)

The native `rollo-node` library implements the JNI bridge that calls `node::Start()` (required by nodejs-mobile).
```

Or from Android Studio: **File → Open → `android/`** → run on device.

## Install on phone

Sideload the APK from `android/app/build/outputs/apk/debug/app-debug.apk`.

On first launch:

1. Allow **notifications** (foreground service)
2. Allow **All files access** (creates `Internal storage/Rollo/Videos`)
3. Allow **battery optimization exemption** when prompted (tap **Battery** in the toolbar anytime to re-open)
4. App starts server and opens Rollo

### Toolbar controls

| Control | Purpose |
|---------|---------|
| **Show in Gallery** | Off (default): hides `Rollo/Videos` from Gallery using `.nomedia` (recursive) and a safe MediaStore hide flag — **files are never deleted**. On: removes markers and re-scans media into Gallery. |
| **Battery** | Opens system dialog to ignore battery optimization so the server keeps running. |
| **Update** | Pull latest `server.js`, `lib/`, `public/` from GitHub. |

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
