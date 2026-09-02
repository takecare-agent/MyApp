/**
 * 健康資訊卡選項（ICE／急救一眼能懂）。
 * 國健署健檢／ICOPE＋Toronto ICE＋Medical ID 高風險項；用語維持一般人會寫的。
 */

const ZH = "zh"
const EN = "en"
const ID = "id"
const VI = "vi"
const TL = "tl"
const TH = "th"

function L(zh, en, id, vi, tl, th) {
  return { [ZH]: zh, [EN]: en, [ID]: id, [VI]: vi, [TL]: tl, [TH]: th }
}

export const NONE_LABELS = L("無", "None", "Tidak ada", "Không", "Wala", "ไม่มี")

export const BLOOD_TYPES = [
  { id: "A", labels: L("A 型", "A", "A", "A", "A", "A") },
  { id: "B", labels: L("B 型", "B", "B", "B", "B", "B") },
  { id: "AB", labels: L("AB 型", "AB", "AB", "AB", "AB", "AB") },
  { id: "O", labels: L("O 型", "O", "O", "O", "O", "O") },
  { id: "unknown", labels: L("不明", "Unknown", "Tidak diketahui", "Không rõ", "Hindi alam", "ไม่ทราบ") }
]

export function normalizeBloodType(raw) {
  const s = String(raw || "").trim()
  if (!s) return ""
  if (s.startsWith("AB")) return "AB"
  if (s.startsWith("A")) return "A"
  if (s.startsWith("B")) return "B"
  if (s.startsWith("O")) return "O"
  if (s === "unknown") return "unknown"
  return ""
}

export function isNoneKey(id) {
  const s = String(id || "")
  return s === "none" || s.startsWith("none")
}

export const ALLERGIES = [
  { id: "penicillin", labels: L("青黴素", "Penicillin", "Penisilin", "Penicillin", "Penicillin", "เพนิซิลลิน") },
  { id: "aspirin", labels: L("阿斯匹靈", "Aspirin", "Aspirin", "Aspirin", "Aspirin", "แอสไพริน") },
  { id: "sulfa", labels: L("磺胺", "Sulfa", "Sulfa", "Sulfa", "Sulfa", "ซัลฟา") },
  { id: "seafood", labels: L("海鮮", "Seafood", "Makanan laut", "Hải sản", "Pagkaing-dagat", "อาหารทะเล") },
  { id: "peanut", labels: L("堅果", "Nuts", "Kacang", "Hạt", "Mani", "ถั่ว") }
]

export const CONDITION_GROUPS = [
  {
    id: "cardio",
    noneId: "noneCardio",
    items: [
      { id: "hypertension", labels: L("高血壓", "Hypertension", "Hipertensi", "Tăng huyết áp", "Altapresyon", "ความดันสูง") },
      { id: "diabetes", labels: L("糖尿病", "Diabetes", "Diabetes", "Đái tháo đường", "Diabetes", "เบาหวาน") },
      { id: "hyperlipidemia", labels: L("高血脂", "High cholesterol", "Kolesterol tinggi", "Mỡ máu cao", "Mataas na kolesterol", "ไขมันในเลือดสูง") },
      { id: "heartDisease", labels: L("心臟病", "Heart disease", "Penyakit jantung", "Bệnh tim", "Sakit sa puso", "โรคหัวใจ") },
      { id: "stroke", labels: L("腦中風", "Stroke", "Stroke", "Đột quỵ", "Stroke", "โรคหลอดเลือดสมอง") },
      { id: "pacemaker", labels: L("心律調節器", "Pacemaker", "Alat pacu jantung", "Máy tạo nhịp", "Pacemaker", "เครื่องกระตุ้นหัวใจ") }
    ]
  },
  {
    id: "resp",
    noneId: "noneResp",
    items: [
      { id: "copd", labels: L("肺病 COPD", "COPD", "PPOK", "COPD", "COPD", "COPD") },
      { id: "asthma", labels: L("氣喘", "Asthma", "Asma", "Hen", "Hika", "หืด") }
    ]
  },
  {
    id: "neuro",
    noneId: "noneNeuro",
    items: [
      { id: "dementia", labels: L("失智", "Dementia", "Demensia", "Sa sút trí tuệ", "Dementia", "สมองเสื่อม") },
      { id: "parkinson", labels: L("帕金森", "Parkinson's", "Parkinson", "Parkinson", "Parkinson", "พาร์กินสัน") },
      { id: "seizure", labels: L("癲癇", "Epilepsy", "Epilepsi", "Động kinh", "Epilepsya", "ลมชัก") }
    ]
  },
  {
    id: "organ",
    noneId: "noneOrgan",
    items: [
      { id: "kidney", labels: L("腎臟病", "Kidney disease", "Penyakit ginjal", "Bệnh thận", "Sakit sa bato", "โรคไต") },
      { id: "dialysis", labels: L("洗腎", "Dialysis", "Dialisis", "Lọc máu", "Dialysis", "ฟอกไต") },
      { id: "liver", labels: L("肝病", "Liver disease", "Penyakit hati", "Bệnh gan", "Sakit sa atay", "โรคตับ") },
      { id: "hepatitisB", labels: L("B 型肝炎", "Hepatitis B", "Hepatitis B", "Viêm gan B", "Hepatitis B", "ไวรัสตับอักเสบ B") },
      { id: "hepatitisC", labels: L("C 型肝炎", "Hepatitis C", "Hepatitis C", "Viêm gan C", "Hepatitis C", "ไวรัสตับอักเสบ C") }
    ]
  },
  {
    id: "other",
    noneId: "noneOther",
    items: [
      { id: "cancer", labels: L("癌症", "Cancer", "Kanker", "Ung thư", "Kanser", "มะเร็ง") },
      { id: "psychiatric", labels: L("精神疾病", "Psychiatric", "Gangguan jiwa", "Bệnh tâm thần", "Sakit sa isip", "โรคจิตเวช") },
      { id: "thyroid", labels: L("甲狀腺", "Thyroid", "Tiroid", "Tuyến giáp", "Thyroid", "ไทรอยด์") },
      { id: "gout", labels: L("痛風", "Gout", "Asam urat", "Gút", "Gout", "เกาต์") },
      { id: "osteoporosis", labels: L("骨質疏鬆", "Osteoporosis", "Osteoporosis", "Loãng xương", "Osteoporosis", "กระดูกพรุน") }
    ]
  }
]

