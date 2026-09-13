/**
 * Magic-byte 檔案格式驗證（防 MIME type spoofing）
 * 使用 file-type 檢查 buffer 前幾 byte，不信任前端 contentType。
 */

const EVIDENCE_SNAPSHOT = new Set(["image/jpeg", "image/png", "image/webp"])
const EVIDENCE_CLIP = new Set(["video/mp4", "video/webm", "video/quicktime"])
const CHAT_VOICE = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "application/ogg"
])

async function detectBufferMime(buffer) {
  if (!buffer || buffer.length < 12) return null
  try {
    const { fileTypeFromBuffer } = await import("file-type")
    const detected = await fileTypeFromBuffer(buffer)
    return detected?.mime || null
  } catch (err) {
    console.log("file-type detect failed:", err.message)
    return null
  }
}

function isWavBuffer(buffer) {
  return buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WAVE"
}

async function validateEvidenceUpload(buffer, mediaType) {
  let mime = await detectBufferMime(buffer)
  if (!mime && mediaType !== "clip" && isWavBuffer(buffer)) {
    mime = "audio/wav"
  }
  if (!mime) {
    return { ok: false, message: "無法辨識檔案格式（magic bytes）" }
  }
  const allowed = mediaType === "clip" ? EVIDENCE_CLIP : EVIDENCE_SNAPSHOT
  if (!allowed.has(mime)) {
    return { ok: false, message: `檔案格式不符：偵測到 ${mime}，此上傳僅允許 ${mediaType === "clip" ? "影片" : "圖片"}` }
  }
  return { ok: true, mime }
}

async function validateChatVoiceUpload(buffer) {
  let mime = await detectBufferMime(buffer)
  if (!mime && isWavBuffer(buffer)) mime = "audio/wav"
  if (!mime) {
    return { ok: false, message: "無法辨識語音格式（magic bytes）" }
  }
  if (!CHAT_VOICE.has(mime)) {
    return { ok: false, message: `語音格式不符：偵測到 ${mime}` }
  }
  return { ok: true, mime }
}

module.exports = {
  validateEvidenceUpload,
  validateChatVoiceUpload,
  detectBufferMime
}
