import { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { useI18n } from "../i18n/I18nContext"
import { LANG_OPTIONS } from "../i18n/languages"
import { patientGetHealthCard, patientPatchHealthCard } from "../lib/api"
import {
  ALLERGIES,
  BLOOD_TYPES,
  CONDITION_GROUPS,
  DEVICES,
  DIRECTIVES,
  EMPTY_CARD,
  MEDICATIONS,
  cardFromApi,
  noneLabel,
  optionLabel,
  toggleGroup
} from "../lib/healthCardOptions"
import { colors } from "./new_ui/tokens"

function Chip({ on, label, onPress, muted }) {
  return (
    <Pressable
      style={[
        styles.chip,
        muted && !on ? styles.chipMuted : null,
        on ? styles.chipOn : null
      ]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, on ? styles.chipTextOn : null, muted && !on ? styles.chipTextMuted : null]}>
        {label}
      </Text>
    </Pressable>
  )
}

/** 「無」放最後。點了收合；再點一次展開（誤點可改）。 */
function ChipSection({ items, value, noneId, onChange, lang, otherValue, onOther, otherPlaceholder }) {
  const noneOn = value.includes(noneId)
  const groupIds = items.map((item) => item.id)
  const toggle = (id) => onChange(toggleGroup(value, id, groupIds, noneId))

  return (
    <View style={styles.sectionBody}>
      <View style={styles.grid}>
        {noneOn ? null : items.map((item) => (
          <Chip
            key={item.id}
            on={value.includes(item.id)}
            label={optionLabel(item, lang)}
            onPress={() => toggle(item.id)}
          />
        ))}
        <Chip
          muted
          on={noneOn}
          label={noneLabel(lang)}
          onPress={() => toggle(noneId)}
        />
      </View>
      {noneOn || !onOther ? null : (
        <TextInput
          style={styles.input}
          value={otherValue}
          onChangeText={onOther}
          placeholder={otherPlaceholder}
          placeholderTextColor="#98a2b3"
        />
      )}
    </View>
  )
}

