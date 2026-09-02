import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import {
  ApiError,
  TEST_ACCOUNT_PASSWORD,
  mobileLogin,
  mobileRegister
} from "../lib/api"
import { signInWithApple, signInWithGoogle } from "../lib/socialAuth"
import { LANG_OPTIONS, DEFAULT_LANG } from "../i18n/languages"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "./new_ui/tokens"

function errorText(err, t, fallbackKey) {
  const msg = String(err?.message || "")
  if (msg.startsWith("auth.")) return t(msg)
  return msg || t(fallbackKey)
}

export default function AuthScreen({
  defaultApiBaseUrl,
  defaultLang,
  onAuthenticated,
  onNeedsVerify,
  onOpenDevRoleSelect,
  onRegisterLangChange
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState("login")
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [registerLang, setRegisterLang] = useState(defaultLang || DEFAULT_LANG)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  const quickAccounts = [
    { email: "patient@test.com", name: "受顧者測試", label: t("auth.quickPatient") },
    { email: "caregiver@test.com", name: "看護測試", label: t("auth.quickCaregiver") },
    { email: "family@test.com", name: "家屬測試", label: t("auth.quickFamily") }
  ]

  useEffect(() => {
    if (defaultApiBaseUrl) setApiBaseUrl(defaultApiBaseUrl)
  }, [defaultApiBaseUrl])

  useEffect(() => {
    if (defaultLang) setRegisterLang(defaultLang)
  }, [defaultLang])

  const pickLang = (code) => {
    setRegisterLang(code)
    if (onRegisterLangChange) onRegisterLangChange(code)
  }

  const handleSubmit = async () => {
    const normalizedApiBaseUrl = apiBaseUrl.trim()
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedName = name.trim()
    const normalizedPassword = password

    if (!normalizedApiBaseUrl) {
      setError(t("auth.needApi"))
      return
    }
    if (!normalizedEmail) {
      setError(t("auth.needEmail"))
      return
    }
    if (normalizedPassword.length < 8) {
      setError(t("auth.needPassword"))
      return
    }

    setBusy(true)
    setError("")
    try {
      if (mode === "register") {
        const data = await mobileRegister({
          apiBaseUrl: normalizedApiBaseUrl,
          email: normalizedEmail,
          name: normalizedName,
          password: normalizedPassword,
          lang: registerLang
        })
        if (onRegisterLangChange) onRegisterLangChange(registerLang)
        onNeedsVerify({
          apiBaseUrl: normalizedApiBaseUrl,
          email: normalizedEmail,
          name: normalizedName,
          password: normalizedPassword,
          lang: registerLang,
          devCode: data.devCode || ""
        })
        return
      }

      const data = await mobileLogin({
        apiBaseUrl: normalizedApiBaseUrl,
        email: normalizedEmail,
        password: normalizedPassword
      })
      onAuthenticated({
        apiBaseUrl: normalizedApiBaseUrl,
        token: data.token,
        user: data.user,
        role: data.role || data.user?.role || null,
        needsRole: Boolean(data.needsRole || !data.role)
      })
    } catch (err) {
      if (err instanceof ApiError && err.data?.needsVerification) {
        onNeedsVerify({
          apiBaseUrl: normalizedApiBaseUrl,
          email: normalizedEmail,
          name: normalizedName,
          password: normalizedPassword,
          lang: registerLang,
          devCode: err.data.devCode || ""
        })
        return
      }
      setError(errorText(err, t, "auth.failed"))
    } finally {
      setBusy(false)
    }
  }

  const finishSocial = result => {
    if (!result || result.mode === "cancelled") return
    if (result.mode === "browser") {
      setInfo(t("auth.googleOpened"))
      return
    }
    if (result.mode === "token" && result.data) {
      onAuthenticated({
        apiBaseUrl: apiBaseUrl.trim() || defaultApiBaseUrl,
        token: result.data.token,
        user: result.data.user,
        role: result.data.role || result.data.user?.role || null,
        needsRole: Boolean(result.data.needsRole || !result.data.role)
      })
    }
  }

  const handleGoogle = async () => {
    setBusy(true)
    setError("")
    setInfo("")
    try {
      const result = await signInWithGoogle({
        apiBaseUrl: apiBaseUrl.trim() || defaultApiBaseUrl
      })
      finishSocial(result)
    } catch (err) {
      setError(errorText(err, t, "auth.googleFail"))
    } finally {
      setBusy(false)
    }
  }

  const handleApple = async () => {
    setBusy(true)
    setError("")
    setInfo("")
    try {
      const result = await signInWithApple({
        apiBaseUrl: apiBaseUrl.trim() || defaultApiBaseUrl
      })
      finishSocial(result)
    } catch (err) {
      setError(errorText(err, t, "auth.appleFail"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.brandBlock}>
        <View style={styles.logoMark}>
          <Text style={styles.logoMarkText}>T</Text>
        </View>
        <Text style={styles.brand}>TakeCare</Text>
        <Text style={styles.tagline}>
          {mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}
        </Text>
      </View>

      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeChip, mode === "login" && styles.modeChipActive]}
          onPress={() => setMode("login")}
        >
          <Text style={[styles.modeChipText, mode === "login" && styles.modeChipTextActive]}>{t("auth.login")}</Text>
        </Pressable>
        <Pressable
          style={[styles.modeChip, mode === "register" && styles.modeChipActive]}
          onPress={() => setMode("register")}
        >
          <Text style={[styles.modeChipText, mode === "register" && styles.modeChipTextActive]}>{t("auth.register")}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{t("auth.email")}</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="name@example.com"
          placeholderTextColor="#8aa0b8"
        />

        {mode === "register" ? (
          <>
            <Text style={styles.label}>{t("auth.displayName")}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t("auth.namePlaceholder")}
              placeholderTextColor="#8aa0b8"
            />
          </>
        ) : null}

        <Text style={styles.label}>{t("auth.password")}</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder={t("auth.passwordHint")}
          placeholderTextColor="#8aa0b8"
        />

        {mode === "register" ? (
          <View style={styles.langBlock}>
            <Text style={styles.label}>{t("auth.pickLanguage")}</Text>
            <Text style={styles.langHint}>{t("auth.languageHint")}</Text>
            <View style={styles.langRow}>
              {LANG_OPTIONS.map((l) => (
                <Pressable
                  key={l.code}
                  style={[styles.langChip, registerLang === l.code && styles.langChipActive]}
                  onPress={() => pickLang(l.code)}
                >
                  <Text style={[styles.langChipText, registerLang === l.code && styles.langChipTextActive]}>
                    {l.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {info ? <Text style={styles.info}>{info}</Text> : null}

        <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={handleSubmit} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>{mode === "login" ? t("auth.login") : t("auth.registerSubmit")}</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t("auth.orUse")}</Text>
        <View style={styles.dividerLine} />
      </View>

      <Pressable style={[styles.socialBtn, styles.googleBtn, busy && styles.btnDisabled]} onPress={handleGoogle} disabled={busy}>
        <Text style={styles.googleBtnText}>{t("auth.google")}</Text>
      </Pressable>

      {Platform.OS === "ios" ? (
        <Pressable style={[styles.socialBtn, styles.appleBtn, busy && styles.btnDisabled]} onPress={handleApple} disabled={busy}>
          <Text style={styles.appleBtnText}>{t("auth.apple")}</Text>
        </Pressable>
      ) : (
        <Text style={styles.appleHint}>{t("auth.appleHint")}</Text>
      )}

      <Text style={styles.quickTitle}>{t("auth.quickTitle")}</Text>
      <Text style={styles.quickHint}>{t("auth.quickPassword", { password: TEST_ACCOUNT_PASSWORD })}</Text>
      <View style={styles.quickRow}>
        {quickAccounts.map(item => (
          <Pressable
            key={item.email}
            style={styles.quickChip}
            onPress={() => {
              setMode("login")
              setEmail(item.email)
              setName(item.name)
              setPassword(TEST_ACCOUNT_PASSWORD)
            }}
          >
            <Text style={styles.quickChipText}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={styles.devBtn}
        onPress={() => onOpenDevRoleSelect({
          apiBaseUrl: apiBaseUrl.trim() || defaultApiBaseUrl,
          email: email.trim().toLowerCase() || "patient@test.com",
          name: name.trim() || "Dev"
        })}
      >
        <Text style={styles.devBtnText}>{t("auth.devBypass")}</Text>
      </Pressable>

      <Pressable onPress={() => setShowAdvanced(prev => !prev)} style={styles.advancedToggle}>
        <Text style={styles.advancedToggleText}>
          {showAdvanced ? t("auth.advancedHide") : t("auth.advancedShow")}
        </Text>
      </Pressable>
      {showAdvanced ? (
        <View style={styles.advancedBox}>
          <Text style={styles.label}>API Base URL</Text>
          <TextInput
            style={styles.input}
            value={apiBaseUrl}
            onChangeText={setApiBaseUrl}
            autoCapitalize="none"
            placeholder="http://localhost:5000"
            placeholderTextColor="#8aa0b8"
          />
        </View>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.bg,
    padding: 24,
    paddingTop: 48
  },
  brandBlock: { alignItems: "center", marginBottom: 20 },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.pine,
    alignItems: "center",
    justifyContent: "center"
  },
  logoMarkText: { color: "#fff", fontSize: 32, fontWeight: "900" },
  brand: { marginTop: 12, fontSize: 28, fontWeight: "900", color: colors.text },
  tagline: { marginTop: 6, color: "#526b88", fontWeight: "600", textAlign: "center" },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  modeChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center"
  },
  modeChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  modeChipText: { color: "#526b88", fontWeight: "800" },
  modeChipTextActive: { color: "#fff" },
  langBlock: { marginTop: 4, marginBottom: 8 },
  langHint: { color: "#8aa0b8", fontSize: 12, marginBottom: 8, fontWeight: "600" },
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border
  },
  langChipActive: { backgroundColor: colors.pine, borderColor: colors.pine },
  langChipText: { color: "#526b88", fontWeight: "700", fontSize: 12 },
  langChipTextActive: { color: "#fff" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4
  },
  label: { marginTop: 10, color: "#334155", fontWeight: "800", fontSize: 13 },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#c7d8ed",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 50,
    color: colors.text,
    backgroundColor: "#f8fbff",
    fontSize: 16
  },
  error: { marginTop: 10, color: "#b42318", fontWeight: "700" },
  info: { marginTop: 10, color: "#1d4ed8", fontWeight: "700", lineHeight: 20 },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: colors.pine,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center"
  },
  btnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  dividerRow: {
    marginTop: 22,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: "#64748b", fontWeight: "700", fontSize: 12 },
  socialBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
    minHeight: 50,
    justifyContent: "center"
  },
  googleBtn: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#cbd5e1"
  },
  googleBtnText: { color: "#111827", fontWeight: "900", fontSize: 15 },
  appleBtn: { backgroundColor: "#111827" },
  appleBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  appleHint: {
    textAlign: "center",
    color: "#94a3b8",
    fontWeight: "600",
    fontSize: 12,
    marginBottom: 8
  },
  quickTitle: { marginTop: 20, color: "#667085", fontWeight: "800", fontSize: 12 },
  quickHint: { marginTop: 4, color: "#98a2b3", fontSize: 12 },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.mintSoft,
    borderWidth: 1,
    borderColor: colors.border
  },
  quickChipText: { color: colors.pine, fontWeight: "800" },
  devBtn: { marginTop: 16, alignItems: "center", padding: 10 },
  devBtnText: { color: "#94a3b8", fontWeight: "700", fontSize: 12 },
  advancedToggle: { marginTop: 8, alignItems: "center", padding: 8 },
  advancedToggleText: { color: colors.pine, fontWeight: "800" },
  advancedBox: {
    marginTop: 4,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e4e7ec"
  }
})
