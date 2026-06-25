require("dotenv").config()

const express = require("express")
const cors = require("cors")
const passport = require("passport")
const jwt = require("jsonwebtoken")
const mongoose = require("mongoose")
const http = require("http")
const fs = require("fs")
const { Server } = require("socket.io")
const axios = require("axios")
const { cert, getApps, initializeApp } = require("firebase-admin/app")
const { getMessaging } = require("firebase-admin/messaging")
const { translate } = require("google-translate-api-x")
const { GoogleGenerativeAI } = require("@google/generative-ai")

require("./googleAuth")

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

app.use(express.json())
app.use(passport.initialize())

// ================= Schemas =================
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  name: String,
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
  profileCompleted: { type: Boolean, default: false }
}, { timestamps: true })

const User = mongoose.model("User", userSchema)

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
  locationLabel: String,
  latitude: Number,
  longitude: Number,
  status: { type: String, enum: ["active", "resolved"], default: "active", index: true },
  triggeredAt: { type: Date, default: Date.now, index: true },
  resolvedAt: Date,
  resolvedByEmail: String,
  source: { type: String, default: "manual-sos" }
}, { timestamps: true })

const SosEvent = mongoose.model("SosEvent", sosEventSchema)

const abnormalEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  patientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  reporterUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  reporterRole: { type: String, enum: ["patient", "family", "caregiver", "system"], default: "caregiver" },
  type: { type: String, required: true },
  severity: { type: String, enum: ["Low", "Medium", "High"], default: "Medium", index: true },
  status: { type: String, enum: ["Pending", "Processing", "Done"], default: "Pending", index: true },
  location: String,
  description: String,
  happenedAt: { type: Date, default: Date.now, index: true },
  source: { type: String, default: "manual-report" }
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
  source: { type: String, default: "vision-mock" }
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

const AbnormalEvent = mongoose.model("AbnormalEvent", abnormalEventSchema)
const Reminder = mongoose.model("Reminder", reminderSchema)
const BloodPressureRecord = mongoose.model("BloodPressureRecord", bloodPressureRecordSchema)
const VisionDetectionRecord = mongoose.model("VisionDetectionRecord", visionDetectionRecordSchema)
const FamilyCareRecord = mongoose.model("FamilyCareRecord", familyCareRecordSchema)
const FamilyEvent = mongoose.model("FamilyEvent", familyEventSchema)
const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema)
const DangerLog = mongoose.model("DangerLog", dangerLogSchema)
const CustomPhrase = mongoose.model("CustomPhrase", customPhraseSchema)

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

// ================= Google OAuth =================
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }))

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { session: false }),
  async (req, res) => {
    try {
      if (!req.user) return res.redirect(frontendWebUrl)
      const { email, name } = req.user
      let user = await User.findOne({ email })
      if (!user) {
        user = await User.create({ email, name, role: null, profileCompleted: false })
      }
      const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" })
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
  const linkedPatientEmail = normalizeLinkedPatientEmail(user.linkedPatientEmail)
  if (!linkedPatientEmail) { const e = new Error("尚未連接長輩帳號"); e.statusCode = 400; throw e }
  const patient = await User.findOne({ email: linkedPatientEmail, role: "patient" })
  if (!patient) { const e = new Error("找不到已連接的長輩帳號"); e.statusCode = 404; throw e }
  return patient._id
}

function verifyToken(req) {
  const token = req.headers.authorization?.split(" ")[1]
  if (!token) return null
  try { return jwt.verify(token, process.env.JWT_SECRET) } catch { return null }
}

function normalizeLimit(value, fallback = 10, max = 50) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, 1), max)
}

function createSosEventId() { return `SOS-${Date.now()}-${Math.floor(100 + Math.random() * 900)}` }
function createAbnormalEventId() { return `AB-${Date.now()}-${Math.floor(100 + Math.random() * 900)}` }
function createReminderId() { return `RM-${Date.now()}-${Math.floor(100 + Math.random() * 900)}` }

