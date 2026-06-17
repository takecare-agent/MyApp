#!/usr/bin/env bash
# 建置可離線安裝到實機的 Release APK（JS 已打包，不需 Metro）
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
echo "==> npm install（若已裝過會很快）"
npm install

echo "==> 建置 Release APK（約 3~8 分鐘）"
cd android
chmod +x gradlew
./gradlew assembleRelease

mkdir -p "$OUT_DIR"
cp -f app/build/outputs/apk/release/app-release.apk "$OUT_DIR/$APK_NAME"

echo ""
echo "完成！APK 位置："
echo "  $OUT_DIR/$APK_NAME"
ls -lh "$OUT_DIR/$APK_NAME"
