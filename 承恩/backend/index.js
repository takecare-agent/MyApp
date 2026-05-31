require("dotenv").config()

const express = require("express")
const cors = require("cors")
const passport = require("passport")
const jwt = require("jsonwebtoken")
const mongoose = require("mongoose")

require("./googleAuth")

const app = express()

console.log("🔥 ACTIVE BACKEND FILE LOADED")

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
  "ionic://localhost"
]

const allowedOrigins = new Set(defaultAllowedOrigins)
for (const value of (process.env.CORS_ORIGINS || "").split(",")) {
  const origin = value.trim()
  if (origin) allowedOrigins.add(origin)
}

const frontendWebUrl = (process.env.FRONTEND_WEB_URL || "http://localhost:5173").trim()
const oauthSuccessBaseUrl = (
  process.env.OAUTH_SUCCESS_URL || `${frontendWebUrl}/google-success`
).trim()

function buildOauthSuccessUrl(token) {
  const separator = oauthSuccessBaseUrl.includes("?") ? "&" : "?"
  return `${oauthSuccessBaseUrl}${separator}token=${encodeURIComponent(token)}`
}

// ================= MongoDB =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log("❌ MongoDB error:", err.message))

// ================= Middleware =================
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true)
      return
    }
    callback(new Error(`CORS blocked for origin: ${origin}`))
  },
  credentials: true
}))

app.use(express.json())
app.use(passport.initialize())

// ================= User Schema =================
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
    required: true
  },

  name: String,

  role: {
    type: String,
    enum: ["patient", "family", "caregiver"],
    default: null
  },

  // ===== 受顧者資料 =====
  birthDate: String,
  age: Number,
  idNumber: String,
  gender: String,

  // ===== 家屬資料 =====
  phone: String,

  // ===== 看護資料 =====
  experience: String,

  wearableSampleCursor: {
    type: Number,
    default: 0
  },

  bloodPressureCursor: {
    type: Number,
    default: 0
  },

  visionSampleCursor: {
    type: Number,
    default: 0
  },

  familyAlertsCursor: {
    type: Number,
    default: 0
  },

  familyCareRecordsCursor: {
    type: Number,
    default: 0
  },

  familyEventsCursor: {
    type: Number,
    default: 0
  },

  caregiverAlertsCursor: {
    type: Number,
    default: 0
  },

  caregiverCareLogsCursor: {
    type: Number,
    default: 0
  },

  caregiverLanguageCursor: {
    type: Number,
    default: 0
  },

  caregiverSystemCursor: {
    type: Number,
    default: 0
  },

  profileCompleted: {
    type: Boolean,
    default: false
  }

}, { timestamps: true })

const User = mongoose.model("User", userSchema)

const wearableRecordSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  heartRate: {
    type: Number,
    required: true
  },
  spo2: {
    type: Number,
    required: true
  },
  steps: {
    type: Number,
    required: true
  },
  note: String,
  isAbnormal: {
    type: Boolean,
    default: false
  },
  source: {
    type: String,
    default: "mock-seed"
  },
  recordedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true })

const WearableRecord = mongoose.model("WearableRecord", wearableRecordSchema)

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

const MOCK_BP_SAMPLES = [
  { sys: 128, dia: 82, pulse: 76 },
  { sys: 118, dia: 76, pulse: 73 },
  { sys: 142, dia: 92, pulse: 84 },
  { sys: 108, dia: 68, pulse: 67 },
  { sys: 135, dia: 86, pulse: 79 },
  { sys: 146, dia: 95, pulse: 88 },
  { sys: 124, dia: 80, pulse: 74 },
  { sys: 98, dia: 62, pulse: 64 }
]

const MOCK_VISION_SAMPLES = [
  {
    action: "DANGER: FALL",
    severity: "高",
    confidence: 0.96,
    location: "客廳",
    description: "模型判定疑似跌倒，建議立即確認安全狀況。",
    frameTag: "vision-fall-01"
  },
  {
    action: "CRITICAL SOS: WAVING",
    severity: "高",
    confidence: 0.94,
    location: "臥室",
    description: "模型判定疑似呼救揮手手勢，需優先回應。",
    frameTag: "vision-sos-01"
  },
  {
    action: "OFF_BED",
    severity: "中",
    confidence: 0.88,
    location: "床邊",
    description: "模型判定離床事件，請確認是否需要協助。",
    frameTag: "vision-off-bed-01"
  },
  {
    action: "SEDENTARY",
    severity: "低",
    confidence: 0.83,
    location: "客廳",
    description: "模型判定久坐不動，建議進行活動提醒。",
    frameTag: "vision-sedentary-01"
  }
]

const familyAlertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  alertId: String,
  type: String,
  level: String,
  happenedAt: Date,
  location: String,
  status: String,
  source: {
    type: String,
    default: "mock-seed"
  }
}, { timestamps: true })

const familyCareRecordSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  recordDate: Date,
  time: String,
  medicine: String,
  meal: String,
  toilet: String,
  activity: String,
  source: {
    type: String,
    default: "mock-seed"
  }
}, { timestamps: true })

const familyEventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  eventId: String,
  type: String,
  description: String,
  media: String,
  status: String,
  happenedAt: Date,
  source: {
    type: String,
    default: "mock-seed"
  }
}, { timestamps: true })

const FamilyAlert = mongoose.model("FamilyAlert", familyAlertSchema)
const FamilyCareRecord = mongoose.model("FamilyCareRecord", familyCareRecordSchema)
const FamilyEvent = mongoose.model("FamilyEvent", familyEventSchema)

const MOCK_FAMILY_ALERTS = [
  { alertId: "AL-2501", type: "跌倒", level: "高", happenedAt: "2026-03-16T08:21:00+08:00", location: "客廳", status: "未處理" },
  { alertId: "AL-2502", type: "離床", level: "中", happenedAt: "2026-03-16T07:42:00+08:00", location: "臥室", status: "處理中" },
  { alertId: "AL-2503", type: "久坐不動", level: "低", happenedAt: "2026-03-15T21:18:00+08:00", location: "餐桌區", status: "已完成" },
  { alertId: "AL-2504", type: "呼救手勢", level: "高", happenedAt: "2026-03-15T15:05:00+08:00", location: "浴室", status: "未處理" },
  { alertId: "AL-2505", type: "異常行為", level: "中", happenedAt: "2026-03-15T10:34:00+08:00", location: "走廊", status: "處理中" },
  { alertId: "AL-2506", type: "離床", level: "中", happenedAt: "2026-03-14T23:12:00+08:00", location: "臥室", status: "已完成" },
  { alertId: "AL-2507", type: "跌倒", level: "高", happenedAt: "2026-03-14T19:48:00+08:00", location: "客廳", status: "處理中" },
  { alertId: "AL-2508", type: "久坐不動", level: "低", happenedAt: "2026-03-14T13:09:00+08:00", location: "陽台", status: "已完成" },
  { alertId: "AL-2509", type: "異常行為", level: "中", happenedAt: "2026-03-13T17:41:00+08:00", location: "門口", status: "未處理" },
  { alertId: "AL-2510", type: "呼救手勢", level: "高", happenedAt: "2026-03-13T09:22:00+08:00", location: "臥室", status: "已完成" }
]

