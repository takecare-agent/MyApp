import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { apiRequest } from "../lib/api"
import { formatCareDailyAt } from "../lib/careDailyPresets"
import { careDailyContentPresetOptions, toCareDailyCatCode } from "../lib/contentLabels"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "./new_ui/tokens"
import { NeoIcon } from "./new_ui/NeoIcons"

const MOOD_ICONS = {
  good: { name: "emoticon-happy", color: "#FBBF24" },
  ok: { name: "emoticon-neutral", color: "#10B981" },
  tired: { name: "moon", color: "#8E95A3" },
  down: { name: "emoticon-confused", color: "#FB923C" },
  anxious: { name: "emoticon-dizzy", color: "#F87171" }
}

function iconCodeForContent(content, options) {
  const raw = String(content || "").trim()
  const hit = options.find((o) => o.code === raw || o.value === raw || o.label === raw)
  if (hit?.code && MOOD_ICONS[hit.code]) return hit.code
  return ""
}

function MoodMark({ code, size = 28 }) {
  const spec = MOOD_ICONS[code]
  if (!spec) return null
  return <NeoIcon name={spec.name} size={size} color={spec.color} />
}

export default function PatientMoodDiary({ apiBaseUrl, token }) {
  const { t, lang } = useI18n()
  const options = useMemo(() => careDailyContentPresetOptions("mood", t), [t])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [moodCode, setMoodCode] = useState("")
  const [note, setNote] = useState("")

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: "/patient/care-daily-records?limit=80",
        token
      })
      const rows = Array.isArray(data?.records) ? data.records : []
      setRecords(rows.filter((row) => toCareDailyCatCode(row.category) === "mood"))
    } catch (err) {
      if (!silent) Alert.alert(t("common.error"), err.message || t("common.loadFailed"))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [apiBaseUrl, token, t])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    const picked = options.find((o) => o.code === moodCode)
    if (!picked) {
      Alert.alert(t("common.hint"), t("mood.needMood"))
      return
    }
    setSaving(true)
    try {
      await apiRequest({
        apiBaseUrl,
        path: "/patient/care-daily-records",
        method: "POST",
        token,
        body: {
          category: "mood",
          content: picked.value,
          note: String(note || "").trim(),
          sourceLang: lang
        }
      })
      setMoodCode("")
      setNote("")
      await load({ silent: true })
    } catch (err) {
      Alert.alert(t("common.error"), err.message || t("common.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.composer}>
        <Text style={styles.title}>{t("mood.title")}</Text>
        <Text style={styles.hint}>{t("mood.hint")}</Text>
        <View style={styles.emojiRow}>
          {options.map((item) => {
            const on = moodCode === item.code
            return (
              <Pressable
                key={item.code}
                onPress={() => setMoodCode(item.code)}
                style={[styles.emojiBtn, on ? styles.emojiBtnOn : null]}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: on }}
              >
                <MoodMark code={item.code} size={30} />
              </Pressable>
            )
          })}
        </View>
        <TextInput
          style={styles.note}
          value={note}
          onChangeText={setNote}
          placeholder={t("mood.notePh")}
          placeholderTextColor={colors.textMuted}
          multiline
        />
        <Pressable style={[styles.save, saving ? styles.saveOff : null]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveText}>{t("mood.save")}</Text>}
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.mint} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item, i) => String(item._id || i)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load({ silent: true }) }} tintColor={colors.mint} />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t("mood.empty")}</Text>}
          renderItem={({ item }) => {
            const moodCodeHit = iconCodeForContent(item.content, options)
            return (
              <View style={styles.card}>
                <Text style={styles.when}>{formatCareDailyAt(item.recordedAt || item.createdAt)}</Text>
                <View style={styles.moodLine}>
                  {moodCodeHit ? <MoodMark code={moodCodeHit} size={26} /> : null}
                  {item.note ? <Text style={styles.noteLine}>{item.note}</Text> : null}
                </View>
              </View>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  composer: {
    margin: 16,
    padding: 16,
    backgroundColor: "#16181D",
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 12
  },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  hint: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  emojiRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  emojiBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: "#121418",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center"
  },
  emojiBtnOn: { backgroundColor: "#12281E", borderColor: "#10B981" },
  emoji: { fontSize: 28, lineHeight: 34 },
  note: {
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#121418",
    color: "#FFFFFF",
    padding: 12,
    fontWeight: "600"
  },
  save: {
    height: 48,
    borderRadius: 999,
    backgroundColor: "#5B8E7D",
    alignItems: "center",
    justifyContent: "center"
  },
  saveOff: { opacity: 0.6 },
  saveText: { color: "#000000", fontWeight: "800", fontSize: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 28, gap: 10 },
  empty: { color: colors.textMuted, textAlign: "center", paddingVertical: 28, fontWeight: "600" },
  card: {
    backgroundColor: "#16181D",
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 14,
    gap: 6
  },
  when: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  moodLine: { flexDirection: "row", alignItems: "center", gap: 10 },
  moodEmoji: { fontSize: 28, lineHeight: 34 },
  noteLine: { color: "#C8CDD4", fontSize: 14, fontWeight: "600", flex: 1 }
})
