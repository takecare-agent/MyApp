require("dotenv").config()

const express = require("express")
const cors = require("cors")
const passport = require("passport")
const jwt = require("jsonwebtoken")
const mongoose = require("mongoose")
const crypto = require("crypto")
const http = require("http")
const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")
const { Server } = require("socket.io")
const axios = require("axios")
const { cert, getApps, initializeApp } = require("firebase-admin/app")
const { getMessaging } = require("firebase-admin/messaging")
const { translate } = require("google-translate-api-x")
const { GoogleGenerativeAI } = require("@google/generative-ai")

require("./googleAuth")
const { reverseGeocode, reverseGeocodeWithTimeout } = require("./lib/reverseGeocode")
const { normalizeHealthCard } = require("./lib/healthCardSanitize")

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })
const GOOGLE_STT_API_KEY = process.env.GOOGLE_API_KEY || ""

function getFirebaseCredential() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (rawJson) {
    try {
      return cert(JSON.parse(rawJson))
    } catch (error) {
      console.log("Firebase service account JSON is invalid:", error.message)
      return null
    }
  }

  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  if (filePath && fs.existsSync(filePath)) {
    try {
      return cert(JSON.parse(fs.readFileSync(filePath, "utf8")))
    } catch (error) {
      console.log("Firebase service account file is invalid:", error.message)
    }
  }

  return null
}

const firebaseCredential = getFirebaseCredential()
if (firebaseCredential) {
  initializeApp({ credential: firebaseCredential })
  console.log("Firebase Admin initialized")
} else {
  console.log("Firebase Admin not configured; SOS push notifications are disabled")
}

const DANGER_KEYWORDS = [
  "救護車", "流血", "痛", "跌倒", "昏倒", "緊急", "受傷", "呼吸困難", "心跳", "不舒服", "想吐", "頭暈", "危險", "求救",
  "ambulance", "bleeding", "pain", "fall", "faint", "emergency", "hurt", "breath", "dizzy", "danger", "help",
  "ambulans", "berdarah", "sakit", "jatuh", "pingsan", "darurat", "luka", "napas", "pusing", "bahaya", "tolong",
  "รถพยาบาล", "เลือดออก", "เจ็บ", "ปวด", "ล้ม", "เป็นลม", "ฉุกเฉิน", "บาดเจ็บ", "หายใจ", "เวียนหัว", "อันตราย", "ช่วยด้วย",
  "cấp cứu", "chảy máu", "đau", "ngã", "té", "ngất", "khẩn cấp", "bị thương", "khó thở", "chóng mặt", "nguy hiểm", "cứu"
]

const app = express()
let chatIo = null

console.log("ACTIVE BACKEND FILE LOADED")

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://localhost",
  "https://localhost",
  "http://localhost:19006",
  "http://127.0.0.1:19006",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "capacitor://localhost",
  "ionic://localhost"
]

const frontendWebUrl = (process.env.FRONTEND_WEB_URL || "http://localhost:5173").trim()

const allowedOrigins = new Set(defaultAllowedOrigins)
if (frontendWebUrl) allowedOrigins.add(frontendWebUrl)
for (const value of (process.env.CORS_ORIGINS || "").split(",")) {
  const origin = value.trim()
  if (origin) allowedOrigins.add(origin)
}

function isLocalNetworkOrigin(origin) {
  try {
    const parsed = new URL(origin)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false
    const host = (parsed.hostname || "").toLowerCase()
    if (!host) return false
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true
    const matched172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host)
    if (matched172) {
      const second = Number(matched172[1])
      if (second >= 16 && second <= 31) return true
    }
  } catch {
    return false
  }
  return false
}

const oauthSuccessBaseUrl = (
  process.env.OAUTH_SUCCESS_URL || `${frontendWebUrl}/google-success`
).trim()

function buildOauthSuccessUrl(token) {
  const separator = oauthSuccessBaseUrl.includes("?") ? "&" : "?"
  return `${oauthSuccessBaseUrl}${separator}token=${encodeURIComponent(token)}`
}

// ================= MongoDB =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("MongoDB error:", err.message))

// ================= Middleware =================
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || isLocalNetworkOrigin(origin)) {
      callback(null, true)
      return
    }
    callback(new Error(`CORS blocked for origin: ${origin}`))
  },
  credentials: true
}))

app.use(express.json({ limit: "20mb" }))
app.use(passport.initialize())

const objectStore = require("./lib/objectStore")

// ================= Schemas =================
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  name: String,
  passwordHash: String,
  emailVerified: { type: Boolean, default: false },
  emailVerifyCodeHash: String,
  emailVerifyExpires: Date,
  googleSub: { type: String, index: true, sparse: true },
  appleSub: { type: String, index: true, sparse: true },
  authProviders: { type: [String], default: [] },
  role: { type: String, enum: ["patient", "family", "caregiver"], default: null },
  birthDate: String,
  age: Number,
  idNumber: String,
  gender: String,
  phone: String,
  pushTokens: [{
    token: String,
    platform: String,
    updatedAt: Date
  }],
  linkedPatientEmail: String,
  activePatientEmail: String,
  inviteCode: { type: String, index: true, sparse: true },
  inviteCodeExpires: Date,
  experience: String,
  lang: { type: String, default: "zh" },
  wearableSampleCursor: { type: Number, default: 0 },
  bloodPressureCursor: { type: Number, default: 0 },
  visionSampleCursor: { type: Number, default: 0 },
  familyAlertsCursor: { type: Number, default: 0 },
  familyCareRecordsCursor: { type: Number, default: 0 },
  familyEventsCursor: { type: Number, default: 0 },
  caregiverAlertsCursor: { type: Number, default: 0 },
  caregiverCareLogsCursor: { type: Number, default: 0 },
  caregiverLanguageCursor: { type: Number, default: 0 },
  caregiverSystemCursor: { type: Number, default: 0 },
  profileCompleted: { type: Boolean, default: false },
  /** @deprecated R87 W2.5：一律 circle；保留欄位相容舊客戶端 */
  sosAudience: {
    type: String,
    enum: ["caregiver_only", "circle"],
    default: "circle"
  },
  /** ICE 健康資訊卡（救護／語言隔閡用；事先填） */
  healthCard: {
    bloodType: { type: String, default: "" },
    allergies: { type: String, default: "" },
    medications: { type: String, default: "" },
    conditions: { type: String, default: "" },
    notes: { type: String, default: "" },
    preferredLanguage: { type: String, default: "" },
    allergyKeys: { type: [String], default: [] },
    allergyOther: { type: String, default: "" },
    conditionKeys: { type: [String], default: [] },
    conditionOther: { type: String, default: "" },
    medicationKeys: { type: [String], default: [] },
    deviceKeys: { type: [String], default: [] },
    directiveKeys: { type: [String], default: [] }
  }
}, { timestamps: true })

const User = mongoose.model("User", userSchema)

const {
  createCareCircleMemberModel
} = require("./lib/careCircle")
const CareCircleMember = createCareCircleMemberModel(mongoose)

const wearableRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  heartRate: { type: Number, required: true },
  spo2: { type: Number, required: true },
  steps: { type: Number, required: true },
  note: String,
  isAbnormal: { type: Boolean, default: false },
  source: { type: String, default: "mock-seed" },
  recordedAt: { type: Date, default: Date.now }
}, { timestamps: true })

const WearableRecord = mongoose.model("WearableRecord", wearableRecordSchema)

const caregiverAlertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  alertId: String,
  type: String,
  riskLevel: String,
  status: String,
  actionTaken: String,
  happenedAt: Date,
  source: { type: String, default: "mock-seed" }
}, { timestamps: true })

const caregiverCareLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  logId: String,
  tasks: [{ task: String, status: String, time: String }],
  vitals: { heartRate: Number, bloodPressure: String, spo2: Number, heartRateState: String, bloodPressureState: String, spo2State: String },
  happenedAt: Date,
  source: { type: String, default: "mock-seed" }
}, { timestamps: true })

const caregiverLanguageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  sessionId: String,
  language: String,
  voice: String,
  translatedAlerts: [{ original: String, translated: String, locale: String }],
  phrases: [{ text: String, lang: String }],
  happenedAt: Date,
  source: { type: String, default: "mock-seed" }
}, { timestamps: true })

const caregiverSystemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  systemId: String,
  healthScore: Number,
  networkRows: [{ area: String, status: String, signal: String }],
  backupRows: [{ event: String, capturedAt: String, media: String }],
  happenedAt: Date,
  source: { type: String, default: "mock-seed" }
}, { timestamps: true })

const CaregiverAlert = mongoose.model("CaregiverAlert", caregiverAlertSchema)
const CaregiverCareLog = mongoose.model("CaregiverCareLog", caregiverCareLogSchema)
const CaregiverLanguage = mongoose.model("CaregiverLanguage", caregiverLanguageSchema)
const CaregiverSystem = mongoose.model("CaregiverSystem", caregiverSystemSchema)

const sosEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  patientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  patientName: String,
  patientEmail: String,
  patientPhone: String,
  message: String,
  /** 預設短語代碼 needHelp|fell|comeQuick；有則收訊方走字典不依賴機翻 */
  messageKey: { type: String, default: "" },
  /** 寫入方介面語言；收訊方依自己的 User.lang 看譯文（R88） */
  sourceLang: { type: String, default: "zh" },
  /** W2.5 起一律 circle；保留 enum 相容舊資料 */
  audience: {
    type: String,
    enum: ["caregiver_only", "circle"],
    default: "circle",
    index: true
  },
  locationLabel: String,
  latitude: Number,
  longitude: Number,
  status: {
    type: String,
    enum: ["active", "handling", "resolved", "cancelled"],
    default: "active",
    index: true
  },
  handlerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  handlerName: String,
  handlerEmail: String,
  handlingAt: Date,
  triggeredAt: { type: Date, default: Date.now, index: true },
  resolvedAt: Date,
  resolvedByEmail: String,
  cancelReason: String,
  source: { type: String, default: "manual-sos" }
}, { timestamps: true })

const SosEvent = mongoose.model("SosEvent", sosEventSchema)

// G2：High 建立後以 setTimeout 排 2／5／15／35 分升 Critical 並重推；結案清計時器。程序重啟會丟掉尚未觸發的波次。
const abnormalEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  patientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  reporterUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  reporterRole: { type: String, enum: ["patient", "family", "caregiver", "system"], default: "caregiver" },
  type: { type: String, required: true },
  severity: { type: String, enum: ["Low", "Medium", "High", "Critical"], default: "Medium", index: true },
  status: { type: String, enum: ["Pending", "Processing", "Done"], default: "Pending", index: true },
  location: String,
  description: String,
  note: { type: String, default: "" },
  happenedAt: { type: Date, default: Date.now, index: true },
  source: { type: String, default: "manual-report" },
  claimedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  claimedByRole: { type: String, enum: ["family", "caregiver"] },
  claimedAt: Date,
  resolvedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  resolvedNote: String,
  resolvedAt: Date,
  escalationWave: { type: Number, default: 0 },
  // 高＝wave 0（5 秒）；極高每次再通知 append 一筆，同一跌倒不另開列
  escalationLog: [{
    wave: { type: Number, required: true },
    at: { type: Date, default: Date.now },
    elapsedSec: { type: Number, default: 0 }
  }],
  // U2b：caregiver＝看護結案；superseded＝被後續事件覆蓋／一併結案
  resolveKind: { type: String, enum: ["caregiver", "superseded"], default: undefined },
  supersededByAlertId: { type: String, default: undefined },
  // 對應 vision eventKey（frameTag），供證據掛載
  sourceEventKey: { type: String, index: true },
  evidence: [{
    evidenceId: String,
    mediaType: { type: String, enum: ["snapshot", "clip"], default: "snapshot" },
    objectKey: String,
    contentType: String,
    durationSec: Number,
    startAt: Date,
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true })

const reminderSchema = new mongoose.Schema({
  reminderId: { type: String, required: true, unique: true, index: true },
  patientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  createdByRole: { type: String, enum: ["patient", "family", "caregiver", "system"], default: "family" },
  assignedToRole: { type: String, enum: ["patient", "family", "caregiver"], default: "caregiver", index: true },
  category: { type: String, required: true },
  content: { type: String, required: true },
  time: { type: Date, required: true, index: true },
  note: String,
  sourceLang: { type: String, default: "" },
  contentKey: { type: String, default: "" },
  isCompleted: { type: Boolean, default: false, index: true },
  completedAt: Date,
  completedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  completedByRole: String,
  source: { type: String, default: "manual-reminder" }
}, { timestamps: true })

const bloodPressureRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  sys: { type: Number, required: true },
  dia: { type: Number, required: true },
  pulse: Number,
  mood: { type: String, enum: ["平靜", "開心", "焦慮", "頭暈", "未標記"], default: "未標記" },
  level: { type: String, enum: ["正常", "偏高", "低血壓", "偏低", "血壓前期", "高血壓", "超高血壓"], required: true },
  measuredAt: { type: Date, default: Date.now, index: true },
  source: { type: String, default: "manual-entry" },
  syncKey: { type: String, index: true }
}, { timestamps: true })

const visionDetectionRecordSchema = new mongoose.Schema({
  patientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  reporterUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  reporterRole: { type: String, enum: ["patient", "family", "caregiver", "system"], default: "system" },
  action: { type: String, required: true },
  severity: { type: String, enum: ["Low", "Medium", "High"], default: "Medium", required: true },
  confidence: Number,
  location: String,
  description: String,
  modelName: { type: String, default: "CareAI-MediaPipe" },
  frameTag: String,
  detectedAt: { type: Date, default: Date.now, index: true },
  source: { type: String, default: "vision-mock" },
  // G1：這筆事件是否最終建立了 Alert 並推播（給 G3 表格「是否回報」欄位用）。
  // 跌倒事件建立當下還不知道（要等 5 秒觀察窗），預設 false，計時器觸發建立 Alert 時才補回 true。
  alertBuilt: { type: Boolean, default: false },
  evidence: [{
    evidenceId: String,
    mediaType: { type: String, enum: ["snapshot", "clip"], default: "snapshot" },
    objectKey: String,
    contentType: String,
    durationSec: Number,
    startAt: Date,
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true })

const familyCareRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  recordDate: Date,
  time: String,
  medicine: String,
  meal: String,
  toilet: String,
  activity: String,
  source: { type: String, default: "mock-seed" }
}, { timestamps: true })

const familyEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  eventId: String,
  type: String,
  description: String,
  media: String,
  status: String,
  happenedAt: Date,
  source: { type: String, default: "mock-seed" }
}, { timestamps: true })

const chatMessageSchema = new mongoose.Schema({
  senderEmail: String,
  targetEmail: String,
  originalText: String,
  translatedText: String,
  sourceLang: String,
  targetLang: String,
  phraseKey: { type: String, default: "" },
  kind: { type: String, enum: ["text", "voice"], default: "text" },
  audioObjectKey: { type: String, default: "" },
  audioContentType: { type: String, default: "" },
  timestamp: { type: Date, default: Date.now, expires: "30d" }
})

const dangerLogSchema = new mongoose.Schema({
  senderEmail: String,
  senderName: String,
  phrase: String,
  isDangerous: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now, expires: "7d" }
})

const customPhraseSchema = new mongoose.Schema({
  ownerEmail: String,
  text: String
})

const taskTemplateSchema = new mongoose.Schema({
  patientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  category: { type: String, required: true },
  content: { type: String, required: true },
  time: { type: String, default: "08:00" }, // HH:MM
  weekdays: { type: [Number], default: [] }, // [] = 每天；0=日 … 6=六
  note: { type: String, default: "" },
  sourceLang: { type: String, default: "" },
  contentKey: { type: String, default: "" },
  order: { type: Number, default: 0 },
  source: { type: String, default: "family-template" }
}, { timestamps: true })

/** 家屬自訂「常用事項」——掛在某類別下，供新增提醒下拉選 */
const reminderPresetSchema = new mongoose.Schema({
  patientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  category: { type: String, required: true, index: true },
  content: { type: String, required: true },
  source: { type: String, default: "family-custom" }
}, { timestamps: true })
reminderPresetSchema.index({ patientUserId: 1, category: 1, content: 1 }, { unique: true })

/** 日常照護紀錄（看護與受顧者可寫；家屬看；掛照護圈長輩） */
const careDailyRecordSchema = new mongoose.Schema({
  patientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  createdByRole: { type: String, enum: ["caregiver", "family", "patient"], default: "caregiver" },
  category: { type: String, required: true }, // 飲食／用藥／清潔…
  content: { type: String, required: true },
  note: { type: String, default: "" }, // 選填備註（對齊提醒 Reminder.note）
  sourceLang: { type: String, default: "" },
  contentKey: { type: String, default: "" },
  caregiverName: { type: String, default: "" },
  sleep: { type: String, default: "" },
  bloodPressure: { type: String, default: "" },
  heartRate: { type: String, default: "" },
  temperature: { type: String, default: "" },
  recordedAt: { type: Date, default: Date.now, index: true },
  source: { type: String, default: "care-daily" }
}, { timestamps: true })

const AbnormalEvent = mongoose.model("AbnormalEvent", abnormalEventSchema)
const Reminder = mongoose.model("Reminder", reminderSchema)
const TaskTemplate = mongoose.model("TaskTemplate", taskTemplateSchema)
const ReminderPreset = mongoose.model("ReminderPreset", reminderPresetSchema)
const CareDailyRecord = mongoose.model("CareDailyRecord", careDailyRecordSchema)
const BloodPressureRecord = mongoose.model("BloodPressureRecord", bloodPressureRecordSchema)
const VisionDetectionRecord = mongoose.model("VisionDetectionRecord", visionDetectionRecordSchema)

/** R109：鏡頭在線區間（牆鐘軸用）。RAM ring 重啟會清，session 進 Mongo 才不會讓軸消失。 */
const cameraSessionSchema = new mongoose.Schema({
  patientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  startedAt: { type: Date, required: true, index: true },
  endedAt: { type: Date, default: null, index: true },
  lastHeartbeatAt: { type: Date, required: true, index: true },
  source: { type: String, default: "vision" }
}, { timestamps: true })
const CameraSession = mongoose.model("CameraSession", cameraSessionSchema)
const CAMERA_HEARTBEAT_STALE_MS = 90 * 1000
const FamilyCareRecord = mongoose.model("FamilyCareRecord", familyCareRecordSchema)
const FamilyEvent = mongoose.model("FamilyEvent", familyEventSchema)
const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema)
const DangerLog = mongoose.model("DangerLog", dangerLogSchema)
const CustomPhrase = mongoose.model("CustomPhrase", customPhraseSchema)

const chatReadSchema = new mongoose.Schema({
  userEmail: { type: String, lowercase: true, index: true },
  partnerEmail: { type: String, lowercase: true },
  lastReadAt: { type: Date, default: Date.now }
})
chatReadSchema.index({ userEmail: 1, partnerEmail: 1 }, { unique: true })
const ChatRead = mongoose.model("ChatRead", chatReadSchema)

// ================= Mock Data =================
const MOCK_WEARABLE_SAMPLES = [
  { heartRate: 74, spo2: 97, steps: 4132, note: "daily range", isAbnormal: false },
  { heartRate: 83, spo2: 98, steps: 6288, note: "normal movement", isAbnormal: false },
  { heartRate: 102, spo2: 96, steps: 9020, note: "heart rate high", isAbnormal: true },
  { heartRate: 58, spo2: 97, steps: 2800, note: "heart rate low", isAbnormal: true },
  { heartRate: 77, spo2: 93, steps: 5100, note: "spo2 low", isAbnormal: true },
  { heartRate: 89, spo2: 95, steps: 11234, note: "high activity", isAbnormal: false },
  { heartRate: 69, spo2: 99, steps: 1980, note: "low activity", isAbnormal: true },
  { heartRate: 92, spo2: 94, steps: 7450, note: "possible fatigue", isAbnormal: true },
  { heartRate: 80, spo2: 97, steps: 5360, note: "stable", isAbnormal: false },
  { heartRate: 72, spo2: 98, steps: 4688, note: "recovered", isAbnormal: false }
]

const MOCK_VISION_SAMPLES = [
  { action: "DANGER: FALL", severity: "High", confidence: 0.96, location: "living-room", description: "Fall detected by vision model.", frameTag: "vision-fall-01" },
  { action: "CRITICAL SOS: WAVING", severity: "High", confidence: 0.94, location: "bedroom", description: "SOS gesture detected by vision model.", frameTag: "vision-sos-01" },
  { action: "OFF_BED", severity: "Medium", confidence: 0.88, location: "bedroom", description: "Bed exit detected.", frameTag: "vision-offbed-01" },
  { action: "SEDENTARY", severity: "Low", confidence: 0.82, location: "chair", description: "Long sedentary period detected.", frameTag: "vision-sedentary-01" }
]

const MOCK_FAMILY_ALERTS = [
  { alertId: "AL-2501", type: "fall", level: "High", happenedAt: "2026-03-16T08:21:00+08:00", location: "living-room", status: "Pending" },
  { alertId: "AL-2502", type: "off-bed", level: "Medium", happenedAt: "2026-03-16T02:16:00+08:00", location: "bedroom", status: "Processing" },
  { alertId: "AL-2503", type: "sedentary", level: "Low", happenedAt: "2026-03-15T14:05:00+08:00", location: "chair", status: "Done" }
]

const MOCK_FAMILY_CARE_RECORDS = [
  { recordDate: "2026-03-16T12:35:00+08:00", time: "12:35", medicine: "taken", meal: "80%", toilet: "normal", activity: "walk" },
  { recordDate: "2026-03-16T19:15:00+08:00", time: "19:15", medicine: "pending", meal: "taken", toilet: "assisted", activity: "room walk" },
  { recordDate: "2026-03-14T08:18:00+08:00", time: "08:18", medicine: "pending", meal: "taken", toilet: "assisted", activity: "stretch" }
]

const MOCK_FAMILY_EVENTS = [
  { eventId: "EV-3401", type: "fall", description: "Fall detected in living room.", media: "snapshot + clip", status: "Done", happenedAt: "2026-03-16T08:21:00+08:00" },
  { eventId: "EV-3402", type: "off-bed", description: "Night bed exit detected.", media: "clip", status: "Processing", happenedAt: "2026-03-16T02:16:00+08:00" },
  { eventId: "EV-3403", type: "sos", description: "SOS gesture detected.", media: "snapshot", status: "Done", happenedAt: "2026-03-13T09:22:00+08:00" }
]

const MOCK_CAREGIVER_ALERTS = [
  { alertId: "CG-AL-501", type: "Fall", riskLevel: "High", status: "Pending", actionTaken: "Assisted standing", happenedAt: "2026-03-16T09:23:00+08:00" },
  { alertId: "CG-AL-502", type: "Bed exit", riskLevel: "Medium", status: "Processing", actionTaken: "Helped back to bed", happenedAt: "2026-03-16T08:41:00+08:00" },
  { alertId: "CG-AL-503", type: "Long sitting", riskLevel: "Low", status: "Done", actionTaken: "Guided movement", happenedAt: "2026-03-16T07:55:00+08:00" },
  { alertId: "CG-AL-504", type: "Fall", riskLevel: "High", status: "Pending", actionTaken: "Called nurse", happenedAt: "2026-03-15T22:12:00+08:00" },
  { alertId: "CG-AL-505", type: "Abnormal behavior", riskLevel: "Medium", status: "Processing", actionTaken: "Observed nearby", happenedAt: "2026-03-15T19:06:00+08:00" },
  { alertId: "CG-AL-506", type: "Bed exit", riskLevel: "Medium", status: "Done", actionTaken: "Safety check", happenedAt: "2026-03-15T16:31:00+08:00" },
  { alertId: "CG-AL-507", type: "Long sitting", riskLevel: "Low", status: "Done", actionTaken: "Stretch reminder", happenedAt: "2026-03-15T13:20:00+08:00" },
  { alertId: "CG-AL-508", type: "Fall", riskLevel: "High", status: "Processing", actionTaken: "Bandage support", happenedAt: "2026-03-15T10:42:00+08:00" },
  { alertId: "CG-AL-509", type: "Abnormal behavior", riskLevel: "Medium", status: "Pending", actionTaken: "Family notified", happenedAt: "2026-03-15T08:11:00+08:00" },
  { alertId: "CG-AL-510", type: "Bed exit", riskLevel: "Low", status: "Done", actionTaken: "Monitor cleared", happenedAt: "2026-03-14T23:58:00+08:00" }
]

const MOCK_CAREGIVER_CARE_LOGS = [
  { logId: "CG-LOG-101", tasks: [{ task: "Medicine", status: "Done", time: "08:05" }, { task: "Meal", status: "Done", time: "12:20" }, { task: "Walk", status: "Skipped", time: "17:40" }], vitals: { heartRate: 102, bloodPressure: "142/92", spo2: 97, heartRateState: "abnormal", bloodPressureState: "abnormal", spo2State: "normal" }, happenedAt: "2026-03-16T18:00:00+08:00" },
  { logId: "CG-LOG-102", tasks: [{ task: "Medicine", status: "Done", time: "08:00" }, { task: "Meal", status: "Done", time: "12:15" }, { task: "Walk", status: "Done", time: "16:35" }], vitals: { heartRate: 88, bloodPressure: "126/82", spo2: 98, heartRateState: "normal", bloodPressureState: "normal", spo2State: "normal" }, happenedAt: "2026-03-15T18:00:00+08:00" },
  { logId: "CG-LOG-103", tasks: [{ task: "Medicine", status: "Done", time: "08:10" }, { task: "Meal", status: "Done", time: "12:34" }, { task: "Walk", status: "Done", time: "16:55" }], vitals: { heartRate: 76, bloodPressure: "120/78", spo2: 99, heartRateState: "normal", bloodPressureState: "normal", spo2State: "normal" }, happenedAt: "2026-03-14T18:00:00+08:00" },
  { logId: "CG-LOG-104", tasks: [{ task: "Medicine", status: "Skipped", time: "08:20" }, { task: "Meal", status: "Done", time: "12:05" }, { task: "Walk", status: "Skipped", time: "17:20" }], vitals: { heartRate: 58, bloodPressure: "96/64", spo2: 95, heartRateState: "abnormal", bloodPressureState: "normal", spo2State: "normal" }, happenedAt: "2026-03-13T18:00:00+08:00" },
  { logId: "CG-LOG-105", tasks: [{ task: "Medicine", status: "Done", time: "08:07" }, { task: "Meal", status: "Done", time: "12:26" }, { task: "Walk", status: "Done", time: "16:10" }], vitals: { heartRate: 94, bloodPressure: "132/86", spo2: 96, heartRateState: "normal", bloodPressureState: "abnormal", spo2State: "normal" }, happenedAt: "2026-03-12T18:00:00+08:00" },
  { logId: "CG-LOG-106", tasks: [{ task: "Medicine", status: "Done", time: "08:09" }, { task: "Meal", status: "Done", time: "12:31" }, { task: "Walk", status: "Done", time: "16:45" }], vitals: { heartRate: 82, bloodPressure: "124/80", spo2: 97, heartRateState: "normal", bloodPressureState: "normal", spo2State: "normal" }, happenedAt: "2026-03-11T18:00:00+08:00" },
  { logId: "CG-LOG-107", tasks: [{ task: "Medicine", status: "Done", time: "08:12" }, { task: "Meal", status: "Done", time: "12:44" }, { task: "Walk", status: "Skipped", time: "17:02" }], vitals: { heartRate: 108, bloodPressure: "146/94", spo2: 94, heartRateState: "abnormal", bloodPressureState: "abnormal", spo2State: "abnormal" }, happenedAt: "2026-03-10T18:00:00+08:00" },
  { logId: "CG-LOG-108", tasks: [{ task: "Medicine", status: "Done", time: "08:03" }, { task: "Meal", status: "Done", time: "12:18" }, { task: "Walk", status: "Done", time: "16:20" }], vitals: { heartRate: 79, bloodPressure: "118/76", spo2: 99, heartRateState: "normal", bloodPressureState: "normal", spo2State: "normal" }, happenedAt: "2026-03-09T18:00:00+08:00" },
  { logId: "CG-LOG-109", tasks: [{ task: "Medicine", status: "Done", time: "08:16" }, { task: "Meal", status: "Done", time: "12:39" }, { task: "Walk", status: "Done", time: "16:33" }], vitals: { heartRate: 86, bloodPressure: "128/84", spo2: 98, heartRateState: "normal", bloodPressureState: "normal", spo2State: "normal" }, happenedAt: "2026-03-08T18:00:00+08:00" },
  { logId: "CG-LOG-110", tasks: [{ task: "Medicine", status: "Skipped", time: "08:22" }, { task: "Meal", status: "Done", time: "12:11" }, { task: "Walk", status: "Skipped", time: "17:25" }], vitals: { heartRate: 61, bloodPressure: "100/66", spo2: 96, heartRateState: "normal", bloodPressureState: "normal", spo2State: "normal" }, happenedAt: "2026-03-07T18:00:00+08:00" }
]

