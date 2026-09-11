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
import { NeoIcon } from "../screens/new_ui/NeoIcons"

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
  removing = false,
  leftIcon
}) {
  const { t } = useI18n()
  const shownLabel = label ?? t("reminders.content")
  const shownPh = placeholder === undefined ? t("reminders.contentPlaceholder") : placeholder
  const shownEmpty = emptyText ?? t("reminders.emptyPreset")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)

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
        {leftIcon ? <NeoIcon name={leftIcon} size={18} glow style={styles.fieldIcon} /> : null}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={shownPh || undefined}
          placeholderTextColor={shownPh ? colors.textMuted : "transparent"}
        />
        <Pressable
          style={[styles.triBtn, open ? styles.triBtnOn : null]}
          onPress={() => setOpen((v) => !v)}
          hitSlop={6}
        >
          <NeoIcon
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.mint}
          />
        </Pressable>
      </View>

      {open ? (
        <View style={styles.menu}>
          <View style={styles.menuHead}>
            <View />
            {typeof onRemoveOption === "function" || typeof onAddCurrent === "function" ? (
              <Pressable onPress={() => setEditing((v) => !v)} hitSlop={8}>
                <Text style={[styles.editLink, editing ? styles.editLinkOn : null]}>{t("common.edit")}</Text>
              </Pressable>
            ) : null}
          </View>
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
                  {editing && opt.deletable && typeof onRemoveOption === "function" ? (
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
          {editing && typeof onAddCurrent === "function" ? (
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
  label: { fontSize: 14, fontWeight: "700", color: colors.textMuted, marginBottom: 8 },
  fieldRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.bg,
    overflow: "hidden",
    paddingLeft: 12
  },
  fieldIcon: { alignSelf: "center", marginRight: 2 },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text
  },
  triBtn: {
    width: 48,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    backgroundColor: colors.card
  },
  triBtnOn: { backgroundColor: colors.mintSoft },
  menu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.card,
    overflow: "hidden"
  },
  menuHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 2
  },
  editLink: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted
  },
  editLinkOn: { color: colors.mint },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  optionMain: { flex: 1, paddingVertical: 12, paddingHorizontal: 14 },
  optionOn: { backgroundColor: colors.mintSoft },
  optionText: { fontSize: 15, color: colors.text, fontWeight: "600" },
  optionTextOn: { color: colors.mint },
  removeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  removeText: { fontSize: 22, fontWeight: "600", color: "#E05A47", lineHeight: 24 },
  empty: { textAlign: "center", color: colors.textMuted, paddingVertical: 16 },
  addRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bg
  },
  addRowDisabled: { opacity: 0.5 },
  addText: { fontSize: 14, fontWeight: "700", color: colors.mint }
})
