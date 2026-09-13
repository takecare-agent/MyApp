/**
 * 日期／星期／時間顯示跟 uiLang
 */
export const LOCALE_BY_LANG = {
  zh: "zh-TW",
  en: "en-US",
  id: "id-ID",
  vi: "vi-VN",
  tl: "fil-PH",
  th: "th-TH"
}

/** 週日起始，短標 */
export const WEEKDAY_SHORT = {
  zh: ["日", "一", "二", "三", "四", "五", "六"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  id: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"],
  vi: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
  tl: ["Lin", "Lun", "Mar", "Miy", "Huw", "Biy", "Sab"],
  th: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"]
}

export function localeForLang(lang) {
  return LOCALE_BY_LANG[lang] || LOCALE_BY_LANG.zh
}

export function weekdayShortLabels(lang) {
  return WEEKDAY_SHORT[lang] || WEEKDAY_SHORT.zh
}

export function formatMonthYearTitle(year, monthIndex0, lang) {
  const d = new Date(year, monthIndex0, 1)
  try {
    return new Intl.DateTimeFormat(localeForLang(lang), {
      year: "numeric",
      month: "long"
    }).format(d)
  } catch {
    return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`
  }
}

export function formatDateKeyMonthLabel(dateKey, lang) {
  const d = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateKey
  return formatMonthYearTitle(d.getFullYear(), d.getMonth(), lang)
}

export function formatLocalDateLabel(isoOrDate, lang = "zh", base = new Date()) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate)
  if (Number.isNaN(d.getTime())) return "--"
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  // today/yesterday use caller catalogs if needed — keep numeric+weekday here
  const yest = new Date(base)
  yest.setDate(yest.getDate() - 1)
  const week = weekdayShortLabels(lang)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  if (sameDay(d, base)) return `${mm}/${dd} (${week[d.getDay()]})`
  if (sameDay(d, yest)) return `${mm}/${dd} (${week[d.getDay()]})`
  return `${mm}/${dd} (${week[d.getDay()]})`
}

export function formatHourUnit(lang) {
  if (lang === "zh") return "時"
  if (lang === "th") return "น."
  return ""
}

export function formatMinuteUnit(lang) {
  if (lang === "zh") return "分"
  return ""
}

function pad2(n) {
  return String(n).padStart(2, "0")
}

export function formatDateTime(value, lang = "zh") {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return "--"
  try {
    return new Intl.DateTimeFormat(localeForLang(lang), {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(d)
  } catch {
    return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }
}

export function formatTimeShort(value, lang = "zh") {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  try {
    return new Intl.DateTimeFormat(localeForLang(lang), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(d)
  } catch {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }
}

function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** LINE 氣泡日期分隔：今天／昨天／年月日 */
export function formatChatDayDivider(value, lang = "zh", base = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const today = ymd(base)
  const yest = new Date(base)
  yest.setDate(yest.getDate() - 1)
  const key = ymd(d)
  if (key === today) {
    if (lang === "zh") return "今天"
    if (lang === "th") return "วันนี้"
    if (lang === "vi") return "Hôm nay"
    if (lang === "id") return "Hari ini"
    if (lang === "tl") return "Ngayon"
    return "Today"
  }
  if (key === ymd(yest)) {
    if (lang === "zh") return "昨天"
    if (lang === "th") return "เมื่อวาน"
    if (lang === "vi") return "Hôm qua"
    if (lang === "id") return "Kemarin"
    if (lang === "tl") return "Kahapon"
    return "Yesterday"
  }
  try {
    return new Intl.DateTimeFormat(localeForLang(lang), {
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(d)
  } catch {
    return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`
  }
}
