#!/usr/bin/env bash
# One-time setup: create a release keystore + keystore.properties for signed APK builds.

set -euo pipefail
ANDROID_DIR="$(cd "$(dirname "$0")" && pwd)"
KEYSTORE="$ANDROID_DIR/rollo-release.jks"
PROPS="$ANDROID_DIR/keystore.properties"

if [[ -f "$KEYSTORE" && -f "$PROPS" ]]; then
  echo "Release keystore already exists:"
  echo "  $KEYSTORE"
  echo "  $PROPS"
  exit 0
fi

command -v keytool >/dev/null 2>&1 || { echo "keytool not found. Install JDK 17+."; exit 1; }

STORE_PASS="$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)"
KEY_PASS="$STORE_PASS"
ALIAS="rollo"
DNAME="CN=Rollo-Server, OU=Personal, O=Rollo, L=Local, ST=Local, C=US"

echo "Creating release keystore at $KEYSTORE ..."
keytool -genkeypair -v \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$STORE_PASS" -keypass "$KEY_PASS" \
  -dname "$DNAME"

cat > "$PROPS" <<EOF
storeFile=rollo-release.jks
storePassword=$STORE_PASS
keyAlias=$ALIAS
keyPassword=$KEY_PASS
EOF

echo ""
echo "Done. Back up $KEYSTORE and $PROPS — use the same key for every release."
echo "Build: cd android && ./gradlew assembleRelease"
