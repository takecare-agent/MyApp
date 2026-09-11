/**
 * 系統預設待辦：任一語的顯示字 → 穩定 key。
 * 讀 catalogs.js，避免後端再抄一份英文句子。
 */
const fs = require("fs")
const path = require("path")

let textToKey = null

function loadMap() {
  if (textToKey) return textToKey
  textToKey = new Map()
  const catalogsPath = path.join(__dirname, "../../mobile-expo/src/i18n/catalogs.js")
  const src = fs.readFileSync(catalogsPath, "utf8")
  const re = /"(preset\.(?:reminder|daily)\.[^"]+)":\s*"((?:\\.|[^"\\])*)"/g
  let m
  while ((m = re.exec(src))) {
    const key = m[1]
    const label = m[2].replace(/\\"/g, '"').trim()
    if (label) textToKey.set(label, key)
  }
  return textToKey
}

function isCarePresetKey(key) {
  const k = String(key || "")
  return k.startsWith("preset.reminder.") || k.startsWith("preset.daily.")
}

function resolveCarePresetKey(text, contentKey) {
  const ck = String(contentKey || "").trim()
  if (isCarePresetKey(ck)) return ck
  const s = String(text || "").trim()
  if (!s) return ""
  return loadMap().get(s) || ""
}

module.exports = { resolveCarePresetKey, isCarePresetKey }
