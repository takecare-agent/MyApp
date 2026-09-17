import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import {
  ApiError,
  mobileLogin,
  mobileMe,
  mobileRegister,
  pickReachableApiBase
} from "../lib/api"
import { signInWithGoogle } from "../lib/socialAuth"
import GoogleAuthSheet from "../components/GoogleAuthSheet"
import { LANG_OPTIONS, LANG_SHORT, DEFAULT_LANG } from "../i18n/languages"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "./new_ui/tokens"
import { NeoIcon } from "./new_ui/NeoIcons"

function isNetworkFail(message) {
  return /network request failed|failed to connect|failed to fetch|網路連線|网路连线|internet connection appears to be offline|could not connect|the internet connection appears to be offline/i.test(
    String(message || "")
  )
}

function errorText(err, t, fallbackKey) {
  const msg = String(err?.message || "")
  if (isNetworkFail(msg)) return t("auth.networkFail")
  if (msg.startsWith("auth.")) return t(msg)
  return msg || t(fallbackKey)
}

function isValidEmail(email) {
  const text = String(email || "").trim().toLowerCase()
  if (!text || text.length > 254) return false
  return /^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(text)
}

export default function AuthScreen({
  defaultApiBaseUrl,
  defaultLang,
  onAuthenticated,
  onNeedsVerify,
  onRegisterLangChange
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState("login")
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [registerLang, setRegisterLang] = useState(defaultLang || DEFAULT_LANG)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [googleUrl, setGoogleUrl] = useState("")
  const [langOpen, setLangOpen] = useState(false)

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
    if (!isValidEmail(normalizedEmail)) {
      setError(t("auth.needValidEmail"))
      return
    }
    if (normalizedPassword.length < 8) {
      setError(t("auth.needPassword"))
      return
    }

    setBusy(true)
    setError("")
    let resolvedApiBaseUrl = normalizedApiBaseUrl
    try {
      resolvedApiBaseUrl = await pickReachableApiBase(normalizedApiBaseUrl)
      if (mode === "register") {
        const data = await mobileRegister({
          apiBaseUrl: resolvedApiBaseUrl,
          email: normalizedEmail,
          name: normalizedName,
          password: normalizedPassword,
          lang: registerLang
        })
        if (onRegisterLangChange) onRegisterLangChange(registerLang)
        onNeedsVerify({
          apiBaseUrl: resolvedApiBaseUrl,
          email: normalizedEmail,
          name: normalizedName,
          password: normalizedPassword,
          lang: registerLang,
          mailHint: data.message || "",
          mailSent: data.mailSent !== false,
          devCode: data.devCode || ""
        })
        return
      }

      const data = await mobileLogin({
        apiBaseUrl: resolvedApiBaseUrl,
        email: normalizedEmail,
        password: normalizedPassword,
        lang: registerLang
      })
      onAuthenticated({
        apiBaseUrl: resolvedApiBaseUrl,
        token: data.token,
        user: data.user,
        role: data.role || data.user?.role || null,
        needsRole: Boolean(data.needsRole || !data.role)
      })
    } catch (err) {
      if (err instanceof ApiError && err.data?.needsVerification) {
        onNeedsVerify({
          apiBaseUrl: resolvedApiBaseUrl,
          email: normalizedEmail,
          name: normalizedName,
          password: normalizedPassword,
          lang: registerLang,
          mailHint: err.data?.message || "",
          mailSent: err.data?.mailSent !== false,
          devCode: err.data?.devCode || ""
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

  const finishOauthToken = async (parsed) => {
    const base = apiBaseUrl.trim() || defaultApiBaseUrl
    try {
      const me = await mobileMe({ apiBaseUrl: base, token: parsed.token })
      onAuthenticated({
        apiBaseUrl: base,
        token: me.token || parsed.token,
        user: me.user,
        role: me.role || me.user?.role || null,
        needsRole: Boolean(me.needsRole || parsed.needsRole || !me.role)
      })
    } catch (err) {
      setError(errorText(err, t, "auth.googleFail"))
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
      if (result?.mode === "cancelled") return
      if (result?.mode === "webview" && result.url) {
        setGoogleUrl(result.url)
        return
      }
      finishSocial(result)
    } catch (err) {
      setError(errorText(err, t, "auth.googleFail"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.langTop}>
        <Pressable style={styles.langBtn} onPress={() => setLangOpen(true)} accessibilityRole="button">
          <Text style={styles.langBtnText}>{LANG_SHORT[registerLang] || "中文"}</Text>
          <NeoIcon name="chevron-down" size={14} color="#A8E6CF" />
        </Pressable>
      </View>
      <View style={styles.brandBlock}>
        <Image source={require("../assets/takecare-logo.png")} style={styles.logoImage} resizeMode="contain" />
        <Text style={styles.brand}>TakeCare</Text>
        <Text style={styles.tagline}>
          {mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}
        </Text>
      </View>

      <View style={styles.modeTrack}>
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
          placeholderTextColor={colors.textMuted}
        />

        {mode === "register" ? (
          <>
            <Text style={styles.label}>{t("auth.displayName")}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t("auth.namePlaceholder")}
              placeholderTextColor={colors.textMuted}
            />
          </>
        ) : null}

        <Text style={styles.label}>{t("auth.password")}</Text>
        <View style={styles.passWrap}>
          <TextInput
            style={[styles.input, styles.passInput]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholder={t("auth.passwordHint")}
            placeholderTextColor={colors.textMuted}
          />
          <Pressable
            onPress={() => setShowPassword((prev) => !prev)}
            style={styles.eyeBtn}
            hitSlop={8}
            accessibilityRole="button"
          >
            <NeoIcon name="eye" size={20} color="#8E95A3" />
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {info ? <Text style={styles.info}>{info}</Text> : null}

        <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={handleSubmit} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#000000" />
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

      <Pressable style={[styles.socialBtn, busy && styles.btnDisabled]} onPress={handleGoogle} disabled={busy}>
        <View style={styles.socialInner}>
          <View style={styles.googleBadge}>
            <Text style={styles.googleGBlue}>G</Text>
          </View>
          <Text style={styles.socialText}>{t("auth.google")}</Text>
        </View>
      </Pressable>

      <Modal visible={langOpen} transparent animationType="fade" onRequestClose={() => setLangOpen(false)}>
        <Pressable style={styles.langMask} onPress={() => setLangOpen(false)}>
          <View style={styles.langPicker}>
            <Text style={styles.langPickerTitle}>{t("lang.pickerTitle")}</Text>
            {LANG_OPTIONS.map((l) => (
              <Pressable
                key={l.code}
                style={[styles.langOption, registerLang === l.code && styles.langOptionOn]}
                onPress={() => {
                  pickLang(l.code)
                  setLangOpen(false)
                }}
              >
                <Text style={[styles.langOptionText, registerLang === l.code && styles.langOptionTextOn]}>
                  {l.label}
                </Text>
                {registerLang === l.code ? <Text style={styles.langCheck}>✓</Text> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
    <GoogleAuthSheet
      visible={Boolean(googleUrl)}
      startUrl={googleUrl}
      apiBaseUrl={apiBaseUrl.trim() || defaultApiBaseUrl}
      onClose={() => setGoogleUrl("")}
      onToken={(parsed) => {
        setGoogleUrl("")
        finishOauthToken(parsed)
      }}
    />
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.bg,
    padding: 24,
    paddingTop: 48,
    gap: 4
  },
  brandBlock: { alignItems: "center", marginBottom: 20, gap: 6 },
  logoImage: { width: 148, height: 122 },
  brand: { marginTop: 8, fontSize: 24, fontWeight: "900", color: "#FFFFFF" },
  tagline: { marginTop: 6, color: colors.textMuted, fontWeight: "600", textAlign: "center" },
  modeTrack: {
    height: 48,
    flexDirection: "row",
    backgroundColor: "#16181D",
    borderRadius: 999,
    padding: 4,
    marginBottom: 14
  },
  modeChip: {
    flex: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center"
  },
  modeChipActive: { backgroundColor: "#10B981" },
  modeChipText: { color: "#8E95A3", fontWeight: "700" },
  modeChipTextActive: { color: "#000000", fontWeight: "700" },
  langTop: {
    alignSelf: "stretch",
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8
  },
  langBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#16181D"
  },
  langBtnText: { color: "#A8E6CF", fontWeight: "800", fontSize: 13 },
  langMask: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 80,
    paddingRight: 16
  },
  langPicker: {
    backgroundColor: "#16181D",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    minWidth: 180,
    overflow: "hidden"
  },
  langPickerTitle: {
    color: "#8E95A3",
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6
  },
  langOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)"
  },
  langOptionOn: { backgroundColor: "rgba(16,185,129,0.18)" },
  langOptionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  langOptionTextOn: { color: "#A8E6CF", fontWeight: "900" },
  langCheck: { color: "#A8E6CF", fontWeight: "900", fontSize: 14 },
  card: {
    backgroundColor: "#16181D",
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 4
  },
  label: { marginTop: 10, color: colors.textMuted, fontWeight: "800", fontSize: 13 },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    borderCurve: "continuous",
    paddingHorizontal: 14,
    height: 50,
    color: colors.text,
    backgroundColor: "#101215",
    fontSize: 16
  },
  passWrap: { marginTop: 6, justifyContent: "center" },
  passInput: { marginTop: 0, paddingRight: 44 },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    height: 50,
    width: 22,
    alignItems: "center",
    justifyContent: "center"
  },
  error: { marginTop: 10, color: colors.clay, fontWeight: "700" },
  info: { marginTop: 10, color: colors.mint, fontWeight: "700", lineHeight: 20 },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: "#10B981",
    borderRadius: 999,
    height: 50,
    alignItems: "center",
    justifyContent: "center"
  },
  btnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: "#000000", fontWeight: "700", fontSize: 16 },
  dividerRow: {
    marginTop: 22,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  socialBtn: {
    borderRadius: 16,
    borderCurve: "continuous",
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    backgroundColor: "#16181D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  socialInner: { flexDirection: "row", alignItems: "center", gap: 12 },
  googleBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center"
  },
  googleGBlue: { color: "#4285F4", fontWeight: "900", fontSize: 22 },
  socialText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 }
})
