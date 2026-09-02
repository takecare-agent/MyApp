/** Allowed ICE health-card option ids (keep in sync with mobile-expo/src/lib/healthCardOptions.js). */

const ALLERGY = new Set(["none", "penicillin", "aspirin", "sulfa", "seafood", "peanut"])
const CONDITION = new Set([
  "hypertension", "diabetes", "hyperlipidemia", "heartDisease", "stroke", "pacemaker",
  "copd", "asthma", "dementia", "parkinson", "seizure", "kidney", "dialysis", "liver",
  "hepatitisB", "hepatitisC", "cancer", "psychiatric", "thyroid", "gout", "osteoporosis",
  "noneCardio", "noneResp", "noneNeuro", "noneOrgan", "noneOther", "none",
  "heartFailure", "afib", "stent", "alzheimer", "anemia"
])
const MEDICATION = new Set([
  "noneMed", "anticoagulant", "antiplatelet", "insulin", "inhaler", "antiseizure",
  "steroid", "immunosuppressant", "opioid"
])
const DEVICE = new Set([
  "noneDevice", "oxygen", "insulinPump", "hearingAid", "glasses", "cane", "walker",
  "wheelchair", "dentures", "epipen"
])
const DIRECTIVE = new Set(["noneDirective", "dnr", "noTransfusion", "organDonor"])
const BLOOD = new Set(["A", "B", "AB", "O", "unknown"])

function mapBlood(raw) {
  const s = String(raw || "").trim()
  if (!s) return ""
  if (s.startsWith("AB")) return "AB"
  if (s.startsWith("A")) return "A"
  if (s.startsWith("B")) return "B"
  if (s.startsWith("O")) return "O"
  if (s === "unknown") return "unknown"
  return BLOOD.has(s) ? s : ""
}

function pickKeys(value, allowed, fallback) {
  if (!Array.isArray(value)) return fallback || []
  return [...new Set(value.map((x) => String(x || "").trim()).filter((id) => allowed.has(id)))]
}

function pickStr(value, fallback) {
  if (typeof value !== "string") return fallback || ""
  return value.trim()
}

function normalizeHealthCard(body, prev) {
  const p = prev || {}
  const bloodRaw = typeof body.bloodType === "string" ? body.bloodType : (p.bloodType || "")
  return {
    bloodType: mapBlood(bloodRaw),
    allergyKeys: pickKeys(body.allergyKeys, ALLERGY, p.allergyKeys),
    allergyOther: pickStr(body.allergyOther, p.allergyOther),
    conditionKeys: pickKeys(body.conditionKeys, CONDITION, p.conditionKeys),
    conditionOther: pickStr(body.conditionOther, p.conditionOther),
    medicationKeys: pickKeys(body.medicationKeys, MEDICATION, p.medicationKeys),
    medications: pickStr(body.medications, p.medications),
    deviceKeys: pickKeys(body.deviceKeys, DEVICE, p.deviceKeys),
    directiveKeys: pickKeys(body.directiveKeys, DIRECTIVE, p.directiveKeys),
    preferredLanguage: pickStr(body.preferredLanguage, p.preferredLanguage),
    notes: pickStr(body.notes, p.notes),
    allergies: pickStr(body.allergies, p.allergies),
    conditions: pickStr(body.conditions, p.conditions)
  }
}

module.exports = { normalizeHealthCard }
