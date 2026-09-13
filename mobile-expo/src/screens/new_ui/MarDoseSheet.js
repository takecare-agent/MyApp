import { useEffect, useState } from "react"
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { useI18n } from "../../i18n/I18nContext"
import TranslatedUgcText from "../../components/TranslatedUgcText"
import { creatorLabel, formatGivenAt, iconForTask, nowHhmm, reportKind } from "../../lib/marGroups"
import { NeoIcon } from "./NeoIcons"
import TimePickSheet from "./TimePickSheet"

const STATUSES = [
  { id: "done", labelKey: "mar.statusDone" },
  { id: "not_done", labelKey: "mar.statusNotDone" }
]

function extraFromTask(task) {
  const src = task?.reportExtra && typeof task.reportExtra === "object" ? task.reportExtra : {}
  return {
    temp: String(src.temp || ""),
    bpSys: String(src.bpSys || ""),
    bpDia: String(src.bpDia || ""),
    hr: String(src.hr || ""),
    glucose: String(src.glucose || "")
  }
}

export default function MarDoseSheet({
  visible,
  onClose,
  onConfirm,
  submitting,
  apiBaseUrl,
  token,
  task,
  slotLabel,
  patientName,
  readOnly = false,
  allowEdit = false
}) {
  const { t } = useI18n()
  const [givenAt, setGivenAt] = useState(nowHhmm())
  const [status, setStatus] = useState("done")
  const [note, setNote] = useState("")
  const [extra, setExtra] = useState(extraFromTask(null))
  const [timeOpen, setTimeOpen] = useState(false)

  useEffect(() => {
    if (!visible) return
    const done = Boolean(task?.isCompleted || task?.done)
    setGivenAt(formatGivenAt(task?.givenAt || task?.completedAt) || nowHhmm())
    setStatus(done ? "done" : (readOnly || task?.marStatus === "not_done" ? "not_done" : "done"))
    setNote(String(task?.marNote || task?.note || ""))
    setExtra(extraFromTask(task))
    setTimeOpen(false)
  }, [visible, task?.id, readOnly])

  const kind = reportKind(task)
  const alreadyDone = Boolean(task?.isCompleted || task?.done)
  const locked = Boolean(readOnly) || (alreadyDone && !allowEdit)
  const icon = iconForTask(task)
  const titleText = String(task?.content || task?.title || "").trim()
  const scheduled = task?.time || "--:--"
  const metaPatient = patientName
    ? t("mar.metaLine", { time: scheduled, patient: patientName })
    : t("mar.metaTimeOnly", { time: scheduled })
  const whoCreated = creatorLabel(task, t)

  const setField = (key, value) => {
    setExtra((prev) => ({ ...prev, [key]: value }))
  }

  const confirm = () => {
    if (locked) {
      onClose && onClose()
      return
    }
    if (status === "done") {
      if (kind === "temp" && !String(extra.temp).trim()) {
        Alert.alert(t("common.hint"), t("mar.needTemp"))
        return
      }
      if (kind === "bp" && (!String(extra.bpSys).trim() || !String(extra.bpDia).trim())) {
        Alert.alert(t("common.hint"), t("mar.needBp"))
        return
      }
      if (kind === "hr" && !String(extra.hr).trim()) {
        Alert.alert(t("common.hint"), t("mar.needHr"))
        return
      }
      if (kind === "glucose" && !String(extra.glucose).trim()) {
        Alert.alert(t("common.hint"), t("mar.needGlucose"))
        return
      }
    }
    onConfirm && onConfirm({
      givenAt,
      marStatus: status,
      marNote: note,
      reportExtra: extra
    })
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.mask}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.body}
          >
            <View style={styles.headRow}>
              <View style={styles.iconWell}>
                <NeoIcon name={icon} size={22} color="#10B981" />
              </View>
              <View style={styles.headText}>
                <TranslatedUgcText
                  text={titleText}
                  sourceLang={task?.sourceLang}
                  contentKey={task?.contentKey}
                  apiBaseUrl={apiBaseUrl}
                  token={token}
                  compact
                  numberOfLines={2}
                  style={styles.title}
                />
                {slotLabel ? <Text style={styles.meta}>{slotLabel}</Text> : null}
                <Text style={styles.meta}>{metaPatient}</Text>
                <Text style={styles.meta}>{whoCreated}</Text>
              </View>
            </View>

            <Text style={styles.label}>{t("mar.actualCareTime")}</Text>
            <Pressable
              style={styles.timeRow}
              onPress={() => {
                if (locked) return
                setTimeOpen(true)
              }}
            >
              <NeoIcon name="clock" size={18} color="#10B981" />
              <Text style={styles.timeValue}>{formatGivenAt(givenAt)}</Text>
              {locked ? null : <NeoIcon name="chevron-right" size={18} color="#6C727A" />}
            </Pressable>

            {kind === "temp" ? (
              <>
                <Text style={styles.label}>{t("mar.fieldTemp")}</Text>
                <View style={styles.measureRow}>
                  <TextInput
                    style={styles.measureInput}
                    value={extra.temp}
                    onChangeText={(v) => setField("temp", v)}
                    keyboardType="decimal-pad"
                    editable={!locked}
                  />
                  <Text style={styles.unit}>℃</Text>
                </View>
              </>
            ) : null}

            {kind === "bp" ? (
              <>
                <Text style={styles.label}>{t("mar.fieldBp")}</Text>
                <View style={styles.bpRow}>
                  <TextInput
                    style={[styles.measureInput, styles.bpInput]}
                    value={extra.bpSys}
                    onChangeText={(v) => setField("bpSys", v)}
                    keyboardType="number-pad"
                    editable={!locked}
                  />
                  <Text style={styles.unit}>/</Text>
                  <TextInput
                    style={[styles.measureInput, styles.bpInput]}
                    value={extra.bpDia}
                    onChangeText={(v) => setField("bpDia", v)}
                    keyboardType="number-pad"
                    editable={!locked}
                  />
                  <Text style={styles.unit}>mmHg</Text>
                </View>
              </>
            ) : null}

            {kind === "hr" ? (
              <>
                <Text style={styles.label}>{t("mar.fieldHr")}</Text>
                <View style={styles.measureRow}>
                  <TextInput
                    style={styles.measureInput}
                    value={extra.hr}
                    onChangeText={(v) => setField("hr", v)}
                    keyboardType="number-pad"
                    editable={!locked}
                  />
                  <Text style={styles.unit}>{t("mar.unitBpm")}</Text>
                </View>
              </>
            ) : null}

            {kind === "glucose" ? (
              <>
                <Text style={styles.label}>{t("mar.fieldGlucose")}</Text>
                <View style={styles.measureRow}>
                  <TextInput
                    style={styles.measureInput}
                    value={extra.glucose}
                    onChangeText={(v) => setField("glucose", v)}
                    keyboardType="decimal-pad"
                    editable={!locked}
                  />
                  <Text style={styles.unit}>mg/dL</Text>
                </View>
              </>
            ) : null}

            <Text style={styles.label}>{t("mar.careStatus")}</Text>
            <View style={styles.statusRow}>
              {STATUSES.map((s) => {
                const on = status === s.id
                return (
                  <Pressable
                    key={s.id}
                    style={[styles.statusChip, on ? styles.statusChipOn : null]}
                    onPress={() => {
                      if (locked) return
                      setStatus(s.id)
                    }}
                  >
                    <Text style={[styles.statusText, on ? styles.statusTextOn : null]}>
                      {t(s.labelKey)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={styles.label}>{t("mar.note")}</Text>
            <TextInput
              style={styles.note}
              value={note}
              onChangeText={setNote}
              multiline
              textAlignVertical="top"
              editable={!locked}
            />

            <Pressable
              style={[styles.confirm, submitting ? styles.confirmOff : null]}
              onPress={confirm}
              disabled={!!submitting}
            >
              <Text style={styles.confirmText}>
                {locked ? t("common.close") : t("mar.confirm")}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      <TimePickSheet
        visible={timeOpen}
        value={givenAt}
        onClose={() => setTimeOpen(false)}
        onConfirm={(hh) => {
          setGivenAt(hh)
          setTimeOpen(false)
        }}
      />
    </Modal>
  )
}

const styles = StyleSheet.create({
  mask: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: "#16181D",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    maxHeight: "92%",
    borderCurve: "continuous"
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginTop: 10
  },
  body: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 28, gap: 10 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(16,185,129,0.15)",
    alignItems: "center",
    justifyContent: "center"
  },
  headText: { flex: 1 },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  meta: { color: "#8E95A3", fontSize: 12, marginTop: 4 },
  label: { color: "#C5CAD3", fontSize: 13, fontWeight: "700", marginTop: 6 },
  timeRow: {
    backgroundColor: "#13151A",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  timeValue: { flex: 1, color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  measureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#13151A",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  measureInput: {
    flex: 1,
    height: 48,
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700"
  },
  bpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  bpInput: {
    flex: 1,
    height: 48,
    backgroundColor: "#13151A",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  unit: { color: "#8E95A3", fontSize: 14, fontWeight: "700" },
  statusRow: { flexDirection: "row", gap: 8 },
  statusChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#121418",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  statusChipOn: {
    backgroundColor: "#162920",
    borderColor: "rgba(16,185,129,0.7)"
  },
  statusText: { color: "#8E95A3", fontSize: 15, fontWeight: "700" },
  statusTextOn: { color: "#FFFFFF" },
  note: {
    minHeight: 88,
    backgroundColor: "#101215",
    borderRadius: 12,
    padding: 16,
    color: "#FFFFFF",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  confirm: {
    height: 56,
    borderRadius: 16,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8
  },
  confirmOff: { opacity: 0.55 },
  confirmText: { color: "#0B0D0E", fontSize: 17, fontWeight: "900" }
})
