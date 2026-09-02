/** 說出現況 → 對到既有葉。不是現場 AI 醫囑。胸痛要先於中風關鍵詞。 */
const ROUTES = [
  { next: "leaf_cpr", keys: ["cpr", "心肺", "沒呼吸", "无呼吸", "無反應", "无反应", "ngừng thở", "không thở", "không phản", "unconscious", "no breath", "cardiac"] },
  { next: "q2a", keys: ["噎", "哽", "嗆", "hóc", "choke", "heimlich", "tersedak", "nabulunan", "สำลัก"] },
  { next: "leaf_chest", keys: ["胸痛", "胸悶", "心悸", "冷汗", "đau ngực", "tức ngực", "chest pain", "heart attack"] },
  { next: "leaf_fast", keys: ["中風", "中风", "臉歪", "手垂", "大舌頭", "méo mặt", "stroke", "fast"] },
  { next: "leaf_foam", keys: ["白沫", "口吐", "泡沫", "bọt", "foam", "busa", "bula", "ฟอง"] },
  { next: "leaf_seizure", keys: ["抽搐", "癲癇", "癫痫", "co giật", "seizure", "kejang", "ชัก"] },
  { next: "leaf_sugar", keys: ["血糖", "低血糖", "冒冷汗", "發抖", "hạ đường", "hypogly", "gula"] },
  { next: "leaf_bleed", keys: ["出血", "噴血", "máu", "bleed", "bleeding"] },
  { next: "leaf_burn", keys: ["燒", "燙", "bỏng", "burn", "scald", "ไฟไหม้"] },
  { next: "leaf_heat", keys: ["中暑", "熱傷害", "say nắng", "heatstroke", "heat"] },
  { next: "leaf_poison", keys: ["中毒", "誤食", "ngộ độc", "poison"] },
  { next: "leaf_allergy", keys: ["過敏", "dị ứng", "allerg"] },
  { next: "leaf_drown", keys: ["溺", "đuối", "drown"] },
  { next: "leaf_fall", keys: ["跌倒", "摔倒", "骨折", "ngã", "fall", "patah", "หัก"] }
]

export const AID_ROUTE_TO_NODE = {
  cpr: "leaf_cpr",
  choke: "q2a",
  fast: "leaf_fast",
  chest: "leaf_chest",
  seizure: "leaf_seizure",
  foam: "leaf_foam",
  sugar: "leaf_sugar",
  bleed: "leaf_bleed",
  burn: "leaf_burn",
  poison: "leaf_poison",
  allergy: "leaf_allergy",
  heat: "leaf_heat",
  drown: "leaf_drown",
  fall: "leaf_fall",
  unsure: null
}

export function matchAidVoice(text) {
  const s = String(text || "").toLowerCase()
  if (!s.trim()) return null
  for (const row of ROUTES) {
    if (row.keys.some((k) => s.includes(k.toLowerCase()))) return row.next
  }
  return null
}
