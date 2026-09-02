#!/usr/bin/env bash
# 種一週分散驗收資料：每日「需關注」＋「日常」；方便看歷程篩選與長條圖
set -euo pipefail
API="${1:-http://localhost:5000}"

CG=$(curl -sS -X POST "$API/mobile/dev-login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"caregiver@test.com","role":"caregiver","linkedPatientEmail":"patient@test.com"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

echo "token ok"

python3 - <<'PY' "$API" "$CG"
import json, sys, urllib.request
from datetime import datetime, timedelta, timezone

api, token = sys.argv[1], sys.argv[2]

def req(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(
        api + path,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(r, timeout=20) as res:
        return json.loads(res.read().decode())

# 清空未結案（若有）
hist = req("GET", "/caregiver/alerts/history?limit=100")
opens = [r for r in hist.get("records", []) if r.get("recordKind") == "alert" and r.get("status") in ("Pending", "Processing")]
if opens:
    rid = opens[0]["_id"]
    out = req("POST", f"/caregiver/alerts/{rid}/resolve", {"note": "驗收前清空未結案"})
    print("cleared open, superseded=", out.get("supersededCount"))

# 過去 7 天：每日 1～2 筆高風險（已處理）＋ 2～4 筆低／日常
now = datetime.now().astimezone()
created = {"high": 0, "low": 0, "open": 0}
for days_ago in range(6, -1, -1):
    day = (now - timedelta(days=days_ago)).replace(hour=10, minute=0, second=0, microsecond=0)
    # 高：跌倒通報（已結案）
    high_n = 1 if days_ago % 2 == 0 else 2
    for i in range(high_n):
        at = (day + timedelta(hours=i)).isoformat()
        rec = req("POST", "/caregiver/alerts", {
            "type": "fall",
            "severity": "High",
            "description": f"【驗收圖表】D-{days_ago} 高風險跌倒 #{i+1}",
            "happenedAt": at,
        })["record"]["_id"]
        req("POST", f"/caregiver/alerts/{rec}/resolve", {"note": "已協助起身"})
        created["high"] += 1
    # 低：日常（已結案，歷程「日常紀錄」）
    low_n = 2 + (days_ago % 3)
    for i in range(low_n):
        at = (day + timedelta(hours=3 + i)).isoformat()
        rec = req("POST", "/caregiver/alerts", {
            "type": "squat" if i % 2 == 0 else "bend-over",
            "severity": "Low",
            "description": f"【驗收圖表】D-{days_ago} 日常 {'蹲下' if i % 2 == 0 else '彎腰'} #{i+1}",
            "happenedAt": at,
        })["record"]["_id"]
        req("POST", f"/caregiver/alerts/{rec}/resolve", {"note": "僅紀錄無需處理"})
        created["low"] += 1

# 另留 1 筆「現在」未結案給看護測處理
open_rec = req("POST", "/caregiver/alerts", {
    "type": "fall",
    "severity": "High",
    "description": "【驗收】現在-請處理這筆最新跌倒",
})
created["open"] = 1
print("seeded", created, "open_id=", open_rec["record"]["_id"])

stats = req("GET", "/caregiver/alerts/stats?range=week")
print("week totals", stats.get("totals"))
print("week series days", len(stats.get("series") or []), "nonzero", sum(1 for d in stats.get("series") or [] if d["alertHigh"] or d["recordOnly"]))
PY
