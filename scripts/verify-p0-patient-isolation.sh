#!/usr/bin/env bash
# P0 長輩隔離煙霧測試（需後端已在 :5000 跑著）
# 用法：bash scripts/verify-p0-patient-isolation.sh [API_BASE]
set -euo pipefail

API="${1:-http://localhost:5000}"

login() {
  local email="$1" role="$2" linked="${3:-}"
  local body
  if [[ -n "$linked" ]]; then
    body=$(printf '{"email":"%s","role":"%s","linkedPatientEmail":"%s","name":"%s"}' "$email" "$role" "$linked" "${email%%@*}")
  else
    body=$(printf '{"email":"%s","role":"%s","name":"%s"}' "$email" "$role" "${email%%@*}")
  fi
  curl -sS -X POST "$API/mobile/dev-login" -H 'Content-Type: application/json' -d "$body"
}

echo "== P0 isolation smoke @ $API =="

# 兩組互不相關的長輩 / 家屬
PAT_A="p0-patient-a@test.com"
PAT_B="p0-patient-b@test.com"
FAM_A="p0-family-a@test.com"
FAM_B="p0-family-b@test.com"
CG_A="p0-caregiver-a@test.com"

echo "-- login patients --"
login "$PAT_A" patient >/dev/null
login "$PAT_B" patient >/dev/null

