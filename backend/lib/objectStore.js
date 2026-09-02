/**
 * 事件證據物件儲存（M1）
 * - 預設：本機目錄（EVIDENCE_STORE_DIR），專題免依賴即可驗收
 * - 若設 MINIO_ENDPOINT + 憑證：走 S3 API（MinIO 相容）；失敗則回退本機
 */
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const LOCAL_ROOT = process.env.EVIDENCE_STORE_DIR
  || path.join(__dirname, "..", "data", "evidence")

function ensureLocalRoot() {
  fs.mkdirSync(LOCAL_ROOT, { recursive: true })
}

function createEvidenceId() {
  return `ev-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`
}

function buildObjectKey({ patientUserId, mediaType, evidenceId, ext }) {
  const day = new Date().toISOString().slice(0, 10)
  return `evidence/${patientUserId}/${day}/${mediaType}-${evidenceId}${ext}`
}

function extFromContentType(contentType, mediaType) {
  const ct = String(contentType || "").toLowerCase()
  if (ct.includes("png")) return ".png"
  if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg"
  if (ct.includes("webp")) return ".webp"
  if (ct.includes("mp4")) return ".mp4"
  if (ct.includes("webm")) return ".webm"
  return mediaType === "clip" ? ".mp4" : ".jpg"
}

async function putLocal(objectKey, buffer) {
  ensureLocalRoot()
  const full = path.join(LOCAL_ROOT, objectKey)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, buffer)
  return { driver: "local", objectKey, fullPath: full }
}

async function getLocalBuffer(objectKey) {
  const full = path.join(LOCAL_ROOT, objectKey)
  if (!fs.existsSync(full)) return null
  return fs.readFileSync(full)
}

async function putMinio(objectKey, buffer, contentType) {
  const endpoint = (process.env.MINIO_ENDPOINT || "").replace(/\/$/, "")
  const bucket = process.env.MINIO_BUCKET || "takecare-evidence"
  const accessKey = process.env.MINIO_ACCESS_KEY || ""
  const secretKey = process.env.MINIO_SECRET_KEY || ""
  if (!endpoint || !accessKey || !secretKey) {
    throw new Error("MinIO not configured")
  }
  // 延遲載入：未安裝 @aws-sdk/client-s3 時走本機
  // eslint-disable-next-line import/no-extraneous-dependencies
  const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3")
  const client = new S3Client({
    region: process.env.MINIO_REGION || "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey }
  })
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Body: buffer,
    ContentType: contentType || "application/octet-stream"
  }))
  return { driver: "minio", objectKey, bucket }
}

async function putObject({ patientUserId, mediaType, contentType, buffer }) {
  const evidenceId = createEvidenceId()
  const ext = extFromContentType(contentType, mediaType)
  const objectKey = buildObjectKey({ patientUserId, mediaType, evidenceId, ext })
  let stored
  try {
    if (process.env.MINIO_ENDPOINT) {
      stored = await putMinio(objectKey, buffer, contentType)
    } else {
      stored = await putLocal(objectKey, buffer)
    }
  } catch (err) {
    console.log("objectStore MinIO failed, fallback local:", err.message)
    stored = await putLocal(objectKey, buffer)
  }
  return { evidenceId, objectKey, driver: stored.driver, contentType: contentType || "application/octet-stream" }
}

async function deleteLocal(objectKey) {
  const full = path.join(LOCAL_ROOT, objectKey)
  try {
    fs.unlinkSync(full)
  } catch (err) {
    if (err.code !== "ENOENT") throw err
  }
}

async function deleteObject(objectKey) {
  if (!objectKey) return
  if (process.env.MINIO_ENDPOINT) {
    try {
      const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3")
      const endpoint = (process.env.MINIO_ENDPOINT || "").replace(/\/$/, "")
      const bucket = process.env.MINIO_BUCKET || "takecare-evidence"
      const client = new S3Client({
        region: process.env.MINIO_REGION || "us-east-1",
        endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.MINIO_ACCESS_KEY || "",
          secretAccessKey: process.env.MINIO_SECRET_KEY || ""
        }
      })
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }))
    } catch (err) {
      console.log("objectStore MinIO delete failed, try local:", err.message)
    }
  }
  try {
    await deleteLocal(objectKey)
  } catch (err) {
    console.log("objectStore local delete failed:", err.message)
  }
}

async function getObjectBuffer(objectKey) {
  if (process.env.MINIO_ENDPOINT) {
    try {
      const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3")
      const endpoint = (process.env.MINIO_ENDPOINT || "").replace(/\/$/, "")
      const bucket = process.env.MINIO_BUCKET || "takecare-evidence"
      const client = new S3Client({
        region: process.env.MINIO_REGION || "us-east-1",
        endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.MINIO_ACCESS_KEY || "",
          secretAccessKey: process.env.MINIO_SECRET_KEY || ""
        }
      })
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }))
      const chunks = []
      for await (const chunk of out.Body) chunks.push(chunk)
      return Buffer.concat(chunks)
    } catch (err) {
      console.log("objectStore MinIO get failed, try local:", err.message)
    }
  }
  return getLocalBuffer(objectKey)
}

module.exports = {
  LOCAL_ROOT,
  putObject,
  getObjectBuffer,
  deleteObject,
  createEvidenceId
}
