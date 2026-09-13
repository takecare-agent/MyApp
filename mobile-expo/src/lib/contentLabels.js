/**
 * 系統預設類別／常用句 — 穩定 code＋字典顯示
 * DB 可存 code 或舊繁中字串；顯示一律走 code→t()
 */

export const REMINDER_CAT_DEFS = [
  { code: "med", zh: "用藥提醒" },
  { code: "medical_appt", zh: "醫療行程" },
  { code: "vitals", zh: "生理量測" },
  { code: "daily_care", zh: "生活照護" },
  { code: "other", zh: "其他" }
]

export const CARE_DAILY_CAT_DEFS = [
  { code: "meal", zh: "飲食" },
  { code: "med", zh: "用藥" },
  { code: "vitals", zh: "生理量測" },
  { code: "hygiene", zh: "清潔" },
  { code: "activity", zh: "活動" },
  { code: "sleep", zh: "睡眠" },
  { code: "mood", zh: "心情" },
  { code: "diary", zh: "日記" },
  { code: "other", zh: "其他" }
]

/** 內建常用：code → 舊繁中（寫入相容／比對） */
export const REMINDER_PRESET_DEFS = {
  med: [
    { code: "after_bp", zh: "飯後服用血壓藥" },
    { code: "sleep_aid", zh: "睡前服用安眠藥" },
    { code: "meals", zh: "三餐飯後服藥" },
    { code: "insulin", zh: "施打胰島素" }
  ],
  medical_appt: [
    { code: "hospital", zh: "醫院回診" },
    { code: "clinic", zh: "診所拿藥" },
    { code: "rehab", zh: "物理治療/復健" },
    { code: "vaccine", zh: "施打疫苗" }
  ],
  vitals: [
    { code: "bp", zh: "測量血壓" },
    { code: "glucose", zh: "測量空腹血糖" },
    { code: "temp", zh: "測量體溫" },
    { code: "weight", zh: "測量體重" }
  ],
  daily_care: [
    { code: "bath", zh: "協助洗澡" },
    { code: "diaper", zh: "更換尿布" },
    { code: "nails", zh: "剪指甲" },
    { code: "reposition", zh: "翻身拍背" }
  ],
  other: [{ code: "manual", zh: "請手動輸入" }]
}

export const CARE_DAILY_PRESET_DEFS = {
  meal: [
    { code: "breakfast", zh: "早餐已用" },
    { code: "lunch", zh: "午餐已用" },
    { code: "dinner", zh: "晚餐已用" },
    { code: "snack", zh: "點心/水果" }
  ],
  med: [
    { code: "after_meal", zh: "飯後藥已吃" },
    { code: "bedtime", zh: "睡前藥已吃" },
    { code: "insulin", zh: "胰島素已打" },
    { code: "topical", zh: "外用藥已擦" }
  ],
  vitals: [
    { code: "bp", zh: "血壓量測" },
    { code: "temp", zh: "體溫量測" },
    { code: "glucose", zh: "血糖量測" },
    { code: "weight", zh: "體重記錄" }
  ],
  hygiene: [
    { code: "bath", zh: "已洗澡" },
    { code: "clothes", zh: "更換衣物" },
    { code: "oral", zh: "口腔清潔" },
    { code: "reposition", zh: "翻身拍背" }
  ],
  activity: [
    { code: "walk", zh: "散步" },
    { code: "rehab", zh: "復健運動" },
    { code: "out_of_bed", zh: "下床活動" }
  ],
  sleep: [
    { code: "ok", zh: "正常入睡" },
    { code: "good", zh: "睡眠品質佳" },
    { code: "restless", zh: "輾轉難眠" },
    { code: "early", zh: "早醒" }
  ],
  mood: [
    { code: "good", zh: "心情不錯" },
    { code: "ok", zh: "還可以" },
    { code: "tired", zh: "有點累" },
    { code: "down", zh: "不太開心" },
    { code: "anxious", zh: "有點緊張" }
  ],
  diary: [
    { code: "today", zh: "今天過得如何" },
    { code: "thanks", zh: "想謝謝看護" },
    { code: "note", zh: "想記一件事" }
  ],
  other: []
}