async function notifyFamilySos(record) {
  if (!getApps().length || !record) return

  const patientEmail = String(record.patientEmail || "").trim().toLowerCase()
  const linkedFamilies = patientEmail
    ? await User.find({ role: "family", linkedPatientEmail: patientEmail })
    : []
  const familyUsers = linkedFamilies.length
    ? linkedFamilies
    : await User.find({ role: "family" })
  const tokens = familyUsers
    .flatMap(user => Array.isArray(user.pushTokens) ? user.pushTokens : [])
    .map(entry => entry?.token)
    .filter(Boolean)

  if (!tokens.length) return

  const location = String(record.locationLabel || "").trim()
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: "緊急 SOS 求救",
      body: `${record.patientName || "受顧者"} 發出緊急求救${location ? `，位置：${location}` : ""}`
    },
    data: {
      type: "sos",
      eventId: String(record.eventId || ""),
      recordId: String(record._id || ""),
      patientName: String(record.patientName || ""),
      patientPhone: String(record.patientPhone || ""),
      locationLabel: String(record.locationLabel || ""),
      triggeredAt: record.triggeredAt ? new Date(record.triggeredAt).toISOString() : ""
    },
    android: {
      priority: "high",
      notification: {
        sound: "default",
        priority: "max",
        visibility: "public",
        defaultVibrateTimings: true
      }
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

function normalizeSeverity(value) {
  if (value === "High" || value === "Medium" || value === "Low") return value
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
  if (text.includes("OFF_BED") || text.includes("BED EXIT")) return "OFF_BED"
  if (text.includes("SEDENTARY")) return "SEDENTARY"
  return String(value).trim()
}

function getVisionSeverityByAction(action) {
  if (action === "DANGER: FALL" || action === "CRITICAL SOS: WAVING") return "High"
  if (action === "OFF_BED") return "Medium"
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
  if (action === "SEDENTARY") return "sedentary"
  return "abnormal"
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

async function createVisionAlertIfNeeded({ patientUserId, reporterUserId, reporterRole, detectionRecord }) {
  if (!detectionRecord || detectionRecord.severity !== "High") return null
  return AbnormalEvent.create({
    eventId: createAbnormalEventId(), patientUserId, reporterUserId, reporterRole,
    type: toVisionAlertType(detectionRecord.action), severity: detectionRecord.severity,
    status: "Pending", location: detectionRecord.location || "",
    description: detectionRecord.description || (detectionRecord.action + " requires attention"),
    happenedAt: detectionRecord.detectedAt || new Date(), source: detectionRecord.source || "vision-model"
  })
}

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
    if (!rawEmail) return res.status(400).json({ message: "email is required" })
    const email = rawEmail.toLowerCase()
    const role = normalizeRoleForMobile(rawRole)
    const linkedResult = await validateLinkedPatientEmailForRole(role, rawLinkedPatientEmail, email)
    if (linkedResult?.error) return res.status(400).json({ message: linkedResult.error })
    let user = await User.findOne({ email })
    if (!user) {
      user = await User.create({ email, name: rawName || email.split("@")[0], role, linkedPatientEmail: linkedResult, profileCompleted: true })
    } else {
      user.role = role
      user.linkedPatientEmail = linkedResult
      if (rawName) user.name = rawName
      if (!user.name) user.name = email.split("@")[0]
      user.profileCompleted = true
      await user.save()
    }
    const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" })
    return res.json({ token, role: user.role, user: { email: user.email, name: user.name || "", role: user.role, linkedPatientEmail: user.linkedPatientEmail || "" } })
  } catch (err) {
    return res.status(500).json({ message: "mobile dev login failed" })
  }
})

app.post("/notifications/register", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  if (user.role !== "family") return res.status(403).json({ message: "Only family devices receive SOS push notifications" })

  const pushToken = typeof req.body?.token === "string" ? req.body.token.trim() : ""
  if (!pushToken) return res.status(400).json({ message: "Push token is required" })
  const platform = typeof req.body?.platform === "string" ? req.body.platform.trim() : ""
  user.pushTokens = (user.pushTokens || []).filter(entry => entry?.token !== pushToken)
  user.pushTokens.push({ token: pushToken, platform, updatedAt: new Date() })
  await user.save()
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
  res.json({ name: user.name, birthDate: user.birthDate, age: user.age, idNumber: user.idNumber, gender: user.gender, phone: user.phone })
})

