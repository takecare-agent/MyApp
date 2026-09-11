import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native"
import { apiRequest } from "../lib/api"
import { formatHHmm, isSameLocalDay, isTemplateReminderSource } from "../lib/reminderPresets"
import { reminderCatLabel, toReminderCatCode } from "../lib/contentLabels"
import TranslatedUgcText from "../components/TranslatedUgcText"
import { usePollingRefresh } from "../lib/usePollingRefresh"
import ReminderCompletedHistory from "./ReminderCompletedHistory"
import { useI18n } from "../i18n/I18nContext"
import { USE_MORANDI_UI } from "./new_ui/flag"
import { colors } from "./new_ui/tokens"
import NewTodoScreen from "./new_ui/NewTodoScreen"
import MarDoseSheet from "./new_ui/MarDoseSheet"
import { formatGivenAt, nowHhmm } from "../lib/marGroups"
import { carePresetLabel } from "../lib/presetResolve"

const CAT_ICON = {
  med: "Rx",
  medical_appt: "Dr",
  vitals: "BP",
  daily_care: "♥",
  other: "•"
}

export default function CaregiverTodayRemindersScreen({
  apiBaseUrl,
  token,
  user,
  reloadToken = 0
}) {
  const { t } = useI18n()
  const [view, setView] = useState("today")
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [localMark, setLocalMark] = useState({})
  const [marOpen, setMarOpen] = useState(null)
  const inFlightRef = useRef(new Set())

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setError("")
    try {
      const [remData, tplData] = await Promise.all([
        apiRequest({ apiBaseUrl, path: "/caregiver/reminders?limit=100", token }),
        apiRequest({ apiBaseUrl, path: "/caregiver/task-templates/today", token })
      ])
      const list = Array.isArray(remData?.records) ? remData.records : []
      const once = list
        .filter((r) => isSameLocalDay(r.time) && !isTemplateReminderSource(r.source))
        .map((r) => ({
          id: String(r._id),
          kind: "reminder",
          category: r.category || "other",
          content: r.content || "",
          contentKey: r.contentKey || "",
          sourceLang: r.sourceLang || "",
          note: r.note || "",
          time: formatHHmm(r.time),
          isCompleted: Boolean(r.isCompleted),
          completedAt: r.completedAt || null,
          givenAt: r.givenAt || null,
          marStatus: r.marStatus || "",
          marNote: r.marNote || "",
          reportExtra: r.reportExtra || {},
          createdByRole: r.createdByRole || "",
          createdByName: r.createdByName || ""
        }))
      const templates = (Array.isArray(tplData?.records) ? tplData.records : []).map((row) => ({
        id: row.slot ? `${row._id}::${row.slot}` : String(row._id),
        templateId: String(row._id),
        slot: row.slot || row.time,
        kind: "template",
        category: row.category || "other",
        content: row.content || "",
        contentKey: row.contentKey || "",
        sourceLang: row.sourceLang || "",
        note: row.note || "",
        time: row.time || "--:--",
        isCompleted: Boolean(row.isCompleted),
        completedAt: row.completedAt || null,
        givenAt: row.givenAt || null,
        marStatus: row.marStatus || "",
        marNote: row.marNote || "",
        reportExtra: row.reportExtra || {},
        createdByRole: row.createdByRole || "",
        createdByName: row.createdByName || "",
        mealTiming: row.mealTiming || ""
      }))
      const today = [...once, ...templates].sort((a, b) =>
        String(a.time).localeCompare(String(b.time))
      )
      setTasks(today)
      setLocalMark((prev) => {
        const ids = new Set(today.map((t) => t.id))
        const next = {}
        today.forEach((t) => {
          if (t.isCompleted || inFlightRef.current.has(t.id)) {
            next[t.id] = "done"
            return
          }
          if (prev[t.id] === "skip") next[t.id] = "skip"
        })
        // 清掉已不存在的 id
        Object.keys(prev).forEach((id) => {
          if (!ids.has(id) && prev[id] === "skip") {
            /* drop */
          }
        })
        return next
      })
      if (!silent) setError("")
    } catch (err) {
      if (!silent) setError(err.message || t("common.loadFailed"))
      setTasks([])
    } finally {
      if (!silent) setLoading(false)
      setRefreshing(false)
    }
  }, [apiBaseUrl, token])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  useEffect(() => {
    if (!reloadToken) return
    load({ silent: true })
  }, [reloadToken, load])

  usePollingRefresh(load, { intervalMs: 5000, enabled: !submitting && view === "today" })

  const handleToggle = async (taskId, status) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.isCompleted || inFlightRef.current.has(taskId)) return

    if (status === "skip") {
      setLocalMark((prev) => {
        if (prev[taskId] === "skip") {
          const next = { ...prev }
          delete next[taskId]
          return next
        }
        return { ...prev, [taskId]: "skip" }
      })
      return
    }

    // ✓：立刻寫後端；輪詢時用 inFlight 保住樂觀狀態
    if (status === "done") {
      if (localMark[taskId] === "done") return
      inFlightRef.current.add(taskId)
      setLocalMark((prev) => {
        const next = { ...prev, [taskId]: "done" }
        return next
      })
      const path =
        task.kind === "template"
          ? `/caregiver/task-templates/${encodeURIComponent(task.templateId || String(task.id).split("::")[0])}/complete`
          : `/caregiver/reminders/${encodeURIComponent(taskId)}/complete`
      try {
        await apiRequest({
          apiBaseUrl,
          path,
          method: "PATCH",
          token,
          body:
            task.kind === "template" && task.slot
              ? { slot: task.slot, marStatus: "done", givenAt: nowHhmm() }
              : { marStatus: "done", givenAt: nowHhmm() }
        })
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, isCompleted: true } : t))
        )
      } catch (err) {
        setLocalMark((prev) => {
          const next = { ...prev }
          delete next[taskId]
          return next
        })
        Alert.alert(t("common.error"), err.message || t("care.markFail"))
      } finally {
        inFlightRef.current.delete(taskId)
      }
    }
  }

  const completePathFor = (t) =>
    t.kind === "template"
      ? `/caregiver/task-templates/${encodeURIComponent(t.templateId || String(t.id).split("::")[0])}/complete`
      : `/caregiver/reminders/${encodeURIComponent(t.id)}/complete`

  const submitMar = async (payload) => {
    const task = marOpen?.task
    if (!task || inFlightRef.current.has(task.id)) return
    const isDone = payload.marStatus === "done"
    inFlightRef.current.add(task.id)
    if (isDone) {
      setLocalMark((prev) => ({ ...prev, [task.id]: "done" }))
    }
    setSubmitting(true)
    try {
      await apiRequest({
        apiBaseUrl,
        path: completePathFor(task),
        method: "PATCH",
        token,
        body: {
          ...(task.kind === "template" && task.slot ? { slot: task.slot } : {}),
          marStatus: payload.marStatus,
          givenAt: payload.givenAt,
          marNote: payload.marNote,
          reportExtra: payload.reportExtra
        }
      })
      setTasks((prev) =>
        prev.map((row) =>
          row.id === task.id
            ? {
                ...row,
                isCompleted: isDone,
                givenAt: payload.givenAt,
                marStatus: payload.marStatus,
                marNote: payload.marNote,
                reportExtra: payload.reportExtra
              }
            : row
        )
      )
      if (!isDone) {
        setLocalMark((prev) => {
          const next = { ...prev }
          delete next[task.id]
          return next
        })
      }
      setMarOpen(null)
    } catch (err) {
      setLocalMark((prev) => {
        const next = { ...prev }
        delete next[task.id]
        return next
      })
      Alert.alert(t("common.error"), err.message || t("care.markFail"))
    } finally {
      inFlightRef.current.delete(task.id)
      setSubmitting(false)
    }
  }

  const handleSubmitAll = async () => {
    const pendingDone = tasks.filter(
      (t) => !t.isCompleted && localMark[t.id] === "done"
    )
    const alreadyDone = tasks.filter((t) => t.isCompleted).length
    const skipped = tasks.filter((t) => localMark[t.id] === "skip")
    if (!pendingDone.length && !alreadyDone && !skipped.length) {
      Alert.alert(t("common.hint"), t("care.markFirst"))
      return
    }

    setSubmitting(true)
    try {
      for (const task of pendingDone) {
        await apiRequest({
          apiBaseUrl,
          path: completePathFor(task),
          method: "PATCH",
          token,
          body: task.kind === "template" && task.slot ? { slot: task.slot } : undefined
        })
      }
      Alert.alert(
        t("care.syncOkTitle"),
        t("care.syncOkMsg", { done: alreadyDone + pendingDone.length, skip: skipped.length })
      )
      await load({ silent: true })
    } catch (err) {
      Alert.alert(t("common.error"), err.message || t("care.sendFail"))
    } finally {
      setSubmitting(false)
    }
  }

  const doneCount = useMemo(
    () =>
      tasks.filter((t) => t.isCompleted || localMark[t.id] === "done").length,
    [tasks, localMark]
  )
  const skipCount = useMemo(
    () => tasks.filter((t) => localMark[t.id] === "skip").length,
    [tasks, localMark]
  )
  const total = tasks.length
  const progress = total === 0 ? 0 : Math.round((doneCount / total) * 100)
  const allCompleted = total > 0 && tasks.every((t) => t.isCompleted)

  if (view === "doneHistory") {
    return (
      <ReminderCompletedHistory
        apiBaseUrl={apiBaseUrl}
        token={token}
        role="caregiver"
        days={7}
        onBack={() => setView("today")}
      />
    )
  }

  if (USE_MORANDI_UI) {
    const todos = tasks.map((item) => {
      const status = item.isCompleted ? "done" : localMark[item.id] || null
      const cat = toReminderCatCode(item.category)
      return {
        id: item.id,
        title: carePresetLabel({
          text: item.content || t("reminders.item"),
          contentKey: item.contentKey,
          t
        }),
        contentKey: item.contentKey || "",
        time: item.time,
        done: status === "done",
        skipped: status === "skip",
        category: cat,
        kind: item.kind,
        templateId: item.templateId,
        slot: item.slot,
        createdByRole: item.createdByRole,
        createdByName: item.createdByName,
        mealTiming: item.mealTiming,
        completedClock: formatGivenAt(item.givenAt || item.completedAt),
        marNote: item.marNote || "",
        reportExtra: item.reportExtra || {},
        givenAt: item.givenAt || null,
        isCompleted: Boolean(item.isCompleted)
      }
    })
    const patientName = user?.linkedPatientName || user?.activePatientName || user?.patientName || ""
    const marTask = marOpen?.task || null
    return (
      <View style={styles.morandiWrap}>
        <View style={styles.morandiTools}>
          <Pressable onPress={() => setView("doneHistory")} hitSlop={8}>
            <Text style={styles.morandiLink} numberOfLines={1}>
              {t("reminders.completedHistory")} ›
            </Text>
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? (
          <ActivityIndicator color={colors.pine} style={{ marginTop: 40 }} />
        ) : (
          <NewTodoScreen
            tab="today"
            hideTabs
            todos={todos}
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load() }}
            onOpenSlot={(slot, group) => {
              const full = tasks.find((row) => row.id === slot.id)
              if (!full) return
              setMarOpen({
                task: { ...full, title: carePresetLabel({ text: group?.title || full.content, contentKey: full.contentKey || group?.contentKey, t }), done: full.isCompleted },
                slotLabel: slot.slotKey && slot.slotKey !== "once" ? t(`mar.${slot.slotKey}`) : ""
              })
            }}
            onOpenSingle={(item) => {
              const full = tasks.find((row) => row.id === item.id)
              if (!full) return
              setMarOpen({
                task: { ...full, title: carePresetLabel({ text: full.content, contentKey: full.contentKey, t }), done: full.isCompleted },
                slotLabel: ""
              })
            }}
          />
        )}
        <MarDoseSheet
          visible={Boolean(marTask)}
          task={marTask}
          slotLabel={marOpen?.slotLabel || ""}
          patientName={patientName}
          submitting={submitting}
          onClose={() => setMarOpen(null)}
          onConfirm={submitMar}
        />
      </View>
    )
  }

  const renderItem = ({ item }) => {
    const status = item.isCompleted ? "done" : localMark[item.id] || null
    const isDone = status === "done"
    const isSkip = status === "skip"
    const icon = CAT_ICON[toReminderCatCode(item.category)] || CAT_ICON.other
    return (
      <View style={[styles.card, isDone ? styles.cardDone : null, isSkip ? styles.cardSkip : null]}>
        <View style={styles.iconBubble}>
          <Text style={styles.iconText}>{icon}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.cat, isDone ? styles.catDone : null, isSkip ? styles.catSkip : null]}>
            {reminderCatLabel(item.category, t)}
            {item.kind === "template" ? ` · ${t("reminders.repeat")}` : ""}
          </Text>
          <TranslatedUgcText
            text={item.content}
            sourceLang={item.sourceLang}
            contentKey={item.contentKey}
            apiBaseUrl={apiBaseUrl}
            token={token}
            style={[styles.content, isDone ? styles.strike : null, isSkip ? styles.strikeSkip : null]}
          />
          {item.note ? (
            <TranslatedUgcText
              text={item.note}
              sourceLang={item.sourceLang}
              apiBaseUrl={apiBaseUrl}
              token={token}
              style={[styles.note, isDone || isSkip ? styles.noteMuted : null]}
              notePrefix={`${t("common.note")}：`}
            />
          ) : null}
          <Text style={styles.time}>⏱ {item.time}</Text>
        </View>
        <View style={styles.btnGroup}>
          <Pressable
            style={[styles.circleBtn, styles.greenCircle, isDone ? styles.greenFill : null]}
            onPress={() => handleToggle(item.id, "done")}
            disabled={item.isCompleted}
          >
            <Text style={[styles.circleGlyph, isDone ? styles.circleGlyphOn : styles.greenGlyph]}>✓</Text>
          </Pressable>
          <Pressable
            style={[styles.circleBtn, styles.redCircle, isSkip ? styles.redFill : null]}
            onPress={() => handleToggle(item.id, "skip")}
            disabled={item.isCompleted}
          >
            <Text style={[styles.circleGlyph, isSkip ? styles.circleGlyphOn : styles.redGlyph]}>✕</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.progressText}>
          {t("reminders.doneCount")} <Text style={styles.progressDone}>{doneCount}</Text> / {total}
          {skipCount > 0 ? <Text style={styles.progressSkip}>　{t("reminders.notExecuted")} {skipCount}</Text> : null}
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Pressable style={styles.historyLink} onPress={() => setView("doneHistory")}>
          <Text style={styles.historyLinkText}>{t("reminders.completedHistory")} ›</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.pine} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listPad}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={colors.pine} />
          }
          ListEmptyComponent={<Text style={styles.empty}>{t("reminders.noTasks")}</Text>}
        />
      )}

      {total > 0 ? (
        <View style={styles.footer}>
          {allCompleted ? (
            <View style={styles.doneBanner}>
              <Text style={styles.doneBannerText}>{t("reminders.allDoneToday")}</Text>
            </View>
          ) : (
            <Pressable
              style={[styles.submitBtn, submitting ? styles.submitDisabled : null]}
              onPress={handleSubmitAll}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>{t("reminders.syncBtn")}</Text>
              )}
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  morandiWrap: { flex: 1, backgroundColor: colors.bg },
  morandiTools: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 4,
    gap: 12
  },
  morandiLinkBtn: { flexShrink: 1 },
  morandiLink: { color: "#10B981", fontWeight: "700", fontSize: 13 },
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb"
  },
  progressText: { fontSize: 14, color: "#6b7280", marginBottom: 8 },
  progressDone: { color: colors.pine, fontWeight: "800", fontSize: 18 },
  progressSkip: { color: "#dc2626", fontSize: 13 },
  progressBar: { height: 6, backgroundColor: "#e5e7eb", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: colors.pine, borderRadius: 3 },
  historyLink: { marginTop: 10, alignSelf: "flex-start" },
  historyLinkText: { color: colors.pine, fontWeight: "700", fontSize: 14 },
  writeDailyBtn: {
    marginTop: 12,
    backgroundColor: colors.mint,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  writeDailyText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  listPad: { padding: 16, paddingBottom: 120 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: colors.pine
  },
  cardDone: { backgroundColor: "#f0fdf4", opacity: 0.95 },
  cardSkip: { backgroundColor: "#fef2f2", borderLeftColor: "#dc2626" },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12
  },
  iconText: { fontSize: 14, fontWeight: "800", color: colors.pine },
  cardBody: { flex: 1 },
  cat: { fontSize: 12, fontWeight: "700", color: colors.pine, marginBottom: 2 },
  catDone: { color: colors.pine },
  catSkip: { color: "#dc2626" },
  content: { fontSize: 16, fontWeight: "700", color: "#111827" },
  note: { marginTop: 4, fontSize: 12, color: "#4b5563" },
  noteMuted: { opacity: 0.7 },
  strike: { color: colors.pine, textDecorationLine: "line-through" },
  strikeSkip: { color: "#dc2626", textDecorationLine: "line-through" },
  time: { marginTop: 4, fontSize: 12, color: "#6b7280" },
  btnGroup: { gap: 8, marginLeft: 8 },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    backgroundColor: "#fff"
  },
  greenCircle: { borderColor: colors.pine },
  greenFill: { backgroundColor: colors.pine },
  redCircle: { borderColor: "#dc2626" },
  redFill: { backgroundColor: "#dc2626" },
  circleGlyph: { fontSize: 16, fontWeight: "800" },
  greenGlyph: { color: colors.pine },
  redGlyph: { color: "#dc2626" },
  circleGlyphOn: { color: "#fff" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb"
  },
  submitBtn: {
    backgroundColor: colors.pine,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center"
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  doneBanner: {
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#86efac"
  },
  doneBannerText: { color: colors.pine, fontSize: 15, fontWeight: "800" },
  empty: { textAlign: "center", marginTop: 48, color: "#9ca3af", fontSize: 15 },
  error: { color: "#dc2626", marginHorizontal: 16, marginTop: 8 }
})
