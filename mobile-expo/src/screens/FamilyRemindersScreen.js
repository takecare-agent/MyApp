import { useCallback, useEffect, useMemo, useState } from "react"
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
import CareDailyRecordsScreen from "./CareDailyRecordsScreen"
import ReminderCompletedHistory from "./ReminderCompletedHistory"
import TranslatedUgcText from "../components/TranslatedUgcText"
import { apiRequest } from "../lib/api"
import {
  formatHHmm,
  formatReminderTime,
  isSameLocalDay,
  toReminderCatCode
} from "../lib/reminderPresets"
import { reminderCatLabel, reminderContentPresetOptions } from "../lib/contentLabels"
import { resolveCarePresetKey } from "../lib/presetResolve"
import { usePollingRefresh } from "../lib/usePollingRefresh"
import { useI18n } from "../i18n/I18nContext"
import { weekdayShortLabels } from "../i18n/dateLocale"
import { colors } from "./new_ui/tokens"
import { ensureFilled, screenshotOnceReminders, screenshotTodayTemplates, screenshotTodayTasks } from "./new_ui/screenshotFill"
import NewTodoScreen from "./new_ui/NewTodoScreen"
import AddCareTaskModal from "./new_ui/AddCareTaskModal"
import MarDoseSheet from "./new_ui/MarDoseSheet"
import { AvatarMark } from "../components/AvatarMark"
import { NeoIcon } from "./new_ui/NeoIcons"
import { formatGivenAt } from "../lib/marGroups"

function weekdayLabel(weekdays, t, lang) {
  if (!weekdays || weekdays.length === 0) return t("reminders.everyDay")
  const labels = weekdayShortLabels(lang)
  return weekdays.map((d) => labels[d]).join(lang === "zh" ? "、" : ", ")
}

function emptyForm(kind = "repeat") {
  const now = new Date()
  now.setSeconds(0, 0)
  return {
    kind,
    category: "med",
    contentText: "",
    note: "",
    scheduledAt: now,
    weekdays: [],
    extraTimes: []
  }
}

function formFromOnce(item) {
  return {
    kind: "once",
    category: toReminderCatCode(item.category || "med"),
    contentText: item.content || "",
    note: item.note || "",
    scheduledAt: item.time ? new Date(item.time) : new Date(),
    weekdays: [],
    extraTimes: [],
  }
}

function formFromRepeat(item) {
  const scheduledAt = new Date()
  if (typeof item.time === "string" && item.time.includes(":")) {
    const [h, m] = item.time.split(":")
    scheduledAt.setHours(Number(h) || 0, Number(m) || 0, 0, 0)
  }
  const extras = []
  if (typeof item.time === "string" && item.time.includes(":")) extras.push(item.time)
  if (Array.isArray(item.times)) extras.push(...item.times)
  return {
    kind: "repeat",
    category: toReminderCatCode(item.category || "med"),
    contentText: item.content || "",
    note: item.note || "",
    scheduledAt,
    weekdays: Array.isArray(item.weekdays) ? item.weekdays : [],
    extraTimes: [...new Set(extras.filter(Boolean))],
  }
}

