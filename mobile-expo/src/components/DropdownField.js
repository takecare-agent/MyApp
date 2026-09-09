import { useState } from "react"
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native"
import { colors } from "../screens/new_ui/tokens"
import { NeoIcon } from "../screens/new_ui/NeoIcons"

import { useI18n } from "../i18n/I18nContext"

function optionValue(item) {
  if (item && typeof item === "object") return item.value
  return item
}

function optionLabel(item) {
  if (item && typeof item === "object") return item.label ?? item.value
  return String(item ?? "")
}

/** 下拉選單：點開列表選擇（options 可為 string 或 { value, label }） */
export default function DropdownField({
  label,
  value,
  placeholder,
  options = [],
  onSelect,
  emptyText,
  leftIcon
}) {
  const { t } = useI18n()
  const ph = placeholder ?? t("dropdown.placeholder")
  const empty = emptyText ?? t("dropdown.empty")
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => optionValue(o) === value)
  const display = selected ? optionLabel(selected) : value || ph

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        {leftIcon ? <NeoIcon name={leftIcon} size={18} glow style={styles.fieldIcon} /> : null}
        <Text style={[styles.fieldText, !value ? styles.placeholder : null]} numberOfLines={1}>
          {display}
        </Text>
        <NeoIcon name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label || ph}</Text>
            {options.length === 0 ? (
              <Text style={styles.empty}>{empty}</Text>
            ) : (
              <FlatList
                data={options}
                keyExtractor={(item, index) => `${optionValue(item)}-${index}`}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => {
                  const v = optionValue(item)
                  const on = v === value
                  return (
                    <Pressable
                      style={[styles.option, on ? styles.optionOn : null]}
                      onPress={() => {
                        onSelect(v)
                        setOpen(false)
                      }}
                    >
                      <Text style={[styles.optionText, on ? styles.optionTextOn : null]}>
                        {optionLabel(item)}
                      </Text>
                    </Pressable>
                  )
                }}
              />
            )}
            <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>{t("common.close")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  label: { fontSize: 14, fontWeight: "700", color: colors.textMuted, marginBottom: 8 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  fieldText: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.text, marginRight: 8 },
  fieldIcon: { marginRight: 10 },
  placeholder: { color: colors.textMuted, fontWeight: "500" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 24
  },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    maxHeight: "70%"
  },
  sheetTitle: { fontSize: 16, fontWeight: "800", marginBottom: 10, color: colors.text },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  optionOn: { backgroundColor: colors.mintSoft },
  optionText: { fontSize: 16, color: colors.text, fontWeight: "600" },
  optionTextOn: { color: colors.mint },
  empty: { textAlign: "center", color: colors.textMuted, paddingVertical: 24 },
  closeBtn: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border
  },
  closeText: { fontWeight: "700", color: colors.text }
})
