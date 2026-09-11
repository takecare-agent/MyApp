import { useEffect, useState } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { WheelColumn } from "../../components/DateTimeField"
import { useI18n } from "../../i18n/I18nContext"
import { pad2 } from "../../lib/marGroups"

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)

export default function TimePickSheet({ visible, value, onClose, onConfirm, title }) {
  const { t } = useI18n()
  const [h, setH] = useState(12)
  const [m, setM] = useState(0)

  useEffect(() => {
    if (!visible) return
    const raw = String(value || "12:00")
    const [hh, mm] = raw.split(":")
    setH(Math.max(0, Math.min(23, Number(hh) || 0)))
    setM(Math.max(0, Math.min(59, Number(mm) || 0)))
  }, [visible, value])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.mask}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.cancel}>{t("common.cancel")}</Text>
            </Pressable>
            <Text style={styles.title}>{title || t("datetime.setTime")}</Text>
            <Pressable onPress={() => onConfirm && onConfirm(`${pad2(h)}:${pad2(m)}`)} hitSlop={8}>
              <Text style={styles.done}>{t("datetime.done")}</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.cap}>{t("datetime.hour")}</Text>
              <WheelColumn items={HOURS} value={h} onChange={setH} />
            </View>
            <Text style={styles.colon}>:</Text>
            <View style={styles.col}>
              <Text style={styles.cap}>{t("datetime.minute")}</Text>
              <WheelColumn items={MINUTES} value={m} onChange={setM} />
            </View>
          </View>
          <Text style={styles.preview}>{pad2(h)}:{pad2(m)}</Text>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  mask: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: "#16181D",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 28,
    borderCurve: "continuous"
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginTop: 10
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  cancel: { color: "#8E95A3", fontWeight: "700", fontSize: 16 },
  title: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  done: { color: "#10B981", fontWeight: "800", fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  col: { alignItems: "center" },
  cap: { color: "#8E95A3", fontSize: 12, marginBottom: 6 },
  colon: { color: "#FFFFFF", fontSize: 28, fontWeight: "800", marginTop: 18 },
  preview: { textAlign: "center", color: "#10B981", fontSize: 22, fontWeight: "800", marginTop: 8 }
})
