import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { WebView } from "react-native-webview"
import { apiRequest, caregiverSosResolve } from "../lib/api"
import MonthCalendar, { shiftMonth as shiftMonthKey } from "../components/MonthCalendar"
import { formatDateTime, weekdayShortLabels } from "../i18n/dateLocale"
import TranslatedUgcText from "../components/TranslatedUgcText"
import AbnormalReportScreen from "./AbnormalReportScreen"
import { catalogs } from "../i18n/catalogs"
import { catalogPatch } from "../i18n/catalogPatch"
import { catalogSkin } from "../i18n/catalogSkin"
import {
  loadSosPhone,
  saveSosPhone
} from "../lib/storage"
import { colors, night } from "./new_ui/tokens"
import { ensureFilled, screenshotWatchRecords } from "./new_ui/screenshotFill"
import { NightSkinProvider, useNightSkin } from "./new_ui/NightSkin"
import { IconPlay } from "./new_ui/GlassCircle"
import { NeoIcon } from "./new_ui/NeoIcons"

function formatValue(value, lang = "zh") {
  if (value == null || value === "") return "-"
  if (value instanceof Date) return formatDateTime(value, lang)
  if (Array.isArray(value)) return value.map((entry) => formatValue(entry, lang)).join(" / ")
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !["_id", "__v", "userId", "patientUserId", "reporterUserId", "claimedByUserId", "resolvedByUserId"].includes(key))
      .map(([key, entryValue]) => `${key}: ${formatValue(entryValue, lang)}`)
      .join("\n")
  }
  if (typeof value === "string" && /\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return formatDateTime(date, lang)
  }
  return String(value)
}

function normalizeRecords(data, feature) {
  if (feature?.singleRecord) return [data].filter(Boolean)
  if (Array.isArray(data?.records)) return data.records
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data)) return data
  if (data?.record) return [data.record]
  return []
}

function getRecordTitle(record, index, t) {
  return (
    record?.title ||
    record?.eventId ||
    record?.alertId ||
    record?.logId ||
    record?.sessionId ||
    record?.systemId ||
    record?.reminderId ||
    record?.type ||
    record?.category ||
    (t ? t.recordFallbackFn(index) : `Record ${index + 1}`)
  )
}

function getRecordTime(record) {
  return (
    record?.happenedAt ||
    record?.triggeredAt ||
    record?.recordDate ||
    record?.detectedAt ||
    record?.time ||
    record?.createdAt ||
    record?.updatedAt
  )
}

function getRecordId(record) {
  return String(record?._id || record?.eventId || "")
}

function isSosRecord(record) {
  return record?.recordKind === "sos" || String(record?.eventId || "").startsWith("SOS")
}

function isAbnormalEventRecord(record) {
  return typeof record?.eventId === "string" && record.eventId.startsWith("AB-")
}

function isReminderRecord(record) {
  return Boolean(record?.reminderId || (record?.category && record?.content && "isCompleted" in (record || {})))
}

/** "/family/alerts/history" -> "/family/alerts"；用來組 :id/claim、:id/resolve */
function getAlertsBasePath(historyPath) {
  if (typeof historyPath !== "string") return ""
  return historyPath.replace(/\/history$/, "")
}

function resolveMethodOptions(t) {
  return [
    t.resolveFalseAlarm,
    t.resolveStoodSelf,
    t.resolveHelpedUp,
    t.resolveHospital
  ].filter(Boolean)
}

const TYPE_I18N = {
  fall: "alert.type.fall",
  "off-bed": "alert.type.offBed",
  "bed-exit": "alert.type.bedExit",
  squat: "alert.type.squat",
  "bend-over": "alert.type.bendOver",
  "sit-down": "alert.type.sitDown",
  sedentary: "alert.type.sedentary",
  "sos-gesture": "alert.type.sosGesture",
  sos: "alert.type.sos",
  abnormal: "alert.type.abnormal"
}

function lookupI18n(lang, key, fallback) {
  const code = lang || "zh"
  const table = (l) => ({ ...(catalogs[l] || {}), ...(catalogPatch[l] || {}), ...(catalogSkin[l] || {}) })
  return table(code)[key] ?? table("zh")[key] ?? table("en")[key] ?? fallback ?? key
}

function interpolateI18n(lang, key, vars, fallback) {
  let text = lookupI18n(lang, key, fallback)
  if (vars && typeof vars === "object") {
    Object.keys(vars).forEach((k) => {
      text = String(text).replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]))
    })
  }
  return text
}

function sosStatusLabel(status, lang) {
  const key = String(status || "active")
  return lookupI18n(lang, `sos.status.${key}`, lookupI18n(lang, `alert.status.${key}`, key))
}

function formatRelativeTime(value, lang) {
  if (!value) return "—"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return formatAlertTime(value)
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return lookupI18n(lang, "time.justNow", "剛剛")
  if (mins < 60) return interpolateI18n(lang, "time.minutesAgo", { n: mins }, `${mins} 分鐘前`)
  const hours = Math.floor(mins / 60)
  if (hours < 24) return interpolateI18n(lang, "time.hoursAgo", { n: hours }, `${hours} 小時前`)
  const days = Math.floor(hours / 24)
  if (days === 1) return lookupI18n(lang, "time.yesterday", "昨天")
  if (days < 7) return interpolateI18n(lang, "time.daysAgo", { n: days }, `${days} 天前`)
  return formatAlertTime(value)
}

function formatAlertTime(value) {
  if (!value) return "—"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  return `${y}/${m}/${d} ${hh}:${mm}`
}

function formatStampParts(value) {
  if (!value) return { dateLine: "—", timeLine: "", timeShort: "" }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return { dateLine: "—", timeLine: "", timeShort: "" }
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  const ss = String(date.getSeconds()).padStart(2, "0")
  return { dateLine: `${y}/${m}/${d}`, timeLine: `${hh}:${mm}:${ss}`, timeShort: `${hh}:${mm}` }
}

function ledgerEventTitle(record, t, uiLang) {
  if (isSosRecord(record)) return lookupI18n(uiLang, "alert.type.sos", "呼叫")
  const typeLabel = getTypeLabel(record?.type, uiLang)
  if (isRecordOnlyEvent(record)) return typeLabel
  const sev = getDisplaySeverity(record)
  if (sev === "Critical") return `${typeLabel} · ${lookupI18n(uiLang, "alert.severity.Critical", "極高")}`
  if (sev === "High") return `${typeLabel} · ${lookupI18n(uiLang, "alert.severity.High", "高")}`
  return typeLabel
}

function ledgerFollowLine() {
  return ""
}

function urgencyAccentColor(record) {
  if (isSosRecord(record)) return "#d97706"
  const sev = getDisplaySeverity(record)
  if (sev === "Critical") {
    const wave = Number(record?.escalationWave) || 1
    if (wave >= 4) return "#7f1d1d"
    if (wave >= 3) return "#991b1b"
    if (wave >= 2) return "#b91c1c"
    return "#dc2626"
  }
  if (sev === "High" || (isFallLikeType(record?.type) && !isRecordOnlyEvent(record))) return "#e11d48"
  if (sev === "Medium") return "#d97706"
  return "#98a2b3"
}

function sentryCardName(record, uiLang) {
  if (isSosRecord(record)) return lookupI18n(uiLang, "alert.type.sos", "呼叫")
  if (isFallLikeType(record?.type)) return lookupI18n(uiLang, "alert.fallDetectTitle", "跌倒偵測")
  const key = String(record?.type || "").trim().toLowerCase()
  if (key === "squat" || key.includes("squat") || key.includes("蹲")) {
    return lookupI18n(uiLang, "alert.squatRecordTitle", "蹲下記錄")
  }
  if (key.includes("bend") || key.includes("彎")) {
    return lookupI18n(uiLang, "alert.bendRecordTitle", "彎腰記錄")
  }
  return getTypeLabel(record?.type, uiLang)
}

function eventSeekMs(record) {
  const key = String(record?.sourceEventKey || record?.frameTag || record?.eventKey || "")
  const tagged = key.match(/vision-(\d{11,13})/)
  if (tagged) {
    const n = Number(tagged[1])
    if (Number.isFinite(n) && n > 1e12) return n
  }
  const clips = Array.isArray(record?.evidence) ? record.evidence : []
  const start = clips
    .map((item) => new Date(item?.startAt || 0).getTime())
    .find((n) => Number.isFinite(n) && n > 0)
  if (start) return start + 5000
  const at = new Date(getRecordTime(record)).getTime()
  return Number.isFinite(at) ? at : 0
}

