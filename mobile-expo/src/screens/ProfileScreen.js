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
import BirthdayField, { ageFromBirthYmd } from "../components/BirthdayField"
import { apiRequest } from "../lib/api"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "./new_ui/tokens"

const GENDER_OPTIONS = ["female", "male", "other"]

function normalizeGender(raw) {
  const s = String(raw || "").trim().toLowerCase()
  if (!s) return ""
  if (["female", "f", "女", "女性", "perempuan", "nữ", "nư", "babae", "หญิง"].includes(s)) return "female"
  if (["male", "m", "男", "男性", "laki-laki", "laki", "nam", "lalaki", "ชาย"].includes(s)) return "male"
  if (["other", "其他", "lainnya", "khác", "iba", "อื่น"].includes(s)) return "other"
  return ""
}

function setupPath(role) {
  if (role === "family") return "/family/setup"
  if (role === "caregiver") return "/caregiver/setup"
  return "/patient/setup"
}

function profilePath(role) {
  if (role === "family") return "/family/profile"
  if (role === "caregiver") return "/caregiver/profile"
  return "/patient/profile"
}

export default function ProfileScreen({ apiBaseUrl, token, role, user, onSaved }) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [gender, setGender] = useState("")
  const [experience, setExperience] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: profilePath(role),
        token
      })
      setName(String(data?.name || user?.name || "").trim())
      setPhone(String(data?.phone || "").trim())
      setBirthDate(String(data?.birthDate || "").trim())
      setGender(normalizeGender(data?.gender))
      setExperience(String(data?.experience || "").trim())
    } catch (err) {
      setError(err.message || t("profile.loadFail"))
      setName(String(user?.name || "").trim())
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl, role, t, token, user?.name])

  useEffect(() => {
    load()
  }, [load])

  const derivedAge = ageFromBirthYmd(birthDate)

  const save = async () => {
    const trimmed = String(name || "").trim()
    if (!trimmed) {
      setError(t("profile.nameRequired"))
      return
    }
    setBusy(true)
    setError("")
    setSaved(false)
    try {
      const body = { name: trimmed, phone: String(phone || "").trim() }
      if (role === "patient") {
        body.birthDate = String(birthDate || "").trim()
        const ageNum = derivedAge
        if (ageNum != null) body.age = ageNum
        body.gender = String(gender || "").trim()
      }
      if (role === "caregiver") {
        body.experience = String(experience || "").trim()
      }
      await apiRequest({
        apiBaseUrl,
        path: setupPath(role),
        method: "POST",
        token,
        body
      })
      setSaved(true)
      onSaved?.({ name: trimmed })
    } catch (err) {
      setError(err.message || t("profile.saveFail"))
    } finally {
      setBusy(false)
    }
  }

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
        <Text style={styles.lead}>{t("profile.lead")}</Text>
        <Text style={styles.label}>{t("profile.email")}</Text>
        <Text style={styles.email}>{user?.email || "—"}</Text>

        <Text style={styles.label}>{t("profile.name")}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t("profile.namePlaceholder")}
          placeholderTextColor="#98a2b3"
          autoCorrect={false}
        />

        <Text style={styles.label}>{t("profile.phone")}</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder={t("profile.phonePlaceholder")}
          placeholderTextColor="#98a2b3"
          keyboardType="phone-pad"
        />

        {role === "patient" ? (
          <>
            <BirthdayField
              label={t("profile.birthDate")}
              value={birthDate}
              onChange={setBirthDate}
            />
            <Text style={styles.label}>{t("profile.ageAuto")}</Text>
            <Text style={styles.derived}>
              {derivedAge != null ? t("profile.ageValue", { n: derivedAge }) : "—"}
            </Text>
            <Text style={styles.label}>{t("profile.gender")}</Text>
            <View style={styles.chipRow}>
              {GENDER_OPTIONS.map((id) => {
                const on = gender === id
                return (
                  <Pressable
                    key={id}
                    style={[styles.choice, on ? styles.choiceOn : null]}
                    onPress={() => setGender(id)}
                  >
                    <Text style={[styles.choiceText, on ? styles.choiceTextOn : null]}>
                      {t(`profile.gender.${id}`)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </>
        ) : null}

        {role === "caregiver" ? (
          <>
            <Text style={styles.label}>{t("profile.experience")}</Text>
            <TextInput
              style={[styles.input, styles.inputTall]}
              value={experience}
              onChangeText={setExperience}
              placeholder={t("profile.experiencePlaceholder")}
              placeholderTextColor="#98a2b3"
              multiline
            />
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saved ? <Text style={styles.ok}>{t("profile.saved")}</Text> : null}

        <Pressable
          style={[styles.saveBtn, busy && styles.disabled]}
          onPress={save}
          disabled={busy}
        >
          <Text style={styles.saveText}>
            {busy ? t("profile.saving") : t("profile.save")}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  pad: { padding: 16, paddingBottom: 48, gap: 8 },
  lead: { color: "#475467", lineHeight: 20, marginBottom: 8 },
  label: { color: "#101828", fontWeight: "800", fontSize: 14, marginTop: 8 },
  email: { color: "#667085", fontSize: 15, fontWeight: "600" },
  derived: {
    color: "#101828",
    fontSize: 16,
    fontWeight: "700",
    paddingVertical: 8
  },
  chipRow: { flexDirection: "row", gap: 8 },
  choice: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff"
  },
  choiceOn: { borderColor: colors.pine, backgroundColor: colors.mintSoft },
  choiceText: { color: "#475467", fontWeight: "700", fontSize: 15 },
  choiceTextOn: { color: colors.pine },
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
  error: { color: "#b42318", fontWeight: "700", marginTop: 8 },
  ok: { color: "#027a48", fontWeight: "700", marginTop: 8 },
  saveBtn: {
    marginTop: 16,
    backgroundColor: colors.pine,
    borderRadius: 12,
    borderCurve: "continuous",
    paddingVertical: 14,
    alignItems: "center"
  },
  disabled: { opacity: 0.6 },
  saveText: { color: "#fff", fontWeight: "900", fontSize: 16 }
})
