#!/usr/bin/env bash
# 明天實機測試前檢查（Mac 上跑）
set -uo pipefail

echo "========== TakeCare 實機測試 Preflight =========="

IP_EN0=$(ipconfig getifaddr en0 2>/dev/null || true)
IP_EN1=$(ipconfig getifaddr en1 2>/dev/null || true)
IP="${IP_EN0:-$IP_EN1}"

echo ""
echo "【1】Mac 區網 IP（手機要填這個）"
if [ -n "$IP" ]; then
  echo "  建議 API Base URL：http://${IP}:5000"
  echo "  影像服務會自動變：http://${IP}:8000"
else
  echo "  ⚠️  抓不到 IP，請連 Wi‑Fi 後重跑，或手動 ipconfig getifaddr en0"
fi

echo ""
echo "【2】服務埠是否在聽"
for p in 5000 8000; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "  port $p ✅"
  else
    echo "  port $p ❌ 還沒開"
  fi
done

echo ""
echo "【3】本機健康檢查"
curl -s -m 2 "http://localhost:5000/" >/dev/null && echo "  後端 5000 ✅" || echo "  後端 5000 ❌"
curl -s -m 2 "http://localhost:8000/health" >/dev/null && echo "  影像 8000 ✅" || echo "  影像 8000 ❌"

echo ""
echo "【4】APK 是否存在"
APK="$HOME/Desktop/TakeCare-demo/TakeCare-vision-integration.apk"
if [ -f "$APK" ]; then
  ls -lh "$APK"
else
  echo "  ⚠️  還沒建，請跑：bash ~/Desktop/MyApp-main/scripts/build-demo-apk.sh"
fi

echo ""
echo "【5】已連接的 Android 手機"
ADB="${HOME}/Library/Android/sdk/platform-tools/adb"
if [ -x "$ADB" ]; then
  "$ADB" devices -l
else
  echo "  adb 找不到"
fi

echo ""
echo "【6】組員 Windows 影像沒畫面 — 常見原因"
echo "  - 他們電腦沒跑 vision-runtime（8000）"
echo "  - 實機卻填 10.0.2.2（那是模擬器專用）"
echo "  - 手機與電腦不在同一 Wi‑Fi"
echo "  - Windows 防火牆擋 8000"
echo ""
echo "明天由你的 Mac 跑後端+影像，手機只連你的 Mac IP 即可。"