const MOCK_CAREGIVER_LANGUAGE = [
  { sessionId: "CG-LANG-001", language: "id", voice: "female", translatedAlerts: [{ original: "Night bed exit alert", translated: "Peringatan keluar dari tempat tidur malam hari", locale: "Indonesian" }], phrases: [{ text: "Please take medicine", lang: "ZH / ID / EN" }, { text: "Are you okay?", lang: "ZH / ID / VI" }], happenedAt: "2026-03-16T09:00:00+08:00" },
  { sessionId: "CG-LANG-002", language: "vi", voice: "female", translatedAlerts: [{ original: "Fall high risk event", translated: "Canh bao nguy co nga cao", locale: "Vietnamese" }], phrases: [{ text: "Please sit down", lang: "ZH / VI / EN" }, { text: "I will help you", lang: "ZH / VI / ID" }], happenedAt: "2026-03-15T09:00:00+08:00" },
  { sessionId: "CG-LANG-003", language: "en", voice: "male", translatedAlerts: [{ original: "Abnormal behavior detected", translated: "Abnormal behavior detected", locale: "English" }], phrases: [{ text: "Time to eat", lang: "ZH / EN / ID" }, { text: "Need help?", lang: "ZH / EN / VI" }], happenedAt: "2026-03-14T09:00:00+08:00" },
  { sessionId: "CG-LANG-004", language: "id", voice: "male", translatedAlerts: [{ original: "Fall warning", translated: "Peringatan jatuh", locale: "Indonesian" }], phrases: [{ text: "Please rest now", lang: "ZH / ID / EN" }, { text: "Do not stand alone", lang: "ZH / ID / VI" }], happenedAt: "2026-03-13T09:00:00+08:00" },
  { sessionId: "CG-LANG-005", language: "vi", voice: "female", translatedAlerts: [{ original: "Bed exit warning", translated: "Canh bao roi giuong", locale: "Vietnamese" }], phrases: [{ text: "Please drink water", lang: "ZH / VI / EN" }, { text: "Please wait a moment", lang: "ZH / VI / ID" }], happenedAt: "2026-03-12T09:00:00+08:00" },
  { sessionId: "CG-LANG-006", language: "en", voice: "female", translatedAlerts: [{ original: "Long sitting warning", translated: "Long sitting warning", locale: "English" }], phrases: [{ text: "Let's walk slowly", lang: "ZH / EN / ID" }, { text: "Take a deep breath", lang: "ZH / EN / VI" }], happenedAt: "2026-03-11T09:00:00+08:00" },
  { sessionId: "CG-LANG-007", language: "id", voice: "female", translatedAlerts: [{ original: "Emergency hand gesture", translated: "Gerakan tangan darurat terdeteksi", locale: "Indonesian" }], phrases: [{ text: "I am calling family", lang: "ZH / ID / EN" }, { text: "Stay calm", lang: "ZH / ID / VI" }], happenedAt: "2026-03-10T09:00:00+08:00" },
  { sessionId: "CG-LANG-008", language: "vi", voice: "male", translatedAlerts: [{ original: "Need caregiver check", translated: "Can kiem tra ho tro ngay", locale: "Vietnamese" }], phrases: [{ text: "Please lie down", lang: "ZH / VI / EN" }, { text: "Medicine first", lang: "ZH / VI / ID" }], happenedAt: "2026-03-09T09:00:00+08:00" },
  { sessionId: "CG-LANG-009", language: "en", voice: "male", translatedAlerts: [{ original: "System unstable warning", translated: "System unstable warning", locale: "English" }], phrases: [{ text: "Network is unstable", lang: "ZH / EN / ID" }, { text: "Please wait for support", lang: "ZH / EN / VI" }], happenedAt: "2026-03-08T09:00:00+08:00" },
  { sessionId: "CG-LANG-010", language: "id", voice: "female", translatedAlerts: [{ original: "Medication reminder", translated: "Pengingat minum obat", locale: "Indonesian" }], phrases: [{ text: "Take medicine now", lang: "ZH / ID / EN" }, { text: "How do you feel now?", lang: "ZH / ID / VI" }], happenedAt: "2026-03-07T09:00:00+08:00" }
]

const MOCK_CAREGIVER_SYSTEM = [
  { systemId: "CG-SYS-001", healthScore: 87, networkRows: [{ area: "Living room camera", status: "Stable", signal: "98%" }, { area: "Bedroom sensor", status: "Unstable", signal: "62%" }, { area: "Wearable bridge", status: "Stable", signal: "91%" }], backupRows: [{ event: "Fall event", capturedAt: "2026-03-16 09:23", media: "10s clip + screenshot" }, { event: "Bed exit warning", capturedAt: "2026-03-16 08:41", media: "10s clip" }], happenedAt: "2026-03-16T09:30:00+08:00" },
  { systemId: "CG-SYS-002", healthScore: 93, networkRows: [{ area: "Living room camera", status: "Stable", signal: "96%" }, { area: "Bedroom sensor", status: "Stable", signal: "92%" }, { area: "Wearable bridge", status: "Stable", signal: "89%" }], backupRows: [{ event: "Long sitting warning", capturedAt: "2026-03-15 15:21", media: "Screenshot" }], happenedAt: "2026-03-15T15:30:00+08:00" },
  { systemId: "CG-SYS-003", healthScore: 82, networkRows: [{ area: "Living room camera", status: "Stable", signal: "94%" }, { area: "Bedroom sensor", status: "Unstable", signal: "58%" }, { area: "Wearable bridge", status: "Stable", signal: "87%" }], backupRows: [{ event: "Fall event", capturedAt: "2026-03-14 20:10", media: "10s clip + screenshot" }], happenedAt: "2026-03-14T20:30:00+08:00" },
  { systemId: "CG-SYS-004", healthScore: 90, networkRows: [{ area: "Living room camera", status: "Stable", signal: "95%" }, { area: "Bedroom sensor", status: "Stable", signal: "88%" }, { area: "Wearable bridge", status: "Stable", signal: "90%" }], backupRows: [{ event: "Bed exit warning", capturedAt: "2026-03-13 23:30", media: "10s clip" }], happenedAt: "2026-03-13T23:45:00+08:00" },
  { systemId: "CG-SYS-005", healthScore: 85, networkRows: [{ area: "Living room camera", status: "Stable", signal: "93%" }, { area: "Bedroom sensor", status: "Unstable", signal: "64%" }, { area: "Wearable bridge", status: "Stable", signal: "88%" }], backupRows: [{ event: "Abnormal behavior", capturedAt: "2026-03-12 11:18", media: "10s clip" }], happenedAt: "2026-03-12T11:30:00+08:00" },
  { systemId: "CG-SYS-006", healthScore: 92, networkRows: [{ area: "Living room camera", status: "Stable", signal: "97%" }, { area: "Bedroom sensor", status: "Stable", signal: "90%" }, { area: "Wearable bridge", status: "Stable", signal: "86%" }], backupRows: [{ event: "Medication reminder", capturedAt: "2026-03-11 08:02", media: "Screenshot" }], happenedAt: "2026-03-11T08:30:00+08:00" },
  { systemId: "CG-SYS-007", healthScore: 80, networkRows: [{ area: "Living room camera", status: "Unstable", signal: "61%" }, { area: "Bedroom sensor", status: "Stable", signal: "86%" }, { area: "Wearable bridge", status: "Unstable", signal: "57%" }], backupRows: [{ event: "System unstable warning", capturedAt: "2026-03-10 16:41", media: "Log + screenshot" }], happenedAt: "2026-03-10T16:50:00+08:00" },
  { systemId: "CG-SYS-008", healthScore: 89, networkRows: [{ area: "Living room camera", status: "Stable", signal: "92%" }, { area: "Bedroom sensor", status: "Stable", signal: "87%" }, { area: "Wearable bridge", status: "Stable", signal: "84%" }], backupRows: [{ event: "Long sitting warning", capturedAt: "2026-03-09 14:11", media: "Screenshot" }], happenedAt: "2026-03-09T14:30:00+08:00" },
  { systemId: "CG-SYS-009", healthScore: 91, networkRows: [{ area: "Living room camera", status: "Stable", signal: "95%" }, { area: "Bedroom sensor", status: "Stable", signal: "89%" }, { area: "Wearable bridge", status: "Stable", signal: "88%" }], backupRows: [{ event: "Fall event", capturedAt: "2026-03-08 18:55", media: "10s clip + screenshot" }], happenedAt: "2026-03-08T19:10:00+08:00" },
  { systemId: "CG-SYS-010", healthScore: 86, networkRows: [{ area: "Living room camera", status: "Stable", signal: "90%" }, { area: "Bedroom sensor", status: "Unstable", signal: "63%" }, { area: "Wearable bridge", status: "Stable", signal: "83%" }], backupRows: [{ event: "Emergency gesture", capturedAt: "2026-03-07 09:20", media: "Screenshot" }], happenedAt: "2026-03-07T09:35:00+08:00" }
]

app.get("/", (req, res) => {
  res.send("Backend is running!")
})

// ================= Google OAuth（Web + App 深連結） =================
app.get("/auth/google", (req, res, next) => {
  const state = req.query.mobile === "1" ? "mobile" : "web"
  passport.authenticate("google", {
    scope: ["profile", "email"],
    state,
    session: false
  })(req, res, next)
})

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: frontendWebUrl }),
  async (req, res) => {
    try {
      if (!req.user) return res.redirect(frontendWebUrl)
      const { email, name, googleSub } = req.user
      const normalizedEmail = String(email || "").trim().toLowerCase()
      let user =
        (googleSub && (await User.findOne({ googleSub }))) ||
        (await User.findOne({ email: normalizedEmail }))
      if (!user) {
        user = await User.create({
          email: normalizedEmail,
          name: name || normalizedEmail.split("@")[0],
          role: null,
          profileCompleted: false,
          emailVerified: true,
          googleSub: googleSub || undefined,
          authProviders: ["google"]
        })
      } else {
        user.emailVerified = true
        if (googleSub && !user.googleSub) user.googleSub = googleSub
        if (name && !user.name) user.name = name
        const providers = Array.isArray(user.authProviders) ? user.authProviders : []
        if (!providers.includes("google")) user.authProviders = [...providers, "google"]
        await user.save()
      }

      const token = jwt.sign(
        { email: user.email, role: user.role || null },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      )
      const needsRole = !user.role
      const isMobile = String(req.query.state || "") === "mobile"
      if (isMobile) {
        const mobileBase = process.env.MOBILE_OAUTH_SUCCESS_URL || "takecare://auth"
        const sep = mobileBase.includes("?") ? "&" : "?"
        const qs = `token=${encodeURIComponent(token)}&needsRole=${needsRole ? "1" : "0"}&email=${encodeURIComponent(user.email)}`
        const deepLink = `${mobileBase}${sep}${qs}`
        // Chrome 對自訂 scheme 常失敗；加 Android intent:// 備援
        const intentLink = `intent://auth?${qs}#Intent;scheme=takecare;package=com.takecaremobile;end`
        const nextHint = needsRole
          ? "信箱已由 Google 驗證完成。回到 App 後請選擇身分（看護／家屬需綁定長輩）。"
          : "信箱已由 Google 驗證完成。請回到 App 繼續使用。"
        res.setHeader("Content-Type", "text/html; charset=utf-8")
        return res.send(`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TakeCare 登入成功</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f2f7ff;color:#11355c;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}
    .card{background:#fff;border-radius:16px;padding:28px 22px;max-width:360px;box-shadow:0 8px 24px rgba(17,53,92,.08)}
    h1{font-size:22px;margin:0 0 8px}
    p{color:#526b88;line-height:1.55;margin:0 0 16px}
    a.btn{display:block;background:#1f74d1;color:#fff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:12px;margin-top:10px}
    a.btn2{background:#11355c}
    .note{font-size:12px;color:#94a3b8;margin-top:16px}
  </style>
</head>
<body>
  <div class="card">
    <h1>Google 帳號已確認</h1>
    <p>${nextHint}</p>
    <a class="btn" href="${intentLink}">回到 TakeCare</a>
    <a class="btn btn2" href="${deepLink}">備用連結</a>
    <p class="note">若仍無法跳轉：請先重建安裝 App（需含 takecare:// 深連結），再重試 Google 登入。</p>
  </div>
  <script>
    setTimeout(function () { window.location.href = ${JSON.stringify(intentLink)}; }, 400);
  </script>
</body>
</html>`)
      }
      return res.redirect(buildOauthSuccessUrl(token))
    } catch (err) {
      console.log("callback error:", err.message)
      return res.redirect(frontendWebUrl)
    }
  }
)

// ================= Helpers =================
function normalizeRoleForMobile(role) {
  if (role === "patient" || role === "family" || role === "caregiver") return role
  return "patient"
}

function normalizeLinkedPatientEmail(value) {
  return String(value || "").trim().toLowerCase()
}

async function validateLinkedPatientEmailForRole(role, linkedPatientEmail, ownEmail) {
  if (role === "patient") return ""
  if (!linkedPatientEmail) return { error: "家屬端或看護端必須輸入要連接的長輩 Email" }
  if (linkedPatientEmail === ownEmail) return { error: "連接的長輩 Email 不能與自己的 Email 相同" }
  const patient = await User.findOne({ email: linkedPatientEmail, role: "patient" })
  if (!patient) return { error: "找不到這個長輩帳號，請先用該 Email 建立受顧者端" }
  return linkedPatientEmail
}

async function resolveTargetPatient(userId) {
  const user = await User.findById(userId)
  if (!user) { const e = new Error("User not found"); e.statusCode = 404; throw e }
  if (user.role === "patient") return user._id
  const linkedPatientEmail = normalizeLinkedPatientEmail(
    user.activePatientEmail || user.linkedPatientEmail
  )
  if (!linkedPatientEmail) { const e = new Error("尚未連接長輩帳號"); e.statusCode = 400; throw e }
  const patient = await User.findOne({ email: linkedPatientEmail, role: "patient" })
  if (!patient) { const e = new Error("找不到已連接的長輩帳號"); e.statusCode = 404; throw e }
  return patient._id
}

/** 確認紀錄屬於綁定長輩；否則 403（找不到則 404） */
function assertPatientOwned(record, patientUserId, notFoundMessage = "Record not found") {
  if (!record) { const e = new Error(notFoundMessage); e.statusCode = 404; throw e }
  if (String(record.patientUserId) !== String(patientUserId)) {
    const e = new Error("無權限存取此資料"); e.statusCode = 403; throw e
  }
  return record
}

/** 認領：指派給自己；若仍是 Pending 順帶推進到 Processing */
async function claimAbnormalEvent(record, user, role) {
  record.claimedByUserId = user._id
  record.claimedByRole = role
  record.claimedAt = new Date()
  if (record.status === "Pending") record.status = "Processing"
  await record.save()
  return record
}

/** 解除：標記 Done。備註可空，預設「已查看」（R99；不必填如何處理） */
async function resolveAbnormalEvent(record, user, role, note) {
  const resolvedNote = (typeof note === "string" ? note.trim() : "") || "已查看"
  record.status = "Done"
  record.resolvedNote = resolvedNote
  record.resolvedAt = new Date()
  record.resolvedByUserId = user._id
  record.resolveKind = "caregiver"
  if (!record.claimedByUserId) {
    record.claimedByUserId = user._id
    record.claimedByRole = role
    record.claimedAt = record.claimedAt || new Date()
  }
  await record.save()
  clearCriticalEscalation(record._id)
  return record
}

/**
 * U2b：看護結案「現在」這筆後，同長輩其餘未結案 Alert 全部覆蓋結案（不只比 happenedAt）。
 * 產品語意：只處理現行事故；其餘歸歷程，絕不變成「往更早一筆一筆跳」。
 * 歷史仍可考證（resolveKind=superseded + supersededByAlertId）。
 */
async function supersedeOlderOpenAlerts(resolvedRecord, user, note) {
  const winnerId = String(resolvedRecord._id)
  const winnerEventId = resolvedRecord.eventId || winnerId
  const noteSnippet = typeof note === "string" && note.trim()
    ? note.trim().slice(0, 80)
    : ""
  const supersededNote = noteSnippet
    ? `被後續事件覆蓋／一併結案（參照 ${winnerEventId}：${noteSnippet}）`
    : `被後續事件覆蓋／一併結案（參照 ${winnerEventId}）`

  const openRows = await AbnormalEvent.find({
    patientUserId: resolvedRecord.patientUserId,
    _id: { $ne: resolvedRecord._id },
    status: { $in: ["Pending", "Processing"] }
  }).select("_id").lean()
  for (const row of openRows) clearCriticalEscalation(row._id)

  const result = await AbnormalEvent.updateMany(
    {
      patientUserId: resolvedRecord.patientUserId,
      _id: { $ne: resolvedRecord._id },
      status: { $in: ["Pending", "Processing"] }
    },
    {
      $set: {
        status: "Done",
        resolveKind: "superseded",
        supersededByAlertId: winnerId,
        resolvedNote: supersededNote,
        resolvedAt: resolvedRecord.resolvedAt || new Date(),
        resolvedByUserId: user._id,
        claimedByUserId: user._id,
        claimedByRole: "caregiver",
        claimedAt: new Date()
      }
    }
  )
  return result.modifiedCount || 0
}

function publicEvidenceViews(evidenceList = []) {
  return (evidenceList || []).filter(Boolean).map(item => ({
    evidenceId: item.evidenceId,
    mediaType: item.mediaType,
    contentType: item.contentType,
    durationSec: item.durationSec,
    startAt: item.startAt,
    createdAt: item.createdAt,
    urlPath: item.evidenceId ? `/media/evidence/${encodeURIComponent(item.evidenceId)}` : ""
  }))
}

async function attachEvidenceToTargets({ patientUserId, alertId, eventKey, mediaType, contentType, buffer, durationSec, startAt }) {
  const stored = await objectStore.putObject({
    patientUserId: String(patientUserId),
    mediaType: mediaType === "clip" ? "clip" : "snapshot",
    contentType,
    buffer
  })
  const entry = {
    evidenceId: stored.evidenceId,
    mediaType: stored.contentType && String(mediaType).toLowerCase() === "clip" ? "clip" : (mediaType === "clip" ? "clip" : "snapshot"),
    objectKey: stored.objectKey,
    contentType: stored.contentType,
    durationSec: Number.isFinite(Number(durationSec)) ? Number(durationSec) : undefined,
    startAt: startAt ? new Date(startAt) : undefined,
    createdAt: new Date()
  }
  // normalize mediaType from arg
  entry.mediaType = mediaType === "clip" ? "clip" : "snapshot"

  const touched = { alert: null, vision: null }

  if (alertId) {
    const alert = await AbnormalEvent.findById(alertId)
    if (alert && String(alert.patientUserId) === String(patientUserId)) {
      alert.evidence = [...(alert.evidence || []), entry]
      await alert.save()
      touched.alert = alert
    }
  }

  if (eventKey) {
    const vision = await VisionDetectionRecord.findOne({ patientUserId, frameTag: String(eventKey).trim() })
    if (vision) {
      vision.evidence = [...(vision.evidence || []), entry]
      await vision.save()
      touched.vision = vision
    }
    if (!touched.alert) {
      const byKey = await AbnormalEvent.findOne({ patientUserId, sourceEventKey: String(eventKey).trim() }).sort({ happenedAt: -1 })
      if (byKey) {
        byKey.evidence = [...(byKey.evidence || []), entry]
        await byKey.save()
        touched.alert = byKey
      }
    }
  }

  if (!touched.alert && !touched.vision && alertId) {
    const e = new Error("找不到可掛載的警報或事件")
    e.statusCode = 404
    throw e
  }
  if (!touched.alert && !touched.vision && !alertId && eventKey) {
    // 允許先只掛在之後建立的紀錄：若 vision 尚無，建一個佔位失敗 → 要求至少有一端
    const e = new Error("找不到對應 eventKey 的影像事件或警報")
    e.statusCode = 404
    throw e
  }

  return { entry, touched }
}

async function findEvidenceById(evidenceId) {
  const id = String(evidenceId || "").trim()
  if (!id) return null
  const alert = await AbnormalEvent.findOne({ "evidence.evidenceId": id }).lean()
  if (alert) {
    const item = (alert.evidence || []).find(e => e.evidenceId === id)
    if (item) return { item, patientUserId: alert.patientUserId }
  }
  const vision = await VisionDetectionRecord.findOne({ "evidence.evidenceId": id }).lean()
  if (vision) {
    const item = (vision.evidence || []).find(e => e.evidenceId === id)
    if (item) return { item, patientUserId: vision.patientUserId }
  }
  return null
}

const EVIDENCE_SNAP_KEEP_DAYS = Math.max(1, Number(process.env.EVIDENCE_SNAP_KEEP_DAYS || 7))
const EVIDENCE_CLIP_KEEP_DAYS = Math.max(1, Number(process.env.EVIDENCE_CLIP_KEEP_DAYS || 30))

function evidenceKeepMs(mediaType) {
  const days = mediaType === "clip" ? EVIDENCE_CLIP_KEEP_DAYS : EVIDENCE_SNAP_KEEP_DAYS
  return days * 24 * 60 * 60 * 1000
}

function jpegFromMp4Buffer(buffer) {
  if (!buffer || !buffer.length) return null
  const ffmpeg = process.env.FFMPEG_PATH
    || (fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "")
    || (fs.existsSync("/usr/local/bin/ffmpeg") ? "/usr/local/bin/ffmpeg" : "ffmpeg")
  const tmpIn = path.join(os.tmpdir(), `takecare-in-${Date.now()}.mp4`)
  const tmpOut = path.join(os.tmpdir(), `takecare-thumb-${Date.now()}.jpg`)
  try {
    fs.writeFileSync(tmpIn, buffer)
    const result = spawnSync(ffmpeg, ["-y", "-i", tmpIn, "-frames:v", "1", "-q:v", "6", tmpOut], {
      timeout: 20000
    })
    if (result.status !== 0 || !fs.existsSync(tmpOut)) return null
    return fs.readFileSync(tmpOut)
  } catch (err) {
    console.log("evidence thumb ffmpeg failed:", err.message)
    return null
  } finally {
    try { fs.unlinkSync(tmpIn) } catch { /* ignore */ }
    try { fs.unlinkSync(tmpOut) } catch { /* ignore */ }
  }
}

async function purgeExpiredEvidence() {
  const now = Date.now()
  let removed = 0
  const docs = [
    ...(await AbnormalEvent.find({ "evidence.0": { $exists: true } })),
    ...(await VisionDetectionRecord.find({ "evidence.0": { $exists: true } }))
  ]
  for (const doc of docs) {
    const next = []
    let changed = false
    for (const item of doc.evidence || []) {
      const stamp = new Date(item.createdAt || item.startAt || doc.happenedAt || doc.detectedAt || 0).getTime()
      const expired = Number.isFinite(stamp) && stamp > 0 && now - stamp > evidenceKeepMs(item.mediaType)
      if (expired) {
        await objectStore.deleteObject(item.objectKey)
        removed += 1
        changed = true
      } else {
        next.push(item)
      }
    }
    if (changed) {
      doc.evidence = next
      await doc.save()
    }
  }
  if (removed) console.log(`evidence purge: removed ${removed} (snap ${EVIDENCE_SNAP_KEEP_DAYS}d / clip ${EVIDENCE_CLIP_KEEP_DAYS}d)`)
}

