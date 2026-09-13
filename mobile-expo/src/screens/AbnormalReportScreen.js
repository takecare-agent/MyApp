import { useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { WebView } from "react-native-webview"
import DropdownField from "../components/DropdownField"
import { apiRequest } from "../lib/api"
import {
  reportDetailOptions,
  reportTypeOptions
} from "../lib/abnormalReport"
import { resolveCarePresetKey } from "../lib/presetResolve"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "./new_ui/tokens"

function photoHtml(label) {
  const safe = String(label || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]))
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;background:transparent;font-family:-apple-system,sans-serif}
.btn{display:block;text-align:center;background:#12281E;color:#A8E6CF;font-weight:800;padding:12px;border-radius:14px;border:1px solid #10B981}
input{position:absolute;left:-9999px}
</style></head><body>
<label class="btn">${safe}<input id="f" type="file" accept="image/*"></label>
<script>
document.getElementById("f").onchange=function(){
  var file=this.files&&this.files[0];
  if(!file){ window.ReactNativeWebView.postMessage(JSON.stringify({error:"empty"})); return; }
  var reader=new FileReader();
  reader.onload=function(){ window.ReactNativeWebView.postMessage(JSON.stringify({uri:reader.result})); };
  reader.onerror=function(){ window.ReactNativeWebView.postMessage(JSON.stringify({error:"read"})); };
  reader.readAsDataURL(file);
};
</script></body></html>`
}

const SEV = [
  { code: "Low", color: "#10B981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)" },
  { code: "Medium", color: "#F59E0B", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.4)" },
  { code: "High", color: "#FF4D4D", bg: "rgba(255,77,77,0.12)", border: "rgba(255,77,77,0.45)" }
]

export default function AbnormalReportScreen({ apiBaseUrl, token, onBack }) {
  const { t, lang } = useI18n()
  const [type, setType] = useState("fall")
  const [detail, setDetail] = useState("")
  const [custom, setCustom] = useState("")
  const [note, setNote] = useState("")
  const [severity, setSeverity] = useState("Medium")
  const [photo, setPhoto] = useState("")
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
      const created = await apiRequest({
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
      const alertId = created?.record?._id
      if (alertId && photo) {
        await apiRequest({
          apiBaseUrl,
          path: `/caregiver/alerts/${encodeURIComponent(alertId)}/evidence`,
          method: "POST",
          token,
          body: {
            mediaType: "snapshot",
            contentType: "image/jpeg",
            dataBase64: photo
          }
        })
      }
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
              placeholderTextColor="#8E95A3"
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
              placeholderTextColor="#8E95A3"
              multiline
            />
          ) : null}
          <Text style={styles.label}>{t("report.photo")}</Text>
          {photo ? (
            <View style={styles.photoBox}>
              <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
              <Pressable onPress={() => setPhoto("")}>
                <Text style={styles.photoClear}>{t("report.photoClear")}</Text>
              </Pressable>
            </View>
          ) : (
            <WebView
              source={{ html: photoHtml(t("report.photoAdd")), baseUrl: "https://localhost/" }}
              style={styles.photoWeb}
              javaScriptEnabled
              originWhitelist={["*"]}
              allowFileAccess
              allowFileAccessFromFileURLs
              onMessage={(e) => {
                try {
                  const data = JSON.parse(e.nativeEvent.data || "{}")
                  if (data.uri) setPhoto(data.uri)
                } catch {
                  /* ignore */
                }
              }}
            />
          )}
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
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  back: { color: "#FF4D4D", fontWeight: "700", fontSize: 16 },
  navTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  pad: { padding: 16, paddingBottom: 40 },
  h1: { fontSize: 22, fontWeight: "800", color: colors.text },
  sub: { marginTop: 0, fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  photoWeb: { height: 56, backgroundColor: "transparent", marginTop: 4 },
  photoBox: { marginTop: 8, gap: 8 },
  photo: { width: "100%", height: 180, borderRadius: 14, backgroundColor: "#12141A" },
  photoClear: { color: "#FF5C5C", fontWeight: "700", fontSize: 13 },
  card: {
    marginTop: 16,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border
  },
  label: { marginTop: 14, marginBottom: 8, fontSize: 14, fontWeight: "700", color: colors.textMuted },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    borderRadius: 16,
    borderCurve: "continuous",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text
  },
  multi: { minHeight: 80, textAlignVertical: "top" },
  sev: { borderWidth: 1, borderRadius: 16, borderCurve: "continuous", padding: 12, marginBottom: 8 },
  sevTitle: { fontSize: 15, fontWeight: "800" },
  sevDesc: { marginTop: 4, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  submit: {
    marginTop: 12,
    backgroundColor: colors.mint,
    borderRadius: 16,
    borderCurve: "continuous",
    paddingVertical: 14,
    alignItems: "center"
  },
  submitText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 }
})
