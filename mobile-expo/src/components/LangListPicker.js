import { useState } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { LANG_OPTIONS } from "../i18n/languages"
import { NeoIcon } from "../screens/new_ui/NeoIcons"

export function langLabel(code) {
  return LANG_OPTIONS.find((x) => x.code === code)?.label || code
}

export function LangListModal({ visible, title, value, onPick, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <View style={styles.picker}>
          <Text style={styles.pickerTitle}>{title}</Text>
          {LANG_OPTIONS.map((item) => {
            const on = value === item.code
            return (
              <Pressable
                key={item.code}
                style={[styles.option, on ? styles.optionOn : null]}
                onPress={() => onPick(item.code)}
              >
                <Text style={[styles.optionText, on ? styles.optionTextOn : null]}>{item.label}</Text>
                {on ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            )
          })}
        </View>
      </Pressable>
    </Modal>
  )
}

export function LangPickField({ label, value, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        style={styles.field}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={styles.fieldText}>{langLabel(value)}</Text>
        <NeoIcon name="chevron-down" size={16} color="#8E95A3" />
      </Pressable>
      <LangListModal
        visible={open}
        title={label}
        value={value}
        onPick={(code) => {
          onChange(code)
          setOpen(false)
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  fieldWrap: { gap: 8 },
  fieldLabel: { color: "#FFFFFF", fontWeight: "700", fontSize: 13, marginTop: 4 },
  field: {
    minHeight: 48,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#121418",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  fieldText: { flex: 1, color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
  mask: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 80,
    paddingRight: 16
  },
  picker: {
    backgroundColor: "#16181D",
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    minWidth: 220,
    overflow: "hidden"
  },
  pickerTitle: {
    color: "#8E95A3",
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    gap: 12
  },
  optionOn: { backgroundColor: "rgba(133, 159, 120, 0.22)" },
  optionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  optionTextOn: { color: "#A8E6CF", fontWeight: "900" },
  check: { color: "#A8E6CF", fontWeight: "900", fontSize: 14 }
})
