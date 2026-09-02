import { useMemo, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { mobileCompleteProfile, mobileDevLogin } from "../lib/api"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "./new_ui/tokens"

export default function RoleSelectScreen({ loginDraft, onBack, onLoginSuccess }) {
  const { t } = useI18n()
  const ROLE_OPTIONS = [
    { key: "family", title: t("role.familyTitle"), desc: t("role.familyDesc") },
    { key: "caregiver", title: t("role.caregiverTitle"), desc: t("role.caregiverDesc") },
    { key: "patient", title: t("role.patientTitle"), desc: t("role.patientDesc") }
  ]
  const [step, setStep] = useState("role")
  const [selectedRole, setSelectedRole] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [bindMode, setBindMode] = useState("invite")
  const [linkedPatientEmail, setLinkedPatientEmail] = useState("patient@test.com")
  const [inviteCode, setInviteCode] = useState("")
  const [careRecipientName, setCareRecipientName] = useState("")

  const isDev = loginDraft?.mode === "dev"
  const hasToken = Boolean(loginDraft?.token)
  const isReady = useMemo(
    () => Boolean(loginDraft?.apiBaseUrl && loginDraft?.email && (hasToken || isDev)),
    [hasToken, isDev, loginDraft]
  )
  const needsBind = selectedRole === "family" || selectedRole === "caregiver"

  const finish = async () => {
    if (!isReady || !selectedRole) {
      setError(t("role.needFirst"))
      return
    }
    const normalizedLinked = linkedPatientEmail.trim().toLowerCase()
    const normalizedInvite = inviteCode.trim().toUpperCase()
    if (needsBind) {
      if (bindMode === "invite" && !normalizedInvite) {
        setError(t("role.needInvite"))
        return
      }
      if (bindMode === "email" && !normalizedLinked) {
        setError(t("role.needEmail"))
        return
      }
    }

    setLoading(true)
    setError("")
    try {
      if (hasToken && !isDev) {
        const data = await mobileCompleteProfile({
          apiBaseUrl: loginDraft.apiBaseUrl,
          token: loginDraft.token,
          role: selectedRole,
          linkedPatientEmail: needsBind && bindMode === "email" ? normalizedLinked : "",
          inviteCode: needsBind && bindMode === "invite" ? normalizedInvite : "",
          name: careRecipientName || loginDraft.name || ""
        })
        await onLoginSuccess({
          token: data.token,
          role: data.role || selectedRole,
          user: data.user,
          apiBaseUrl: loginDraft.apiBaseUrl
        })
        return
      }

      const data = await mobileDevLogin({
        apiBaseUrl: loginDraft.apiBaseUrl,
        email: loginDraft.email,
        name: loginDraft.name || careRecipientName || "",
        role: selectedRole,
        linkedPatientEmail: needsBind
          ? bindMode === "email"
            ? normalizedLinked
            : "patient@test.com"
          : ""
      })
      await onLoginSuccess({
        token: data.token,
        role: data.role || selectedRole,
        user: data.user || {
          email: loginDraft.email,
          name: loginDraft.name || "",
          role: selectedRole,
          linkedPatientEmail: data.user?.linkedPatientEmail || normalizedLinked
        },
        apiBaseUrl: loginDraft.apiBaseUrl
      })
    } catch (loginError) {
      setError(loginError.message || t("role.setupFail"))
      setLoading(false)
    }
  }

  const handlePrimary = () => {
    if (step === "role") {
      if (!selectedRole) {
        setError(t("role.needOne"))
        return
      }
      setError("")
      if (needsBind) setStep("bind")
      else finish()
      return
    }
    finish()
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Pressable onPress={step === "bind" ? () => setStep("role") : onBack} style={styles.backBtn}>
        <Text style={styles.backText}>‹ {t("common.back")}</Text>
      </Pressable>

      {step === "role" ? (
        <>
          <Text style={styles.title}>{t("role.pickTitle")}</Text>
          <Text style={styles.subtitle}>
            {isDev ? t("role.pickDev") : t("role.pickHint")}
          </Text>
          <Text style={styles.accountLine}>{loginDraft?.email || ""}</Text>

          <View style={styles.roleList}>
            {ROLE_OPTIONS.map(item => {
              const active = selectedRole === item.key
              return (
                <Pressable
                  key={item.key}
                  style={[styles.roleRow, active && styles.roleRowActive]}
                  onPress={() => setSelectedRole(item.key)}
                >
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <View style={styles.radioDot} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.roleTitle}>{item.title}</Text>
                    <Text style={styles.roleDesc}>{item.desc}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.title}>{t("role.joinTitle")}</Text>
          <Text style={styles.subtitle}>
            {t("role.joinHint")}
          </Text>
          <Text style={styles.accountLine}>
            {t("role.asRole", { role: ROLE_OPTIONS.find(r => r.key === selectedRole)?.title })}
          </Text>

          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeChip, bindMode === "invite" && styles.modeChipActive]}
              onPress={() => setBindMode("invite")}
            >
              <Text style={[styles.modeChipText, bindMode === "invite" && styles.modeChipTextActive]}>
                {t("circle.inviteCode")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeChip, bindMode === "email" && styles.modeChipActive]}
              onPress={() => setBindMode("email")}
            >
              <Text style={[styles.modeChipText, bindMode === "email" && styles.modeChipTextActive]}>
                {t("circle.elderEmail")}
              </Text>
            </Pressable>
          </View>

          {bindMode === "invite" ? (
            <>
              <Text style={styles.label}>{t("circle.inviteCode")}</Text>
              <TextInput
                style={styles.input}
                value={inviteCode}
                onChangeText={setInviteCode}
                autoCapitalize="characters"
                placeholder={t("role.invitePlaceholder")}
                placeholderTextColor="#8aa0b8"
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>{t("circle.elderEmail")}</Text>
              <TextInput
                style={styles.input}
                value={linkedPatientEmail}
                onChangeText={setLinkedPatientEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="patient@test.com"
                placeholderTextColor="#8aa0b8"
              />
            </>
          )}

          <Text style={styles.label}>{t("role.nickname")}</Text>
          <TextInput
            style={styles.input}
            value={careRecipientName}
            onChangeText={setCareRecipientName}
            placeholder={t("role.nicknamePh")}
            placeholderTextColor="#8aa0b8"
          />
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
        onPress={handlePrimary}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>
            {step === "role" ? (needsBind ? t("role.continue") : t("role.enterApp")) : t("role.bindEnter")}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#fff",
    padding: 24,
    paddingTop: 20
  },
  backBtn: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 8 },
  backText: { color: colors.pine, fontWeight: "800", fontSize: 16 },
  title: { fontSize: 24, fontWeight: "900", color: "#111827", textAlign: "center" },
  subtitle: {
    marginTop: 8,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
    fontWeight: "600"
  },
  accountLine: {
    marginTop: 12,
    marginBottom: 16,
    textAlign: "center",
    color: colors.pine,
    fontWeight: "700",
    fontSize: 13
  },
  roleList: { gap: 10 },
  roleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff"
  },
  roleRowActive: { borderColor: colors.pine, backgroundColor: "#f0f7ff" },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2
  },
  radioActive: { borderColor: colors.pine },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.pine
  },
  roleTitle: { color: "#111827", fontSize: 17, fontWeight: "900" },
  roleDesc: { marginTop: 4, color: "#6b7280", lineHeight: 20, fontWeight: "600" },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center"
  },
  modeChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  modeChipText: { color: "#64748b", fontWeight: "800" },
  modeChipTextActive: { color: "#fff" },
  label: { marginTop: 14, color: "#334155", fontWeight: "800", fontSize: 13 },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 50,
    color: "#111827",
    fontSize: 16
  },
  error: { marginTop: 14, color: "#b42318", fontWeight: "700", textAlign: "center" },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: colors.pine,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center"
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 }
})
