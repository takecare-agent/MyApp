import { useState } from "react"
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "../screens/new_ui/tokens"

/**
 * 內容欄：手打＋▼ 常用；可刪／隱藏用不到的項（R83）
 * options: string[] 或 { value, id?, kind?: 'builtin'|'custom' }[]
 */
export default function ComboboxField({
  label,
  value,
  onChangeText,
  options = [],
  placeholder,
  emptyText,
  onAddCurrent,
  onRemoveOption,
  adding = false,
  removing = false
}) {
  const { t } = useI18n()
  const shownLabel = label ?? t("reminders.content")
  const shownPh = placeholder ?? t("reminders.contentPlaceholder")
  const shownEmpty = emptyText ?? t("reminders.emptyPreset")
  const [open, setOpen] = useState(false)

  const normalized = options.map((item) =>
    typeof item === "string"
      ? { value: item, kind: "custom", deletable: false }
      : {
          value: item.value,
          id: item.id,
          kind: item.kind || "custom",
          deletable: item.deletable !== false
        }
  )

  const askRemove = (opt) => {
    if (typeof onRemoveOption !== "function" || !opt.deletable) return
    Alert.alert(
      t("reminders.removePresetTitle"),
      t("reminders.removePresetMsg", { label: opt.value }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("reminders.remove"),
          style: "destructive",
          onPress: () => onRemoveOption(opt)
        }
      ]
    )
  }

  return (
    <View style={styles.wrap}>
      {shownLabel ? <Text style={styles.label}>{shownLabel}</Text> : null}
      <View style={styles.fieldRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={shownPh}
          placeholderTextColor="#9ca3af"
        />
        <Pressable
          style={[styles.triBtn, open ? styles.triBtnOn : null]}
          onPress={() => setOpen((v) => !v)}
          hitSlop={6}
        >
          <Text style={styles.triText}>{open ? "▲" : "▼"}</Text>
        </Pressable>
      </View>

      {open ? (
        <View style={styles.menu}>
          {normalized.length === 0 ? (
            <Text style={styles.empty}>{shownEmpty}</Text>
          ) : (
            normalized.map((opt) => {
              const on = opt.value === value
              return (
                <View
                  key={`${opt.kind}-${opt.id || opt.value}`}
                  style={[styles.optionRow, on ? styles.optionOn : null]}
                >
                  <Pressable
                    style={styles.optionMain}
                    onPress={() => {
                      onChangeText(opt.value)
                      setOpen(false)
                    }}
                  >
                    <Text style={[styles.optionText, on ? styles.optionTextOn : null]}>
                      {opt.value}
                    </Text>
                  </Pressable>
                  {opt.deletable && typeof onRemoveOption === "function" ? (
                    <Pressable
                      style={styles.removeBtn}
                      onPress={() => askRemove(opt)}
                      disabled={removing}
                      hitSlop={8}
                    >
                      <Text style={styles.removeText}>−</Text>
                    </Pressable>
                  ) : null}
                </View>
              )
            })
          )}
          {typeof onAddCurrent === "function" ? (
            <Pressable
              style={[styles.addRow, adding ? styles.addRowDisabled : null]}
              onPress={onAddCurrent}
              disabled={adding || !String(value || "").trim()}
            >
              <Text style={styles.addText}>
                {adding ? t("reminders.addingPreset") : t("reminders.addPreset")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  label: { fontSize: 14, fontWeight: "700", color: "#374151", marginBottom: 8 },
  fieldRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    backgroundColor: "#fff",
    overflow: "hidden"
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827"
  },
  triBtn: {
    width: 48,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: "#e5e7eb",
    backgroundColor: "#f9fafb"
  },
  triBtnOn: { backgroundColor: colors.mintSoft },
  triText: { fontSize: 12, color: "#374151", fontWeight: "800" },
  menu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    backgroundColor: "#fff",
    overflow: "hidden"
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.bg
  },
  optionMain: { flex: 1, paddingVertical: 12, paddingHorizontal: 14 },
  optionOn: { backgroundColor: colors.mintSoft },
  optionText: { fontSize: 15, color: "#111827", fontWeight: "600" },
  optionTextOn: { color: colors.pine },
  removeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  removeText: { fontSize: 22, fontWeight: "600", color: "#dc2626", lineHeight: 24 },
  empty: { textAlign: "center", color: "#9ca3af", paddingVertical: 16 },
  addRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f8fafc"
  },
  addRowDisabled: { opacity: 0.5 },
  addText: { fontSize: 14, fontWeight: "700", color: colors.pine }
})
