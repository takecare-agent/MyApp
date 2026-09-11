import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native"
import { apiRequest } from "../lib/api"
import { formatReminderTime, isSameLocalDay, isTemplateReminderSource } from "../lib/reminderPresets"
import { reminderCatLabel } from "../lib/contentLabels"
import TranslatedUgcText from "../components/TranslatedUgcText"
import { usePollingRefresh } from "../lib/usePollingRefresh"
import ReminderCompletedHistory from "./ReminderCompletedHistory"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "./new_ui/tokens"

/** 受顧者只看「今日」；完成紀錄走獨立封存頁 */
export default function PatientRemindersScreen({ apiBaseUrl, token }) {
  const { t } = useI18n()
  const [view, setView] = useState("today") // today | doneHistory
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [templatesToday, setTemplatesToday] = useState([])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setError("")
    try {
      const [data, tpl] = await Promise.all([
        apiRequest({ apiBaseUrl, path: "/patient/reminders?limit=100", token }),
        apiRequest({ apiBaseUrl, path: "/patient/task-templates/today", token })
      ])
      setRecords(Array.isArray(data?.records) ? data.records : [])
      setTemplatesToday(Array.isArray(tpl?.records) ? tpl.records : [])
      if (!silent) setError("")
    } catch (err) {
      if (!silent) setError(err.message || t("common.loadFailed"))
      setRecords([])
    } finally {
      if (!silent) setLoading(false)
      setRefreshing(false)
    }
  }, [apiBaseUrl, token, t])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  usePollingRefresh(load, { intervalMs: 5000, enabled: view === "today" })

  const todayList = useMemo(() => {
    const once = records
      .filter((r) => !isTemplateReminderSource(r.source) && isSameLocalDay(r.time) && !r.isCompleted)
    const tplCards = templatesToday
      .filter((t) => !t.isCompleted)
      .map((t) => ({
      _id: `tpl-${t._id}`,
      category: t.category,
      content: t.content,
      contentKey: t.contentKey,
      sourceLang: t.sourceLang,
      note: t.note || "",
      time: t.time,
      isCompleted: t.isCompleted,
      _repeat: true
    }))
    return [...once, ...tplCards].sort((a, b) => new Date(a.time) - new Date(b.time))
  }, [records, templatesToday])

  const renderItem = ({ item }) => {
    const done = Boolean(item.isCompleted)
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.badge, item._repeat ? styles.badgeRepeat : null]}>
            <Text style={[styles.badgeText, item._repeat ? styles.badgeRepeatText : null]}>
              {reminderCatLabel(item.category, t)}{item._repeat ? ` · ${t("reminders.repeatShort")}` : ""}
            </Text>
          </View>
          <View style={[styles.statusBadge, done ? styles.statusDone : styles.statusPending]}>
            <Text style={styles.statusText}>{done ? t("reminders.statusDone") : t("reminders.statusOpen")}</Text>
          </View>
        </View>
        <TranslatedUgcText
          text={item.content}
          sourceLang={item.sourceLang}
          contentKey={item.contentKey}
          apiBaseUrl={apiBaseUrl}
          token={token}
          style={styles.content}
        />
        {item.note ? (
          <TranslatedUgcText
            text={item.note}
            sourceLang={item.sourceLang}
            apiBaseUrl={apiBaseUrl}
            token={token}
            style={styles.noteText}
            notePrefix={t("reminders.notePrefix")}
          />
        ) : null}
        <Text style={styles.timeText}>{t("reminders.scheduledAt", { time: formatReminderTime(item.time) })}</Text>
      </View>
    )
  }

  if (view === "doneHistory") {
    return (
      <ReminderCompletedHistory
        apiBaseUrl={apiBaseUrl}
        token={token}
        role="patient"
        days={7}
        onBack={() => setView("today")}
      />
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.historyLink} onPress={() => setView("doneHistory")}>
          <Text style={styles.historyLinkText}>{t("reminders.completedHistory")} ›</Text>
        </Pressable>
        <Text style={styles.headerMeta}>{t("reminders.countItems", { n: todayList.length })}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.pine} style={{ marginTop: 28 }} />
      ) : (
        <FlatList
          data={todayList}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                load()
              }}
              tintColor={colors.pine}
            />
          }
          contentContainerStyle={styles.listPad}
          ListEmptyComponent={<Text style={styles.empty}>{t("reminders.emptyPatientToday")}</Text>}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerMeta: { fontSize: 14, color: colors.textMuted, fontWeight: "600" },
  historyLink: {},
  historyLinkText: { color: colors.mint, fontWeight: "700", fontSize: 14 },
  listPad: { padding: 16, paddingBottom: 32, paddingTop: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderCurve: "continuous",
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  badge: {
    backgroundColor: colors.mintSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  badgeRepeat: { backgroundColor: colors.mintSoft },
  badgeText: { color: colors.mint, fontSize: 12, fontWeight: "700" },
  badgeRepeatText: { color: colors.mint },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  statusDone: { backgroundColor: colors.mintSoft },
  statusPending: { backgroundColor: "rgba(245,158,11,0.18)" },
  statusText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  content: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 6 },
  noteText: { fontSize: 13, color: colors.textMuted, marginBottom: 6 },
  timeText: { fontSize: 13, color: colors.textMuted },
  empty: { textAlign: "center", marginTop: 48, color: colors.textMuted, fontSize: 15 },
  error: { color: colors.clay, marginHorizontal: 16, marginTop: 8 }
})