const MOCK_FAMILY_CARE_RECORDS = [
  { recordDate: "2026-03-16T08:10:00+08:00", time: "08:10", medicine: "已完成", meal: "已完成", toilet: "正常", activity: "散步 20 分鐘" },
  { recordDate: "2026-03-16T12:35:00+08:00", time: "12:35", medicine: "已完成", meal: "完成 80%", toilet: "正常", activity: "午休" },
  { recordDate: "2026-03-16T19:15:00+08:00", time: "19:15", medicine: "未執行", meal: "已完成", toilet: "待確認", activity: "客廳活動" },
  { recordDate: "2026-03-15T08:05:00+08:00", time: "08:05", medicine: "已完成", meal: "已完成", toilet: "正常", activity: "早晨伸展" },
  { recordDate: "2026-03-15T12:22:00+08:00", time: "12:22", medicine: "已完成", meal: "已完成", toilet: "正常", activity: "午睡" },
  { recordDate: "2026-03-15T18:44:00+08:00", time: "18:44", medicine: "已完成", meal: "完成 70%", toilet: "正常", activity: "看電視" },
  { recordDate: "2026-03-14T08:18:00+08:00", time: "08:18", medicine: "未執行", meal: "已完成", toilet: "待確認", activity: "床邊復健" },
  { recordDate: "2026-03-14T13:02:00+08:00", time: "13:02", medicine: "已完成", meal: "已完成", toilet: "正常", activity: "靜坐" },
  { recordDate: "2026-03-14T19:33:00+08:00", time: "19:33", medicine: "已完成", meal: "已完成", toilet: "正常", activity: "室內走動" },
  { recordDate: "2026-03-13T09:01:00+08:00", time: "09:01", medicine: "已完成", meal: "完成 60%", toilet: "正常", activity: "陽台活動" }
]

const MOCK_FAMILY_EVENTS = [
  { eventId: "EV-3401", type: "跌倒", description: "客廳偵測到跌倒，已通知看護與家屬。", media: "截圖 + 10 秒短片", status: "已完成", happenedAt: "2026-03-16T08:21:00+08:00" },
  { eventId: "EV-3402", type: "離床", description: "夜間離床，已推播家屬與看護。", media: "短片", status: "處理中", happenedAt: "2026-03-16T02:16:00+08:00" },
  { eventId: "EV-3403", type: "久坐不動", description: "超過 1 小時未移動，觸發提醒。", media: "截圖", status: "已完成", happenedAt: "2026-03-15T21:18:00+08:00" },
  { eventId: "EV-3404", type: "呼救手勢", description: "辨識到呼救手勢，啟動高優先流程。", media: "截圖 + 短片", status: "未處理", happenedAt: "2026-03-15T15:05:00+08:00" },
  { eventId: "EV-3405", type: "異常行為", description: "偵測到焦躁來回走動，通知家屬。", media: "短片", status: "處理中", happenedAt: "2026-03-15T10:34:00+08:00" },
  { eventId: "EV-3406", type: "離床", description: "凌晨離床，已由看護回報安全。", media: "短片", status: "已完成", happenedAt: "2026-03-14T23:12:00+08:00" },
  { eventId: "EV-3407", type: "跌倒", description: "浴室疑似滑倒事件，已協助回床。", media: "截圖 + 10 秒短片", status: "已完成", happenedAt: "2026-03-14T19:48:00+08:00" },
  { eventId: "EV-3408", type: "久坐不動", description: "午後久坐提醒，已恢復活動。", media: "截圖", status: "已完成", happenedAt: "2026-03-14T13:09:00+08:00" },
  { eventId: "EV-3409", type: "異常行為", description: "門口徘徊超過門檻時間。", media: "短片", status: "未處理", happenedAt: "2026-03-13T17:41:00+08:00" },
  { eventId: "EV-3410", type: "呼救手勢", description: "清晨手勢求助，已聯繫看護。", media: "截圖", status: "已完成", happenedAt: "2026-03-13T09:22:00+08:00" }
]

// ================= 測試 API =================
const caregiverAlertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  alertId: String,
  type: String,
  riskLevel: String,
  status: String,
  actionTaken: String,
  happenedAt: Date,
  source: {
    type: String,
    default: "mock-seed"
  }
}, { timestamps: true })

const caregiverCareLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  logId: String,
  tasks: [
    {
      task: String,
      status: String,
      time: String
    }
  ],
  vitals: {
    heartRate: Number,
    bloodPressure: String,
    spo2: Number,
    heartRateState: String,
    bloodPressureState: String,
    spo2State: String
  },
  happenedAt: Date,
  source: {
    type: String,
    default: "mock-seed"
  }
}, { timestamps: true })

const caregiverLanguageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  sessionId: String,
  language: String,
  voice: String,
  translatedAlerts: [
    {
      original: String,
      translated: String,
      locale: String
    }
  ],
  phrases: [
    {
      text: String,
      lang: String
    }
  ],
  happenedAt: Date,
  source: {
    type: String,
    default: "mock-seed"
  }
}, { timestamps: true })

const caregiverSystemSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  systemId: String,
  healthScore: Number,
  networkRows: [
    {
      area: String,
      status: String,
      signal: String
    }
  ],
  backupRows: [
    {
      event: String,
      capturedAt: String,
      media: String
    }
  ],
  happenedAt: Date,
  source: {
    type: String,
    default: "mock-seed"
  }
}, { timestamps: true })

const CaregiverAlert = mongoose.model("CaregiverAlert", caregiverAlertSchema)
const CaregiverCareLog = mongoose.model("CaregiverCareLog", caregiverCareLogSchema)
const CaregiverLanguage = mongoose.model("CaregiverLanguage", caregiverLanguageSchema)
const CaregiverSystem = mongoose.model("CaregiverSystem", caregiverSystemSchema)

const sosEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  patientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  patientName: String,
  patientEmail: String,
  patientPhone: String,
  message: String,
  locationLabel: String,
  latitude: Number,
  longitude: Number,
  status: {
    type: String,
    enum: ["active", "resolved"],
    default: "active",
    index: true
  },
  triggeredAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  resolvedAt: Date,
  resolvedByEmail: String,
  source: {
    type: String,
    default: "manual-sos"
  }
}, { timestamps: true })

const SosEvent = mongoose.model("SosEvent", sosEventSchema)

const abnormalEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  patientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  reporterUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true
  },
  reporterRole: {
    type: String,
    enum: ["patient", "family", "caregiver", "system"],
    default: "caregiver"
  },
  type: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ["低", "中", "高"],
    default: "中",
    index: true
  },
  status: {
    type: String,
    enum: ["未處理", "處理中", "已完成"],
    default: "未處理",
    index: true
  },
  location: String,
  description: String,
  happenedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  source: {
    type: String,
    default: "manual-report"
  }
}, { timestamps: true })

const reminderSchema = new mongoose.Schema({
  reminderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  patientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  createdByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  createdByRole: {
    type: String,
    enum: ["patient", "family", "caregiver", "system"],
    default: "family"
  },
  assignedToRole: {
    type: String,
    enum: ["patient", "family", "caregiver"],
    default: "caregiver",
    index: true
  },
  category: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  time: {
    type: Date,
    required: true,
    index: true
  },
  note: String,
  isCompleted: {
    type: Boolean,
    default: false,
    index: true
  },
  completedAt: Date,
  completedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  completedByRole: String,
  source: {
    type: String,
    default: "manual-reminder"
  }
}, { timestamps: true })

const bloodPressureRecordSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  sys: {
    type: Number,
    required: true
  },
  dia: {
    type: Number,
    required: true
  },
  pulse: Number,
  level: {
    type: String,
    enum: ["正常", "偏高", "高血壓", "低血壓"],
    required: true
  },
  measuredAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  source: {
    type: String,
    default: "manual-entry"
  }
}, { timestamps: true })

const visionDetectionRecordSchema = new mongoose.Schema({
  patientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  reporterUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true
  },
  reporterRole: {
    type: String,
    enum: ["patient", "family", "caregiver", "system"],
    default: "system"
  },
  action: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ["低", "中", "高"],
    default: "中",
    required: true
  },
  confidence: Number,
  location: String,
  description: String,
  modelName: {
    type: String,
    default: "CareAI-MediaPipe"
  },
  frameTag: String,
  detectedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  source: {
    type: String,
    default: "vision-mock"
  }
}, { timestamps: true })

