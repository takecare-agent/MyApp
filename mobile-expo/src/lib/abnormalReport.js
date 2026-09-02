export const REPORT_TYPES = [
  { code: "fall", emoji: "🚨" },
  { code: "health", emoji: "🩺" },
  { code: "emotion", emoji: "😰" },
  { code: "diet", emoji: "🍽️" },
  { code: "other", emoji: "📝" }
]

export const REPORT_DETAILS = {
  fall: ["slip_bath", "fall_bed", "trip_walk", "hit_furniture", "bruise"],
  health: ["fever", "breath", "high_bp", "vomit", "unconscious"],
  emotion: ["agitate", "refuse", "wander", "insomnia"],
  diet: ["no_eat", "choke", "constipate", "diarrhea"],
  other: []
}

export const REPORT_SEVERITY = [
  { code: "Low", api: "Low" },
  { code: "Medium", api: "Medium" },
  { code: "High", api: "High" }
]

export function reportTypeOptions(t) {
  return REPORT_TYPES.map((d) => ({
    value: d.code,
    label: `${d.emoji} ${t(`report.type.${d.code}`)}`
  }))
}

export function reportDetailOptions(typeCode, t) {
  return (REPORT_DETAILS[typeCode] || []).map((code) => ({
    value: code,
    label: t(`report.detail.${typeCode}.${code}`)
  }))
}

export function classifyAlertType(type) {
  const s = String(type || "").toLowerCase()
  if (s.includes("sos") || s.includes("求救") || s.includes("fall") || s.includes("跌倒")) return "fall"
  if (s.includes("health") || s.includes("生理") || s.includes("fever")) return "health"
  if (s.includes("emotion") || s.includes("情緒")) return "emotion"
  if (s.includes("diet") || s.includes("飲食") || s.includes("排泄")) return "diet"
  if (["fall", "health", "emotion", "diet", "other"].includes(s)) return s
  return "other"
}

export function isSosAlert(record) {
  const type = String(record?.type || "")
  const desc = String(record?.description || "")
  return (
    type.toLowerCase().includes("sos") ||
    desc.includes("sos") ||
    desc.includes("手勢") ||
    record?.eventId?.startsWith?.("SOS")
  )
}

export function severityTone(severity) {
  if (severity === "High" || severity === "緊急") return "urgent"
  if (severity === "Low" || severity === "輕微") return "mild"
  return "watch"
}