app.post("/patient/setup", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const { name, birthDate, age, idNumber, gender, phone } = req.body
  const user = await User.findOne({ email: decoded.email })
  user.name = name; user.birthDate = birthDate; user.age = age; user.idNumber = idNumber; user.gender = gender
  user.phone = typeof phone === "string" ? phone.trim() : user.phone
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
  const { message, locationLabel, latitude, longitude, patientPhone } = req.body || {}
  const lat = Number(latitude), lng = Number(longitude)
  const normalizedPhone = typeof patientPhone === "string" ? patientPhone.trim() : ""
  if (normalizedPhone) { user.phone = normalizedPhone; await user.save() }
  const record = await SosEvent.create({
    eventId: createSosEventId(), patientUserId: user._id, patientName: user.name || "Patient",
    patientEmail: user.email, patientPhone: normalizedPhone || user.phone || "",
    message: typeof message === "string" && message.trim() ? message.trim() : "緊急求救 SOS",
    locationLabel: typeof locationLabel === "string" && locationLabel.trim() ? locationLabel.trim() : "Unknown location",
    latitude: Number.isFinite(lat) ? lat : undefined, longitude: Number.isFinite(lng) ? lng : undefined,
    status: "active", triggeredAt: new Date(), source: "patient-manual-sos"
  })
  notifyFamilySos(record).catch(error => console.log("SOS push failed:", error.message))
  res.status(201).json({ message: "SOS 已發送", record })
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

  if (typeof locationLabel === "string" && locationLabel.trim()) record.locationLabel = locationLabel.trim()
  if (Number.isFinite(lat)) record.latitude = lat
  if (Number.isFinite(lng)) record.longitude = lng
  await record.save()
  res.json({ message: "SOS location updated", record })
})

// ================= FAMILY =================
app.get("/family/alerts/history", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const filter = {}
  if (req.query.severity) filter.severity = normalizeSeverity(req.query.severity)
  if (req.query.status) filter.status = normalizeAlertStatus(req.query.status)
  const limit = normalizeLimit(req.query.limit, 20, 100)
  const records = await AbnormalEvent.find(filter).sort({ happenedAt: -1, _id: -1 }).limit(limit)
  res.json({ records })
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
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const record = await AbnormalEvent.findById(req.params.id)
  if (!record) return res.status(404).json({ message: "Alert not found" })
  record.status = normalizeAlertStatus(req.body?.status)
  await record.save()
  res.json({ message: "OK", record })
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
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const filter = {}
  if (req.query.status === "active" || req.query.status === "resolved") filter.status = req.query.status
  const limit = normalizeLimit(req.query.limit, 20, 100)
  const records = await SosEvent.find(filter).sort({ triggeredAt: -1, _id: -1 }).limit(limit)
  res.json({ records })
})

app.patch("/family/sos/:id/resolve", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  const record = await SosEvent.findById(req.params.id)
  if (!record) return res.status(404).json({ message: "SOS event not found" })
  if (record.status === "resolved") return res.json({ message: "Already resolved", record })
  record.status = "resolved"; record.resolvedAt = new Date(); record.resolvedByEmail = user.email
  await record.save()
  res.json({ message: "OK", record })
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
  user.name = name; user.phone = phone; user.profileCompleted = true
  await user.save()
  res.json({ message: "OK" })
})

app.get("/family/reminders", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const filter = { assignedToRole: "caregiver" }
  if (req.query.completed === "true") filter.isCompleted = true
  if (req.query.completed === "false") filter.isCompleted = false
  const limit = normalizeLimit(req.query.limit, 30, 100)
  const records = await Reminder.find(filter).sort({ isCompleted: 1, time: 1, _id: -1 }).limit(limit)
  res.json({ records })
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
  const record = await Reminder.create({ reminderId: createReminderId(), patientUserId, createdByUserId: user._id, createdByRole: "family", assignedToRole: "caregiver", category: String(category).trim(), content: String(content).trim(), time: parsedTime, note: typeof note === "string" ? note.trim() : "", source: "family-manual" })
  res.status(201).json({ message: "OK", record })
})

app.patch("/family/reminders/:id", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const record = await Reminder.findById(req.params.id)
  if (!record) return res.status(404).json({ message: "Reminder not found" })
  const { category, content, time, note } = req.body || {}
  if (typeof category === "string" && category.trim()) record.category = category.trim()
  if (typeof content === "string" && content.trim()) record.content = content.trim()
  if (typeof note === "string") record.note = note.trim()
  if (time) {
    const parsedTime = new Date(time)
    if (Number.isNaN(parsedTime.getTime())) return res.status(400).json({ message: "時間格式無效" })
    record.time = parsedTime
  }
  await record.save()
  res.json({ message: "OK", record })
})