const AbnormalEvent = mongoose.model("AbnormalEvent", abnormalEventSchema)
const Reminder = mongoose.model("Reminder", reminderSchema)
const BloodPressureRecord = mongoose.model("BloodPressureRecord", bloodPressureRecordSchema)
const VisionDetectionRecord = mongoose.model("VisionDetectionRecord", visionDetectionRecordSchema)

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
  {
    logId: "CG-LOG-101",
    tasks: [{ task: "Medicine", status: "Done", time: "08:05" }, { task: "Meal", status: "Done", time: "12:20" }, { task: "Walk", status: "Skipped", time: "17:40" }],
    vitals: { heartRate: 102, bloodPressure: "142/92", spo2: 97, heartRateState: "abnormal", bloodPressureState: "abnormal", spo2State: "normal" },
    happenedAt: "2026-03-16T18:00:00+08:00"
  },
  {
    logId: "CG-LOG-102",
    tasks: [{ task: "Medicine", status: "Done", time: "08:00" }, { task: "Meal", status: "Done", time: "12:15" }, { task: "Walk", status: "Done", time: "16:35" }],
    vitals: { heartRate: 88, bloodPressure: "126/82", spo2: 98, heartRateState: "normal", bloodPressureState: "normal", spo2State: "normal" },
    happenedAt: "2026-03-15T18:00:00+08:00"
  },
  {
    logId: "CG-LOG-103",
    tasks: [{ task: "Medicine", status: "Done", time: "08:10" }, { task: "Meal", status: "Done", time: "12:34" }, { task: "Walk", status: "Done", time: "16:55" }],
    vitals: { heartRate: 76, bloodPressure: "120/78", spo2: 99, heartRateState: "normal", bloodPressureState: "normal", spo2State: "normal" },
    happenedAt: "2026-03-14T18:00:00+08:00"
  },
  {
    logId: "CG-LOG-104",
    tasks: [{ task: "Medicine", status: "Skipped", time: "08:20" }, { task: "Meal", status: "Done", time: "12:05" }, { task: "Walk", status: "Skipped", time: "17:20" }],
    vitals: { heartRate: 58, bloodPressure: "96/64", spo2: 95, heartRateState: "abnormal", bloodPressureState: "normal", spo2State: "normal" },
    happenedAt: "2026-03-13T18:00:00+08:00"
  },
  {
    logId: "CG-LOG-105",
    tasks: [{ task: "Medicine", status: "Done", time: "08:07" }, { task: "Meal", status: "Done", time: "12:26" }, { task: "Walk", status: "Done", time: "16:10" }],
    vitals: { heartRate: 94, bloodPressure: "132/86", spo2: 96, heartRateState: "normal", bloodPressureState: "abnormal", spo2State: "normal" },
    happenedAt: "2026-03-12T18:00:00+08:00"
  },
  {
    logId: "CG-LOG-106",
    tasks: [{ task: "Medicine", status: "Done", time: "08:09" }, { task: "Meal", status: "Done", time: "12:31" }, { task: "Walk", status: "Done", time: "16:45" }],
    vitals: { heartRate: 82, bloodPressure: "124/80", spo2: 97, heartRateState: "normal", bloodPressureState: "normal", spo2State: "normal" },
    happenedAt: "2026-03-11T18:00:00+08:00"
  },
  {
    logId: "CG-LOG-107",
    tasks: [{ task: "Medicine", status: "Done", time: "08:12" }, { task: "Meal", status: "Done", time: "12:44" }, { task: "Walk", status: "Skipped", time: "17:02" }],
    vitals: { heartRate: 108, bloodPressure: "146/94", spo2: 94, heartRateState: "abnormal", bloodPressureState: "abnormal", spo2State: "abnormal" },
    happenedAt: "2026-03-10T18:00:00+08:00"
  },
  {
    logId: "CG-LOG-108",
    tasks: [{ task: "Medicine", status: "Done", time: "08:03" }, { task: "Meal", status: "Done", time: "12:18" }, { task: "Walk", status: "Done", time: "16:20" }],
    vitals: { heartRate: 79, bloodPressure: "118/76", spo2: 99, heartRateState: "normal", bloodPressureState: "normal", spo2State: "normal" },
    happenedAt: "2026-03-09T18:00:00+08:00"
  },
  {
    logId: "CG-LOG-109",
    tasks: [{ task: "Medicine", status: "Done", time: "08:16" }, { task: "Meal", status: "Done", time: "12:39" }, { task: "Walk", status: "Done", time: "16:33" }],
    vitals: { heartRate: 86, bloodPressure: "128/84", spo2: 98, heartRateState: "normal", bloodPressureState: "normal", spo2State: "normal" },
    happenedAt: "2026-03-08T18:00:00+08:00"
  },
  {
    logId: "CG-LOG-110",
    tasks: [{ task: "Medicine", status: "Skipped", time: "08:22" }, { task: "Meal", status: "Done", time: "12:11" }, { task: "Walk", status: "Skipped", time: "17:25" }],
    vitals: { heartRate: 61, bloodPressure: "100/66", spo2: 96, heartRateState: "normal", bloodPressureState: "normal", spo2State: "normal" },
    happenedAt: "2026-03-07T18:00:00+08:00"
  }
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
  { systemId: "CG-SYS-002", healthScore: 93, networkRows: [{ area: "Living room camera", status: "Stable", signal: "96%" }, { area: "Bedroom sensor", status: "Stable", signal: "92%" }, { area: "Wearable bridge", status: "Stable", signal: "89%" }], backupRows: [{ event: "Long sitting warning", capturedAt: "2026-03-15 15:21", media: "Screenshot" }, { event: "Abnormal behavior", capturedAt: "2026-03-15 14:52", media: "10s clip" }], happenedAt: "2026-03-15T15:30:00+08:00" },
  { systemId: "CG-SYS-003", healthScore: 82, networkRows: [{ area: "Living room camera", status: "Stable", signal: "94%" }, { area: "Bedroom sensor", status: "Unstable", signal: "58%" }, { area: "Wearable bridge", status: "Stable", signal: "87%" }], backupRows: [{ event: "Fall event", capturedAt: "2026-03-14 20:10", media: "10s clip + screenshot" }, { event: "Emergency gesture", capturedAt: "2026-03-14 19:58", media: "Screenshot" }], happenedAt: "2026-03-14T20:30:00+08:00" },
  { systemId: "CG-SYS-004", healthScore: 90, networkRows: [{ area: "Living room camera", status: "Stable", signal: "95%" }, { area: "Bedroom sensor", status: "Stable", signal: "88%" }, { area: "Wearable bridge", status: "Stable", signal: "90%" }], backupRows: [{ event: "Bed exit warning", capturedAt: "2026-03-13 23:30", media: "10s clip" }, { event: "Long sitting warning", capturedAt: "2026-03-13 13:03", media: "Screenshot" }], happenedAt: "2026-03-13T23:45:00+08:00" },
  { systemId: "CG-SYS-005", healthScore: 85, networkRows: [{ area: "Living room camera", status: "Stable", signal: "93%" }, { area: "Bedroom sensor", status: "Unstable", signal: "64%" }, { area: "Wearable bridge", status: "Stable", signal: "88%" }], backupRows: [{ event: "Abnormal behavior", capturedAt: "2026-03-12 11:18", media: "10s clip" }, { event: "Fall event", capturedAt: "2026-03-12 10:02", media: "10s clip + screenshot" }], happenedAt: "2026-03-12T11:30:00+08:00" },
  { systemId: "CG-SYS-006", healthScore: 92, networkRows: [{ area: "Living room camera", status: "Stable", signal: "97%" }, { area: "Bedroom sensor", status: "Stable", signal: "90%" }, { area: "Wearable bridge", status: "Stable", signal: "86%" }], backupRows: [{ event: "Medication reminder", capturedAt: "2026-03-11 08:02", media: "Screenshot" }, { event: "Bed exit warning", capturedAt: "2026-03-11 02:13", media: "10s clip" }], happenedAt: "2026-03-11T08:30:00+08:00" },
  { systemId: "CG-SYS-007", healthScore: 80, networkRows: [{ area: "Living room camera", status: "Unstable", signal: "61%" }, { area: "Bedroom sensor", status: "Stable", signal: "86%" }, { area: "Wearable bridge", status: "Unstable", signal: "57%" }], backupRows: [{ event: "System unstable warning", capturedAt: "2026-03-10 16:41", media: "Log + screenshot" }, { event: "Emergency gesture", capturedAt: "2026-03-10 16:35", media: "10s clip" }], happenedAt: "2026-03-10T16:50:00+08:00" },
  { systemId: "CG-SYS-008", healthScore: 89, networkRows: [{ area: "Living room camera", status: "Stable", signal: "92%" }, { area: "Bedroom sensor", status: "Stable", signal: "87%" }, { area: "Wearable bridge", status: "Stable", signal: "84%" }], backupRows: [{ event: "Long sitting warning", capturedAt: "2026-03-09 14:11", media: "Screenshot" }, { event: "Bed exit warning", capturedAt: "2026-03-09 03:46", media: "10s clip" }], happenedAt: "2026-03-09T14:30:00+08:00" },
  { systemId: "CG-SYS-009", healthScore: 91, networkRows: [{ area: "Living room camera", status: "Stable", signal: "95%" }, { area: "Bedroom sensor", status: "Stable", signal: "89%" }, { area: "Wearable bridge", status: "Stable", signal: "88%" }], backupRows: [{ event: "Fall event", capturedAt: "2026-03-08 18:55", media: "10s clip + screenshot" }, { event: "Abnormal behavior", capturedAt: "2026-03-08 17:40", media: "10s clip" }], happenedAt: "2026-03-08T19:10:00+08:00" },
  { systemId: "CG-SYS-010", healthScore: 86, networkRows: [{ area: "Living room camera", status: "Stable", signal: "90%" }, { area: "Bedroom sensor", status: "Unstable", signal: "63%" }, { area: "Wearable bridge", status: "Stable", signal: "83%" }], backupRows: [{ event: "Emergency gesture", capturedAt: "2026-03-07 09:20", media: "Screenshot" }, { event: "Bed exit warning", capturedAt: "2026-03-07 04:31", media: "10s clip" }], happenedAt: "2026-03-07T09:35:00+08:00" }
]

