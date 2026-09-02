#!/bin/zsh
# 開房間鏡頭（外接 cam 0）。不要再開第二支。
cd "$(dirname "$0")"
TOKEN=$(grep '^VISION_SHARED_TOKEN=' ../backend/.env | cut -d= -f2-)
export VISION_BACKEND_URL=http://127.0.0.1:5000
export VISION_SHARED_TOKEN="$TOKEN"
export VISION_PATIENT_EMAIL=patient@test.com
export VISION_LOCATION=客廳
export HEADLESS=0
export VISION_CAM_INDEX=0
export VISION_PLAYBACK_SEC=72000
exec caffeinate -dims .venv/bin/python vision_api_server.py --cam 0
