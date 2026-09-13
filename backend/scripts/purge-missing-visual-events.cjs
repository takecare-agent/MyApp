/**
 * 磁碟上已刪的監看 jpg/mp4：連 Mongo 活動／異常紀錄一起拿掉。
 * 不刪聊天 wav、不刪沒有圖／片的蹲下等純文字事件。
 *
 *   cd ~/Desktop/MyApp-main/backend && node scripts/purge-missing-visual-events.cjs
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") })
const fs = require("fs")
const path = require("path")
const mongoose = require("mongoose")
const objectStore = require("../lib/objectStore")

function isAudioKey(item) {
  const key = String(item.objectKey || "").toLowerCase()
  const ct = String(item.contentType || "").toLowerCase()
  return ct.includes("audio") || /\.(wav|m4a|mp3|aac)$/.test(key)
}

function isVisualEvidence(item) {
  if (!item || !item.objectKey) return false
  if (isAudioKey(item)) return false
  const key = String(item.objectKey).toLowerCase()
  const ct = String(item.contentType || "").toLowerCase()
  if (item.mediaType === "snapshot" || item.mediaType === "clip") return true
  if (ct.includes("image") || ct.includes("video") || ct.includes("mp4")) return true
  return /\.(jpe?g|png|webp|mp4|webm)$/.test(key)
}

function fileExists(objectKey) {
  const full = path.join(objectStore.LOCAL_ROOT, objectKey)
  return fs.existsSync(full)
}

function shouldDropDoc(evidence) {
  const visual = (evidence || []).filter(isVisualEvidence)
  if (!visual.length) return false
  return visual.every((item) => !fileExists(item.objectKey))
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("missing MONGO_URI")
  await mongoose.connect(process.env.MONGO_URI)
  const db = mongoose.connection.db
  const alerts = db.collection("abnormalevents")
  const visions = db.collection("visiondetectionrecords")

  const dropAlerts = []
  const dropVisions = []
  const tags = new Set()

  for (const doc of await alerts.find({ "evidence.0": { $exists: true } }).toArray()) {
    if (!shouldDropDoc(doc.evidence)) continue
    dropAlerts.push(doc._id)
    if (doc.sourceEventKey) tags.add(String(doc.sourceEventKey))
  }
  for (const doc of await visions.find({ "evidence.0": { $exists: true } }).toArray()) {
    if (!shouldDropDoc(doc.evidence)) continue
    dropVisions.push(doc._id)
    if (doc.frameTag) tags.add(String(doc.frameTag))
  }

  if (tags.size) {
    const extraA = await alerts.find({ sourceEventKey: { $in: [...tags] } }).project({ _id: 1 }).toArray()
    const extraV = await visions.find({ frameTag: { $in: [...tags] } }).project({ _id: 1 }).toArray()
    for (const row of extraA) dropAlerts.push(row._id)
    for (const row of extraV) dropVisions.push(row._id)
  }

  const alertIds = [...new Set(dropAlerts.map(String))].map((id) => new mongoose.Types.ObjectId(id))
  const visionIds = [...new Set(dropVisions.map(String))].map((id) => new mongoose.Types.ObjectId(id))

  const aRes = alertIds.length ? await alerts.deleteMany({ _id: { $in: alertIds } }) : { deletedCount: 0 }
  const vRes = visionIds.length ? await visions.deleteMany({ _id: { $in: visionIds } }) : { deletedCount: 0 }

  console.log(
    JSON.stringify(
      {
        localRoot: objectStore.LOCAL_ROOT,
        deletedAbnormalEvents: aRes.deletedCount,
        deletedVisionRecords: vRes.deletedCount,
      },
      null,
      2
    )
  )
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