/** G3：異常列表＝Alert（已回報）＋僅紀錄的 Vision Event（alertBuilt=false）；附處理人標籤 */
async function buildAlertsHistoryForPatient(patientUserId, { severity, status, limit } = {}) {
  const alertFilter = { patientUserId }
  if (severity) alertFilter.severity = normalizeSeverity(severity)
  if (status) alertFilter.status = normalizeAlertStatus(status)
  const alerts = await AbnormalEvent.find(alertFilter).sort({ happenedAt: -1, _id: -1 }).limit(limit).lean()

  const claimerIds = [...new Set(alerts.map(a => a.claimedByUserId).filter(Boolean).map(String))]
  const claimers = claimerIds.length
    ? await User.find({ _id: { $in: claimerIds } }).select("email role").lean()
    : []
  const claimerMap = Object.fromEntries(claimers.map(u => [String(u._id), u]))

  const alertRows = alerts.map(a => {
    const claimer = a.claimedByUserId ? claimerMap[String(a.claimedByUserId)] : null
    const emailPrefix = claimer?.email ? String(claimer.email).split("@")[0] : ""
    const roleLabel = a.claimedByRole === "caregiver" ? "看護" : a.claimedByRole === "family" ? "家屬" : ""
    return {
      ...a,
      alertBuilt: true,
      handlerLabel: emailPrefix ? `${roleLabel || "處理人"} ${emailPrefix}`.trim() : (roleLabel || ""),
      recordKind: "alert",
      resolveKind: a.resolveKind || (a.status === "Done" ? "caregiver" : null),
      supersededByAlertId: a.supersededByAlertId || null,
      evidence: publicEvidenceViews(a.evidence)
    }
  })

  // 僅紀錄：未建立 Alert 的影像事件（蹲下／彎腰等）；篩「已處理／處理中」時不混入
  let visionRows = []
  const statusNorm = status ? normalizeAlertStatus(status) : ""
  if (!statusNorm || statusNorm === "Pending") {
    const visionFilter = { patientUserId, alertBuilt: { $ne: true } }
    if (severity) visionFilter.severity = normalizeSeverity(severity)
    const visions = await VisionDetectionRecord.find(visionFilter).sort({ detectedAt: -1, _id: -1 }).limit(limit).lean()
    visionRows = visions.map(v => ({
      _id: v._id,
      eventId: `EV-${String(v._id).slice(-8)}`,
      type: toVisionAlertType(v.action),
      severity: v.severity,
      status: "Pending",
      happenedAt: v.detectedAt,
      location: v.location || "",
      description: v.description || "",
      alertBuilt: false,
      handlerLabel: "",
      resolvedNote: "",
      recordKind: "vision-event",
      source: v.source,
      resolveKind: null,
      supersededByAlertId: null,
      evidence: publicEvidenceViews(v.evidence)
    }))
  }

  return [...alertRows, ...visionRows]
    .sort((a, b) => new Date(b.happenedAt || 0) - new Date(a.happenedAt || 0))
    .slice(0, limit)
}

/** H2：家屬／看護歷程統計（週／月）；無需鏡頭 */
function rangeBounds(range) {
  const now = new Date()
  const to = now
  let from
  if (range === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  } else {
    // 近 7 日（含今天）— 週一當天若用「本週一」會只剩 1 天，圖表看不出趨勢
    from = new Date(now)
    from.setHours(0, 0, 0, 0)
    from.setDate(from.getDate() - 6)
  }
  const prevMs = to.getTime() - from.getTime()
  const prevTo = new Date(from.getTime() - 1)
  const prevFrom = new Date(from.getTime() - prevMs)
  return { from, to, prevFrom, prevTo, range: range === "month" ? "month" : "week" }
}

function dayKey(d) {
  const x = new Date(d)
  const m = String(x.getMonth() + 1).padStart(2, "0")
  const day = String(x.getDate()).padStart(2, "0")
  return `${x.getFullYear()}-${m}-${day}`
}

async function buildAlertStatsForPatient(patientUserId, range = "week") {
  const bounds = rangeBounds(range)
  const alerts = await AbnormalEvent.find({
    patientUserId,
    happenedAt: { $gte: bounds.from, $lte: bounds.to }
  }).lean()
  const visions = await VisionDetectionRecord.find({
    patientUserId,
    alertBuilt: { $ne: true },
    detectedAt: { $gte: bounds.from, $lte: bounds.to }
  }).lean()

  const prevAlerts = await AbnormalEvent.find({
    patientUserId,
    happenedAt: { $gte: bounds.prevFrom, $lte: bounds.prevTo }
  }).lean()

  const sosEvents = await SosEvent.find({
    patientUserId,
    triggeredAt: { $gte: bounds.from, $lte: bounds.to },
    status: { $ne: "cancelled" }
  }).lean()

  const seriesMap = {}
  const bump = (key, field) => {
    if (!seriesMap[key]) seriesMap[key] = { date: key, alertHigh: 0, recordOnly: 0, sos: 0, resolved: 0, superseded: 0 }
    seriesMap[key][field] += 1
  }

  let alertHigh = 0
  let alertCritical = 0
  let recordOnly = 0
  let sosCount = 0
  let resolved = 0
  let superseded = 0
  let resolveMinutesSum = 0
  let resolveMinutesN = 0

  for (const a of alerts) {
    const key = dayKey(a.happenedAt || a.createdAt)
    if (a.severity === "Critical") {
      alertCritical += 1
      bump(key, "alertHigh")
    } else if (a.severity === "High" || a.severity === "Medium") {
      alertHigh += 1
      bump(key, "alertHigh")
    } else {
      // Low 等日常等級：計入「日常紀錄」長條（與 Vision 僅紀錄同一視覺桶）
      recordOnly += 1
      bump(key, "recordOnly")
    }
    if (a.status === "Done") {
      resolved += 1
      bump(key, "resolved")
      if (a.resolveKind === "superseded") {
        superseded += 1
        bump(key, "superseded")
      }
      if (a.resolvedAt && a.happenedAt && a.resolveKind !== "superseded") {
        const mins = (new Date(a.resolvedAt) - new Date(a.happenedAt)) / 60000
        if (Number.isFinite(mins) && mins >= 0) {
          resolveMinutesSum += mins
          resolveMinutesN += 1
        }
      }
    }
  }

  for (const v of visions) {
    recordOnly += 1
    bump(dayKey(v.detectedAt || v.createdAt), "recordOnly")
  }

  for (const s of sosEvents) {
    sosCount += 1
    bump(dayKey(s.triggeredAt || s.createdAt), "sos")
  }

  const prevHigh = prevAlerts.filter(a => a.severity === "High" || a.severity === "Critical" || a.severity === "Medium").length

  // 補齊區間每一天，圖表才看得到趨勢（無資料＝0）
  const series = []
  const cursor = new Date(bounds.from)
  cursor.setHours(12, 0, 0, 0)
  const end = new Date(bounds.to)
  while (cursor <= end) {
    const key = dayKey(cursor)
    series.push(seriesMap[key] || { date: key, alertHigh: 0, recordOnly: 0, sos: 0, resolved: 0, superseded: 0 })
    cursor.setDate(cursor.getDate() + 1)
  }

  return {
    range: bounds.range,
    from: bounds.from.toISOString(),
    to: bounds.to.toISOString(),
    totals: {
      alertHigh: alertHigh + alertCritical,
      alertCritical,
      recordOnly,
      sosCount,
      resolved,
      superseded,
      avgResolveMinutes: resolveMinutesN ? Math.round(resolveMinutesSum / resolveMinutesN) : null
    },
    vsPrevious: {
      alertHighDelta: (alertHigh + alertCritical) - prevHigh
    },
    series
  }
}

function verifyToken(req) {
  const header = req.headers.authorization?.split(" ")[1]
  const query = typeof req.query?.access_token === "string" ? req.query.access_token.trim() : ""
  const token = header || query
  if (!token) return null
  try { return jwt.verify(token, process.env.JWT_SECRET) } catch { return null }
}

/** vision-runtime 主動推播用的 shared token（非使用者 JWT）；常數時間比較避免 timing attack */
function verifyVisionSharedToken(req) {
  const expected = process.env.VISION_SHARED_TOKEN || ""
  if (!expected) return false
  const provided = String(req.headers["x-vision-token"] || "")
  const expectedBuf = Buffer.from(expected)
  const providedBuf = Buffer.from(provided)
  if (expectedBuf.length !== providedBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, providedBuf)
}

async function closeStaleCameraSessions(patientUserId) {
  const cutoff = new Date(Date.now() - CAMERA_HEARTBEAT_STALE_MS)
  const stale = await CameraSession.find({
    patientUserId,
    endedAt: null,
    lastHeartbeatAt: { $lt: cutoff }
  })
  for (const session of stale) {
    session.endedAt = session.lastHeartbeatAt || cutoff
    await session.save()
  }
}

async function recordCameraHeartbeat(patientUserId, source = "vision") {
  await closeStaleCameraSessions(patientUserId)
  const now = new Date()
  let open = await CameraSession.findOne({ patientUserId, endedAt: null }).sort({ lastHeartbeatAt: -1 })
  if (!open) {
    open = await CameraSession.create({
      patientUserId,
      startedAt: now,
      lastHeartbeatAt: now,
      source: source || "vision"
    })
    return open
  }
  open.lastHeartbeatAt = now
  if (source) open.source = source
  await open.save()
  return open
}

async function listCameraSessionsForPatient(patientUserId, from, to) {
  await closeStaleCameraSessions(patientUserId)
  const sessions = await CameraSession.find({
    patientUserId,
    startedAt: { $lte: to },
    $or: [{ endedAt: null }, { endedAt: { $gte: from } }]
  }).sort({ startedAt: 1 }).lean()
  return sessions.map((s) => ({
    _id: s._id,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    lastHeartbeatAt: s.lastHeartbeatAt,
    source: s.source || "vision"
  }))
}

function parseSessionWindow(query = {}) {
  const now = new Date()
  const from = query.from ? new Date(query.from) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const to = query.to ? new Date(query.to) : now
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    const err = new Error("from/to 無效")
    err.statusCode = 400
    throw err
  }
  return { from, to }
}

function normalizeLimit(value, fallback = 10, max = 50) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, 1), max)
}

function createSosEventId() { return `SOS-${Date.now()}-${Math.floor(100 + Math.random() * 900)}` }
function createAbnormalEventId() { return `AB-${Date.now()}-${Math.floor(100 + Math.random() * 900)}` }
function createReminderId() { return `RM-${Date.now()}-${Math.floor(100 + Math.random() * 900)}` }

/** reminders 列表 query：completed / days / includeTemplates
 *  完成封存：以 completedAt 為準（無則退回 time）
 */
function applyReminderListQuery(filter, query = {}) {
  if (query.completed === "true") filter.isCompleted = true
  if (query.completed === "false") filter.isCompleted = false
  const includeTemplates = query.includeTemplates === "1" || query.includeTemplates === "true"
  if (includeTemplates) {
    delete filter.source
  }
  const days = Number(query.days)
  if (Number.isFinite(days) && days > 0) {
    const n = Math.min(30, Math.max(1, Math.floor(days)))
    const since = new Date()
    since.setHours(0, 0, 0, 0)
    since.setDate(since.getDate() - (n - 1))
    if (query.completed === "true") {
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { completedAt: { $gte: since } },
            {
              $and: [
                { $or: [{ completedAt: null }, { completedAt: { $exists: false } }] },
                { time: { $gte: since } }
              ]
            }
          ]
        }
      ]
    } else {
      filter.time = { ...(filter.time || {}), $gte: since }
    }
  }
  return filter
}
const SOS_NOTIFICATION_CHANNEL_ID = "sos_emergency"
const ALERT_NOTIFICATION_CHANNEL_ID = "abnormal_alert"
const CHAT_NOTIFICATION_CHANNEL_ID = "care_chat"

/** 正在看某則對話的人：email → partnerEmail；看著就不推系統通知（R95） */
const chatFocusByEmail = new Map()

/** 找出照護圈成員（含 lang＋tokens），供依收訊方母語推播 */
async function getCareCircleUsers(patientEmail, { roles = ["family", "caregiver"] } = {}) {
  const email = String(patientEmail || "").trim().toLowerCase()
  if (!email) return []
  const roleList = Array.isArray(roles) && roles.length ? roles : ["family", "caregiver"]
  const memberRows = await CareCircleMember.find({ patientEmail: email }).select("memberEmail").lean()
  const memberEmails = memberRows.map(r => String(r.memberEmail || "").toLowerCase()).filter(Boolean)
  return User.find({
    role: { $in: roleList },
    $or: [
      ...(memberEmails.length ? [{ email: { $in: memberEmails } }] : []),
      { linkedPatientEmail: email }
    ]
  })
}

async function getCareCircleTokens(patientEmail, { roles = ["family", "caregiver"] } = {}) {
  const careCircleUsers = await getCareCircleUsers(patientEmail, { roles })
  return [...new Set(
    careCircleUsers
      .flatMap(user => Array.isArray(user.pushTokens) ? user.pushTokens : [])
      .map(entry => entry?.token)
      .filter(Boolean)
  )]
}

const SOS_MESSAGE_BY_KEY = {
  needHelp: {
    zh: "我需要幫助",
    en: "I need help",
    id: "Saya butuh bantuan",
    vi: "Tôi cần giúp đỡ",
    tl: "Kailangan ko ng tulong",
    th: "ฉันต้องการความช่วยเหลือ"
  },
  fell: {
    zh: "我跌倒了",
    en: "I fell",
    id: "Saya terjatuh",
    vi: "Tôi bị ngã",
    tl: "Nahulog ako",
    th: "ฉันล้ม"
  },
  comeQuick: {
    zh: "請快點來",
    en: "Please come quickly",
    id: "Tolong segera datang",
    vi: "Xin hãy đến nhanh",
    tl: "Pakibilisan pong dumating",
    th: "กรุณามาเร็วๆ"
  }
}

const CHAT_PRESET_BY_KEY = {
  ok: {
    zh: "你還好嗎？",
    en: "Are you alright?",
    id: "Apa kabarmu?",
    vi: "Bạn ổn chứ?",
    tl: "Okay ka ba?",
    th: "คุณสบายดีไหม?"
  },
  help: {
    zh: "需要幫忙嗎？",
    en: "Need help?",
    id: "Perlu bantuan?",
    vi: "Cần giúp không?",
    tl: "Kailangan mo ba ng tulong?",
    th: "ต้องการความช่วยเหลือไหม?"
  },
  med: {
    zh: "該吃藥了。",
    en: "Time for medicine.",
    id: "Waktunya minum obat.",
    vi: "Đến giờ uống thuốc.",
    tl: "Oras na ng gamot.",
    th: "ถึงเวลากินยาแล้ว"
  },
  slow: {
    zh: "慢慢來，不急。",
    en: "Take it slow.",
    id: "Pelan-pelan saja.",
    vi: "Từ từ thôi, không vội.",
    tl: "Dahan-dahan lang.",
    th: "ค่อยๆ ทำ ไม่ต้องรีบ"
  },
  here: {
    zh: "我在這裡陪你。",
    en: "I'm here with you.",
    id: "Saya di sini menemani.",
    vi: "Tôi ở đây với bạn.",
    tl: "Nandito ako.",
    th: "ฉันอยู่ตรงนี้กับคุณ"
  },
  pain: {
    zh: "哪裡不舒服？",
    en: "Where does it hurt?",
    id: "Sakit di mana?",
    vi: "Đau chỗ nào?",
    tl: "Saan masakit?",
    th: "ไม่สบายตรงไหน?"
  },
  breathe: {
    zh: "請做深呼吸。",
    en: "Take a deep breath.",
    id: "Tarik napas dalam.",
    vi: "Hãy hít sâu.",
    tl: "Huminga nang malalim.",
    th: "หายใจลึกๆ"
  },
  relax: {
    zh: "放輕鬆，我幫你。",
    en: "Relax, I'll help.",
    id: "Tenang, saya bantu.",
    vi: "Thư giãn, tôi giúp.",
    tl: "Relax, tutulungan kita.",
    th: "ผ่อนคลาย ฉันช่วยเอง"
  },
  drink: {
    zh: "請喝水",
    en: "Please drink some water",
    id: "Tolong minum air",
    vi: "Uống nước nhé",
    tl: "Pakiuminom po ng tubig",
    th: "กรุณาดื่มน้ำ"
  },
  eat: {
    zh: "請先吃飯",
    en: "Please eat first",
    id: "Tolong makan dulu",
    vi: "Ăn cơm trước nhé",
    tl: "Pakikain muna",
    th: "กรุณากินข้าวก่อน"
  },
  bp: {
    zh: "請量血壓",
    en: "Please check blood pressure",
    id: "Tolong ukur tekanan darah",
    vi: "Đo huyết áp giúp nhé",
    tl: "Pakisukat po ng blood pressure",
    th: "กรุณาวัดความดัน"
  },
  bpDone: {
    zh: "已量血壓",
    en: "Blood pressure checked",
    id: "Sudah ukur tekanan darah",
    vi: "Đã đo huyết áp",
    tl: "Nasukat na ang blood pressure",
    th: "วัดความดันแล้ว"
  },
  medDone: {
    zh: "藥已經吃了",
    en: "Already took the medicine",
    id: "Sudah minum obat",
    vi: "Đã uống thuốc rồi",
    tl: "Nainom na ang gamot",
    th: "กินยาแล้ว"
  },
  rest: {
    zh: "正在休息",
    en: "Resting now",
    id: "Sedang istirahat",
    vi: "Đang nghỉ ngơi",
    tl: "Nagpapahinga ngayon",
    th: "กำลังพักอยู่"
  },
  water: {
    zh: "我想喝水",
    en: "I want some water",
    id: "Saya mau minum",
    vi: "Tôi muốn uống nước",
    tl: "Gusto ko ng tubig",
    th: "ฉันอยากดื่มน้ำ"
  },
  hungry: {
    zh: "我肚子餓",
    en: "I'm hungry",
    id: "Saya lapar",
    vi: "Tôi đói bụng",
    tl: "Gutom ako",
    th: "ฉันหิว"
  },
  unwell: {
    zh: "我不舒服",
    en: "I don't feel well",
    id: "Badan saya tidak enak",
    vi: "Tôi không khỏe",
    tl: "Masama ang pakiramdam ko",
    th: "ฉันไม่สบาย"
  },
  assist: {
    zh: "請幫我一下",
    en: "Please help me",
    id: "Tolong bantu saya",
    vi: "Làm ơn giúp tôi",
    tl: "Tulungan ninyo po ako",
    th: "ช่วยฉันหน่อย"
  },
  howAreYou: {
    zh: "今天還好嗎？",
    en: "How are you today?",
    id: "Apa kabar hari ini?",
    vi: "Hôm nay ổn chứ?",
    tl: "Okay ka ba ngayon?",
    th: "วันนี้สบายดีไหม?"
  },
  ateQ: {
    zh: "吃過了嗎？",
    en: "Have you eaten?",
    id: "Sudah makan belum?",
    vi: "Ăn cơm chưa?",
    tl: "Nakakain na ba?",
    th: "กินข้าวหรือยัง?"
  },
  medQ: {
    zh: "藥吃了嗎？",
    en: "Did you take your medicine?",
    id: "Sudah minum obat belum?",
    vi: "Uống thuốc chưa?",
    tl: "Nainom na ba ang gamot?",
    th: "กินยาหรือยัง?"
  },
  comingLater: {
    zh: "我晚點過去",
    en: "I'll come by later",
    id: "Nanti saya datang",
    vi: "Lát nữa tôi qua",
    tl: "Pupunta ako mamaya",
    th: "เดี๋ยวฉันจะแวะไป"
  },
  allGood: {
    zh: "都還好",
    en: "Everything's fine",
    id: "Semua baik-baik saja",
    vi: "Ổn cả rồi",
    tl: "Ayos naman lahat",
    th: "ทุกอย่างโอเค"
  },
  ateDone: {
    zh: "已經吃過了",
    en: "Already ate",
    id: "Sudah makan",
    vi: "Đã ăn rồi",
    tl: "Nakakain na",
    th: "กินข้าวแล้ว"
  },
  imOk: {
    zh: "我沒事",
    en: "I'm okay",
    id: "Saya tidak apa-apa",
    vi: "Tôi không sao",
    tl: "Okay lang ako",
    th: "ฉันไม่เป็นไร"
  },
  comeHere: {
    zh: "請過來一下",
    en: "Please come here",
    id: "Tolong kemari dulu",
    vi: "Qua đây một chút",
    tl: "Halika muna dito",
    th: "มาที่นี่หน่อย"
  },
  thanks: {
    zh: "謝謝",
    en: "Thank you",
    id: "Terima kasih",
    vi: "Cảm ơn",
    tl: "Salamat po",
    th: "ขอบคุณ"
  }
}

function resolveChatPresetMessage(text, phraseKey, targetLang) {
  const lang = TRANSLATE_LANG_MAP[targetLang] ? targetLang : "zh"
  const key = String(phraseKey || "").replace(/^chat\.preset\./, "").trim()
  if (key && CHAT_PRESET_BY_KEY[key]) {
    return CHAT_PRESET_BY_KEY[key][lang] || CHAT_PRESET_BY_KEY[key].en
  }
  const raw = String(text || "").trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  for (const phrases of Object.values(CHAT_PRESET_BY_KEY)) {
    if (Object.values(phrases).some((p) => String(p).trim().toLowerCase() === lower)) {
      return phrases[lang] || phrases.en || raw
    }
  }
  return null
}

function resolveSosDisplayMessage(record, targetLang) {
  const lang = TRANSLATE_LANG_MAP[targetLang] ? targetLang : "zh"
  const key = String(record?.messageKey || "").trim()
  if (key && SOS_MESSAGE_BY_KEY[key]) {
    return SOS_MESSAGE_BY_KEY[key][lang] || SOS_MESSAGE_BY_KEY[key].en || record.message
  }
  // 相容舊資料：用各語短語表反查
  const raw = String(record?.message || "").trim()
  if (raw) {
    const lower = raw.toLowerCase()
    for (const phrases of Object.values(SOS_MESSAGE_BY_KEY)) {
      if (Object.values(phrases).some(p => String(p).toLowerCase() === lower)) {
        return phrases[lang] || phrases.en || raw
      }
    }
  }
  return null
}

async function supersedeOpenSosForPatient(patientUserId, { exceptId = null, reason = "superseded" } = {}) {
  if (!patientUserId) return 0
  const filter = {
    patientUserId,
    status: { $in: ["active", "handling"] }
  }
  if (exceptId) {
    filter._id = { $ne: exceptId }
  }
  const result = await SosEvent.updateMany(filter, {
    $set: {
      status: "resolved",
      resolvedAt: new Date(),
      resolutionNote: reason
    }
  })
  return result.modifiedCount || 0
}

const SOS_PUSH_COPY = {
  zh: {
    title: "緊急 SOS 求救",
    body: (name, msg, loc) => `${name}：${msg}${loc ? `（${loc}）` : ""}`,
    cancelledTitle: "SOS 已取消",
    cancelledBody: (name) => `${name} 取消了緊急求救（可能誤觸）`,
    handlingTitle: "SOS 處理中",
    handlingBody: (handler, name) => `看護 ${handler} 正在處理 ${name} 的求救`,
    remindTitle: "家屬提醒：請處理 SOS",
    remindBody: (name, loc) => `家屬提醒您儘快處理 ${name} 的緊急求救${loc ? `，位置：${loc}` : ""}`,
    resolvedTitle: "SOS 已結束",
    resolvedBody: (handler, name) => `${handler} 已結束 ${name} 的求救`
  },
  en: {
    title: "Emergency SOS",
    body: (name, msg, loc) => `${name}: ${msg}${loc ? ` (${loc})` : ""}`,
    cancelledTitle: "SOS cancelled",
    cancelledBody: (name) => `${name} cancelled the SOS (possible false alarm)`,
    handlingTitle: "SOS being handled",
    handlingBody: (handler, name) => `Caregiver ${handler} is handling ${name}'s SOS`,
    remindTitle: "Family reminder: handle SOS",
    remindBody: (name, loc) => `Family asks you to handle ${name}'s SOS soon${loc ? `, location: ${loc}` : ""}`,
    resolvedTitle: "SOS ended",
    resolvedBody: (handler, name) => `${handler} ended ${name}'s SOS`
  },
  vi: {
    title: "SOS khẩn cấp",
    body: (name, msg, loc) => `${name}: ${msg}${loc ? ` (${loc})` : ""}`,
    cancelledTitle: "Đã hủy SOS",
    cancelledBody: (name) => `${name} đã hủy SOS (có thể bấm nhầm)`,
    handlingTitle: "Đang xử lý SOS",
    handlingBody: (handler, name) => `Người chăm sóc ${handler} đang xử lý SOS của ${name}`,
    remindTitle: "Gia đình nhắc: xử lý SOS",
    remindBody: (name, loc) => `Gia đình nhắc bạn xử lý SOS của ${name}${loc ? `, vị trí: ${loc}` : ""}`,
    resolvedTitle: "Đã kết thúc SOS",
    resolvedBody: (handler, name) => `${handler} đã kết thúc SOS của ${name}`
  },
  id: {
    title: "SOS Darurat",
    body: (name, msg, loc) => `${name}: ${msg}${loc ? ` (${loc})` : ""}`,
    cancelledTitle: "SOS dibatalkan",
    cancelledBody: (name) => `${name} membatalkan SOS (mungkin salah tekan)`,
    handlingTitle: "SOS sedang ditangani",
    handlingBody: (handler, name) => `Perawat ${handler} menangani SOS ${name}`,
    remindTitle: "Pengingat keluarga: tangani SOS",
    remindBody: (name, loc) => `Keluarga mengingatkan Anda menangani SOS ${name}${loc ? `, lokasi: ${loc}` : ""}`,
    resolvedTitle: "SOS berakhir",
    resolvedBody: (handler, name) => `${handler} mengakhiri SOS ${name}`
  },
  tl: {
    title: "Emergency SOS",
    body: (name, msg, loc) => `${name}: ${msg}${loc ? ` (${loc})` : ""}`,
    cancelledTitle: "Kinansela ang SOS",
    cancelledBody: (name) => `Kinansela ni ${name} ang SOS (maaaring aksidente)`,
    handlingTitle: "Hinahawakan ang SOS",
    handlingBody: (handler, name) => `Hinahawakan ni caregiver ${handler} ang SOS ni ${name}`,
    remindTitle: "Paalala ng pamilya: asikasuhin ang SOS",
    remindBody: (name, loc) => `Pinapaalalahanan ka ng pamilya asikasuhin ang SOS ni ${name}${loc ? `, lokasyon: ${loc}` : ""}`,
    resolvedTitle: "Natapos ang SOS",
    resolvedBody: (handler, name) => `Tinapos ni ${handler} ang SOS ni ${name}`
  },
  th: {
    title: "SOS ฉุกเฉิน",
    body: (name, msg, loc) => `${name}: ${msg}${loc ? ` (${loc})` : ""}`,
    cancelledTitle: "ยกเลิก SOS แล้ว",
    cancelledBody: (name) => `${name} ยกเลิก SOS แล้ว (อาจกดผิด)`,
    handlingTitle: "กำลังจัดการ SOS",
    handlingBody: (handler, name) => `ผู้ดูแล ${handler} กำลังจัดการ SOS ของ ${name}`,
    remindTitle: "ครอบครัวเตือน: จัดการ SOS",
    remindBody: (name, loc) => `ครอบครัวเตือนให้จัดการ SOS ของ ${name}${loc ? ` ตำแหน่ง: ${loc}` : ""}`,
    resolvedTitle: "จบ SOS แล้ว",
    resolvedBody: (handler, name) => `${handler} จบ SOS ของ ${name} แล้ว`
  }
}

const TRANSLATE_LANG_MAP = { zh: "zh-TW", en: "en", id: "id", vi: "vi", tl: "tl", th: "th" }
const TRANSLATE_LANG_NAMES = {
  zh: "繁體中文", en: "English", id: "Bahasa Indonesia",
  vi: "Tiếng Việt", tl: "Filipino", th: "ภาษาไทย"
}

