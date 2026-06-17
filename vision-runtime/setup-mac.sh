#!/usr/bin/env bash
# TakeCare Vision — macOS/Linux 安裝
set -euo pipefail
cd "$(dirname "$0")"

pick_python() {
  for cmd in python3.12 python3.11 python3.10; do
    if command -v "$cmd" >/dev/null 2>&1; then
      echo "$cmd"
      return 0
    fi
  done
  return 1
}

PY="$(pick_python || true)"
if [ -z "$PY" ]; then
  echo "找不到 Python 3.10~3.12。"
  echo "macOS 請安裝：brew install python@3.11"
  echo "不要用系統內建 python3.9（會導致 tensorflow/mediapipe 安裝失敗）。"
  exit 1
fi

echo "==> 使用 $PY ($($PY --version))"
echo "==> 建立虛擬環境 .venv"
rm -rf .venv
"$PY" -m venv .venv
source .venv/bin/activate

echo "==> 升級 pip"
python -m pip install --upgrade pip

echo "==> 安裝套件（首次約 5~15 分鐘）"
pip install -r requirements.txt

echo ""
echo "安裝完成。之後每次啟動只要："
echo "  cd $(pwd)"
echo "  source .venv/bin/activate"
echo "  python vision_api_server.py"
