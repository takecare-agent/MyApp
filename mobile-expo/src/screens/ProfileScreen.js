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
        <View style={styles.emailBox}>
          <Text style={styles.email} numberOfLines={1}>{user?.email || "—"}</Text>
        </View>

        <Text style={styles.label}>{t("profile.name")}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t("profile.namePlaceholder")}
          placeholderTextColor="#8E95A3"
          autoCorrect={false}
        />

        <Text style={styles.label}>{t("profile.phone")}</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder={t("profile.phonePlaceholder")}
          placeholderTextColor="#8E95A3"
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
              placeholderTextColor="#8E95A3"
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
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.bg },
  pad: { padding: 16, paddingBottom: 48, gap: 8 },
  lead: { color: colors.textMuted, lineHeight: 20, marginBottom: 8 },
  label: { color: colors.text, fontWeight: "700", fontSize: 16, marginTop: 8 },
  emailBox: {
    height: 52,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: "#121418",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 14,
    justifyContent: "center"
  },
  email: { color: "#8E95A3", fontSize: 15, fontWeight: "500" },
  derived: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    paddingVertical: 8
  },
  chipRow: { flexDirection: "row", gap: 8 },
  choice: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card
  },
  choiceOn: { borderColor: colors.pine, backgroundColor: colors.mintSoft },
  choiceText: { color: colors.textMuted, fontWeight: "700", fontSize: 15 },
  choiceTextOn: { color: colors.mint },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    borderCurve: "continuous",
    paddingHorizontal: 14,
    height: 52,
    fontSize: 16,
    fontWeight: "500",
    color: "#FFFFFF",
    backgroundColor: "#16181D"
  },
  inputTall: { height: 52, textAlignVertical: "center" },
  error: { color: "#b42318", fontWeight: "700", marginTop: 8 },
  ok: { color: "#027a48", fontWeight: "700", marginTop: 8 },
  saveBtn: {
    marginTop: 16,
    backgroundColor: "#5B8E7D",
    borderRadius: 999,
    height: 52,
    alignItems: "center",
    justifyContent: "center"
  },
  disabled: { opacity: 0.6 },
  saveText: { color: "#000000", fontWeight: "700", fontSize: 16 }
})