function looksLikeWrongScript(text, targetLang) {
  const s = String(text || "")
  if (!s) return false
  const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).join("").length
  const ratio = cjk / Math.max(s.replace(/\s/g, "").length, 1)
  // 目標非中文卻大半是漢字 → 視為翻錯
  if (targetLang !== "zh" && ratio >= 0.4) return true
  return false
}

/** 照護常用詞：寫進 prompt，避免「血壓／用藥」被亂翻 */
const CARE_GLOSSARY = [
  { zh: "血壓", en: "blood pressure", id: "tekanan darah", vi: "huyết áp", tl: "presyon ng dugo", th: "ความดันโลหิต" },
  { zh: "收縮壓", en: "systolic pressure", id: "tekanan sistolik", vi: "huyết áp tâm thu", tl: "systolic", th: "ความดันซีสโตลิก" },
  { zh: "舒張壓", en: "diastolic pressure", id: "tekanan diastolik", vi: "huyết áp tâm trương", tl: "diastolic", th: "ความดันไดแอสโตลิก" },
  { zh: "血糖", en: "blood sugar", id: "gula darah", vi: "đường huyết", tl: "asukal sa dugo", th: "น้ำตาลในเลือด" },
  { zh: "體溫", en: "body temperature", id: "suhu tubuh", vi: "thân nhiệt", tl: "temperatura ng katawan", th: "อุณหภูมิร่างกาย" },
  { zh: "脈搏", en: "pulse", id: "denyut nadi", vi: "mạch", tl: "pulse", th: "ชีพจร" },
  { zh: "吃藥", en: "take medicine", id: "minum obat", vi: "uống thuốc", tl: "uminom ng gamot", th: "กินยา" },
  { zh: "用藥", en: "medication", id: "pengobatan", vi: "dùng thuốc", tl: "gamot", th: "การใช้ยา" },
  { zh: "跌倒", en: "fall", id: "jatuh", vi: "ngã", tl: "hulog", th: "หกล้ม" },
  { zh: "頭暈", en: "dizzy", id: "pusing", vi: "chóng mặt", tl: "nahihilo", th: "เวียนหัว" },
  { zh: "看護", en: "caregiver", id: "pengasuh", vi: "người chăm sóc", tl: "tagapag-alaga", th: "ผู้ดูแล" },
  { zh: "家屬", en: "family member", id: "keluarga", vi: "gia đình", tl: "kapamilya", th: "ครอบครัว" },
  { zh: "長輩", en: "elder", id: "lansia", vi: "người cao tuổi", tl: "nakatatanda", th: "ผู้สูงอายุ" }
]

const translateCache = new Map()

function glossaryLines(targetLang) {
  const lang = TRANSLATE_LANG_MAP[targetLang] ? targetLang : "zh"
  return CARE_GLOSSARY.map((row) => `${row.zh} → ${row[lang] || row.en}`).join("\n")
}

function cacheKeyFor(text, targetLang) {
  return `${targetLang}::${String(text || "").trim()}`
}

async function translateToLang(sourceText, targetLang = "zh", { messageKey = "" } = {}) {
  const text = String(sourceText || "").trim()
  if (!text && !messageKey) return text
  const code = TRANSLATE_LANG_MAP[targetLang] ? targetLang : "zh"

  const dictHit = resolveSosDisplayMessage({ message: text, messageKey }, code)
  if (dictHit) return dictHit
  const chatHit = resolveChatPresetMessage(text, messageKey, code)
  if (chatHit) return chatHit

  if (!text) return text
  const cached = translateCache.get(cacheKeyFor(text, code))
  if (cached) return cached

  const to = TRANSLATE_LANG_MAP[code]
  const targetName = TRANSLATE_LANG_NAMES[code] || TRANSLATE_LANG_NAMES.zh
  const glossary = glossaryLines(code)

  // 照護口語：Gemini＋詞彙表為主；非官方 Google 套件只當備援
  try {
    const prompt =
      `You are a professional translator for home elder-care (family, caregiver, care recipient).\n` +
      `Translate into ${targetName} only. No quotes, no romanization, no explanation.\n` +
      `Keep numbers, clock times, mmHg/mg/ml, and Latin medicine names unchanged.\n` +
      `Use natural spoken ${targetName} used in caregiving, not word-for-word calque.\n` +
      `If the source already is ${targetName}, return it unchanged.\n` +
      `Must-use glossary when the source contains these ideas:\n${glossary}\n\n` +
      `Source:\n${text}`
    const geminiResult = await geminiModel.generateContent(prompt)
    const resultText = String(geminiResult.response.text() || "").trim()
    if (resultText && !looksLikeWrongScript(resultText, code)) {
      translateCache.set(cacheKeyFor(text, code), resultText)
      return resultText
    }
    console.log(`[translateToLang] gemini rejected (wrong script) target=${code}`)
  } catch (e) {
    console.log(`[translateToLang] gemini fail: ${e.message?.slice(0, 60)}`)
  }

  try {
    const result = await translate(text, { to, forceBatch: false })
    const out = String(result.text || "").trim()
    if (out && !looksLikeWrongScript(out, code)) {
      translateCache.set(cacheKeyFor(text, code), out)
      return out
    }
  } catch (e) {
    console.log(`[translateToLang] lib fail: ${e.message?.slice(0, 60)}`)
  }
  return text
}

const CHAT_PUSH_COPY = {
  zh: { title: "新訊息", body: (name, msg) => `${name}：${msg}` },
  en: { title: "New message", body: (name, msg) => `${name}: ${msg}` },
  id: { title: "Pesan baru", body: (name, msg) => `${name}: ${msg}` },
  vi: { title: "Tin nhắn mới", body: (name, msg) => `${name}: ${msg}` },
  tl: { title: "Bagong mensahe", body: (name, msg) => `${name}: ${msg}` },
  th: { title: "ข้อความใหม่", body: (name, msg) => `${name}: ${msg}` }
}

const CHAT_VOICE_PUSH = {
  zh: "語音訊息",
  en: "Voice message",
  id: "Pesan suara",
  vi: "Tin nhắn thoại",
  tl: "Mensahe ng boses",
  th: "ข้อความเสียง"
}

async function notifyChatPush({ from, toEmail, preview, targetLang }) {
  try {
    const targetUser = await User.findOne({
      email: new RegExp(`^${String(toEmail).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
    })
    const tokens = [...new Set(
      (Array.isArray(targetUser?.pushTokens) ? targetUser.pushTokens : [])
        .map((entry) => entry?.token)
        .filter(Boolean)
    )]
    if (!tokens.length) {
      console.log(`Chat push skipped: no tokens for ${toEmail}`)
      return
    }
    const to = String(toEmail || "").trim().toLowerCase()
    const fromNorm = String(from || "").trim().toLowerCase()
    if (to && fromNorm && chatFocusByEmail.get(to) === fromNorm) {
      console.log(`Chat push skipped: ${to} viewing thread with ${fromNorm}`)
      return
    }
    const sender = await User.findOne({
      email: new RegExp(`^${String(from).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
    })
    const lang = TRANSLATE_LANG_MAP[targetLang] ? targetLang : (targetUser?.lang || "zh")
    const copy = CHAT_PUSH_COPY[lang] || CHAT_PUSH_COPY.zh
    const senderName = String(sender?.name || "").trim() || from
    const previewText = String(preview || "").trim() || (CHAT_VOICE_PUSH[lang] || CHAT_VOICE_PUSH.zh)
    await sendCarePush(tokens, {
      title: copy.title,
      body: copy.body(senderName, previewText.slice(0, 80)),
      data: {
        type: "chat",
        senderEmail: from,
        targetEmail: toEmail
      },
      channelId: CHAT_NOTIFICATION_CHANNEL_ID,
      ttlMs: 24 * 60 * 60 * 1000
    })
  } catch (err) {
    console.log("chat push failed:", err.message)
  }
}

function sosAudienceRoles(audience) {
  return audience === "caregiver_only" ? ["caregiver"] : ["family", "caregiver"]
}

async function sendCarePush(tokens, { title, body, data = {}, channelId = SOS_NOTIFICATION_CHANNEL_ID, ttlMs }) {
  if (!getApps().length || !tokens.length) return
  const stringData = Object.fromEntries(
    Object.entries(data || {}).map(([key, value]) => [key, String(value ?? "")])
  )
  const ttl = Number.isFinite(ttlMs) ? ttlMs : 60 * 1000
  const isChat = channelId === CHAT_NOTIFICATION_CHANNEL_ID
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: stringData,
    android: {
      priority: "high",
      ttl,
      notification: {
        channelId,
        sound: "default",
        priority: isChat ? "default" : "max",
        visibility: "public",
        defaultVibrateTimings: !isChat
      }
    }
  })

  console.log(
    `Care push result: success=${response.successCount} failure=${response.failureCount} channel=${channelId}`
  )
  response.responses.forEach((result, index) => {
    if (!result.success) {
      console.log(`Care push fail[${index}]:`, result.error?.code, result.error?.message)
    }
  })

  const invalidTokens = response.responses
    .map((result, index) => ({ result, token: tokens[index] }))
    .filter(({ result }) => {
      const code = result.error?.code
      return code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
    })
    .map(entry => entry.token)

  if (invalidTokens.length) {
    await User.updateMany(
      { "pushTokens.token": { $in: invalidTokens } },
      { $pull: { pushTokens: { token: { $in: invalidTokens } } } }
    )
  }
}

/** SOS 推播：依每位收訊者的 User.lang 組標題／內文（含訊息機翻） */
async function notifyCareCircleSos(record, { cancelled = false, handling = false, remind = false, resolved = false } = {}) {
  if (!getApps().length || !record) return

  const patientEmail = String(record.patientEmail || "").trim().toLowerCase()
  if (!patientEmail) {
    console.log("SOS push skipped: missing patientEmail")
    return
  }
  const roles = remind ? ["caregiver"] : ["family", "caregiver"]
  const users = await getCareCircleUsers(patientEmail, { roles })
  if (!users.length) {
    console.log(`SOS push skipped: no linked care circle users for ${patientEmail}`)
    return
  }

  const location = String(record.locationLabel || "").trim()
  const patientName = record.patientName || "Patient"
  const handlerName = record.handlerName || "Caregiver"
  const originalMessage = String(record.message || "").trim() || "SOS"
  const sourceLang = String(record.sourceLang || "zh").trim() || "zh"

  // 依收訊方語言分組
  const byLang = new Map()
  for (const user of users) {
    const lang = TRANSLATE_LANG_MAP[user.lang] ? user.lang : "zh"
    const tokens = (Array.isArray(user.pushTokens) ? user.pushTokens : [])
      .map(e => e?.token)
      .filter(Boolean)
    if (!tokens.length) continue
    if (!byLang.has(lang)) byLang.set(lang, [])
    byLang.get(lang).push(...tokens)
  }

  if (!byLang.size) {
    console.log(`SOS push skipped: users have no tokens for ${patientEmail}`)
    return
  }

  console.log(`SOS push lang groups for ${patientEmail}:`, [...byLang.keys()].map(k => `${k}:${byLang.get(k).length}`).join(", "))

  for (const [lang, rawTokens] of byLang.entries()) {
    const tokens = [...new Set(rawTokens)]
    const copy = SOS_PUSH_COPY[lang] || SOS_PUSH_COPY.zh
    let title = copy.title
    let body
    let type = "sos"

    let displayMsg = originalMessage
    if (resolved) {
      title = copy.resolvedTitle || copy.cancelledTitle
      body = (copy.resolvedBody || ((h, n) => `${h} ended ${n}'s SOS`))(handlerName, patientName)
      type = "sos_resolved"
    } else if (!cancelled && !handling && !remind) {
      if (sourceLang !== lang) {
        displayMsg = await translateToLang(originalMessage, lang, {
          messageKey: record.messageKey || ""
        })
        console.log(`[SOS translate] ${sourceLang}->${lang}: "${originalMessage.slice(0, 24)}" => "${String(displayMsg).slice(0, 40)}"`)
      } else {
        const keyed = resolveSosDisplayMessage(record, lang)
        if (keyed) displayMsg = keyed
      }
      body = copy.body(patientName, displayMsg, location)
    } else if (cancelled) {
      title = copy.cancelledTitle
      body = copy.cancelledBody(patientName)
      type = "sos_cancelled"
    } else if (handling) {
      title = copy.handlingTitle
      body = copy.handlingBody(handlerName, patientName)
      type = "sos_handling"
    } else if (remind) {
      title = copy.remindTitle
      body = copy.remindBody(patientName, location)
      type = "sos_remind"
    }

    await sendCarePush(tokens, {
      title,
      body,
      data: {
        type,
        eventId: String(record.eventId || ""),
        recordId: String(record._id || ""),
        patientName: String(record.patientName || ""),
        patientPhone: String(record.patientPhone || ""),
        locationLabel: String(record.locationLabel || ""),
        status: String(record.status || ""),
        handlerName: String(record.handlerName || ""),
        message: String(originalMessage),
        displayMessage: String(displayMsg || originalMessage),
        messageKey: String(record.messageKey || ""),
        sourceLang,
        targetLang: lang,
        audience: "circle",
        triggeredAt: record.triggeredAt ? new Date(record.triggeredAt).toISOString() : ""
      },
      channelId: SOS_NOTIFICATION_CHANNEL_ID
    })
  }
}

function coordFallbackLabel(lat, lng, locationLabel) {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  }
  const raw = String(locationLabel || "").trim()
  return raw || "尚無詳細地址"
}

function scheduleSosAddressFill(recordId, lat, lng) {
  if (!recordId || !Number.isFinite(lat) || !Number.isFinite(lng)) return
  reverseGeocode(lat, lng)
    .then(async (address) => {
      if (!address) return
      await SosEvent.updateOne({ _id: recordId }, { $set: { locationLabel: address } })
    })
    .catch((err) => console.log("reverse geocode later fail:", err.message))
}

function publicHealthCard(user) {
  const card = user?.healthCard || {}
  return {
    bloodType: String(card.bloodType || ""),
    allergies: String(card.allergies || ""),
    medications: String(card.medications || ""),
    conditions: String(card.conditions || ""),
    notes: String(card.notes || ""),
    preferredLanguage: String(card.preferredLanguage || ""),
    allergyKeys: Array.isArray(card.allergyKeys) ? card.allergyKeys : [],
    allergyOther: String(card.allergyOther || ""),
    conditionKeys: Array.isArray(card.conditionKeys) ? card.conditionKeys : [],
    conditionOther: String(card.conditionOther || ""),
    medicationKeys: Array.isArray(card.medicationKeys) ? card.medicationKeys : [],
    deviceKeys: Array.isArray(card.deviceKeys) ? card.deviceKeys : [],
    directiveKeys: Array.isArray(card.directiveKeys) ? card.directiveKeys : [],
    patientName: user?.name || "",
    patientEmail: user?.email || ""
  }
}

async function isCareCircleMemberForPatient(memberUser, patientEmail) {
  const memberEmail = String(memberUser?.email || "").trim().toLowerCase()
  const patient = String(patientEmail || "").trim().toLowerCase()
  if (!memberEmail || !patient) return false
  const row = await CareCircleMember.findOne({ patientEmail: patient, memberEmail }).lean()
  if (row) return true
  const legacy = String(memberUser.linkedPatientEmail || memberUser.activePatientEmail || "")
    .trim()
    .toLowerCase()
  return legacy === patient
}

const ABNORMAL_ALERT_TYPE_LABELS = {
  fall: "跌倒", "sos-gesture": "SOS 手勢", "off-bed": "離床", sedentary: "久坐未動",
  squat: "蹲下", "bend-over": "彎腰", "sit-down": "坐下", abnormal: "異常行為"
}

/** 高風險警報推播：綁定該長輩的 family + caregiver（照護圈），只推 severity=High；找不到綁定就 skip */
async function notifyCareCircleAlert(record) {
  if (!getApps().length || !record) return
  if (record.severity !== "High" && record.severity !== "Critical") return
  const patient = await User.findById(record.patientUserId)
  if (!patient) return
  const patientEmail = String(patient.email || "").trim().toLowerCase()
  const tokens = await getCareCircleTokens(patientEmail)
  if (!tokens.length) {
    console.log(`Alert push skipped: no linked care circle tokens for ${patientEmail}`)
    return
  }

  const location = String(record.location || "").trim()
  const patientName = patient.name || "受顧者"
  const typeLabel = ABNORMAL_ALERT_TYPE_LABELS[record.type] || record.type || "異常事件"
  await sendCarePush(tokens, {
    title: record.severity === "Critical" ? "極高風險警報" : "高風險警報",
    body: `${patientName} 偵測到${typeLabel}${location ? `，位置：${location}` : ""}`,
    data: {
      type: "alert",
      eventId: String(record.eventId || ""),
      recordId: String(record._id || ""),
      severity: String(record.severity || ""),
      alertType: String(record.type || ""),
      patientName: String(patientName || ""),
      location: String(record.location || ""),
      happenedAt: record.happenedAt ? new Date(record.happenedAt).toISOString() : ""
    },
    channelId: ALERT_NOTIFICATION_CHANNEL_ID
  })
}

function normalizeSeverity(value) {
  const raw = String(value || "").trim()
  if (raw === "High" || raw === "Medium" || raw === "Low" || raw === "Critical") return raw
  if (raw === "極高" || raw === "critical" || raw === "urgent-critical") return "Critical"
  if (raw === "緊急" || raw === "urgent" || raw === "high") return "High"
  if (raw === "注意" || raw === "watch" || raw === "medium") return "Medium"
  if (raw === "輕微" || raw === "mild" || raw === "low") return "Low"
  return "Medium"
}

function normalizeAlertStatus(value) {
  if (value === "Pending" || value === "Processing" || value === "Done") return value
  return "Pending"
}

function normalizeBpMood(value) {
  const mood = typeof value === "string" ? value.trim() : ""
  if (mood === "疲倦") return "開心"
  return ["平靜", "開心", "焦慮", "頭暈", "未標記"].includes(mood) ? mood : "未標記"
}

function judgeBloodPressureLevel(sys, dia) {
  if (sys >= 180 || dia >= 120) return "超高血壓"
  if (sys >= 140 || dia >= 90) return "高血壓"
  if (sys < 90 || dia < 60) return "低血壓"
  if (sys >= 120 || dia >= 80) return "血壓前期"
  return "正常"
}

function normalizeBpMeasuredAt(value) {
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function getStableBpSyncKey(sys, dia, measuredAt) {
  const date = normalizeBpMeasuredAt(measuredAt)
  return `bp:${date.getTime()}:${Math.round(sys)}:${Math.round(dia)}`
}

function normalizeBpImportRecord(rawRecord) {
  const sys = Number(rawRecord?.sys)
  const dia = Number(rawRecord?.dia)
  const pulseRaw = rawRecord?.pulse
  const pulse = pulseRaw === "" || pulseRaw === null || pulseRaw === undefined ? undefined : Number(pulseRaw)
  const measuredAt = normalizeBpMeasuredAt(rawRecord?.measuredAt)
  if (!Number.isFinite(sys) || !Number.isFinite(dia)) return null
  if (sys < 50 || sys > 260 || dia < 30 || dia > 180) return null
  if (pulseRaw !== "" && pulseRaw !== null && pulseRaw !== undefined && !Number.isFinite(pulse)) return null
  if (pulse !== undefined && (pulse < 30 || pulse > 220)) return null
  return {
    sys: Math.round(sys), dia: Math.round(dia),
    pulse: pulse === undefined ? undefined : Math.round(pulse),
    mood: normalizeBpMood(rawRecord?.mood), measuredAt,
    level: judgeBloodPressureLevel(sys, dia), source: "health-connect",
    syncKey: typeof rawRecord?.syncKey === "string" && rawRecord.syncKey.trim()
      ? rawRecord.syncKey.trim() : getStableBpSyncKey(sys, dia, measuredAt)
  }
}

async function importBloodPressureRecordsForUser(userId, rawRecords) {
  const normalizedRecords = (Array.isArray(rawRecords) ? rawRecords : []).map(normalizeBpImportRecord).filter(Boolean)
  let importedCount = 0, pulseBackfillCount = 0
  const importedRecords = []
  for (const recordInput of normalizedRecords) {
    const existing = await BloodPressureRecord.findOne({ userId, $or: [{ syncKey: recordInput.syncKey }, { sys: recordInput.sys, dia: recordInput.dia, measuredAt: recordInput.measuredAt }] })
    if (existing) {
      if (!existing.pulse && recordInput.pulse) { existing.pulse = recordInput.pulse; await existing.save(); pulseBackfillCount++; importedRecords.push(existing) }
      continue
    }
    importedRecords.push(await BloodPressureRecord.create({ userId, ...recordInput }))
    importedCount++
  }
  return { importedCount, pulseBackfillCount, skippedCount: normalizedRecords.length - importedCount - pulseBackfillCount, records: importedRecords }
}

function normalizeVisionAction(value) {
  const text = String(value || "").trim().toUpperCase()
  if (!text) return "SEDENTARY"
  if (text.includes("FALL")) return "DANGER: FALL"
  if (text.includes("SOS") || text.includes("WAV")) return "CRITICAL SOS: WAVING"
  if (text.includes("OFF_BED") || text.includes("BED EXIT") || text.includes("BED_EXIT")) return "OFF_BED"
  // G1：蹲下／彎腰／坐下等非確認跌倒動作 → 一律 Low，只記 Event、不建 Alert（教授要求每次都記，不可合併）
  if (text.includes("SQUAT") || text.includes("CROUCH") || text.includes("蹲")) return "SQUAT"
  if (text.includes("BEND") || text.includes("STOOP") || text.includes("彎腰")) return "BEND_OVER"
  if (text.includes("SIT") || text.includes("坐下")) return "SIT_DOWN"
  if (text.includes("SEDENTARY")) return "SEDENTARY"
  return text
}

function getVisionSeverityByAction(action) {
  if (action === "DANGER: FALL" || action === "CRITICAL SOS: WAVING") return "High"
  if (action === "OFF_BED") return "Medium"
  // SQUAT / BEND_OVER / SIT_DOWN / SEDENTARY / 其他非確認跌倒動作：一律 Low，只記錄不推播
  return "Low"
}

function toConfidence(value, fallback = 0.9) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed > 1) return Math.min(parsed / 100, 1)
  return Math.max(parsed, 0)
}

function toVisionAlertType(action) {
  if (action === "DANGER: FALL") return "fall"
  if (action === "CRITICAL SOS: WAVING") return "sos-gesture"
  if (action === "OFF_BED") return "off-bed"
  if (action === "SQUAT") return "squat"
  if (action === "BEND_OVER") return "bend-over"
  if (action === "SIT_DOWN") return "sit-down"
  if (action === "SEDENTARY") return "sedentary"
  return "abnormal"
}

/** 跳播測試點：寫入僅紀錄的蹲下／彎腰，時間對齊本機 ring，不推播。 */
async function seedSeekTestRecords(user, rawPoints) {
  const patientUserId = await resolveTargetPatient(user._id)
  await VisionDetectionRecord.deleteMany({ patientUserId, source: "seek-test" })
  const now = Date.now()
  const defaults = [
    { at: now - 15 * 60 * 1000, action: "SQUAT" },
    { at: now - 8 * 60 * 1000, action: "BEND_OVER" },
    { at: now - 3 * 60 * 1000, action: "SQUAT" }
  ]
  const list = Array.isArray(rawPoints) && rawPoints.length ? rawPoints : defaults
  const records = []
  for (const item of list) {
    const at = new Date(item.at || item.detectedAt || Date.now())
    if (Number.isNaN(at.getTime())) continue
    const action = normalizeVisionAction(item.action || "SQUAT")
    if (action === "DANGER: FALL" || action === "CRITICAL SOS: WAVING") continue
    const record = await VisionDetectionRecord.create({
      patientUserId,
      reporterUserId: user._id,
      reporterRole: "system",
      action,
      severity: "Low",
      confidence: 0.9,
      location: "客廳",
      description: "跳播測試點",
      detectedAt: at,
      source: "seek-test",
      alertBuilt: false,
      frameTag: `seek-test-${at.getTime()}`
    })
    records.push(record)
  }
  return records
}

async function handleSeekTestPost(req, res) {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const records = await seedSeekTestRecords(user, req.body?.points)
    res.status(201).json({ message: "OK", records })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
}

async function getNextVisionSample(user) {
  const total = MOCK_VISION_SAMPLES.length
  const cursor = Number.isInteger(user.visionSampleCursor) ? user.visionSampleCursor : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_VISION_SAMPLES[sampleIndex]
  user.visionSampleCursor = (sampleIndex + 1) % total
  await user.save()
  return { sample, sampleIndex, nextCursor: user.visionSampleCursor }
}

function buildConfirmedFallDetection(body = {}) {
  const prob = toConfidence(body.confidence ?? body.prob, 0.9)
  const trigger = typeof body.trigger === "string" ? body.trigger.trim() : ""
  const customDescription = typeof body.description === "string" ? body.description.trim() : ""
  return {
    action: "DANGER: FALL",
    severity: "High",
    confidence: Math.max(prob, 0.9),
    location: typeof body.location === "string" && body.location.trim() ? body.location.trim() : "客廳",
    description: customDescription || `App 健康輪詢確認跌倒${trigger ? `（觸發 ${trigger}）` : ""}`,
    frameTag: typeof body.frameTag === "string" && body.frameTag.trim() ? body.frameTag.trim() : "health-confirmed",
    modelName: "Fall-Detection-v8"
  }
}

async function requestVisionModelResult(payload = {}) {
  const endpoint = process.env.VISION_MODEL_ENDPOINT
  if (!endpoint || typeof fetch !== "function") return null
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    if (!response.ok) return null
    const data = await response.json()
    const action = normalizeVisionAction(data.action || data.eventType || data.event_type)
    return {
      action, severity: normalizeSeverity(data.severity || getVisionSeverityByAction(action)),
      confidence: toConfidence(data.confidence, 0.92),
      location: typeof data.location === "string" ? data.location.trim() : "",
      description: typeof data.description === "string" ? data.description.trim() : "",
      frameTag: typeof data.frameTag === "string" ? data.frameTag.trim() : "",
      modelName: typeof data.modelName === "string" && data.modelName.trim() ? data.modelName.trim() : "CareAI-MediaPipe"
    }
  } catch { return null }
}

// G1：高＝「確認跌倒後持續未起 ≥5 秒」。跌倒事件先只記 Event，5 秒後仍未收到站起訊號才建立 Alert + 推播；
// 5 秒內收到站起（/vision/report/standup，同一組 eventKey）就取消，不建 Alert、不推播。
// G2：極高重推（2 / 5 / 15 / 35 分，自確認跌倒 happenedAt 起算）。程序重啟會丟掉尚未觸發的計時器。
const FALL_ALERT_CONFIRM_DELAY_MS = 5000
const pendingFallAlerts = new Map() // key: `${patientUserId}:${eventKey}` → { timer }
const CRITICAL_ESCALATION_OFFSETS_MS = [
  2 * 60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  35 * 60 * 1000
]
const criticalEscalations = new Map() // alertId → { timers: Timeout[] }