app.get("/", (req, res) => {
  res.send("Backend is running!")
})

// ================= Google 登入 =================
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
)

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { session: false }),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.redirect(frontendWebUrl)
      }

      const { email, name } = req.user

      let user = await User.findOne({ email })

      if (!user) {
        user = await User.create({
          email,
          name,
          role: null,
          profileCompleted: false
        })
      }

      const token = jwt.sign(
        { email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      )

      return res.redirect(buildOauthSuccessUrl(token))

    } catch (err) {
      console.log("❌ callback error:", err.message)
      return res.redirect(frontendWebUrl)
    }
  }
)

// ================= 設定角色 =================
app.post("/set-role", async (req, res) => {
  try {
    const { email, role } = req.body

    const user = await User.findOne({ email })
    if (!user) return res.status(404).json({ message: "使用者不存在" })

    user.role = role
    user.profileCompleted = false
    await user.save()

    const newToken = jwt.sign(
      { email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    )

    res.json({ token: newToken, role: user.role })

  } catch (err) {
    console.log("❌ set-role error:", err.message)
    res.status(500).json({ message: "設定角色失敗" })
  }
})

// ================= 共用驗證 =================
function verifyToken(req, res) {
  const token = req.headers.authorization?.split(" ")[1]
  if (!token) return null
  try {
    return jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return null
  }
}

function normalizeLimit(value, fallback = 10, max = 50) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, 1), max)
}

function createSosEventId() {
  return `SOS-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`
}

function createAbnormalEventId() {
  return `AB-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`
}

function createReminderId() {
  return `RM-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`
}

function normalizeSeverity(value) {
  if (value === "高" || value === "中" || value === "低") return value
  if (value === "High") return "高"
  if (value === "Medium") return "中"
  if (value === "Low") return "低"
  return "中"
}

function normalizeAlertStatus(value) {
  if (value === "未處理" || value === "處理中" || value === "已完成") return value
  if (value === "Pending") return "未處理"
  if (value === "Processing") return "處理中"
  if (value === "Done") return "已完成"
  return "未處理"
}

function judgeBloodPressureLevel(sys, dia) {
  if (sys >= 140 || dia >= 90) return "高血壓"
  if (sys < 90 || dia < 60) return "低血壓"
  if (sys >= 120 || dia >= 80) return "偏高"
  return "正常"
}

function normalizeVisionAction(value) {
  const text = String(value || "").trim().toUpperCase()
  if (!text) return "SEDENTARY"

  if (text.includes("FALL") || text.includes("跌倒")) return "DANGER: FALL"
  if (text.includes("SOS") || text.includes("WAV")) return "CRITICAL SOS: WAVING"
  if (text.includes("OFF_BED") || text.includes("BED EXIT") || text.includes("離床")) return "OFF_BED"
  if (text.includes("SEDENTARY") || text.includes("久坐")) return "SEDENTARY"

  return String(value).trim()
}

function getVisionSeverityByAction(action) {
  if (action === "DANGER: FALL" || action === "CRITICAL SOS: WAVING") return "高"
  if (action === "OFF_BED") return "中"
  return "低"
}

function toConfidence(value, fallback = 0.9) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed > 1) return Math.min(parsed / 100, 1)
  return Math.max(parsed, 0)
}

function toVisionAlertType(action) {
  if (action === "DANGER: FALL") return "跌倒"
  if (action === "CRITICAL SOS: WAVING") return "呼救手勢"
  if (action === "OFF_BED") return "離床"
  if (action === "SEDENTARY") return "久坐不動"
  return "異常行為"
}

async function getNextVisionSample(user) {
  const total = MOCK_VISION_SAMPLES.length
  const cursor = Number.isInteger(user.visionSampleCursor) ? user.visionSampleCursor : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_VISION_SAMPLES[sampleIndex]
  user.visionSampleCursor = (sampleIndex + 1) % total
  await user.save()
  return {
    sample,
    sampleIndex,
    nextCursor: user.visionSampleCursor
  }
}

async function requestVisionModelResult(payload = {}) {
  const endpoint = process.env.VISION_MODEL_ENDPOINT
  if (!endpoint || typeof fetch !== "function") return null

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    if (!response.ok) return null

    const data = await response.json()
    const action = normalizeVisionAction(data.action || data.eventType || data.event_type)
    return {
      action,
      severity: normalizeSeverity(data.severity || getVisionSeverityByAction(action)),
      confidence: toConfidence(data.confidence, 0.92),
      location: typeof data.location === "string" ? data.location.trim() : "",
      description: typeof data.description === "string" ? data.description.trim() : "",
      frameTag: typeof data.frameTag === "string" ? data.frameTag.trim() : "",
      modelName: typeof data.modelName === "string" && data.modelName.trim()
        ? data.modelName.trim()
        : "CareAI-MediaPipe"
    }
  } catch {
    return null
  }
}

async function createVisionAlertIfNeeded({ patientUserId, reporterUserId, reporterRole, detectionRecord }) {
  if (!detectionRecord || detectionRecord.severity !== "高") return null

  return AbnormalEvent.create({
    eventId: createAbnormalEventId(),
    patientUserId,
    reporterUserId,
    reporterRole,
    type: toVisionAlertType(detectionRecord.action),
    severity: detectionRecord.severity,
    status: "未處理",
    location: detectionRecord.location || "",
    description: detectionRecord.description || `${detectionRecord.action} 需立即確認`,
    happenedAt: detectionRecord.detectedAt || new Date(),
    source: detectionRecord.source || "vision-model"
  })
}

async function resolveTargetPatient(fallbackUserId) {
  const patient = await User.findOne({ role: "patient" }).sort({ updatedAt: -1, _id: -1 })
  return patient?._id || fallbackUserId
}

// ================= PATIENT =================
app.get("/patient/check-profile", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  res.json({ profileCompleted: user.profileCompleted })
})

app.get("/patient/profile", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })

  res.json({
    name: user.name,
    birthDate: user.birthDate,
    age: user.age,
    idNumber: user.idNumber,
    gender: user.gender,
    phone: user.phone
  })
})

