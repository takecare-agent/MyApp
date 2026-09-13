#!/bin/bash
# 一次看後端 / Metro / 鏡頭 / 安卓 USB 有沒有活著。bash、zsh 都能跑。
ok=0
fail=0

check() {
  local name="$1" cmd="$2" expect="$3"
  local out
  out=$(eval "$cmd" 2>/dev/null | tr -d '\r')
  if printf '%s\n' "$out" | grep -q -- "$expect"; then
    echo "OK   $name"
    ok=$((ok + 1))
  else
    echo "FAIL $name"
    fail=$((fail + 1))
  fi
}

check "後端  :5000" "curl -sS -m 2 http://127.0.0.1:5000/" "Backend is running"
check "鏡頭  :8000" "curl -sS -m 2 http://127.0.0.1:8000/health" "state"
if curl -sS -m 2 http://127.0.0.1:8081/status 2>/dev/null | grep -q "packager-status:running"; then
  echo "OK   Metro :8081（iPhone／安卓除錯包都要；沒開會變舊版）"
  ok=$((ok + 1))
else
  echo "FAIL Metro :8081（兩台除錯包都會變舊版，離線 APK 才可不開）"
  fail=$((fail + 1))
fi

if command -v adb >/dev/null 2>&1; then
  if adb devices 2>/dev/null | grep -q $'\tdevice$'; then
    echo "OK   安卓 USB"
    ok=$((ok + 1))
  else
    echo "FAIL 安卓 USB（沒插或沒授權）"
    fail=$((fail + 1))
  fi
else
  echo "SKIP 安卓 USB（沒有 adb）"
fi

echo "—— $ok 過 / $fail 沒過 ——"
exit $fail
