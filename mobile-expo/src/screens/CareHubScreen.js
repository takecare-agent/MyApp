import { useEffect, useState } from "react"
import { Alert, Pressable, StyleSheet, Text, View } from "react-native"
import { AvatarMark } from "../components/AvatarMark"
import FamilyRemindersScreen from "./FamilyRemindersScreen"
import CaregiverTodayRemindersScreen from "./CaregiverTodayRemindersScreen"
import CareDailyRecordsScreen from "./CareDailyRecordsScreen"
import { useI18n } from "../i18n/I18nContext"
import { apiRequest } from "../lib/api"
import { resolveCarePresetKey } from "../lib/presetResolve"
import { USE_MORANDI_UI } from "./new_ui/flag"
import { colors } from "./new_ui/tokens"
import { NeoIcon } from "./new_ui/NeoIcons"
import NewTodoScreen from "./new_ui/NewTodoScreen"
import AddCareTaskModal from "./new_ui/AddCareTaskModal"

function SegmentChips({ options, value, onChange }) {
  return (
    <View style={styles.segRow}>
      {options.map((opt) => {
        const active = opt.id === value
        return (
          <Pressable
            key={opt.id}
            style={[styles.segChip, active ? styles.segChipActive : null]}
            onPress={() => onChange(opt.id)}
          >
            <Text style={[styles.segChipText, active ? styles.segChipTextActive : null]}>{opt.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export default function CareHubScreen({ apiBaseUrl, token, role, user, initialSeg }) {
  const { t, lang } = useI18n()
  const [seg, setSeg] = useState(initialSeg === "diary" ? "diary" : "today")
  const [addOpen, setAddOpen] = useState(false)
  const [savingAdd, setSavingAdd] = useState(false)
  const [addTick, setAddTick] = useState(0)

  useEffect(() => {
    if (initialSeg === "diary" || initialSeg === "today") setSeg(initialSeg)
  }, [initialSeg])

  const handleAddSave = async (payload) => {
    const content = String(payload.content || "").trim()
    if (!content) {
      Alert.alert(t("common.hint"), t("mar.needTitle"))
      return
    }
    setSavingAdd(true)
    try {
      if (payload.kind === "repeat") {
        const extraTimes = Array.isArray(payload.extraTimes) ? payload.extraTimes.filter(Boolean) : []
        await apiRequest({
          apiBaseUrl,
          path: "/caregiver/task-templates",
          method: "POST",
          token,
          body: {
            category: payload.category,
            content,
            contentKey: resolveCarePresetKey({ text: content }) || "",
            time: extraTimes[0] || "08:00",
            times: extraTimes.slice(1),
            weekdays: [],
            note: String(payload.note || "").trim(),
            sourceLang: lang
          }
        })
      } else {
        const when = payload.scheduledAt instanceof Date ? payload.scheduledAt : new Date()
        await apiRequest({
          apiBaseUrl,
          path: "/caregiver/reminders",
          method: "POST",
          token,
          body: {
            category: payload.category,
            content,
            contentKey: resolveCarePresetKey({ text: content }) || "",
            time: when.toISOString(),
            note: String(payload.note || "").trim(),
            sourceLang: lang
          }
        })
      }
      setAddOpen(false)
      setAddTick((n) => n + 1)
    } catch (err) {
      Alert.alert(t("common.error"), err.message || t("common.saveFailed"))
    } finally {
      setSavingAdd(false)
    }
  }

  if (role === "family") {
    return <FamilyRemindersScreen apiBaseUrl={apiBaseUrl} token={token} user={user} />
  }

  return (
    <View style={[styles.root, USE_MORANDI_UI ? styles.rootMorandi : null]}>
      <View style={styles.pageHead}>
        <View style={styles.pageHeadText}>
          <Text style={styles.pageTitle}>{t("hub.todoTitle")}</Text>
          <Text style={styles.pageSub}>{t("hub.todoSub")}</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => setAddOpen(true)} hitSlop={8}>
          <NeoIcon name="plus" size={18} color="#10B981" />
        </Pressable>
        <AvatarMark email={user?.email} size={36} apiBaseUrl={apiBaseUrl} token={token} />
      </View>
      {USE_MORANDI_UI ? (
        <NewTodoScreen
          tab={seg}
          onChangeTab={(id) => setSeg(id === "diary" ? "diary" : "today")}
          tabsOnly
        />
      ) : (
        <SegmentChips
          options={[
            { id: "today", label: t("reminders.todayTodos") },
            { id: "diary", label: t("reminders.careDaily") }
          ]}
          value={seg}
          onChange={setSeg}
        />
      )}
      {seg === "diary" ? (
        <CareDailyRecordsScreen apiBaseUrl={apiBaseUrl} token={token} role="caregiver" />
      ) : (
        <CaregiverTodayRemindersScreen
          apiBaseUrl={apiBaseUrl}
          token={token}
          user={user}
          reloadToken={addTick}
        />
      )}
      <AddCareTaskModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleAddSave}
        saving={savingAdd}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rootMorandi: { backgroundColor: colors.bg },
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
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.45)",
    backgroundColor: "rgba(16,185,129,0.12)",
    alignItems: "center",
    justifyContent: "center"
  },
  segRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  segChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 36,
    justifyContent: "center"
  },
  segChipActive: { backgroundColor: colors.pine, borderColor: colors.pine },
  segChipText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  segChipTextActive: { color: "#0D0F11" }
})