function pendingFallAlertKey(patientUserId, eventKey) {
  return `${patientUserId}:${eventKey}`
}

function clearCriticalEscalation(alertId) {
  const id = String(alertId || "")
  const entry = criticalEscalations.get(id)
  if (!entry) return
  for (const timer of entry.timers || []) clearTimeout(timer)
  criticalEscalations.delete(id)
}

async function escalateToCritical(alertId, wave, { notify = true } = {}) {
  const record = await AbnormalEvent.findById(alertId)
  if (!record || record.status === "Done") {
    clearCriticalEscalation(alertId)
    return
  }
  const log = Array.isArray(record.escalationLog) ? record.escalationLog : []
  if (!log.some((row) => Number(row.wave) === Number(wave))) {
    const offset = CRITICAL_ESCALATION_OFFSETS_MS[wave - 1] || 0
    log.push({
      wave,
      at: new Date(),
      elapsedSec: Math.round(offset / 1000)
    })
    record.escalationLog = log
  }
  record.severity = "Critical"
  record.escalationWave = Math.max(Number(record.escalationWave) || 0, Number(wave) || 0)
  await record.save()
  if (notify) {
    notifyCareCircleAlert(record).catch(error => console.log("Critical push failed:", error.message))
  }
}

function scheduleCriticalEscalation(record) {
  if (!record || (record.severity !== "High" && record.severity !== "Critical")) return
  const id = String(record._id)
  clearCriticalEscalation(id)
  const happened = new Date(record.happenedAt || Date.now()).getTime()
  const now = Date.now()
  const timers = []
  const dueWaves = []
  CRITICAL_ESCALATION_OFFSETS_MS.forEach((offset, idx) => {
    const wave = idx + 1
    const delay = happened + offset - now
    if (delay <= 0) {
      dueWaves.push(wave)
      return
    }
    timers.push(setTimeout(() => {
      escalateToCritical(id, wave).catch(error => console.log("Critical escalate failed:", error.message))
    }, delay))
  })
  if (timers.length) criticalEscalations.set(id, { timers })
  if (dueWaves.length) {
    const already = Number(record.escalationWave) || 0
    const missed = dueWaves.filter((wave) => wave > already)
    if (missed.length) {
      ;(async () => {
        for (let i = 0; i < missed.length; i += 1) {
          await escalateToCritical(id, missed[i], { notify: i === missed.length - 1 })
        }
      })().catch(error => console.log("Critical catch-up failed:", error.message))
    }
  }
}

/** 站起取消：找到對應計時器就清掉，回傳是否真的取消到；找不到（已建立或已逾時）就靜默回 false。 */
function cancelPendingFallAlert(patientUserId, eventKey) {
  const key = pendingFallAlertKey(patientUserId, eventKey)
  const entry = pendingFallAlerts.get(key)
  if (!entry) return false
  clearTimeout(entry.timer)
  pendingFallAlerts.delete(key)
  return true
}

async function buildAndNotifyVisionAlert({ patientUserId, reporterUserId, reporterRole, detectionRecord }) {
  const sourceEventKey = typeof detectionRecord.frameTag === "string" ? detectionRecord.frameTag.trim() : ""
  const seededEvidence = Array.isArray(detectionRecord.evidence) ? detectionRecord.evidence : []
  const record = await AbnormalEvent.create({
    eventId: createAbnormalEventId(), patientUserId, reporterUserId, reporterRole,
    type: toVisionAlertType(detectionRecord.action), severity: detectionRecord.severity,
    status: "Pending", location: detectionRecord.location || "",
    description: detectionRecord.description || (detectionRecord.action + " requires attention"),
    happenedAt: detectionRecord.detectedAt || new Date(), source: detectionRecord.source || "vision-model",
    sourceEventKey: sourceEventKey || undefined,
    evidence: seededEvidence,
    escalationWave: 0,
    escalationLog: detectionRecord.severity === "High" ? [{
      wave: 0,
      at: detectionRecord.detectedAt || new Date(),
      elapsedSec: 5
    }] : []
  })
  notifyCareCircleAlert(record).catch(error => console.log("Alert push failed:", error.message))
  scheduleCriticalEscalation(record)
  if (detectionRecord._id) {
    VisionDetectionRecord.findByIdAndUpdate(detectionRecord._id, { alertBuilt: true }).catch(() => {})
  }
  return record
}

async function createVisionAlertIfNeeded({ patientUserId, reporterUserId, reporterRole, detectionRecord }) {
  if (!detectionRecord || detectionRecord.severity !== "High") return null

  const eventKey = typeof detectionRecord.frameTag === "string" ? detectionRecord.frameTag.trim() : ""
  if (detectionRecord.action === "DANGER: FALL" && eventKey) {
    const key = pendingFallAlertKey(patientUserId, eventKey)
    if (pendingFallAlerts.has(key)) return null // 已排程中，不要重複排
    const timer = setTimeout(() => {
      pendingFallAlerts.delete(key)
      VisionDetectionRecord.findOne({ patientUserId, frameTag: eventKey })
        .then((fresh) => buildAndNotifyVisionAlert({
          patientUserId,
          reporterUserId,
          reporterRole,
          detectionRecord: fresh || detectionRecord
        }))
        .catch(error => console.log("Deferred fall alert failed:", error.message))
    }, FALL_ALERT_CONFIRM_DELAY_MS)
    pendingFallAlerts.set(key, { timer })
    return null // 尚未建立；呼叫端不用等 5 秒，5 秒後才會知道有沒有真的建立
  }

  // 其他 High（例如 SOS 手勢）沒有「未起才報」的概念，維持立即建立
  return buildAndNotifyVisionAlert({ patientUserId, reporterUserId, reporterRole, detectionRecord })
}

/** Wave D 防重複寫入：vision-runtime 主動推播與 App 輪詢備援共用同一組 eventKey（存成 frameTag），
 *  兩邊誰先到就誰建立，晚到的一律回傳既有紀錄，不再重複建立 VisionDetectionRecord/AbnormalEvent。 */
async function findExistingVisionRecordByFrameTag(patientUserId, frameTag) {
  const tag = typeof frameTag === "string" ? frameTag.trim() : ""
  if (!tag) return null
  return VisionDetectionRecord.findOne({ patientUserId, frameTag: tag })
}

// ================= 手機端註冊／登入／驗證 =================
const { mountMobileAuth } = require("./lib/mobileAuth")
const mobileAuthApi = mountMobileAuth(app, {
  User,
  CareCircleMember,
  normalizeRoleForMobile,
  normalizeLinkedPatientEmail,
  validateLinkedPatientEmailForRole,
  verifyToken
})

// ================= set-role =================
app.post("/set-role", async (req, res) => {
  try {
    const { email, role } = req.body
    const user = await User.findOne({ email })
    if (!user) return res.status(404).json({ message: "找不到使用者" })
    const normalizedRole = normalizeRoleForMobile(role)
    const linkedResult = await validateLinkedPatientEmailForRole(normalizedRole, normalizeLinkedPatientEmail(req.body?.linkedPatientEmail), user.email)
    if (linkedResult?.error) return res.status(400).json({ message: linkedResult.error })
    user.role = normalizedRole
    user.linkedPatientEmail = linkedResult
    user.profileCompleted = false
    await user.save()
    const newToken = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" })
    res.json({ token: newToken, role: user.role, linkedPatientEmail: user.linkedPatientEmail || "" })
  } catch (err) {
    res.status(500).json({ message: "設定角色失敗" })
  }
})

app.post("/mobile/dev-login", async (req, res) => {
  try {
    const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim() : ""
    const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : ""
    const rawRole = typeof req.body?.role === "string" ? req.body.role.trim() : ""
    const rawLinkedPatientEmail = normalizeLinkedPatientEmail(req.body?.linkedPatientEmail)
    const password = typeof req.body?.password === "string" ? req.body.password : ""
    if (!rawEmail) return res.status(400).json({ message: "email is required" })
    const email = rawEmail.toLowerCase()
    let user = await User.findOne({ email })

    // 既有帳：預設只發 token，勿因未帶 role 被洗成 patient／清空照護圈
    if (user) {
      if (password && user.passwordHash) {
        const bcrypt = require("bcryptjs")
        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) return res.status(401).json({ message: "密碼錯誤" })
      }
      const wantsRoleUpdate = Boolean(rawRole)
      if (wantsRoleUpdate) {
        const role = normalizeRoleForMobile(rawRole)
        const linkedResult = await validateLinkedPatientEmailForRole(role, rawLinkedPatientEmail, email)
        if (linkedResult?.error) return res.status(400).json({ message: linkedResult.error })
        user.role = role
        user.linkedPatientEmail = linkedResult
        user.profileCompleted = true
      }
      if (rawName) user.name = rawName
      if (!user.name) user.name = email.split("@")[0]
      await user.save()
      const token = jwt.sign({ email: user.email, role: user.role || null }, process.env.JWT_SECRET, { expiresIn: "7d" })
      return res.json({
        token,
        role: user.role || null,
        user: {
          email: user.email,
          name: user.name || "",
          role: user.role || null,
          linkedPatientEmail: user.linkedPatientEmail || ""
        }
      })
    }

    // 新帳才可用 body 建角色（未帶 role 才預設 patient）
    const role = rawRole ? normalizeRoleForMobile(rawRole) : "patient"
    const linkedResult = await validateLinkedPatientEmailForRole(role, rawLinkedPatientEmail, email)
    if (linkedResult?.error) return res.status(400).json({ message: linkedResult.error })
    user = await User.create({
      email,
      name: rawName || email.split("@")[0],
      role,
      linkedPatientEmail: linkedResult,
      profileCompleted: true
    })
    const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" })
    return res.json({
      token,
      role: user.role,
      user: {
        email: user.email,
        name: user.name || "",
        role: user.role,
        linkedPatientEmail: user.linkedPatientEmail || ""
      }
    })
  } catch (err) {
    return res.status(500).json({ message: "mobile dev login failed" })
  }
})

app.post("/notifications/register", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  if (user.role !== "family" && user.role !== "caregiver" && user.role !== "patient") {
    return res.status(403).json({ message: "Invalid role for push notifications" })
  }

  const pushToken = typeof req.body?.token === "string" ? req.body.token.trim() : ""
  if (!pushToken) return res.status(400).json({ message: "Push token is required" })
  const platform = typeof req.body?.platform === "string" ? req.body.platform.trim() : ""

  // 同一 FCM token 可掛在多個帳（同機切帳常見）；發送端 getCareCircleTokens 會 Set 去重，不會重複推同一台
  user.pushTokens = (user.pushTokens || []).filter(entry => entry?.token !== pushToken)
  user.pushTokens.push({ token: pushToken, platform, updatedAt: new Date() })
  await user.save()
  console.log(`Push token registered for ${user.email} (${user.role}), count=${user.pushTokens.length}`)
  res.json({ message: "Push token registered" })
})

// ================= PATIENT =================
app.get("/patient/check-profile", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  res.json({ profileCompleted: user.profileCompleted })
})

app.get("/patient/profile", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  res.json({
    name: user.name,
    birthDate: user.birthDate,
    age: user.age,
    idNumber: user.idNumber,
    gender: user.gender,
    phone: user.phone,
    sosAudience: user.sosAudience === "caregiver_only" ? "caregiver_only" : "circle"
  })
})

app.post("/patient/setup", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const { name, birthDate, age, idNumber, gender, phone } = req.body
  const user = await User.findOne({ email: decoded.email })
  const normalizedName = String(name || "").trim()
  if (!normalizedName) return res.status(400).json({ message: "姓名為必填" })
  user.name = normalizedName
  if (birthDate != null) user.birthDate = birthDate
  if (age != null && age !== "") {
    const n = Number(age)
    if (Number.isFinite(n)) user.age = n
  }
  if (idNumber != null) user.idNumber = idNumber
  if (gender != null) user.gender = gender
  if (typeof phone === "string") user.phone = phone.trim()
  user.profileCompleted = true
  await user.save()
  res.json({ message: "OK" })
})

app.get("/patient/blood-pressure/history", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const limit = normalizeLimit(req.query.limit, 20, 100)
  const records = await BloodPressureRecord.find({ userId: user._id, source: { $ne: "mock-seed" } }).sort({ measuredAt: -1, _id: -1 }).limit(limit)
  res.json({ records, latest: records[0] || null })
})

app.post("/patient/blood-pressure/record", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const sys = Number(req.body?.sys), dia = Number(req.body?.dia)
  const pulseRaw = req.body?.pulse
  const pulse = pulseRaw === "" || pulseRaw === null || pulseRaw === undefined ? undefined : Number(pulseRaw)
  if (!Number.isFinite(sys) || !Number.isFinite(dia)) return res.status(400).json({ message: "血壓數值無效" })
  if (pulseRaw !== "" && pulseRaw !== null && pulseRaw !== undefined && !Number.isFinite(pulse)) return res.status(400).json({ message: "Pulse 數值無效" })
  const record = await BloodPressureRecord.create({ userId: user._id, sys, dia, pulse, mood: normalizeBpMood(req.body?.mood), level: judgeBloodPressureLevel(sys, dia), measuredAt: new Date(), source: "manual-entry" })
  res.status(201).json({ message: "血壓記錄已儲存", record })
})

app.post("/patient/blood-pressure/sync", async (req, res) => {
  res.status(410).json({ message: "請使用 /patient/blood-pressure/import", requiredEndpoint: "/patient/blood-pressure/import" })
})

app.post("/patient/blood-pressure/import", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  try {
    const result = await importBloodPressureRecordsForUser(user._id, req.body?.records)
    res.json({ message: "Health Connect blood pressure records imported", ...result })
  } catch (error) {
    res.status(500).json({ message: `Blood pressure import failed: ${error.message}` })
  }
})

app.patch("/patient/blood-pressure/:id/mood", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const record = await BloodPressureRecord.findOne({ _id: req.params.id, userId: user._id })
  if (!record) return res.status(404).json({ message: "Record not found" })
  record.mood = normalizeBpMood(req.body?.mood)
  await record.save()
  res.json({ message: "Mood updated", record })
})

app.get("/patient/vision/history", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const limit = normalizeLimit(req.query.limit, 20, 100)
  const records = await VisionDetectionRecord.find({ patientUserId: user._id }).sort({ detectedAt: -1, _id: -1 }).limit(limit)
  res.json({ records })
})

app.get("/patient/vision/sessions", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const { from, to } = parseSessionWindow(req.query)
    const sessions = await listCameraSessionsForPatient(user._id, from, to)
    res.json({ from: from.toISOString(), to: to.toISOString(), staleAfterMs: CAMERA_HEARTBEAT_STALE_MS, sessions })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.post("/patient/vision/detect", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const frameTag = typeof req.body?.frameTag === "string" ? req.body.frameTag.trim() : ""
  const location = typeof req.body?.location === "string" ? req.body.location.trim() : ""
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : ""
  let detection = null
  let usedFallback = false, sampleIndex = null, nextCursor = null
  if (req.body?.confirmedByHealth === true) {
    if (frameTag) {
      const existing = await findExistingVisionRecordByFrameTag(user._id, frameTag)
      if (existing) return res.status(200).json({ message: "影像服務已主動記錄，略過重複寫入", duplicate: true, record: existing })
    }
    detection = buildConfirmedFallDetection(req.body)
  } else {
    detection = await requestVisionModelResult({ reporterRole: "patient", frameTag, location, description })
    if (!detection) {
      const s = await getNextVisionSample(user)
      usedFallback = true; sampleIndex = s.sampleIndex; nextCursor = s.nextCursor
      detection = { action: normalizeVisionAction(s.sample.action), severity: normalizeSeverity(s.sample.severity), confidence: toConfidence(s.sample.confidence, 0.9), location: s.sample.location || "", description: s.sample.description || "", frameTag: s.sample.frameTag || "", modelName: "CareAI-MediaPipe" }
    }
  }
  const record = await VisionDetectionRecord.create({ patientUserId: user._id, reporterUserId: user._id, reporterRole: "patient", action: detection.action, severity: normalizeSeverity(detection.severity || getVisionSeverityByAction(detection.action)), confidence: toConfidence(detection.confidence, 0.9), location: detection.location || location, description: detection.description || description || `event: ${detection.action}`, modelName: detection.modelName || "CareAI-MediaPipe", frameTag: detection.frameTag || frameTag, detectedAt: new Date(), source: usedFallback ? "vision-mock" : "vision-model" })
  const linkedAlert = await createVisionAlertIfNeeded({ patientUserId: user._id, reporterUserId: user._id, reporterRole: "patient", detectionRecord: record })
  res.status(201).json({ message: usedFallback ? "使用模擬資料" : "視覺偵測成功", usedFallback, sampleIndex, nextCursor, record, linkedAlert })
})

app.post("/patient/vision/sync", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const s = await getNextVisionSample(user)
  const record = await VisionDetectionRecord.create({ patientUserId: user._id, reporterUserId: user._id, reporterRole: "system", action: normalizeVisionAction(s.sample.action), severity: normalizeSeverity(s.sample.severity || getVisionSeverityByAction(s.sample.action)), confidence: toConfidence(s.sample.confidence, 0.9), location: s.sample.location || "", description: s.sample.description || "", modelName: "CareAI-MediaPipe", frameTag: s.sample.frameTag || "", detectedAt: new Date(), source: "vision-mock" })
  const linkedAlert = await createVisionAlertIfNeeded({ patientUserId: user._id, reporterUserId: user._id, reporterRole: "system", detectionRecord: record })
  res.status(201).json({ message: "OK", sampleIndex: s.sampleIndex, nextCursor: s.nextCursor, record, linkedAlert })
})

// ================= VISION-RUNTIME 主動推播（Wave D1，shared token，非使用者 JWT）=================
// vision-runtime 在 CONFIRMED 當下背景執行緒呼叫這支，App 沒開也會建立 AbnormalEvent +（High）FCM。
// eventKey 由 vision-runtime 產生、每次跌倒事件唯一，存成 frameTag 做防重複寫入（見 findExistingVisionRecordByFrameTag）。
app.post("/vision/report", async (req, res) => {
  if (!verifyVisionSharedToken(req)) return res.status(401).json({ message: "Invalid vision token" })

  const patientEmail = normalizeLinkedPatientEmail(req.body?.patientEmail)
  if (!patientEmail) return res.status(400).json({ message: "patientEmail is required" })
  const patient = await User.findOne({ email: patientEmail, role: "patient" })
  if (!patient) return res.status(404).json({ message: "Patient not found" })

  const eventKey = typeof req.body?.eventKey === "string" ? req.body.eventKey.trim() : ""
  if (eventKey) {
    const existing = await findExistingVisionRecordByFrameTag(patient._id, eventKey)
    if (existing) return res.status(200).json({ message: "Duplicate ignored", duplicate: true, record: existing })
  }

  const action = normalizeVisionAction(req.body?.action)
  const location = typeof req.body?.location === "string" ? req.body.location.trim() : ""
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : ""
  const record = await VisionDetectionRecord.create({
    patientUserId: patient._id, reporterUserId: patient._id, reporterRole: "system",
    action, severity: normalizeSeverity(req.body?.severity || getVisionSeverityByAction(action)),
    confidence: toConfidence(req.body?.confidence, 0.92), location, description,
    modelName: typeof req.body?.modelName === "string" && req.body.modelName.trim() ? req.body.modelName.trim() : "Fall-Detection-v8",
    frameTag: eventKey, detectedAt: new Date(), source: "vision-model-push"
  })
  const snapRaw = typeof req.body?.snapshotBase64 === "string"
    ? req.body.snapshotBase64.replace(/^data:[^;]+;base64,/, "")
    : ""
  if (snapRaw) {
    try {
      const buffer = Buffer.from(snapRaw, "base64")
      if (buffer.length && buffer.length <= 12 * 1024 * 1024) {
        await attachEvidenceToTargets({
          patientUserId: patient._id,
          eventKey: eventKey || undefined,
          mediaType: "snapshot",
          contentType: "image/jpeg",
          buffer
        })
      }
    } catch (err) {
      console.log("vision report snapshot attach failed:", err.message)
    }
  }
  const fresh = eventKey
    ? await VisionDetectionRecord.findOne({ patientUserId: patient._id, frameTag: eventKey })
    : record
  const linkedAlert = await createVisionAlertIfNeeded({
    patientUserId: patient._id,
    reporterUserId: patient._id,
    reporterRole: "system",
    detectionRecord: fresh || record
  })
  res.status(201).json({ message: "OK", record: fresh || record, linkedAlert })
})

// G1：站起取消（shared token）。vision-runtime 偵測到 CONFIRMED 後持續站起（SUGGEST_DISMISS）就呼叫這支，
// 用同一組 eventKey 取消尚未建立的 High Alert（5 秒觀察窗內）。找不到排程中的計時器就靜默回 cancelled:false
//（代表已經建立過或已逾時，不需要也不能再取消）。
app.post("/vision/report/standup", async (req, res) => {
  if (!verifyVisionSharedToken(req)) return res.status(401).json({ message: "Invalid vision token" })

  const patientEmail = normalizeLinkedPatientEmail(req.body?.patientEmail)
  if (!patientEmail) return res.status(400).json({ message: "patientEmail is required" })
  const patient = await User.findOne({ email: patientEmail, role: "patient" })
  if (!patient) return res.status(404).json({ message: "Patient not found" })

  const eventKey = typeof req.body?.eventKey === "string" ? req.body.eventKey.trim() : ""
  if (!eventKey) return res.status(400).json({ message: "eventKey is required" })

  const cancelled = cancelPendingFallAlert(patient._id, eventKey)
  res.json({ message: cancelled ? "已取消排程中的高風險警報（5 秒內站起）" : "找不到排程中的警報（可能已建立或已逾時）", cancelled })
})

/** R109：vision 每 30s 心跳；超過 90s 沒來則該段標 offline。 */
app.post("/vision/heartbeat", async (req, res) => {
  if (!verifyVisionSharedToken(req)) return res.status(401).json({ message: "Invalid vision token" })
  const patientEmail = normalizeLinkedPatientEmail(req.body?.patientEmail)
  if (!patientEmail) return res.status(400).json({ message: "patientEmail is required" })
  const patient = await User.findOne({ email: patientEmail, role: "patient" })
  if (!patient) return res.status(404).json({ message: "Patient not found" })
  const source = typeof req.body?.source === "string" ? req.body.source.trim().slice(0, 80) : "vision"
  const session = await recordCameraHeartbeat(patient._id, source || "vision")
  res.json({
    message: "OK",
    session: {
      _id: session._id,
      startedAt: session.startedAt,
      lastHeartbeatAt: session.lastHeartbeatAt,
      source: session.source
    }
  })
})

app.get("/patient/wearable/latest", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const record = await WearableRecord.findOne({ userId: user._id }).sort({ recordedAt: -1, _id: -1 })
  res.json({ record })
})

app.get("/patient/wearable/history", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
  const records = await WearableRecord.find({ userId: user._id }).sort({ recordedAt: -1, _id: -1 }).limit(limit)
  res.json({ records })
})

app.post("/patient/wearable/sync", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const total = MOCK_WEARABLE_SAMPLES.length
  const cursor = Number.isInteger(user.wearableSampleCursor) ? user.wearableSampleCursor : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_WEARABLE_SAMPLES[sampleIndex]
  const record = await WearableRecord.create({ userId: user._id, heartRate: sample.heartRate, spo2: sample.spo2, steps: sample.steps, note: sample.note, isAbnormal: sample.isAbnormal, source: "mock-seed", recordedAt: new Date() })
  user.wearableSampleCursor = (sampleIndex + 1) % total
  await user.save()
  res.json({ message: "OK", sampleIndex, nextCursor: user.wearableSampleCursor, record })
})

app.get("/patient/reminders", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const filter = { patientUserId: user._id, source: { $not: /^template:/ } }
    applyReminderListQuery(filter, req.query)
    const limit = normalizeLimit(req.query.limit, 30, 100)
    const records = await Reminder.find(filter).sort({ completedAt: -1, time: -1, _id: -1 }).limit(limit)
    res.json({ records })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.get("/patient/task-templates/today", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    const templates = (await TaskTemplate.find({ patientUserId: user._id }).sort({ order: 1, time: 1 }))
      .filter((t) => templateAppliesToday(t, now))
    const completions = await Reminder.find({
      patientUserId: user._id,
      source: { $regex: /^template:/ },
      time: { $gte: start, $lte: end }
    })
    const doneBySource = new Map(completions.map((r) => [r.source, r]))
    const records = templates.map((t) => {
      const source = `template:${t._id}`
      const done = doneBySource.get(source)
      return {
        _id: t._id,
        category: t.category,
        content: t.content,
        time: todayDateAtHhmm(t.time, now),
        note: t.note || "",
        isCompleted: Boolean(done?.isCompleted),
        source
      }
    })
    res.json({ records })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.get("/patient/sos/history", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const limit = normalizeLimit(req.query.limit, 10, 50)
  const records = await SosEvent.find({ patientUserId: user._id }).sort({ triggeredAt: -1, _id: -1 }).limit(limit)
  res.json({ records })
})

app.post("/patient/sos/trigger", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const { message, locationLabel, latitude, longitude, patientPhone, sourceLang: bodySourceLang, messageKey: bodyMessageKey } = req.body || {}
  // R87 W2.5：一律通知照護圈雙方（忽略 body.audience／profile.sosAudience）
  const audience = "circle"
  const lat = Number(latitude), lng = Number(longitude)
  const normalizedPhone = typeof patientPhone === "string" ? patientPhone.trim() : ""
  if (normalizedPhone) { user.phone = normalizedPhone; await user.save() }
  const allowedLang = new Set(["zh", "en", "id", "vi", "tl", "th"])
  const sourceLang = allowedLang.has(String(bodySourceLang || "").trim())
    ? String(bodySourceLang).trim()
    : (allowedLang.has(user.lang) ? user.lang : "zh")
  const messageKey = SOS_MESSAGE_BY_KEY[String(bodyMessageKey || "").trim()]
    ? String(bodyMessageKey).trim()
    : ""
  // 同一長輩只保留一件進行中 SOS（避免家屬卡清不掉）
  await supersedeOpenSosForPatient(user._id, { reason: "replaced_by_new_sos" })
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)
  const address = hasCoords ? await reverseGeocodeWithTimeout(lat, lng, 2500) : ""
  const record = await SosEvent.create({
    eventId: createSosEventId(), patientUserId: user._id, patientName: user.name || "Patient",
    patientEmail: user.email, patientPhone: normalizedPhone || user.phone || "",
    message: typeof message === "string" && message.trim() ? message.trim() : (SOS_MESSAGE_BY_KEY.needHelp[sourceLang] || "SOS"),
    messageKey,
    sourceLang,
    audience,
    locationLabel: address || (hasCoords ? coordFallbackLabel(lat, lng, locationLabel) : ""),
    latitude: hasCoords ? lat : undefined, longitude: hasCoords ? lng : undefined,
    status: "active", triggeredAt: new Date(), source: "patient-manual-sos"
  })
  if (!address && hasCoords) scheduleSosAddressFill(record._id, lat, lng)
  notifyCareCircleSos(record).catch(error => console.log("SOS push failed:", error.message))
  res.status(201).json({
    message: "SOS 已通知照護圈",
    record,
    audience
  })
})

