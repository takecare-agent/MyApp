#!/usr/bin/env bash
# TakeCare Vision — macOS/Linux 安裝
set -euo pipefail
cd "$(dirname "$0")"

echo "==> 建立虛擬環境"
python3 -m venv .venv
source .venv/bin/activate

echo "==> 升級 pip"
python -m pip install --upgrade pip

echo "==> 安裝套件"
pip install -r requirements.txt

echo ""
echo "安裝完成。啟動："
echo "  source .venv/bin/activate"
echo "  python vision_api_server.py"
