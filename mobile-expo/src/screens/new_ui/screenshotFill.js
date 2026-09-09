import { Image } from "react-native"
import { USE_SCREENSHOT_FILL } from "./flag"

const FALL_URI = Image.resolveAssetSource(require("./fill-shots/fall.jpg")).uri
const SQUAT_URI = Image.resolveAssetSource(require("./fill-shots/squat.jpg")).uri
const SOS_URI = Image.resolveAssetSource(require("./fill-shots/sos.jpg")).uri

export function fillIfEmpty(real, mock) {
  if (!USE_SCREENSHOT_FILL) return Array.isArray(real) ? real : []
  const list = Array.isArray(real) ? real : []
  if (list.length > 0) return list
  return typeof mock === "function" ? mock() : mock
}

export function ensureFilled(real, mock, minCount = 1) {
  if (!USE_SCREENSHOT_FILL) return Array.isArray(real) ? real : []
  const list = Array.isArray(real) ? real : []
  if (list.length >= minCount) return list
  const extra = typeof mock === "function" ? mock() : mock
  const seen = new Set(list.map((row) => String(row?._id || row?.eventId || row?.id || "")))
  const add = extra.filter((row) => !seen.has(String(row?._id || row?.eventId || row?.id || "")))
  return [...add, ...list]
}

export function fillValue(real, mock) {
  if (!USE_SCREENSHOT_FILL) return real
  if (real != null && real !== "") return real
  return typeof mock === "function" ? mock() : mock
}

function recordTimeMs(record) {
  return new Date(
    record?.happenedAt || record?.triggeredAt || record?.createdAt || record?.time || 0
  ).getTime()
}

function recordHasShot(record) {
  const list = Array.isArray(record?.evidence) ? record.evidence : []
  return list.some((item) => item && (item.localUri || item.urlPath))
}

export function mergeWatchRecords(rows) {
  const list = Array.isArray(rows) ? rows : []
  if (!USE_SCREENSHOT_FILL) return list
  const mock = screenshotWatchRecords()
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const startMs = start.getTime()
  const isToday = (record) => {
    const t = recordTimeMs(record)
    return Number.isFinite(t) && t >= startMs
  }
  if (list.some((record) => isToday(record) && recordHasShot(record))) return list
  const older = list.filter((record) => !isToday(record))
  const todayMock = mock.filter(isToday)
  const weekMock = mock.filter((record) => !isToday(record))
  return [...todayMock, ...(older.length ? older : weekMock)]
}