function findByCodeOrZh(defs, raw) {
  const s = String(raw || "").trim()
  if (!s) return null
  return defs.find((d) => d.code === s || d.zh === s) || null
}

export function toReminderCatCode(raw) {
  return findByCodeOrZh(REMINDER_CAT_DEFS, raw)?.code || "other"
}

export function toCareDailyCatCode(raw) {
  return findByCodeOrZh(CARE_DAILY_CAT_DEFS, raw)?.code || String(raw || "").trim() || "other"
}

/** 寫入 DB：優先存 code（新資料）；舊中文仍可讀 */
export function reminderCatForStorage(raw) {
  return toReminderCatCode(raw)
}

export function careDailyCatForStorage(raw) {
  return toCareDailyCatCode(raw)
}

export function reminderCatLabel(raw, t) {
  const code = toReminderCatCode(raw)
  const key = `cat.reminder.${code}`
  const label = t(key)
  return label === key ? String(raw || "") : label
}

export function careDailyCatLabel(raw, t) {
  const found = findByCodeOrZh(CARE_DAILY_CAT_DEFS, raw)
  if (!found) return String(raw || "")
  const key = `cat.daily.${found.code}`
  const label = t(key)
  return label === key ? found.zh : label
}

export function reminderPresetLabel(catRaw, presetCodeOrZh, t) {
  const cat = toReminderCatCode(catRaw)
  const defs = REMINDER_PRESET_DEFS[cat] || []
  const hit = findByCodeOrZh(defs, presetCodeOrZh)
  if (!hit) return String(presetCodeOrZh || "")
  const key = `preset.reminder.${cat}.${hit.code}`
  const label = t(key)
  return label === key ? hit.zh : label
}

export function careDailyPresetLabel(catRaw, presetCodeOrZh, t) {
  const cat = toCareDailyCatCode(catRaw)
  const defs = CARE_DAILY_PRESET_DEFS[cat] || []
  const hit = findByCodeOrZh(defs, presetCodeOrZh)
  if (!hit) return String(presetCodeOrZh || "")
  const key = `preset.daily.${cat}.${hit.code}`
  const label = t(key)
  return label === key ? hit.zh : label
}

/** 下拉：options 顯示母語，value 存 code */
export function reminderCategoryOptions(t) {
  return REMINDER_CAT_DEFS.map((d) => ({
    value: d.code,
    label: reminderCatLabel(d.code, t)
  }))
}

export function careDailyCategoryOptions(t) {
  return CARE_DAILY_CAT_DEFS.map((d) => ({
    value: d.code,
    label: careDailyCatLabel(d.code, t)
  }))
}

export function reminderContentPresetOptions(catRaw, t) {
  const cat = toReminderCatCode(catRaw)
  return (REMINDER_PRESET_DEFS[cat] || []).map((p) => ({
    value: reminderPresetLabel(cat, p.code, t),
    label: reminderPresetLabel(cat, p.code, t),
    code: p.code
  }))
}

export function careDailyContentPresetOptions(catRaw, t) {
  const cat = toCareDailyCatCode(catRaw)
  return (CARE_DAILY_PRESET_DEFS[cat] || []).map((p) => ({
    value: careDailyPresetLabel(cat, p.code, t),
    label: careDailyPresetLabel(cat, p.code, t),
    code: p.code
  }))
}

/** 篩選比對：code 與舊中文視為同一類 */
export function categoryMatches(stored, selectedCodeOrAll) {
  if (!selectedCodeOrAll || selectedCodeOrAll === "all") return true
  const a = toReminderCatCode(stored)
  const b = toReminderCatCode(selectedCodeOrAll)
  if (a === b) return true
  return String(stored) === String(selectedCodeOrAll)
}
