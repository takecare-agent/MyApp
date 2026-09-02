import { REMINDER_CAT_DEFS, REMINDER_PRESET_DEFS, toReminderCatCode } from "./contentLabels"

/** @deprecated 顯示請用 reminderCatLabel；寫入請用 code */
export const REMINDER_CATEGORIES = REMINDER_CAT_DEFS.map((d) => d.code)

/** 重複提醒打卡會寫入 source=template:… 的 Reminder，單次列表應排除 */
export function isTemplateReminderSource(source) {
  return String(source || "").startsWith("template:")
}

/** weekdays 空＝每天；否則含今日 weekday (0=日) */
export function templateAppliesToday(template, now = new Date()) {
  const days = Array.isArray(template?.weekdays) ? template.weekdays : []
  if (!days.length) return true
  return days.includes(now.getDay())
}

/** 依 code 取內建常用（繁中 fallback；UI 請用 reminderContentPresetOptions） */
export const REMINDER_DETAIL_PRESETS = Object.fromEntries(
  Object.entries(REMINDER_PRESET_DEFS).map(([code, list]) => [code, list.map((p) => p.zh)])
)
// 舊中文 key 相容
REMINDER_CAT_DEFS.forEach((d) => {
  REMINDER_DETAIL_PRESETS[d.zh] = REMINDER_DETAIL_PRESETS[d.code] || []
})

export { toReminderCatCode }

export function formatReminderTime(iso) {
  if (!iso) return "--:--"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "--:--"
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${mm}/${dd} ${hh}:${mi}`
}

export function formatHHmm(iso) {
  if (!iso) return "--:--"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "--:--"
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function isSameLocalDay(iso, base = new Date()) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return (
    d.getFullYear() === base.getFullYear() &&
    d.getMonth() === base.getMonth() &&
    d.getDate() === base.getDate()
  )
}

/** 近 N 日（含今天）的本地日開始 */
export function startOfLocalDaysAgo(days = 7, base = new Date()) {
  const n = Math.max(1, Math.min(30, Number(days) || 7))
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0)
  d.setDate(d.getDate() - (n - 1))
  return d
}

export function isWithinLastLocalDays(iso, days = 7, base = new Date()) {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return false
  return t >= startOfLocalDaysAgo(days, base)
}

/** 完成紀錄用：優先 completedAt */
export function getCompletionInstant(record) {
  const c = record?.completedAt ? new Date(record.completedAt) : null
  if (c && !Number.isNaN(c.getTime())) return c
  const t = record?.time ? new Date(record.time) : null
  if (t && !Number.isNaN(t.getTime())) return t
  return null
}

export function formatLocalDateLabel(isoOrDate, base = new Date(), lang = "zh") {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate)
  if (Number.isNaN(d.getTime())) return "--"
  const week = {
    zh: ["日", "一", "二", "三", "四", "五", "六"],
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    id: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"],
    vi: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
    tl: ["Lin", "Lun", "Mar", "Miy", "Huw", "Biy", "Sab"],
    th: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"]
  }[lang] || ["日", "一", "二", "三", "四", "五", "六"]
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${mm}/${dd}（${week[d.getDay()]}）`
}

export function localDayKey(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate)
  if (Number.isNaN(d.getTime())) return "unknown"
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function roleLabelZh(role) {
  if (role === "caregiver") return "看護"
  if (role === "family") return "家屬"
  if (role === "patient") return "受顧者"
  return role ? String(role) : "—"
}