TOK_A=$(login "$FAM_A" family "$PAT_A" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
TOK_B=$(login "$FAM_B" family "$PAT_B" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
TOK_CG=$(login "$CG_A" caregiver "$PAT_A" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
TOK_PA=$(login "$PAT_A" patient | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

echo "-- seed: patient A SOS + family B reminder for patient B --"
SOS_A=$(curl -sS -X POST "$API/patient/sos/trigger" \
  -H "Authorization: Bearer $TOK_PA" -H 'Content-Type: application/json' \
  -d '{"message":"P0-A-SOS","locationLabel":"lab-A","patientPhone":"0911111111"}')
SOS_ID=$(echo "$SOS_A" | python3 -c 'import sys,json; print(json.load(sys.stdin)["record"]["_id"])')
echo "SOS_A id=$SOS_ID"

REM_B=$(curl -sS -X POST "$API/family/reminders" \
  -H "Authorization: Bearer $TOK_B" -H 'Content-Type: application/json' \
  -d '{"category":"P0-B","content":"only-B","time":"2099-01-01T10:00:00.000Z"}')
REM_ID=$(echo "$REM_B" | python3 -c 'import sys,json; print(json.load(sys.stdin)["record"]["_id"])')
echo "REM_B id=$REM_ID"

ALERT_A=$(curl -sS -X POST "$API/caregiver/alerts" \
  -H "Authorization: Bearer $TOK_CG" -H 'Content-Type: application/json' \
  -d '{"type":"P0-fall-A","severity":"High","description":"only-A"}')
ALERT_ID=$(echo "$ALERT_A" | python3 -c 'import sys,json; print(json.load(sys.stdin)["record"]["_id"])')
echo "ALERT_A id=$ALERT_ID"

echo "-- history isolation --"
COUNT_A_SOS=$(curl -sS "$API/family/sos/history" -H "Authorization: Bearer $TOK_A" \
  | python3 -c 'import sys,json; print(sum(1 for r in json.load(sys.stdin)["records"] if r.get("message")=="P0-A-SOS"))')
COUNT_B_SOS=$(curl -sS "$API/family/sos/history" -H "Authorization: Bearer $TOK_B" \
  | python3 -c 'import sys,json; print(sum(1 for r in json.load(sys.stdin)["records"] if r.get("message")=="P0-A-SOS"))')

COUNT_A_REM=$(curl -sS "$API/family/reminders" -H "Authorization: Bearer $TOK_A" \
  | python3 -c 'import sys,json; print(sum(1 for r in json.load(sys.stdin)["records"] if r.get("content")=="only-B"))')
COUNT_B_REM=$(curl -sS "$API/family/reminders" -H "Authorization: Bearer $TOK_B" \
  | python3 -c 'import sys,json; print(sum(1 for r in json.load(sys.stdin)["records"] if r.get("content")=="only-B"))')

COUNT_A_ALERT=$(curl -sS "$API/family/alerts/history" -H "Authorization: Bearer $TOK_A" \
  | python3 -c 'import sys,json; print(sum(1 for r in json.load(sys.stdin)["records"] if r.get("type")=="P0-fall-A"))')
COUNT_B_ALERT=$(curl -sS "$API/family/alerts/history" -H "Authorization: Bearer $TOK_B" \
  | python3 -c 'import sys,json; print(sum(1 for r in json.load(sys.stdin)["records"] if r.get("type")=="P0-fall-A"))')

CG_SOS=$(curl -sS "$API/caregiver/sos/history" -H "Authorization: Bearer $TOK_CG" \
  | python3 -c 'import sys,json; print(sum(1 for r in json.load(sys.stdin)["records"] if r.get("message")=="P0-A-SOS"))')
CG_REM=$(curl -sS "$API/caregiver/reminders" -H "Authorization: Bearer $TOK_CG" \
  | python3 -c 'import sys,json; print(sum(1 for r in json.load(sys.stdin)["records"] if r.get("content")=="only-B"))')

echo "familyA sees own SOS=$COUNT_A_SOS (expect >=1), familyB sees A SOS=$COUNT_B_SOS (expect 0)"
echo "familyA sees B reminder=$COUNT_A_REM (expect 0), familyB sees own rem=$COUNT_B_REM (expect >=1)"
echo "familyA sees A alert=$COUNT_A_ALERT (expect >=1), familyB sees A alert=$COUNT_B_ALERT (expect 0)"
echo "caregiverA sees A SOS=$CG_SOS (expect >=1), caregiverA sees B rem=$CG_REM (expect 0)"

echo "-- ownership 403 --"
CODE_RESOLVE=$(curl -sS -o /tmp/p0_resolve.json -w '%{http_code}' -X PATCH "$API/family/sos/$SOS_ID/resolve" \
  -H "Authorization: Bearer $TOK_B" -H 'Content-Type: application/json' -d '{}')
CODE_DEL=$(curl -sS -o /tmp/p0_del.json -w '%{http_code}' -X DELETE "$API/family/reminders/$REM_ID" \
  -H "Authorization: Bearer $TOK_A")
CODE_ALERT=$(curl -sS -o /tmp/p0_alert.json -w '%{http_code}' -X PATCH "$API/family/alerts/$ALERT_ID/status" \
  -H "Authorization: Bearer $TOK_B" -H 'Content-Type: application/json' -d '{"status":"Done"}')

echo "familyB resolve A's SOS -> HTTP $CODE_RESOLVE (expect 403)"
echo "familyA delete B's reminder -> HTTP $CODE_DEL (expect 403)"
echo "familyB patch A's alert -> HTTP $CODE_ALERT (expect 403)"

FAIL=0
[[ "$COUNT_A_SOS" -ge 1 ]] || FAIL=1
[[ "$COUNT_B_SOS" -eq 0 ]] || FAIL=1
[[ "$COUNT_A_REM" -eq 0 ]] || FAIL=1
[[ "$COUNT_B_REM" -ge 1 ]] || FAIL=1
[[ "$COUNT_A_ALERT" -ge 1 ]] || FAIL=1
[[ "$COUNT_B_ALERT" -eq 0 ]] || FAIL=1
[[ "$CG_SOS" -ge 1 ]] || FAIL=1
[[ "$CG_REM" -eq 0 ]] || FAIL=1
[[ "$CODE_RESOLVE" == "403" ]] || FAIL=1
[[ "$CODE_DEL" == "403" ]] || FAIL=1
[[ "$CODE_ALERT" == "403" ]] || FAIL=1

# own-side resolve should still work
CODE_OK=$(curl -sS -o /tmp/p0_ok.json -w '%{http_code}' -X PATCH "$API/family/sos/$SOS_ID/resolve" \
  -H "Authorization: Bearer $TOK_A" -H 'Content-Type: application/json' -d '{}')
echo "familyA resolve own SOS -> HTTP $CODE_OK (expect 200)"
[[ "$CODE_OK" == "200" ]] || FAIL=1

if [[ "$FAIL" -eq 0 ]]; then
  echo "✅ P0 isolation PASS"
  exit 0
else
  echo "❌ P0 isolation FAIL"
  exit 1
fi
