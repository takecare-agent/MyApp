import { CARE_DAILY_CAT_DEFS, CARE_DAILY_PRESET_DEFS } from "./contentLabels"

/** @deprecated 顯示請用 careDailyCatLabel；寫入請用 code */
export const CARE_DAILY_CATEGORIES = CARE_DAILY_CAT_DEFS.map((d) => d.code)

export const CARE_DAILY_DETAIL_PRESETS = Object.fromEntries(
  Object.entries(CARE_DAILY_PRESET_DEFS).map(([code, list]) => [code, list.map((p) => p.zh)])
)
CARE_DAILY_CAT_DEFS.forEach((d) => {
  CARE_DAILY_DETAIL_PRESETS[d.zh] = CARE_DAILY_DETAIL_PRESETS[d.code] || []
})

export function formatCareDailyAt(iso) {
  if (!iso) return "--"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "--"
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${mm}/${dd} ${hh}:${mi}`
}
