import { useEffect, useRef, useState } from "react"
import { Pressable, Platform, StyleSheet, Text, TextInput, View } from "react-native"
import { apiRequest } from "../lib/api"
import { resolveCarePresetKey } from "../lib/presetResolve"
import { useI18n } from "../i18n/I18nContext"

function looksMedical(text) {
  return /藥|劑量|mg\b|ml\b|mmHg|insulin|胰島素|血壓藥|降壓|禁忌|tablet/i.test(String(text || ""))
}

function textLooksLikeLang(text, lang) {
  const s = String(text || "")
  if (lang === "zh") return /[\u4e00-\u9fff]/.test(s)
  if (lang === "vi") return /[ăâêôơưđĂÂÊÔƠƯĐáàảãạ]/i.test(s)
  if (lang === "th") return /[\u0e00-\u0e7f]/.test(s)
  if (lang === "en" || lang === "id" || lang === "tl") {
    return /[a-zA-Z]/.test(s) && !/[\u4e00-\u9fff]/.test(s)
  }
  return true
}

/** 記憶體快取：避免列表重複打 /translate */
const cache = new Map()

function cacheKey(targetLang, text) {
  return `${targetLang}::${String(text || "").trim()}`
}

const PRESET_I18N_KEYS = {
  needHelp: "sos.needHelp",
  fell: "sos.fell",
  comeQuick: "sos.comeQuick"
}

/**
 * 讀取方顯示：
 * - 系統預設／介面字典 → 本地精翻，不顯示「查看原文」
 * - 手打 UGC／聊天（對方）→ 譯成讀者介面語言；來源語不同才可看原文
 * - 自己送出的 → skipTranslate，維持送出時原文，不隨介面語重翻
 * - 失敗仍原文
 */
export default function TranslatedUgcText({
  text,
  sourceLang,
  messageKey,
  contentKey,
  apiBaseUrl,
  token,
  style,
  notePrefix,
  compact = false,
  numberOfLines,
  allowOriginal: allowOriginalProp,
  skipTranslate = false
}) {
  const { lang, t } = useI18n()
  const original = String(text || "").trim()
  const [display, setDisplay] = useState(original)
  const [showOriginal, setShowOriginal] = useState(false)
  const [isPreset, setIsPreset] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    setShowOriginal(false)
    if (!original) {
      setDisplay("")
      setIsPreset(false)
      return
    }

    if (skipTranslate) {
      setDisplay(original)
      setIsPreset(false)
      return
    }

    const sosKey = PRESET_I18N_KEYS[String(messageKey || "").trim()]
    const careKey = resolveCarePresetKey({
      text: original,
      contentKey: contentKey || messageKey
    })
    const presetKey = sosKey || careKey
    if (presetKey) {
      const localized = t(presetKey)
      const ok = localized && localized !== presetKey
      setDisplay(ok ? localized : original)
      setIsPreset(true)
      return
    }
    setIsPreset(false)

    if (!apiBaseUrl || !token) {
      setDisplay(original)
      return
    }
    if (sourceLang && sourceLang === lang && textLooksLikeLang(original, lang)) {
      setDisplay(original)
      return
    }

    const key = cacheKey(lang, original)
    if (cache.has(key)) {
      const hit = cache.get(key)
      setDisplay(hit || original)
      return
    }

    const id = ++reqId.current
    ;(async () => {
      try {
        const data = await apiRequest({
          apiBaseUrl,
          path: "/translate",
          method: "POST",
          token,
          body: { text: original, targetLang: lang, messageKey }
        })
        if (reqId.current !== id) return
        const translated = String(data?.translatedText || original).trim() || original
        cache.set(key, translated)
        setDisplay(translated)
      } catch {
        if (reqId.current !== id) return
        setDisplay(original)
      }
    })()
  }, [original, sourceLang, messageKey, contentKey, lang, apiBaseUrl, token, t, skipTranslate])

  if (!original) return null

  const displayTrim = String(display || "").trim()
  const sourceDiffers = !sourceLang || sourceLang !== lang
  const translatedAway = Boolean(displayTrim) && original !== displayTrim
  const allowOriginal = allowOriginalProp !== false
    && !compact
    && !isPreset
    && !skipTranslate
    && sourceDiffers
    && translatedAway

  return (
    <View style={compact ? styles.wrapCompact : styles.wrap}>
      {compact ? (
        <Text style={style} numberOfLines={numberOfLines}>
          {notePrefix ? notePrefix : ""}
          {display}
        </Text>
      ) : Platform.OS === "ios" ? (
        <TextInput
          value={`${notePrefix || ""}${display}`}
          editable={false}
          multiline
          scrollEnabled={false}
          showSoftInputOnFocus={false}
          caretHidden
          style={style}
        />
      ) : (
        <Text style={style} selectable>
          {notePrefix ? notePrefix : ""}
          {display}
        </Text>
      )}
      {allowOriginal ? (
        <Pressable onPress={() => setShowOriginal((v) => !v)} hitSlop={10} style={styles.toggleHit}>
          <Text style={styles.toggle}>
            {showOriginal ? t("ugc.hideOriginal") : t("ugc.showOriginal")}
          </Text>
        </Pressable>
      ) : null}
      {allowOriginal && showOriginal ? (
        Platform.OS === "ios" ? (
          <TextInput
            value={original}
            editable={false}
            multiline
            scrollEnabled={false}
            showSoftInputOnFocus={false}
            caretHidden
            style={styles.original}
          />
        ) : (
          <Text style={styles.original} selectable>
            {original}
          </Text>
        )
      ) : null}
      {!skipTranslate && !isPreset && !compact && looksMedical(original) ? (
        <Text style={styles.original}>{t("ugc.trustOriginal")}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  wrapCompact: { gap: 0 },
  toggleHit: { minHeight: 32, justifyContent: "center" },
  toggle: {
    fontSize: 13,
    lineHeight: 18,
    color: "#64748b",
    fontWeight: "600",
    marginTop: 2
  },
  original: {
    fontSize: 11,
    lineHeight: 15,
    color: "#94a3b8",
    marginTop: 1
  }
})
