import { useEffect, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import CareCircleSearch from "../components/CareCircleSearch"
import FamilyRemindersScreen from "./FamilyRemindersScreen"
import CaregiverTodayRemindersScreen from "./CaregiverTodayRemindersScreen"
import CareDailyRecordsScreen from "./CareDailyRecordsScreen"
import { useI18n } from "../i18n/I18nContext"
import { USE_MORANDI_UI } from "./new_ui/flag"
import { colors } from "./new_ui/tokens"
import NewTodoScreen from "./new_ui/NewTodoScreen"

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

/** 看護／家屬「待辦」：一進來就是今日清單，日記摺在第二段 */
export default function CareHubScreen({ apiBaseUrl, token, role, initialSeg }) {
  const { t } = useI18n()
  const [seg, setSeg] = useState(initialSeg === "diary" ? "diary" : "today")

  useEffect(() => {
    if (initialSeg === "diary" || initialSeg === "today") setSeg(initialSeg)
  }, [initialSeg])

  if (role === "family") {
    return <FamilyRemindersScreen apiBaseUrl={apiBaseUrl} token={token} />
  }

  return (
    <View style={[styles.root, USE_MORANDI_UI ? styles.rootMorandi : null]}>
      <CareCircleSearch
        apiBaseUrl={apiBaseUrl}
        token={token}
        role={role}
        onOpenResult={(item) => {
          if (item?.type === "daily") setSeg("diary")
          else setSeg("today")
        }}
      />
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
          onWriteDaily={() => setSeg("diary")}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rootMorandi: { backgroundColor: colors.bg },
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