export default function HealthCardScreen({ apiBaseUrl, token }) {
  const { t, lang } = useI18n()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState(EMPTY_CARD)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await patientGetHealthCard({ apiBaseUrl, token })
      setForm(cardFromApi(data?.healthCard || {}))
    } catch (err) {
      setError(err.message || t("health.loadFail"))
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl, t, token])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    setBusy(true)
    setError("")
    setSaved(false)
    try {
      await patientPatchHealthCard({ apiBaseUrl, token, healthCard: form })
      setSaved(true)
    } catch (err) {
      setError(err.message || t("health.saveFail"))
    } finally {
      setBusy(false)
    }
  }

  const otherPh = t("health.other")

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.pine} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.pad}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saved ? <Text style={styles.ok}>{t("health.saved")}</Text> : null}

        <Text style={styles.label}>{t("health.bloodType")}</Text>
        <View style={styles.grid}>
          {BLOOD_TYPES.map((item) => (
            <Chip
              key={item.id}
              on={form.bloodType === item.id}
              label={optionLabel(item, lang)}
              onPress={() => setForm((prev) => ({
                ...prev,
                bloodType: prev.bloodType === item.id ? "" : item.id
              }))}
            />
          ))}
        </View>

        <Text style={styles.label}>{t("health.allergies")}</Text>
        <ChipSection
          items={ALLERGIES}
          value={form.allergyKeys}
          noneId="none"
          lang={lang}
          onChange={(allergyKeys) => setForm((prev) => ({
            ...prev,
            allergyKeys,
            allergyOther: allergyKeys.includes("none") ? "" : prev.allergyOther
          }))}
          otherValue={form.allergyOther}
          onOther={(text) => setForm((prev) => ({ ...prev, allergyOther: text }))}
          otherPlaceholder={otherPh}
        />

        <Text style={styles.label}>{t("health.conditions")}</Text>
        {CONDITION_GROUPS.map((group) => (
          <View key={group.id} style={styles.group}>
            <Text style={styles.groupTitle}>{t(`health.group.${group.id}`)}</Text>
            <ChipSection
              items={group.items}
              value={form.conditionKeys}
              noneId={group.noneId}
              lang={lang}
              onChange={(conditionKeys) => setForm((prev) => ({ ...prev, conditionKeys }))}
              otherValue={group.id === "other" ? form.conditionOther : undefined}
              onOther={group.id === "other"
                ? (text) => setForm((prev) => ({ ...prev, conditionOther: text }))
                : undefined}
              otherPlaceholder={otherPh}
            />
          </View>
        ))}

        <Text style={styles.label}>{t("health.medications")}</Text>
        <ChipSection
          items={MEDICATIONS}
          value={form.medicationKeys}
          noneId="noneMed"
          lang={lang}
          onChange={(medicationKeys) => setForm((prev) => ({
            ...prev,
            medicationKeys,
            medications: medicationKeys.includes("noneMed") ? "" : prev.medications
          }))}
          otherValue={form.medications}
          onOther={(text) => setForm((prev) => ({ ...prev, medications: text }))}
          otherPlaceholder={otherPh}
        />

        <Text style={styles.label}>{t("health.devices")}</Text>
        <ChipSection
          items={DEVICES}
          value={form.deviceKeys}
          noneId="noneDevice"
          lang={lang}
          onChange={(deviceKeys) => setForm((prev) => ({ ...prev, deviceKeys }))}
        />

        <Text style={styles.label}>{t("health.directives")}</Text>
        <ChipSection
          items={DIRECTIVES}
          value={form.directiveKeys}
          noneId="noneDirective"
          lang={lang}
          onChange={(directiveKeys) => setForm((prev) => ({ ...prev, directiveKeys }))}
        />

        <Text style={styles.label}>{t("health.language")}</Text>
        <View style={styles.grid}>
          {LANG_OPTIONS.map((opt) => (
            <Chip
              key={opt.code}
              on={form.preferredLanguage === opt.code}
              label={opt.label}
              onPress={() => setForm((prev) => ({
                ...prev,
                preferredLanguage: prev.preferredLanguage === opt.code ? "" : opt.code
              }))}
            />
          ))}
        </View>

        <Text style={styles.label}>{t("health.notes")}</Text>
        <TextInput
          style={[styles.input, styles.inputTall]}
          value={form.notes}
          onChangeText={(text) => setForm((prev) => ({ ...prev, notes: text }))}
          multiline
        />

        <Pressable style={[styles.saveBtn, busy && styles.disabled]} onPress={save} disabled={busy}>
          <Text style={styles.saveText}>{busy ? t("health.saving") : t("health.save")}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  pad: { padding: 16, paddingBottom: 48, gap: 10 },
  error: { color: "#b42318", fontWeight: "700" },
  ok: { color: "#027a48", fontWeight: "700" },
  label: { color: "#101828", fontWeight: "800", fontSize: 14, marginTop: 8 },
  group: { gap: 6 },
  groupTitle: { color: "#667085", fontWeight: "700", fontSize: 13 },
  sectionBody: { gap: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 12,
    borderCurve: "continuous",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center"
  },
  chipOn: { borderColor: colors.pine, backgroundColor: colors.mintSoft },
  chipMuted: { borderColor: "#e4e7ec", backgroundColor: "#f9fafb" },
  chipText: { color: "#475467", fontWeight: "700", fontSize: 15 },
  chipTextOn: { color: colors.pine },
  chipTextMuted: { color: "#98a2b3", fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 12,
    borderCurve: "continuous",
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#101828",
    backgroundColor: "#fff",
    minHeight: 48
  },
  inputTall: { minHeight: 88, textAlignVertical: "top" },
  saveBtn: {
    marginTop: 12,
    backgroundColor: colors.pine,
    borderRadius: 12,
    borderCurve: "continuous",
    paddingVertical: 14,
    alignItems: "center"
  },
  disabled: { opacity: 0.6 },
  saveText: { color: "#fff", fontWeight: "900", fontSize: 16 }
})
