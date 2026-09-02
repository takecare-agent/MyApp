import { useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { mobileResendVerify, mobileVerifyEmail } from "../lib/api"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "./new_ui/tokens"

export default function VerifyScreen({
  apiBaseUrl,
  email,
  initialCode = "",
  onBack,
  onVerified
}) {
  const { t } = useI18n()
  const [code, setCode] = useState(initialCode || "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState(
    initialCode ? t("verify.devCode", { code: initialCode }) : ""
  )

  const handleVerify = async () => {
    const trimmed = code.replace(/\s/g, "")
    if (trimmed.length < 4) {
      setError(t("verify.needCode"))
      return
    }
    setBusy(true)
    setError("")
    try {
      const data = await mobileVerifyEmail({ apiBaseUrl, email, code: trimmed })
      onVerified({
        apiBaseUrl,
        token: data.token,
        user: data.user,
        role: data.user?.role || null,
        needsRole: Boolean(data.needsRole || !data.user?.role)
      })
    } catch (err) {
      setError(err.message || t("verify.fail"))
    } finally {
      setBusy(false)
    }
  }

  const handleResend = async () => {
    setBusy(true)
    setError("")
    try {
      const data = await mobileResendVerify({ apiBaseUrl, email })
      setInfo(data.devCode ? t("verify.resentDev", { code: data.devCode }) : t("verify.resent"))
      if (data.devCode) setCode(String(data.devCode))
    } catch (err) {
      setError(err.message || t("verify.sendFail"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backText}>‹ {t("common.back")}</Text>
      </Pressable>

      <Text style={styles.title}>{t("verify.title")}</Text>
      <Text style={styles.subtitle}>
        {t("verify.sentTo")}{"\n"}
        <Text style={styles.email}>{email || ""}</Text>
      </Text>
      {info ? <Text style={styles.info}>{info}</Text> : null}

      <Text style={styles.label}>{t("verify.code")}</Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={8}
        placeholder={t("verify.codePh")}
        placeholderTextColor="#8aa0b8"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={handleVerify} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{t("verify.continue")}</Text>}
      </Pressable>

      <Pressable style={styles.secondaryBtn} onPress={handleResend} disabled={busy}>
        <Text style={styles.secondaryBtnText}>{t("verify.resend")}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    paddingTop: 20
  },
  backBtn: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 8 },
  backText: { color: colors.pine, fontWeight: "800", fontSize: 16 },
  title: { fontSize: 24, fontWeight: "900", color: "#111827", textAlign: "center" },
  subtitle: {
    marginTop: 10,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 22,
    fontWeight: "600"
  },
  email: { color: colors.pine, fontWeight: "800" },
  info: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    color: "#1d4ed8",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700"
  },
  label: { marginTop: 16, color: "#334155", fontWeight: "800", fontSize: 13 },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 52,
    color: "#111827",
    fontSize: 22,
    letterSpacing: 8,
    textAlign: "center",
    fontWeight: "800"
  },
  error: { marginTop: 10, color: "#b42318", fontWeight: "700", textAlign: "center" },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: colors.pine,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center"
  },
  btnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  secondaryBtn: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#93c5fd",
    paddingVertical: 14,
    alignItems: "center"
  },
  secondaryBtnText: { color: colors.pine, fontWeight: "800", fontSize: 15 }
})
