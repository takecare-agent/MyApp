#!/bin/zsh
cd "$(dirname "$0")/.."
LAN=$(ipconfig getifaddr en0 2>/dev/null)
if [[ -z "$LAN" ]]; then
  LAN=$(ipconfig getifaddr bridge100 2>/dev/null)
fi
# 必須聽 0.0.0.0：USB adb reverse 走 127.0.0.1，熱點手機走 LAN IP
echo "TakeCare Metro  →  http://127.0.0.1:8081  （USB reverse）"
if [[ -n "$LAN" ]]; then
  echo "熱點／Wi-Fi 手機也可填  http://${LAN}:8081"
fi
echo "Ctrl+C 可停止，再執行本檔即可重啟。"
echo ""
exec npx react-native start --host 0.0.0.0 --reset-cache
