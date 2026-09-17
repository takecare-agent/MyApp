#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$HOME/Desktop/MyApp-main/mobile-expo"
OUT_DIR="$HOME/Desktop/TakeCare-demo"
APK_NAME="TakeCare-vision-integration.apk"

echo "==> 使用 Node 20.20.2"
export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"
nvm use 20.20.2

cd "$APP_DIR"
if [ ! -d node_modules ]; then
  echo "==> npm install"
  npm install
fi

printf '%s\n' 'export const usb = ""' 'export const wifi = ""' 'export const tunnel = ""' > src/lib/devHosts.generated.js

echo "==> 建置 Release APK"
cd android
chmod +x gradlew
./gradlew assembleRelease

mkdir -p "$OUT_DIR"
cp -f app/build/outputs/apk/release/app-release.apk "$OUT_DIR/$APK_NAME"

echo ""
echo "完成！APK 位置："
echo "  $OUT_DIR/$APK_NAME"
ls -lh "$OUT_DIR/$APK_NAME"