app.post("/patient/setup", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const { name, birthDate, age, idNumber, gender, phone } = req.body

  const user = await User.findOne({ email: decoded.email })

  user.name = name
  user.birthDate = birthDate
  user.age = age
  user.idNumber = idNumber
  user.gender = gender
  user.phone = typeof phone === "string" ? phone.trim() : user.phone
  user.profileCompleted = true

  await user.save()

  res.json({ message: "基本資料已儲存" })
})

app.get("/patient/blood-pressure/history", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const limit = normalizeLimit(req.query.limit, 20, 100)
  const records = await BloodPressureRecord.find({ userId: user._id })
    .sort({ measuredAt: -1, _id: -1 })
    .limit(limit)

  const latest = records.length > 0 ? records[0] : null

  res.json({ records, latest })
})

app.post("/patient/blood-pressure/record", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const sys = Number(req.body?.sys)
  const dia = Number(req.body?.dia)
  const pulseRaw = req.body?.pulse
  const pulse = pulseRaw === "" || pulseRaw === null || pulseRaw === undefined
    ? undefined
    : Number(pulseRaw)

  if (!Number.isFinite(sys) || !Number.isFinite(dia)) {
    return res.status(400).json({ message: "請提供有效的 SYS 與 DIA 數值" })
  }

  if (pulseRaw !== "" && pulseRaw !== null && pulseRaw !== undefined && !Number.isFinite(pulse)) {
    return res.status(400).json({ message: "Pulse 格式錯誤" })
  }

  const level = judgeBloodPressureLevel(sys, dia)

  const record = await BloodPressureRecord.create({
    userId: user._id,
    sys,
    dia,
    pulse,
    level,
    measuredAt: new Date(),
    source: "manual-entry"
  })

  res.status(201).json({
    message: "血壓紀錄已新增",
    record
  })
})

app.post("/patient/blood-pressure/sync", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const total = MOCK_BP_SAMPLES.length
  const cursor = Number.isInteger(user.bloodPressureCursor) ? user.bloodPressureCursor : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_BP_SAMPLES[sampleIndex]

  const record = await BloodPressureRecord.create({
    userId: user._id,
    sys: sample.sys,
    dia: sample.dia,
    pulse: sample.pulse,
    level: judgeBloodPressureLevel(sample.sys, sample.dia),
    measuredAt: new Date(),
    source: "mock-seed"
  })

  user.bloodPressureCursor = (sampleIndex + 1) % total
  await user.save()

  res.json({
    message: "已寫入一筆虛擬血壓資料",
    sampleIndex,
    nextCursor: user.bloodPressureCursor,
    record
  })
})

app.get("/patient/vision/history", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const limit = normalizeLimit(req.query.limit, 20, 100)
  const records = await VisionDetectionRecord.find({ patientUserId: user._id })
    .sort({ detectedAt: -1, _id: -1 })
    .limit(limit)

  res.json({ records })
})

app.post("/patient/vision/detect", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const frameTag = typeof req.body?.frameTag === "string" ? req.body.frameTag.trim() : ""
  const location = typeof req.body?.location === "string" ? req.body.location.trim() : ""
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : ""

  let detection = await requestVisionModelResult({
    reporterRole: "patient",
    frameTag,
    location,
    description
  })
  let usedFallback = false
  let sampleIndex = null
  let nextCursor = null

  if (!detection) {
    const sampleResult = await getNextVisionSample(user)
    usedFallback = true
    sampleIndex = sampleResult.sampleIndex
    nextCursor = sampleResult.nextCursor
    detection = {
      action: normalizeVisionAction(sampleResult.sample.action),
      severity: normalizeSeverity(sampleResult.sample.severity),
      confidence: toConfidence(sampleResult.sample.confidence, 0.9),
      location: sampleResult.sample.location || "",
      description: sampleResult.sample.description || "",
      frameTag: sampleResult.sample.frameTag || "",
      modelName: "CareAI-MediaPipe"
    }
  }

  const record = await VisionDetectionRecord.create({
    patientUserId: user._id,
    reporterUserId: user._id,
    reporterRole: "patient",
    action: detection.action,
    severity: normalizeSeverity(detection.severity || getVisionSeverityByAction(detection.action)),
    confidence: toConfidence(detection.confidence, 0.9),
    location: detection.location || location,
    description: detection.description || description || `模型事件：${detection.action}`,
    modelName: detection.modelName || "CareAI-MediaPipe",
    frameTag: detection.frameTag || frameTag,
    detectedAt: new Date(),
    source: usedFallback ? "vision-mock" : "vision-model"
  })

  const linkedAlert = await createVisionAlertIfNeeded({
    patientUserId: user._id,
    reporterUserId: user._id,
    reporterRole: "patient",
    detectionRecord: record
  })

  res.status(201).json({
    message: usedFallback ? "影像模型暫不可用，已寫入示範判定資料" : "影像模型判定完成",
    usedFallback,
    sampleIndex,
    nextCursor,
    record,
    linkedAlert
  })
})

app.post("/patient/vision/sync", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const sampleResult = await getNextVisionSample(user)
  const sample = sampleResult.sample

  const record = await VisionDetectionRecord.create({
    patientUserId: user._id,
    reporterUserId: user._id,
    reporterRole: "system",
    action: normalizeVisionAction(sample.action),
    severity: normalizeSeverity(sample.severity || getVisionSeverityByAction(sample.action)),
    confidence: toConfidence(sample.confidence, 0.9),
    location: sample.location || "",
    description: sample.description || `模型事件：${sample.action}`,
    modelName: "CareAI-MediaPipe",
    frameTag: sample.frameTag || "",
    detectedAt: new Date(),
    source: "vision-mock"
  })

  const linkedAlert = await createVisionAlertIfNeeded({
    patientUserId: user._id,
    reporterUserId: user._id,
    reporterRole: "system",
    detectionRecord: record
  })

  res.status(201).json({
    message: "已寫入一筆示範影像偵測資料",
    sampleIndex: sampleResult.sampleIndex,
    nextCursor: sampleResult.nextCursor,
    record,
    linkedAlert
  })
})

app.get("/patient/wearable/latest", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const record = await WearableRecord.findOne({ userId: user._id })
    .sort({ recordedAt: -1, _id: -1 })

  res.json({ record })
})

app.get("/patient/wearable/history", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const requestedLimit = Number(req.query.limit)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 50)
    : 10

  const records = await WearableRecord.find({ userId: user._id })
    .sort({ recordedAt: -1, _id: -1 })
    .limit(limit)

  res.json({ records })
})

app.post("/patient/wearable/sync", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const totalSamples = MOCK_WEARABLE_SAMPLES.length
  const cursor = Number.isInteger(user.wearableSampleCursor)
    ? user.wearableSampleCursor
    : 0
  const sampleIndex = ((cursor % totalSamples) + totalSamples) % totalSamples
  const sample = MOCK_WEARABLE_SAMPLES[sampleIndex]

  const record = await WearableRecord.create({
    userId: user._id,
    heartRate: sample.heartRate,
    spo2: sample.spo2,
    steps: sample.steps,
    note: sample.note,
    isAbnormal: sample.isAbnormal,
    source: "mock-seed",
    recordedAt: new Date()
  })

  user.wearableSampleCursor = (sampleIndex + 1) % totalSamples
  await user.save()

  res.json({
    message: "已寫入一筆虛擬穿戴資料",
    sampleIndex,
    nextCursor: user.wearableSampleCursor,
    record
  })
})

app.get("/patient/sos/history", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const limit = normalizeLimit(req.query.limit, 10, 50)
  const records = await SosEvent.find({ patientUserId: user._id })
    .sort({ triggeredAt: -1, _id: -1 })
    .limit(limit)

  res.json({ records })
})