export default function FamilyRemindersScreen({ apiBaseUrl, token, user }) {
  const { t, lang } = useI18n()
  const [page, setPage] = useState("today") // today | manage | careDaily | doneHistory
  const [onceList, setOnceList] = useState([])
  const [templates, setTemplates] = useState([])
  const [todayTemplates, setTodayTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [modalOpen, setModalOpen] = useState(false)
  const [marOpen, setMarOpen] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(() => emptyForm("once"))
  const [saving, setSaving] = useState(false)
  const [customPresets, setCustomPresets] = useState([])
  const [addingPreset, setAddingPreset] = useState(false)
  const [removingPreset, setRemovingPreset] = useState(false)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setError("")
    try {
      const [remData, tplData, todayTpl, presetData] = await Promise.all([
        apiRequest({ apiBaseUrl, path: "/family/reminders?limit=100", token }),
        apiRequest({ apiBaseUrl, path: "/family/task-templates", token }),
        apiRequest({ apiBaseUrl, path: "/family/task-templates/today", token }),
        apiRequest({ apiBaseUrl, path: "/family/reminder-presets", token })
      ])
      setOnceList(ensureFilled(Array.isArray(remData?.records) ? remData.records : [], screenshotOnceReminders, 1))
      setTemplates(Array.isArray(tplData?.records) ? tplData.records : [])
      setTodayTemplates(ensureFilled(Array.isArray(todayTpl?.records) ? todayTpl.records : [], screenshotTodayTemplates, 3))
      setCustomPresets(Array.isArray(presetData?.records) ? presetData.records : [])
      if (!silent) setError("")
    } catch (err) {
      if (!silent) setError(err.message || t("common.loadFailed"))
      setOnceList(ensureFilled([], screenshotOnceReminders, 1))
      setTodayTemplates(ensureFilled([], screenshotTodayTemplates, 3))
    } finally {
      if (!silent) setLoading(false)
      setRefreshing(false)
    }
  }, [apiBaseUrl, token])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  usePollingRefresh(load, { intervalMs: 5000, enabled: !modalOpen && page !== "doneHistory" })

  const todayTodos = useMemo(() => {
    const onceToday = onceList
      .filter((r) => isSameLocalDay(r.time))
      .map((r) => ({
        key: `once-${r._id}`,
        kind: "once",
        category: r.category,
        content: r.content,
        contentKey: r.contentKey,
        sourceLang: r.sourceLang,
        note: r.note || "",
        timeLabel: formatReminderTime(r.time),
        sortKey: formatHHmm(r.time),
        isCompleted: Boolean(r.isCompleted),
        raw: r
      }))
    const repeatToday = todayTemplates.map((t) => ({
      key: `tpl-${t._id}-${t.slot || t.time || ""}`,
      kind: "repeat",
      category: t.category,
      content: t.content,
      contentKey: t.contentKey,
      sourceLang: t.sourceLang,
      note: t.note || "",
      timeLabel: t.time || "--:--",
      sortKey: t.time || "99:99",
      isCompleted: Boolean(t.isCompleted),
      createdByRole: t.createdByRole || "",
      createdByName: t.createdByName || "",
      raw: t
    }))
    return ensureFilled([...onceToday, ...repeatToday].sort((a, b) =>
      String(a.sortKey).localeCompare(String(b.sortKey))
    ), () => screenshotTodayTasks().map((item) => ({
      key: `fill-${item.id}`,
      kind: item.kind === "template" ? "repeat" : "once",
      category: item.category,
      content: item.content,
      contentKey: "",
      sourceLang: "",
      note: "",
      timeLabel: item.time,
      sortKey: item.time,
      isCompleted: Boolean(item.isCompleted),
      raw: item
    })), 3)
  }, [onceList, todayTemplates])

  const doneToday = todayTodos.filter((t) => t.isCompleted).length

  const contentOptions = useMemo(() => {
    const cat = toReminderCatCode(form.category)
    const hidden = new Set(
      customPresets
        .filter((p) => toReminderCatCode(p.category) === cat && p.source === "family-hidden")
        .map((p) => p.content)
    )
    const customRows = customPresets.filter(
      (p) => toReminderCatCode(p.category) === cat && p.source !== "family-hidden"
    )
    const customValues = new Set(customRows.map((p) => p.content))
    const builtIn = reminderContentPresetOptions(cat, t)
      .map((p) => p.value)
      .filter((c) => !hidden.has(c) && !customValues.has(c))
      .map((c) => ({ value: c, kind: "builtin", deletable: true }))
    const customs = customRows.map((p) => ({
      value: p.content,
      id: p._id,
      kind: "custom",
      deletable: true
    }))
    return [...builtIn, ...customs]
  }, [form.category, customPresets, t])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm("repeat"))
    setModalOpen(true)
  }

  const openEditOnce = (item) => {
    setEditing({ type: "once", id: item._id })
    setForm(formFromOnce(item))
    setModalOpen(true)
  }

  const openEditRepeat = (item) => {
    setEditing({ type: "repeat", id: item._id })
    setForm(formFromRepeat(item))
    setModalOpen(true)
  }

  const handleAddPreset = async () => {
    const content = String(form.contentText || "").trim()
    if (!content) {
      Alert.alert(t("common.hint"), t("reminders.needContentField"))
      return
    }
    setAddingPreset(true)
    try {
      await apiRequest({
        apiBaseUrl,
        path: "/family/reminder-presets",
        method: "POST",
        token,
        body: { category: toReminderCatCode(form.category), content }
      })
      await load({ silent: true })
    } catch (err) {
      Alert.alert(t("common.error"), err.message || t("reminders.addPresetFail"))
    } finally {
      setAddingPreset(false)
    }
  }

  const handleRemovePreset = async (opt) => {
    setRemovingPreset(true)
    try {
      if (opt.kind === "custom" && opt.id) {
        await apiRequest({
          apiBaseUrl,
          path: `/family/reminder-presets/${encodeURIComponent(opt.id)}`,
          method: "DELETE",
          token
        })
      } else {
        // 內建：寫入隱藏標記
        await apiRequest({
          apiBaseUrl,
          path: "/family/reminder-presets",
          method: "POST",
          token,
          body: { category: toReminderCatCode(form.category), content: opt.value, hidden: true }
        })
      }
      if (form.contentText === opt.value) {
        setForm((prev) => ({ ...prev, contentText: "" }))
      }
      await load({ silent: true })
    } catch (err) {
      Alert.alert(t("common.error"), err.message || t("reminders.removePresetFail"))
    } finally {
      setRemovingPreset(false)
    }
  }

  const handleSave = async (payload) => {
    const content = String(payload?.content || "").trim()
    if (!content) {
      Alert.alert(t("common.hint"), t("mar.needTitle"))
      return
    }
    setSaving(true)
    try {
      const note = String(payload.note || form.note || "").trim()
      if (payload.kind === "repeat") {
        const extraTimes = Array.isArray(payload.extraTimes) ? payload.extraTimes.filter(Boolean) : []
        const body = {
          category: payload.category || toReminderCatCode(form.category),
          content,
          contentKey: resolveCarePresetKey({ text: content }) || "",
          time: extraTimes[0] || formatHHmm(payload.scheduledAt || form.scheduledAt),
          times: extraTimes.slice(1),
          weekdays: form.weekdays || [],
          note,
          sourceLang: lang
        }
        if (editing?.type === "repeat" && editing.id) {
          await apiRequest({
            apiBaseUrl,
            path: `/family/task-templates/${encodeURIComponent(editing.id)}`,
            method: "PATCH",
            token,
            body
          })
        } else {
          await apiRequest({
            apiBaseUrl,
            path: "/family/task-templates",
            method: "POST",
            token,
            body
          })
        }
      } else {
        const when = payload.scheduledAt instanceof Date ? payload.scheduledAt : new Date()
        if (Number.isNaN(when.getTime())) {
          Alert.alert(t("common.hint"), t("reminders.invalidTime"))
          setSaving(false)
          return
        }
        const body = {
          category: payload.category || toReminderCatCode(form.category),
          content,
          contentKey: resolveCarePresetKey({ text: content }) || "",
          time: when.toISOString(),
          note,
          sourceLang: lang
        }
        if (editing?.type === "once" && editing.id) {
          await apiRequest({
            apiBaseUrl,
            path: `/family/reminders/${encodeURIComponent(editing.id)}`,
            method: "PATCH",
            token,
            body
          })
        } else {
          await apiRequest({
            apiBaseUrl,
            path: "/family/reminders",
            method: "POST",
            token,
            body
          })
        }
      }
      setModalOpen(false)
      setEditing(null)
      await load({ silent: true })
    } catch (err) {
      Alert.alert(t("common.error"), err.message || t("common.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (kind, item) => {
    const label = item.content || ""
    Alert.alert(t("common.confirmDelete"), t("reminders.confirmDeleteMsg", { label }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          try {
            const path =
              kind === "repeat"
                ? `/family/task-templates/${encodeURIComponent(item._id)}`
                : `/family/reminders/${encodeURIComponent(item._id)}`
            await apiRequest({ apiBaseUrl, path, method: "DELETE", token })
            await load({ silent: true })
          } catch (err) {
            Alert.alert(t("common.error"), err.message || t("common.deleteFailed"))
          }
        }
      }
    ])
  }

  const toggleWeekday = (day) => {
    setForm((prev) => {
      const cur = Array.isArray(prev.weekdays) ? prev.weekdays : []
      const weekdays = cur.includes(day)
        ? cur.filter((d) => d !== day)
        : [...cur, day].sort()
      return { ...prev, weekdays }
    })
  }

  const renderTodayItem = ({ item }) => {
    const done = item.isCompleted
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.badge, item.kind === "repeat" ? styles.badgeGreen : null]}>
            <Text style={[styles.badgeText, item.kind === "repeat" ? styles.badgeGreenText : null]}>
              {reminderCatLabel(item.category, t)} · {item.kind === "repeat" ? t("reminders.repeatShort") : t("reminders.onceShort")}
            </Text>
          </View>
          <View style={[styles.statusBadge, done ? styles.statusDone : styles.statusPending]}>
            <Text style={styles.statusText}>{done ? t("common.done") : t("common.pending")}</Text>
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
            notePrefix={`${t("common.note")}：`}
          />
        ) : null}
        <Text style={styles.timeText}>{item.timeLabel}</Text>
      </View>
    )
  }

  const renderManageOnce = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{reminderCatLabel(item.category, t)} · {t("reminders.onceShort")}</Text>
        </View>
        <View style={[styles.statusBadge, item.isCompleted ? styles.statusDone : styles.statusPending]}>
          <Text style={styles.statusText}>{item.isCompleted ? t("common.done") : t("common.pending")}</Text>
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
          notePrefix={`${t("common.note")}：`}
        />
      ) : null}
      <Text style={styles.timeText}>{formatReminderTime(item.time)}</Text>
      <View style={styles.actionRow}>
        <Pressable style={styles.editBtn} onPress={() => openEditOnce(item)}>
          <Text style={styles.editBtnText}>{t("common.edit")}</Text>
        </Pressable>
        <Pressable style={styles.deleteBtn} onPress={() => handleDelete("once", item)}>
          <Text style={styles.deleteBtnText}>{t("common.delete")}</Text>
        </Pressable>
      </View>
    </View>
  )

  const renderManageRepeat = ({ item }) => (
    <View style={[styles.card, styles.cardRepeat]}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, styles.badgeGreen]}>
          <Text style={[styles.badgeText, styles.badgeGreenText]}>
            {reminderCatLabel(item.category, t)} · {t("reminders.repeatShort")}
          </Text>
        </View>
        <View style={styles.statusRepeat}>
          <Text style={styles.statusRepeatText}>{weekdayLabel(item.weekdays, t, lang)}</Text>
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
          notePrefix={`${t("common.note")}：`}
        />
      ) : null}
      <Text style={styles.timeText}>{t("reminders.dailyAt", { time: item.time || "--:--" })}</Text>
      <View style={styles.actionRow}>
        <Pressable style={[styles.editBtn, styles.editBtnGreen]} onPress={() => openEditRepeat(item)}>
          <Text style={[styles.editBtnText, styles.editBtnGreenText]}>{t("common.edit")}</Text>
        </Pressable>
        <Pressable style={styles.deleteBtn} onPress={() => handleDelete("repeat", item)}>
          <Text style={styles.deleteBtnText}>{t("common.delete")}</Text>
        </Pressable>
      </View>
    </View>
  )

  const manageData = useMemo(() => {
    const startToday = new Date()
    startToday.setHours(0, 0, 0, 0)
    // 提醒設定＝可編輯的「規則／未完成」：不堆過去已完成單次
    const onceRows = onceList
      .filter((r) => {
        if (!r.isCompleted) return true
        const t = r.time ? new Date(r.time) : null
        if (!t || Number.isNaN(t.getTime())) return false
        return t >= startToday
      })
      .map((r) => ({ ...r, _row: "once" }))
    const tplRows = templates.map((r) => ({ ...r, _row: "repeat" }))
    return [...onceRows, ...tplRows]
  }, [onceList, templates])

  return (
    <View style={styles.container}>
      {page === "doneHistory" ? (
        <ReminderCompletedHistory
          apiBaseUrl={apiBaseUrl}
          token={token}
          role="family"
          days={7}
          onBack={() => setPage("today")}
        />
      ) : (
      <>
      <View style={styles.pageHead}>
        <View style={styles.pageHeadText}>
          <Text style={styles.pageTitle}>{t("hub.todoTitle")}</Text>
          <Text style={styles.pageSub}>{t("hub.todoSub")}</Text>
        </View>
        <Pressable style={styles.headAdd} onPress={openCreate} hitSlop={8}>
          <NeoIcon name="plus" size={18} color="#10B981" />
        </Pressable>
        <AvatarMark email={user?.email} size={36} apiBaseUrl={apiBaseUrl} token={token} />
      </View>
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, page === "today" ? styles.tabActive : null]}
          onPress={() => setPage("today")}
        >
          <Text style={[styles.tabText, page === "today" ? styles.tabTextActive : null]}>{t("reminders.todayTodos")}</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, page === "manage" ? styles.tabActive : null]}
          onPress={() => setPage("manage")}
        >
          <Text style={[styles.tabText, page === "manage" ? styles.tabTextActive : null]}>{t("reminders.manage")}</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, page === "careDaily" ? styles.tabActive : null]}
          onPress={() => setPage("careDaily")}
        >
          <Text style={[styles.tabText, page === "careDaily" ? styles.tabTextActive : null]}>{t("reminders.careDaily")}</Text>
        </Pressable>
      </View>

      {page === "careDaily" ? (
        <CareDailyRecordsScreen apiBaseUrl={apiBaseUrl} token={token} role="family" />
      ) : error ? <Text style={styles.error}>{error}</Text> : null}

      {page === "careDaily" ? null : page === "today" ? (
        <View style={styles.flex}>
          <View style={styles.summary}>
            <Text style={styles.summaryMeta}>
              {t("reminders.doneCount")} <Text style={styles.summaryDone}>{doneToday}</Text> / {todayTodos.length}
            </Text>
            <Pressable style={styles.historyLink} onPress={() => setPage("doneHistory")}>
              <Text style={styles.historyLinkText}>{t("reminders.completedHistory")} ›</Text>
            </Pressable>
          </View>
          {loading ? (
            <ActivityIndicator color={colors.pine} style={{ marginTop: 28 }} />
          ) : (
            <NewTodoScreen
              tab="today"
              hideTabs
              apiBaseUrl={apiBaseUrl}
              token={token}
              todos={todayTodos.map((item) => ({
                id: item.key,
                title: item.content || t("reminders.item"),
                content: item.content || "",
                contentKey: item.contentKey || item.raw?.contentKey || "",
                sourceLang: item.sourceLang || item.raw?.sourceLang || "",
                time: item.sortKey || item.timeLabel,
                done: Boolean(item.isCompleted),
                isCompleted: Boolean(item.isCompleted),
                kind: item.kind === "repeat" ? "template" : "reminder",
                templateId: item.kind === "repeat" ? String(item.raw?._id || "") : undefined,
                slot: item.raw?.slot || item.sortKey,
                category: toReminderCatCode(item.category),
                createdByRole: item.createdByRole || item.raw?.createdByRole || "",
                createdByName: item.createdByName || item.raw?.createdByName || "",
                completedClock: formatGivenAt(item.raw?.givenAt || item.raw?.completedAt),
                givenAt: item.raw?.givenAt || null,
                marNote: item.raw?.marNote || item.note || "",
                marStatus: item.raw?.marStatus || "",
                reportExtra: item.raw?.reportExtra || {}
              }))}
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                load()
              }}
              onOpenSlot={(slot, group) => {
                setMarOpen({
                  task: {
                    ...slot,
                    title: group?.content || group?.title || slot.content || slot.title,
                    content: group?.content || slot.content || slot.title,
                    contentKey: slot.contentKey || group?.contentKey || "",
                    sourceLang: slot.sourceLang || group?.sourceLang || "",
                    done: slot.done
                  },
                  slotLabel: slot.slotKey && slot.slotKey !== "once" ? t(`mar.${slot.slotKey}`) : ""
                })
              }}
              onOpenSingle={(item) => {
                setMarOpen({
                  task: {
                    ...item,
                    title: item.content || item.title,
                    content: item.content || item.title,
                    sourceLang: item.sourceLang || "",
                    done: item.done
                  },
                  slotLabel: ""
                })
              }}
            />
          )}
        </View>
      ) : (
        <View style={styles.flex}>
          <Pressable style={styles.addBtn} onPress={openCreate}>
            <Text style={styles.addBtnText}>{t("reminders.add")}</Text>
          </Pressable>
          {loading ? (
            <ActivityIndicator color={colors.pine} style={{ marginTop: 28 }} />
          ) : (
            <FlatList
              data={manageData}
              keyExtractor={(item) => `${item._row}-${item._id}`}
              renderItem={({ item }) =>
                item._row === "repeat" ? renderManageRepeat({ item }) : renderManageOnce({ item })
              }
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
              ListEmptyComponent={<Text style={styles.empty}>{t("reminders.emptyManage")}</Text>}
            />
          )}
        </View>
      )}

      <AddCareTaskModal
        visible={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        saving={saving}
        initial={editing ? {
          kind: form.kind,
          contentText: form.contentText,
          extraTimes: form.extraTimes,
          scheduledAt: form.scheduledAt,
          note: form.note || "",
          lockKind: true
        } : { kind: "repeat" }}
      />
      <MarDoseSheet
        visible={Boolean(marOpen?.task)}
        task={marOpen?.task || null}
        slotLabel={marOpen?.slotLabel || ""}
        patientName={user?.linkedPatientName || user?.activePatientName || user?.patientName || ""}
        submitting={false}
        readOnly
        apiBaseUrl={apiBaseUrl}
        token={token}
        onClose={() => setMarOpen(null)}
      />
      </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  pageHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 10
  },
  pageHeadText: { flex: 1 },
  pageTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  pageSub: { color: "#8E95A3", fontSize: 13, marginTop: 4 },
  headAdd: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.45)",
    backgroundColor: "rgba(16,185,129,0.12)",
    alignItems: "center",
    justifyContent: "center"
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.pine },
  tabText: { fontSize: 15, color: colors.textMuted, fontWeight: "600" },
  tabTextActive: { color: colors.mint },
  summary: {
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  summaryMeta: { fontSize: 14, color: colors.textMuted },
  summaryDone: { color: colors.pine, fontWeight: "800", fontSize: 17 },
  historyLink: { marginTop: 10, alignSelf: "flex-start" },
  historyLinkText: { color: colors.pine, fontWeight: "700", fontSize: 14 },
  addBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: colors.mint,
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: "center"
  },
  addBtnText: { color: colors.bg, fontSize: 16, fontWeight: "700" },
  listPad: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderCurve: "continuous",
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border
  },
  cardRepeat: { borderLeftWidth: 4, borderLeftColor: colors.pine },
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
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusDone: { backgroundColor: colors.mintSoft },
  statusPending: { backgroundColor: "rgba(245,158,11,0.18)" },
  statusText: { fontSize: 12, fontWeight: "600", color: colors.text },
  statusRepeat: {
    backgroundColor: colors.mintSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  statusRepeatText: { fontSize: 12, fontWeight: "600", color: colors.mint },
  content: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 6 },
  noteText: { fontSize: 13, color: colors.textMuted, marginBottom: 6 },
  timeText: { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  noteInput: { minHeight: 72, paddingTop: 12 },
  actionRow: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  editBtn: {
    borderWidth: 1,
    borderColor: colors.pine,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  editBtnGreen: { borderColor: colors.pine, backgroundColor: colors.mintSoft },
  editBtnText: { color: colors.mint, fontWeight: "600" },
  editBtnGreenText: { color: colors.mint },
  deleteBtn: {
    borderWidth: 1,
    borderColor: "#ff4d4f",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  deleteBtnText: { color: "#ff4d4f", fontWeight: "600" },
  empty: { textAlign: "center", marginTop: 48, color: colors.textMuted, fontSize: 15 },
  error: { color: "#E05A47", marginHorizontal: 16, marginTop: 8 },
  modalRoot: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  modalClose: { color: colors.mint, fontWeight: "600", width: 40 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  modalBody: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: "700", color: colors.textMuted, marginBottom: 8, marginTop: 12 },
  slotHint: { fontSize: 12, color: colors.textMuted, fontWeight: "500", marginTop: 8, marginBottom: 4 },
  typeRow: { flexDirection: "row", gap: 10 },
  typeChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.card
  },
  typeChipOn: { borderColor: colors.pine, backgroundColor: colors.mintSoft },
  typeChipOnGreen: { borderColor: colors.pine, backgroundColor: colors.mintSoft },
  typeChipText: { fontWeight: "700", color: colors.textMuted },
  typeChipTextOn: { color: colors.mint },
  typeChipTextOnGreen: { color: colors.mint },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card
  },
  chipActive: { backgroundColor: colors.mintSoft, borderColor: colors.pine },
  chipActiveGreen: { backgroundColor: colors.mintSoft, borderColor: colors.pine },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.mint },
  chipTextActiveGreen: { color: colors.mint },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: colors.card,
    color: colors.text
  },
  presetBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.mintSoft,
    borderWidth: 1,
    borderColor: colors.border
  },
  presetBtnText: { color: colors.mint, fontWeight: "700", fontSize: 13 },
  saveBtn: {
    marginTop: 24,
    backgroundColor: colors.mint,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.bg, fontSize: 16, fontWeight: "700" }
})
