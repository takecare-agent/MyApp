import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native"
import { apiRequest } from "../lib/api"
import {
  formatHHmm,
  formatLocalDateLabel,
  formatReminderTime,
  getCompletionInstant,
  isTemplateReminderSource,
  localDayKey,
  roleLabelZh,
  toReminderCatCode
} from "../lib/reminderPresets"
import { reminderCatLabel, REMINDER_CAT_DEFS, categoryMatches } from "../lib/contentLabels"
import TranslatedUgcText from "../components/TranslatedUgcText"
import { usePollingRefresh } from "../lib/usePollingRefresh"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "./new_ui/tokens"
import { ensureFilled, screenshotCompletedReminders } from "./new_ui/screenshotFill"
import MarDoseSheet from "./new_ui/MarDoseSheet"
import { extraSummary, formatGivenAt } from "../lib/marGroups"
import { carePresetLabel } from "../lib/presetResolve"

/**
 * 完成封存：預設乾淨列表；篩選收進底部 sheet（不攤芯片）
 */
export default function ReminderCompletedHistory({
  apiBaseUrl,
  token,
  role = "family",
  days: initialDays = 7,
  onBack
}) {
  const { t, lang } = useI18n()

  const RANGE_OPTIONS = [
    { days: 7, label: t("reminders.range7") },
    { days: 14, label: t("reminders.range14") },
    { days: 30, label: t("reminders.range30") }
  ]
  const [days, setDays] = useState(initialDays)
  const [category, setCategory] = useState("all")
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftDays, setDraftDays] = useState(initialDays)
  const [draftCategory, setDraftCategory] = useState("all")
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [marOpen, setMarOpen] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const canEdit = role === "caregiver"

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setError("")
    try {
      const path =
        `/${role}/reminders?completed=true&days=${days}&includeTemplates=1&limit=100`
      const data = await apiRequest({ apiBaseUrl, path, token })
      const list = (Array.isArray(data?.records) ? data.records : [])
        .filter((r) => r.isCompleted)
        .sort((a, b) => {
          const ta = getCompletionInstant(a)?.getTime() || 0
          const tb = getCompletionInstant(b)?.getTime() || 0
          return tb - ta
        })
      setRecords(ensureFilled(list, screenshotCompletedReminders, 3))
      if (!silent) setError("")
    } catch (err) {
      if (!silent) setError(err.message || t("common.loadFailed"))
      setRecords(ensureFilled([], screenshotCompletedReminders, 3))
    } finally {
      if (!silent) setLoading(false)
      setRefreshing(false)
    }
  }, [apiBaseUrl, token, role, days, t])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  usePollingRefresh(load, { intervalMs: 8000, enabled: !filterOpen && !marOpen })

  const filtered = useMemo(() => {
    if (category === "all") return records
    return records.filter((r) => categoryMatches(r.category, category))
  }, [records, category])

  const categoryOptions = useMemo(() => {
    const present = new Set(records.map((r) => toReminderCatCode(r.category || "other")))
    return [
      { value: "all", label: t("reminders.catAll") },
      ...REMINDER_CAT_DEFS.filter((d) => present.has(d.code)).map((d) => ({
        value: d.code,
        label: reminderCatLabel(d.code, t)
      }))
    ]
  }, [records, t])

  const rangeLabel = RANGE_OPTIONS.find((o) => o.days === days)?.label || t("reminders.range7")
  const filterSummary =
    category === "all"
      ? rangeLabel
      : `${rangeLabel} · ${reminderCatLabel(category, t)}`

  const openFilter = () => {
    setDraftDays(days)
    setDraftCategory(category)
    setFilterOpen(true)
  }

  const applyFilter = () => {
    setDays(draftDays)
    setCategory(draftCategory)
    setFilterOpen(false)
  }

  const openEdit = (item) => {
    if (!canEdit) return
    setMarOpen({
      id: String(item._id),
      title: carePresetLabel({ text: item.content || "", contentKey: item.contentKey, t }),
      content: item.content || "",
      contentKey: item.contentKey || "",
      time: formatHHmm(item.time),
      isCompleted: true,
      done: true,
      givenAt: item.givenAt || item.completedAt,
      completedAt: item.completedAt,
      marNote: item.marNote || item.note || "",
      marStatus: item.marStatus || "done",
      reportExtra: item.reportExtra || {},
      createdByRole: item.createdByRole || "",
      createdByName: item.createdByName || "",
      category: item.category || ""
    })
  }

  const submitEdit = async (payload) => {
    const task = marOpen
    if (!task?.id) return
    setSubmitting(true)
    try {
      await apiRequest({
        apiBaseUrl,
        path: `/caregiver/reminders/${encodeURIComponent(task.id)}/complete`,
        method: "PATCH",
        token,
        body: {
          marStatus: payload.marStatus,
          givenAt: payload.givenAt,
          marNote: payload.marNote,
          reportExtra: payload.reportExtra
        }
      })
      setMarOpen(null)
      await load({ silent: true })
    } catch (err) {
      Alert.alert(t("common.error"), err.message || t("care.markFail"))
    } finally {
      setSubmitting(false)
    }
  }

  const sections = useMemo(() => {
    const map = new Map()
    filtered.forEach((r) => {
      const inst = getCompletionInstant(r)
      const key = localDayKey(inst || r.time)
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: formatLocalDateLabel(inst || r.time, new Date(), lang),
          data: []
        })
      }
      map.get(key).data.push(r)
    })
    return Array.from(map.values())
  }, [filtered])

  const listData = useMemo(() => {
    const rows = []
    sections.forEach((sec) => {
      rows.push({ type: "header", key: `h-${sec.key}`, title: sec.title, count: sec.data.length })
      sec.data.forEach((item) => {
        rows.push({ type: "item", key: String(item._id), item })
      })
    })
    return rows
  }, [sections])

  const renderRow = ({ item: row }) => {
    if (row.type === "header") {
      return (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{row.title}</Text>
          <Text style={styles.sectionCount}>{row.count} {t("reminders.records")}</Text>
        </View>
      )
    }
    const item = row.item
    const isRepeat = isTemplateReminderSource(item.source)
    const doneAt = getCompletionInstant(item)
    const extra = extraSummary(item)
    const marNote = String(item.marNote || "").trim()
    return (
      <Pressable style={styles.card} onPress={() => openEdit(item)} disabled={!canEdit}>
        <View style={styles.cardHeader}>
          <View style={[styles.badge, isRepeat ? styles.badgeGreen : null]}>
            <Text style={[styles.badgeText, isRepeat ? styles.badgeGreenText : null]}>
              {reminderCatLabel(item.category, t)} · {isRepeat ? t("reminders.repeat") : t("reminders.once")}
            </Text>
          </View>
          <Text style={styles.doneTag}>{t("common.done")}</Text>
        </View>
        <TranslatedUgcText
        text={item.content}
        sourceLang={item.sourceLang}
        contentKey={item.contentKey}
        apiBaseUrl={apiBaseUrl}
          token={token}
          style={styles.content}
        />
        {extra ? <Text style={styles.extra}>{extra}</Text> : null}
        {marNote ? (
          <Text style={styles.note}>{t("common.note")}：{marNote}</Text>
        ) : item.note ? (
          <TranslatedUgcText
            text={item.note}
            sourceLang={item.sourceLang}
            apiBaseUrl={apiBaseUrl}
            token={token}
            style={styles.note}
            notePrefix={`${t("common.note")}：`}
          />
        ) : null}
        <View style={styles.metaBlock}>
          <Text style={styles.meta}>{t("reminders.scheduled")} {formatReminderTime(item.time)}</Text>
          <Text style={styles.meta}>
            {t("reminders.completedAt")} {doneAt ? `${formatLocalDateLabel(doneAt, new Date(), lang)} ${formatHHmm(doneAt)}` : "—"}
          </Text>
          {item.givenAt ? (
            <Text style={styles.meta}>{t("mar.actualCareTime")} {formatGivenAt(item.givenAt)}</Text>
          ) : null}
          <Text style={styles.meta}>{t("reminders.executor")} {roleLabelZh(item.completedByRole)}</Text>
        </View>
        {canEdit ? (
          <Text style={styles.editHint}>{t("daily.edit")}</Text>
        ) : null}
      </Pressable>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={8}>
            <Text style={styles.back}>‹ {t("common.back")}</Text>
          </Pressable>
        ) : <View style={{ width: 56 }} />}
        <Text style={styles.title}>{t("reminders.completedHistory")}</Text>
        <Pressable onPress={openFilter} hitSlop={8} style={styles.filterBtn}>
          <Text style={styles.filterBtnText}>{t("common.filter")}</Text>
        </Pressable>
      </View>

      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>{filterSummary}</Text>
        <Text style={styles.summaryMeta}>{filtered.length} {t("reminders.records")}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.pine} style={{ marginTop: 28 }} />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(row) => row.key}
          renderItem={renderRow}
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
          ListEmptyComponent={<Text style={styles.empty}>{t("reminders.emptyHistory")}</Text>}
        />
      )}

      <Modal
        visible={filterOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setFilterOpen(false)}
      >
        <View style={styles.sheetMask}>
          <Pressable style={styles.sheetDismiss} onPress={() => setFilterOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHead}>
              <Pressable onPress={() => setFilterOpen(false)} hitSlop={8}>
                <Text style={styles.sheetCancel}>{t("common.cancel")}</Text>
              </Pressable>
              <Text style={styles.sheetTitle}>{t("common.filter")}</Text>
              <Pressable onPress={applyFilter} hitSlop={8}>
                <Text style={styles.sheetDone}>{t("common.apply")}</Text>
              </Pressable>
            </View>

            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetBody}
            >
              <Text style={styles.sheetLabel}>{t("reminders.filterRange")}</Text>
              {RANGE_OPTIONS.map((opt) => {
                const on = draftDays === opt.days
                return (
                  <Pressable
                    key={opt.days}
                    style={styles.optionRow}
                    onPress={() => setDraftDays(opt.days)}
                  >
                    <Text style={[styles.optionText, on ? styles.optionTextOn : null]}>
                      {opt.label}
                    </Text>
                    {on ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                )
              })}

              <Text style={[styles.sheetLabel, { marginTop: 16 }]}>{t("reminders.filterCategory")}</Text>
              {categoryOptions.map((cat) => {
                const on = draftCategory === cat.value
                return (
                  <Pressable
                    key={cat.value}
                    style={styles.optionRow}
                    onPress={() => setDraftCategory(cat.value)}
                  >
                    <Text style={[styles.optionText, on ? styles.optionTextOn : null]}>
                      {cat.label}
                    </Text>
                    {on ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {canEdit ? (
        <MarDoseSheet
          visible={Boolean(marOpen)}
          task={marOpen}
          slotLabel=""
          submitting={submitting}
          allowEdit
          onClose={() => setMarOpen(null)}
          onConfirm={submitEdit}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  back: { color: colors.mint, fontWeight: "700", fontSize: 16, width: 56 },
  title: { fontSize: 17, fontWeight: "800", color: colors.text },
  filterBtn: { minWidth: 56, alignItems: "flex-end" },
  filterBtnText: { color: colors.mint, fontWeight: "700", fontSize: 15 },
  summaryBar: {
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12
  },
  summaryText: { fontSize: 15, fontWeight: "700", color: colors.text, flexShrink: 1 },
  summaryMeta: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  listPad: { padding: 16, paddingBottom: 40 },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    marginTop: 4
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  sectionCount: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderCurve: "continuous",
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
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
  badgeGreen: { backgroundColor: colors.mintSoft },
  badgeText: { color: colors.mint, fontSize: 12, fontWeight: "700" },
  badgeGreenText: { color: colors.mint },
  doneTag: { fontSize: 12, fontWeight: "700", color: colors.mint },
  content: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 4 },
  extra: { fontSize: 14, fontWeight: "700", color: colors.mint, marginBottom: 4 },
  editHint: { marginTop: 10, color: colors.mint, fontWeight: "800", fontSize: 14, textAlign: "right" },
  note: { fontSize: 13, color: colors.textMuted, marginBottom: 6 },
  metaBlock: { gap: 2, marginTop: 4 },
  meta: { fontSize: 12, color: colors.textMuted, fontWeight: "500" },
  empty: { textAlign: "center", marginTop: 48, color: colors.textMuted, fontSize: 15 },
  error: { color: "#E05A47", marginHorizontal: 16, marginTop: 8 },

  sheetMask: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  sheetDismiss: { flex: 1 },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 56,
    maxHeight: "88%"
  },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 12 },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 10,
    marginBottom: 8
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginBottom: 8,
    paddingHorizontal: 16
  },
  sheetCancel: { fontSize: 16, color: colors.textMuted, fontWeight: "600", minWidth: 48 },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  sheetDone: { fontSize: 16, color: colors.mint, fontWeight: "800", minWidth: 48, textAlign: "right" },
  sheetLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 4,
    marginTop: 4
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.bg
  },
  optionText: { fontSize: 16, color: "#374151", fontWeight: "600" },
  optionTextOn: { color: colors.pine, fontWeight: "800" },
  check: { fontSize: 16, color: colors.pine, fontWeight: "800" }
})