/** @deprecated W2.5 起 UI 已移除；保留 API 相容，寫入一律視為 circle */
app.patch("/patient/sos-audience", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  if (user.role !== "patient") return res.status(403).json({ message: "僅受顧者可設定" })
  user.sosAudience = "circle"
  await user.save()
  res.json({ message: "OK（已固定為看護與家屬）", sosAudience: "circle" })
})

app.get("/patient/health-card", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  if (user.role !== "patient") return res.status(403).json({ message: "僅受顧者可讀自己的健康卡" })
  res.json({ healthCard: publicHealthCard(user) })
})

app.patch("/patient/health-card", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  if (user.role !== "patient") return res.status(403).json({ message: "僅受顧者可編輯" })
  const body = req.body || {}
  user.healthCard = normalizeHealthCard(body, user.healthCard || {})
  await user.save()
  res.json({ message: "OK", healthCard: publicHealthCard(user) })
})

app.get("/mobile/health-card", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "family" && user.role !== "caregiver") {
      return res.status(403).json({ message: "僅家屬或看護可讀" })
    }
    const patientEmail = String(req.query.patientEmail || "").trim().toLowerCase()
    if (!patientEmail) return res.status(400).json({ message: "缺少 patientEmail" })
    const allowed = await isCareCircleMemberForPatient(user, patientEmail)
    if (!allowed) return res.status(403).json({ message: "不在該長輩照護圈" })
    const patient = await User.findOne({ email: patientEmail, role: "patient" })
    if (!patient) return res.status(404).json({ message: "找不到受顧者" })
    res.json({ healthCard: publicHealthCard(patient) })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || "讀取失敗" })
  }
})

app.post("/patient/sos/:id/cancel", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const record = await SosEvent.findOne({
    $or: [{ _id: req.params.id }, { eventId: req.params.id }],
    patientUserId: user._id
  })
  if (!record) return res.status(404).json({ message: "SOS event not found" })
  if (record.status === "cancelled") return res.json({ message: "Already cancelled", record })
  if (record.status === "resolved") return res.status(400).json({ message: "Already resolved", record })
  record.status = "cancelled"
  record.resolvedAt = new Date()
  record.resolvedByEmail = user.email
  record.cancelReason = "false_press"
  await record.save()
  notifyCareCircleSos(record, { cancelled: true }).catch(error => console.log("SOS cancel push failed:", error.message))
  res.json({ message: "SOS 已取消", record })
})

app.patch("/patient/sos/:id/location", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const { locationLabel, latitude, longitude } = req.body || {}
  const lat = Number(latitude)
  const lng = Number(longitude)
  const record = await SosEvent.findOne({
    $or: [{ _id: req.params.id }, { eventId: req.params.id }],
    patientUserId: user._id
  })
  if (!record) return res.status(404).json({ message: "SOS event not found" })

  if (Number.isFinite(lat)) record.latitude = lat
  if (Number.isFinite(lng)) record.longitude = lng
  const address = await reverseGeocodeWithTimeout(
    Number.isFinite(lat) ? lat : Number(record.latitude),
    Number.isFinite(lng) ? lng : Number(record.longitude),
    2500
  )
  if (address) record.locationLabel = address
  else if (typeof locationLabel === "string" && locationLabel.trim()) record.locationLabel = locationLabel.trim()
  await record.save()
  if (!address) {
    scheduleSosAddressFill(
      record._id,
      Number(record.latitude),
      Number(record.longitude)
    )
  }
  res.json({ message: "SOS location updated", record })
})

// ================= FAMILY =================
app.post("/family/alerts/seek-test", handleSeekTestPost)
app.get("/family/alerts/history", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const limit = normalizeLimit(req.query.limit, 20, 100)
    const records = await buildAlertsHistoryForPatient(patientUserId, {
      severity: req.query.severity,
      status: req.query.status,
      limit
    })
    res.json({ records })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.get("/family/alerts/stats", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const stats = await buildAlertStatsForPatient(patientUserId, req.query.range === "month" ? "month" : "week")
    res.json(stats)
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.post("/family/alerts/sync", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const total = MOCK_FAMILY_ALERTS.length
  const cursor = Number.isInteger(user.familyAlertsCursor) ? user.familyAlertsCursor : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_FAMILY_ALERTS[sampleIndex]
  const patientUserId = await resolveTargetPatient(user._id)
  const record = await AbnormalEvent.create({ eventId: createAbnormalEventId(), patientUserId, reporterUserId: user._id, reporterRole: "system", type: sample.type, severity: normalizeSeverity(sample.level), happenedAt: new Date(sample.happenedAt), location: sample.location, status: normalizeAlertStatus(sample.status), description: `${sample.type} 事件`, source: "mock-seed" })
  user.familyAlertsCursor = (sampleIndex + 1) % total
  await user.save()
  res.json({ message: "OK", sampleIndex, nextCursor: user.familyAlertsCursor, record })
})

app.patch("/family/alerts/:id/status", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await AbnormalEvent.findById(req.params.id),
      patientUserId,
      "Alert not found"
    )
    record.status = normalizeAlertStatus(req.body?.status)
    await record.save()
    res.json({ message: "OK", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.post("/family/alerts/:id/claim", async (_req, res) => {
  // G3：家屬唯讀監看，不可認領（看護才是處理者）
  return res.status(403).json({ message: "家屬無法認領異常事件，請由看護處理" })
})

app.post("/family/alerts/:id/resolve", async (_req, res) => {
  // G3：家屬唯讀監看，不可結案
  return res.status(403).json({ message: "家屬無法結案異常事件，請由看護處理" })
})

app.get("/family/blood-pressure/history", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const limit = normalizeLimit(req.query.limit, 30, 100)
    const records = await BloodPressureRecord.find({ userId: patientUserId, source: { $ne: "mock-seed" } }).sort({ measuredAt: -1, _id: -1 }).limit(limit)
    res.json({ records, latest: records[0] || null, linkedPatientEmail: user.linkedPatientEmail || "" })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.get("/family/care-records/history", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const filter = { userId: user._id }
  if (req.query.date) {
    const date = new Date(req.query.date)
    if (!Number.isNaN(date.getTime())) {
      const start = new Date(date); start.setHours(0, 0, 0, 0)
      const end = new Date(date); end.setHours(23, 59, 59, 999)
      filter.recordDate = { $gte: start, $lte: end }
    }
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
  const records = await FamilyCareRecord.find(filter).sort({ recordDate: -1, _id: -1 }).limit(limit)
  res.json({ records })
})

app.post("/family/care-records/sync", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const total = MOCK_FAMILY_CARE_RECORDS.length
  const cursor = Number.isInteger(user.familyCareRecordsCursor) ? user.familyCareRecordsCursor : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_FAMILY_CARE_RECORDS[sampleIndex]
  const record = await FamilyCareRecord.create({ userId: user._id, recordDate: new Date(sample.recordDate), time: sample.time, medicine: sample.medicine, meal: sample.meal, toilet: sample.toilet, activity: sample.activity, source: "mock-seed" })
  user.familyCareRecordsCursor = (sampleIndex + 1) % total
  await user.save()
  res.json({ message: "OK", sampleIndex, nextCursor: user.familyCareRecordsCursor, record })
})

app.get("/family/events/history", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const filter = { userId: user._id }
  if (req.query.type && req.query.type !== "all") filter.type = req.query.type
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
  const records = await FamilyEvent.find(filter).sort({ happenedAt: -1, _id: -1 }).limit(limit)
  res.json({ records })
})

app.post("/family/events/sync", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const total = MOCK_FAMILY_EVENTS.length
  const cursor = Number.isInteger(user.familyEventsCursor) ? user.familyEventsCursor : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_FAMILY_EVENTS[sampleIndex]
  const record = await FamilyEvent.create({ userId: user._id, eventId: sample.eventId, type: sample.type, description: sample.description, media: sample.media, status: sample.status, happenedAt: new Date(sample.happenedAt), source: "mock-seed" })
  user.familyEventsCursor = (sampleIndex + 1) % total
  await user.save()
  res.json({ message: "OK", sampleIndex, nextCursor: user.familyEventsCursor, record })
})

app.get("/family/sos/history", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const filter = { patientUserId }
    if (req.query.status === "active" || req.query.status === "resolved") filter.status = req.query.status
    const limit = normalizeLimit(req.query.limit, 20, 100)
    const records = await SosEvent.find(filter).sort({ triggeredAt: -1, _id: -1 }).limit(limit)
    res.json({ records })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

/** R91：看護／家屬跨所有照護圈的進行中 SOS（避免只看目前圈漏通知） */
app.get("/mobile/sos/inbox", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "family" && user.role !== "caregiver") {
      return res.status(403).json({ message: "僅家屬或看護可讀緊急收件匣" })
    }
    const rows = await CareCircleMember.find({
      memberEmail: String(user.email || "").trim().toLowerCase()
    })
      .select("patientEmail")
      .lean()
    let patientEmails = rows.map(r => String(r.patientEmail || "").toLowerCase()).filter(Boolean)
    const legacy = String(user.linkedPatientEmail || user.activePatientEmail || "")
      .trim()
      .toLowerCase()
    if (legacy && !patientEmails.includes(legacy)) patientEmails.push(legacy)
    if (!patientEmails.length) return res.json({ records: [], activePatientEmail: user.activePatientEmail || "" })

    const patients = await User.find({ email: { $in: patientEmails }, role: "patient" })
      .select("_id email name")
      .lean()
    const idToPatient = Object.fromEntries(patients.map(p => [String(p._id), p]))
    const patientIds = patients.map(p => p._id)
    const inboxFilter = {
      patientUserId: { $in: patientIds },
      status: { $in: ["active", "handling"] }
    }
    // W2.5：一律 circle；舊 caregiver_only 資料家屬仍不顯示（相容）
    if (user.role === "family") {
      inboxFilter.$nor = [{ audience: "caregiver_only" }]
    }
    const records = await SosEvent.find(inboxFilter)
      .sort({ triggeredAt: -1, _id: -1 })
      .limit(50)
      .lean()

    const enriched = records.map(r => {
      const p = idToPatient[String(r.patientUserId)] || {}
      return {
        ...r,
        patientEmail: p.email || r.patientEmail || "",
        patientName: r.patientName || p.name || "",
        audience: "circle",
        handlerName: r.handlerName || "",
        status: r.status === "handling" ? "handling" : "active"
      }
    })
    res.json({
      records: enriched,
      activePatientEmail: user.activePatientEmail || user.linkedPatientEmail || ""
    })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || "讀取失敗" })
  }
})

/** 家屬知情催促：再推播看護（不接手處理） */
app.post("/family/sos/:id/remind", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "family") return res.status(403).json({ message: "僅家屬可提醒看護" })
    const record = await SosEvent.findOne({
      $or: [{ _id: req.params.id }, { eventId: req.params.id }]
    })
    if (!record) return res.status(404).json({ message: "SOS event not found" })
    if (record.status !== "active" && record.status !== "handling") {
      return res.status(400).json({ message: "此 SOS 已結束" })
    }
    const allowed = await isCareCircleMemberForPatient(user, record.patientEmail)
    if (!allowed) return res.status(403).json({ message: "不在該長輩照護圈" })
    notifyCareCircleSos(record, { remind: true }).catch(error =>
      console.log("SOS remind push failed:", error.message)
    )
    res.json({ message: "已提醒看護", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.patch("/family/sos/:id/resolve", async (_req, res) => {
  // 鐵律：家屬知情不處理——不可結案
  res.status(403).json({ message: "家屬不可結案 SOS；請提醒看護或撥打 119" })
})

app.get("/family/check-profile", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  res.json({ profileCompleted: user.profileCompleted })
})

app.get("/family/profile", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  res.json({ name: user.name, phone: user.phone, linkedPatientEmail: user.linkedPatientEmail || "" })
})

app.post("/family/setup", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const { name, phone } = req.body
  const user = await User.findOne({ email: decoded.email })
  const normalizedName = String(name || "").trim()
  if (!normalizedName) return res.status(400).json({ message: "姓名為必填" })
  user.name = normalizedName
  if (typeof phone === "string") user.phone = phone.trim()
  user.profileCompleted = true
  await user.save()
  res.json({ message: "OK" })
})

app.get("/family/reminders", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    // 排除重複提醒打卡產生的紀錄，避免混進「單次提醒」
    const filter = {
      assignedToRole: "caregiver",
      patientUserId,
      source: { $not: /^template:/ }
    }
    applyReminderListQuery(filter, req.query)
    const limit = normalizeLimit(req.query.limit, 30, 100)
    const sort = req.query.completed === "true" || req.query.days
      ? { completedAt: -1, time: -1, _id: -1 }
      : { isCompleted: 1, time: 1, _id: -1 }
    const records = await Reminder.find(filter).sort(sort).limit(limit)
    res.json({ records })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.post("/family/reminders", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const { category, content, time, note } = req.body || {}
  if (!category || !String(category).trim()) return res.status(400).json({ message: "類別為必填" })
  if (!content || !String(content).trim()) return res.status(400).json({ message: "內容為必填" })
  const parsedTime = new Date(time)
  if (!time || Number.isNaN(parsedTime.getTime())) return res.status(400).json({ message: "時間格式無效" })
  const patientUserId = await resolveTargetPatient(user._id)
  const record = await Reminder.create({ reminderId: createReminderId(), patientUserId, createdByUserId: user._id, createdByRole: "family", assignedToRole: "caregiver", category: String(category).trim(), content: String(content).trim(), time: parsedTime, note: typeof note === "string" ? note.trim() : "", sourceLang: String(req.body?.sourceLang || user.lang || "zh").trim(), contentKey: String(req.body?.contentKey || "").trim(), source: "family-manual" })
  res.status(201).json({ message: "OK", record })
})

