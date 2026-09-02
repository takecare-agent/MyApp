/**
 * 日期／星期／時間顯示跟 uiLang（R82）
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
