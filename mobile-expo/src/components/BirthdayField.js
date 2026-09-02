import { useEffect, useMemo, useState } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { useI18n } from "../i18n/I18nContext"
import { WheelColumn } from "./DateTimeField"
import { colors } from "../screens/new_ui/tokens"

const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: THIS_YEAR - 1904 }, (_, i) => THIS_YEAR - i)
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

function pad2(n) {
  return String(n).padStart(2, "0")
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

export function parseBirthYmd(value) {
  const m = String(value || "").trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1) return null
  const maxDay = daysInMonth(year, month)
  if (day > maxDay) return null
  return { year, month, day }
}

export function formatBirthYmd(parts) {
  if (!parts) return ""
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
}

export function ageFromBirthYmd(value, now = new Date()) {
  const parts = typeof value === "string" ? parseBirthYmd(value) : value
  if (!parts) return null
  let age = now.getFullYear() - parts.year
  const month = now.getMonth() + 1
  const day = now.getDate()
  if (month < parts.month || (month === parts.month && day < parts.day)) age -= 1
  if (age < 0 || age > 130) return null
  return age
}

function defaultDraft(value) {
  return parseBirthYmd(value) || { year: 1950, month: 1, day: 1 }
}

/** 生日：點開底部三欄滾輪（年／月／日），與常見 App 設定頁相同 */
export default function BirthdayField({ label, value, onChange }) {
  const { t } = useI18n()
  const parsed = parseBirthYmd(value)
  const [open, setOpen] = useState(false)
  const [draftY, setDraftY] = useState(defaultDraft(value).year)
  const [draftM, setDraftM] = useState(defaultDraft(value).month)
  const [draftD, setDraftD] = useState(defaultDraft(value).day)

  useEffect(() => {
    if (open) return
    const next = defaultDraft(value)
    setDraftY(next.year)
    setDraftM(next.month)
    setDraftD(next.day)
  }, [value, open])

  const dayItems = useMemo(() => {
    const max = daysInMonth(draftY, draftM)
    return Array.from({ length: max }, (_, i) => i + 1)
  }, [draftY, draftM])

  useEffect(() => {
    const max = daysInMonth(draftY, draftM)
    if (draftD > max) setDraftD(max)
  }, [draftY, draftM, draftD])

  const openSheet = () => {
    const next = defaultDraft(value)
    setDraftY(next.year)
    setDraftM(next.month)
    setDraftD(next.day)
    setOpen(true)
  }

  const confirm = () => {
    const max = daysInMonth(draftY, draftM)
    const day = Math.min(draftD, max)
    onChange(formatBirthYmd({ year: draftY, month: draftM, day }))
    setOpen(false)
  }

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.chip} onPress={openSheet}>
        <Text style={[styles.chipValue, parsed ? null : styles.chipPlaceholder]}>
          {parsed ? formatBirthYmd(parsed) : t("profile.pickBirth")}
        </Text>
        <Text style={styles.chipChevron}>▼</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheetMask}>
          <Pressable style={styles.sheetDismiss} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHead}>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <Text style={styles.sheetCancel}>{t("common.cancel")}</Text>
              </Pressable>
              <Text style={styles.sheetTitle}>{t("profile.birthDate")}</Text>
              <Pressable onPress={confirm} hitSlop={8}>
                <Text style={styles.sheetDone}>{t("common.apply")}</Text>
              </Pressable>
            </View>
            <View style={styles.alarmRow}>
              <View style={styles.alarmCol}>
                <Text style={styles.alarmCaption}>{t("profile.year")}</Text>
                <WheelColumn
                  items={YEARS}
                  value={draftY}
                  onChange={setDraftY}
                  formatItem={(n) => String(n)}
                />
              </View>
              <View style={styles.alarmCol}>
                <Text style={styles.alarmCaption}>{t("profile.month")}</Text>
                <WheelColumn items={MONTHS} value={draftM} onChange={setDraftM} />
              </View>
              <View style={styles.alarmCol}>
                <Text style={styles.alarmCaption}>{t("profile.day")}</Text>
                <WheelColumn items={dayItems} value={Math.min(draftD, dayItems.length)} onChange={setDraftD} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  label: { color: "#101828", fontWeight: "800", fontSize: 14, marginTop: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 12,
    borderCurve: "continuous",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48
  },
  chipValue: { fontSize: 16, fontWeight: "700", color: "#101828" },
  chipPlaceholder: { color: "#98a2b3", fontWeight: "600" },
  chipChevron: { fontSize: 12, color: "#98a2b3", fontWeight: "700" },
  sheetMask: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  sheetDismiss: { flex: 1 },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 28,
    paddingHorizontal: 16
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    marginTop: 10,
    marginBottom: 8
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginBottom: 4
  },
  sheetCancel: { fontSize: 16, color: "#6b7280", fontWeight: "600", minWidth: 48 },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  sheetDone: { fontSize: 16, color: colors.pine, fontWeight: "800", minWidth: 48, textAlign: "right" },
  alarmRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4
  },
  alarmCol: { alignItems: "center" },
  alarmCaption: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6b7280",
    marginBottom: 4
  }
})