export const CONDITIONS = CONDITION_GROUPS.flatMap((g) => g.items)
export const CONDITION_NONE_IDS = CONDITION_GROUPS.map((g) => g.noneId)

export const MEDICATIONS = [
  { id: "anticoagulant", labels: L("抗凝血劑", "Blood thinner", "Pengencer darah", "Thuốc chống đông", "Blood thinner", "ยาละลายลิ่มเลือด") },
  { id: "antiplatelet", labels: L("抗血小板", "Antiplatelet", "Antiplatelet", "Chống kết tập tiểu cầu", "Antiplatelet", "ยาต้านเกล็ดเลือด") },
  { id: "insulin", labels: L("胰島素", "Insulin", "Insulin", "Insulin", "Insulin", "อินซูลิน") },
  { id: "inhaler", labels: L("吸入劑", "Inhaler", "Inhaler", "Ống hít", "Inhaler", "ยาพ่น") },
  { id: "antiseizure", labels: L("抗癲癇藥", "Anti-seizure", "Obat kejang", "Thuốc chống động kinh", "Anti-seizure", "ยากันชัก") }
]

export const DEVICES = [
  { id: "oxygen", labels: L("氧氣", "Oxygen", "Oksigen", "Oxy", "Oxygen", "ออกซิเจน") },
  { id: "hearingAid", labels: L("助聽器", "Hearing aid", "Alat bantu dengar", "Máy trợ thính", "Hearing aid", "เครื่องช่วยฟัง") },
  { id: "glasses", labels: L("眼鏡", "Glasses", "Kacamata", "Kính", "Salamin", "แว่นตา") },
  { id: "cane", labels: L("拐杖", "Cane", "Tongkat", "Gậy", "Tungkod", "ไม้เท้า") },
  { id: "walker", labels: L("助行器", "Walker", "Walker", "Khung tập đi", "Walker", "Walker") },
  { id: "wheelchair", labels: L("輪椅", "Wheelchair", "Kursi roda", "Xe lăn", "Wheelchair", "รถเข็น") },
  { id: "dentures", labels: L("假牙", "Dentures", "Gigi palsu", "Răng giả", "Pustiso", "ฟันปลอม") }
]

export const DIRECTIVES = [
  { id: "dnr", labels: L("不施行 CPR", "No CPR", "Tidak CPR", "Không CPR", "Walang CPR", "ไม่ทำ CPR") },
  { id: "noTransfusion", labels: L("不輸血", "No transfusion", "Tolak transfusi", "Không truyền máu", "Ayaw ng transfusion", "ไม่รับเลือด") },
  { id: "organDonor", labels: L("器官捐贈", "Organ donor", "Donor organ", "Hiến tạng", "Organ donor", "บริจาคอวัยวะ") }
]

const CONDITION_NONE = new Set(CONDITION_NONE_IDS)

export function optionLabel(item, lang) {
  if (!item) return ""
  const labels = item.labels || {}
  return labels[lang] || labels.en || labels.zh || item.id
}