app.delete("/family/reminders/:id", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  await Reminder.findByIdAndDelete(req.params.id)
  res.json({ message: "OK" })
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

app.get("/caregiver/alerts/history", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const filter = {}
  if (req.query.severity) filter.severity = normalizeSeverity(req.query.severity)
  if (req.query.status) filter.status = normalizeAlertStatus(req.query.status)
  const limit = normalizeLimit(req.query.limit, 20, 100)
  const records = await AbnormalEvent.find(filter).sort({ happenedAt: -1, _id: -1 }).limit(limit)
  res.json({ records })
})

app.post("/caregiver/alerts", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const { type, severity, status, location, description, happenedAt } = req.body || {}
  if (!type || !String(type).trim()) return res.status(400).json({ message: "類型為必填" })
  const patientUserId = await resolveTargetPatient(user._id)
  const record = await AbnormalEvent.create({ eventId: createAbnormalEventId(), patientUserId, reporterUserId: user._id, reporterRole: "caregiver", type: String(type).trim(), severity: normalizeSeverity(severity), status: normalizeAlertStatus(status), location: typeof location === "string" ? location.trim() : "", description: typeof description === "string" ? description.trim() : "", happenedAt: happenedAt ? new Date(happenedAt) : new Date(), source: "caregiver-manual" })
  res.status(201).json({ message: "OK", record })
})

app.patch("/caregiver/alerts/:id/status", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const record = await AbnormalEvent.findById(req.params.id)
  if (!record) return res.status(404).json({ message: "Alert not found" })
  record.status = normalizeAlertStatus(req.body?.status)
  await record.save()
  res.json({ message: "OK", record })
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
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const filter = { assignedToRole: "caregiver" }
  if (req.query.completed === "true") filter.isCompleted = true
  if (req.query.completed === "false") filter.isCompleted = false
  const limit = normalizeLimit(req.query.limit, 30, 100)
  const records = await Reminder.find(filter).sort({ isCompleted: 1, time: 1, _id: -1 }).limit(limit)
  res.json({ records })
})

app.patch("/caregiver/reminders/:id/complete", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const record = await Reminder.findById(req.params.id)
  if (!record) return res.status(404).json({ message: "Reminder not found" })
  if (record.isCompleted) return res.json({ message: "Already completed", record })
  record.isCompleted = true; record.completedAt = new Date(); record.completedByUserId = user._id; record.completedByRole = "caregiver"
  await record.save()
  res.json({ message: "Reminder marked as completed", record })
})

app.patch("/caregiver/reminders/:id/reset", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const record = await Reminder.findById(req.params.id)
  if (!record) return res.status(404).json({ message: "Reminder not found" })
  record.isCompleted = false; record.completedAt = undefined; record.completedByUserId = undefined; record.completedByRole = undefined
  await record.save()
  res.json({ message: "Reminder reset to pending", record })
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
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const filter = {}
  if (req.query.status === "active" || req.query.status === "resolved") filter.status = req.query.status
  const limit = normalizeLimit(req.query.limit, 20, 100)
  const records = await SosEvent.find(filter).sort({ triggeredAt: -1, _id: -1 }).limit(limit)
  res.json({ records })
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

    const record = await SosEvent.create({
      eventId: createSosEventId(),
      patientUserId: patient._id,
      patientName: patient.name || "Patient",
      patientEmail: patient.email,
      patientPhone: normalizedPhone || user.phone || patient.phone || "",
      message: typeof message === "string" && message.trim() ? message.trim() : "看護端發出 SOS 求救",
      locationLabel: typeof locationLabel === "string" && locationLabel.trim() ? locationLabel.trim() : "Unknown location",
      latitude: Number.isFinite(lat) ? lat : undefined,
      longitude: Number.isFinite(lng) ? lng : undefined,
      status: "active",
      triggeredAt: new Date(),
      source: "caregiver-manual-sos"
    })

    notifyFamilySos(record).catch(error => console.log("SOS push failed:", error.message))
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
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })
  const record = await SosEvent.findById(req.params.id)
  if (!record) return res.status(404).json({ message: "SOS event not found" })
  if (record.status === "resolved") return res.json({ message: "Already resolved", record })
  record.status = "resolved"; record.resolvedAt = new Date(); record.resolvedByEmail = user.email
  await record.save()
  res.json({ message: "SOS event resolved", record })
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
  res.json({ name: user.name || "", experience: user.experience || "", linkedPatientEmail: user.linkedPatientEmail || "" })
})

