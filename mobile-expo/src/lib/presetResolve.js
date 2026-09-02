/**
 * 系統預設句：任何語的顯示字／舊繁中 → 穩定 i18n key
 * 讀取方用 t(key) 精翻，不走機翻；預設句不提供「查看原文」
 */
import { catalogs } from "../i18n/catalogs"
import { catalogPatch } from "../i18n/catalogPatch"
import { ALL_CHAT_PRESET_SHORT } from "./chatPresets"
import { CARE_DAILY_PRESET_DEFS, REMINDER_PRESET_DEFS } from "./contentLabels"

let reverseMap = null

function remember(map, label, key) {
  const s = String(label || "").trim()
  if (!s || !key) return
  map.set(s, key)
}

function buildReverseMap() {
  const map = new Map()
  const langs = Object.keys(catalogs || {})
  for (const lang of langs) {
    const table = { ...(catalogs[lang] || {}), ...(catalogPatch[lang] || {}) }
    for (const [key, val] of Object.entries(table)) {
      if (
        key.startsWith("preset.reminder.") ||
        key.startsWith("preset.daily.") ||
        key.startsWith("chat.preset.")
      ) {
        remember(map, val, key)
      }
    }
  }
  for (const [cat, list] of Object.entries(REMINDER_PRESET_DEFS)) {
    for (const item of list) {
      remember(map, item.zh, `preset.reminder.${cat}.${item.code}`)
    }
  }
  for (const [cat, list] of Object.entries(CARE_DAILY_PRESET_DEFS)) {
    for (const item of list) {
      remember(map, item.zh, `preset.daily.${cat}.${item.code}`)
    }
  }
  return map
}

function getReverseMap() {
  if (!reverseMap) reverseMap = buildReverseMap()
  return reverseMap
}

export function isCarePresetKey(key) {
  const k = String(key || "")
  return (
    k.startsWith("preset.reminder.") ||
    k.startsWith("preset.daily.") ||
    k.startsWith("chat.preset.")
  )
}

/**
 * @param {{ text?: string, contentKey?: string }} input
 * @returns {string|null} i18n key
 */
export function resolveCarePresetKey({ text, contentKey } = {}) {
  const ck = String(contentKey || "").trim()
  if (isCarePresetKey(ck)) return ck
  if (ALL_CHAT_PRESET_SHORT.has(ck)) return `chat.preset.${ck}`
  const s = String(text || "").trim()
  if (!s) return null
  return getReverseMap().get(s) || null
}
