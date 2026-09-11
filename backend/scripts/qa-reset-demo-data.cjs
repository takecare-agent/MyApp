/**
 * 只補測試血壓＋待辦 contentKey。
 * 禁止刪聊天、錄音、證據檔、帳號。沒有用戶當輪明講不得再開刪除。
 * 用法：cd backend && node scripts/qa-reset-demo-data.cjs
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") })
const path = require("path")
const mongoose = require("mongoose")

async function main() {
  if (!process.env.MONGO_URI) throw new Error("missing MONGO_URI")
  await mongoose.connect(process.env.MONGO_URI)
  const db = mongoose.connection.db
  const users = db.collection("users")
  const bp = db.collection("bloodpressurerecords")
  const templates = db.collection("tasktemplates")
  const reminders = db.collection("reminders")

  const allUsers = await users.find({}, { projection: { email: 1, name: 1, role: 1 } }).toArray()
  const wang = allUsers.find((u) => /王伯/.test(u.name || "")) || allUsers.find((u) => u.email === "patient@test.com")
  if (!wang) throw new Error("找不到 王伯")

  const patientId = wang._id
  await bp.deleteMany({ userId: patientId, source: { $in: ["qa-seed", "mock-seed"] } })
  const days = 7
  const rows = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const morning = new Date()
    morning.setHours(8, 10, 0, 0)
    morning.setDate(morning.getDate() - i)
    const evening = new Date()
    evening.setHours(20, 5, 0, 0)
    evening.setDate(evening.getDate() - i)
    const drift = (days - 1 - i) * 2
    rows.push(
      { userId: patientId, sys: 128 + drift, dia: 78 + Math.floor(drift / 2), pulse: 70, mood: "calm", source: "qa-seed", measuredAt: morning },
      { userId: patientId, sys: 134 + drift, dia: 82 + Math.floor(drift / 2), pulse: 74, mood: "ok", source: "qa-seed", measuredAt: evening }
    )
  }
  await bp.insertMany(rows)

  const sleepKey = "preset.reminder.med.sleep_aid"
  const zhSleep = "睡前服用安眠藥"
  const presetKeys = [
    ["協助洗澡", "preset.reminder.daily_care.bath"],
    ["測量體溫", "preset.reminder.vitals.temp"],
    ["三餐飯後服藥", "preset.reminder.med.meals"],
    ["Take sleep medicine at bedtime", sleepKey],
    [zhSleep, sleepKey]
  ]
  let tplContentKey = 0
  let reminderContentKey = 0
  for (const [content, key] of presetKeys) {
    tplContentKey += (await templates.updateMany(
      { content, $or: [{ contentKey: "" }, { contentKey: { $exists: false } }] },
      { $set: { contentKey: key } }
    )).modifiedCount
    reminderContentKey += (await reminders.updateMany(
      { content, $or: [{ contentKey: "" }, { contentKey: { $exists: false } }] },
      { $set: { contentKey: key } }
    )).modifiedCount
  }
  const sleepTpl = await templates.updateMany(
    { content: /sleep medicine|安眠藥|obat tidur|thuốc ngủ|pampatulog|ยานอนหลับ/i },
    { $set: { contentKey: sleepKey } }
  )
  const sleepRem = await reminders.updateMany(
    { content: /sleep medicine|安眠藥|obat tidur|thuốc ngủ|pampatulog|ยานอนหลับ/i },
    { $set: { contentKey: sleepKey } }
  )
  tplContentKey += sleepTpl.modifiedCount
  reminderContentKey += sleepRem.modifiedCount

  console.log(JSON.stringify({
    wang: `${wang.name}<${wang.email}>`,
    note: "did not delete chats or audio",
    bpInserted: rows.length,
    tplContentKey,
    reminderContentKey
  }, null, 2))
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