export function noneLabel(lang) {
  return NONE_LABELS[lang] || NONE_LABELS.en || NONE_LABELS.zh
}

export function findOption(list, id) {
  return list.find((x) => x.id === id)
}

function allLabelsOf(item) {
  return Object.values(item.labels || {}).map((s) => String(s).toLowerCase())
}

export function parseLegacyText(raw, list) {
  const text = String(raw || "").trim()
  if (!text) return { keys: [], other: "" }
  const parts = text.split(/[,，、;；/\n]+/).map((s) => s.trim()).filter(Boolean)
  const keys = []
  const leftover = []
  parts.forEach((part) => {
    const lower = part.toLowerCase()
    const hit = list.find((item) => item.id === part || allLabelsOf(item).includes(lower))
    if (hit && !keys.includes(hit.id)) keys.push(hit.id)
    else leftover.push(part)
  })
  return { keys, other: leftover.join("、") }
}

/** 點「無」：清掉該區並收合；再點一次「無」＝誤點還原，選項再出現。 */
export function toggleGroup(list, id, groupIds, noneId) {
  const ids = groupIds || []
  if (id === noneId) {
    if (list.includes(noneId)) return list.filter((x) => x !== noneId)
    return [...list.filter((x) => !ids.includes(x) && x !== noneId), noneId]
  }
  const withoutNone = list.filter((x) => x !== noneId)
  if (withoutNone.includes(id)) return withoutNone.filter((x) => x !== id)
  return [...withoutNone, id]
}

export function joinLabels(ids, list, lang, other) {
  const keys = ids || []
  const names = keys
    .filter((id) => !isNoneKey(id))
    .map((id) => optionLabel(findOption(list, id), lang))
    .filter(Boolean)
  const extra = String(other || "").trim()
  if (extra) names.push(extra)
  if (names.length) return names.join("、")
  if (keys.some(isNoneKey)) return noneLabel(lang)
  return ""
}

export const EMPTY_CARD = {
  bloodType: "",
  allergyKeys: [],
  allergyOther: "",
  conditionKeys: [],
  conditionOther: "",
  medicationKeys: [],
  medications: "",
  deviceKeys: [],
  directiveKeys: [],
  preferredLanguage: "",
  notes: ""
}

function migrateConditionKeys(keys) {
  const next = []
  ;(keys || []).forEach((id) => {
    if (id === "none") {
      CONDITION_NONE_IDS.forEach((n) => {
        if (!next.includes(n)) next.push(n)
      })
      return
    }
    if (id === "alzheimer") {
      if (!next.includes("dementia")) next.push("dementia")
      return
    }
    if (id === "heartFailure" || id === "afib" || id === "stent") {
      if (!next.includes("heartDisease")) next.push("heartDisease")
      return
    }
    if (!next.includes(id)) next.push(id)
  })
  return next.filter((id) => (
    CONDITIONS.some((x) => x.id === id) || CONDITION_NONE.has(id)
  ))
}

export function cardFromApi(card) {
  const src = card || {}
  const allergyLegacy = src.allergyKeys?.length
    ? { keys: src.allergyKeys, other: src.allergyOther || "" }
    : parseLegacyText(src.allergies, ALLERGIES)
  const conditionLegacy = src.conditionKeys?.length
    ? { keys: src.conditionKeys, other: src.conditionOther || "" }
    : parseLegacyText(src.conditions, CONDITIONS)
  return {
    bloodType: normalizeBloodType(src.bloodType),
    allergyKeys: (allergyLegacy.keys || []).filter((id) => id === "none" || ALLERGIES.some((x) => x.id === id)),
    allergyOther: allergyLegacy.other || String(src.allergyOther || ""),
    conditionKeys: migrateConditionKeys(conditionLegacy.keys),
    conditionOther: conditionLegacy.other || String(src.conditionOther || ""),
    medicationKeys: Array.isArray(src.medicationKeys) ? src.medicationKeys : [],
    medications: String(src.medications || ""),
    deviceKeys: Array.isArray(src.deviceKeys) ? src.deviceKeys : [],
    directiveKeys: Array.isArray(src.directiveKeys) ? src.directiveKeys : [],
    preferredLanguage: String(src.preferredLanguage || ""),
    notes: String(src.notes || "")
  }
}

export function cardHasContent(card) {
  const c = cardFromApi(card)
  return Boolean(
    c.bloodType
    || c.allergyKeys.length
    || c.allergyOther
    || c.conditionKeys.length
    || c.conditionOther
    || c.medicationKeys.length
    || c.medications
    || c.deviceKeys.length
    || c.directiveKeys.length
    || c.preferredLanguage
    || c.notes
  )
}