app.patch("/family/reminders/:id", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await Reminder.findById(req.params.id),
      patientUserId,
      "Reminder not found"
    )
    const { category, content, time, note } = req.body || {}
    if (typeof category === "string" && category.trim()) record.category = category.trim()
    if (typeof content === "string" && content.trim()) record.content = content.trim()
    if (typeof note === "string") record.note = note.trim()
    if (typeof req.body?.contentKey === "string") record.contentKey = req.body.contentKey.trim()
    if (typeof req.body?.sourceLang === "string" && req.body.sourceLang.trim()) record.sourceLang = req.body.sourceLang.trim()
    if (time) {
      const parsedTime = new Date(time)
      if (Number.isNaN(parsedTime.getTime())) return res.status(400).json({ message: "時間格式無效" })
      record.time = parsedTime
    }
    await record.save()
    res.json({ message: "OK", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.delete("/family/reminders/:id", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await Reminder.findById(req.params.id),
      patientUserId,
      "Reminder not found"
    )
    await Reminder.findByIdAndDelete(record._id)
    res.json({ message: "OK" })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

function normalizeWeekdays(input) {
  if (!Array.isArray(input)) return []
  return [...new Set(input.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
}

function normalizeHhmm(value, fallback = "08:00") {
  const raw = String(value || "").trim()
  const m = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return fallback
  const h = Math.min(23, Math.max(0, Number(m[1])))
  const mi = Math.min(59, Math.max(0, Number(m[2])))
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`
}

function templateAppliesToday(template, now = new Date()) {
  const days = Array.isArray(template.weekdays) ? template.weekdays : []
  if (!days.length) return true
  return days.includes(now.getDay())
}

function todayDateAtHhmm(hhmm, now = new Date()) {
  const [h, m] = String(hhmm || "08:00").split(":").map((x) => Number(x))
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0, 0, 0)
}

app.get("/family/task-templates", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const records = await TaskTemplate.find({ patientUserId }).sort({ order: 1, time: 1, _id: -1 })
    res.json({ records })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

/** 家屬「今日待辦」：今日適用的重複提醒＋完成狀態（不混進單次列表） */
app.get("/family/task-templates/today", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    const templates = (await TaskTemplate.find({ patientUserId }).sort({ order: 1, time: 1 }))
      .filter((t) => templateAppliesToday(t, now))
    const completions = await Reminder.find({
      patientUserId,
      source: { $regex: /^template:/ },
      time: { $gte: start, $lte: end }
    })
    const doneBySource = new Map(completions.map((r) => [r.source, r]))
    const records = templates.map((t) => {
      const source = `template:${t._id}`
      const done = doneBySource.get(source)
      return {
        _id: t._id,
        category: t.category,
        content: t.content,
        time: t.time,
        weekdays: t.weekdays,
        note: t.note || "",
        isCompleted: Boolean(done?.isCompleted),
        source
      }
    })
    res.json({ records })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.post("/family/task-templates", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const { category, content, time, weekdays, order, note } = req.body || {}
    if (!category || !String(category).trim()) return res.status(400).json({ message: "類別為必填" })
    if (!content || !String(content).trim()) return res.status(400).json({ message: "內容為必填" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = await TaskTemplate.create({
      patientUserId,
      createdByUserId: user._id,
      category: String(category).trim(),
      content: String(content).trim(),
      time: normalizeHhmm(time),
      weekdays: normalizeWeekdays(weekdays),
      note: typeof note === "string" ? note.trim() : "",
      sourceLang: String(req.body?.sourceLang || user.lang || "zh").trim(),
      contentKey: String(req.body?.contentKey || "").trim(),
      order: Number.isFinite(Number(order)) ? Number(order) : 0
    })
    res.status(201).json({ message: "OK", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.get("/family/reminder-presets", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const filter = { patientUserId }
    if (req.query.category) filter.category = String(req.query.category).trim()
    const records = await ReminderPreset.find(filter).sort({ category: 1, content: 1 })
    res.json({ records })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.post("/family/reminder-presets", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const { category, content, hidden } = req.body || {}
    if (!category || !String(category).trim()) return res.status(400).json({ message: "類別為必填" })
    if (!content || !String(content).trim()) return res.status(400).json({ message: "內容為必填" })
    const patientUserId = await resolveTargetPatient(user._id)
    const cat = String(category).trim()
    const text = String(content).trim()
    // hidden=true：隱藏內建常用（source=family-hidden）；否則新增自訂
    const source = hidden === true ? "family-hidden" : "family-custom"
    const existing = await ReminderPreset.findOne({ patientUserId, category: cat, content: text })
    if (existing) {
      if (source === "family-hidden" && existing.source !== "family-hidden") {
        existing.source = "family-hidden"
        await existing.save()
      }
      return res.json({ message: "OK", record: existing })
    }
    const record = await ReminderPreset.create({
      patientUserId,
      createdByUserId: user._id,
      category: cat,
      content: text,
      source
    })
    res.status(201).json({ message: "OK", record })
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "此常用事項已存在" })
    }
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.delete("/family/reminder-presets/:id", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await ReminderPreset.findById(req.params.id),
      patientUserId,
      "Preset not found"
    )
    await ReminderPreset.findByIdAndDelete(record._id)
    res.json({ message: "OK" })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.patch("/family/task-templates/:id", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await TaskTemplate.findById(req.params.id),
      patientUserId,
      "Template not found"
    )
    const { category, content, time, weekdays, order, note } = req.body || {}
    if (typeof category === "string" && category.trim()) record.category = category.trim()
    if (typeof content === "string" && content.trim()) record.content = content.trim()
    if (time !== undefined) record.time = normalizeHhmm(time, record.time)
    if (weekdays !== undefined) record.weekdays = normalizeWeekdays(weekdays)
    if (typeof note === "string") record.note = note.trim()
    if (typeof req.body?.contentKey === "string") record.contentKey = req.body.contentKey.trim()
    if (typeof req.body?.sourceLang === "string" && req.body.sourceLang.trim()) record.sourceLang = req.body.sourceLang.trim()
    if (order !== undefined && Number.isFinite(Number(order))) record.order = Number(order)
    await record.save()
    res.json({ message: "OK", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.delete("/family/task-templates/:id", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await TaskTemplate.findById(req.params.id),
      patientUserId,
      "Template not found"
    )
    await TaskTemplate.findByIdAndDelete(record._id)
    res.json({ message: "OK" })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

// ================= CAREGIVER =================
app.get("/caregiver/blood-pressure/history", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const limit = normalizeLimit(req.query.limit, 30, 100)
    const records = await BloodPressureRecord.find({ userId: patientUserId, source: { $ne: "mock-seed" } }).sort({ measuredAt: -1, _id: -1 }).limit(limit)
    res.json({ records, latest: records[0] || null, linkedPatientEmail: user.linkedPatientEmail || "" })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.post("/caregiver/blood-pressure/record", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const sys = Number(req.body?.sys), dia = Number(req.body?.dia)
  const pulseRaw = req.body?.pulse
  const pulse = pulseRaw === "" || pulseRaw === null || pulseRaw === undefined ? undefined : Number(pulseRaw)
  if (!Number.isFinite(sys) || !Number.isFinite(dia)) return res.status(400).json({ message: "血壓數值無效" })
  if (pulseRaw !== "" && pulseRaw !== null && pulseRaw !== undefined && !Number.isFinite(pulse)) return res.status(400).json({ message: "Pulse 數值無效" })
  const patientUserId = await resolveTargetPatient(user._id)
  const record = await BloodPressureRecord.create({ userId: patientUserId, sys, dia, pulse, mood: normalizeBpMood(req.body?.mood), level: judgeBloodPressureLevel(sys, dia), measuredAt: new Date(), source: "caregiver-entry" })
  res.status(201).json({ message: "OK", record })
})

app.post("/caregiver/blood-pressure/sync", async (req, res) => {
  res.status(410).json({ message: "請使用 /caregiver/blood-pressure/import", requiredEndpoint: "/caregiver/blood-pressure/import" })
})

app.post("/caregiver/blood-pressure/import", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  try {
    const patientUserId = await resolveTargetPatient(user._id)
    const result = await importBloodPressureRecordsForUser(patientUserId, req.body?.records)
    res.json({ message: "Health Connect blood pressure records imported", ...result })
  } catch (error) {
    res.status(500).json({ message: `Blood pressure import failed: ${error.message}` })
  }
})

app.patch("/caregiver/blood-pressure/:id/mood", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const patientUserId = await resolveTargetPatient(user._id)
  const record = await BloodPressureRecord.findOne({ _id: req.params.id, userId: patientUserId })
  if (!record) return res.status(404).json({ message: "Record not found" })
  record.mood = normalizeBpMood(req.body?.mood)
  await record.save()
  res.json({ message: "Mood updated", record })
})

app.get("/caregiver/vision/history", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const patientUserId = await resolveTargetPatient(user._id)
  const filter = { patientUserId }
  if (req.query.severity) filter.severity = normalizeSeverity(req.query.severity)
  const limit = normalizeLimit(req.query.limit, 30, 100)
  const records = await VisionDetectionRecord.find(filter).sort({ detectedAt: -1, _id: -1 }).limit(limit)
  res.json({ records })
})

app.get("/caregiver/vision/sessions", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const { from, to } = parseSessionWindow(req.query)
    const sessions = await listCameraSessionsForPatient(patientUserId, from, to)
    res.json({ from: from.toISOString(), to: to.toISOString(), staleAfterMs: CAMERA_HEARTBEAT_STALE_MS, sessions })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.post("/caregiver/vision/detect", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const patientUserId = await resolveTargetPatient(user._id)
  const frameTag = typeof req.body?.frameTag === "string" ? req.body.frameTag.trim() : ""
  const location = typeof req.body?.location === "string" ? req.body.location.trim() : ""
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : ""
  let detection = null
  let usedFallback = false, sampleIndex = null, nextCursor = null
  if (req.body?.confirmedByHealth === true) {
    if (frameTag) {
      const existing = await findExistingVisionRecordByFrameTag(patientUserId, frameTag)
      if (existing) return res.status(200).json({ message: "影像服務已主動記錄，略過重複寫入", duplicate: true, record: existing })
    }
    detection = buildConfirmedFallDetection(req.body)
  } else {
    detection = await requestVisionModelResult({ reporterRole: "caregiver", frameTag, location, description })
    if (!detection) {
      const s = await getNextVisionSample(user)
      usedFallback = true; sampleIndex = s.sampleIndex; nextCursor = s.nextCursor
      detection = { action: normalizeVisionAction(s.sample.action), severity: normalizeSeverity(s.sample.severity), confidence: toConfidence(s.sample.confidence, 0.9), location: s.sample.location || "", description: s.sample.description || "", frameTag: s.sample.frameTag || "", modelName: "CareAI-MediaPipe" }
    }
  }
  const record = await VisionDetectionRecord.create({ patientUserId, reporterUserId: user._id, reporterRole: "caregiver", action: detection.action, severity: normalizeSeverity(detection.severity || getVisionSeverityByAction(detection.action)), confidence: toConfidence(detection.confidence, 0.9), location: detection.location || location, description: detection.description || description || `event: ${detection.action}`, modelName: detection.modelName || "CareAI-MediaPipe", frameTag: detection.frameTag || frameTag, detectedAt: new Date(), source: usedFallback ? "vision-mock" : "vision-model" })
  const linkedAlert = await createVisionAlertIfNeeded({ patientUserId, reporterUserId: user._id, reporterRole: "caregiver", detectionRecord: record })
  res.status(201).json({ message: usedFallback ? "使用模擬資料" : "視覺偵測成功", usedFallback, sampleIndex, nextCursor, record, linkedAlert })
})

app.post("/caregiver/vision/sync", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const patientUserId = await resolveTargetPatient(user._id)
  const s = await getNextVisionSample(user)
  const record = await VisionDetectionRecord.create({ patientUserId, reporterUserId: user._id, reporterRole: "system", action: normalizeVisionAction(s.sample.action), severity: normalizeSeverity(s.sample.severity || getVisionSeverityByAction(s.sample.action)), confidence: toConfidence(s.sample.confidence, 0.9), location: s.sample.location || "", description: s.sample.description || "", modelName: "CareAI-MediaPipe", frameTag: s.sample.frameTag || "", detectedAt: new Date(), source: "vision-mock" })
  const linkedAlert = await createVisionAlertIfNeeded({ patientUserId, reporterUserId: user._id, reporterRole: "system", detectionRecord: record })
  res.status(201).json({ message: "OK", sampleIndex: s.sampleIndex, nextCursor: s.nextCursor, record, linkedAlert })
})

app.post("/caregiver/alerts/seek-test", handleSeekTestPost)
app.get("/caregiver/alerts/history", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const limit = normalizeLimit(req.query.limit, 20, 100)
    const records = await buildAlertsHistoryForPatient(patientUserId, {
      severity: req.query.severity,
      status: req.query.status,
      limit
    })
    res.json({ records })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.get("/caregiver/alerts/stats", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const stats = await buildAlertStatsForPatient(patientUserId, req.query.range === "month" ? "month" : "week")
    res.json(stats)
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.post("/caregiver/alerts", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const { type, severity, status, location, description, happenedAt, note } = req.body || {}
  if (!type || !String(type).trim()) return res.status(400).json({ message: "類型為必填" })
  const patientUserId = await resolveTargetPatient(user._id)
  const desc = typeof description === "string" ? description.trim() : ""
  const noteText = typeof note === "string" ? note.trim() : ""
  const record = await AbnormalEvent.create({
    eventId: createAbnormalEventId(),
    patientUserId,
    reporterUserId: user._id,
    reporterRole: "caregiver",
    type: String(type).trim(),
    severity: normalizeSeverity(severity),
    status: normalizeAlertStatus(status),
    location: typeof location === "string" ? location.trim() : "",
    description: noteText ? (desc ? `${desc}\n${noteText}` : noteText) : desc,
    note: noteText,
    happenedAt: happenedAt ? new Date(happenedAt) : new Date(),
    source: "caregiver-manual"
  })
  if (record.severity === "High") notifyCareCircleAlert(record).catch(error => console.log("Alert push failed:", error.message))
  res.status(201).json({ message: "OK", record })
})

app.patch("/caregiver/alerts/:id/status", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await AbnormalEvent.findById(req.params.id),
      patientUserId,
      "Alert not found"
    )
    record.status = normalizeAlertStatus(req.body?.status)
    await record.save()
    res.json({ message: "OK", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.post("/caregiver/alerts/:id/claim", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await AbnormalEvent.findById(req.params.id),
      patientUserId,
      "Alert not found"
    )
    await claimAbnormalEvent(record, user, "caregiver")
    res.json({ message: "OK", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.post("/caregiver/alerts/:id/resolve", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await AbnormalEvent.findById(req.params.id),
      patientUserId,
      "Alert not found"
    )
    await resolveAbnormalEvent(record, user, "caregiver", req.body?.note)
    const supersededCount = await supersedeOlderOpenAlerts(record, user, req.body?.note)
    res.json({ message: "OK", record, supersededCount })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

/** M1：看護上傳事件證據（假檔／截圖／短片 base64） */
app.post("/caregiver/alerts/:id/evidence", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    assertPatientOwned(
      await AbnormalEvent.findById(req.params.id),
      patientUserId,
      "Alert not found"
    )
    const mediaType = req.body?.mediaType === "clip" ? "clip" : "snapshot"
    const contentType = typeof req.body?.contentType === "string" ? req.body.contentType : (mediaType === "clip" ? "video/mp4" : "image/jpeg")
    const raw = typeof req.body?.dataBase64 === "string" ? req.body.dataBase64.replace(/^data:[^;]+;base64,/, "") : ""
    if (!raw) return res.status(400).json({ message: "dataBase64 必填" })
    const buffer = Buffer.from(raw, "base64")
    if (!buffer.length) return res.status(400).json({ message: "dataBase64 無效" })
    if (buffer.length > 12 * 1024 * 1024) return res.status(400).json({ message: "檔案過大（上限 12MB）" })
    const { entry } = await attachEvidenceToTargets({
      patientUserId,
      alertId: req.params.id,
      eventKey: req.body?.eventKey,
      mediaType,
      contentType,
      buffer,
      durationSec: req.body?.durationSec,
      startAt: req.body?.startAt
    })
    res.status(201).json({
      message: "OK",
      evidence: {
        ...entry,
        urlPath: `/media/evidence/${encodeURIComponent(entry.evidenceId)}`
      }
    })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

/** M1/M2：vision-runtime 以 shared token 上傳事件證據（掛 eventKey／alert） */
app.post("/vision/evidence", async (req, res) => {
  try {
    if (!verifyVisionSharedToken(req)) return res.status(401).json({ message: "Invalid vision token" })
    const patientEmail = typeof req.body?.patientEmail === "string" ? req.body.patientEmail.trim().toLowerCase() : ""
    if (!patientEmail) return res.status(400).json({ message: "patientEmail 必填" })
    const patient = await User.findOne({ email: patientEmail, role: "patient" })
    if (!patient) return res.status(404).json({ message: "Patient not found" })
    const eventKey = typeof req.body?.eventKey === "string" ? req.body.eventKey.trim() : ""
    const alertId = typeof req.body?.alertId === "string" ? req.body.alertId.trim() : ""
    if (!eventKey && !alertId) return res.status(400).json({ message: "eventKey 或 alertId 必填" })
    const mediaType = req.body?.mediaType === "clip" ? "clip" : "snapshot"
    const contentType = typeof req.body?.contentType === "string" ? req.body.contentType : (mediaType === "clip" ? "video/mp4" : "image/jpeg")
    const raw = typeof req.body?.dataBase64 === "string" ? req.body.dataBase64.replace(/^data:[^;]+;base64,/, "") : ""
    if (!raw) return res.status(400).json({ message: "dataBase64 必填" })
    const buffer = Buffer.from(raw, "base64")
    if (!buffer.length) return res.status(400).json({ message: "dataBase64 無效" })
    if (buffer.length > 12 * 1024 * 1024) return res.status(400).json({ message: "檔案過大（上限 12MB）" })
    const { entry, touched } = await attachEvidenceToTargets({
      patientUserId: patient._id,
      alertId: alertId || undefined,
      eventKey: eventKey || undefined,
      mediaType,
      contentType,
      buffer,
      durationSec: req.body?.durationSec,
      startAt: req.body?.startAt
    })
    res.status(201).json({
      message: "OK",
      evidence: { ...entry, urlPath: `/media/evidence/${encodeURIComponent(entry.evidenceId)}` },
      linkedAlertId: touched.alert?._id || null,
      linkedVisionId: touched.vision?._id || null
    })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

/** 列表縮圖：截圖原圖；短片抽第一幀 */
app.get("/media/evidence/:evidenceId/thumb", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const found = await findEvidenceById(req.params.evidenceId)
    if (!found) return res.status(404).json({ message: "Evidence not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    if (String(found.patientUserId) !== String(patientUserId) && String(user._id) !== String(found.patientUserId)) {
      return res.status(403).json({ message: "無權限存取此證據" })
    }
    const buffer = await objectStore.getObjectBuffer(found.item.objectKey)
    if (!buffer) return res.status(404).json({ message: "Evidence file missing" })
    const isClip = found.item.mediaType === "clip" || String(found.item.contentType || "").toLowerCase().includes("video")
    const jpeg = isClip ? jpegFromMp4Buffer(buffer) : buffer
    if (!jpeg) return res.status(404).json({ message: "Thumb missing" })
    res.setHeader("Content-Type", "image/jpeg")
    res.setHeader("Cache-Control", "private, max-age=120")
    res.send(jpeg)
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

/** 讀取證據二進位（需看護／家屬 JWT，且長輩綁定一致） */
app.get("/media/evidence/:evidenceId", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const found = await findEvidenceById(req.params.evidenceId)
    if (!found) return res.status(404).json({ message: "Evidence not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    if (String(found.patientUserId) !== String(patientUserId) && String(user._id) !== String(found.patientUserId)) {
      return res.status(403).json({ message: "無權限存取此證據" })
    }
    const buffer = await objectStore.getObjectBuffer(found.item.objectKey)
    if (!buffer) return res.status(404).json({ message: "Evidence file missing" })
    const contentType = found.item.contentType || "application/octet-stream"
    const total = buffer.length
    res.setHeader("Content-Type", contentType)
    res.setHeader("Cache-Control", "private, max-age=120")
    res.setHeader("Accept-Ranges", "bytes")
    res.setHeader("Access-Control-Allow-Origin", "*")
    const range = typeof req.headers.range === "string" ? req.headers.range : ""
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (match) {
      const start = match[1] ? Number(match[1]) : 0
      const end = match[2] ? Number(match[2]) : total - 1
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= total || start > end) {
        res.status(416)
        res.setHeader("Content-Range", `bytes */${total}`)
        return res.end()
      }
      const chunk = buffer.subarray(start, end + 1)
      res.status(206)
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`)
      res.setHeader("Content-Length", chunk.length)
      return res.send(chunk)
    }
    res.setHeader("Content-Length", total)
    res.send(buffer)
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

/** G3：看護可事後修改「如何處理」說明（不重開狀態、不重推播） */
app.patch("/caregiver/alerts/:id/note", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await AbnormalEvent.findById(req.params.id),
      patientUserId,
      "Alert not found"
    )
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : ""
    if (!note) return res.status(400).json({ message: "請填寫如何處理" })
    let supersededCount = 0
    if (record.status !== "Done") {
      // 尚未結案就當 resolve，並覆蓋其餘未結案（與 POST resolve 一致）
      await resolveAbnormalEvent(record, user, "caregiver", note)
      supersededCount = await supersedeOlderOpenAlerts(record, user, note)
    } else {
      record.resolvedNote = note
      record.resolvedByUserId = user._id
      record.resolvedAt = record.resolvedAt || new Date()
      await record.save()
    }
    res.json({ message: "OK", record, supersededCount })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.post("/caregiver/alerts/sync", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const total = MOCK_CAREGIVER_ALERTS.length
  const cursor = Number.isInteger(user.caregiverAlertsCursor) ? user.caregiverAlertsCursor : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_CAREGIVER_ALERTS[sampleIndex]
  const patientUserId = await resolveTargetPatient(user._id)
  const record = await AbnormalEvent.create({ eventId: createAbnormalEventId(), patientUserId, reporterUserId: user._id, reporterRole: "system", type: sample.type, severity: normalizeSeverity(sample.riskLevel), status: normalizeAlertStatus(sample.status), description: sample.actionTaken, happenedAt: new Date(sample.happenedAt), source: "mock-seed" })
  user.caregiverAlertsCursor = (sampleIndex + 1) % total
  await user.save()
  res.json({ message: "Caregiver abnormal event mock synced", sampleIndex, nextCursor: user.caregiverAlertsCursor, record })
})

app.get("/caregiver/reminders", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const filter = {
      assignedToRole: "caregiver",
      patientUserId,
      source: { $not: /^template:/ }
    }
    applyReminderListQuery(filter, req.query)
    const limit = normalizeLimit(req.query.limit, 30, 100)
    const sort = req.query.completed === "true" || req.query.days
      ? { completedAt: -1, time: -1, _id: -1 }
      : { isCompleted: 1, time: 1, _id: -1 }
    const records = await Reminder.find(filter).sort(sort).limit(limit)
    res.json({ records })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.patch("/caregiver/reminders/:id/complete", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await Reminder.findById(req.params.id),
      patientUserId,
      "Reminder not found"
    )
    if (record.isCompleted) return res.json({ message: "Already completed", record })
    record.isCompleted = true; record.completedAt = new Date(); record.completedByUserId = user._id; record.completedByRole = "caregiver"
    await record.save()
    res.json({ message: "Reminder marked as completed", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.patch("/caregiver/reminders/:id/reset", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await Reminder.findById(req.params.id),
      patientUserId,
      "Reminder not found"
    )
    record.isCompleted = false; record.completedAt = undefined; record.completedByUserId = undefined; record.completedByRole = undefined
    await record.save()
    res.json({ message: "Reminder reset to pending", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.get("/caregiver/task-templates/today", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    const templates = await TaskTemplate.find({ patientUserId }).sort({ order: 1, time: 1 })
    const todayTemplates = templates.filter((t) => templateAppliesToday(t, now))
    const completions = await Reminder.find({
      patientUserId,
      source: { $regex: /^template:/ },
      time: { $gte: start, $lte: end }
    })
    const doneBySource = new Map(completions.map((r) => [r.source, r]))
    const records = todayTemplates.map((t) => {
      const source = `template:${t._id}`
      const done = doneBySource.get(source)
      return {
        _id: t._id,
        category: t.category,
        content: t.content,
        time: t.time,
        weekdays: t.weekdays,
        note: t.note || "",
        isCompleted: Boolean(done?.isCompleted),
        reminderId: done?._id || null,
        source
      }
    })
    res.json({ records })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.patch("/caregiver/task-templates/:id/complete", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const template = assertPatientOwned(
      await TaskTemplate.findById(req.params.id),
      patientUserId,
      "Template not found"
    )
    if (!templateAppliesToday(template)) {
      return res.status(400).json({ message: "此重複提醒今天不執行" })
    }
    const source = `template:${template._id}`
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    let record = await Reminder.findOne({ patientUserId, source, time: { $gte: start, $lte: end } })
    if (!record) {
      record = await Reminder.create({
        reminderId: createReminderId(),
        patientUserId,
        createdByUserId: template.createdByUserId || user._id,
        createdByRole: "family",
        assignedToRole: "caregiver",
        category: template.category,
        content: template.content,
        contentKey: template.contentKey || "",
        sourceLang: template.sourceLang || "",
        time: todayDateAtHhmm(template.time, now),
        note: template.note || "",
        isCompleted: true,
        completedAt: now,
        completedByUserId: user._id,
        completedByRole: "caregiver",
        source
      })
    } else if (!record.isCompleted) {
      record.isCompleted = true
      record.completedAt = now
      record.completedByUserId = user._id
      record.completedByRole = "caregiver"
      await record.save()
    }
    res.json({ message: "OK", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

function trimCareField(value, max) {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, max)
}

function applyCareDailyObservation(target, body) {
  if (!body || typeof body !== "object") return
  if (Object.prototype.hasOwnProperty.call(body, "sleep")) {
    target.sleep = trimCareField(body.sleep, 120)
  }
  if (Object.prototype.hasOwnProperty.call(body, "bloodPressure")) {
    target.bloodPressure = trimCareField(body.bloodPressure, 32)
  }
  if (Object.prototype.hasOwnProperty.call(body, "heartRate")) {
    target.heartRate = trimCareField(body.heartRate, 16)
  }
  if (Object.prototype.hasOwnProperty.call(body, "temperature")) {
    target.temperature = trimCareField(body.temperature, 16)
  }
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function searchCareCircleForPatient(patientUserId, q, limit = 20) {
  const query = String(q || "").trim()
  if (query.length < 2) return []
  const rx = new RegExp(escapeRegex(query), "i")
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 40)
  const [records, reminders, templates, events] = await Promise.all([
    CareDailyRecord.find({
      patientUserId,
      $or: [
        { content: rx },
        { note: rx },
        { category: rx },
        { caregiverName: rx },
        { sleep: rx },
        { bloodPressure: rx },
        { heartRate: rx },
        { temperature: rx }
      ]
    }).sort({ recordedAt: -1 }).limit(cap).lean(),
    Reminder.find({
      patientUserId,
      $or: [{ content: rx }, { note: rx }, { category: rx }]
    }).sort({ time: -1 }).limit(cap).lean(),
    TaskTemplate.find({
      patientUserId,
      $or: [{ content: rx }, { note: rx }, { category: rx }]
    }).sort({ updatedAt: -1 }).limit(cap).lean(),
    AbnormalEvent.find({
      patientUserId,
      $or: [{ type: rx }, { description: rx }, { location: rx }]
    }).sort({ happenedAt: -1 }).limit(cap).lean()
  ])
  const results = [
    ...records.map((r) => ({
      type: "daily",
      id: String(r._id),
      title: r.content || "",
      snippet: r.note || "",
      at: r.recordedAt || r.createdAt,
      sourceLang: r.sourceLang || "",
      contentKey: r.contentKey || "",
      category: r.category || ""
    })),
    ...reminders.map((r) => ({
      type: "reminder",
      id: String(r._id),
      title: r.content || "",
      snippet: r.note || "",
      at: r.time || r.createdAt,
      sourceLang: r.sourceLang || "",
      contentKey: r.contentKey || "",
      category: r.category || "",
      isCompleted: Boolean(r.isCompleted)
    })),
    ...templates.map((r) => ({
      type: "template",
      id: String(r._id),
      title: r.content || "",
      snippet: r.note || "",
      at: r.updatedAt || r.createdAt,
      sourceLang: r.sourceLang || "",
      contentKey: r.contentKey || "",
      category: r.category || ""
    })),
    ...events.map((e) => ({
      type: "alert",
      id: String(e._id),
      title: e.type || "",
      snippet: e.description || e.location || "",
      at: e.happenedAt || e.createdAt,
      severity: e.severity || "",
      status: e.status || ""
    }))
  ]
  results.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
  return results.slice(0, cap)
}

async function handleCareCircleSearch(user, req, res) {
  const patientUserId = await resolveTargetPatient(user._id)
  const results = await searchCareCircleForPatient(patientUserId, req.query.q, req.query.limit)
  res.json({ q: String(req.query.q || "").trim(), results })
}

async function listCareDailyRecordsForUser(user, req, res) {
  const patientUserId = await resolveTargetPatient(user._id)
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)
  const filter = { patientUserId }
  if (req.query.from || req.query.to) {
    filter.recordedAt = {}
    if (req.query.from) {
      const from = new Date(req.query.from)
      if (!Number.isNaN(from.getTime())) {
        from.setHours(0, 0, 0, 0)
        filter.recordedAt.$gte = from
      }
    }
    if (req.query.to) {
      const to = new Date(req.query.to)
      if (!Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999)
        filter.recordedAt.$lte = to
      }
    }
  }
  const records = await CareDailyRecord.find(filter).sort({ recordedAt: -1, _id: -1 }).limit(limit)
  res.json({ records })
}

app.get("/caregiver/care-daily-records", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "caregiver") return res.status(403).json({ message: "僅看護可讀寫日常紀錄" })
    await listCareDailyRecordsForUser(user, req, res)
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.post("/caregiver/care-daily-records", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "caregiver") return res.status(403).json({ message: "僅看護可新增日常紀錄" })
    const category = String(req.body?.category || "").trim()
    const content = String(req.body?.content || "").trim()
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : ""
    if (!category) return res.status(400).json({ message: "類別為必填" })
    if (!content) return res.status(400).json({ message: "內容為必填" })
    const patientUserId = await resolveTargetPatient(user._id)
    const recordPayload = {
      patientUserId,
      createdByUserId: user._id,
      createdByRole: "caregiver",
      category,
      content,
      note,
      sourceLang: String(req.body?.sourceLang || user.lang || "zh").trim(),
      contentKey: String(req.body?.contentKey || "").trim(),
      caregiverName: user.name || user.email || "",
      recordedAt: req.body?.recordedAt ? new Date(req.body.recordedAt) : new Date(),
      source: "caregiver-app"
    }
    applyCareDailyObservation(recordPayload, req.body)
    const record = await CareDailyRecord.create(recordPayload)
    res.status(201).json({ message: "OK", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.patch("/caregiver/care-daily-records/:id", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "caregiver") return res.status(403).json({ message: "僅看護可修改日常紀錄" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await CareDailyRecord.findById(req.params.id),
      patientUserId,
      "Record not found"
    )
    if (typeof req.body?.category === "string" && req.body.category.trim()) {
      record.category = req.body.category.trim()
    }
    if (typeof req.body?.content === "string" && req.body.content.trim()) {
      record.content = req.body.content.trim()
    }
    if (typeof req.body?.note === "string") {
      record.note = req.body.note.trim()
    }
    if (typeof req.body?.contentKey === "string") {
      record.contentKey = req.body.contentKey.trim()
    }
    if (typeof req.body?.sourceLang === "string" && req.body.sourceLang.trim()) {
      record.sourceLang = req.body.sourceLang.trim()
    }
    applyCareDailyObservation(record, req.body)
    await record.save()
    res.json({ message: "OK", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.delete("/caregiver/care-daily-records/:id", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "caregiver") return res.status(403).json({ message: "僅看護可刪除" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await CareDailyRecord.findById(req.params.id),
      patientUserId,
      "Record not found"
    )
    await CareDailyRecord.findByIdAndDelete(record._id)
    res.json({ message: "OK" })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.get("/family/care-daily-records", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "family") return res.status(403).json({ message: "僅家屬可查看" })
    await listCareDailyRecordsForUser(user, req, res)
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.get("/family/vision/history", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const patientUserId = await resolveTargetPatient(user._id)
  const filter = { patientUserId }
  if (req.query.severity) filter.severity = normalizeSeverity(req.query.severity)
  const limit = normalizeLimit(req.query.limit, 30, 100)
  const records = await VisionDetectionRecord.find(filter).sort({ detectedAt: -1, _id: -1 }).limit(limit)
  res.json({ records })
})

app.get("/family/vision/sessions", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const { from, to } = parseSessionWindow(req.query)
    const sessions = await listCameraSessionsForPatient(patientUserId, from, to)
    res.json({ from: from.toISOString(), to: to.toISOString(), staleAfterMs: CAMERA_HEARTBEAT_STALE_MS, sessions })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.get("/family/care-search", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "family") return res.status(403).json({ message: "僅家屬可搜尋" })
    await handleCareCircleSearch(user, req, res)
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.get("/caregiver/care-search", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "caregiver") return res.status(403).json({ message: "僅看護可搜尋" })
    await handleCareCircleSearch(user, req, res)
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.get("/patient/care-search", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "patient") return res.status(403).json({ message: "僅受顧者可搜尋" })
    await handleCareCircleSearch(user, req, res)
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.get("/patient/care-daily-records", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "patient") return res.status(403).json({ message: "僅受顧者可查看" })
    await listCareDailyRecordsForUser(user, req, res)
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.post("/patient/care-daily-records", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "patient") return res.status(403).json({ message: "僅受顧者可新增心情／日記" })
    const category = String(req.body?.category || "").trim()
    const content = String(req.body?.content || "").trim()
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : ""
    if (!category) return res.status(400).json({ message: "類別為必填" })
    if (!content) return res.status(400).json({ message: "內容為必填" })
    const patientUserId = await resolveTargetPatient(user._id)
    const recordPayload = {
      patientUserId,
      createdByUserId: user._id,
      createdByRole: "patient",
      category,
      content,
      note,
      sourceLang: String(req.body?.sourceLang || user.lang || "zh").trim(),
      contentKey: String(req.body?.contentKey || "").trim(),
      caregiverName: user.name || user.email || "",
      recordedAt: req.body?.recordedAt ? new Date(req.body.recordedAt) : new Date(),
      source: "patient-app"
    }
    applyCareDailyObservation(recordPayload, req.body)
    const record = await CareDailyRecord.create(recordPayload)
    res.status(201).json({ message: "OK", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.patch("/patient/care-daily-records/:id", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "patient") return res.status(403).json({ message: "僅受顧者可修改自己的日記" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await CareDailyRecord.findById(req.params.id),
      patientUserId,
      "Record not found"
    )
    if (record.createdByRole !== "patient" || String(record.createdByUserId) !== String(user._id)) {
      return res.status(403).json({ message: "只能改自己寫的心情／日記" })
    }
    if (typeof req.body?.category === "string" && req.body.category.trim()) {
      record.category = req.body.category.trim()
    }
    if (typeof req.body?.content === "string" && req.body.content.trim()) {
      record.content = req.body.content.trim()
    }
    if (typeof req.body?.note === "string") {
      record.note = req.body.note.trim()
    }
    if (typeof req.body?.contentKey === "string") {
      record.contentKey = req.body.contentKey.trim()
    }
    if (typeof req.body?.sourceLang === "string" && req.body.sourceLang.trim()) {
      record.sourceLang = req.body.sourceLang.trim()
    }
    applyCareDailyObservation(record, req.body)
    await record.save()
    res.json({ message: "OK", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.delete("/patient/care-daily-records/:id", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "patient") return res.status(403).json({ message: "僅受顧者可刪除" })
    const patientUserId = await resolveTargetPatient(user._id)
    const record = assertPatientOwned(
      await CareDailyRecord.findById(req.params.id),
      patientUserId,
      "Record not found"
    )
    if (record.createdByRole !== "patient" || String(record.createdByUserId) !== String(user._id)) {
      return res.status(403).json({ message: "只能刪自己寫的心情／日記" })
    }
    await CareDailyRecord.deleteOne({ _id: record._id })
    res.json({ message: "OK" })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.get("/caregiver/care-logs/history", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
  const records = await CaregiverCareLog.find({ userId: user._id }).sort({ happenedAt: -1, _id: -1 }).limit(limit)
  res.json({ records })
})

app.post("/caregiver/care-logs/sync", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const total = MOCK_CAREGIVER_CARE_LOGS.length
  const cursor = Number.isInteger(user.caregiverCareLogsCursor) ? user.caregiverCareLogsCursor : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_CAREGIVER_CARE_LOGS[sampleIndex]
  const record = await CaregiverCareLog.create({ userId: user._id, logId: sample.logId, tasks: sample.tasks, vitals: sample.vitals, happenedAt: new Date(sample.happenedAt), source: "mock-seed" })
  user.caregiverCareLogsCursor = (sampleIndex + 1) % total
  await user.save()
  res.json({ message: "Caregiver care log mock synced", sampleIndex, nextCursor: user.caregiverCareLogsCursor, record })
})

app.get("/caregiver/language/history", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
  const records = await CaregiverLanguage.find({ userId: user._id }).sort({ happenedAt: -1, _id: -1 }).limit(limit)
  res.json({ records })
})

app.post("/caregiver/language/sync", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const total = MOCK_CAREGIVER_LANGUAGE.length
  const cursor = Number.isInteger(user.caregiverLanguageCursor) ? user.caregiverLanguageCursor : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_CAREGIVER_LANGUAGE[sampleIndex]
  const record = await CaregiverLanguage.create({ userId: user._id, sessionId: sample.sessionId, language: sample.language, voice: sample.voice, translatedAlerts: sample.translatedAlerts, phrases: sample.phrases, happenedAt: new Date(sample.happenedAt), source: "mock-seed" })
  user.caregiverLanguageCursor = (sampleIndex + 1) % total
  await user.save()
  res.json({ message: "Caregiver language mock synced", sampleIndex, nextCursor: user.caregiverLanguageCursor, record })
})

app.get("/caregiver/system/history", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
  const records = await CaregiverSystem.find({ userId: user._id }).sort({ happenedAt: -1, _id: -1 }).limit(limit)
  res.json({ records })
})

app.post("/caregiver/system/sync", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const total = MOCK_CAREGIVER_SYSTEM.length
  const cursor = Number.isInteger(user.caregiverSystemCursor) ? user.caregiverSystemCursor : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_CAREGIVER_SYSTEM[sampleIndex]
  const record = await CaregiverSystem.create({ userId: user._id, systemId: sample.systemId, healthScore: sample.healthScore, networkRows: sample.networkRows, backupRows: sample.backupRows, happenedAt: new Date(sample.happenedAt), source: "mock-seed" })
  user.caregiverSystemCursor = (sampleIndex + 1) % total
  await user.save()
  res.json({ message: "Caregiver system mock synced", sampleIndex, nextCursor: user.caregiverSystemCursor, record })
})

app.get("/caregiver/sos/history", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const patientUserId = await resolveTargetPatient(user._id)
    const filter = { patientUserId }
    if (req.query.status === "active" || req.query.status === "resolved") filter.status = req.query.status
    const limit = normalizeLimit(req.query.limit, 20, 100)
    const records = await SosEvent.find(filter).sort({ triggeredAt: -1, _id: -1 }).limit(limit)
    res.json({ records })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.post("/caregiver/sos/trigger", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  try {
    const patientUserId = await resolveTargetPatient(user._id)
    const patient = await User.findById(patientUserId)
    if (!patient) return res.status(404).json({ message: "Linked patient not found" })

    const { message, locationLabel, latitude, longitude, patientPhone } = req.body || {}
    const lat = Number(latitude)
    const lng = Number(longitude)
    const normalizedPhone = typeof patientPhone === "string" ? patientPhone.trim() : ""
    if (normalizedPhone) {
      user.phone = normalizedPhone
      await user.save()
    }

    const allowedLang = new Set(["zh", "en", "id", "vi", "tl", "th"])
    const sourceLang = allowedLang.has(String(req.body?.sourceLang || "").trim())
      ? String(req.body.sourceLang).trim()
      : (allowedLang.has(user.lang) ? user.lang : "zh")

    const record = await SosEvent.create({
      eventId: createSosEventId(),
      patientUserId: patient._id,
      patientName: patient.name || "Patient",
      patientEmail: patient.email,
      patientPhone: normalizedPhone || user.phone || patient.phone || "",
      message: typeof message === "string" && message.trim() ? message.trim() : "看護端發出 SOS 求救",
      sourceLang,
      audience: "circle",
      locationLabel: typeof locationLabel === "string" && locationLabel.trim() ? locationLabel.trim() : "Unknown location",
      latitude: Number.isFinite(lat) ? lat : undefined,
      longitude: Number.isFinite(lng) ? lng : undefined,
      status: "active",
      triggeredAt: new Date(),
      source: "caregiver-manual-sos"
    })

    notifyCareCircleSos(record).catch(error => console.log("SOS push failed:", error.message))
    res.status(201).json({ message: "SOS 已送出", record })
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Create caregiver SOS failed" })
  }
})

app.patch("/caregiver/sos/:id/location", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  try {
    const patientUserId = await resolveTargetPatient(user._id)
    const { locationLabel, latitude, longitude } = req.body || {}
    const lat = Number(latitude)
    const lng = Number(longitude)
    const record = await SosEvent.findOne({
      $or: [{ _id: req.params.id }, { eventId: req.params.id }],
      patientUserId
    })
    if (!record) return res.status(404).json({ message: "SOS event not found" })

    if (typeof locationLabel === "string" && locationLabel.trim()) record.locationLabel = locationLabel.trim()
    if (Number.isFinite(lat)) record.latitude = lat
    if (Number.isFinite(lng)) record.longitude = lng
    await record.save()
    res.json({ message: "SOS location updated", record })
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Update caregiver SOS location failed" })
  }
})

app.patch("/caregiver/sos/:id/resolve", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    const record = await SosEvent.findOne({
      $or: [{ _id: req.params.id }, { eventId: req.params.id }]
    })
    if (!record) return res.status(404).json({ message: "SOS event not found" })
    const allowed = await isCareCircleMemberForPatient(user, record.patientEmail)
    if (!allowed) return res.status(403).json({ message: "不在該長輩照護圈" })
    if (record.status === "resolved") return res.json({ message: "Already resolved", record })
    if (record.status === "cancelled") return res.status(400).json({ message: "Already cancelled", record })
    record.status = "resolved"
    record.resolvedAt = new Date()
    record.resolvedByEmail = user.email
    if (!record.handlerUserId) {
      record.handlerUserId = user._id
      record.handlerName = user.name || String(user.email || "").split("@")[0] || "看護"
      record.handlerEmail = user.email
      record.handlingAt = record.handlingAt || new Date()
    }
    await record.save()
    // 同長輩其餘進行中一併結束，家屬卡才會被 inbox 清掉
    await supersedeOpenSosForPatient(record.patientUserId, {
      exceptId: record._id,
      reason: "closed_with_sibling_resolve"
    })
    notifyCareCircleSos(record, { resolved: true }).catch(error =>
      console.log("SOS resolved push failed:", error.message)
    )
    res.json({ message: "SOS event resolved", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

/** 看護「立即處理」＝兩步之第一步；家屬卡顯示處理中 */
app.post("/caregiver/sos/:id/claim", async (req, res) => {
  try {
    const decoded = verifyToken(req)
    if (!decoded) return res.status(401).json({ message: "Invalid token" })
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "User not found" })
    if (user.role !== "caregiver") return res.status(403).json({ message: "僅看護可立即處理" })
    const record = await SosEvent.findOne({
      $or: [{ _id: req.params.id }, { eventId: req.params.id }]
    })
    if (!record) return res.status(404).json({ message: "SOS event not found" })
    const allowed = await isCareCircleMemberForPatient(user, record.patientEmail)
    if (!allowed) return res.status(403).json({ message: "不在該長輩照護圈" })
    if (record.status === "resolved" || record.status === "cancelled") {
      return res.status(400).json({ message: "此 SOS 已結束" })
    }
    if (record.status === "handling" && record.handlerUserId && String(record.handlerUserId) !== String(user._id)) {
      return res.json({
        message: "已有看護處理中",
        record
      })
    }
    const displayName = user.name || String(user.email || "").split("@")[0] || "看護"
    record.status = "handling"
    record.handlerUserId = user._id
    record.handlerName = displayName
    record.handlerEmail = user.email
    record.handlingAt = new Date()
    await record.save()
    notifyCareCircleSos(record, { handling: true }).catch(error =>
      console.log("SOS handling push failed:", error.message)
    )
    res.json({ message: "已標記處理中", record })
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message })
  }
})

app.get("/caregiver/check-profile", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.json({ profileCompleted: false })
  res.json({ profileCompleted: Boolean(user.profileCompleted) })
})

app.get("/caregiver/profile", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  res.json({
    name: user.name || "",
    experience: user.experience || "",
    phone: user.phone || "",
    linkedPatientEmail: user.linkedPatientEmail || ""
  })
})

app.post("/caregiver/setup", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const { name, experience } = req.body
  const normalizedName = String(name || "").trim()
  const normalizedExperience = String(experience || "").trim()
  const normalizedPhone = typeof req.body?.phone === "string" ? req.body.phone.trim() : ""
  if (!normalizedName) return res.status(400).json({ message: "姓名為必填" })
  let user = await User.findOne({ email: decoded.email })
  if (!user) user = await User.create({ email: decoded.email, role: "caregiver", profileCompleted: false })
  user.name = normalizedName
  if (normalizedExperience) user.experience = normalizedExperience
  if (normalizedPhone) user.phone = normalizedPhone
  if (!user.role) user.role = "caregiver"
  user.profileCompleted = true
  await user.save()
  res.json({ message: "OK" })
})

// ================= 語音辨識 =================
app.post("/speech-to-text", async (req, res) => {
  const { audioBase64, langCode } = req.body
  const langMap = { zh: "zh-TW", en: "en-US", id: "id-ID", vi: "vi-VN", tl: "fil-PH", th: "th-TH" }
  const languageCode = langMap[langCode] || "zh-TW"
  try {
    const response = await axios.post(
      `https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_STT_API_KEY}`,
      { config: { encoding: "MP3", sampleRateHertz: 16000, languageCode, model: "default", enableAutomaticPunctuation: true }, audio: { content: audioBase64 } }
    )
    const results = response.data.results
    if (results && results.length > 0) {
      res.json({ success: true, text: results[0].alternatives[0].transcript })
    } else {
      res.json({ success: false, text: "" })
    }
  } catch (e) {
    console.log("STT error:", e.response?.data || e.message)
    res.json({ success: false, text: "" })
  }
})

/** 語音辨識後校正：不翻譯、只修口語／同音錯字 */
app.post("/stt-polish", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const text = String(req.body?.text || "").trim()
  const code = TRANSLATE_LANG_MAP[req.body?.lang] ? req.body.lang : "zh"
  if (!text) return res.json({ text: "" })
  const targetName = TRANSLATE_LANG_NAMES[code] || TRANSLATE_LANG_NAMES.zh
  try {
    const prompt =
      `You correct speech-to-text errors for home elder-care in ${targetName}.\n` +
      `Do NOT translate. Do NOT add new meaning. Keep numbers, times, mmHg/mg/ml, and Latin medicine names.\n` +
      `Fix only obvious homophones / missing particles. If already correct, return it unchanged.\n` +
      `Output ONLY the corrected sentence in ${targetName}.\n` +
      `Care glossary:\n${glossaryLines(code)}\n\n` +
      `Speech-to-text:\n${text}`
    const geminiResult = await geminiModel.generateContent(prompt)
    const out = String(geminiResult.response.text() || "").trim()
    if (out && !looksLikeWrongScript(out, code)) {
      return res.json({ text: out, polished: true })
    }
  } catch (e) {
    console.log(`[stt-polish] fail: ${e.message?.slice(0, 60)}`)
  }
  return res.json({ text, polished: false })
})

/** R98：把口述對到既有狀況。不准發明急救步驟。 */
const AID_ROUTE_IDS = [
  "cpr", "choke", "chest", "fast", "foam", "seizure", "sugar",
  "bleed", "burn", "poison", "allergy", "heat", "drown", "fall", "unsure"
]
app.post("/aid-route", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const text = String(req.body?.text || "").trim()
  if (!text) return res.json({ route: "unsure" })
  try {
    const prompt =
      "Classify this caregiver utterance into ONE label only.\n" +
      "Labels: cpr (no response / not breathing / CPR), choke (choking / cannot speak), " +
      "chest (chest pain / tightness / heart attack), " +
      "fast (stroke face/arm/speech), " +
      "foam (foaming at the mouth / frothing), seizure (convulsion / epilepsy), " +
      "sugar (low blood sugar / sweating / shakiness in a diabetic), " +
      "bleed (heavy bleeding), burn (burns), poison (possible poisoning), " +
      "allergy (severe allergy / anaphylaxis), heat (heatstroke), drown (drowning), " +
      "fall (fall / possible fracture), unsure.\n" +
      "The utterance may be in any language. Output ONLY the label.\n" +
      "Do not give medical advice.\n\n" +
      text
    const geminiResult = await geminiModel.generateContent(prompt)
    const out = String(geminiResult.response.text() || "").trim().toLowerCase()
    const route = AID_ROUTE_IDS.find((id) => out.includes(id)) || "unsure"
    return res.json({ route, via: "gemini" })
  } catch (e) {
    console.log(`[aid-route] fail: ${e.message?.slice(0, 60)}`)
    return res.json({ route: "unsure", via: "fail" })
  }
})

// ================= 翻譯 =================
app.post("/translate", async (req, res) => {
  const sourceText = req.body.text
  const targetLang = req.body.targetLang || "zh"
  const messageKey = String(req.body.messageKey || "").trim()
  const code = TRANSLATE_LANG_MAP[targetLang] ? targetLang : "zh"
  console.log(`[translate] to=${code} key=${messageKey || "-"} text="${String(sourceText || "").slice(0, 40)}"`)
  try {
    const translatedText = await translateToLang(sourceText, code, { messageKey })
    const viaDict = Boolean(
      resolveSosDisplayMessage({ message: sourceText, messageKey }, code) ||
      resolveChatPresetMessage(sourceText, messageKey, code)
    )
    return res.json({
      translatedText,
      targetLang: code,
      via: viaDict ? "dict" : "mt",
      translateFailed: !viaDict && String(translatedText || "") === String(sourceText || "").trim()
    })
  } catch (e) {
    return res.json({ translatedText: sourceText, targetLang: code, translateFailed: true })
  }
})

// ================= 危險語句追蹤 =================
app.post("/track-phrase", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const { phrase } = req.body
  try {
    const user = await User.findOne({ email: decoded.email })
    const isDangerous = phrase.includes("SOS") || DANGER_KEYWORDS.some(k => phrase.toLowerCase().includes(k.toLowerCase()))
    if (isDangerous && user) {
      await DangerLog.create({ senderEmail: user.email, senderName: user.name || "", phrase, isDangerous: true })
    }
    res.json({ success: true, isDangerous })
  } catch (e) {
    res.json({ success: false })
  }
})

app.get("/danger-logs", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  try {
    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.json([])
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    let senderEmails = user.role === "patient" ? [user.email] : user.linkedPatientEmail ? [user.linkedPatientEmail, user.email] : []
    const logs = await DangerLog.find({ senderEmail: { $in: senderEmails }, isDangerous: true, timestamp: { $gte: oneWeekAgo } }).sort({ timestamp: -1 }).limit(50)
    res.json(logs.map(log => ({ phrase: log.phrase, senderName: log.senderName, senderEmail: log.senderEmail, time: new Date(log.timestamp).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) })))
  } catch (e) {
    res.json([])
  }
})

// ================= 自訂短句 =================
app.get("/custom-phrases", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  try {
    const phrases = await CustomPhrase.find({ ownerEmail: decoded.email })
    res.json(phrases.map(p => ({ id: p._id, text: p.text })))
  } catch (e) {
    res.json([])
  }
})

app.post("/custom-phrases", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  try {
    const phrase = await CustomPhrase.create({ ownerEmail: decoded.email, text: req.body.text })
    res.json({ success: true, id: phrase._id })
  } catch (e) {
    res.json({ success: false })
  }
})

app.patch("/custom-phrases/:id", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  try {
    const text = String(req.body?.text || "").trim()
    if (!text) return res.json({ success: false })
    await CustomPhrase.findOneAndUpdate(
      { _id: req.params.id, ownerEmail: decoded.email },
      { text }
    )
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false })
  }
})