app.post("/caregiver/setup", async (req, res) => {
  const decoded = verifyToken(req)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })
  const { name, experience } = req.body
  const normalizedName = String(name || "").trim()
  const normalizedExperience = String(experience || "").trim()
  if (!normalizedName || !normalizedExperience) return res.status(400).json({ message: "姓名與經歷為必填" })
  let user = await User.findOne({ email: decoded.email })
  if (!user) user = await User.create({ email: decoded.email, role: "caregiver", profileCompleted: false })
  user.name = normalizedName; user.experience = normalizedExperience
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

// ================= 翻譯 =================
app.post("/translate", async (req, res) => {
  const sourceText = req.body.text
  console.log(`[translate] text="${sourceText?.slice(0, 40)}"`)

  // 優先：Gemini 翻譯成繁體中文並柔化語氣
  try {
    const prompt = `請將以下照護用語翻譯成繁體中文，並讓語氣更親切溫和，適合對長輩說話。只需要回傳繁體中文結果，不要任何解釋或前綴。\n\n原句：${sourceText}`
    const geminiResult = await geminiModel.generateContent(prompt)
    const resultText = geminiResult.response.text().trim()
    console.log(`[translate] gemini OK: "${resultText?.slice(0, 40)}"`)
    return res.json({ translatedText: resultText })
  } catch (geminiErr) {
    console.log(`[translate] Gemini 失敗 (${geminiErr.message?.slice(0, 60)})，改用翻譯庫備援`)
  }

  // 備援：google-translate-api-x 直接翻成繁體中文
  try {
    const result = await translate(sourceText, { to: "zh-TW", forceBatch: false })
    console.log(`[translate] translate() OK: "${result.text?.slice(0, 40)}"`)
    return res.json({ translatedText: result.text })
  } catch (translateErr) {
    console.log(`[translate] 備援也失敗: ${translateErr.message}`)
    return res.json({ translatedText: sourceText })
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
    const user = await User.findOne({ email: decoded.email })
    let ownerEmails = [user.email]
    if (user.role === "caregiver" && user.linkedPatientEmail) {
      const patient = await User.findOne({ email: user.linkedPatientEmail, role: "patient" })
      if (patient) {
        const familyUsers = await User.find({ linkedPatientEmail: patient.email, role: "family" })
        if (familyUsers.length > 0) ownerEmails = familyUsers.map(f => f.email)
      }
    }
    const phrases = await CustomPhrase.find({ ownerEmail: { $in: ownerEmails } })
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
    const { partnerEmail } = req.query
    const myEmail = decoded.email
    const messages = await ChatMessage.find({ $or: [{ senderEmail: myEmail, targetEmail: partnerEmail }, { senderEmail: partnerEmail, targetEmail: myEmail }] }).sort({ timestamp: 1 }).limit(50)
    res.json(messages)
  } catch (e) {
    res.json([])
  }
})

// ================= Socket.io 即時聊天 =================
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: "*" } })

io.on("connection", (socket) => {
  socket.on("join_room", ({ email }) => {
    socket.join(email)
  })

  socket.on("send_message", async ({ senderEmail, targetEmail, text, sourceLang }) => {
    try {
      const targetUser = await User.findOne({ email: targetEmail })
      const targetLang = targetUser?.lang || "zh"
      const langMap = { zh: "zh-TW", en: "en", id: "id", vi: "vi", tl: "tl", th: "th" }
      const to = langMap[targetLang] || "zh-TW"
      const result = await translate(text, { to, forceBatch: false })
      const translatedText = result.text
      const message = { senderEmail, originalText: text, translatedText, sourceLang, targetLang, timestamp: new Date().toISOString() }
      io.to(senderEmail).emit("new_message", { ...message, displayText: text })
      io.to(targetEmail).emit("new_message", { ...message, displayText: translatedText })
      await ChatMessage.create({ senderEmail, targetEmail, originalText: text, translatedText, sourceLang, targetLang })
    } catch (e) {
      console.log("message error:", e.message)
    }
  })
})

// ================= 啟動 =================
const PORT = Number(process.env.PORT) || 5000
server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
