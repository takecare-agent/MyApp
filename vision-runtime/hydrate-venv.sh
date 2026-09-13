#!/bin/zsh
# 把被 macOS「最佳化儲存」清成 dataless 的 venv 檔抓回本機。
# 不抓的話 import mediapipe 會卡在 read()、永遠看不到「就緒」。
set -euo pipefail
cd "$(dirname "$0")"
n=$(find .venv -flags +dataless 2>/dev/null | wc -l | tr -d ' ')
if [[ "$n" -eq 0 ]]; then
  echo "venv 已在本機，不必抓檔。"
  exit 0
fi
echo "發現 $n 個被系統清掉的套件檔，正在抓回本機（可能 1～3 分鐘）…"
find .venv -flags +dataless -print0 | xargs -0 -P 8 -n 40 cat >/dev/null
left=$(find .venv -flags +dataless 2>/dev/null | wc -l | tr -d ' ')
echo "剩下 dataless：$left"
exit 0
