import { useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import DropdownField from "../components/DropdownField"
import { apiRequest } from "../lib/api"
import {
  reportDetailOptions,
  reportTypeOptions
} from "../lib/abnormalReport"
import { resolveCarePresetKey } from "../lib/presetResolve"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "./new_ui/tokens"

const SEV = [
  { code: "Low", color: colors.mint, bg: "#f6ffed", border: "#b7eb8f" },
  { code: "Medium", color: "#fa8c16", bg: "#fff7e6", border: "#ffd591" },
  { code: "High", color: "#f5222d", bg: "#fff1f0", border: "#ffa39e" }
]

export default function AbnormalReportScreen({ apiBaseUrl, token, onBack }) {
  const { t, lang } = useI18n()
  const [type, setType] = useState("fall")
  const [detail, setDetail] = useState("")
  const [custom, setCustom] = useState("")
  const [note, setNote] = useState("")
  const [severity, setSeverity] = useState("Medium")
  const [saving, setSaving] = useState(false)

  const typeOptions = useMemo(() => reportTypeOptions(t), [t])
  const detailOptions = useMemo(() => reportDetailOptions(type, t), [t, type])

  const handleSubmit = async () => {
    const description = type === "other" || detail === "manual"
      ? String(custom || "").trim()
      : String(detail || "").trim()
    const noteText = String(note || "").trim()
    if (!type || !description) {
      Alert.alert(t("common.hint"), t("report.needFields"))
      return
    }
    setSaving(true)
    try {
      await apiRequest({
        apiBaseUrl,
        path: "/caregiver/alerts",
        method: "POST",
        token,
        body: {
          type,
          description,
          note: noteText,
          contentKey: resolveCarePresetKey({ text: description }) || "",
          sourceLang: lang,
          severity,
          status: "Pending"
        }
      })
      Alert.alert(t("report.okTitle"), t("report.okMsg"), [
        { text: t("common.done"), onPress: onBack }
      ])
    } catch (err) {
      Alert.alert(t("common.error"), err.message || t("report.fail"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.nav}>
        <Pressable onPress={onBack}><Text style={styles.back}>‹ {t("common.back")}</Text></Pressable>
        <Text style={styles.navTitle}>{t("report.title")}</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>{t("report.leadTitle")}</Text>
        <Text style={styles.sub}>{t("report.lead")}</Text>
        <View style={styles.card}>
          <DropdownField
            label={`1. ${t("report.step1")}`}
            value={type}
            options={typeOptions}
            onSelect={(v) => { setType(v); setDetail(""); setCustom("") }}
          />
          {type === "other" ? (
            <TextInput
              style={styles.input}
              value={custom}
              onChangeText={setCustom}
              placeholder={t("report.customType")}
              placeholderTextColor="#9ca3af"
            />
          ) : (
            <DropdownField
              label={`2. ${t("report.step2")}`}
              value={detail}
              options={[...detailOptions, { value: "manual", label: t("report.manual") }]}
              onSelect={setDetail}
            />
          )}
          {detail === "manual" ? (
            <TextInput
              style={[styles.input, styles.multi]}
              value={custom}
              onChangeText={setCustom}
              placeholder={t("report.customDetail")}
              placeholderTextColor="#9ca3af"
              multiline
            />
          ) : null}
          <Text style={styles.label}>{t("reminders.noteOptional")}</Text>
          <TextInput
            style={[styles.input, styles.multi]}
            value={note}
            onChangeText={setNote}
            placeholder={t("reminders.notePlaceholder")}
            placeholderTextColor="#9ca3af"
            multiline
          />
          <Text style={styles.label}>{`3. ${t("report.step3")}`}</Text>
          {SEV.map((s) => {
            const on = severity === s.code
            return (
              <Pressable
                key={s.code}
                onPress={() => setSeverity(s.code)}
                style={[styles.sev, { backgroundColor: s.bg, borderColor: on ? s.color : s.border }]}
              >
                <Text style={[styles.sevTitle, { color: s.color }]}>{t(`report.sev.${s.code}`)}</Text>
                <Text style={styles.sevDesc}>{t(`report.sev.${s.code}Desc`)}</Text>
              </Pressable>
            )
          })}
          <Pressable style={[styles.submit, saving ? { opacity: 0.6 } : null]} onPress={handleSubmit} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t("report.submit")}</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb"
  },
  back: { color: colors.pine, fontWeight: "700", fontSize: 16 },
  navTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  pad: { padding: 16, paddingBottom: 40 },
  h1: { fontSize: 22, fontWeight: "800", color: "#111827" },
  sub: { marginTop: 6, fontSize: 13, color: "#6b7280", lineHeight: 20 },
  card: {
    marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16
  },
  label: { marginTop: 14, marginBottom: 8, fontSize: 14, fontWeight: "700", color: "#374151" },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827"
  },
  multi: { minHeight: 80, textAlignVertical: "top" },
  sev: { borderWidth: 2, borderRadius: 12, padding: 12, marginBottom: 8 },
  sevTitle: { fontSize: 15, fontWeight: "800" },
  sevDesc: { marginTop: 4, fontSize: 12, color: "#6b7280", lineHeight: 18 },
  submit: {
    marginTop: 12,
    backgroundColor: colors.pine,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 16 }
})