function sentryTimeRange(record) {
  const when = eventSeekMs(record) || getRecordTime(record)
  const parts = formatStampParts(when)
  const clock = parts.timeShort || ""
  const recMs = new Date(when).getTime()
  if (Number.isFinite(recMs) && recMs < startOfTodayMs()) {
    const md = String(parts.dateLine || "").replace(/^\d{4}\//, "")
    return md && clock ? `${md} ${clock}` : (clock || md)
  }
  return clock
}

function getTypeLabel(type, lang) {
  if (!type) return "—"
  const key = String(type).trim().toLowerCase().replace(/_/g, "-")
  const i18nKey = TYPE_I18N[key] || TYPE_I18N[String(type)]
  if (i18nKey) return lookupI18n(lang, i18nKey, String(type))
  return String(type)
}

function isManualAlertSource(record) {
  const src = String(record?.source || "").toLowerCase()
  return src.includes("manual")
}

function getSourcedTypeLabel(record, lang) {
  const base = getTypeLabel(record?.type, lang)
  if (isSosRecord(record) || !isFallLikeType(record?.type)) return base
  if (isManualAlertSource(record)) {
    return `${base}（${lookupI18n(lang, "alert.sourceManual", "手動")}）`
  }
  return base
}

function isCoverNote(text) {
  return /被後續|覆蓋／一併|覆蓋結案|一併歸|一併結案/.test(String(text || ""))
}

function isSystemDetectCopy(text) {
  return /偵測到|僅紀錄|僅記錄|不推播/.test(String(text || ""))
}

function detectNoteForType(record, lang) {
  const key = String(record?.type || "").trim().toLowerCase().replace(/_/g, "-")
  if (key === "squat" || key.includes("squat") || key.includes("蹲")) {
    return lookupI18n(lang, "alert.detect.squat", "偵測到蹲下（僅記錄、不推播）")
  }
  if (key.includes("bend") || key.includes("彎")) {
    return lookupI18n(lang, "alert.detect.bendOver", "偵測到彎腰（僅記錄、不推播）")
  }
  if (isFallLikeType(record?.type)) {
    return lookupI18n(lang, "alert.detect.fallRecordOnly", "偵測到跌倒（已通知看護／家屬）")
  }
  return lookupI18n(lang, "alert.detect.recordOnly", "僅記錄、不推播")
}

function publicEventNote(record, lang) {
  const note = typeof record?.resolvedNote === "string" ? record.resolvedNote.trim() : ""
  if (note && !isCoverNote(note)) return note
  const desc = typeof record?.description === "string" ? record.description.trim() : ""
  if (isSystemDetectCopy(desc) || ((!desc || isCoverNote(desc)) && isRecordOnlyEvent(record) && !isSosRecord(record))) {
    return detectNoteForType(record, lang)
  }
  if (!desc || isCoverNote(desc)) return ""
  return desc
    .replace(/（觸發條件[^）]*）/g, "")
    .replace(/[，,]?\s*目前跌倒機率[^。]*/g, "")
    .replace(/[，,]?\s*跌倒機率[^。]*/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function getSeverityLabel(severity, lang) {
  if (!severity) return "—"
  return lookupI18n(lang, `alert.severity.${severity}`, String(severity))
}

function getStatusLabel(status, lang) {
  if (!status) return "—"
  return lookupI18n(lang, `alert.status.${status}`, lookupI18n(lang, `sos.status.${status}`, String(status)))
}

function getAlertBuiltLabel(record, t) {
  if (record?.alertBuilt === false) return t?.recordOnlyShort || "僅紀錄"
  if (record?.alertBuilt === true) return t?.notifiedShort || "已通知"
  if (isAbnormalEventRecord(record)) return t?.notifiedShort || "已通知"
  return "—"
}

function isFallLikeType(type) {
  const key = String(type || "").trim().toLowerCase()
  return key === "fall" || key.includes("fall") || key.includes("跌倒")
}

function isRecordOnlyEvent(record) {
  if (isSosRecord(record)) return false
  if (record?.recordKind === "vision-event") return true
  if (record?.alertBuilt === false) return true
  return !isAbnormalEventRecord(record)
}

/**
 * P0：給使用者看的等級。
 * 「高／極高」只屬於已通報 Alert；僅紀錄（含跌倒未滿 5 秒站起）一律不顯示高。
 */
function getDisplaySeverity(record) {
  if (isRecordOnlyEvent(record)) {
    if (isFallLikeType(record?.type) || record?.severity === "High" || record?.severity === "Critical") {
      return null // 未達通報：標題另寫，不標高
    }
    if (record?.severity === "Medium") return "Medium"
    return "Low"
  }
  return record?.severity || "Medium"
}

function getAlertTitle(record, lang) {
  const typeLabel = getSourcedTypeLabel(record, lang)
  if (isRecordOnlyEvent(record) && (isFallLikeType(record?.type) || record?.severity === "High" || record?.severity === "Critical")) {
    return `${typeLabel}（${lookupI18n(lang, "alert.notEscalatedParen", "未達通報")}）`
  }
  const sev = getDisplaySeverity(record)
  if (!sev) return typeLabel
  return `${getSeverityLabel(sev, lang)} · ${typeLabel}`
}

function getHandlerLabel(record, lang) {
  if (record?.handlerLabel) return record.handlerLabel
  if (record?.claimedByRole === "caregiver") return lookupI18n(lang, "roles.caregiver", "看護")
  if (record?.claimedByRole === "family") return lookupI18n(lang, "roles.family", "家屬")
  return "—"
}

function getResolveNoteLabel(record) {
  const note = typeof record?.resolvedNote === "string" ? record.resolvedNote.trim() : ""
  if (!note || isCoverNote(note)) return "—"
  return note
}

function severityDotColor(severity) {
  if (severity === "High" || severity === "Critical") return "#b42318"
  if (severity === "Medium") return "#b54708"
  if (severity == null) return "#98a2b3" // 未達通報
  return "#667085"
}

function recordHasMedia(record) {
  const list = Array.isArray(record?.evidence) ? record.evidence : []
  return list.some(item => item && (item.urlPath || item.evidenceId || item.localUri))
}

function alertFilterBucket(record) {
  if (isRecordOnlyEvent(record)) return "record"
  if (record?.status === "Done") return "done"
  return "action" // 已通知且未結案
}

function isOpenActionableAlert(record) {
  return isAbnormalEventRecord(record) && !isRecordOnlyEvent(record) && record?.status !== "Done"
}


function toLocalDateKey(value) {
  const raw = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(raw.getTime())) return ""
  const local = new Date(raw.getTime() - raw.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function todayLocalDateKey() {
  return toLocalDateKey(new Date())
}

function buildAlertCalendarDays(monthDateKey, records) {
  const base = new Date(`${monthDateKey}T12:00:00`)
  if (Number.isNaN(base.getTime())) return []
  const year = base.getFullYear()
  const month = base.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const byDay = new Map()
  records.forEach(record => {
    const key = toLocalDateKey(getRecordTime(record))
    if (!key) return
    const list = byDay.get(key) || []
    list.push(record)
    byDay.set(key, list)
  })
  const cells = []
  for (let i = 0; i < firstDay.getDay(); i += 1) {
    cells.push({ key: `blank-${i}`, blank: true })
  }
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const dateKey = toLocalDateKey(new Date(year, month, day, 12))
    const dayRecords = byDay.get(dateKey) || []
    const attention = dayRecords.filter(r => historyClassOf(r) === "attention").length
    const daily = dayRecords.length - attention
    cells.push({
      key: dateKey,
      dateKey,
      day,
      hasAbnormal: attention > 0,
      hasDanger: attention > 0,
      markLabel: dayRecords.length ? String(dayRecords.length) : "",
      _attention: attention,
      _daily: daily
    })
  }
  return cells
}

function groupRecordsByDate(records) {
  const groups = []
  const map = new Map()
  records.forEach(record => {
    const key = toLocalDateKey(getRecordTime(record)) || "__unknown__"
    if (!map.has(key)) {
      const g = { dateKey: key, records: [] }
      map.set(key, g)
      groups.push(g)
    }
    map.get(key).records.push(record)
  })
  return groups
}

/** 歷程日標題：今天／昨天／M月D日 */
function formatHistoryDayLabel(dateKey, lang) {
  const unknown = lookupI18n(lang, "time.unknownDate", "未知日期")
  if (!dateKey || dateKey === "__unknown__" || dateKey === unknown || dateKey === "未知日期") return unknown
  const today = todayLocalDateKey()
  if (dateKey === today) return lookupI18n(lang, "time.today", "今天")
  const yest = new Date()
  yest.setDate(yest.getDate() - 1)
  if (dateKey === toLocalDateKey(yest)) return lookupI18n(lang, "time.yesterday", "昨天")
  const parts = dateKey.split("-")
  if (parts.length !== 3) return dateKey
  return interpolateI18n(lang, "time.md", { m: Number(parts[1]), d: Number(parts[2]) }, `${Number(parts[1])}月${Number(parts[2])}日`)
}

function formatShortRangeLabel(fromKey, toKey) {
  if (!fromKey || !toKey) return ""
  const fmt = key => {
    const [, m, d] = key.split("-")
    return `${Number(m)}/${Number(d)}`
  }
  if (fromKey === toKey) return fmt(fromKey)
  return `${fmt(fromKey)}–${fmt(toKey)}`
}

function isDateKeyInInclusiveRange(dateKey, fromKey, toKey) {
  if (!dateKey || !fromKey || !toKey) return false
  const a = fromKey <= toKey ? fromKey : toKey
  const b = fromKey <= toKey ? toKey : fromKey
  return dateKey >= a && dateKey <= b
}

function normalizeInclusiveRange(fromKey, toKey) {
  if (!fromKey) return { from: toKey, to: toKey }
  if (!toKey) return { from: fromKey, to: fromKey }
  return fromKey <= toKey
    ? { from: fromKey, to: toKey }
    : { from: toKey, to: fromKey }
}

/** 自訂區間：用已載入歷程紀錄算摘要（與 API week/month 同結構） */
function buildClientAlertStats(records, fromKey, toKey) {
  const { from, to } = normalizeInclusiveRange(fromKey, toKey)
  const inRange = records.filter(r => isDateKeyInInclusiveRange(toLocalDateKey(getRecordTime(r)), from, to))
  let alertHigh = 0
  let recordOnly = 0
  let sosCount = 0
  let resolved = 0
  const seriesMap = {}
  const bump = (key, field) => {
    if (!seriesMap[key]) seriesMap[key] = { date: key, alertHigh: 0, recordOnly: 0, sos: 0, resolved: 0, superseded: 0 }
    seriesMap[key][field] += 1
  }
  inRange.forEach(r => {
    const key = toLocalDateKey(getRecordTime(r))
    const klass = historyClassOf(r)
    if (klass === "sos") {
      sosCount += 1
      bump(key, "sos")
    } else if (klass === "fall") {
      alertHigh += 1
      bump(key, "alertHigh")
    } else {
      recordOnly += 1
      bump(key, "recordOnly")
    }
    if (r.status === "Done" || r.status === "resolved") {
      resolved += 1
      bump(key, "resolved")
    }
  })
  const series = []
  const cursor = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  while (cursor <= end) {
    const key = toLocalDateKey(cursor)
    series.push(seriesMap[key] || { date: key, alertHigh: 0, recordOnly: 0, sos: 0, resolved: 0, superseded: 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return {
    range: "custom",
    from,
    to,
    totals: { alertHigh, alertCritical: 0, recordOnly, sosCount, resolved, superseded: 0, avgResolveMinutes: null },
    vsPrevious: { alertHighDelta: null },
    series
  }
}

/** 近 7 日 00:00（含今天）— 與後端 stats week 一致 */
function startOfRolling7Days(date = new Date()) {
  const x = new Date(date)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - 6)
  return x
}

function startOfLocalMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

/** H1：歷程時間窗 */
function isInHistoryRange(record, range) {
  if (range === "all") return true
  const raw = getRecordTime(record)
  const t = raw instanceof Date ? raw : new Date(raw)
  if (Number.isNaN(t.getTime())) return false
  if (range === "week") return t >= startOfRolling7Days()
  if (range === "month") return t >= startOfLocalMonth()
  return true
}

/**
 * H1：歷程等級分類
 * 需關注＝已通報 Alert（高／極高／中）；日常＝僅紀錄／低／未達通報
 */
function historyClassOf(record) {
  if (isSosRecord(record)) return "sos"
  if (isRecordOnlyEvent(record)) return "daily"
  const sev = getDisplaySeverity(record)
  if (isFallLikeType(record?.type) || sev === "High" || sev === "Critical" || sev === "Medium") return "fall"
  return "daily"
}

function matchesHistoryClass(record, historyClass) {
  if (historyClass === "all") return true
  const klass = historyClassOf(record)
  if (historyClass === "attention") return klass === "fall"
  return klass === historyClass
}

function sosHistoryPathForRole(role) {
  if (role === "family") return "/family/sos/history"
  if (role === "patient") return "/patient/sos/history"
  return "/caregiver/sos/history"
}

function asSosHistoryRow(item) {
  return {
    ...item,
    recordKind: "sos",
    type: item?.type || "sos",
    happenedAt: item?.triggeredAt || item?.happenedAt
  }
}

const LIVE_FEED_DAY_SPAN = 14

function isRecentRecord(record, days = LIVE_FEED_DAY_SPAN, now = Date.now()) {
  const t = new Date(getRecordTime(record)).getTime()
  if (!Number.isFinite(t)) return false
  return t >= startOfTodayMs(now) - days * 24 * 60 * 60 * 1000
}

function startOfTodayMs(now = Date.now()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function getFeatureScope(role, feature) {
  const path = feature?.createPath || feature?.historyPath || ""
  const pathRole = path.split("/").filter(Boolean)[0]
  return role || pathRole || "default"
}

const UI_TEXT = {
  zh: {
    back: "返回", refresh: "重新整理", sync: "同步資料", syncing: "同步中...",
    save: "儲存", saving: "儲存中...", noData: "目前沒有資料。",
    addSOS: "緊急求救", addReminder: "新增提醒",
    msg: "求救訊息", loc: "位置", cat: "類別", content: "內容", timeIso: "時間 ISO", note: "備註",
    basicInfo: "基本資料", feature: "功能",
    sosMsg: "我需要緊急協助", sosLoc: "目前位置",
    reminderCat: "用藥提醒", reminderContent: "請記得按時服藥。",
    recordFallbackFn: (i) => `紀錄 ${i + 1}`,
    recordCount: (n) => `${n} 筆紀錄`,
    syncDone: "已同步", createDone: "已送出",
    sosButton: "呼叫", sosSending: "呼叫送出中...",
    sosCancelTitle: "已通知看護與家屬",
    sosCancelSub: "秒內可取消",
    sosCancelBtn: "不小心按到／取消",
    sosCancelDone: "求救已送出",
    sosCancelFail: "取消失敗，求救仍有效",
    sosSentClose: "關閉",
    sosCall119: "需要時撥打 119",
    sosNoCircle: "尚未綁定照護圈時，事件仍會記錄，但可能無人收到推播。",
    sosPhone: "手機號碼", sosPhonePlaceholder: "例如 0912345678",
    savePhone: "儲存手機號碼", savePhoneDone: "已儲存 SOS 聯絡手機",
    phoneModalTitle: "輸入 SOS 手機號碼",
    phoneModalText: "第一次使用 SOS 前需要留下手機號碼，之後會自動帶入並同步到求救紀錄。",
    phoneRequired: "請先輸入手機號碼",
    phoneRequiredSos: "請先輸入並儲存手機號碼後再送出 SOS。",
    later: "稍後",
    firstAidTitle: "急救步驟",
    viewMap: "查看位置", callPhone: "撥打電話", dismiss: "我知道了",
    emergencyTitle: "緊急 SOS",
    emergencyText: "收到新的求救事件，手機已啟動連續震動提醒。",
    emergencyEventId: "事件：", emergencyName: "姓名：", emergencyTime: "時間：",
    emergencyLoc: "位置：", emergencyPhone: "電話：", emergencyMsg: "訊息：",
    submit: "送出", submitting: "送出中...",
    noRecord: "目前沒有紀錄",
    noAlert: "目前沒有需要查看的異常事件",
    claimAlert: "已查看", claimDone: "已查看", resolveAlert: "已查看", resolveDone: "已查看",
    ackAlert: "已查看",
    markHandled: "已處理", handledBy: "已處理",
    resolveNotePlaceholder: "也可自由填寫處理說明…",
    resolvePickMethod: "選擇或填寫處理方式",
    editNote: "修改說明", addNote: "新增說明", saveNote: "儲存說明",
    recordOnlyHint: "僅紀錄（未推播），不必處理。",
    statusNoAction: "無需處理",
    expandDetail: "詳情", collapseDetail: "收合",
    watchClip: "查看影片",
    watchSnap: "查看截圖",
    fallAlertShort: "跌倒通報",
    dailyMoveShort: "蹲下／彎腰",
    jumpToTime: "跳到該秒",
    notifiedShort: "已通知", recordOnlyShort: "僅紀錄",
    fallAlertShort: "跌倒通報", dailyMoveShort: "蹲下／彎腰",
    notEscalated: "未達通報",
    resolveWithSupersede: (n) => `已處理；另有 ${n} 件一併歸入歷程`,
    filterNow: "現在", filterHistory: "歷程",
    filterAll: "全部", filterAction: "待處理", filterDone: "已處理", filterRecord: "僅紀錄",
    rangeWeek: "近 7 天", rangeThisWeek: "本週", rangeMonth: "本月", rangeCustom: "自訂",
    statsToggleShow: "顯示趨勢摘要", statsToggleHide: "收合趨勢摘要",
    weekSummary: "本週摘要", statsSos: "呼叫", statsDotsTitle: "這週發生了什麼",
    chipFall: "跌倒通報", chipDaily: "蹲下／彎腰", chipSos: "呼叫",
    barCompare: "比對通報 vs 日常",
    calendarLegendAlerts: "先選起始日，再選結束日；同一天＝只看當日",
    calendarDone: "完成", calendarRetap: "重選區間",
    pickRangeHintFrom: "選擇起始日", pickRangeHintTo: "選擇結束日",
    classAttention: "需關注", classDaily: "日常紀錄", classAll: "全部等級",
    historyEmpty: "此篩選下沒有歷程",
    filterTimeLabel: "期間",
    filterClassLabel: "類型",
    pickFilter: "選擇篩選",
    manualReport: "手動登記",
    statsAlert: "跌倒通報", statsDaily: "蹲下／彎腰", statsResolved: "已查看",
    statsAvg: "平均處理", statsDelta: "較上期", statsMinutes: "分",
    statsBarTitle: "每天發生次數",
    statsHint: "紅＝跌倒　灰＝蹲下／彎腰（不必處理）",
    statsNoFall: "這段期間沒有跌倒通報",
    statsFallCount: "這段期間跌倒通報 {n} 次",
    statsResolvedHint: "其中 {n} 次已查看",
    fallHighHint: "5秒未起",
    fallWatchLine: (n) => `持續關注 · 再通知 ${n} 次`,
    nowOthersHint: (n) => `另有 ${n} 件未結案，結案最新一筆時將一併歸檔`,
    supersededShort: "覆蓋結案",
    evidenceTitle: "事件證據",
    evidenceClip: "短片",
    evidenceSnap: "截圖",
    absoluteTime: "紀錄時間",
    fieldTime: "時間", fieldType: "類型", fieldLevel: "等級",
    fieldAlertBuilt: "是否回報", fieldStatus: "狀態",
    fieldHandler: "處理人", fieldHow: "如何處理",
    familyReadonlyHint: "家屬僅可監看狀態，處理請由看護操作。",
    plannedTitle: "功能規劃中",
    plannedDesc: "此項目尚在規劃，暫無正式資料。口試／demo 請使用血壓、異常事件、SOS、提醒、聊天等已完成功能。",
    completeReminder: "標記完成", reminderDone: "已完成", reminderPending: "未完成",
    resolveFalseAlarm: "誤報", resolveStoodSelf: "已自行站起",
    resolveHelpedUp: "已協助起身", resolveHospital: "已送醫", resolveOther: "其他",
  },
  en: {
    back: "Back", refresh: "Refresh", sync: "Sync Data", syncing: "Syncing...",
    save: "Save", saving: "Saving...", noData: "No data yet.",
    addSOS: "Emergency SOS", addReminder: "New Reminder",
    msg: "Message", loc: "Location", cat: "Category", content: "Content", timeIso: "Time (ISO)", note: "Note",
    basicInfo: "Basic Info", feature: "Feature",
    sosMsg: "I need emergency help", sosLoc: "Current location",
    reminderCat: "Medication reminder", reminderContent: "Please take your medicine on time.",
    recordFallbackFn: (i) => `Record ${i + 1}`,
    recordCount: (n) => `${n} records`,
    syncDone: "Synced", createDone: "Sent",
    sosButton: "Call", sosSending: "Sending call...",
    sosCancelTitle: "Care circle notified",
    sosCancelSub: "seconds to cancel",
    sosCancelBtn: "Cancel / Accidental",
    sosCancelDone: "SOS sent",
    sosCancelFail: "Cancel failed; SOS still active",
    sosSentClose: "Close",
    sosCall119: "Call 119 if needed",
    sosNoCircle: "If no care circle is linked, the event is saved but push may not reach anyone.",
    sosPhone: "Phone number", sosPhonePlaceholder: "e.g. 0912345678",
    savePhone: "Save phone number", savePhoneDone: "SOS contact phone saved",
    phoneModalTitle: "Enter SOS Phone Number",
    phoneModalText: "You need to provide a phone number before using SOS. It will be saved and auto-filled next time.",
    phoneRequired: "Please enter a phone number first",
    phoneRequiredSos: "Please enter and save your phone number before sending SOS.",
    later: "Later",
    firstAidTitle: "First Aid Steps",
    viewMap: "View Location", callPhone: "Call", dismiss: "Got it",
    emergencyTitle: "Emergency SOS",
    emergencyText: "New SOS event received. Continuous vibration alert started.",
    emergencyEventId: "Event: ", emergencyName: "Name: ", emergencyTime: "Time: ",
    emergencyLoc: "Location: ", emergencyPhone: "Phone: ", emergencyMsg: "Message: ",
    submit: "Submit", submitting: "Submitting...",
    noRecord: "No records yet",
    claimAlert: "Seen", claimDone: "Seen", resolveAlert: "Seen", resolveDone: "Seen",
    ackAlert: "Seen",
    markHandled: "Handled", handledBy: "Handled",
    resolveNotePlaceholder: "Resolution note (optional)",
    noAlert: "No alerts to review",
    resolvePickMethod: "Choose or type how it was handled",
    editNote: "Edit note", addNote: "Add note", saveNote: "Save note",
    recordOnlyHint: "Logged only (not pushed). No action needed.",
    statusNoAction: "No action needed",
    expandDetail: "Details", collapseDetail: "Hide",
    watchClip: "View clip",
    watchSnap: "View snapshot",
    fallAlertShort: "Fall alert",
    dailyMoveShort: "Low stance / bend",
    jumpToTime: "Jump to that second",
    notifiedShort: "Notified", recordOnlyShort: "Logged only",
    notEscalated: "Not escalated",
    resolveWithSupersede: (n) => `Handled; ${n} related events also archived`,
    filterNow: "Now", filterHistory: "History",
    filterAll: "All", filterAction: "Open", filterDone: "Handled", filterRecord: "Logged",
    rangeWeek: "7 days", rangeThisWeek: "This week", rangeMonth: "This month", rangeCustom: "Custom",
    statsToggleShow: "Show trend", statsToggleHide: "Hide trend",
    weekSummary: "This week", statsSos: "Call", statsDotsTitle: "What happened this week",
    chipFall: "Fall alerts", chipDaily: "Low stance / bend", chipSos: "Call",
    barCompare: "Compare alerts vs daily",
    calendarLegendAlerts: "Pick start, then end; same day = that day only",
    calendarDone: "Done", calendarRetap: "Reset range",
    pickRangeHintFrom: "Start date", pickRangeHintTo: "End date",
    classAttention: "Needs attention", classDaily: "Routine", classAll: "All levels",
    historyEmpty: "No history for this filter",
    filterTimeLabel: "Time",
    filterClassLabel: "Type",
    pickFilter: "Filter",
    manualReport: "Log manually",
    statsAlert: "Fall alerts", statsDaily: "Low stance / bend", statsResolved: "Reviewed",
    statsAvg: "Avg. handling", statsDelta: "vs prior", statsMinutes: "min",
    statsBarTitle: "Events per day",
    statsHint: "Red = fall   Grey = low stance / bend (no action needed)",
    statsNoFall: "No fall alerts in this period",
    statsFallCount: "{n} fall alerts in this period",
    statsResolvedHint: "{n} already reviewed",
    fallHighHint: "Not up 5s",
    fallWatchLine: (n) => `Still down · re-alerted ${n}×`,
    nowOthersHint: (n) => `${n} other open items will archive when you close the latest`,
    supersededShort: "Closed with related",
    evidenceTitle: "Evidence",
    evidenceClip: "Clip",
    evidenceSnap: "Photo",
    absoluteTime: "Logged at",
    fieldTime: "Time", fieldType: "Type", fieldLevel: "Level",
    fieldAlertBuilt: "Reported", fieldStatus: "Status",
    fieldHandler: "Handler", fieldHow: "How handled",
    familyReadonlyHint: "Family can view only. Caregiver handles alerts.",
    plannedTitle: "Coming soon",
    plannedDesc: "This item is not live yet. Use blood pressure, alerts, SOS, reminders, and chat.",
    completeReminder: "Mark done", reminderDone: "Done", reminderPending: "Pending",
    resolveFalseAlarm: "False alarm", resolveStoodSelf: "Stood up alone",
    resolveHelpedUp: "Helped up", resolveHospital: "Taken to hospital", resolveOther: "Other",
  },
  id: {
    back: "Kembali", refresh: "Segarkan", sync: "Sinkronkan", syncing: "Menyinkronkan...",
    save: "Simpan", saving: "Menyimpan...", noData: "Belum ada data.",
    addSOS: "SOS Darurat", addReminder: "Pengingat Baru",
    msg: "Pesan darurat", loc: "Lokasi", cat: "Kategori", content: "Isi", timeIso: "Waktu (ISO)", note: "Catatan",
    basicInfo: "Info Dasar", feature: "Fitur",
    sosMsg: "Saya butuh bantuan darurat", sosLoc: "Lokasi saat ini",
    reminderCat: "Pengingat obat", reminderContent: "Harap minum obat tepat waktu.",
    recordFallbackFn: (i) => `Catatan ${i + 1}`,
    recordCount: (n) => `${n} catatan`,
    syncDone: "Disinkronkan", createDone: "Terkirim",
    sosButton: "Panggil", sosSending: "Mengirim panggilan...",
    sosCancelTitle: "Lingkaran perawatan diberitahu",
    sosCancelSub: "detik untuk membatalkan",
    sosCancelBtn: "Batal / Tidak sengaja",
    sosCancelDone: "SOS terkirim",
    sosCancelFail: "Batal gagal; SOS masih aktif",
    sosSentClose: "Tutup",
    sosCall119: "Telepon 119 jika perlu",
    sosNoCircle: "Jika belum ada lingkaran perawatan, acara tetap disimpan tapi push mungkin tidak sampai.",
    sosPhone: "Nomor telepon", sosPhonePlaceholder: "mis. 0912345678",
    savePhone: "Simpan nomor telepon", savePhoneDone: "Nomor telepon SOS tersimpan",
    phoneModalTitle: "Masukkan Nomor Telepon SOS",
    phoneModalText: "Anda perlu memberikan nomor telepon sebelum menggunakan SOS.",
    phoneRequired: "Harap masukkan nomor telepon terlebih dahulu",
    phoneRequiredSos: "Harap masukkan dan simpan nomor telepon sebelum mengirim SOS.",
    later: "Nanti",
    firstAidTitle: "Langkah Pertolongan Pertama",
    viewMap: "Lihat Lokasi", callPhone: "Telepon", dismiss: "Mengerti",
    emergencyTitle: "SOS Darurat",
    emergencyText: "Acara SOS baru diterima. Getaran peringatan dimulai.",
    emergencyEventId: "Acara: ", emergencyName: "Nama: ", emergencyTime: "Waktu: ",
    emergencyLoc: "Lokasi: ", emergencyPhone: "Telepon: ", emergencyMsg: "Pesan: ",
    submit: "Kirim", submitting: "Mengirim...",
    noRecord: "Belum ada catatan",
    claimAlert: "Sudah dilihat", claimDone: "Sudah dilihat", resolveAlert: "Sudah dilihat", resolveDone: "Sudah dilihat",
    ackAlert: "Sudah dilihat",
    resolveNotePlaceholder: "Catatan penyelesaian (opsional)",
    noAlert: "Tidak ada peringatan",
    markHandled: "Selesai",
    resolvePickMethod: "Pilih atau tulis cara penanganan",
    editNote: "Ubah catatan", addNote: "Tambah catatan", saveNote: "Simpan catatan",
    recordOnlyHint: "Hanya tercatat (tidak dikirim). Tidak perlu ditindak.",
    statusNoAction: "Tidak perlu tindakan",
    expandDetail: "Detail", collapseDetail: "Tutup",
    watchClip: "Lihat video",
    watchSnap: "Lihat foto",
    fallAlertShort: "Laporan jatuh",
    dailyMoveShort: "Postur rendah / bungkuk",
    jumpToTime: "Lompat ke detik itu",
    notifiedShort: "Diberitahu", recordOnlyShort: "Tercatat",
    notEscalated: "Tidak dilaporkan",
    resolveWithSupersede: (n) => `Selesai; ${n} peristiwa terkait diarsipkan`,
    filterNow: "Sekarang", filterHistory: "Riwayat",
    filterAll: "Semua", filterAction: "Terbuka", filterDone: "Selesai", filterRecord: "Tercatat",
    rangeWeek: "7 hari", rangeThisWeek: "Minggu ini", rangeMonth: "Bulan ini", rangeCustom: "Kustom",
    statsToggleShow: "Tampilkan tren", statsToggleHide: "Sembunyikan tren",
    weekSummary: "Minggu ini", statsSos: "Panggil", statsDotsTitle: "Yang terjadi minggu ini",
    chipFall: "Laporan jatuh", chipDaily: "Postur rendah / bungkuk", chipSos: "Panggil",
    barCompare: "Bandingkan laporan vs rutin",
    calendarLegendAlerts: "Pilih tanggal mulai, lalu akhir; hari sama = hari itu saja",
    calendarDone: "Selesai", calendarRetap: "Pilih ulang",
    pickRangeHintFrom: "Tanggal mulai", pickRangeHintTo: "Tanggal akhir",
    classAttention: "Perlu perhatian", classDaily: "Rutin", classAll: "Semua tingkat",
    historyEmpty: "Tidak ada riwayat untuk filter ini",
    filterTimeLabel: "Waktu",
    filterClassLabel: "Jenis",
    pickFilter: "Filter",
    manualReport: "Catat manual",
    statsAlert: "Dilaporkan", statsDaily: "Rutin", statsResolved: "Selesai",
    statsAvg: "Rata-rata", statsDelta: "vs sebelumnya", statsMinutes: "mnt",
    statsBarTitle: "Minggu ini: merah = dilaporkan | abu = rutin",
    statsHint: "Merah = jatuh   Abu = postur rendah / bungkuk (tidak perlu tindakan)",
    statsNoFall: "Tidak ada laporan jatuh di periode ini",
    statsFallCount: "{n} laporan jatuh di periode ini",
    statsResolvedHint: "{n} sudah dilihat",
    fallHighHint: "Belum bangun 5 dtk",
    fallWatchLine: (n) => `Masih di lantai · diingatkan lagi ${n}×`,
    nowEmpty: "Tidak ada peringatan terbuka",
    nowOthersHint: (n) => `${n} item lain akan diarsip saat yang terbaru ditutup`,
    supersededShort: "Ditutup bersama",
    evidenceTitle: "Bukti",
    evidenceClip: "Klip",
    evidenceSnap: "Foto",
    absoluteTime: "Waktu catat",
    fieldTime: "Waktu", fieldType: "Jenis", fieldLevel: "Tingkat",
    fieldAlertBuilt: "Dilaporkan", fieldStatus: "Status",
    fieldHandler: "Penangan", fieldHow: "Cara ditangani",
    familyReadonlyHint: "Keluarga hanya melihat. Pengasuh yang menindak.",
    plannedTitle: "Segera hadir",
    plannedDesc: "Fitur ini belum aktif. Gunakan tekanan darah, peringatan, SOS, pengingat, dan chat.",
    completeReminder: "Tandai selesai", reminderDone: "Selesai", reminderPending: "Tertunda",
    resolveFalseAlarm: "Alarm palsu", resolveStoodSelf: "Berdiri sendiri",
    resolveHelpedUp: "Dibantu berdiri", resolveHospital: "Dibawa ke rumah sakit", resolveOther: "Lainnya",
  },
  vi: {
    back: "Quay Lại", refresh: "Làm Mới", sync: "Đồng Bộ", syncing: "Đang đồng bộ...",
    save: "Lưu", saving: "Đang lưu...", noData: "Chưa có dữ liệu.",
    addSOS: "SOS Khẩn Cấp", addReminder: "Nhắc Nhở Mới",
    msg: "Tin nhắn khẩn cấp", loc: "Vị trí", cat: "Danh mục", content: "Nội dung", timeIso: "Thời gian (ISO)", note: "Ghi chú",
    basicInfo: "Thông Tin Cơ Bản", feature: "Tính Năng",
    sosMsg: "Tôi cần trợ giúp khẩn cấp", sosLoc: "Vị trí hiện tại",
    reminderCat: "Nhắc uống thuốc", reminderContent: "Vui lòng uống thuốc đúng giờ.",
    recordFallbackFn: (i) => `Bản ghi ${i + 1}`,
    recordCount: (n) => `${n} bản ghi`,
    syncDone: "Đã đồng bộ", createDone: "Đã gửi",
    sosButton: "Gọi", sosSending: "Đang gửi lời gọi...",
    sosCancelTitle: "Đã thông báo vòng chăm sóc",
    sosCancelSub: "giây để hủy",
    sosCancelBtn: "Hủy / Nhấn nhầm",
    sosCancelDone: "Đã gửi SOS",
    sosCancelFail: "Hủy thất bại; SOS vẫn hiệu lực",
    sosSentClose: "Đóng",
    sosCall119: "Gọi 119 nếu cần",
    sosNoCircle: "Nếu chưa liên kết vòng chăm sóc, sự kiện vẫn được lưu nhưng có thể không ai nhận push.",
    sosPhone: "Số điện thoại", sosPhonePlaceholder: "vd. 0912345678",
    savePhone: "Lưu số điện thoại", savePhoneDone: "Đã lưu số điện thoại SOS",
    phoneModalTitle: "Nhập Số Điện Thoại SOS",
    phoneModalText: "Bạn cần cung cấp số điện thoại trước khi sử dụng SOS.",
    phoneRequired: "Vui lòng nhập số điện thoại trước",
    phoneRequiredSos: "Vui lòng nhập và lưu số điện thoại trước khi gửi SOS.",
    later: "Để sau",
    firstAidTitle: "Các Bước Sơ Cứu",
    viewMap: "Xem Vị Trí", callPhone: "Gọi Điện", dismiss: "Đã hiểu",
    emergencyTitle: "SOS Khẩn Cấp",
    emergencyText: "Nhận được sự kiện SOS mới. Đã bắt đầu rung liên tục.",
    emergencyEventId: "Sự kiện: ", emergencyName: "Tên: ", emergencyTime: "Thời gian: ",
    emergencyLoc: "Vị trí: ", emergencyPhone: "Điện thoại: ", emergencyMsg: "Tin nhắn: ",
    submit: "Gửi", submitting: "Đang gửi...",
    noRecord: "Chưa có bản ghi",
    claimAlert: "Đã xem", claimDone: "Đã xem", resolveAlert: "Đã xem", resolveDone: "Đã xem",
    ackAlert: "Đã xem",
    resolveNotePlaceholder: "Ghi chú xử lý (tùy chọn)",
    noAlert: "Không có cảnh báo cần xem",
    markHandled: "Đã xử lý",
    resolvePickMethod: "Chọn hoặc ghi cách xử lý",
    editNote: "Sửa ghi chú", addNote: "Thêm ghi chú", saveNote: "Lưu ghi chú",
    recordOnlyHint: "Chỉ ghi nhận (không đẩy tin). Không cần xử lý.",
    statusNoAction: "Không cần xử lý",
    expandDetail: "Chi tiết", collapseDetail: "Thu gọn",
    watchClip: "Xem video",
    watchSnap: "Xem ảnh",
    fallAlertShort: "Báo ngã",
    dailyMoveShort: "Tư thế thấp / cúi",
    jumpToTime: "Nhảy tới giây đó",
    notifiedShort: "Đã báo", recordOnlyShort: "Chỉ ghi",
    notEscalated: "Chưa báo",
    resolveWithSupersede: (n) => `Đã xử lý; thêm ${n} sự kiện được lưu vào lịch sử`,
    filterNow: "Hiện tại", filterHistory: "Lịch sử",
    filterAll: "Tất cả", filterAction: "Chưa xử lý", filterDone: "Đã xử lý", filterRecord: "Chỉ ghi",
    rangeWeek: "7 ngày", rangeThisWeek: "Tuần này", rangeMonth: "Tháng này", rangeCustom: "Tùy chọn",
    statsToggleShow: "Hiện xu hướng", statsToggleHide: "Ẩn xu hướng",
    weekSummary: "Tuần này", statsSos: "Gọi", statsDotsTitle: "Tuần này xảy ra gì",
    chipFall: "Báo ngã", chipDaily: "Tư thế thấp / cúi", chipSos: "Gọi",
    barCompare: "So sánh báo ngã và thường ngày",
    calendarLegendAlerts: "Chọn ngày bắt đầu, rồi ngày kết thúc; cùng ngày = chỉ hôm đó",
    calendarDone: "Xong", calendarRetap: "Chọn lại khoảng",
    pickRangeHintFrom: "Ngày bắt đầu", pickRangeHintTo: "Ngày kết thúc",
    classAttention: "Cần chú ý", classDaily: "Thường nhật", classAll: "Mọi mức",
    historyEmpty: "Không có lịch sử với bộ lọc này",
    filterTimeLabel: "Thời gian",
    filterClassLabel: "Loại",
    pickFilter: "Bộ lọc",
    manualReport: "Ghi tay",
    statsAlert: "Ngã", statsDaily: "Động tác thường", statsResolved: "Đã xem",
    statsAvg: "Xử lý TB", statsDelta: "so với trước", statsMinutes: "phút",
    statsBarTitle: "Số lần mỗi ngày",
    statsHint: "Đỏ = ngã   Xám = tư thế thấp / cúi (không cần xử lý)",
    statsNoFall: "Không có báo ngã trong kỳ này",
    statsFallCount: "Có {n} lần báo ngã trong kỳ này",
    statsResolvedHint: "Trong đó {n} lần đã xem",
    fallHighHint: "Chưa dậy 5 giây",
    fallWatchLine: (n) => `Vẫn nằm · đã báo lại ${n} lần`,
    nowEmpty: "Không có cảnh báo cần xử lý",
    nowOthersHint: (n) => `Còn ${n} mục chưa đóng; đóng mục mới nhất sẽ lưu cùng`,
    supersededShort: "Đóng cùng nhóm",
    evidenceTitle: "Bằng chứng",
    evidenceClip: "Clip",
    evidenceSnap: "Ảnh",
    absoluteTime: "Thời điểm ghi",
    fieldTime: "Thời gian", fieldType: "Loại", fieldLevel: "Mức",
    fieldAlertBuilt: "Đã báo", fieldStatus: "Trạng thái",
    fieldHandler: "Người xử lý", fieldHow: "Cách xử lý",
    familyReadonlyHint: "Gia đình chỉ xem. Người chăm sóc xử lý cảnh báo.",
    plannedTitle: "Sắp có",
    plannedDesc: "Mục này chưa mở. Hãy dùng huyết áp, cảnh báo, SOS, nhắc nhở và chat.",
    completeReminder: "Đánh dấu xong", reminderDone: "Xong", reminderPending: "Chờ xử lý",
    resolveFalseAlarm: "Báo nhầm", resolveStoodSelf: "Tự đứng dậy",
    resolveHelpedUp: "Được đỡ dậy", resolveHospital: "Đã đưa đi viện", resolveOther: "Khác",
  },
  tl: {
    back: "Bumalik", refresh: "I-refresh", sync: "I-sync", syncing: "Nagsi-sync...",
    save: "I-save", saving: "Sine-save...", noData: "Wala pang data.",
    addSOS: "Emergency SOS", addReminder: "Bagong Paalala",
    msg: "Mensaheng pang-emergency", loc: "Lokasyon", cat: "Kategorya", content: "Nilalaman", timeIso: "Oras (ISO)", note: "Tala",
    basicInfo: "Pangunahing Impormasyon", feature: "Tampok",
    sosMsg: "Kailangan ko ng tulong", sosLoc: "Kasalukuyang lokasyon",
    reminderCat: "Paalala sa gamot", reminderContent: "Mangyaring uminom ng gamot sa tamang oras.",
    recordFallbackFn: (i) => `Talaan ${i + 1}`,
    recordCount: (n) => `${n} talaan`,
    syncDone: "Na-sync", createDone: "Naipadala",
    sosButton: "Tawag", sosSending: "Nagpapadala ng tawag...",
    sosCancelTitle: "Naabisuhan ang care circle",
    sosCancelSub: "segundo para kanselahin",
    sosCancelBtn: "Kanselahin / Aksidente",
    sosCancelDone: "Naipadala ang SOS",
    sosCancelFail: "Hindi nakansela; aktibo pa ang SOS",
    sosSentClose: "Isara",
    sosCall119: "Tawagan ang 119 kung kailangan",
    sosNoCircle: "Kung walang care circle, naka-save ang event pero maaaring walang makatanggap ng push.",
    sosPhone: "Numero ng telepono", sosPhonePlaceholder: "hal. 0912345678",
    savePhone: "I-save ang numero", savePhoneDone: "Na-save ang SOS na numero ng telepono",
    phoneModalTitle: "Ilagay ang SOS Phone Number",
    phoneModalText: "Kailangan mong magbigay ng numero ng telepono bago gamitin ang SOS.",
    phoneRequired: "Mangyaring maglagay muna ng numero ng telepono",
    phoneRequiredSos: "Mangyaring ilagay at i-save ang numero ng telepono bago magpadala ng SOS.",
    later: "Mamaya",
    firstAidTitle: "Mga Hakbang sa First Aid",
    viewMap: "Tingnan ang Lokasyon", callPhone: "Tumawag", dismiss: "Naintindihan ko",
    emergencyTitle: "Emergency SOS",
    emergencyText: "Natanggap ang bagong SOS event. Nagsimula ang patuloy na pag-vibrate.",
    emergencyEventId: "Event: ", emergencyName: "Pangalan: ", emergencyTime: "Oras: ",
    emergencyLoc: "Lokasyon: ", emergencyPhone: "Telepono: ", emergencyMsg: "Mensahe: ",
    submit: "Isumite", submitting: "Isinusumite...",
    noRecord: "Wala pang talaan",
    claimAlert: "Nakita na", claimDone: "Nakita na", resolveAlert: "Nakita na", resolveDone: "Nakita na",
    ackAlert: "Nakita na",
    resolveNotePlaceholder: "Tala ng resolusyon (opsyonal)",
    noAlert: "Walang alerto",
    markHandled: "Tapos na",
    resolvePickMethod: "Pumili o i-type kung paano naayos",
    editNote: "I-edit ang tala", addNote: "Magdagdag ng tala", saveNote: "I-save ang tala",
    recordOnlyHint: "Naka-log lang (hindi na-push). Walang aksyon.",
    statusNoAction: "Walang kailangang gawin",
    expandDetail: "Detalye", collapseDetail: "Itago",
    watchClip: "Panoorin ang video",
    watchSnap: "Tingnan ang larawan",
    fallAlertShort: "Alerto sa hulog",
    dailyMoveShort: "Mababang tindig / yuko",
    jumpToTime: "Tumalon sa segundong iyon",
    notifiedShort: "Naabisuhan", recordOnlyShort: "Naka-log",
    notEscalated: "Hindi naiulat",
    resolveWithSupersede: (n) => `Naayos; ${n} kaugnay na event naka-archive`,
    filterNow: "Ngayon", filterHistory: "Kasaysayan",
    filterAll: "Lahat", filterAction: "Bukas", filterDone: "Tapos", filterRecord: "Naka-log",
    rangeWeek: "7 araw", rangeThisWeek: "Linggong ito", rangeMonth: "Buwan na ito", rangeCustom: "Custom",
    statsToggleShow: "Ipakita ang trend", statsToggleHide: "Itago ang trend",
    weekSummary: "Linggong ito", statsSos: "Tawag", statsDotsTitle: "Ano ang nangyari",
    chipFall: "Alerto sa hulog", chipDaily: "Mababang tindig / yuko", chipSos: "Tawag",
    barCompare: "Ihambing ang alerto at pang-araw-araw",
    calendarLegendAlerts: "Pumili ng simula, tapos ang dulo; parehong araw = araw na iyon",
    calendarDone: "Tapos", calendarRetap: "I-reset",
    pickRangeHintFrom: "Petsa ng simula", pickRangeHintTo: "Petsa ng dulo",
    classAttention: "Kailangan ng pansin", classDaily: "Pang-araw-araw", classAll: "Lahat ng antas",
    historyEmpty: "Walang kasaysayan sa filter na ito",
    filterTimeLabel: "Oras",
    filterClassLabel: "Uri",
    pickFilter: "Filter",
    manualReport: "I-log mismo",
    statsAlert: "Naiulat", statsDaily: "Pang-araw-araw", statsResolved: "Tapos",
    statsAvg: "Avg.", statsDelta: "vs dati", statsMinutes: "min",
    statsBarTitle: "Linggong ito: pula = naiulat | abo = pang-araw-araw",
    statsHint: "Pula = hulog   Abo = mababang tindig / yuko (walang aksyon)",
    statsNoFall: "Walang alerto sa hulog sa panahong ito",
    statsFallCount: "{n} alerto sa hulog sa panahong ito",
    statsResolvedHint: "{n} nakita na",
    fallHighHint: "Hindi pa tumayo 5s",
    fallWatchLine: (n) => `Nasa sahig pa · naalerto ulit ${n}×`,
    nowEmpty: "Walang bukas na alerto",
    nowOthersHint: (n) => `${n} pang bukas; maisa-archive kapag isinara ang pinakabago`,
    supersededShort: "Isinara kasama",
    evidenceTitle: "Ebidensya",
    evidenceClip: "Clip",
    evidenceSnap: "Larawan",
    absoluteTime: "Oras ng tala",
    fieldTime: "Oras", fieldType: "Uri", fieldLevel: "Antas",
    fieldAlertBuilt: "Naiulat", fieldStatus: "Status",
    fieldHandler: "Humawak", fieldHow: "Paano naayos",
    familyReadonlyHint: "Pamilya tumitingin lang. Caregiver ang humahawak.",
    plannedTitle: "Malapit na",
    plannedDesc: "Hindi pa live. Gamitin ang BP, alerto, SOS, paalala, at chat.",
    completeReminder: "Markahan tapos", reminderDone: "Tapos", reminderPending: "Nakabinbin",
    resolveFalseAlarm: "Maling alarma", resolveStoodSelf: "Tumayo mag-isa",
    resolveHelpedUp: "Tinulungan tumayo", resolveHospital: "Dinala sa ospital", resolveOther: "Iba",
  },
  th: {
    back: "กลับ", refresh: "รีเฟรช", sync: "ซิงค์ข้อมูล", syncing: "กำลังซิงค์...",
    save: "บันทึก", saving: "กำลังบันทึก...", noData: "ยังไม่มีข้อมูล",
    addSOS: "SOS ฉุกเฉิน", addReminder: "การแจ้งเตือนใหม่",
    msg: "ข้อความฉุกเฉิน", loc: "ตำแหน่ง", cat: "หมวดหมู่", content: "เนื้อหา", timeIso: "เวลา (ISO)", note: "หมายเหตุ",
    basicInfo: "ข้อมูลพื้นฐาน", feature: "คุณสมบัติ",
    sosMsg: "ฉันต้องการความช่วยเหลือด่วน", sosLoc: "ตำแหน่งปัจจุบัน",
    reminderCat: "เตือนทานยา", reminderContent: "กรุณาทานยาตามเวลา",
    recordFallbackFn: (i) => `บันทึก ${i + 1}`,
    recordCount: (n) => `${n} รายการ`,
    syncDone: "ซิงค์แล้ว", createDone: "ส่งแล้ว",
    sosButton: "เรียก", sosSending: "กำลังส่งการเรียก...",
    sosCancelTitle: "แจ้งวงจรผู้ดูแลแล้ว",
    sosCancelSub: "วินาทีสำหรับยกเลิก",
    sosCancelBtn: "ยกเลิก / กดผิด",
    sosCancelDone: "ส่ง SOS แล้ว",
    sosCancelFail: "ยกเลิกไม่สำเร็จ SOS ยังมีผล",
    sosSentClose: "ปิด",
    sosCall119: "โทร 119 เมื่อจำเป็น",
    sosNoCircle: "หากยังไม่ผูกวงจรผู้ดูแล เหตุการณ์ยังถูกบันทึกแต่อาจไม่มีใครได้รับ push",
    sosPhone: "หมายเลขโทรศัพท์", sosPhonePlaceholder: "เช่น 0912345678",
    savePhone: "บันทึกหมายเลขโทรศัพท์", savePhoneDone: "บันทึกหมายเลข SOS แล้ว",
    phoneModalTitle: "ใส่หมายเลขโทรศัพท์ SOS",
    phoneModalText: "คุณต้องระบุหมายเลขโทรศัพท์ก่อนใช้ SOS",
    phoneRequired: "กรุณาใส่หมายเลขโทรศัพท์ก่อน",
    phoneRequiredSos: "กรุณาใส่และบันทึกหมายเลขโทรศัพท์ก่อนส่ง SOS",
    later: "ภายหลัง",
    firstAidTitle: "ขั้นตอนการปฐมพยาบาล",
    viewMap: "ดูตำแหน่ง", callPhone: "โทรออก", dismiss: "รับทราบ",
    emergencyTitle: "SOS ฉุกเฉิน",
    emergencyText: "ได้รับเหตุการณ์ SOS ใหม่ เริ่มการสั่นสะเทือนต่อเนื่องแล้ว",
    emergencyEventId: "เหตุการณ์: ", emergencyName: "ชื่อ: ", emergencyTime: "เวลา: ",
    emergencyLoc: "ตำแหน่ง: ", emergencyPhone: "โทรศัพท์: ", emergencyMsg: "ข้อความ: ",
    submit: "ส่ง", submitting: "กำลังส่ง...",
    noRecord: "ยังไม่มีบันทึก",
    claimAlert: "ดูแล้ว", claimDone: "ดูแล้ว", resolveAlert: "ดูแล้ว", resolveDone: "ดูแล้ว",
    ackAlert: "ดูแล้ว",
    resolveNotePlaceholder: "หมายเหตุการจัดการ (ไม่บังคับ)",
    noAlert: "ไม่มีเหตุต้องดู",
    markHandled: "จัดการแล้ว",
    resolvePickMethod: "เลือกหรือพิมพ์วิธีจัดการ",
    editNote: "แก้หมายเหตุ", addNote: "เพิ่มหมายเหตุ", saveNote: "บันทึกหมายเหตุ",
    recordOnlyHint: "บันทึกอย่างเดียว (ไม่แจ้ง) ไม่ต้องจัดการ",
    statusNoAction: "ไม่ต้องจัดการ",
    expandDetail: "รายละเอียด", collapseDetail: "ย่อ",
    watchClip: "ชมวิดีโอ",
    watchSnap: "ดูรูป",
    fallAlertShort: "แจ้งล้ม",
    dailyMoveShort: "ท่าทางต่ำ / ก้ม",
    jumpToTime: "ไปวินาทีนั้น",
    notifiedShort: "แจ้งแล้ว", recordOnlyShort: "บันทึกอย่างเดียว",
    notEscalated: "ยังไม่แจ้ง",
    resolveWithSupersede: (n) => `จัดการแล้ว เก็บอีก ${n} เหตุการณ์เข้าประวัติ`,
    filterNow: "ตอนนี้", filterHistory: "ประวัติ",
    filterAll: "ทั้งหมด", filterAction: "ยังไม่จัดการ", filterDone: "จัดการแล้ว", filterRecord: "บันทึก",
    rangeWeek: "7 วัน", rangeThisWeek: "สัปดาห์นี้", rangeMonth: "เดือนนี้", rangeCustom: "กำหนดเอง",
    statsToggleShow: "แสดงแนวโน้ม", statsToggleHide: "ซ่อนแนวโน้ม",
    weekSummary: "สัปดาห์นี้", statsSos: "เรียก", statsDotsTitle: "สัปดาห์นี้เกิดอะไร",
    chipFall: "แจ้งล้ม", chipDaily: "ท่าทางต่ำ / ก้ม", chipSos: "เรียก",
    barCompare: "เทียบการแจ้งกับประจำวัน",
    calendarLegendAlerts: "เลือกวันเริ่ม แล้ววันสิ้นสุด วันเดียวกัน = ดูแค่วันนั้น",
    calendarDone: "เสร็จ", calendarRetap: "เลือกช่วงใหม่",
    pickRangeHintFrom: "วันเริ่ม", pickRangeHintTo: "วันสิ้นสุด",
    classAttention: "ต้องใส่ใจ", classDaily: "ประจำวัน", classAll: "ทุกระดับ",
    historyEmpty: "ไม่มีประวัติตามตัวกรองนี้",
    filterTimeLabel: "เวลา",
    filterClassLabel: "ประเภท",
    pickFilter: "ตัวกรอง",
    manualReport: "บันทึกมือ",
    statsAlert: "แจ้งแล้ว", statsDaily: "ประจำวัน", statsResolved: "จัดการแล้ว",
    statsAvg: "เฉลี่ย", statsDelta: "เทียบก่อน", statsMinutes: "นาที",
    statsBarTitle: "สัปดาห์นี้: แดง = แจ้ง | เทา = ประจำวัน",
    statsHint: "แดง = ล้ม   เทา = ท่าทางต่ำ / ก้ม (ไม่ต้องจัดการ)",
    statsNoFall: "ช่วงนี้ไม่มีแจ้งล้ม",
    statsFallCount: "ช่วงนี้แจ้งล้ม {n} ครั้ง",
    statsResolvedHint: "ดูแล้ว {n} ครั้ง",
    fallHighHint: "ยังไม่ลุก 5 วินาที",
    fallWatchLine: (n) => `ยังนอนอยู่ · แจ้งซ้ำ ${n} ครั้ง`,
    nowEmpty: "ไม่มีเหตุต้องจัดการ",
    nowOthersHint: (n) => `อีก ${n} รายการจะถูกเก็บเมื่อปิดรายการล่าสุด`,
    supersededShort: "ปิดพร้อมกลุ่ม",
    evidenceTitle: "หลักฐาน",
    evidenceClip: "คลิป",
    evidenceSnap: "รูป",
    absoluteTime: "เวลาที่บันทึก",
    fieldTime: "เวลา", fieldType: "ประเภท", fieldLevel: "ระดับ",
    fieldAlertBuilt: "แจ้งแล้ว", fieldStatus: "สถานะ",
    fieldHandler: "ผู้จัดการ", fieldHow: "วิธีจัดการ",
    familyReadonlyHint: "ครอบครัวดูได้อย่างเดียว ผู้ดูแลเป็นผู้จัดการ",
    plannedTitle: "เร็วๆ นี้",
    plannedDesc: "ยังไม่เปิดใช้ ใช้ความดัน แจ้งเตือน SOS การเตือน และแชท",
    completeReminder: "ทำเครื่องหมายเสร็จ", reminderDone: "เสร็จ", reminderPending: "ยังไม่เสร็จ",
    resolveFalseAlarm: "แจ้งเตือนผิด", resolveStoodSelf: "ลุกขึ้นเอง",
    resolveHelpedUp: "ช่วยพยุงขึ้น", resolveHospital: "นำส่งโรงพยาบาล", resolveOther: "อื่นๆ",
  },
}

function evidenceFileUrl(apiBaseUrl, urlPath, token) {
  const base = String(apiBaseUrl || "").replace(/\/+$/, "")
  const path = String(urlPath || "")
  if (!base || !path) return ""
  const url = `${base}${path}`
  if (!token) return url
  return `${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`
}

function evidenceVideoPage(src) {
  const safe = String(src || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;")
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>
html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden}
video{width:100%;height:100%;object-fit:contain;background:#000}
</style></head><body><video controls playsinline webkit-playsinline src="${safe}"></video></body></html>`
}

function evidenceThumbUrl(apiBaseUrl, evidenceList, token) {
  const list = Array.isArray(evidenceList) ? evidenceList : []
  const snap = list.find(item => item?.mediaType === "snapshot" && (item.urlPath || item.evidenceId || item.localUri))
  if (snap?.localUri) return snap.localUri
  if (snap?.urlPath) return evidenceFileUrl(apiBaseUrl, snap.urlPath, token)
  const clip = list.find(item => item?.mediaType === "clip" && (item.urlPath || item.evidenceId || item.localUri))
  if (clip?.localUri) return clip.localUri
  if (clip?.urlPath) return evidenceFileUrl(apiBaseUrl, `${clip.urlPath}/thumb`, token)
  return ""
}

function AlertRecordCard({ record, t, alertLifecycle, readOnly, emphasize, apiBaseUrl, token, uiLang, onJumpToTime, compact, ledger }) {
  const nightOn = useNightSkin()
  const [noteDraft, setNoteDraft] = useState(record?.resolvedNote || "")
  const [pickedMethod, setPickedMethod] = useState("")
  const [editingNote, setEditingNote] = useState(false)
  const [expanded, setExpanded] = useState(Boolean(emphasize))
  const recordOnly = isRecordOnlyEvent(record)
  const canActOnAlert = Boolean(alertLifecycle) && !readOnly && isAbnormalEventRecord(record) && !recordOnly
  const isResolved = record?.status === "Done"
  const isClaimed = Boolean(record?.claimedByUserId) || record?.status === "Processing"
  const isBusy = canActOnAlert && alertLifecycle.busyId === getRecordId(record)
  const resolveNote = (noteDraft || "").trim() || pickedMethod
  const activityRow = !emphasize // 歷程＝Tapo 活動列；「現在」大卡另走

  const displaySeverity = getDisplaySeverity(record)
  const accentColor = compact ? urgencyAccentColor(record) : null
  const statusValue = recordOnly
    ? (t.statusNoAction || "無需處理")
    : getStatusLabel(record?.status, uiLang)
  const notifyShort = recordOnly && !isFallLikeType(record?.type)
    ? (t.recordOnlyShort || "僅紀錄")
    : (t.notifiedShort || "已通知")
  const howShort = getResolveNoteLabel(record)
  const handlerShort = getHandlerLabel(record, uiLang)
  const levelDetail = displaySeverity
    ? getSeverityLabel(displaySeverity, uiLang)
    : (t.notEscalated || "未達通報")
  const relative = formatRelativeTime(getRecordTime(record), uiLang)
  const stamp = formatStampParts(getRecordTime(record))
  const plainTitle = ledgerEventTitle(record, t, uiLang)
  const shownNote = publicEventNote(record, uiLang)
  const followLine = ledgerFollowLine(record, t, uiLang)
  const hasWrittenNote = Boolean(String(record?.resolvedNote || "").trim())
  const showMedia = !ledger
  const isVideoEvent = isFallLikeType(record?.type) && !recordOnly
  const jumpTs = eventSeekMs(record)
  const canSeek = Boolean(onJumpToTime) && Number.isFinite(jumpTs) && jumpTs > 0
  const canJump = canSeek && isFallLikeType(record?.type)
  const jumpToEvent = () => {
    if (canSeek) onJumpToTime(jumpTs)
  }
  const evidenceList = Array.isArray(record?.evidence) ? record.evidence : []
  const hasClip = evidenceList.some(item => item?.mediaType === "clip" && (item?.urlPath || item?.evidenceId))
  const evidenceForUi = hasClip
    ? evidenceList.filter(item => item?.mediaType === "clip")
    : evidenceList.filter(item => item?.mediaType === "snapshot")
  const thumbUri = evidenceThumbUrl(apiBaseUrl, evidenceList, token)

  // 活動列一句狀態；大卡可多一點
  const summaryBits = activityRow
    ? (isResolved && howShort !== "—"
      ? [statusValue, howShort]
      : recordOnly
        ? [notifyShort]
        : isClaimed && !isResolved && handlerShort !== "—"
          ? [statusValue, handlerShort]
          : [statusValue])
    : (() => {
      const bits = [statusValue, notifyShort]
      if (isResolved && howShort !== "—") bits.push(howShort)
      else if (isClaimed && !isResolved && handlerShort !== "—") bits.push(handlerShort)
      return bits
    })()

  const showResolveForm = canActOnAlert && isResolved && editingNote
  const detailOpen = expanded || showResolveForm

  const sentry = nightOn && compact && !ledger
  const unread = sentry && !isResolved && !recordOnly
  const canExpandClip = showMedia && evidenceForUi.length > 0
  const toggleClip = () => setExpanded((prev) => !prev)

  return (
    <View
      style={[
      styles.recordCard,
      activityRow ? styles.activityCard : null,
      recordOnly ? styles.recordCardMuted : null,
      emphasize ? styles.recordCardHero : null,
      sentry ? styles.nightSentryCard : null,
      nightOn && !sentry ? styles.nightCard : null,
      nightOn && recordOnly ? styles.nightCardMuted : null,
      accentColor && !nightOn ? {
        borderLeftWidth: getDisplaySeverity(record) === "Critical" ? 4 : 3,
        borderLeftColor: accentColor
      } : null
    ]}
    >
      {activityRow && ledger ? (
        <View style={styles.ledgerBookRow}>
          <View style={[
            styles.designTypeIcon,
            isFallLikeType(record?.type) && !recordOnly ? styles.designTypeIconFall : styles.designTypeIconDaily
          ]}>
            <NeoIcon
              name={isFallLikeType(record?.type) && !recordOnly ? "run-fast" : "human-male"}
              size={14}
              color={isFallLikeType(record?.type) && !recordOnly ? "#FF4D4D" : "#10B981"}
            />
          </View>
          <Pressable
            onPress={() => setExpanded((prev) => !prev)}
            style={styles.ledgerBookMeta}
            accessibilityRole="button"
          >
            <Text style={styles.designTypeText} numberOfLines={1}>{plainTitle}</Text>
            {shownNote ? <Text style={styles.ledgerNote} numberOfLines={2}>{shownNote}</Text> : null}
            {!shownNote && followLine ? <Text style={styles.ledgerNote} numberOfLines={1}>{followLine}</Text> : null}
            <Pressable onPress={canSeek ? jumpToEvent : undefined} disabled={!canSeek}>
              <Text style={[styles.nightSentryTime, canSeek ? styles.liveTimeLink : null]} numberOfLines={1}>
                {stamp.timeShort || sentryTimeRange(record)}
              </Text>
            </Pressable>
          </Pressable>
          <View style={[
            styles.designRiskPill,
            isResolved || recordOnly ? styles.designRiskPillOk : styles.designRiskPillHot
          ]}>
            <View style={[
              styles.designRiskDot,
              isResolved || recordOnly ? styles.designRiskDotOk : styles.designRiskDotHot
            ]} />
            <Text style={[
              styles.designRiskText,
              isResolved || recordOnly ? styles.designRiskTextOk : null
            ]} numberOfLines={1}>{statusValue}</Text>
          </View>
        </View>
      ) : sentry ? (
        <View style={styles.nightSentryRow}>
          <Pressable
            onPress={canExpandClip ? toggleClip : undefined}
            disabled={!canExpandClip}
            style={styles.nightSentryThumbHit}
            accessibilityRole="button"
            accessibilityLabel={canExpandClip ? (hasClip ? (t.watchClip || "查看影片") : (t.watchSnap || "查看截圖")) : undefined}
          >
            {showMedia && thumbUri ? (
              <Image source={{ uri: thumbUri }} style={styles.nightSentryThumb} resizeMode="cover" />
            ) : (
              <View style={[styles.nightSentryThumb, styles.nightThumbEmpty]} />
            )}
            {isVideoEvent ? (
              <View style={styles.nightPlay}>
                <IconPlay size={18} />
              </View>
            ) : null}
          </Pressable>
          <View style={styles.nightSentryMeta}>
            <View style={styles.designTypeRow}>
              <View style={[
                styles.designTypeIcon,
                isFallLikeType(record?.type) && !recordOnly ? styles.designTypeIconFall : styles.designTypeIconDaily
              ]}>
                <NeoIcon
                  name={isFallLikeType(record?.type) && !recordOnly ? "run-fast" : "human-male"}
                  size={14}
                  color={isFallLikeType(record?.type) && !recordOnly ? "#FF4D4D" : "#10B981"}
                />
              </View>
              <Text style={styles.nightTagText} numberOfLines={1}>{plainTitle}</Text>
            </View>
            <Text style={styles.nightSentryTitle} numberOfLines={1}>{sentryCardName(record, uiLang)}</Text>
            {shownNote ? <Text style={styles.ledgerNote} numberOfLines={2}>{shownNote}</Text> : null}
            <Pressable
              onPress={canJump ? jumpToEvent : undefined}
              disabled={!canJump}
              accessibilityRole={canJump ? "button" : undefined}
              accessibilityLabel={canJump ? (t.jumpToTime || "跳到該秒") : undefined}
            >
              <Text
                style={[styles.nightSentryTime, canJump ? styles.liveTimeLink : null]}
                numberOfLines={1}
              >
                {sentryTimeRange(record)}
              </Text>
            </Pressable>
          </View>
          {unread ? <View style={styles.nightUnread} /> : null}
        </View>
      ) : activityRow ? (
        <View style={styles.activityRow}>
          {showMedia && thumbUri ? (
            <Image
              source={{ uri: thumbUri }}
              style={[styles.activityThumb, nightOn && compact ? styles.nightSentryThumb : null]}
              resizeMode="cover"
            />
          ) : showMedia && evidenceForUi.length ? (
            <View style={[
              styles.activityThumbPlaceholder,
              nightOn ? styles.nightThumbEmpty : null,
              nightOn && compact ? styles.nightSentryThumb : null
            ]}>
              <Text style={[styles.activityThumbPlaceholderText, nightOn ? styles.nightMuted : null]}>
                {hasClip ? (t.evidenceClip || "短片") : (t.evidenceSnap || "圖")}
              </Text>
            </View>
          ) : showMedia ? (
            <View style={[
              styles.activityThumbEmpty,
              nightOn ? styles.nightThumbEmpty : null,
              nightOn && compact ? styles.nightSentryThumb : null
            ]} />
          ) : null}
          <View style={styles.activityBody}>
            <Pressable
              onPress={() => setExpanded(prev => !prev)}
              style={styles.activityMainHit}
              accessibilityRole="button"
              accessibilityLabel={detailOpen ? (t.collapseDetail || "收合") : (t.expandDetail || "詳情")}
            >
              <Text style={[
                styles.activityTitle,
                nightOn ? styles.nightTitle : null,
                nightOn && compact ? styles.nightSentryTitle : null
              ]} numberOfLines={1}>
                {compact ? plainTitle : getAlertTitle(record, uiLang)}
              </Text>
              <Text style={[styles.activityStatus, nightOn ? styles.nightMuted : null]} numberOfLines={1}>
                {compact
                  ? `${isFallLikeType(record?.type) && !recordOnly
                    ? (t.fallAlertShort || "跌倒通報")
                    : (t.dailyMoveShort || "日常動作")} · ${relative}`
                  : summaryBits.join(" · ")}
              </Text>
            </Pressable>
            <Pressable
              onPress={canJump ? jumpToEvent : () => setExpanded(prev => !prev)}
              hitSlop={6}
              style={styles.activityTimeHit}
            >
              {nightOn && compact ? (
                <Text style={styles.nightChevron}>›</Text>
              ) : (
              <Text style={[
                styles.activityClock,
                nightOn ? styles.nightClock : null,
                canJump ? (nightOn ? styles.nightTimeLink : styles.activityTimeLink) : null
              ]}>
                {stamp.dateLine}  {stamp.timeLine}
              </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
      <Pressable
        onPress={() => setExpanded(prev => !prev)}
        accessibilityRole="button"
        accessibilityLabel={detailOpen ? (t.collapseDetail || "收合") : (t.expandDetail || "詳情")}
      >
            <View style={styles.alertSummaryTop}>
              <View style={styles.alertHeaderRow}>
                <View style={[styles.severityDot, { backgroundColor: severityDotColor(displaySeverity) }]} />
                <Text style={[styles.recordTitle, styles.recordTitleHero]} numberOfLines={1}>
                  {getAlertTitle(record, uiLang)}
                </Text>
              </View>
              <Text style={[styles.alertTimeInline, styles.alertTimeHero]}>{relative}</Text>
            </View>
            <Text style={styles.alertSummaryLine} numberOfLines={2}>
              {summaryBits.join(" · ")}
            </Text>
      </Pressable>
      )}

      {detailOpen && showMedia && (!compact || evidenceForUi.length) ? (
        <View style={styles.alertDetailBox}>
          {compact ? null : (
            <>
              <Text style={styles.detailLine}>{t.fieldLevel || "等級"}：{levelDetail}</Text>
              <Text style={styles.detailLine}>{t.absoluteTime || "紀錄時間"}：{formatAlertTime(getRecordTime(record))}</Text>
              {!recordOnly ? (
                <>
                  <Text style={styles.detailLine}>{t.fieldHandler || "處理人"}：{handlerShort}</Text>
                  <Text style={styles.detailLine}>{t.fieldHow || "如何處理"}：{howShort}</Text>
                </>
              ) : null}
              {readOnly && !isResolved && !recordOnly ? (
                <Text style={styles.readonlyHint}>{t.familyReadonlyHint || "家屬僅可監看狀態。"}</Text>
              ) : null}
            </>
          )}
          {evidenceForUi.length ? (
            <View style={styles.evidenceBox}>
              {compact ? null : <Text style={styles.detailLine}>{t.evidenceTitle || "事件證據"}</Text>}
              {evidenceForUi.map(item => {
                const uri = item?.urlPath && apiBaseUrl
                  ? `${String(apiBaseUrl).replace(/\/+$/, "")}${item.urlPath}`
                  : ""
                if (item.mediaType === "clip" && uri) {
                  const videoSrc = evidenceFileUrl(apiBaseUrl, item.urlPath, token)
                  return (
                    <View key={item.evidenceId} style={styles.evidenceClipWrap}>
                      <WebView
                        source={{
                          html: evidenceVideoPage(videoSrc),
                          baseUrl: `${String(apiBaseUrl).replace(/\/+$/, "")}/`
                        }}
                        style={styles.evidenceClip}
                        scrollEnabled={false}
                        javaScriptEnabled
                        originWhitelist={["*"]}
                        mixedContentMode="always"
                        androidLayerType="hardware"
                        mediaPlaybackRequiresUserAction={false}
                        allowsInlineMediaPlayback
                      />
                      {item.durationSec ? (
                        <Text style={styles.evidenceClipLabel}>
                          {t.evidenceClip || "短片"} · {item.durationSec}s
                        </Text>
                      ) : null}
                    </View>
                  )
                }
                if (item.mediaType === "snapshot" && (uri || item.localUri)) {
                  const imageSrc = item.localUri || evidenceFileUrl(apiBaseUrl, item.urlPath, token)
                  return (
                    <Image
                      key={item.evidenceId}
                      source={{ uri: imageSrc }}
                      style={styles.evidenceImage}
                      resizeMode="cover"
                    />
                  )
                }
                return (
                  <Text key={item.evidenceId} style={styles.evidenceClipLabel}>
                    {item.mediaType === "clip" ? (t.evidenceClip || "短片") : (t.evidenceSnap || "截圖")}
                  </Text>
                )
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {showResolveForm ? (
        <>
          <Text style={styles.label}>{t.resolvePickMethod || "選擇或填寫處理方式"}</Text>
          <View style={styles.chipRow}>
            {resolveMethodOptions(t).map(opt => (
              <Pressable
                key={opt}
                style={[styles.methodChip, pickedMethod === opt && !noteDraft.trim() && styles.methodChipActive]}
                onPress={() => {
                  setPickedMethod(opt)
                  setNoteDraft("")
                }}
              >
                <Text style={[styles.methodChipText, pickedMethod === opt && !noteDraft.trim() && styles.methodChipTextActive]}>
                  {opt}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={noteDraft}
            onChangeText={(text) => {
              setNoteDraft(text)
              if (text.trim()) setPickedMethod("")
            }}
            placeholder={t.resolveNotePlaceholder}
          />
        </>
      ) : null}

      {canActOnAlert || (sentry && (canJump || canExpandClip)) ? (
        <View style={styles.recordActions}>
          {(sentry && canExpandClip) ? (
            <Pressable
              style={styles.recordActionBtn}
              onPress={toggleClip}
              accessibilityRole="button"
            >
              <NeoIcon name="play" size={14} color="#10B981" />
              <Text style={styles.recordActionText}>
                {detailOpen
                  ? (t.collapseDetail || "收合")
                  : (hasClip ? (t.watchClip || "查看影片") : (t.watchSnap || "查看截圖"))}
              </Text>
            </Pressable>
          ) : null}
          {!isResolved && canActOnAlert ? (
            <Pressable
              style={[styles.recordActionBtn, styles.recordActionBtnPrimary]}
              disabled={isBusy}
              onPress={() => alertLifecycle.onResolve(record, t.ackAlert || "已查看")}
            >
              <NeoIcon name="edit-2" size={14} color="#10B981" />
              <Text style={[styles.recordActionText, styles.recordActionTextPrimary]}>{t.ackAlert || t.claimAlert}</Text>
            </Pressable>
          ) : null}
          {isResolved && !editingNote && canActOnAlert ? (
            <Pressable
              style={styles.recordActionBtn}
              onPress={() => {
                setNoteDraft(record?.resolvedNote || "")
                setPickedMethod("")
                setEditingNote(true)
                setExpanded(true)
              }}
            >
              <NeoIcon name="edit-2" size={14} color="#FFFFFF" />
              <Text style={styles.recordActionText}>
                {hasWrittenNote ? (t.editNote || "修改說明") : (t.addNote || "新增說明")}
              </Text>
            </Pressable>
          ) : null}
          {isResolved && editingNote ? (
            <Pressable
              style={[styles.recordActionBtn, styles.recordActionBtnPrimary]}
              disabled={isBusy || !resolveNote}
              onPress={() => {
                alertLifecycle.onUpdateNote(record, resolveNote)
                setEditingNote(false)
              }}
            >
              <Text style={[styles.recordActionText, styles.recordActionTextPrimary]}>{t.saveNote || "儲存說明"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function SosRecordCard({ record, t, apiBaseUrl, token, uiLang, onResolve, resolveBusy, compact, ledger, onJumpToTime }) {
  const nightOn = useNightSkin()
  const status = String(record?.status || "active")
  const statusText = sosStatusLabel(status, uiLang)
  const message = String(record?.message || lookupI18n(uiLang, "sos.defaultMessage", "緊急求救")).trim()
  const handler = String(record?.handlerName || "").trim()
  const relative = formatRelativeTime(getRecordTime(record), uiLang)
  const stamp = formatStampParts(getRecordTime(record))
  const canResolve = typeof onResolve === "function" && (status === "active" || status === "handling")
  const statusLine = handler && (status === "resolved" || status === "handling")
    ? `${statusText} · ${handler}`
    : statusText
  const sentry = nightOn && compact && !ledger
  const sosTitle = lookupI18n(uiLang, "alert.type.sos", "呼叫")
  const sosTs = new Date(getRecordTime(record)).getTime()
  const canJumpSos = Number.isFinite(sosTs) && typeof onJumpToTime === "function"

  const sosThumb = evidenceThumbUrl(apiBaseUrl, record?.evidence, token)

  if (sentry) {
    return (
      <View style={[styles.recordCard, styles.activityCard, styles.nightSentryCard]}>
        <View style={styles.nightSentryRow}>
          <Pressable
            onPress={canJumpSos ? () => onJumpToTime(sosTs) : undefined}
            style={styles.nightSentryThumbHit}
            accessibilityRole={canJumpSos ? "button" : undefined}
            accessibilityLabel={canJumpSos ? (t.jumpToTime || "跳到該時段") : undefined}
          >
            {sosThumb ? (
              <Image source={{ uri: sosThumb }} style={styles.nightSentryThumb} resizeMode="cover" />
            ) : (
              <View style={[styles.nightSentryThumb, styles.nightThumbEmpty]} />
            )}
            <View style={styles.nightPlay}>
              <IconPlay size={18} />
            </View>
          </Pressable>
          <View style={styles.nightSentryMeta}>
            <View style={styles.nightTag}>
              <Text style={styles.nightTagText}>{sosTitle}</Text>
            </View>
            <Text style={styles.nightSentryTitle} numberOfLines={1}>{sosTitle}</Text>
            <Pressable
              onPress={canJumpSos ? () => onJumpToTime(sosTs) : undefined}
              disabled={!canJumpSos}
              accessibilityRole={canJumpSos ? "button" : undefined}
              accessibilityLabel={canJumpSos ? (t.jumpToTime || "跳到該時段") : undefined}
            >
              <Text
                style={[styles.nightSentryTime, canJumpSos ? styles.liveTimeLink : null]}
                numberOfLines={1}
              >
                {sentryTimeRange(record)}
              </Text>
            </Pressable>
          </View>
          {canResolve ? <View style={styles.nightUnread} /> : null}
        </View>
        {canResolve ? (
          <Pressable
            style={[styles.recordActionBtn, styles.recordActionBtnPrimary, { marginTop: 10 }]}
            disabled={resolveBusy}
            onPress={() => onResolve(record)}
          >
            <Text style={[styles.recordActionText, styles.recordActionTextPrimary]}>
              {t.markHandled || t.resolveAlert}
            </Text>
          </Pressable>
        ) : null}
      </View>
    )
  }

  return (
    <View style={[
      styles.recordCard,
      styles.activityCard,
      nightOn ? styles.nightCard : null,
      { borderLeftWidth: 3, borderLeftColor: nightOn ? "#FF5C00" : "#d97706" }
    ]}>
      <View style={styles.activityRow}>
        {ledger ? (
          <Text style={[styles.ledgerTime, nightOn ? styles.nightMuted : null]} numberOfLines={1}>
            {stamp.timeShort || stamp.timeLine}
          </Text>
        ) : (
          <View style={[styles.activityThumbEmpty, nightOn ? styles.nightThumbEmpty : null]} />
        )}
        <View style={styles.activityBody}>
          <View style={styles.activityMainHit}>
            <Text style={[styles.activityTitle, nightOn ? styles.nightTitle : null]} numberOfLines={1}>
              {lookupI18n(uiLang, "alert.type.sos", "呼叫")}
            </Text>
            {ledger ? (
              <TranslatedUgcText
                text={message}
                sourceLang={record?.sourceLang}
                messageKey={record?.messageKey}
                apiBaseUrl={apiBaseUrl}
                token={token}
                style={[styles.activityStatus, nightOn ? styles.nightMuted : null]}
              />
            ) : (
              <Text style={[styles.activityStatus, nightOn ? styles.nightMuted : null]} numberOfLines={1}>
                {compact ? `${statusLine} · ${relative}` : `${message} · ${statusLine}`}
              </Text>
            )}
            {compact && !ledger ? (
              <TranslatedUgcText
                text={message}
                sourceLang={record?.sourceLang}
                messageKey={record?.messageKey}
                apiBaseUrl={apiBaseUrl}
                token={token}
                compact
                style={[styles.activityStatus, nightOn ? styles.nightMuted : null]}
              />
            ) : null}
            {ledger ? (
              <Text style={[styles.activityStatus, nightOn ? styles.nightMuted : null]} numberOfLines={1}>{statusLine}</Text>
            ) : null}
          </View>
          {ledger ? null : (
            <View style={styles.activityTimeHit}>
              <Text style={[styles.activityClock, nightOn ? styles.nightClock : null]}>
                {stamp.dateLine}  {stamp.timeLine}
              </Text>
            </View>
          )}
        </View>
      </View>
      {canResolve ? (
        <Pressable
          style={[styles.recordActionBtn, styles.recordActionBtnPrimary, { marginTop: 10 }]}
          disabled={resolveBusy}
          onPress={() => onResolve(record)}
        >
          <Text style={[styles.recordActionText, styles.recordActionTextPrimary]}>
            {t.markHandled || t.resolveAlert}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function NativeRecordCard({
  record, index, t, alertLifecycle, reminderActions, isAlertsFeature, isSosFeature, readOnly,
  emphasize, apiBaseUrl, token, role, uiLang, onSosResolve, sosResolveBusy, onJumpToTime, compact, ledger
}) {
  if (isSosRecord(record) || (isSosFeature && !isAlertsFeature)) {
    return (
      <SosRecordCard
        record={record}
        t={t}
        apiBaseUrl={apiBaseUrl}
        token={token}
        uiLang={uiLang}
        onResolve={role === "caregiver" ? onSosResolve : null}
        resolveBusy={sosResolveBusy}
        compact={compact || isAlertsFeature}
        ledger={ledger}
        onJumpToTime={onJumpToTime}
      />
    )
  }

  if (isAlertsFeature) {
    return (
      <AlertRecordCard
        record={record}
        t={t}
        alertLifecycle={alertLifecycle}
        readOnly={readOnly}
        emphasize={emphasize}
        apiBaseUrl={apiBaseUrl}
        token={token}
        uiLang={uiLang}
        onJumpToTime={onJumpToTime}
        compact={compact}
        ledger={ledger}
      />
    )
  }

  const entries = Object.entries(record || {})
    .filter(([key]) => ![
      "_id", "__v", "userId", "patientUserId", "reporterUserId", "createdAt", "updatedAt",
      "claimedByUserId", "resolvedByUserId", "completedByUserId"
    ].includes(key))
    .slice(0, 8)
  const time = getRecordTime(record)
  const canCompleteReminder = Boolean(reminderActions) && isReminderRecord(record) && !record?.isCompleted
  const isBusyReminder = canCompleteReminder && reminderActions.busyId === getRecordId(record)

  return (
    <View style={styles.recordCard}>
      <Text style={styles.recordTitle}>{getRecordTitle(record, index, t)}</Text>
      {time ? <Text style={styles.recordTime}>{formatValue(time, uiLang)}</Text> : null}
      {isReminderRecord(record) ? (
        <View style={styles.fieldRow}>
          <Text style={styles.fieldKey}>{t.fieldStatus || "狀態"}</Text>
          <Text style={styles.fieldValue}>
            {record.isCompleted ? (t.reminderDone || "已完成") : (t.reminderPending || "未完成")}
          </Text>
        </View>
      ) : null}
      {entries.map(([key, value]) => (
        <View key={key} style={styles.fieldRow}>
          <Text style={styles.fieldKey}>{key}</Text>
          <Text style={styles.fieldValue}>{formatValue(value, uiLang)}</Text>
        </View>
      ))}
      {canCompleteReminder ? (
        <View style={styles.recordActions}>
          <Pressable
            style={[styles.recordActionBtn, styles.recordActionBtnPrimary]}
            disabled={isBusyReminder}
            onPress={() => reminderActions.onComplete(record)}
          >
            <Text style={[styles.recordActionText, styles.recordActionTextPrimary]}>
              {t.completeReminder || "標記完成"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {isReminderRecord(record) && record?.isCompleted ? (
        <Text style={[styles.recordActionText, { marginTop: 10 }]}>{t.reminderDone || "已完成"}</Text>
      ) : null}
    </View>
  )
}

function parseDateKey(key) {
  const [y, m, d] = String(key || "").split("-").map(Number)
  return new Date(y || 1970, (m || 1) - 1, d || 1)
}

function weekAxisDays(series, lang = "zh") {
  const week = weekdayShortLabels(lang) || []
  return (Array.isArray(series) ? series : []).map((row) => {
    const key = String(row?.date || "").slice(0, 10)
    const d = parseDateKey(key)
    return {
      date: key,
      weekLabel: week[d.getDay()] || "",
      alertHigh: Number(row?.alertHigh) || 0,
      recordOnly: Number(row?.recordOnly) || 0,
      sos: Number(row?.sos) || 0
    }
  })
}

function WeekDots({ series, focus = "all", lang = "zh", weekPrefix = "" }) {
  const days = weekAxisDays(series, lang)
  const showFall = focus === "all" || focus === "fall"
  const showSos = focus === "all" || focus === "sos"
  const showDaily = focus === "all" || focus === "daily"
  const wide = days.length > 8
  const cols = days.map((day) => {
    const dateLabel = String(day.date).length >= 10
      ? `${Number(String(day.date).slice(5, 7))}/${Number(String(day.date).slice(8, 10))}`
      : day.date
    const hasFall = showFall && day.alertHigh > 0
    const hasOk = (showDaily && day.recordOnly > 0) || (showSos && day.sos > 0)
    return (
      <View key={day.date} style={[styles.weekDotCol, wide ? styles.weekDotColWide : null]}>
        <Text style={styles.weekDotDate} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{dateLabel}</Text>
        <Text style={styles.weekDotWeek} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{`${weekPrefix}${day.weekLabel}`}</Text>
        <View style={styles.weekDotStack}>
          {hasFall ? (
            <View style={[styles.weekDot, styles.weekDotFall]} />
          ) : hasOk ? (
            <View style={[styles.weekDot, styles.weekDotDaily]} />
          ) : (
            <View style={styles.weekDotEmpty} />
          )}
        </View>
      </View>
    )
  })
  if (wide) {
    return (
      <View style={styles.weekDots}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {cols}
        </ScrollView>
      </View>
    )
  }
  return <View style={styles.weekDots}>{cols}</View>
}

function CompactSelect({ value, options, onSelect, icon }) {
  const [open, setOpen] = useState(false)
  const nightOn = useNightSkin()
  const selected = options.find((o) => o.id === value)
  return (
    <View style={styles.compactSelectWrap}>
      <Pressable
        style={[styles.dropdownBtn, nightOn ? styles.nightDropdown : null]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={selected?.label || ""}
      >
        <Text style={[styles.dropdownValue, nightOn ? styles.nightTitle : null]} numberOfLines={1}>{selected?.label || ""}</Text>
        <NeoIcon name="chevron-down" size={12} color="#8E95A3" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <View style={[styles.pickerPanel, nightOn ? styles.nightPickerPanel : null]}>
            {options.map((opt) => {
              const on = opt.id === value
              return (
                <Pressable
                  key={String(opt.id)}
                  style={[
                    styles.pickerOption,
                    on ? styles.pickerOptionActive : null,
                    nightOn && on ? styles.nightPickerOptionOn : null
                  ]}
                  onPress={() => {
                    onSelect(opt.id)
                    setOpen(false)
                  }}
                >
                  <Text style={[
                    styles.pickerOptionText,
                    on ? styles.pickerOptionTextActive : null,
                    nightOn ? styles.nightTitle : null,
                    nightOn && on ? styles.nightGoldText : null
                  ]}>
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

export default function NativeFeatureScreen({
  feature,
  role,
  apiBaseUrl,
  token,
  uiLang,
  onBack,
  embedded = false,
  layout = "full",
  onJumpToTime,
  onCountChange,
  onRecordsChange,
  skin
}) {
  const langKey = uiLang || "zh"
  const t = { ...UI_TEXT.zh, ...(UI_TEXT[langKey] || {}) }
  const nightOn = skin === "night"
  const sentryLayout = layout === "liveFeed" || layout === "sentryList"
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [phoneModalVisible, setPhoneModalVisible] = useState(false)
  const [phoneDraft, setPhoneDraft] = useState("")
  const [sosCancelSeconds, setSosCancelSeconds] = useState(0)
  const [sosActiveRecordId, setSosActiveRecordId] = useState("")
  const [sosCancelBusy, setSosCancelBusy] = useState(false)
  const [sosSentVisible, setSosSentVisible] = useState(false)
  const sosCancelTimerRef = useRef(null)
  const [draft, setDraft] = useState({
    message: t.sosMsg,
    locationLabel: "",
    patientPhone: "",
    category: t.reminderCat,
    content: t.reminderContent,
    time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    note: ""
  })

  const [reportOpen, setReportOpen] = useState(false)
  const [alertActionBusyId, setAlertActionBusyId] = useState("")
  const [reminderBusyId, setReminderBusyId] = useState("")
  const [sosActionBusyId, setSosActionBusyId] = useState("")
  const [alertFilter, setAlertFilter] = useState(layout === "stats" || layout === "history" ? "history" : "now")
  const [historyRange, setHistoryRange] = useState("week") // week｜month｜custom
  const [historyClass, setHistoryClass] = useState("all") // 需關注／日常／全部
  const [historyCustomFrom, setHistoryCustomFrom] = useState("")
  const [historyCustomTo, setHistoryCustomTo] = useState("")
  const [historyCalendarOpen, setHistoryCalendarOpen] = useState(false)
  const [historyPickPhase, setHistoryPickPhase] = useState("from") // from｜to
  const [historyMonthKey, setHistoryMonthKey] = useState(() => todayLocalDateKey())
  const [historyStatsOpen, setHistoryStatsOpen] = useState(layout === "stats" || layout === "history")
  const [alertStats, setAlertStats] = useState(null)

  const isPlannedFeature = Boolean(feature?.planned)
  const canCreate = Boolean(feature?.createPath) && !isPlannedFeature
  const canSync = Boolean(feature?.syncPath) && !isPlannedFeature && !feature?.historyPath?.includes("/alerts/")
  const isSosFeature = Boolean(
    feature?.createType === "sos" ||
    (typeof feature?.historyPath === "string" && feature.historyPath.includes("/sos/"))
  )
  const featureScope = useMemo(() => getFeatureScope(role, feature), [role, feature])
  const hidesHistoryList = isSosFeature && role === "patient"
  const alertsBasePath = useMemo(() => getAlertsBasePath(feature?.historyPath), [feature])
  const isAlertsFeature = Boolean(feature?.historyPath?.includes("/alerts/"))
  const isRemindersFeature = Boolean(feature?.historyPath?.includes("/reminders"))
  const alertsReadOnly = isAlertsFeature && role === "family"

  const loadHistory = useCallback(async (silent = false) => {
    if (!feature?.historyPath || isPlannedFeature) return
    if (!silent) {
      setLoading(true)
      setError("")
    }
    try {
      const isAlertsPath = Boolean(feature?.historyPath?.includes("/alerts/"))
      const path = isAlertsPath
        ? `${feature.historyPath}${feature.historyPath.includes("?") ? "&" : "?"}limit=100`
        : feature.historyPath
      const data = await apiRequest({
        apiBaseUrl,
        path,
        token
      })
      let rows = normalizeRecords(data, feature)
      if (isAlertsPath && role !== "patient") {
        try {
          const sosData = await apiRequest({
            apiBaseUrl,
            path: `${sosHistoryPathForRole(role)}?limit=100`,
            token
          })
          const sosRows = normalizeRecords(sosData).map(asSosHistoryRow)
          rows = [...rows, ...sosRows].sort(
            (a, b) => new Date(getRecordTime(b) || 0) - new Date(getRecordTime(a) || 0)
          )
        } catch {
          /* SOS 併入失敗仍顯示跌倒／日常 */
        }
      }
      if (isAlertsPath && layout !== "liveFeed" && layout !== "sentryList") {
        rows = ensureFilled(rows, screenshotWatchRecords, 4)
      }
      setRecords(rows)
    } catch (loadError) {
      if (!silent) setError(loadError.message)
      setRecords(isAlertsFeature && layout !== "liveFeed" && layout !== "sentryList"
        ? ensureFilled([], screenshotWatchRecords, 4)
        : [])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [apiBaseUrl, feature, isAlertsFeature, isPlannedFeature, layout, role, token])

  useEffect(() => {
    if (isPlannedFeature) {
      setRecords([])
      setLoading(false)
      return
    }
    loadHistory()
  }, [isPlannedFeature, loadHistory])

  // 異常事件列表：每 5 秒靜默刷新（影像跌倒後需即時顯示）
  useEffect(() => {
    if (!isAlertsFeature || isPlannedFeature) return undefined
    const id = setInterval(() => loadHistory(true), 5000)
    return () => clearInterval(id)
  }, [isAlertsFeature, isPlannedFeature, loadHistory])

  // H2：近7日／本月走 API；自訂區間在下方用 historyBaseRecords 另算
  useEffect(() => {
    if (!isAlertsFeature || isPlannedFeature) return undefined
    if (layout !== "stats" && layout !== "history" && alertFilter !== "history") return undefined
    if (historyRange === "custom") return undefined
    let cancelled = false
    const rangeParam = historyRange === "month" ? "month" : "week"
    const rolePath = role === "family" ? "/family/alerts/stats" : "/caregiver/alerts/stats"
    ;(async () => {
      try {
        const data = await apiRequest({
          apiBaseUrl,
          path: `${rolePath}?range=${rangeParam}`,
          token
        })
        if (!cancelled) setAlertStats(data)
      } catch {
        if (!cancelled) setAlertStats(null)
      }
    })()
    return () => { cancelled = true }
  }, [alertFilter, apiBaseUrl, historyRange, isAlertsFeature, isPlannedFeature, layout, role, token])

  useEffect(() => {
    let mounted = true
    if (!isSosFeature) return undefined

    loadSosPhone(featureScope).then(savedPhone => {
      if (!mounted) return
      if (savedPhone) {
        setPhoneDraft(savedPhone)
        setDraft(prev => ({ ...prev, patientPhone: savedPhone }))
      } else {
        setPhoneDraft("")
      }
      // 不強制綁手機／簡訊，不自動跳出手機輸入框
    })

    return () => { mounted = false }
  }, [canCreate, featureScope, isSosFeature, role])

  const openAlertsSorted = useMemo(() => {
    if (!isAlertsFeature) return []
    return records
      .filter(isOpenActionableAlert)
      .sort((a, b) => new Date(getRecordTime(b) || 0) - new Date(getRecordTime(a) || 0))
  }, [isAlertsFeature, records])

  const latestOpenAlert = openAlertsSorted[0] || null

  const historyBaseRecords = useMemo(() => {
    if (!isAlertsFeature) return []
    return records.filter(r => !isOpenActionableAlert(r))
  }, [isAlertsFeature, records])

  const visibleRecords = useMemo(() => {
    if (!isAlertsFeature) return records
    if (layout === "liveFeed" || layout === "sentryList") {
      return [...records]
        .filter((record) => isRecentRecord(record))
        .sort((a, b) => new Date(getRecordTime(b) || 0) - new Date(getRecordTime(a) || 0))
    }
    if (layout === "history") {
      return [...records]
        .filter((r) => {
          if (historyRange === "custom") {
            if (!historyCustomFrom || !historyCustomTo) return false
            return isDateKeyInInclusiveRange(
              toLocalDateKey(getRecordTime(r)),
              historyCustomFrom,
              historyCustomTo
            )
          }
          return isInHistoryRange(r, historyRange)
        })
        .filter((r) => matchesHistoryClass(r, historyClass))
        .sort((a, b) => new Date(getRecordTime(b) || 0) - new Date(getRecordTime(a) || 0))
    }
    if (alertFilter === "now") {
      return latestOpenAlert ? [latestOpenAlert] : []
    }
    if (alertFilter === "history") {
      return historyBaseRecords
        .filter(r => {
          if (historyRange === "custom") {
            if (!historyCustomFrom || !historyCustomTo) return false
            return isDateKeyInInclusiveRange(
              toLocalDateKey(getRecordTime(r)),
              historyCustomFrom,
              historyCustomTo
            )
          }
          return isInHistoryRange(r, historyRange)
        })
        .filter(r => matchesHistoryClass(r, historyClass))
    }
    if (alertFilter === "all") return records
    return records.filter(r => alertFilterBucket(r) === alertFilter)
  }, [alertFilter, historyBaseRecords, historyClass, historyCustomFrom, historyCustomTo, historyRange, isAlertsFeature, latestOpenAlert, layout, records])

  useEffect(() => {
    if (typeof onCountChange === "function") onCountChange(visibleRecords.length)
  }, [onCountChange, visibleRecords.length])

  useEffect(() => {
    if (typeof onRecordsChange === "function") onRecordsChange(records)
  }, [onRecordsChange, records])

  const alertFilterCounts = useMemo(() => {
    if (!isAlertsFeature) return null
    const inRange = historyBaseRecords.filter(r => {
      if (historyRange === "custom") {
        if (!historyCustomFrom || !historyCustomTo) return false
        return isDateKeyInInclusiveRange(toLocalDateKey(getRecordTime(r)), historyCustomFrom, historyCustomTo)
      }
      return isInHistoryRange(r, historyRange)
    })
    return {
      now: openAlertsSorted.length,
      history: historyBaseRecords.length,
      rangeWeek: historyBaseRecords.filter(r => isInHistoryRange(r, "week")).length,
      rangeMonth: historyBaseRecords.filter(r => isInHistoryRange(r, "month")).length,
      classAttention: inRange.filter(r => historyClassOf(r) === "attention").length,
      classDaily: inRange.filter(r => historyClassOf(r) === "daily").length,
      classAll: inRange.length
    }
  }, [historyBaseRecords, historyCustomFrom, historyCustomTo, historyRange, isAlertsFeature, openAlertsSorted.length])

  const customRangeReady = historyRange === "custom" && Boolean(historyCustomFrom && historyCustomTo)

  const displayAlertStats = useMemo(() => {
    const source = layout === "history" ? records : historyBaseRecords
    if (layout === "history") {
      if (historyRange === "custom") {
        if (!customRangeReady) return alertStats
        return buildClientAlertStats(source, historyCustomFrom, historyCustomTo)
      }
      const to = todayLocalDateKey()
      const from = historyRange === "month"
        ? toLocalDateKey(startOfLocalMonth())
        : toLocalDateKey(startOfRolling7Days())
      return buildClientAlertStats(source, from, to)
    }
    if (historyRange === "custom" && customRangeReady) {
      return buildClientAlertStats(historyBaseRecords, historyCustomFrom, historyCustomTo)
    }
    return alertStats
  }, [alertStats, customRangeReady, historyBaseRecords, historyCustomFrom, historyCustomTo, historyRange, layout, records])

  const alertCalendarDays = useMemo(() => {
    if (!isAlertsFeature || !historyCalendarOpen) return []
    if (layout !== "history" && alertFilter !== "history") return []
    const base = historyBaseRecords.filter(r => matchesHistoryClass(r, historyClass))
    return buildAlertCalendarDays(historyMonthKey, base)
  }, [alertFilter, historyBaseRecords, historyCalendarOpen, historyClass, historyMonthKey, isAlertsFeature, layout])

  const historyDayGroups = useMemo(() => {
    if (!isAlertsFeature) return null
    if (layout !== "history" && alertFilter !== "history") return null
    return groupRecordsByDate(visibleRecords)
  }, [alertFilter, isAlertsFeature, layout, visibleRecords])

  const summary = useMemo(() => {
    if (feature?.singleRecord) return t.basicInfo
    // 「現在」空狀態只留下方 emptyText，避免 summary 與列表重複同一句
    if (isAlertsFeature && alertFilter === "now") {
      return latestOpenAlert ? (t.filterNow || "現在") : ""
    }
    if (isAlertsFeature && alertFilter === "history") {
      if (historyRange === "custom") {
        if (!customRangeReady) return "請點兩次選擇起訖日（同一天可）"
        const label = formatShortRangeLabel(historyCustomFrom, historyCustomTo)
        // 有區間但無事件：只留下方 empty，避免「尚無事件」講兩次
        return visibleRecords.length
          ? `${label}　${t.recordCount(visibleRecords.length)}`
          : label
      }
      return visibleRecords.length ? t.recordCount(visibleRecords.length) : ""
    }
    if (isAlertsFeature) return t.recordCount(visibleRecords.length)
    // 空列表不顯示「0 筆紀錄」，只留下方 emptyText
    if (!records.length) return ""
    return t.recordCount(records.length)
  }, [alertFilter, customRangeReady, feature?.singleRecord, historyCustomFrom, historyCustomTo, historyRange, isAlertsFeature, latestOpenAlert, records.length, t, visibleRecords.length])

  const updateDraft = (key, value) => {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  const handleSavePhone = async () => {
    const normalizedPhone = phoneDraft.trim()
    if (!normalizedPhone) {
      setError(t.phoneRequired)
      return false
    }
    await saveSosPhone(featureScope, normalizedPhone)
    updateDraft("patientPhone", normalizedPhone)
    setPhoneModalVisible(false)
    setMessage(t.savePhoneDone)
    return true
  }

  const handleSync = async () => {
    if (!feature?.syncPath) return
    setSyncing(true)
    setMessage("")
    setError("")
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: feature.syncPath,
        method: "POST",
        token
      })
      setMessage(data.message || t.syncDone)
      await loadHistory()
    } catch (syncError) {
      setError(syncError.message)
    } finally {
      setSyncing(false)
    }
  }

  const handleCreate = async () => {
    if (!feature?.createPath) return
    if (isSosFeature && role === "patient" && (sosActiveRecordId || sosCancelBusy || sosSentVisible)) {
      return
    }

    setSaving(true)
    setMessage("")
    setError("")
    try {
      if (isSosFeature && draft.patientPhone.trim()) {
        await saveSosPhone(featureScope, draft.patientPhone.trim())
      }

      const body =
        isSosFeature
          ? {
              message: draft.message,
              ...(draft.locationLabel.trim() ? { locationLabel: draft.locationLabel } : {}),
              patientPhone: draft.patientPhone.trim()
            }
          : feature.createType === "reminder"
            ? {
                category: draft.category,
                content: draft.content,
                time: draft.time,
                note: draft.note
              }
            : draft

      const data = await apiRequest({
        apiBaseUrl,
        path: feature.createPath,
        method: "POST",
        token,
        body
      })
      setMessage(data.message || t.createDone)
      await loadHistory()

      if (isSosFeature && role === "patient") {
        const rid = data.record?._id || data.record?.eventId || ""
        if (rid) {
          if (sosCancelTimerRef.current) clearInterval(sosCancelTimerRef.current)
          setSosSentVisible(false)
          setSosActiveRecordId(String(rid))
          setSosCancelSeconds(10)
          sosCancelTimerRef.current = setInterval(() => {
            setSosCancelSeconds(prev => {
              if (prev <= 1) {
                if (sosCancelTimerRef.current) clearInterval(sosCancelTimerRef.current)
                sosCancelTimerRef.current = null
                return 0
              }
              return prev - 1
            })
          }, 1000)
        }
      }
    } catch (createError) {
      setError(createError.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCancelSos = async () => {
    if (!sosActiveRecordId || sosCancelBusy) return
    setSosCancelBusy(true)
    setError("")
    try {
      await apiRequest({
        apiBaseUrl,
        path: `/patient/sos/${encodeURIComponent(sosActiveRecordId)}/cancel`,
        method: "POST",
        token
      })
      if (sosCancelTimerRef.current) {
        clearInterval(sosCancelTimerRef.current)
        sosCancelTimerRef.current = null
      }
      setSosCancelSeconds(0)
      setSosActiveRecordId("")
      setSosSentVisible(false)
      setMessage("已取消 SOS（誤觸）")
      await loadHistory(true)
    } catch (err) {
      setError(err.message || t.sosCancelFail || "取消失敗")
      // 逾時／已送出：關取消倒數，改顯示「已送出」卡
      if (sosCancelTimerRef.current) {
        clearInterval(sosCancelTimerRef.current)
        sosCancelTimerRef.current = null
      }
      setSosCancelSeconds(0)
      setSosSentVisible(true)
    } finally {
      setSosCancelBusy(false)
    }
  }

  const closeSosSentCard = () => {
    setSosSentVisible(false)
    setSosActiveRecordId("")
  }

  useEffect(() => {
    if (!sosActiveRecordId) return
    if (sosCancelSeconds === 0 && !sosCancelBusy) {
      setSosSentVisible(true)
    }
  }, [sosActiveRecordId, sosCancelBusy, sosCancelSeconds])

  useEffect(() => {
    return () => {
      if (sosCancelTimerRef.current) clearInterval(sosCancelTimerRef.current)
    }
  }, [])

  const handleClaimAlert = async record => {
    if (alertsReadOnly) return
    const recordId = getRecordId(record)
    if (!recordId || !alertsBasePath) return
    setAlertActionBusyId(recordId)
    setError("")
    try {
      await apiRequest({
        apiBaseUrl,
        path: `${alertsBasePath}/${encodeURIComponent(recordId)}/claim`,
        method: "POST",
        token
      })
      await loadHistory(true)
    } catch (claimError) {
      setError(claimError.message)
    } finally {
      setAlertActionBusyId("")
    }
  }

  const handleResolveAlert = async (record, note) => {
    if (alertsReadOnly) return
    const recordId = getRecordId(record)
    if (!recordId || !alertsBasePath) return
    const ackNote = String(note || "").trim() || (t.ackAlert || "已查看")
    setAlertActionBusyId(recordId)
    setError("")
    try {
      const result = await apiRequest({
        apiBaseUrl,
        path: `${alertsBasePath}/${encodeURIComponent(recordId)}/resolve`,
        method: "POST",
        token,
        body: { note: ackNote }
      })
      setMessage(t.resolveDone || t.ackAlert || "已查看")
      setAlertFilter("now")
      await loadHistory(true)
    } catch (resolveError) {
      setError(resolveError.message)
    } finally {
      setAlertActionBusyId("")
    }
  }

  const handleUpdateAlertNote = async (record, note) => {
    if (alertsReadOnly || role !== "caregiver") return
    const recordId = getRecordId(record)
    if (!recordId) return
    if (!String(note || "").trim()) {
      setError(t.resolvePickMethod || "請選擇或填寫如何處理")
      return
    }
    setAlertActionBusyId(recordId)
    setError("")
    try {
      await apiRequest({
        apiBaseUrl,
        path: `/caregiver/alerts/${encodeURIComponent(recordId)}/note`,
        method: "PATCH",
        token,
        body: { note }
      })
      await loadHistory(true)
    } catch (updateError) {
      setError(updateError.message)
    } finally {
      setAlertActionBusyId("")
    }
  }

  const handleCompleteReminder = async record => {
    const recordId = getRecordId(record)
    if (!recordId || role !== "caregiver") return
    setReminderBusyId(recordId)
    setError("")
    try {
      await apiRequest({
        apiBaseUrl,
        path: `/caregiver/reminders/${encodeURIComponent(recordId)}/complete`,
        method: "PATCH",
        token
      })
      setMessage(t.reminderDone || "已完成")
      await loadHistory(true)
    } catch (completeError) {
      setError(completeError.message)
    } finally {
      setReminderBusyId("")
    }
  }

  // 家屬異常頁唯讀：不掛 claim/resolve
  const alertLifecycle = isAlertsFeature && role === "caregiver"
    ? {
        busyId: alertActionBusyId,
        onClaim: handleClaimAlert,
        onResolve: handleResolveAlert,
        onUpdateNote: handleUpdateAlertNote
      }
    : null
  const reminderActions = isRemindersFeature && role === "caregiver"
    ? { busyId: reminderBusyId, onComplete: handleCompleteReminder }
    : null

  const handleSosResolve = async (record) => {
    const id = getRecordId(record)
    if (!id || !apiBaseUrl || !token) return
    setSosActionBusyId(id)
    setError("")
    try {
      await caregiverSosResolve({ apiBaseUrl, token, id })
      setMessage(t.resolveDone || "已處理")
      await loadHistory(true)
    } catch (err) {
      setError(err.message || t.resolveAlert)
    } finally {
      setSosActionBusyId("")
    }
  }

  if (reportOpen && role === "caregiver") {
    return (
      <AbnormalReportScreen
        apiBaseUrl={apiBaseUrl}
        token={token}
        onBack={() => {
          setReportOpen(false)
          loadHistory(true)
        }}
      />
    )
  }

  // 即時下方列近 14 日辨識；沒有就不要佔半屏、不要寫「沒有異常」
  if (layout === "liveFeed" && visibleRecords.length === 0) {
    return null
  }

  return (
    <NightSkinProvider value={nightOn}>
    <View style={[
      layout === "liveFeed" ? styles.liveFeedScreen : styles.screen,
      nightOn ? styles.nightScreen : null
    ]}>
      {embedded ? null : (
        <View style={styles.header}>
          {!onBack ? null : (
            <Pressable onPress={onBack}>
              <Text style={styles.backText}>{t.back}</Text>
            </Pressable>
          )}
          <Text style={styles.title}>{feature?.title || t.feature}</Text>
          <Text style={styles.subtitle}>{feature?.desc || summary}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={sentryLayout ? styles.liveFeedContainer : styles.container}>
        {loading && layout !== "stats" && !sentryLayout ? <ActivityIndicator color={colors.pine} /> : null}
        {sentryLayout ? null : (layout !== "stats" && message ? <Text style={styles.message}>{message}</Text> : null)}
        {sentryLayout ? null : (error ? <Text style={styles.error}>{error}</Text> : null)}

        {isPlannedFeature ? (
          <View style={styles.plannedCard}>
            <Text style={styles.plannedBadge}>{t.plannedTitle || "功能規劃中"}</Text>
            <Text style={styles.plannedTitle}>{t.plannedTitle || "功能規劃中"}</Text>
            <Text style={styles.plannedDesc}>{t.plannedDesc || ""}</Text>
          </View>
        ) : null}

        {!isPlannedFeature && canSync && layout === "full" ? (
          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={handleSync} disabled={syncing}>
              <Text style={styles.secondaryBtnText}>{syncing ? t.syncing : t.sync}</Text>
            </Pressable>
          </View>
        ) : null}
        {!isPlannedFeature && !canSync && layout === "full" ? (
          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={loadHistory} disabled={loading}>
              <Text style={styles.secondaryBtnText}>{t.refresh}</Text>
            </Pressable>
          </View>
        ) : null}

        {canCreate && layout === "full" ? (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>{isSosFeature ? t.addSOS : t.addReminder}</Text>
            {isSosFeature ? (
              <Pressable
                style={styles.sosButton}
                onPress={handleCreate}
                disabled={saving || (role === "patient" && Boolean(sosActiveRecordId))}
              >
                <Text style={styles.sosButtonText}>{saving ? t.sosSending : t.sosButton}</Text>
              </Pressable>
            ) : (
              <>
                <Text style={styles.label}>{t.cat}</Text>
                <TextInput
                  style={styles.input}
                  value={draft.category}
                  onChangeText={value => updateDraft("category", value)}
                />
                <Text style={styles.label}>{t.content}</Text>
                <TextInput
                  style={styles.input}
                  value={draft.content}
                  onChangeText={value => updateDraft("content", value)}
                />
                <Text style={styles.label}>{t.timeIso}</Text>
                <TextInput
                  style={styles.input}
                  value={draft.time}
                  onChangeText={value => updateDraft("time", value)}
                />
                <Text style={styles.label}>{t.note}</Text>
                <TextInput
                  style={styles.input}
                  value={draft.note}
                  onChangeText={value => updateDraft("note", value)}
                />
                <Pressable style={styles.primaryBtn} onPress={handleCreate} disabled={saving}>
                  <Text style={styles.primaryBtnText}>{saving ? t.submitting : t.submit}</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}

        {hidesHistoryList || isPlannedFeature ? null : (
          <>
            {isAlertsFeature && layout === "full" ? (
              <View style={styles.filterChipRow}>
                {[
                  { id: "now", label: t.filterNow || "現在" },
                  { id: "history", label: t.filterHistory || "歷程" }
                ].map(chip => (
                  <Pressable
                    key={chip.id}
                    style={[styles.filterChip, alertFilter === chip.id && styles.filterChipActive]}
                    onPress={() => setAlertFilter(chip.id)}
                  >
                    <Text style={[styles.filterChipText, alertFilter === chip.id && styles.filterChipTextActive]}>
                      {chip.label}
                      {alertFilterCounts ? ` ${alertFilterCounts[chip.id] ?? 0}` : ""}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {isAlertsFeature && layout === "history" ? (
              <View style={styles.historyFilterBar}>
                <CompactSelect
                  icon="filter"
                  value={historyClass}
                  options={[
                    { id: "all", label: t.filterAll || "全部" },
                    { id: "fall", label: t.chipFall || "跌倒通報" },
                    { id: "daily", label: t.chipDaily || "蹲下／彎腰" },
                    { id: "sos", label: t.chipSos || "求救" }
                  ]}
                  onSelect={setHistoryClass}
                />
                <CompactSelect
                  icon="calendar"
                  value={historyRange}
                  options={[
                    { id: "week", label: t.rangeThisWeek || "本週" },
                    { id: "month", label: t.rangeMonth || "本月" },
                    {
                      id: "custom",
                      label: customRangeReady
                        ? formatShortRangeLabel(historyCustomFrom, historyCustomTo)
                        : (t.rangeCustom || "自訂")
                    }
                  ]}
                  onSelect={(id) => {
                    if (id === "custom") {
                      setHistoryRange("custom")
                      setHistoryCalendarOpen(true)
                      setHistoryPickPhase("from")
                      if (!historyCustomFrom) {
                        setHistoryCustomFrom("")
                        setHistoryCustomTo("")
                      }
                      setHistoryMonthKey(historyCustomFrom || todayLocalDateKey())
                    } else {
                      setHistoryRange(id)
                      setHistoryCalendarOpen(false)
                    }
                  }}
                />
                {role === "caregiver" ? (
                  <Pressable onPress={() => setReportOpen(true)} hitSlop={8} style={styles.manualReportHit}>
                    <NeoIcon name="edit" size={14} color="#10B981" />
                    <Text style={styles.manualReportText}>{t.manualReport || "手動登記"}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {isAlertsFeature && layout !== "liveFeed" && layout !== "sentryList" && layout !== "history" && alertFilter === "history" ? (
              <View style={styles.historyChipBlock}>
                <View style={styles.filterChipRow}>
                  {(layout === "stats"
                    ? [
                        { id: "week", label: t.rangeWeek || "近7日" },
                        { id: "month", label: t.rangeMonth || "本月" }
                      ]
                    : [
                        { id: "week", label: t.rangeWeek || "近7日" },
                        { id: "month", label: t.rangeMonth || "本月" },
                        {
                          id: "custom",
                          label: customRangeReady
                            ? formatShortRangeLabel(historyCustomFrom, historyCustomTo)
                            : (t.rangeCustom || "自訂")
                        }
                      ]
                  ).map(chip => (
                    <Pressable
                      key={chip.id}
                      style={[styles.filterChip, historyRange === chip.id && styles.filterChipActive]}
                      onPress={() => {
                        if (chip.id === "custom") {
                          setHistoryRange("custom")
                          setHistoryCalendarOpen(true)
                          setHistoryPickPhase("from")
                          if (!historyCustomFrom) {
                            setHistoryCustomFrom("")
                            setHistoryCustomTo("")
                          }
                          setHistoryMonthKey(historyCustomFrom || todayLocalDateKey())
                          setHistoryStatsOpen(true)
                        } else {
                          setHistoryRange(chip.id)
                          setHistoryCalendarOpen(false)
                          if (layout !== "stats") setHistoryStatsOpen(false)
                        }
                      }}
                    >
                      <Text style={[styles.filterChipText, historyRange === chip.id && styles.filterChipTextActive]}>
                        {chip.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {layout === "full" ? (
                <View style={styles.filterChipRow}>
                  {[
                    { id: "all", label: t.classAll || "全部" },
                    { id: "attention", label: t.classAttention || "需關注" },
                    { id: "daily", label: t.classDaily || "日常" }
                  ].map(chip => (
                    <Pressable
                      key={chip.id}
                      style={[styles.filterChip, historyClass === chip.id && styles.filterChipActive]}
                      onPress={() => setHistoryClass(chip.id)}
                    >
                      <Text style={[styles.filterChipText, historyClass === chip.id && styles.filterChipTextActive]}>
                        {chip.label}
                        {alertFilterCounts
                          ? ` ${alertFilterCounts[chip.id === "attention" ? "classAttention" : chip.id === "daily" ? "classDaily" : "classAll"] ?? 0}`
                          : ""}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                ) : null}
              </View>
            ) : null}

            {layout === "full" && summary ? (
              <View style={styles.summaryCard}>
                <Text style={styles.sectionTitle}>{summary}</Text>
              </View>
            ) : null}

            {isAlertsFeature && historyCalendarOpen && (layout === "history" || (layout === "full" && alertFilter === "history")) ? (
              <MonthCalendar
                dateKey={historyMonthKey}
                days={alertCalendarDays}
                rangeStart={historyCustomFrom}
                rangeEnd={historyCustomTo || historyCustomFrom}
                onSelectDate={dateKey => {
                  if (historyPickPhase === "from" || !historyCustomFrom) {
                    setHistoryCustomFrom(dateKey)
                    setHistoryCustomTo(dateKey)
                    setHistoryPickPhase("to")
                  } else {
                    const norm = normalizeInclusiveRange(historyCustomFrom, dateKey)
                    setHistoryCustomFrom(norm.from)
                    setHistoryCustomTo(norm.to)
                    setHistoryPickPhase("from")
                  }
                }}
                onShiftMonth={offset => setHistoryMonthKey(current => shiftMonthKey(current, offset))}
                weekdays={weekdayShortLabels(uiLang || "zh")}
                lang={uiLang || "zh"}
                legend={
                  historyPickPhase === "to"
                    ? (t.pickRangeHintTo || "選擇結束日")
                    : (t.pickRangeHintFrom || "選擇起始日")
                }
                renderValue={day => (
                  day.markLabel
                    ? (
                      <Text style={{
                        marginTop: 2,
                        fontSize: 9,
                        fontWeight: "900",
                        color: day.hasDanger ? "#fff" : "#526b88"
                      }}
                      >
                        {day.markLabel}
                      </Text>
                    )
                    : null
                )}
                footer={(
                  <View style={styles.calendarFooterRow}>
                    <Pressable
                      style={styles.calendarFooterBtn}
                      onPress={() => {
                        setHistoryCustomFrom("")
                        setHistoryCustomTo("")
                        setHistoryPickPhase("from")
                      }}
                    >
                      <Text style={styles.calendarFooterBtnText}>{t.calendarRetap || "重選區間"}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.calendarFooterBtn, styles.calendarFooterBtnPrimary]}
                      onPress={() => {
                        if (historyCustomFrom && historyCustomTo) {
                          setHistoryCalendarOpen(false)
                          setHistoryStatsOpen(true)
                        }
                      }}
                    >
                      <Text style={[styles.calendarFooterBtnText, styles.calendarFooterBtnTextPrimary]}>
                        {t.calendarDone || "完成"}
                      </Text>
                    </Pressable>
                  </View>
                )}
              />
            ) : null}

            {isAlertsFeature && layout === "full" && alertFilter === "history" && historyRange === "custom" && customRangeReady && !historyCalendarOpen ? (
              <Pressable style={styles.statsToggleBtn} onPress={() => setHistoryCalendarOpen(true)}>
                <Text style={styles.statsToggleText}>{t.rangeCustom || "調整日期區間"}</Text>
              </Pressable>
            ) : null}

            {isAlertsFeature && layout === "full" && alertFilter === "history" && (historyRange !== "custom" || customRangeReady) ? (
              <Pressable style={styles.statsToggleBtn} onPress={() => setHistoryStatsOpen(v => !v)}>
                <Text style={styles.statsToggleText}>
                  {historyStatsOpen
                    ? (t.statsToggleHide || "收合趨勢摘要")
                    : (t.statsToggleShow || "顯示趨勢摘要")}
                </Text>
              </Pressable>
            ) : null}

            {isAlertsFeature && (layout === "stats" || layout === "history" || (alertFilter === "history" && historyStatsOpen)) && displayAlertStats?.totals ? (
              <View style={[styles.statsBlock, nightOn ? styles.nightStatBlock : null]}>
                {layout === "history" ? null : (
                  <Text style={styles.statsLead}>{t.weekSummary || "本週摘要"}</Text>
                )}
                {layout === "history" ? (
                  <View style={styles.statsRow}>
                    {[
                      { id: "fall", value: displayAlertStats.totals.alertHigh ?? 0, label: t.statsAlert || "跌倒通報", tone: "fall" },
                      { id: "daily", value: displayAlertStats.totals.recordOnly ?? 0, label: t.chipDaily || "蹲下／彎腰", tone: "daily" },
                      { id: "sos", value: displayAlertStats.totals.sosCount ?? 0, label: t.statsSos || "求救", tone: "sos" }
                    ].map((card) => {
                      const on = historyClass === card.id
                      return (
                        <Pressable
                          key={card.id}
                          onPress={() => setHistoryClass(on ? "all" : card.id)}
                          style={[
                            styles.statCard,
                            nightOn ? styles.nightStatCard : null,
                            on ? styles.statCardOn : null,
                            nightOn && on ? styles.nightStatCardOn : null,
                            card.tone === "fall" ? styles.statCardFall : null,
                            card.tone === "daily" ? styles.statCardDaily : null,
                            card.tone === "sos" ? styles.statCardSos : null,
                            on && card.tone === "fall" ? styles.statCardFallOn : null,
                            on && card.tone === "daily" ? styles.statCardDailyOn : null,
                            on && card.tone === "sos" ? styles.statCardSosOn : null
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${card.label} ${card.value}`}
                        >
                          <View style={[
                            styles.statIconWrap,
                            card.tone === "fall" ? styles.statIconFall : null,
                            card.tone === "sos" ? styles.statIconSos : null
                          ]}>
                            <NeoIcon
                              name={card.tone === "fall" ? "run-fast" : card.tone === "sos" ? "call" : "human-male"}
                              size={card.tone === "sos" ? 14 : 16}
                              color={card.tone === "fall" ? "#FF4D4D" : card.tone === "sos" ? "#FFA726" : "#FFFFFF"}
                            />
                          </View>
                          <Text style={[styles.statLabel, nightOn ? styles.nightMuted : null]} numberOfLines={1}>{card.label}</Text>
                          <Text style={[styles.statValue, nightOn ? styles.nightTitle : null]}>{card.value}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                ) : (
                  <View style={styles.statsRow}>
                    {[
                      { id: "fall", value: displayAlertStats.totals.alertHigh ?? 0, label: t.statsAlert || "跌倒通報", tone: "fall" },
                      { id: "daily", value: displayAlertStats.totals.recordOnly ?? 0, label: t.chipDaily || t.statsDaily || "蹲下／彎腰", tone: "daily" },
                      { id: "sos", value: displayAlertStats.totals.sosCount ?? 0, label: t.statsSos || "求救", tone: "sos" }
                    ].map((card) => (
                      <View
                        key={card.id}
                        style={[
                          styles.statCard,
                          nightOn ? styles.nightStatCard : null,
                          card.tone === "fall" ? styles.statCardFall : null,
                          card.tone === "daily" ? styles.statCardDaily : null,
                          card.tone === "sos" ? styles.statCardSos : null
                        ]}
                      >
                        <View style={[
                          styles.statIconWrap,
                          card.tone === "fall" ? styles.statIconFall : null,
                          card.tone === "sos" ? styles.statIconSos : null
                        ]}>
                          <NeoIcon
                            name={card.tone === "fall" ? "run-fast" : card.tone === "sos" ? "call" : "human-male"}
                            size={card.tone === "sos" ? 14 : 16}
                            color={card.tone === "fall" ? "#FF4D4D" : card.tone === "sos" ? "#FFA726" : "#FFFFFF"}
                          />
                        </View>
                        <Text style={[styles.statLabel, nightOn ? styles.nightMuted : null]} numberOfLines={1}>{card.label}</Text>
                        <Text style={[styles.statValue, nightOn ? styles.nightTitle : null]}>{card.value}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {Array.isArray(displayAlertStats.series) && displayAlertStats.series.length ? (
                  <WeekDots
                    series={displayAlertStats.series}
                    focus={layout === "history" ? historyClass : "all"}
                    lang={langKey}
                    weekPrefix={lookupI18n(langKey, "time.weekPrefix", "")}
                  />
                ) : null}
                {layout !== "history" && !sentryLayout && Array.isArray(displayAlertStats.series) && displayAlertStats.series.length ? (
                  <View style={styles.barChart}>
                    <Text style={styles.barChartTitle}>{t.statsBarTitle || "每天發生次數"}</Text>
                    <View style={styles.chartLegendRow}>
                      <View style={styles.chartLegendItem}>
                        <View style={[styles.chartLegendDot, { backgroundColor: "#b42318" }]} />
                        <Text style={styles.chartLegendText}>{t.statsAlert || "跌倒"}</Text>
                      </View>
                      <View style={styles.chartLegendItem}>
                        <View style={[styles.chartLegendDot, { backgroundColor: "#98a2b3" }]} />
                        <Text style={styles.chartLegendText}>{t.statsDaily || "日常動作"}</Text>
                      </View>
                    </View>
                    <Text style={styles.statsHint}>{t.statsHint || "紅＝跌倒　灰＝蹲下／彎腰（不必處理）"}</Text>
                    <View style={styles.barRow}>
                      {(() => {
                        const days = displayAlertStats.series.length > 14
                          ? displayAlertStats.series.slice(-14)
                          : displayAlertStats.series
                        const globalMax = Math.max(1, ...days.map(d => (Number(d.alertHigh) || 0) + (Number(d.recordOnly) || 0)))
                        return days.map(day => {
                          const high = Number(day.alertHigh) || 0
                          const daily = Number(day.recordOnly) || 0
                          const highH = Math.round((high / globalMax) * 96)
                          const dailyH = Math.round((daily / globalMax) * 96)
                          const dateLabel = String(day.date || "").slice(5).replace("-", "/")
                          return (
                            <View key={day.date} style={styles.barCol}>
                              <View style={styles.barTrack}>
                                {dailyH > 0 ? <View style={[styles.barSegDaily, { height: Math.max(dailyH, 4) }]} /> : null}
                                {highH > 0 ? <View style={[styles.barSegHigh, { height: Math.max(highH, 4) }]} /> : null}
                              </View>
                              <Text style={styles.barDate}>{dateLabel}</Text>
                            </View>
                          )
                        })
                      })()}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {layout === "stats" ? null : visibleRecords.length ? (
              isAlertsFeature && !sentryLayout && (layout === "history" || alertFilter === "history") && historyDayGroups
                ? historyDayGroups.map(group => (
                  <View key={group.dateKey} style={styles.historyDayGroup}>
                    <Text style={[styles.historyDayHeader, nightOn ? styles.nightTitle : null]}>{formatHistoryDayLabel(group.dateKey, uiLang)}</Text>
                    {group.records.map((record, index) => (
                      <NativeRecordCard
                        key={record._id || record.eventId || record.alertId || record.reminderId || index}
                        record={record}
                        index={index}
                        t={t}
                        alertLifecycle={alertLifecycle}
                        reminderActions={reminderActions}
                        isAlertsFeature={isAlertsFeature}
                        isSosFeature={isSosFeature}
                        readOnly={alertsReadOnly}
                        emphasize={false}
                        apiBaseUrl={apiBaseUrl}
                        token={token}
                        role={role}
                        uiLang={uiLang}
                        onSosResolve={handleSosResolve}
                        sosResolveBusy={Boolean(sosActionBusyId)}
                        onJumpToTime={onJumpToTime}
                        compact={sentryLayout}
                        ledger={layout === "history"}
                      />
                    ))}
                  </View>
                ))
                : visibleRecords.map((record, index) => (
                  <NativeRecordCard
                    key={record._id || record.eventId || record.alertId || record.reminderId || index}
                    record={record}
                    index={index}
                    t={t}
                    alertLifecycle={alertLifecycle}
                    reminderActions={reminderActions}
                    isAlertsFeature={isAlertsFeature}
                    isSosFeature={isSosFeature}
                    readOnly={alertsReadOnly}
                    emphasize={isAlertsFeature && layout === "full" && alertFilter === "now" && index === 0}
                    apiBaseUrl={apiBaseUrl}
                    token={token}
                    role={role}
                    uiLang={uiLang}
                    onSosResolve={handleSosResolve}
                    sosResolveBusy={Boolean(sosActionBusyId)}
                    onJumpToTime={onJumpToTime}
                    compact={sentryLayout}
                    ledger={layout === "history"}
                  />
                ))
            ) : layout === "stats" || sentryLayout || loading ? null : (
              <Text style={[styles.emptyText, nightOn ? styles.nightMuted : null]}>
                {isSosFeature
                  ? lookupI18n(uiLang, "sos.historyEmpty", "尚無呼叫紀錄")
                  : isAlertsFeature
                    ? (alertFilter === "now"
                      ? (t.nowEmpty || t.noAlert || t.noRecord)
                      : (t.historyEmpty || t.noAlert || t.noRecord))
                    : t.noRecord}
              </Text>
            )}
          </>
        )}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={phoneModalVisible}
        onRequestClose={() => setPhoneModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalPanel}>
            <Text style={styles.modalTitle}>{t.phoneModalTitle}</Text>
            <Text style={styles.modalText}>{t.phoneModalText}</Text>
            <TextInput
              style={styles.input}
              value={phoneDraft}
              onChangeText={setPhoneDraft}
              keyboardType="phone-pad"
              placeholder={t.sosPhonePlaceholder}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryBtn} onPress={() => setPhoneModalVisible(false)}>
                <Text style={styles.secondaryBtnText}>{t.later}</Text>
              </Pressable>
              <Pressable style={styles.primaryBtnInline} onPress={handleSavePhone}>
                <Text style={styles.primaryBtnText}>{t.save}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(sosActiveRecordId) && sosCancelSeconds > 0}
        onRequestClose={() => {}}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalPanel, styles.sosCardPanel]}>
            <Text style={styles.modalTitle}>{t.sosCancelTitle || "已通知看護與家屬"}</Text>
            <Text style={styles.sosCountdown}>{sosCancelSeconds}</Text>
            <Text style={styles.sosCardSub}>
              {sosCancelSeconds} {t.sosCancelSub || "秒內可取消"}
            </Text>
            <Pressable
              style={[styles.sosButton, styles.sosCardCancelBtn]}
              onPress={handleCancelSos}
              disabled={sosCancelBusy}
            >
              <Text style={styles.sosButtonText}>
                {sosCancelBusy ? "…" : (t.sosCancelBtn || "不小心按到／取消")}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(sosSentVisible) && Boolean(sosActiveRecordId) && sosCancelSeconds === 0}
        onRequestClose={closeSosSentCard}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalPanel, styles.sosCardPanel]}>
            <Text style={styles.modalTitle}>{t.sosCancelDone || "已發送通知"}</Text>
            <Pressable
              style={[styles.primaryBtn, { alignSelf: "stretch", marginTop: 12 }]}
              onPress={closeSosSentCard}
            >
              <Text style={styles.primaryBtnText}>{t.sosSentClose || "關閉"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </View>
    </NightSkinProvider>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  liveFeedScreen: {
    flex: 1,
    backgroundColor: "transparent"
  },
  header: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14
  },
  backText: {
    color: colors.pine,
    fontWeight: "900"
  },
  title: {
    marginTop: 8,
    color: colors.text,
    fontSize: 22,
    fontWeight: "900"
  },
  subtitle: {
    marginTop: 4,
    color: "#526b88",
    lineHeight: 20
  },
  container: {
    padding: 16,
    gap: 12,
    paddingBottom: 28
  },
  liveFeedContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 20,
    gap: 12
  },
  actions: {
    flexDirection: "row",
    gap: 10
  },
  summaryCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14
  },
  formCard: {
    backgroundColor: "#191B22",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: 14
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  label: {
    marginTop: 10,
    marginBottom: 5,
    color: "#8E95A3",
    fontWeight: "800"
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    backgroundColor: "#13151B",
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: "#FFFFFF"
  },
  sosButton: {
    minHeight: 116,
    borderRadius: 18,
    backgroundColor: "#b42318",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    marginBottom: 8,
    shadowColor: "#7a271a",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4
  },
  sosButtonText: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900"
  },
  sosCardPanel: {
    alignItems: "center",
    paddingVertical: 28
  },
  sosCountdown: {
    fontSize: 64,
    fontWeight: "900",
    color: "#b42318",
    marginVertical: 8
  },
  sosCardSub: {
    color: "#526b88",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8
  },
  sosCardCancelBtn: {
    marginTop: 12,
    alignSelf: "stretch",
    minHeight: 72
  },
  firstAidBox: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    gap: 12
  },
  firstAidTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900"
  },
  firstAidStep: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#f8fbff"
  },
  firstAidImage: {
    width: "100%",
    height: 150,
    backgroundColor: "#eef6ff"
  },
  firstAidTextBox: {
    padding: 12
  },
  firstAidStepTitle: {
    color: colors.text,
    fontWeight: "900"
  },
  firstAidStepDesc: {
    marginTop: 5,
    color: "#4f6682",
    lineHeight: 20,
    fontWeight: "700"
  },
  sosHistoryCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ffd0d0",
    borderRadius: 16,
    padding: 16,
    gap: 8
  },
  sosHistoryStatus: {
    fontSize: 22,
    fontWeight: "900"
  },
  sosStatusActive: { color: "#c62828" },
  sosStatusHandling: { color: "#ef6c00" },
  sosStatusDone: { color: "#2e7d32" },
  sosStatusMuted: { color: "#78909c" },
  sosHistoryMessage: {
    color: "#1a2330",
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 28
  },
  sosHistoryMapBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#eef5ff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4
  },
  sosHistoryMapBtnText: {
    color: colors.pine,
    fontWeight: "800"
  },
  sosHistoryAddress: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22
  },
  sosHistoryMeta: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "600"
  },
  sosHistoryHandler: {
    color: "#ef6c00",
    fontSize: 13,
    fontWeight: "700"
  },
  sosHistoryActions: {
    marginTop: 8,
    gap: 8
  },
  sosHistory119: {
    backgroundColor: "#c62828",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  sosHistory119Text: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900"
  },
  sosHistorySecondary: {
    backgroundColor: colors.pine,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center"
  },
  sosHistorySecondaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800"
  },
  sosHistoryGhost: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center"
  },
  sosHistoryGhostText: {
    color: "#475569",
    fontSize: 15,
    fontWeight: "700"
  },
  ctaDisabled: {
    opacity: 0.5
  },
  recordCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14
  },
  recordCardMuted: {
    backgroundColor: "#f7f8fa",
    borderColor: "#e4e7ec"
  },
  recordCardHero: {
    borderColor: "#b42318",
    borderWidth: 2,
    backgroundColor: "#fff7f6",
    minHeight: 120
  },
  recordTitleHero: {
    fontSize: 20
  },
  alertTimeHero: {
    color: "#b42318",
    fontSize: 15,
    fontWeight: "900"
  },
  nowOthersHint: {
    marginTop: 8,
    color: "#667085",
    lineHeight: 20,
    fontWeight: "600"
  },
  statsLead: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22
  },
  statsSub: {
    color: "#667085",
    fontSize: 13,
    fontWeight: "600"
  },
  statsHint: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18
  },
  statsBlock: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e8eef5",
    borderRadius: 16,
    padding: 16,
    gap: 16
  },
  healthHero: {
    alignItems: "flex-start",
    paddingVertical: 4
  },
  healthHeroValue: {
    color: "#111827",
    fontSize: 40,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    lineHeight: 46
  },
  healthHeroLabel: {
    marginTop: 4,
    color: "#374151",
    fontSize: 15,
    fontWeight: "600"
  },
  weekDots: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: "#13151A",
    borderRadius: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    overflow: "hidden"
  },
  weekDotsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#13151A",
    borderRadius: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    gap: 8
  },
  weekDotsTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  weekDotsRow: { flexDirection: "row", justifyContent: "space-between" },
  weekDotCol: { flex: 1, minWidth: 0, alignItems: "center", overflow: "hidden", paddingHorizontal: 1 },
  weekDotColWide: { flex: 0, width: 44, alignItems: "center" },
  weekDotStack: { height: 16, alignItems: "center", justifyContent: "center" },
  weekDot: { width: 6, height: 6, borderRadius: 3 },
  weekDotSlot: { width: 6, height: 6 },
  weekDotEmpty: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.1)" },
  weekDotFall: { backgroundColor: "#FF4D4D", boxShadow: "0 0 6px rgba(255,77,77,0.7)" },
  weekDotSos: { backgroundColor: "#FFA726", boxShadow: "0 0 6px rgba(255,167,38,0.6)" },
  weekDotDaily: { backgroundColor: "#10B981", boxShadow: "0 0 6px rgba(16,185,129,0.55)" },
  weekDotDate: { color: "#8E95A3", fontSize: 10, fontVariant: ["tabular-nums"] },
  weekDotWeek: { color: "#FFFFFF", fontSize: 11, fontWeight: "600", marginVertical: 4 },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16
  },
  statCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 108,
    backgroundColor: "#191B22",
    borderRadius: 16,
    padding: 14,
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  statIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center"
  },
  statIconFall: {
    backgroundColor: "rgba(255,77,77,0.2)"
  },
  statIconSos: {
    backgroundColor: "rgba(255,167,38,0.2)"
  },
  statCardOn: {
    backgroundColor: "#1B382B"
  },
  statCardFall: {
    borderLeftWidth: 2,
    borderLeftColor: "#FF4D4D"
  },
  statCardDaily: {
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255,255,255,0.22)"
  },
  statCardSos: {
    borderLeftWidth: 2,
    borderLeftColor: "#FFA726"
  },
  statCardFallOn: {
    borderColor: "#FF4D4D",
    backgroundColor: "rgba(255,77,77,0.12)"
  },
  statCardDailyOn: {
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: colors.bg
  },
  statCardSosOn: {
    borderColor: "#F59E0B",
    backgroundColor: "rgba(245,158,11,0.12)"
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.6,
    marginTop: 4
  },
  statLabel: {
    marginTop: 8,
    color: "#8E95A3",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "left"
  },
  statsDelta: {
    color: "#526b88",
    fontSize: 12,
    fontWeight: "700"
  },
  statsDeltaMini: {
    marginTop: 4,
    color: "#667085",
    fontSize: 10,
    fontWeight: "700"
  },
  chartLegendRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 4
  },
  chartLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  chartLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 2
  },
  chartLegendText: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "700"
  },
  barChart: { gap: 8 },
  barChartTitle: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800"
  },
  barRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    minHeight: 128
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    gap: 6
  },
  barCount: {
    color: "#667085",
    fontSize: 9,
    fontWeight: "700",
    minHeight: 12
  },
  barTrack: {
    width: "100%",
    height: 108,
    borderRadius: 6,
    backgroundColor: "#eef2f6",
    overflow: "hidden",
    justifyContent: "flex-end",
    alignItems: "stretch"
  },
  barSegHigh: {
    width: "100%",
    backgroundColor: "#b42318"
  },
  barSegDaily: {
    width: "100%",
    backgroundColor: "#98a2b3"
  },
  barDate: {
    fontSize: 10,
    color: "#374151",
    fontWeight: "600"
  },
  evidenceBox: {
    marginTop: 10,
    gap: 8
  },
  evidenceImage: {
    width: "100%",
    height: 160,
    borderRadius: 10,
    backgroundColor: "#eef2f6"
  },
  evidenceClipWrap: {
    width: "100%",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#000",
    gap: 6
  },
  evidenceClip: {
    width: "100%",
    height: 200,
    backgroundColor: "#000"
  },
  evidenceClipLabel: {
    color: "#344054",
    fontWeight: "700",
    lineHeight: 20
  },
  recordTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900"
  },
  recordTime: {
    marginTop: 4,
    color: "#70839d",
    fontSize: 12
  },
  fieldRow: {
    borderTopWidth: 1,
    borderTopColor: "#edf3fd",
    paddingTop: 8,
    marginTop: 8
  },
  fieldKey: {
    color: "#607990",
    fontSize: 12,
    fontWeight: "800"
  },
  fieldValue: {
    marginTop: 3,
    color: colors.text,
    lineHeight: 20
  },
  recordActions: {
    flexDirection: "row",
    marginTop: 10,
    alignItems: "center",
    gap: 8
  },
  recordActionBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingVertical: 0,
    height: 36,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  recordActionBtnPrimary: {
    backgroundColor: "transparent",
    borderColor: "rgba(255,255,255,0.1)"
  },
  recordActionText: {
    color: "#FFFFFF",
    fontWeight: "600"
  },
  recordActionTextPrimary: {
    color: "#FFFFFF"
  },
  alertHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0
  },
  alertSummaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  alertTimeInline: {
    color: "#70839d",
    fontSize: 13,
    fontWeight: "800"
  },
  alertSummaryLine: {
    marginTop: 8,
    color: "#4f6682",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  expandHint: {
    marginTop: 6,
    color: colors.pine,
    fontSize: 12,
    fontWeight: "800"
  },
  alertDetailBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#edf3fd",
    gap: 4
  },
  detailLine: {
    color: colors.text,
    fontWeight: "700",
    lineHeight: 20
  },
  severityDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  activityCard: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderColor: "#e4e7ec"
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  activityTimeHit: {
    alignSelf: "flex-start",
    minHeight: 28,
    justifyContent: "center"
  },
  activityDate: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"]
  },
  activityClock: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"]
  },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  ledgerBookRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  ledgerBookMeta: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  ledgerTime: {
    width: 40,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    lineHeight: 16
  },
  ledgerBody: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  ledgerFollow: {
    color: "#1f2937",
    fontSize: 12,
    fontWeight: "600"
  },
  activityMainHit: {
    minWidth: 0,
    gap: 2
  },
  activityTime: {
    width: 62,
    color: "#667085",
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"]
  },
  activityTimeLink: {
    color: "#3B82F6",
    textDecorationLine: "underline"
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  activityBody: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  activityTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700"
  },
  activityStatus: {
    color: "#1f2937",
    fontSize: 12,
    fontWeight: "600"
  },
  activityThumb: {
    width: 88,
    height: 50,
    borderRadius: 8,
    backgroundColor: "#eef2f6"
  },
  activityThumbPlaceholder: {
    width: 88,
    height: 50,
    borderRadius: 8,
    backgroundColor: "#eef2f6",
    alignItems: "center",
    justifyContent: "center"
  },
  activityThumbPlaceholderText: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "800"
  },
  activityThumbEmpty: {
    width: 88,
    height: 50,
    borderRadius: 8,
    backgroundColor: "#eef2f6"
  },
  filterChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  filterChip: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#191B22",
    minHeight: 40,
    justifyContent: "center"
  },
  filterChipActive: {
    backgroundColor: "#1B382B",
    borderColor: "rgba(16,185,129,0.4)"
  },
  filterChipText: {
    color: "#8E95A3",
    fontWeight: "700",
    fontSize: 13
  },
  filterChipTextActive: {
    color: "#10B981"
  },
  historyChipBlock: {
    gap: 8,
    marginBottom: 4
  },
  calendarFooterRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10
  },
  calendarFooterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#191B22",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  calendarFooterBtnPrimary: {
    backgroundColor: "#10B981",
    borderColor: "#10B981"
  },
  calendarFooterBtnText: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "800"
  },
  calendarFooterBtnTextPrimary: {
    color: "#0B0D0E"
  },
  historyDayGroup: {
    gap: 8,
    marginBottom: 10
  },
  historyDayHeader: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
    marginBottom: 2
  },
  statsToggleBtn: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 2
  },
  statsToggleText: {
    color: colors.pine,
    fontSize: 13,
    fontWeight: "800"
  },
  historyFilterBar: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center"
  },
  manualReportHit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 2
  },
  manualReportText: {
    color: "#10B981",
    fontSize: 12,
    fontWeight: "700"
  },
  compactSelectWrap: {
    flex: 1,
    minWidth: 0
  },
  compactSelectChevron: {
    color: "#4b5563",
    fontSize: 10,
    marginLeft: 6
  },
  dropdownBtn: {
    backgroundColor: "#191B22",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6
  },
  dropdownLabel: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 2
  },
  dropdownValue: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "400"
  },
  pickerPanel: {
    backgroundColor: "#191B22",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 12,
    width: "100%",
    maxWidth: 360,
    gap: 6
  },
  pickerTitle: {
    color: "#8E95A3",
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingBottom: 4
  },
  pickerOption: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#13151B"
  },
  pickerOptionActive: {
    backgroundColor: "rgba(16,185,129,0.15)",
    borderWidth: 1,
    borderColor: "#10B981"
  },
  pickerOptionText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700"
  },
  pickerOptionTextActive: {
    color: "#10B981"
  },
  pickerOptionHint: {
    marginTop: 4,
    color: "#667085",
    fontSize: 12,
    fontWeight: "600"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8
  },
  methodChip: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#191B22"
  },
  methodChipActive: {
    backgroundColor: "rgba(16,185,129,0.15)",
    borderColor: "#10B981"
  },
  methodChipText: {
    color: "#8E95A3",
    fontWeight: "800",
    fontSize: 13
  },
  methodChipTextActive: {
    color: "#10B981"
  },
  readonlyHint: {
    color: "#667085",
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 4
  },
  plannedCard: {
    backgroundColor: "#fffaf0",
    borderWidth: 1,
    borderColor: "#f5d0a9",
    borderRadius: 12,
    padding: 16,
    gap: 8
  },
  plannedBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#f79009",
    color: "#fff",
    overflow: "hidden",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontWeight: "900",
    fontSize: 12
  },
  plannedTitle: {
    color: "#7a2e0e",
    fontSize: 18,
    fontWeight: "900"
  },
  plannedDesc: {
    color: "#9a3412",
    lineHeight: 22,
    fontWeight: "700"
  },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: colors.pine,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  primaryBtnInline: {
    flex: 1,
    backgroundColor: "#b42318",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "900"
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#191B22",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.4)",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center"
  },
  secondaryBtnCompact: {
    marginTop: 10,
    backgroundColor: "#191B22",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.4)",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center"
  },
  secondaryBtnText: {
    color: "#10B981",
    fontWeight: "900"
  },
  message: {
    color: "#067647",
    fontWeight: "800"
  },
  error: {
    color: "#b42318",
    fontWeight: "800"
  },
  emptyText: {
    color: "#8E95A3",
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "600"
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(11, 13, 14, 0.72)"
  },
  modalPanel: {
    backgroundColor: "#191B22",
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900"
  },
  modalText: {
    marginTop: 8,
    marginBottom: 14,
    color: "#526b88",
    lineHeight: 20,
    fontWeight: "700"
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14
  },
  emergencyBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(127, 29, 29, 0.52)"
  },
  emergencyPanel: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18
  },
  emergencyTitle: {
    color: "#b42318",
    fontSize: 26,
    fontWeight: "900"
  },
  emergencyText: {
    marginTop: 6,
    color: "#7a271a",
    lineHeight: 20,
    fontWeight: "800"
  },
  emergencyInfo: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#fecdca",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff7f5",
    gap: 6
  },
  emergencyLine: {
    color: colors.text,
    lineHeight: 20,
    fontWeight: "800"
  },
  dismissEmergencyBtn: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 10
  },
  dismissEmergencyText: {
    color: "#667085",
    fontWeight: "900"
  },
  nightScreen: {
    backgroundColor: night.bg
  },
  nightCard: {
    backgroundColor: "#191B22",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 16
  },
  nightCardMuted: {
    backgroundColor: night.cardSoft,
    borderColor: night.border
  },
  nightTitle: {
    color: night.text
  },
  nightMuted: {
    color: "#8E95A3",
    fontSize: 12
  },
  nightClock: {
    color: night.textMuted
  },
  nightTimeLink: {
    color: "#10B981",
    textDecorationLine: "underline"
  },
  nightGoldText: {
    color: night.gold
  },
  nightThumbEmpty: {
    backgroundColor: night.cardSoft
  },
  nightDropdown: {
    backgroundColor: "#191B22",
    borderColor: "rgba(255,255,255,0.1)"
  },
  nightPickerPanel: {
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)"
  },
  nightPickerOptionOn: {
    backgroundColor: "rgba(255,200,0,0.12)"
  },
  nightStatBlock: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.12)"
  },
  nightStatCard: {
    backgroundColor: "#191B22",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16
  },
  nightStatCardOn: {
    backgroundColor: night.cardSoft
  },
  designEvent: { gap: 10 },
  designEventTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  designThumbHit: { width: 72, height: 72, borderRadius: 14, overflow: "hidden" },
  designThumb: { width: 72, height: 72, borderRadius: 14, backgroundColor: "#1A1C20" },
  designEventMeta: { flex: 1, minWidth: 0, gap: 4 },
  designEventHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  designTypeRow: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "62%" },
  designTypeIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  designTypeIconFall: { backgroundColor: "rgba(255,77,77,0.2)" },
  designTypeIconDaily: { backgroundColor: "rgba(16,185,129,0.2)" },
  designTypeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", flexShrink: 1 },
  ledgerNote: { color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: "500", marginTop: 2 },
  designRiskPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  designRiskPillHot: {
    backgroundColor: "rgba(255,77,77,0.15)"
  },
  designRiskPillOk: {
    backgroundColor: "rgba(16,185,129,0.15)"
  },
  designRiskDot: { width: 7, height: 7, borderRadius: 4 },
  designRiskDotHot: { backgroundColor: "#FF4D4D" },
  designRiskDotOk: { backgroundColor: "#10B981" },
  designRiskText: { color: "#FF4D4D", fontSize: 12, fontWeight: "700" },
  designRiskTextOk: { color: "#10B981" },
  designTimeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  designPlay: {
    position: "absolute",
    left: 18,
    top: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center"
  },
  nightSentryCard: {
    backgroundColor: "#191B22",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 16,
    overflow: "hidden",
    position: "relative"
  },
  nightSentryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  nightSentryThumbHit: {
    width: 92,
    height: 92,
    borderRadius: 16,
    overflow: "hidden"
  },
  nightSentryThumb: {
    width: 92,
    height: 92,
    borderRadius: 16,
    backgroundColor: "#1a1a1a"
  },
  nightPlay: {
    position: "absolute",
    left: 28,
    top: 28,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center"
  },
  nightSentryMeta: {
    flex: 1,
    paddingVertical: 6,
    paddingRight: 12
  },
  nightTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginBottom: 8
  },
  nightTagText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontWeight: "600"
  },
  nightSentryTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700"
  },
  nightSentryTime: {
    marginTop: 6,
    color: "#8E95A3",
    fontSize: 12,
    fontVariant: ["tabular-nums"]
  },
  liveTimeLink: {
    color: "#10B981",
    textDecorationLine: "underline",
    fontWeight: "700"
  },
  nightUnread: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF3B30"
  },
  nightChevron: {
    color: night.textMuted,
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 32,
    paddingHorizontal: 4
  }
})
