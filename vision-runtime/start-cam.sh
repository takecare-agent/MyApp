#!/bin/zsh
# 開房間鏡頭（外接 cam 0）。不要再開第二支。
cd "$(dirname "$0")"
echo "鏡頭啟動中：cam 0＝轉接頭 HD WEB CAMERA。第一次載入常要 1～2 分鐘，請等到「就緒」。"
echo "不要用 1（Mac 內建）或 2（iPhone 塔塔相機）。這個視窗不要關、不要再開第二支。"
# macOS 最佳化儲存會把 Desktop/.venv 變成 dataless，import 會卡死
if find .venv -flags +dataless 2>/dev/null | grep -q .; then
  echo "套件曾被系統清掉，先抓回本機…"
  ./hydrate-venv.sh
fi
TOKEN=$(grep '^VISION_SHARED_TOKEN=' ../backend/.env | cut -d= -f2-)
export MPLBACKEND=Agg
export TF_CPP_MIN_LOG_LEVEL=3
export VISION_BACKEND_URL=http://127.0.0.1:5000
export VISION_SHARED_TOKEN="$TOKEN"
export VISION_PATIENT_EMAIL=patient@test.com
export VISION_LOCATION=客廳
export HEADLESS=0
export VISION_CAM_INDEX=0
export VISION_PLAYBACK_SEC=72000
export PYTHONUNBUFFERED=1
export TF_CPP_MIN_LOG_LEVEL=3
exec caffeinate -dims .venv/bin/python vision_api_server.py --cam 0
