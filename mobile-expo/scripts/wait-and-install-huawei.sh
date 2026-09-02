#!/bin/zsh
set -e
cd "$HOME/Desktop/MyApp-main/mobile-expo"

echo ""
echo "========================================"
echo "  TakeCare：等華為 USB，然後裝 Debug"
echo "========================================"
echo "熱點只能讓華為登入／看影像。"
echo "新畫面必須先用線裝一次 Debug。"
echo ""
echo "請現在做："
echo "  1) 華為用「傳輸檔案」線插上這台 Mac"
echo "  2) 解鎖手機"
echo "  3) 跳出「允許 USB 偵錯」就按允許"
echo ""

while true; do
  LINE=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
  AUTH=$(adb devices | awk 'NR>1 && $2=="unauthorized" {print $1; exit}')
  if [[ -n "$LINE" ]]; then
    echo "已看到華為：$LINE"
    break
  fi
  if [[ -n "$AUTH" ]]; then
    echo "手機出現「允許 USB 偵錯」→ 請按允許（可勾一律允許）"
  else
    echo "還沒偵測到。確認線材是傳檔線，不是只能充電。"
  fi
  sleep 4
done

echo ""
echo "設定 port..."
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5000 tcp:5000
adb reverse tcp:8000 tcp:8000
echo "開始編譯並安裝（第一次可能 5～10 分鐘，不要關這個視窗）"
npm run android
echo ""
echo "裝完後：打開華為上的 TakeCare，回到這個 Metro 視窗按 r 才會更新。"
