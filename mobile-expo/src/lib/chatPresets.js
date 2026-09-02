/**
 * 聊天快捷：三角色各 4 句（L1 字典精翻）
 * 情境：家屬遠端問安／盯吃飯吃藥／說會去；看護回報平安＋對長輩安撫；
 * 長輩報平安（含跌倒後）、叫人過來、說不舒服、道謝。
 * 2026-08-21 無口語者：Agent 口語審稿＋qa-l1-presets.cjs 為暫定通過（非母語簽核）。
 */
export const CHAT_PRESET_KEYS_BY_ROLE = {
  family: ["howAreYou", "ateQ", "medQ", "comingLater"],
  caregiver: ["allGood", "ateDone", "medDone", "slow"],
  patient: ["imOk", "comeHere", "unwell", "thanks"]
}

export const LEGACY_CHAT_PRESET_KEYS = [
  "ok",
  "help",
  "med",
  "slow",
  "here",
  "pain",
  "breathe",
  "relax"
]

export const ALL_CHAT_PRESET_SHORT = new Set([
  ...LEGACY_CHAT_PRESET_KEYS,
  "drink",
  "eat",
  "bp",
  "bpDone",
  "medDone",
  "rest",
  "water",
  "hungry",
  "unwell",
  "assist",
  "howAreYou",
  "ateQ",
  "medQ",
  "comingLater",
  "allGood",
  "ateDone",
  "imOk",
  "comeHere",
  "thanks"
])

export function chatPresetKeysForRole(role) {
  return CHAT_PRESET_KEYS_BY_ROLE[role] || CHAT_PRESET_KEYS_BY_ROLE.patient
}