app.post("/patient/sos/trigger", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const {
    message,
    locationLabel,
    latitude,
    longitude,
    patientPhone
  } = req.body || {}

  const lat = Number(latitude)
  const lng = Number(longitude)
  const normalizedPhone = typeof patientPhone === "string" ? patientPhone.trim() : ""
  if (normalizedPhone) {
    user.phone = normalizedPhone
    await user.save()
  }

  const record = await SosEvent.create({
    eventId: createSosEventId(),
    patientUserId: user._id,
    patientName: user.name || "未命名受顧者",
    patientEmail: user.email,
    patientPhone: normalizedPhone || user.phone || "",
    message: typeof message === "string" && message.trim()
      ? message.trim()
      : "受顧者手動觸發 SOS",
    locationLabel: typeof locationLabel === "string" && locationLabel.trim()
      ? locationLabel.trim()
      : "定位資訊未提供",
    latitude: Number.isFinite(lat) ? lat : undefined,
    longitude: Number.isFinite(lng) ? lng : undefined,
    status: "active",
    triggeredAt: new Date(),
    source: "patient-manual-sos"
  })

  res.status(201).json({
    message: "SOS 已送出",
    record
  })
})

// ================= FAMILY =================
app.get("/family/alerts/history", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const filter = {}
  if (req.query.severity) {
    filter.severity = normalizeSeverity(req.query.severity)
  }
  if (req.query.status) {
    filter.status = normalizeAlertStatus(req.query.status)
  }

  const limit = normalizeLimit(req.query.limit, 20, 100)
  const records = await AbnormalEvent.find(filter)
    .sort({ happenedAt: -1, _id: -1 })
    .limit(limit)

  res.json({ records })
})

app.post("/family/alerts/sync", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const total = MOCK_FAMILY_ALERTS.length
  const cursor = Number.isInteger(user.familyAlertsCursor) ? user.familyAlertsCursor : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_FAMILY_ALERTS[sampleIndex]
  const patientUserId = await resolveTargetPatient(user._id)

  const record = await AbnormalEvent.create({
    eventId: createAbnormalEventId(),
    patientUserId,
    reporterUserId: user._id,
    reporterRole: "system",
    type: sample.type,
    severity: normalizeSeverity(sample.level),
    happenedAt: new Date(sample.happenedAt),
    location: sample.location,
    status: normalizeAlertStatus(sample.status),
    description: `${sample.type}事件，請家屬確認`,
    source: "mock-seed"
  })

  user.familyAlertsCursor = (sampleIndex + 1) % total
  await user.save()

  res.json({
    message: "已寫入一筆虛擬異常事件資料",
    sampleIndex,
    nextCursor: user.familyAlertsCursor,
    record
  })
})

app.patch("/family/alerts/:id/status", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const record = await AbnormalEvent.findById(req.params.id)
  if (!record) return res.status(404).json({ message: "找不到異常事件" })

  record.status = normalizeAlertStatus(req.body?.status)
  await record.save()

  res.json({
    message: "事件狀態已更新",
    record
  })
})

app.get("/family/care-records/history", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const filter = { userId: user._id }
  if (req.query.date) {
    const date = new Date(req.query.date)
    if (!Number.isNaN(date.getTime())) {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)
      filter.recordDate = { $gte: start, $lte: end }
    }
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
  const records = await FamilyCareRecord.find(filter)
    .sort({ recordDate: -1, _id: -1 })
    .limit(limit)

  res.json({ records })
})

app.post("/family/care-records/sync", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const total = MOCK_FAMILY_CARE_RECORDS.length
  const cursor = Number.isInteger(user.familyCareRecordsCursor) ? user.familyCareRecordsCursor : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_FAMILY_CARE_RECORDS[sampleIndex]

  const record = await FamilyCareRecord.create({
    userId: user._id,
    recordDate: new Date(sample.recordDate),
    time: sample.time,
    medicine: sample.medicine,
    meal: sample.meal,
    toilet: sample.toilet,
    activity: sample.activity,
    source: "mock-seed"
  })

  user.familyCareRecordsCursor = (sampleIndex + 1) % total
  await user.save()

  res.json({
    message: "已寫入一筆虛擬照護紀錄資料",
    sampleIndex,
    nextCursor: user.familyCareRecordsCursor,
    record
  })
})

app.get("/family/events/history", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const filter = { userId: user._id }

  if (req.query.type && req.query.type !== "all") {
    filter.type = req.query.type
  }

  const hasStart = Boolean(req.query.startDate)
  const hasEnd = Boolean(req.query.endDate)
  if (hasStart || hasEnd) {
    filter.happenedAt = {}
    if (hasStart) {
      const start = new Date(req.query.startDate)
      if (!Number.isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0)
        filter.happenedAt.$gte = start
      }
    }
    if (hasEnd) {
      const end = new Date(req.query.endDate)
      if (!Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999)
        filter.happenedAt.$lte = end
      }
    }
    if (Object.keys(filter.happenedAt).length === 0) {
      delete filter.happenedAt
    }
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
  const records = await FamilyEvent.find(filter)
    .sort({ happenedAt: -1, _id: -1 })
    .limit(limit)

  res.json({ records })
})

app.post("/family/events/sync", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const total = MOCK_FAMILY_EVENTS.length
  const cursor = Number.isInteger(user.familyEventsCursor) ? user.familyEventsCursor : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_FAMILY_EVENTS[sampleIndex]

  const record = await FamilyEvent.create({
    userId: user._id,
    eventId: sample.eventId,
    type: sample.type,
    description: sample.description,
    media: sample.media,
    status: sample.status,
    happenedAt: new Date(sample.happenedAt),
    source: "mock-seed"
  })

  user.familyEventsCursor = (sampleIndex + 1) % total
  await user.save()

  res.json({
    message: "已寫入一筆虛擬危險事件查詢資料",
    sampleIndex,
    nextCursor: user.familyEventsCursor,
    record
  })
})

app.get("/family/sos/history", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const statusFilter = req.query.status
  const filter = {}
  if (statusFilter === "active" || statusFilter === "resolved") {
    filter.status = statusFilter
  }

  const limit = normalizeLimit(req.query.limit, 20, 100)
  const records = await SosEvent.find(filter)
    .sort({ triggeredAt: -1, _id: -1 })
    .limit(limit)

  res.json({ records })
})

app.patch("/family/sos/:id/resolve", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const record = await SosEvent.findById(req.params.id)
  if (!record) return res.status(404).json({ message: "找不到 SOS 事件" })

  if (record.status === "resolved") {
    return res.json({ message: "SOS 事件已結案", record })
  }

  record.status = "resolved"
  record.resolvedAt = new Date()
  record.resolvedByEmail = user.email
  await record.save()

  res.json({
    message: "已將 SOS 事件標記為完成",
    record
  })
})

app.get("/family/check-profile", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  res.json({ profileCompleted: user.profileCompleted })
})

app.get("/family/profile", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })

  res.json({
    name: user.name,
    phone: user.phone
  })
})

app.post("/family/setup", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const { name, phone } = req.body

  const user = await User.findOne({ email: decoded.email })

  user.name = name
  user.phone = phone
  user.profileCompleted = true

  await user.save()

  res.json({ message: "家屬資料已儲存" })
})

app.get("/family/reminders", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const filter = { assignedToRole: "caregiver" }
  if (req.query.completed === "true") filter.isCompleted = true
  if (req.query.completed === "false") filter.isCompleted = false

  const limit = normalizeLimit(req.query.limit, 30, 100)
  const records = await Reminder.find(filter)
    .sort({ isCompleted: 1, time: 1, _id: -1 })
    .limit(limit)

  res.json({ records })
})

app.post("/family/reminders", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const { category, content, time, note } = req.body || {}
  if (!category || !String(category).trim()) {
    return res.status(400).json({ message: "請提供提醒類別" })
  }
  if (!content || !String(content).trim()) {
    return res.status(400).json({ message: "請提供提醒內容" })
  }

  const parsedTime = new Date(time)
  if (!time || Number.isNaN(parsedTime.getTime())) {
    return res.status(400).json({ message: "提醒時間格式錯誤" })
  }

  const patientUserId = await resolveTargetPatient(user._id)

  const record = await Reminder.create({
    reminderId: createReminderId(),
    patientUserId,
    createdByUserId: user._id,
    createdByRole: "family",
    assignedToRole: "caregiver",
    category: String(category).trim(),
    content: String(content).trim(),
    time: parsedTime,
    note: typeof note === "string" ? note.trim() : "",
    source: "family-manual"
  })

  res.status(201).json({
    message: "提醒已新增",
    record
  })
})

