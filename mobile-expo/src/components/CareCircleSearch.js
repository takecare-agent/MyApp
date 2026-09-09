import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { apiRequest } from "../lib/api"
import TranslatedUgcText from "./TranslatedUgcText"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "../screens/new_ui/tokens"
import { IconSearch } from "../screens/new_ui/NeoIcons"

function searchPath(role) {
  if (role === "caregiver") return "/caregiver/care-search"
  if (role === "family") return "/family/care-search"
  return "/patient/care-search"
}

function typeLabel(type, t) {
  if (type === "daily") return t("search.type.daily")
  if (type === "reminder") return t("search.type.reminder")
  if (type === "template") return t("search.type.template")
  if (type === "alert") return t("search.type.alert")
  return type
}

export default function CareCircleSearch({ apiBaseUrl, token, role, onOpenResult }) {
  const { t } = useI18n()
  const [q, setQ] = useState("")
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    const query = String(q || "").trim()
    if (query.length < 2) {
      setResults([])
      setSearching(false)
      return undefined
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await apiRequest({
          apiBaseUrl,
          path: `${searchPath(role)}?q=${encodeURIComponent(query)}&limit=20`,
          token
        })
        setResults(Array.isArray(data?.results) ? data.results : [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 280)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [apiBaseUrl, q, role, token])

  const query = String(q || "").trim()
  const showPanel = query.length >= 2

  return (
    <View style={styles.wrap}>
      <View style={styles.searchRow}>
        <IconSearch size={18} />
        <TextInput
          style={styles.input}
          value={q}
          onChangeText={setQ}
          placeholder={t("search.placeholder")}
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      {showPanel ? (
        <View style={styles.panel}>
          {searching ? (
            <ActivityIndicator color={colors.pine} style={styles.spinner} />
          ) : results.length === 0 ? (
            <Text style={styles.empty}>{t("search.empty")}</Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
            {results.map((item) => (
              <Pressable
                key={`${item.type}-${item.id}`}
                style={styles.row}
                onPress={() => {
                  if (typeof onOpenResult === "function") onOpenResult(item)
                  setQ("")
                  setResults([])
                }}
              >
                <Text style={styles.type}>{typeLabel(item.type, t)}</Text>
                {item.type === "alert" ? (
                  <Text style={styles.title} numberOfLines={1}>
                    {item.title || "—"}
                  </Text>
                ) : (
                  <TranslatedUgcText
                    text={item.title}
                    sourceLang={item.sourceLang}
                    contentKey={item.contentKey}
                    apiBaseUrl={apiBaseUrl}
                    token={token}
                    style={styles.title}
                    numberOfLines={1}
                  />
                )}
                {item.snippet ? (
                  <Text style={styles.snippet} numberOfLines={1}>
                    {item.snippet}
                  </Text>
                ) : null}
              </Pressable>
            ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    zIndex: 4
  },
  searchRow: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 16,
    backgroundColor: colors.card
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: colors.text,
    padding: 0
  },
  panel: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.card,
    maxHeight: 280,
    overflow: "hidden"
  },
  spinner: { marginVertical: 16 },
  empty: {
    paddingVertical: 16,
    textAlign: "center",
    color: colors.textMuted,
    fontWeight: "600"
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  type: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.pine,
    marginBottom: 2
  },
  title: { fontSize: 15, fontWeight: "700", color: colors.text },
  snippet: { marginTop: 2, fontSize: 12, color: colors.textMuted }
})
