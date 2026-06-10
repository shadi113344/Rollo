#!/usr/bin/env bash
set -euo pipefail

VERSION="18.20.4"
ZIP="nodejs-mobile-v${VERSION}-android.zip"
URL="https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v${VERSION}/${ZIP}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
LIBNODE="${ROOT}/app/libnode"
JNILIBS="${ROOT}/app/src/main/jniLibs"
TMP="${TMPDIR:-/tmp}/${ZIP}"

echo "Downloading nodejs-mobile v${VERSION}..."
curl -L "$URL" -o "$TMP"
rm -rf "$LIBNODE"
mkdir -p "$LIBNODE"
unzip -q "$TMP" -d "$LIBNODE"
rm "$TMP"

mkdir -p "$JNILIBS"
for abi in arm64-v8a armeabi-v7a x86_64; do
  src="${LIBNODE}/bin/${abi}/libnode.so"
  if [[ -f "$src" ]]; then
    mkdir -p "${JNILIBS}/${abi}"
    cp "$src" "${JNILIBS}/${abi}/libnode.so"
    echo "Installed libnode.so for ${abi}"
  fi
done

echo "Done."