app.patch("/family/reminders/:id", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const record = await Reminder.findById(req.params.id)
  if (!record) return res.status(404).json({ message: "找不到提醒事項" })

  const { category, content, time, note } = req.body || {}
  if (typeof category === "string" && category.trim()) record.category = category.trim()
  if (typeof content === "string" && content.trim()) record.content = content.trim()
  if (typeof note === "string") record.note = note.trim()
  if (time) {
    const parsedTime = new Date(time)
    if (Number.isNaN(parsedTime.getTime())) {
      return res.status(400).json({ message: "提醒時間格式錯誤" })
    }
    record.time = parsedTime
  }

  await record.save()

  res.json({
    message: "提醒已更新",
    record
  })
})

app.delete("/family/reminders/:id", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "找不到使用者" })

  const record = await Reminder.findByIdAndDelete(req.params.id)
  if (!record) return res.status(404).json({ message: "找不到提醒事項" })

  res.json({ message: "提醒已刪除", record })
})

// ================= CAREGIVER =================
app.get("/caregiver/blood-pressure/history", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const patientUserId = await resolveTargetPatient(user._id)
  const limit = normalizeLimit(req.query.limit, 30, 100)
  const records = await BloodPressureRecord.find({ userId: patientUserId })
    .sort({ measuredAt: -1, _id: -1 })
    .limit(limit)

  const latest = records.length > 0 ? records[0] : null
  res.json({ records, latest })
})

app.post("/caregiver/blood-pressure/record", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const sys = Number(req.body?.sys)
  const dia = Number(req.body?.dia)
  const pulseRaw = req.body?.pulse
  const pulse = pulseRaw === "" || pulseRaw === null || pulseRaw === undefined
    ? undefined
    : Number(pulseRaw)

  if (!Number.isFinite(sys) || !Number.isFinite(dia)) {
    return res.status(400).json({ message: "請提供有效的 SYS 與 DIA 數值" })
  }

  if (pulseRaw !== "" && pulseRaw !== null && pulseRaw !== undefined && !Number.isFinite(pulse)) {
    return res.status(400).json({ message: "Pulse 格式錯誤" })
  }

  const patientUserId = await resolveTargetPatient(user._id)
  const record = await BloodPressureRecord.create({
    userId: patientUserId,
    sys,
    dia,
    pulse,
    level: judgeBloodPressureLevel(sys, dia),
    measuredAt: new Date(),
    source: "caregiver-entry"
  })

  res.status(201).json({
    message: "看護端已新增血壓紀錄",
    record
  })
})

app.post("/caregiver/blood-pressure/sync", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const total = MOCK_BP_SAMPLES.length
  const cursor = Number.isInteger(user.bloodPressureCursor) ? user.bloodPressureCursor : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_BP_SAMPLES[sampleIndex]

  const patientUserId = await resolveTargetPatient(user._id)
  const record = await BloodPressureRecord.create({
    userId: patientUserId,
    sys: sample.sys,
    dia: sample.dia,
    pulse: sample.pulse,
    level: judgeBloodPressureLevel(sample.sys, sample.dia),
    measuredAt: new Date(),
    source: "mock-seed"
  })

  user.bloodPressureCursor = (sampleIndex + 1) % total
  await user.save()

  res.json({
    message: "已同步一筆示範血壓資料",
    sampleIndex,
    nextCursor: user.bloodPressureCursor,
    record
  })
})

app.get("/caregiver/vision/history", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const patientUserId = await resolveTargetPatient(user._id)
  const filter = { patientUserId }
  if (req.query.severity) {
    filter.severity = normalizeSeverity(req.query.severity)
  }
  if (req.query.action) {
    filter.action = normalizeVisionAction(req.query.action)
  }

  const limit = normalizeLimit(req.query.limit, 30, 100)
  const records = await VisionDetectionRecord.find(filter)
    .sort({ detectedAt: -1, _id: -1 })
    .limit(limit)

  res.json({ records })
})

app.post("/caregiver/vision/detect", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const patientUserId = await resolveTargetPatient(user._id)
  const frameTag = typeof req.body?.frameTag === "string" ? req.body.frameTag.trim() : ""
  const location = typeof req.body?.location === "string" ? req.body.location.trim() : ""
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : ""

  let detection = await requestVisionModelResult({
    reporterRole: "caregiver",
    frameTag,
    location,
    description
  })
  let usedFallback = false
  let sampleIndex = null
  let nextCursor = null

  if (!detection) {
    const sampleResult = await getNextVisionSample(user)
    usedFallback = true
    sampleIndex = sampleResult.sampleIndex
    nextCursor = sampleResult.nextCursor
    detection = {
      action: normalizeVisionAction(sampleResult.sample.action),
      severity: normalizeSeverity(sampleResult.sample.severity),
      confidence: toConfidence(sampleResult.sample.confidence, 0.9),
      location: sampleResult.sample.location || "",
      description: sampleResult.sample.description || "",
      frameTag: sampleResult.sample.frameTag || "",
      modelName: "CareAI-MediaPipe"
    }
  }

  const record = await VisionDetectionRecord.create({
    patientUserId,
    reporterUserId: user._id,
    reporterRole: "caregiver",
    action: detection.action,
    severity: normalizeSeverity(detection.severity || getVisionSeverityByAction(detection.action)),
    confidence: toConfidence(detection.confidence, 0.9),
    location: detection.location || location,
    description: detection.description || description || `模型事件：${detection.action}`,
    modelName: detection.modelName || "CareAI-MediaPipe",
    frameTag: detection.frameTag || frameTag,
    detectedAt: new Date(),
    source: usedFallback ? "vision-mock" : "vision-model"
  })

  const linkedAlert = await createVisionAlertIfNeeded({
    patientUserId,
    reporterUserId: user._id,
    reporterRole: "caregiver",
    detectionRecord: record
  })

  res.status(201).json({
    message: usedFallback ? "影像模型暫不可用，已寫入示範判定資料" : "影像模型判定完成",
    usedFallback,
    sampleIndex,
    nextCursor,
    record,
    linkedAlert
  })
})

app.post("/caregiver/vision/sync", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const patientUserId = await resolveTargetPatient(user._id)
  const sampleResult = await getNextVisionSample(user)
  const sample = sampleResult.sample

  const record = await VisionDetectionRecord.create({
    patientUserId,
    reporterUserId: user._id,
    reporterRole: "system",
    action: normalizeVisionAction(sample.action),
    severity: normalizeSeverity(sample.severity || getVisionSeverityByAction(sample.action)),
    confidence: toConfidence(sample.confidence, 0.9),
    location: sample.location || "",
    description: sample.description || `模型事件：${sample.action}`,
    modelName: "CareAI-MediaPipe",
    frameTag: sample.frameTag || "",
    detectedAt: new Date(),
    source: "vision-mock"
  })

  const linkedAlert = await createVisionAlertIfNeeded({
    patientUserId,
    reporterUserId: user._id,
    reporterRole: "system",
    detectionRecord: record
  })

  res.status(201).json({
    message: "已同步一筆示範影像偵測資料",
    sampleIndex: sampleResult.sampleIndex,
    nextCursor: sampleResult.nextCursor,
    record,
    linkedAlert
  })
})

app.get("/caregiver/alerts/history", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const filter = {}
  if (req.query.severity) {
    filter.severity = normalizeSeverity(req.query.severity)
  }
  if (req.query.status) {
    filter.status = normalizeAlertStatus(req.query.status)
  }

  const limit = normalizeLimit(req.query.limit, 20, 100)
  const records = await AbnormalEvent.find(filter)
    .sort({ happenedAt: -1, _id: -1 })
    .limit(limit)

  res.json({ records })
})

