/**
 * 事件證據物件儲存（M1）
 * - 預設：本機目錄（EVIDENCE_STORE_DIR），專題免依賴即可驗收
 * - 若設 MINIO_ENDPOINT + 憑證：走 S3 API（MinIO / Cloudflare R2 相容）；失敗則回退本機
 *
 * SDK：@aws-sdk/client-s3（S3 相容 API）
 * R2 endpoint：https://<accountid>.r2.cloudflarestorage.com
 * R2 region：auto（MINIO_REGION=auto）
 */
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const LOCAL_ROOT = process.env.EVIDENCE_STORE_DIR
  || path.join(__dirname, "..", "data", "evidence")

const DEFAULT_BUCKET = process.env.MINIO_BUCKET || "takecare-evidence"

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
  if (ct.includes("wav")) return ".wav"
  if (ct.includes("mpeg") || ct.includes("mp3")) return ".mp3"
  if (ct.includes("m4a") || ct.includes("aac")) return ".m4a"
  if (ct.includes("webm")) return ".webm"
  return mediaType === "clip" ? ".mp4" : ".jpg"
}

function normalizedEndpoint() {
  return (process.env.MINIO_ENDPOINT || "").replace(/\/$/, "")
}

function isRemoteConfigured() {
  const endpoint = normalizedEndpoint()
  const accessKey = process.env.MINIO_ACCESS_KEY || ""
  const secretKey = process.env.MINIO_SECRET_KEY || ""
  return Boolean(endpoint && accessKey && secretKey)
}

function usePathStyle(endpoint) {
  const forced = String(process.env.MINIO_FORCE_PATH_STYLE || "").trim().toLowerCase()
  if (forced === "true" || forced === "1") return true
  if (forced === "false" || forced === "0") return false
  return !String(endpoint || "").includes("r2.cloudflarestorage.com")
}

function createS3Client() {
  const endpoint = normalizedEndpoint()
  if (!endpoint) throw new Error("MINIO_ENDPOINT not configured")
  const accessKey = process.env.MINIO_ACCESS_KEY || ""
  const secretKey = process.env.MINIO_SECRET_KEY || ""
  if (!accessKey || !secretKey) throw new Error("MinIO/R2 credentials not configured")
  // eslint-disable-next-line import/no-extraneous-dependencies
  const { S3Client } = require("@aws-sdk/client-s3")
  return new S3Client({
    region: process.env.MINIO_REGION || "us-east-1",
    endpoint,
    forcePathStyle: usePathStyle(endpoint),
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey }
  })
}

function getStoreStatus() {
  if (!isRemoteConfigured()) {
    return { driver: "local", bucket: null, endpoint: null, localRoot: LOCAL_ROOT }
  }
  return {
    driver: normalizedEndpoint().includes("r2.cloudflarestorage.com") ? "r2" : "s3",
    bucket: DEFAULT_BUCKET,
    endpoint: normalizedEndpoint(),
    localRoot: LOCAL_ROOT,
    pathStyle: usePathStyle(normalizedEndpoint())
  }
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

async function putRemote(objectKey, buffer, contentType) {
  const { PutObjectCommand } = require("@aws-sdk/client-s3")
  const client = createS3Client()
  await client.send(new PutObjectCommand({
    Bucket: DEFAULT_BUCKET,
    Key: objectKey,
    Body: buffer,
    ContentType: contentType || "application/octet-stream"
  }))
  const driver = normalizedEndpoint().includes("r2.cloudflarestorage.com") ? "r2" : "minio"
  return { driver, objectKey, bucket: DEFAULT_BUCKET }
}

async function putObject({ patientUserId, mediaType, contentType, buffer }) {
  const evidenceId = createEvidenceId()
  const ext = extFromContentType(contentType, mediaType)
  const objectKey = buildObjectKey({ patientUserId, mediaType, evidenceId, ext })
  // 口試／App 列表以本機為準：遠端成功也一定留本地，否則監看列會沒截圖。
  const localStored = await putLocal(objectKey, buffer)
  let driver = localStored.driver
  if (isRemoteConfigured()) {
    try {
      const remote = await putRemote(objectKey, buffer, contentType)
      driver = remote.driver
    } catch (err) {
      console.log("objectStore remote failed, local kept:", err.message)
    }
  }
  return {
    evidenceId,
    objectKey,
    driver,
    contentType: contentType || "application/octet-stream"
  }
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
  if (isRemoteConfigured()) {
    try {
      const { DeleteObjectCommand } = require("@aws-sdk/client-s3")
      const client = createS3Client()
      await client.send(new DeleteObjectCommand({ Bucket: DEFAULT_BUCKET, Key: objectKey }))
    } catch (err) {
      console.log("objectStore remote delete failed, try local:", err.message)
    }
  }
  try {
    await deleteLocal(objectKey)
  } catch (err) {
    console.log("objectStore local delete failed:", err.message)
  }
}

async function getObjectBuffer(objectKey) {
  const local = await getLocalBuffer(objectKey)
  if (local) return local
  if (!isRemoteConfigured()) return null
  try {
    const { GetObjectCommand } = require("@aws-sdk/client-s3")
    const client = createS3Client()
    const out = await client.send(new GetObjectCommand({ Bucket: DEFAULT_BUCKET, Key: objectKey }))
    const chunks = []
    for await (const chunk of out.Body) chunks.push(chunk)
    return Buffer.concat(chunks)
  } catch (err) {
    console.log("objectStore remote get failed:", err.message)
    return null
  }
}

module.exports = {
  LOCAL_ROOT,
  DEFAULT_BUCKET,
  putObject,
  getObjectBuffer,
  deleteObject,
  createEvidenceId,
  isRemoteConfigured,
  getStoreStatus
}
