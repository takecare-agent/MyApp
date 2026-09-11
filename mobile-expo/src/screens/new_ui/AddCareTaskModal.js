import { useEffect, useState } from "react"
import {
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
import { inferCategory, nowHhmm } from "../../lib/marGroups"
import DateTimeField from "../../components/DateTimeField"
import { NeoIcon } from "./NeoIcons"
import TimePickSheet from "./TimePickSheet"
import { colors } from "./tokens"

const TPL = {
  daily: ["08:00"],
  meals: ["08:00", "12:30", "18:30"],
  twice: ["08:00", "18:30"],
  bed: ["21:00"]
}

const TPL_LABELS = [
  { id: "daily", key: "mar.tplDaily" },
  { id: "meals", key: "mar.tplMeals" },
  { id: "twice", key: "mar.tplTwice" },
  { id: "bed", key: "mar.tplBed" }
]

const SLOT_ICONS = {
  daily: ["clock"],
  meals: ["sunrise", "sun", "moon"],
  twice: ["sunrise", "moon"],
  bed: ["moon"]
}

function matchTpl(times) {
  const arr = (times || []).slice().sort()
  const joined = arr.join(",")
  if (joined === TPL.meals.join(",")) return "meals"
  if (joined === TPL.twice.join(",")) return "twice"
  if (arr.length >= 3) return "meals"
  if (arr.length === 2) return "twice"
  if (arr[0] === "21:00") return "bed"
  return "daily"
}

function slotNameKey(tpl, idx) {
  if (tpl === "meals") {
    return ["mar.breakfast", "mar.lunch", "mar.dinner"][idx] || "mar.remindTime"
  }
  if (tpl === "twice") return idx === 0 ? "mar.morning" : "mar.evening"
  if (tpl === "bed") return "mar.bedtime"
  return "mar.remindTime"
}

export default function AddCareTaskModal({
  visible,
  onClose,
  onSave,
  saving,
  initial
}) {
  const { t } = useI18n()
  const [title, setTitle] = useState("")
  const [kind, setKind] = useState("repeat")
  const [tpl, setTpl] = useState("daily")
  const [times, setTimes] = useState(TPL.daily)
  const [onceAt, setOnceAt] = useState(() => new Date())
  const [note, setNote] = useState("")
  const [editIndex, setEditIndex] = useState(-1)
  const locked = Boolean(initial?.lockKind)

  useEffect(() => {
    if (!visible) return
    const nextKind = initial?.kind === "once" ? "once" : "repeat"
    const extras = Array.isArray(initial?.extraTimes) ? initial.extraTimes.filter(Boolean) : []
    setTitle(initial?.contentText || "")
    setNote(initial?.note || "")
    setKind(nextKind)
    setOnceAt(initial?.scheduledAt instanceof Date ? initial.scheduledAt : new Date())
    if (nextKind === "repeat") {
      const nextTimes = extras.length ? extras.slice().sort() : TPL.daily
      setTimes(nextTimes)
      setTpl(matchTpl(nextTimes))
    } else {
      setTimes(TPL.daily)
      setTpl("daily")
    }
    setEditIndex(-1)
  }, [visible])

  const applyTpl = (id) => {
    setTpl(id)
    setTimes(TPL[id] || TPL.daily)
  }

  const save = () => {
    const content = String(title || "").trim()
    if (!content) return
    onSave && onSave({
      kind,
      content,
      category: inferCategory(kind, content),
      extraTimes: kind === "repeat" ? times : [],
      scheduledAt: kind === "once" ? onceAt : new Date(),
      note: String(note || "").trim()
    })
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.topBar}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.backBtn}>
            <NeoIcon name="chevron-left" size={18} color="#10B981" />
            <Text style={styles.cancel}>{t("common.cancel")}</Text>
          </Pressable>
          <Text style={styles.navTitle}>{t("mar.addTitle")}</Text>
          <View style={styles.navSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.label}>{t("mar.taskName")}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>{t("mar.note")}</Text>
            <TextInput
              style={styles.note}
              value={note}
              onChangeText={setNote}
              multiline
              textAlignVertical="top"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>{t("mar.freq")}</Text>
            <View style={styles.seg}>
              <Pressable
                style={[styles.segBtn, kind === "once" ? styles.freqFill : styles.segOff]}
                onPress={() => !locked && setKind("once")}
                disabled={locked}
              >
                <NeoIcon name="clock" size={16} color={kind === "once" ? "#0B0D0E" : "#8E95A3"} />
                <Text style={[styles.segText, kind === "once" ? styles.freqFillText : null]}>{t("mar.freqOnce")}</Text>
              </Pressable>
              <Pressable
                style={[styles.segBtn, kind === "repeat" ? styles.freqFill : styles.segOff]}
                onPress={() => !locked && setKind("repeat")}
                disabled={locked}
              >
                <NeoIcon name="refresh-cw" size={16} color={kind === "repeat" ? "#0B0D0E" : "#8E95A3"} />
                <Text style={[styles.segText, kind === "repeat" ? styles.freqFillText : null]}>{t("mar.freqRepeat")}</Text>
              </Pressable>
            </View>

            {kind === "repeat" ? (
              <>
                <Text style={[styles.label, styles.mt]}>{t("mar.templates")}</Text>
                <View style={styles.tplRow}>
                  {TPL_LABELS.map((item) => {
                    const on = tpl === item.id
                    return (
                      <Pressable
                        key={item.id}
                        style={[styles.tplChip, on ? styles.tplOn : null]}
                        onPress={() => applyTpl(item.id)}
                      >
                        <Text style={[styles.tplText, on ? styles.tplTextOn : null]} numberOfLines={1}>
                          {t(item.key)}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </>
            ) : (
              <View style={styles.mt}>
                <DateTimeField
                  label={t("mar.remindAt")}
                  mode="datetime"
                  value={onceAt}
                  onChange={setOnceAt}
                />
              </View>
            )}
          </View>

          {kind === "repeat" ? (
            <View style={styles.card}>
              <Text style={styles.label}>{t("mar.remindAt")}</Text>
              {times.map((hh, idx) => (
                <Pressable
                  key={`${hh}-${idx}`}
                  style={[styles.timeLine, idx === times.length - 1 ? styles.timeLineLast : null]}
                  onPress={() => setEditIndex(idx)}
                >
                  <NeoIcon name={(SLOT_ICONS[tpl] || SLOT_ICONS.daily)[idx] || "clock"} size={18} color="#10B981" />
                  <Text style={styles.timeName}>{t(slotNameKey(tpl, idx))}</Text>
                  <Text style={styles.timeVal}>{hh}</Text>
                  <NeoIcon name="edit-2" size={16} color="#6C727A" />
                </Pressable>
              ))}
            </View>
          ) : null}

          <Pressable
            style={[styles.create, saving || !String(title).trim() ? styles.createOff : null]}
            onPress={save}
            disabled={!!saving || !String(title).trim()}
          >
            <Text style={styles.createText}>{t("mar.create")}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
      <TimePickSheet
        visible={editIndex >= 0}
        value={times[editIndex] || nowHhmm()}
        onClose={() => setEditIndex(-1)}
        onConfirm={(hh) => {
          setTimes((prev) => prev.map((x, i) => (i === editIndex ? hh : x)))
          setEditIndex(-1)
        }}
      />
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: Platform.OS === "ios" ? 54 : 12,
    paddingBottom: 8
  },
  backBtn: { flexDirection: "row", alignItems: "center", minWidth: 72, gap: 2 },
  cancel: { color: "#10B981", fontSize: 16, fontWeight: "700" },
  navTitle: { flex: 1, textAlign: "center", color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  navSpacer: { minWidth: 72 },
  body: { padding: 16, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: "#16181D",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 14,
    gap: 10
  },
  label: { color: "#C5CAD3", fontSize: 13, fontWeight: "700" },
  mt: { marginTop: 6 },
  input: {
    backgroundColor: "#101215",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#FFFFFF",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  note: {
    minHeight: 88,
    backgroundColor: "#101215",
    borderRadius: 12,
    padding: 14,
    color: "#FFFFFF",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  seg: { flexDirection: "row", gap: 8 },
  segBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8
  },
  segOff: { borderColor: "rgba(255,255,255,0.1)", backgroundColor: "#121418" },
  freqFill: { backgroundColor: "#10B981", borderColor: "#10B981" },
  freqFillText: { color: "#0B0D0E", fontWeight: "800" },
  segText: { color: "#8E95A3", fontSize: 13, fontWeight: "700", flexShrink: 1 },
  tplRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tplChip: {
    width: "48%",
    flexGrow: 1,
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  tplOn: { backgroundColor: "#1B382B", borderColor: "rgba(16,185,129,0.45)" },
  tplText: { color: "#8E95A3", fontSize: 13, fontWeight: "700", textAlign: "center" },
  tplTextOn: { color: "#10B981" },
  timeLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)"
  },
  timeLineLast: { borderBottomWidth: 0, paddingBottom: 2 },
  timeName: { flex: 1, color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  timeVal: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  create: {
    height: 56,
    borderRadius: 999,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8
  },
  createOff: { opacity: 0.45 },
  createText: { color: "#0B0D0E", fontSize: 17, fontWeight: "900" }
})