function atDays(daysBack, hour, minute) {
  const d = new Date()
  d.setDate(d.getDate() - daysBack)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function snap(id, uri) {
  return [{
    evidenceId: id,
    mediaType: "snapshot",
    urlPath: "",
    localUri: uri
  }]
}

export function screenshotWatchRecords() {
  return [
    {
      _id: "fill-fall-today",
      eventId: "AB-FILL-TODAY",
      type: "fall",
      severity: "High",
      status: "Done",
      alertBuilt: true,
      happenedAt: atDays(0, 11, 22),
      endedAt: atDays(0, 11, 23),
      handlerName: "王看護",
      resolvedNote: "已查看",
      claimedByUserId: "fill-caregiver",
      evidence: snap("fill-ev-fall-today", FALL_URI)
    },
    {
      _id: "fill-sos-today",
      eventId: "SOS-FILL-TODAY",
      recordKind: "sos",
      type: "sos",
      status: "resolved",
      triggeredAt: atDays(0, 15, 8),
      happenedAt: atDays(0, 15, 8),
      message: "客廳呼叫協助",
      handlerName: "王看護",
      evidence: snap("fill-ev-sos-today", SOS_URI)
    },
    {
      _id: "fill-squat-am",
      eventId: "VE-FILL-SQUAT-AM",
      recordKind: "vision-event",
      type: "squat",
      alertBuilt: false,
      happenedAt: atDays(0, 8, 15),
      evidence: snap("fill-ev-squat-am", SQUAT_URI)
    },
    {
      _id: "fill-bend-am",
      eventId: "VE-FILL-BEND-AM",
      recordKind: "vision-event",
      type: "bend-over",
      alertBuilt: false,
      happenedAt: atDays(0, 10, 40),
      evidence: snap("fill-ev-bend-am", SQUAT_URI)
    },
    {
      _id: "fill-squat-pm",
      eventId: "VE-FILL-SQUAT-PM",
      recordKind: "vision-event",
      type: "squat",
      alertBuilt: false,
      happenedAt: atDays(0, 17, 30),
      evidence: snap("fill-ev-squat-pm", SQUAT_URI)
    },
    {
      _id: "fill-fall-2",
      eventId: "AB-FILL-2",
      type: "fall",
      severity: "High",
      status: "Done",
      alertBuilt: true,
      happenedAt: atDays(2, 19, 6),
      endedAt: atDays(2, 19, 8),
      handlerName: "王看護",
      resolvedNote: "已查看",
      claimedByUserId: "fill-caregiver",
      evidence: snap("fill-ev-fall-2", FALL_URI)
    },
    {
      _id: "fill-squat-1",
      eventId: "VE-FILL-SQUAT-1",
      recordKind: "vision-event",
      type: "squat",
      alertBuilt: false,
      happenedAt: atDays(1, 9, 20),
      evidence: snap("fill-ev-squat-1", SQUAT_URI)
    },
    {
      _id: "fill-bend-3",
      eventId: "VE-FILL-BEND-3",
      recordKind: "vision-event",
      type: "bend-over",
      alertBuilt: false,
      happenedAt: atDays(3, 14, 12),
      evidence: snap("fill-ev-bend-3", SQUAT_URI)
    },
    {
      _id: "fill-sos-4",
      eventId: "SOS-FILL-4",
      recordKind: "sos",
      type: "sos",
      status: "resolved",
      triggeredAt: atDays(4, 21, 44),
      happenedAt: atDays(4, 21, 44),
      message: "夜間起身需要協助",
      handlerName: "王看護",
      evidence: snap("fill-ev-sos-4", SOS_URI)
    },
    {
      _id: "fill-squat-5",
      eventId: "VE-FILL-SQUAT-5",
      recordKind: "vision-event",
      type: "squat",
      alertBuilt: false,
      happenedAt: atDays(5, 7, 50),
      evidence: snap("fill-ev-squat-5", SQUAT_URI)
    },
    {
      _id: "fill-fall-6",
      eventId: "AB-FILL-6",
      type: "fall",
      severity: "High",
      status: "Done",
      alertBuilt: true,
      happenedAt: atDays(6, 16, 33),
      endedAt: atDays(6, 16, 35),
      handlerName: "王看護",
      resolvedNote: "已查看",
      claimedByUserId: "fill-caregiver",
      evidence: snap("fill-ev-fall-6", FALL_URI)
    }
  ].sort((a, b) => new Date(b.happenedAt) - new Date(a.happenedAt))
}

export function screenshotHomeReminders() {
  return [
    {
      _id: "fill-rem-bp",
      category: "vitals",
      content: "上午量血壓",
      time: atDays(0, 8, 0),
      isCompleted: false
    },
    {
      _id: "fill-rem-med",
      category: "med",
      content: "午餐後服降血壓藥",
      time: atDays(0, 12, 30),
      isCompleted: false
    },
    {
      _id: "fill-rem-bath",
      category: "daily_care",
      content: "協助沐浴更衣",
      time: atDays(0, 18, 0),
      isCompleted: false
    }
  ]
}

export function screenshotTodayTasks() {
  return [
    {
      id: "fill-task-bp",
      kind: "template",
      category: "vitals",
      content: "上午量血壓",
      time: "08:00",
      isCompleted: true
    },
    {
      id: "fill-task-med",
      kind: "template",
      category: "med",
      content: "午餐後服降血壓藥",
      time: "12:30",
      isCompleted: false
    },
    {
      id: "fill-task-walk",
      kind: "reminder",
      category: "daily_care",
      content: "客廳慢走 10 分鐘",
      time: "15:00",
      isCompleted: false
    },
    {
      id: "fill-task-bath",
      kind: "template",
      category: "daily_care",
      content: "協助沐浴更衣",
      time: "18:00",
      isCompleted: false
    }
  ]
}

export function screenshotPatientReminders() {
  return screenshotTodayTasks().map((item) => {
    const [hh, mm] = String(item.time).split(":").map(Number)
    return {
      _id: item.id,
      category: item.category,
      content: item.content,
      time: atDays(0, hh || 8, mm || 0),
      isCompleted: item.isCompleted
    }
  })
}

export function screenshotTodayTemplates() {
  return screenshotTodayTasks()
    .filter((item) => item.kind === "template")
    .map((item) => ({
      _id: item.id,
      category: item.category,
      content: item.content,
      time: item.time,
      isCompleted: item.isCompleted
    }))
}

export function screenshotOnceReminders() {
  return screenshotTodayTasks()
    .filter((item) => item.kind === "reminder")
    .map((item) => ({
      _id: item.id,
      category: item.category,
      content: item.content,
      time: atDays(0, Number(item.time.slice(0, 2)), Number(item.time.slice(3, 5))),
      isCompleted: item.isCompleted
    }))
}

export function screenshotCompletedReminders() {
  return [
    {
      _id: "fill-done-1",
      category: "vitals",
      content: "上午量血壓",
      time: atDays(1, 8, 5),
      isCompleted: true,
      completedAt: atDays(1, 8, 12),
      completedByRole: "caregiver"
    },
    {
      _id: "fill-done-2",
      category: "med",
      content: "晚餐後服藥",
      time: atDays(1, 18, 30),
      isCompleted: true,
      completedAt: atDays(1, 18, 40),
      completedByRole: "caregiver"
    },
    {
      _id: "fill-done-3",
      category: "daily_care",
      content: "協助沐浴更衣",
      time: atDays(2, 18, 10),
      isCompleted: true,
      completedAt: atDays(2, 18, 25),
      completedByRole: "caregiver"
    }
  ]
}

export function screenshotBpLatest() {
  return {
    _id: "fill-bp-latest",
    sys: 128,
    dia: 78,
    pulse: 72,
    mood: "平靜",
    measuredAt: atDays(0, 8, 12)
  }
}

export function screenshotBpRecords() {
  const days = [0, 1, 2, 3, 4, 5, 6]
  const rows = []
  days.forEach((d) => {
    rows.push({
      _id: `fill-bp-am-${d}`,
      sys: d === 2 ? 148 : 126 + (d % 3),
      dia: d === 2 ? 92 : 76 + (d % 2),
      pulse: 70 + d,
      mood: d === 2 ? "頭暈" : "平靜",
      measuredAt: atDays(d, 8, 10 + d)
    })
    rows.push({
      _id: `fill-bp-pm-${d}`,
      sys: 122 + (d % 4),
      dia: 74 + (d % 3),
      pulse: 68 + (d % 5),
      mood: "平靜",
      measuredAt: atDays(d, 19, 20)
    })
  })
  return rows
}

export function screenshotDailyRecords() {
  return [
    {
      _id: "fill-daily-1",
      recordedAt: atDays(0, 18, 40),
      createdAt: atDays(0, 18, 40),
      caregiverName: "王看護",
      category: "hygiene",
      content: "晚間協助沐浴，精神尚可",
      sleep: "昨夜約 6 小時，兩次起身如廁",
      bloodPressure: "128/78",
      heartRate: "72",
      temperature: "36.5",
      createdByRole: "caregiver"
    },
    {
      _id: "fill-daily-2",
      recordedAt: atDays(1, 12, 20),
      createdAt: atDays(1, 12, 20),
      caregiverName: "王看護",
      category: "meal",
      content: "午餐進食約八分滿",
      sleep: "",
      bloodPressure: "126/76",
      heartRate: "70",
      temperature: "36.4",
      createdByRole: "caregiver"
    },
    {
      _id: "fill-daily-3",
      recordedAt: atDays(2, 21, 5),
      createdAt: atDays(2, 21, 5),
      caregiverName: "王看護",
      category: "sleep",
      content: "22:30 已躺下休息",
      sleep: "入睡較慢",
      bloodPressure: "",
      heartRate: "",
      temperature: "",
      createdByRole: "caregiver"
    }
  ]
}

export function screenshotDailyDraft() {
  return {
    category: "hygiene",
    content: "晚間協助沐浴，精神尚可",
    note: "左側需扶持，動作放慢",
    obs: {
      sleep: "昨夜約 6 小時，兩次起身如廁",
      bloodPressure: "128/78",
      heartRate: "72",
      temperature: "36.5"
    }
  }
}

export function screenshotHealthCard() {
  return {
    bloodType: "A",
    allergyKeys: ["penicillin"],
    allergyOther: "",
    conditionKeys: ["hypertension", "diabetes"],
    conditionOther: "",
    medicationKeys: ["insulin"],
    medications: "早晚餐後降血壓藥 1 顆",
    deviceKeys: ["glasses", "cane"],
    directiveKeys: [],
    preferredLanguage: "zh",
    notes: "夜間易起身如廁，左側需扶持。"
  }
}

export function decorateInbox(list, myEmail) {
  if (!USE_SCREENSHOT_FILL) return Array.isArray(list) ? list : []
  const rows = Array.isArray(list) ? list : []
  const mock = screenshotInbox(myEmail)
  if (!rows.length) return mock
  return rows.map((row) => {
    if (row.lastAt || row.lastPreview) return row
    const hit = mock.find((item) => item.email === row.email) || mock[0]
    if (!hit) return row
    return {
      ...row,
      lastPreview: hit.lastPreview,
      lastAt: hit.lastAt,
      lastKind: hit.lastKind || "text",
      lastSourceLang: hit.lastSourceLang || "zh",
      unread: row.unread > 0 ? row.unread : hit.unread
    }
  })
}

export function screenshotInbox(myEmail) {
  const me = String(myEmail || "").trim().toLowerCase()
  const rows = [
    {
      email: "patient@test.com",
      name: "陳阿公",
      role: "patient",
      lastPreview: "我吃過藥了",
      lastAt: atDays(0, 12, 40),
      unread: 0
    },
    {
      email: "caregiver@test.com",
      name: "王看護",
      role: "caregiver",
      lastPreview: "下午協助沐浴已完成",
      lastAt: atDays(0, 18, 42),
      unread: 1
    },
    {
      email: "family@test.com",
      name: "林小姐",
      role: "family",
      lastPreview: "晚上記得量血壓",
      lastAt: atDays(0, 19, 5),
      unread: 1
    }
  ]
  return rows
    .filter((row) => row.email !== me)
    .map((row) => ({
      ...row,
      lang: "",
      lastKind: "text",
      lastSourceLang: "zh",
      lastPhraseKey: ""
    }))
}

export function screenshotChatMessages(myEmail, partnerEmail) {
  const me = String(myEmail || "").trim().toLowerCase()
  const partner = String(partnerEmail || "").trim().toLowerCase()
  return [
    {
      _id: "fill-chat-1",
      senderEmail: partner,
      targetEmail: me,
      originalText: "今天精神還可以，午餐有吃完。",
      displayText: "今天精神還可以，午餐有吃完。",
      timestamp: atDays(0, 12, 38)
    },
    {
      _id: "fill-chat-2",
      senderEmail: me,
      targetEmail: partner,
      originalText: "好，下午記得慢走一下。",
      displayText: "好，下午記得慢走一下。",
      timestamp: atDays(0, 12, 41)
    },
    {
      _id: "fill-chat-3",
      senderEmail: partner,
      targetEmail: me,
      originalText: "晚上記得量血壓。",
      displayText: "晚上記得量血壓。",
      timestamp: atDays(0, 18, 40)
    }
  ]
}
