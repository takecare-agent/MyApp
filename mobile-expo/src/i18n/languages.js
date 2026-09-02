/** 支援語言（顯示名用該語言自稱，利於選單辨識） */
export const LANG_OPTIONS = [
  { code: "zh", label: "繁體中文", short: "中文" },
  { code: "en", label: "English", short: "EN" },
  { code: "id", label: "Bahasa Indonesia", short: "ID" },
  { code: "vi", label: "Tiếng Việt", short: "VI" },
  { code: "tl", label: "Filipino", short: "TL" },
  { code: "th", label: "ภาษาไทย", short: "TH" }
]

export const LANG_SHORT = Object.fromEntries(LANG_OPTIONS.map((l) => [l.code, l.short]))

export const DEFAULT_LANG = "zh"
export const FALLBACK_LANG = "en"
