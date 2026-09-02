import { createContext, useContext, useMemo } from "react"
import { catalogs } from "./catalogs"
import { catalogPatch } from "./catalogPatch"
import { firstAidCatalog } from "./firstAidCatalog"
import { DEFAULT_LANG, FALLBACK_LANG, LANG_OPTIONS, LANG_SHORT } from "./languages"

const I18nContext = createContext({
  lang: DEFAULT_LANG,
  t: (key) => key,
  langOptions: LANG_OPTIONS,
  langShort: LANG_SHORT
})

function table(lang) {
  return {
    ...(catalogs[lang] || {}),
    ...(catalogPatch[lang] || {}),
    ...(firstAidCatalog[lang] || {})
  }
}

function lookup(lang, key) {
  const primary = table(lang)
  if (primary[key] != null) return primary[key]
  const fallback = table(FALLBACK_LANG)
  if (fallback[key] != null) return fallback[key]
  const zh = table("zh")
  if (zh[key] != null) return zh[key]
  return key
}

export function I18nProvider({ lang = DEFAULT_LANG, children }) {
  const value = useMemo(() => {
    const code = catalogs[lang] ? lang : DEFAULT_LANG
    return {
      lang: code,
      t: (key, vars) => {
        let text = lookup(code, key)
        if (vars && typeof vars === "object") {
          Object.keys(vars).forEach((k) => {
            text = String(text).replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]))
          })
        }
        return text
      },
      langOptions: LANG_OPTIONS,
      langShort: LANG_SHORT
    }
  }, [lang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}

export { LANG_OPTIONS, LANG_SHORT, DEFAULT_LANG }
