import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { FIRST_AID_SUMMARY } from "../lib/firstAid"
import { useI18n } from "../i18n/I18nContext"
import { LANG_OPTIONS } from "../i18n/languages"
import {
  ALLERGIES,
  BLOOD_TYPES,
  CONDITIONS,
  DEVICES,
  DIRECTIVES,
  MEDICATIONS,
  cardFromApi,
  cardHasContent,
  findOption,
  joinLabels,
  optionLabel
} from "../lib/healthCardOptions"
import { colors } from "../screens/new_ui/tokens"

function Row({ label, value }) {
  const text = String(value || "").trim()
  if (!text) return null
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{text}</Text>
    </View>
  )
}

export default function HealthCardReadonly({
  card,
  patientName,
  loading = false,
  error = "",
  showFirstAidToggle = false,
  showFirstAid = false,
  onToggleFirstAid,
  onClose,
  onOpenFullGuide
}) {
  const { t, lang } = useI18n()
  const name = patientName || card?.patientName || t("sos.elderFallback")
  const data = cardFromApi(card)
  const filled = cardHasContent(card)
  const blood = optionLabel(findOption(BLOOD_TYPES, data.bloodType), lang)
  const langLabel = LANG_OPTIONS.find((x) => x.code === data.preferredLanguage)?.label || data.preferredLanguage

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{t("settings.healthCard")}</Text>
      <Text style={styles.sub}>{name}</Text>

      {loading ? (
        <ActivityIndicator color={colors.pine} style={{ marginVertical: 20 }} />
      ) : null}

      {!loading && error && !filled ? (
        <Text style={styles.empty}>{t("health.readFail")}</Text>
      ) : null}

      {!loading && !error && !filled ? (
        <Text style={styles.empty}>{t("health.empty")}</Text>
      ) : null}

      {!loading && filled ? (
        <ScrollView style={styles.scroll} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
          <Row label={t("health.bloodType")} value={blood} />
          <Row label={t("health.allergies")} value={joinLabels(data.allergyKeys, ALLERGIES, lang, data.allergyOther)} />
          <Row label={t("health.conditions")} value={joinLabels(data.conditionKeys, CONDITIONS, lang, data.conditionOther)} />
          <Row
            label={t("health.medications")}
            value={[joinLabels(data.medicationKeys, MEDICATIONS, lang, ""), data.medications].filter(Boolean).join("\n")}
          />
          <Row label={t("health.devices")} value={joinLabels(data.deviceKeys, DEVICES, lang, "")} />
          <Row label={t("health.directives")} value={joinLabels(data.directiveKeys, DIRECTIVES, lang, "")} />
          <Row label={t("health.language")} value={langLabel} />
          <Row label={t("health.notes")} value={data.notes} />
        </ScrollView>
      ) : null}

      {showFirstAidToggle ? (
        <>
          <Pressable style={styles.guideToggle} onPress={onToggleFirstAid}>
            <Text style={styles.guideToggleText}>
              {showFirstAid ? t("health.hideGuide") : t("health.showGuide")}
            </Text>
          </Pressable>
          {showFirstAid
            ? FIRST_AID_SUMMARY.map((line, index) => (
                <Text key={line} style={styles.guideLine}>
                  {index + 1}. {line}
                </Text>
              ))
            : null}
          {typeof onOpenFullGuide === "function" ? (
            <Pressable style={styles.fullGuideBtn} onPress={onOpenFullGuide}>
              <Text style={styles.fullGuideText}>{t("health.fullGuide")}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {onClose ? (
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>{t("common.close")}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    gap: 8,
    maxHeight: "85%"
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "900" },
  sub: { color: "#667085", fontWeight: "700", marginBottom: 4 },
  empty: { color: "#667085", fontWeight: "600", lineHeight: 22, marginVertical: 12 },
  scroll: { maxHeight: 280 },
  row: { gap: 2 },
  label: { color: "#98a2b3", fontSize: 12, fontWeight: "800" },
  value: { color: "#101828", fontSize: 15, fontWeight: "700", lineHeight: 22 },
  guideToggle: { marginTop: 8, paddingVertical: 8 },
  guideToggleText: { color: colors.pine, fontWeight: "800" },
  guideLine: { color: "#475467", fontWeight: "600", lineHeight: 22 },
  fullGuideBtn: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  fullGuideText: { color: colors.pine, fontWeight: "800" },
  closeBtn: {
    marginTop: 8,
    backgroundColor: colors.pine,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center"
  },
  closeText: { color: "#fff", fontWeight: "900" }
})
