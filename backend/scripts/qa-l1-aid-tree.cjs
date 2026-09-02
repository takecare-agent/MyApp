#!/usr/bin/env node
/**
 * R98 L1 急救樹驗收：六語齊、字體不錯語系、樹節點 next 都存在、用到的 key 都有。
 * 用法：node backend/scripts/qa-l1-aid-tree.cjs
 */
const fs = require("fs")
const path = require("path")

const ROOT = path.join(__dirname, "../..")
const CAT = fs.readFileSync(path.join(ROOT, "mobile-expo/src/i18n/firstAidCatalog.js"), "utf8")
const TREE = fs.readFileSync(path.join(ROOT, "mobile-expo/src/lib/firstAidTree.js"), "utf8")
const LANGS = ["zh", "en", "id", "vi", "tl", "th"]

function block(lang) {
  const m = CAT.match(new RegExp(`\\n  ${lang}: \\{([\\s\\S]*?)\\n  \\}`))
  return m ? m[1] : ""
}

function keysOf(src) {
  const keys = []
  const re = /"([^"]+)":\s*"/g
  let m
  while ((m = re.exec(src))) keys.push(m[1])
  return keys
}

function val(src, key) {
  const m = src.match(new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*"([^"]*)"`))
  return m ? m[1] : null
}

function scriptOk(lang, text) {
  const s = String(text || "")
  if (!s.trim()) return "empty"
  const hasHan = /[\u4e00-\u9fff]/.test(s)
  const hasThai = /[\u0e00-\u0e7f]/.test(s)
  const hasVi = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/.test(s)
  if (lang === "zh") return hasHan ? "ok" : "need-han"
  if (lang === "th") return hasThai && !hasHan ? "ok" : "need-thai"
  if (lang === "vi") return !hasHan && !hasThai && hasVi ? "ok" : "need-vi-diacritics"
  return !hasHan && !hasThai ? "ok" : "wrong-script"
}

const blocks = Object.fromEntries(LANGS.map((l) => [l, block(l)]))
const zhKeys = keysOf(blocks.zh)
const fails = []

if (zhKeys.length < 20) fails.push("zh catalog too small")

for (const lang of LANGS) {
  const keys = keysOf(blocks[lang])
  const missing = zhKeys.filter((k) => !keys.includes(k))
  const extra = keys.filter((k) => !zhKeys.includes(k))
  if (missing.length) fails.push(`${lang} missing ${missing.join(",")}`)
  if (extra.length) fails.push(`${lang} extra ${extra.join(",")}`)
  for (const key of keys) {
    const ok = scriptOk(lang, val(blocks[lang], key))
    if (ok !== "ok") fails.push(`${lang} ${key} ${ok}`)
  }
}

const nodeIds = [...TREE.matchAll(/^\s{2}([a-z0-9_]+): \{/gm)].map((m) => m[1])
const nextIds = [...TREE.matchAll(/next: "([^"]+)"/g)].map((m) => m[1])
for (const id of nextIds) {
  if (!nodeIds.includes(id)) fails.push(`tree next missing ${id}`)
}

const usedKeys = [...TREE.matchAll(/Key: "([^"]+)"/g)].map((m) => m[1])
const bodyKeys = [...TREE.matchAll(/"aid\.[^"]+"/g)].map((m) => m[0].slice(1, -1))
for (const key of [...new Set([...usedKeys, ...bodyKeys])]) {
  if (!key.startsWith("aid.")) continue
  if (!zhKeys.includes(key)) fails.push(`tree key missing in catalog ${key}`)
}

if (fails.length) {
  console.error("AID_TREE_FAIL")
  for (const f of fails) console.error(" -", f)
  process.exit(1)
}

console.log(`AID_TREE_OK keys=${zhKeys.length} nodes=${nodeIds.length}`)
