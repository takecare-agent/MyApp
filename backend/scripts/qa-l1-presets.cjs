#!/usr/bin/env node
/**
 * L1 快捷精翻驗收（禁止 Google 翻譯來回對）
 *
 * 查的是：六語齊、前後端用字一致、字體沒錯語系、用藥詞對得上詞彙表。
 * 準不準最終仍要母語者看「這句當地人會不會這樣說」。
 *
 * 用法：node scripts/qa-l1-presets.cjs
 */
const fs = require("fs")
const path = require("path")

const ROOT = path.join(__dirname, "../..")
const PATCH = fs.readFileSync(path.join(ROOT, "mobile-expo/src/i18n/catalogPatch.js"), "utf8")
const BACKEND = fs.readFileSync(path.join(__dirname, "../index.js"), "utf8")

const LANGS = ["zh", "en", "id", "vi", "tl", "th"]
const KEYS = [
  "howAreYou", "ateQ", "medQ", "comingLater",
  "allGood", "ateDone", "medDone", "slow",
  "imOk", "comeHere", "unwell", "thanks"
]

const INTENT = {
  howAreYou: "家屬問候：對方今天身體／狀況好不好",
  ateQ: "家屬問：有沒有吃飯",
  medQ: "家屬問：藥有沒有吃",
  comingLater: "家屬說：稍後會到長輩那邊",
  allGood: "看護回報家屬：目前狀況沒問題",
  ateDone: "看護回報：飯已經吃了",
  medDone: "看護回報：藥已經吃了",
  slow: "看護安撫長輩：慢慢來、不用急",
  imOk: "長輩報平安：我沒怎樣（含跌倒後）",
  comeHere: "長輩叫人：請到我這裡來一下",
  unwell: "長輩說身體不舒服",
  thanks: "長輩道謝"
}

const GLOSSARY_LOCK = {
  medQ: { en: /medicine/i, id: /obat/i, vi: /thuốc/i, tl: /gamot/i, th: /ยา/ },
  medDone: { en: /medicine/i, id: /obat/i, vi: /thuốc/i, tl: /gamot/i, th: /ยา/ }
}

function patchBlocks() {
  const blocks = {}
  for (const lang of LANGS) {
    const m = PATCH.match(new RegExp(`\\n  ${lang}: \\{([\\s\\S]*?)\\n  \\},`))
    blocks[lang] = m ? m[1] : ""
  }
  return blocks
}

function frontVal(blocks, lang, key) {
  const m = blocks[lang].match(new RegExp(`"chat\\.preset\\.${key}":\\s*"([^"]*)"`))
  return m ? m[1] : null
}

function backVal(key, lang) {
  const m = BACKEND.match(new RegExp(`\\n  ${key}: \\{[\\s\\S]*?${lang}: "([^"]*)"`))
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

const blocks = patchBlocks()
const fails = []
const rows = []

for (const key of KEYS) {
  for (const lang of LANGS) {
    const front = frontVal(blocks, lang, key)
    const back = backVal(key, lang)
    if (!front) fails.push(`missing catalog ${lang} ${key}`)
    if (!back) fails.push(`missing backend ${lang} ${key}`)
    if (front && back && front !== back) fails.push(`mismatch ${key}.${lang}: ${JSON.stringify(front)} vs ${JSON.stringify(back)}`)
    const script = scriptOk(lang, front)
    if (front && script !== "ok") fails.push(`script ${key}.${lang} ${script}: ${front}`)
    const lock = GLOSSARY_LOCK[key]
    if (lock && lock[lang] && front && !lock[lang].test(front)) {
      fails.push(`glossary ${key}.${lang} missing care term: ${front}`)
    }
    if (lang !== "zh") rows.push({ key, lang, zh: frontVal(blocks, "zh", key), text: front })
  }
}

console.log("=== L1 preset QA (no Google Translate) ===")
console.log(fails.length ? `FAIL ${fails.length}\n` + fails.join("\n") : "MECHANICAL_OK")
console.log("\n=== 母語審稿卡（給會該語言的人看，只要答會不會這樣說） ===")
for (const key of KEYS) {
  console.log(`\n[${key}] 意圖：${INTENT[key]}`)
  console.log(`  zh  ${frontVal(blocks, "zh", key)}`)
  for (const lang of LANGS.filter((l) => l !== "zh")) {
    console.log(`  ${lang}  ${frontVal(blocks, lang, key)}`)
  }
}

process.exit(fails.length ? 1 : 0)
