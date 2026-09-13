#!/usr/bin/env bash
# 一次性把本機 evidence 檔案搬到 Cloudflare R2（或任何 S3 相容 bucket）
# 用法：在 backend/.env 填好 MINIO_* 後執行
#   bash ~/Desktop/MyApp-main/scripts/migrate-evidence-to-r2.sh
#
# objectKey 格式：evidence/{patientId}/{date}/{mediaType}-{id}.ext
# 本機路徑：backend/data/evidence/evidence/...（LOCAL_ROOT + objectKey）

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/backend/.env"
LOCAL_EVIDENCE="${ROOT}/backend/data/evidence/evidence"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

ENDPOINT="${MINIO_ENDPOINT:-}"
BUCKET="${MINIO_BUCKET:-takecare-evidence}"
ACCESS_KEY="${MINIO_ACCESS_KEY:-}"
SECRET_KEY="${MINIO_SECRET_KEY:-}"

if [[ -z "$ENDPOINT" || -z "$ACCESS_KEY" || -z "$SECRET_KEY" ]]; then
  echo "請先在 backend/.env 設定 MINIO_ENDPOINT、MINIO_ACCESS_KEY、MINIO_SECRET_KEY"
  exit 1
fi

if [[ ! -d "$LOCAL_EVIDENCE" ]]; then
  echo "本機 evidence 目錄不存在：$LOCAL_EVIDENCE"
  exit 1
fi

FILE_COUNT="$(find "$LOCAL_EVIDENCE" -type f ! -name '.DS_Store' | wc -l | tr -d ' ')"
SIZE="$(du -sh "$LOCAL_EVIDENCE" | awk '{print $1}')"
echo "將上傳 ${FILE_COUNT} 個檔案（約 ${SIZE}）到 s3://${BUCKET}/evidence/"
echo "Endpoint: ${ENDPOINT}"
read -r -p "繼續？(y/N) " CONFIRM
if [[ "${CONFIRM,,}" != "y" ]]; then
  echo "已取消"
  exit 0
fi

export AWS_ACCESS_KEY_ID="$ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$SECRET_KEY"
export AWS_DEFAULT_REGION="${MINIO_REGION:-auto}"

aws s3 sync "$LOCAL_EVIDENCE/" "s3://${BUCKET}/evidence/" \
  --endpoint-url "$ENDPOINT" \
  --exclude ".DS_Store"

echo ""
echo "完成。下一步："
echo "1. 重啟 backend，確認 log 顯示 [objectStore] driver=r2"
echo "2. App 開既有事件，確認截圖/短片可播"
echo "3. 驗證通過後：mv backend/data/evidence backend/data/evidence.bak"