app.delete("/custom-phrases/:id", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  try {
    await CustomPhrase.findOneAndDelete({ _id: req.params.id, ownerEmail: decoded.email })
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false })
  }
})

// ================= 語言設定 =================
app.patch("/update-lang", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  try {
    await User.updateOne({ email: decoded.email }, { lang: req.body.lang })
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false })
  }
})

// ================= 聊天歷史 =================
app.get("/chat-history", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  try {
    const me = String(decoded.email || "").trim().toLowerCase()
    const partner = String(req.query.partnerEmail || "").trim().toLowerCase()
    if (!partner) return res.json([])
    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const meRe = new RegExp(`^${escapeRegex(me)}$`, "i")
    const partnerRe = new RegExp(`^${escapeRegex(partner)}$`, "i")
    const messages = await ChatMessage.find({
      $or: [
        { senderEmail: meRe, targetEmail: partnerRe },
        { senderEmail: partnerRe, targetEmail: meRe }
      ]
    }).sort({ timestamp: 1 }).limit(50)
    res.json(messages.map((m) => {
      const row = typeof m.toObject === "function" ? m.toObject() : m
      return {
        ...row,
        kind: row.kind || "text",
        audioUrl: row.kind === "voice" ? `/chat-voice/${row._id}` : ""
      }
    }))
  } catch (e) {
    res.json([])
  }
})

app.get("/chat-inbox", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  try {
    const me = String(decoded.email || "").trim().toLowerCase()
    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const meRe = new RegExp(`^${escapeRegex(me)}$`, "i")
    const recent = await ChatMessage.find({
      $or: [{ senderEmail: meRe }, { targetEmail: meRe }]
    }).sort({ timestamp: -1 }).limit(300)

    const lastByPartner = new Map()
    for (const msg of recent) {
      const from = String(msg.senderEmail || "").toLowerCase()
      const to = String(msg.targetEmail || "").toLowerCase()
      const partner = from === me ? to : from
      if (!partner || lastByPartner.has(partner)) continue
      lastByPartner.set(partner, msg)
    }

    const reads = await ChatRead.find({ userEmail: me })
    const readAt = Object.fromEntries(
      reads.map((row) => [String(row.partnerEmail || "").toLowerCase(), row.lastReadAt])
    )

    const threads = []
    for (const [partner, last] of lastByPartner.entries()) {
      const since = readAt[partner] || new Date(0)
      const unread = await ChatMessage.countDocuments({
        senderEmail: new RegExp(`^${escapeRegex(partner)}$`, "i"),
        targetEmail: meRe,
        timestamp: { $gt: since }
      })
      const fromMe = String(last.senderEmail || "").toLowerCase() === me
      const voicePlaceholder = last.kind === "voice" && !String(last.originalText || "").trim()
      threads.push({
        partnerEmail: partner,
        lastKind: last.kind || "text",
        lastSourceLang: last.sourceLang || "",
        lastPhraseKey: last.phraseKey || "",
        lastPreview: last.kind === "voice"
          ? (voicePlaceholder
            ? ""
            : (fromMe
              ? (last.originalText || "")
              : (last.translatedText || last.originalText || "")))
          : (fromMe
            ? (last.originalText || "")
            : (last.translatedText || last.originalText || "")),
        lastAt: last.timestamp,
        unread
      })
    }
    const unreadTotal = threads.reduce((sum, row) => sum + (row.unread || 0), 0)
    res.json({ threads, unreadTotal })
  } catch (e) {
    res.json({ threads: [], unreadTotal: 0 })
  }
})

app.post("/chat-read", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  try {
    const me = String(decoded.email || "").trim().toLowerCase()
    const partner = String(req.body?.partnerEmail || "").trim().toLowerCase()
    if (!partner) return res.json({ success: false })
    await ChatRead.findOneAndUpdate(
      { userEmail: me, partnerEmail: partner },
      { userEmail: me, partnerEmail: partner, lastReadAt: new Date() },
      { upsert: true }
    )
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false })
  }
})

function googleSttConfig(mime, languageCode) {
  const m = String(mime || "").toLowerCase()
  const config = { languageCode, model: "default", enableAutomaticPunctuation: true }
  if (m.includes("webm") || m.includes("opus")) config.encoding = "WEBM_OPUS"
  else if (m.includes("wav") || m.includes("linear")) {
    config.encoding = "LINEAR16"
    config.sampleRateHertz = 16000
  } else {
    config.encoding = "MP3"
    config.sampleRateHertz = 16000
  }
  return config
}

function emitSavedChat(saved, clientMsgId = "") {
  if (!chatIo || !saved) return
  const from = String(saved.senderEmail || "").toLowerCase()
  const toEmail = String(saved.targetEmail || "").toLowerCase()
  const payload = {
    _id: String(saved._id),
    senderEmail: from,
    targetEmail: toEmail,
    originalText: saved.originalText,
    translatedText: saved.translatedText,
    sourceLang: saved.sourceLang,
    targetLang: saved.targetLang,
    phraseKey: saved.phraseKey || "",
    kind: saved.kind || "text",
    audioUrl: saved.kind === "voice" ? `/chat-voice/${saved._id}` : "",
    clientMsgId: clientMsgId || "",
    timestamp: saved.timestamp
  }
  chatIo.to(from).emit("new_message", { ...payload, displayText: saved.originalText })
  chatIo.to(toEmail).emit("new_message", { ...payload, displayText: saved.translatedText || saved.originalText })
}

app.post("/chat/voice", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const from = String(decoded.email || "").trim().toLowerCase()
  const toEmail = String(req.body?.targetEmail || "").trim().toLowerCase()
  const audioBase64 = String(req.body?.audioBase64 || "").replace(/^data:[^;]+;base64,/, "")
  const mimeType = String(req.body?.mimeType || "audio/webm")
  const sourceLang = String(req.body?.sourceLang || "zh")
  const clientMsgId = String(req.body?.clientMsgId || "")
  if (!from || !toEmail || !audioBase64) return res.status(400).json({ message: "缺少語音" })
  let buffer
  try {
    buffer = Buffer.from(audioBase64, "base64")
  } catch {
    return res.status(400).json({ message: "語音格式錯誤" })
  }
  if (!buffer.length || buffer.length > 12 * 1024 * 1024) {
    return res.status(400).json({ message: "語音太短或太大" })
  }
  const stored = await objectStore.putObject({
    patientUserId: from.replace(/[^a-z0-9]/g, "_"),
    mediaType: "clip",
    contentType: mimeType,
    buffer
  })
  const langMap = { zh: "zh-TW", en: "en-US", id: "id-ID", vi: "vi-VN", tl: "fil-PH", th: "th-TH" }
  const languageCode = langMap[sourceLang] || "zh-TW"
  let original = ""
  try {
    const response = await axios.post(
      `https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_STT_API_KEY}`,
      { config: googleSttConfig(mimeType, languageCode), audio: { content: audioBase64 } }
    )
    original = String(response.data?.results?.[0]?.alternatives?.[0]?.transcript || "").trim()
  } catch (e) {
    console.log("voice STT error:", e.response?.data || e.message)
  }
  let targetLang = "zh"
  let translatedText = original
  try {
    const targetUser = await User.findOne({ email: new RegExp(`^${toEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })
    targetLang = targetUser?.lang || "zh"
    if (original) translatedText = await translateToLang(original, targetLang)
  } catch (e) {
    console.log("voice translate fail:", e.message)
  }
  const saved = await ChatMessage.create({
    senderEmail: from,
    targetEmail: toEmail,
    originalText: original || "",
    translatedText: translatedText || original || "",
    sourceLang,
    targetLang,
    kind: "voice",
    audioObjectKey: stored.objectKey,
    audioContentType: mimeType,
    timestamp: new Date()
  })
  emitSavedChat(saved, clientMsgId)
  notifyChatPush({
    from,
    toEmail,
    preview: saved.translatedText || saved.originalText,
    targetLang
  }).catch((err) => console.log("chat push skipped:", err.message))
  res.status(201).json({
    message: {
      ...saved.toObject(),
      kind: "voice",
      audioUrl: `/chat-voice/${saved._id}`,
      clientMsgId
    }
  })
})

app.get("/chat-voice/:id", async (req, res) => {
  const raw = req.headers.authorization?.split(" ")[1] || String(req.query.access_token || "")
  let decoded = null
  try { decoded = raw ? jwt.verify(raw, process.env.JWT_SECRET) : null } catch { decoded = null }
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const me = String(decoded.email || "").trim().toLowerCase()
  const row = await ChatMessage.findById(req.params.id)
  if (!row || row.kind !== "voice" || !row.audioObjectKey) return res.status(404).json({ message: "Not found" })
  const from = String(row.senderEmail || "").toLowerCase()
  const to = String(row.targetEmail || "").toLowerCase()
  if (me !== from && me !== to) return res.status(403).json({ message: "Forbidden" })
  const buffer = await objectStore.getObjectBuffer(row.audioObjectKey)
  if (!buffer) return res.status(404).json({ message: "Missing audio" })
  res.setHeader("Content-Type", row.audioContentType || "audio/webm")
  res.send(buffer)
})

// ================= Socket.io 即時聊天 =================
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: "*" } })
chatIo = io

io.on("connection", (socket) => {
  socket.on("join_room", ({ email }) => {
    const room = String(email || "").trim().toLowerCase()
    if (room) {
      socket.join(room)
      socket.data.careEmail = room
    }
  })
  socket.on("chat_focus", ({ email, partnerEmail }) => {
    const me = String(email || socket.data.careEmail || "").trim().toLowerCase()
    const partner = String(partnerEmail || "").trim().toLowerCase()
    if (me && partner) chatFocusByEmail.set(me, partner)
  })
  socket.on("chat_blur", ({ email }) => {
    const me = String(email || socket.data.careEmail || "").trim().toLowerCase()
    if (me) chatFocusByEmail.delete(me)
  })
  socket.on("disconnect", () => {
    const me = String(socket.data.careEmail || "").trim().toLowerCase()
    if (me) chatFocusByEmail.delete(me)
  })

  socket.on("send_message", async ({ senderEmail, targetEmail, text, sourceLang, phraseKey, clientMsgId }) => {
    const from = String(senderEmail || "").trim().toLowerCase()
    const toEmail = String(targetEmail || "").trim().toLowerCase()
    const original = String(text || "").trim()
    if (!from || !toEmail || !original) return

    let targetLang = "zh"
    try {
      const targetUser = await User.findOne({ email: new RegExp(`^${toEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })
      targetLang = targetUser?.lang || "zh"
      const translatedText = await translateToLang(original, targetLang, { messageKey: phraseKey || "" })
      const saved = await ChatMessage.create({
        senderEmail: from,
        targetEmail: toEmail,
        originalText: original,
        translatedText,
        sourceLang: sourceLang || "",
        targetLang,
        phraseKey: String(phraseKey || "").trim(),
        timestamp: new Date()
      })
      const message = {
        senderEmail: from,
        targetEmail: toEmail,
        originalText: original,
        translatedText,
        sourceLang: sourceLang || "",
        targetLang,
        phraseKey: String(phraseKey || "").trim(),
        clientMsgId: clientMsgId || "",
        timestamp: saved.timestamp || new Date().toISOString()
      }
      io.to(from).emit("new_message", { ...message, displayText: original })
      io.to(toEmail).emit("new_message", { ...message, displayText: translatedText })
      notifyChatPush({
        from,
        toEmail,
        preview: translatedText || original,
        targetLang
      }).catch((err) => console.log("chat push skipped:", err.message))
    } catch (e) {
      console.log("message error (fallback to original):", e.message)
      let timestamp = new Date()
      try {
        const saved = await ChatMessage.create({
          senderEmail: from,
          targetEmail: toEmail,
          originalText: original,
          translatedText: original,
          sourceLang,
          targetLang,
          phraseKey: String(phraseKey || "").trim(),
          timestamp
        })
        timestamp = saved.timestamp || timestamp
      } catch (saveErr) {
        console.log("chat save fallback failed:", saveErr.message)
      }
      const message = {
        senderEmail: from,
        targetEmail: toEmail,
        originalText: original,
        translatedText: original,
        sourceLang,
        targetLang,
        phraseKey: String(phraseKey || "").trim(),
        clientMsgId: clientMsgId || "",
        timestamp,
        translateFailed: true
      }
      io.to(from).emit("new_message", { ...message, displayText: original })
      io.to(toEmail).emit("new_message", { ...message, displayText: original })
    }
  })
})

// ================= 啟動 =================
const PORT = Number(process.env.PORT) || 5000
server.listen(PORT, async () => {
  console.log(`Backend running on http://localhost:${PORT}`)
  try {
    await mobileAuthApi.ensureTestAccounts()
  } catch (err) {
    console.log("ensureTestAccounts failed:", err.message)
  }
  try {
    await purgeExpiredEvidence()
  } catch (err) {
    console.log("evidence purge failed:", err.message)
  }
  setInterval(() => {
    purgeExpiredEvidence().catch((err) => console.log("evidence purge failed:", err.message))
  }, 6 * 60 * 60 * 1000)
})