app.post("/caregiver/alerts", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const {
    type,
    severity,
    status,
    location,
    description,
    happenedAt
  } = req.body || {}

  if (!type || !String(type).trim()) {
    return res.status(400).json({ message: "請提供事件類型" })
  }

  const patientUserId = await resolveTargetPatient(user._id)

  const record = await AbnormalEvent.create({
    eventId: createAbnormalEventId(),
    patientUserId,
    reporterUserId: user._id,
    reporterRole: "caregiver",
    type: String(type).trim(),
    severity: normalizeSeverity(severity),
    status: normalizeAlertStatus(status),
    location: typeof location === "string" ? location.trim() : "",
    description: typeof description === "string" ? description.trim() : "",
    happenedAt: happenedAt ? new Date(happenedAt) : new Date(),
    source: "caregiver-manual"
  })

  res.status(201).json({
    message: "異常事件已建立",
    record
  })
})

app.patch("/caregiver/alerts/:id/status", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const record = await AbnormalEvent.findById(req.params.id)
  if (!record) return res.status(404).json({ message: "找不到異常事件" })

  const nextStatus = normalizeAlertStatus(req.body?.status)
  record.status = nextStatus
  await record.save()

  res.json({
    message: "事件狀態已更新",
    record
  })
})

app.post("/caregiver/alerts/sync", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const total = MOCK_CAREGIVER_ALERTS.length
  const cursor = Number.isInteger(user.caregiverAlertsCursor)
    ? user.caregiverAlertsCursor
    : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_CAREGIVER_ALERTS[sampleIndex]
  const patientUserId = await resolveTargetPatient(user._id)

  const record = await AbnormalEvent.create({
    eventId: createAbnormalEventId(),
    patientUserId,
    reporterUserId: user._id,
    reporterRole: "system",
    type: sample.type,
    severity: normalizeSeverity(sample.riskLevel),
    status: normalizeAlertStatus(sample.status),
    description: sample.actionTaken,
    happenedAt: new Date(sample.happenedAt),
    source: "mock-seed"
  })

  user.caregiverAlertsCursor = (sampleIndex + 1) % total
  await user.save()

  res.json({
    message: "Caregiver abnormal event mock synced",
    sampleIndex,
    nextCursor: user.caregiverAlertsCursor,
    record
  })
})

app.get("/caregiver/reminders", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const filter = { assignedToRole: "caregiver" }
  if (req.query.completed === "true") filter.isCompleted = true
  if (req.query.completed === "false") filter.isCompleted = false

  const limit = normalizeLimit(req.query.limit, 30, 100)
  const records = await Reminder.find(filter)
    .sort({ isCompleted: 1, time: 1, _id: -1 })
    .limit(limit)

  res.json({ records })
})

app.patch("/caregiver/reminders/:id/complete", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const record = await Reminder.findById(req.params.id)
  if (!record) return res.status(404).json({ message: "Reminder not found" })

  if (record.isCompleted) {
    return res.json({ message: "Reminder already completed", record })
  }

  record.isCompleted = true
  record.completedAt = new Date()
  record.completedByUserId = user._id
  record.completedByRole = "caregiver"
  await record.save()

  res.json({
    message: "Reminder marked as completed",
    record
  })
})

app.patch("/caregiver/reminders/:id/reset", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const record = await Reminder.findById(req.params.id)
  if (!record) return res.status(404).json({ message: "Reminder not found" })

  record.isCompleted = false
  record.completedAt = undefined
  record.completedByUserId = undefined
  record.completedByRole = undefined
  await record.save()

  res.json({
    message: "Reminder reset to pending",
    record
  })
})

app.get("/caregiver/care-logs/history", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
  const records = await CaregiverCareLog.find({ userId: user._id })
    .sort({ happenedAt: -1, _id: -1 })
    .limit(limit)

  res.json({ records })
})

app.post("/caregiver/care-logs/sync", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const total = MOCK_CAREGIVER_CARE_LOGS.length
  const cursor = Number.isInteger(user.caregiverCareLogsCursor)
    ? user.caregiverCareLogsCursor
    : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_CAREGIVER_CARE_LOGS[sampleIndex]

  const record = await CaregiverCareLog.create({
    userId: user._id,
    logId: sample.logId,
    tasks: sample.tasks,
    vitals: sample.vitals,
    happenedAt: new Date(sample.happenedAt),
    source: "mock-seed"
  })

  user.caregiverCareLogsCursor = (sampleIndex + 1) % total
  await user.save()

  res.json({
    message: "Caregiver care log mock synced",
    sampleIndex,
    nextCursor: user.caregiverCareLogsCursor,
    record
  })
})

app.get("/caregiver/language/history", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
  const records = await CaregiverLanguage.find({ userId: user._id })
    .sort({ happenedAt: -1, _id: -1 })
    .limit(limit)

  res.json({ records })
})

app.post("/caregiver/language/sync", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const total = MOCK_CAREGIVER_LANGUAGE.length
  const cursor = Number.isInteger(user.caregiverLanguageCursor)
    ? user.caregiverLanguageCursor
    : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_CAREGIVER_LANGUAGE[sampleIndex]

  const record = await CaregiverLanguage.create({
    userId: user._id,
    sessionId: sample.sessionId,
    language: sample.language,
    voice: sample.voice,
    translatedAlerts: sample.translatedAlerts,
    phrases: sample.phrases,
    happenedAt: new Date(sample.happenedAt),
    source: "mock-seed"
  })

  user.caregiverLanguageCursor = (sampleIndex + 1) % total
  await user.save()

  res.json({
    message: "Caregiver language mock synced",
    sampleIndex,
    nextCursor: user.caregiverLanguageCursor,
    record
  })
})

app.get("/caregiver/system/history", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
  const records = await CaregiverSystem.find({ userId: user._id })
    .sort({ happenedAt: -1, _id: -1 })
    .limit(limit)

  res.json({ records })
})

app.post("/caregiver/system/sync", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const total = MOCK_CAREGIVER_SYSTEM.length
  const cursor = Number.isInteger(user.caregiverSystemCursor)
    ? user.caregiverSystemCursor
    : 0
  const sampleIndex = ((cursor % total) + total) % total
  const sample = MOCK_CAREGIVER_SYSTEM[sampleIndex]

  const record = await CaregiverSystem.create({
    userId: user._id,
    systemId: sample.systemId,
    healthScore: sample.healthScore,
    networkRows: sample.networkRows,
    backupRows: sample.backupRows,
    happenedAt: new Date(sample.happenedAt),
    source: "mock-seed"
  })

  user.caregiverSystemCursor = (sampleIndex + 1) % total
  await user.save()

  res.json({
    message: "Caregiver system mock synced",
    sampleIndex,
    nextCursor: user.caregiverSystemCursor,
    record
  })
})

app.get("/caregiver/sos/history", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const statusFilter = req.query.status
  const filter = {}
  if (statusFilter === "active" || statusFilter === "resolved") {
    filter.status = statusFilter
  }

  const limit = normalizeLimit(req.query.limit, 20, 100)
  const records = await SosEvent.find(filter)
    .sort({ triggeredAt: -1, _id: -1 })
    .limit(limit)

  res.json({ records })
})

app.patch("/caregiver/sos/:id/resolve", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "Invalid token" })

  const user = await User.findOne({ email: decoded.email })
  if (!user) return res.status(404).json({ message: "User not found" })

  const record = await SosEvent.findById(req.params.id)
  if (!record) return res.status(404).json({ message: "SOS event not found" })

  if (record.status === "resolved") {
    return res.json({ message: "SOS event already resolved", record })
  }

  record.status = "resolved"
  record.resolvedAt = new Date()
  record.resolvedByEmail = user.email
  await record.save()

  res.json({
    message: "SOS event resolved",
    record
  })
})

app.get("/caregiver/check-profile", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  res.json({ profileCompleted: user.profileCompleted })
})

app.get("/caregiver/profile", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })

  res.json({
    name: user.name,
    experience: user.experience
  })
})

app.post("/caregiver/setup", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const { name, experience } = req.body

  const user = await User.findOne({ email: decoded.email })

  user.name = name
  user.experience = experience
  user.profileCompleted = true

  await user.save()

  res.json({ message: "看護資料已儲存" })
})

// ================= 啟動 =================
app.listen(5000, () => {
  console.log("🚀 Backend running on http://localhost:5000")
})
