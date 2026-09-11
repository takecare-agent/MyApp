import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Linking,
  Modal,
  NativeModules,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  Vibration,
  View
} from "react-native"
import AuthScreen from "./src/screens/AuthScreen"
import { parseOauthDeepLink } from "./src/lib/socialAuth"
import BloodPressureScreen from "./src/screens/BloodPressureScreen"
import ChatScreen from "./src/screens/ChatScreen"
import NativeFeatureScreen from "./src/screens/NativeFeatureScreen"
import PhraseLibraryScreen from "./src/screens/PhraseLibraryScreen"
import MainTabShell from "./src/screens/MainTabShell"
import RoleSelectScreen from "./src/screens/RoleSelectScreen"
import VerifyScreen from "./src/screens/VerifyScreen"
import VisionScreen from "./src/screens/VisionScreen"
import CaregiverFirstAidScreen from "./src/screens/CaregiverFirstAidScreen"
import GlobalEmergencyModal from "./src/components/GlobalEmergencyModal"
import { apiRequest, mobileMe, mobileSosInbox, caregiverSosResolve, familySosRemind, mobileGetHealthCard } from "./src/lib/api"
import {
  clearSession,
  loadLastSeenSosEvent,
  loadSession,
  loadSettings,
  saveLastSeenSosEvent,
  saveSession,
  saveSettings
} from "./src/lib/storage"
import {
  onAppActiveReregister,
  onChatNotificationOpen,
  onPushTokenRefresh,
  registerPushToken
} from "./src/lib/pushNotifications"
import { I18nProvider } from "./src/i18n/I18nContext"
import { colors } from "./src/screens/new_ui/tokens"

// 模擬器／adb reverse：localhost:5000。真機 Metro 從哪裡載 JS，API 就跟那個 host。
const LEGACY_API_BASE_URLS = [
  "http://192.168.1.100:5000",
  "http://192.168.0.10:5000"
]
function defaultApiBaseUrl() {
  const scriptURL = String(NativeModules.SourceCode?.scriptURL || "")
  const host = scriptURL.match(/^https?:\/\/([^/:]+)/)?.[1] || ""
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return `http://${host}:5000`
  }
  return "http://localhost:5000"
}
const DEFAULT_API_BASE_URL = defaultApiBaseUrl()
const FAMILY_SOS_SCOPE = "family"
const CAREGIVER_SOS_SCOPE = "caregiver"
const EMERGENCY_VIBRATION = [0, 900, 250, 900, 250, 1400]

function getSosRecordId(record) {
  return String(record?._id || record?.eventId || "")
}

function isOpenSosStatus(status) {
  return status === "active" || status === "handling"
}

function openPhone(phone) {
  const normalized = String(phone || "").trim()
  if (normalized) Linking.openURL(`tel:${normalized}`)
}

function startEmergencyVibration() {
  try {
    Vibration.vibrate(EMERGENCY_VIBRATION, true)
  } catch {
    // Missing Android VIBRATE permission should not crash the app.
  }
  try {
    NativeModules.EmergencySound?.start?.()
  } catch {
    // Emergency sound is Android-only and optional in development builds.
  }
}

function stopEmergencyVibration() {
  try {
    Vibration.cancel()
  } catch {
    // Some Android versions throw if the installed APK lacks VIBRATE.
  }
  try {
    NativeModules.EmergencySound?.stop?.()
  } catch {
    // Ignore missing native sound module.
  }
}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "")
}

function normalizeSettings(rawSettings) {
  const requestedApiBaseUrl = trimTrailingSlash(rawSettings?.apiBaseUrl || DEFAULT_API_BASE_URL)
  const apiBaseUrl = LEGACY_API_BASE_URLS.includes(requestedApiBaseUrl)
    ? DEFAULT_API_BASE_URL
    : requestedApiBaseUrl
  const uiLang = rawSettings?.uiLang || "zh"
  return { apiBaseUrl, uiLang }
}

export default function App() {
  const [booting, setBooting] = useState(true)
  const [session, setSession] = useState(null)
  const [settings, setSettings] = useState(normalizeSettings())
  const [activeScreen, setActiveScreen] = useState("auth")
  const [activeFeature, setActiveFeature] = useState(null)
  const [loginDraft, setLoginDraft] = useState(null)
  const [uiLang, setUiLang] = useState("zh")
  const [lastCareSosId, setLastCareSosId] = useState("")
  const [careSosReady, setCareSosReady] = useState(false)
  const [globalEmergency, setGlobalEmergency] = useState(null)
  const [emergencyBusy, setEmergencyBusy] = useState(false)
  const [healthCard, setHealthCard] = useState(null)
  const [healthCardLoading, setHealthCardLoading] = useState(false)
  const [healthCardError, setHealthCardError] = useState("")
  const [firstAidFullOpen, setFirstAidFullOpen] = useState(false)
  const [emergencyActionMsg, setEmergencyActionMsg] = useState("")
  const [emergencyActionMsgKey, setEmergencyActionMsgKey] = useState("")
  const [pendingChatPartner, setPendingChatPartner] = useState("")
  const careSosBaselined = useRef(false)

  const handleUiLangChange = async (lang) => {
    setUiLang(lang)
    await saveSettings({ ...settings, uiLang: lang })
    if (session?.token && session?.apiBaseUrl) {
      try {
        await apiRequest({ apiBaseUrl: session.apiBaseUrl, path: "/update-lang", method: "PATCH", token: session.token, body: { lang } })
      } catch { /* 靜默失敗，不影響 UI 切換 */ }
    }
  }

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      try {
        const [savedSession, savedSettings] = await Promise.all([
          loadSession(),
          loadSettings()
        ])
        if (!mounted) return

        const mergedSettings = normalizeSettings(savedSettings)
        setSettings(mergedSettings)
        setUiLang(mergedSettings.uiLang)

        if (savedSession?.token) {
          const sessionApiBaseUrl = trimTrailingSlash(savedSession.apiBaseUrl || "")
          const nextSession = {
            ...savedSession,
            apiBaseUrl: LEGACY_API_BASE_URLS.includes(sessionApiBaseUrl)
              ? mergedSettings.apiBaseUrl
              : sessionApiBaseUrl || mergedSettings.apiBaseUrl
          }
          setSession(nextSession)
          if (!nextSession.role) {
            setLoginDraft({
              apiBaseUrl: nextSession.apiBaseUrl,
              email: nextSession.user?.email || "",
              name: nextSession.user?.name || "",
              token: nextSession.token,
              mode: "auth"
            })
            setActiveScreen("role-select")
          } else {
            setActiveScreen("home")
          }
        } else {
          setActiveScreen("auth")
        }
      } finally {
        if (mounted) setBooting(false)
      }
    }

    bootstrap()
    return () => {
      mounted = false
    }
  }, [])

  const handleSaveSettings = async nextSettingsInput => {
    const nextSettings = normalizeSettings(nextSettingsInput)
    setSettings(nextSettings)
    await saveSettings(nextSettings)
  }

  const handleLoginSuccess = async nextSession => {
    const mergedSession = {
      ...nextSession,
      apiBaseUrl: trimTrailingSlash(
        nextSession.apiBaseUrl || settings.apiBaseUrl
      )
    }
    setSession(mergedSession)
    setLoginDraft(null)
    setActiveFeature(null)
    setActiveScreen("home")
    await saveSession(mergedSession)
    // 登入後以帳號 User.lang 為準（註冊時已選；設定可改）
    const accountLang = nextSession?.user?.lang
    if (accountLang && ["zh", "en", "id", "vi", "tl", "th"].includes(accountLang)) {
      setUiLang(accountLang)
      await saveSettings({ ...settings, uiLang: accountLang, apiBaseUrl: mergedSession.apiBaseUrl })
    }
  }

  const handleLogout = async () => {
    setSession(null)
    setActiveScreen("auth")
    setActiveFeature(null)
    setLoginDraft(null)
    setCareSosReady(false)
    setGlobalEmergency(null)
    stopEmergencyVibration()
    await clearSession()
  }

  const handleSessionUpdate = async partial => {
    const mergedSession = {
      ...session,
      ...partial,
      apiBaseUrl: trimTrailingSlash(
        partial.apiBaseUrl || session?.apiBaseUrl || settings.apiBaseUrl
      )
    }
    setSession(mergedSession)
    await saveSession(mergedSession)
  }

  const closeGlobalEmergency = useCallback(() => {
    stopEmergencyVibration()
    setGlobalEmergency(null)
    setEmergencyActionMsg("")
    setEmergencyActionMsgKey("")
  }, [])

  const handleSosResolve = useCallback(async () => {
    const id = getSosRecordId(globalEmergency)
    if (!id || !session?.token || emergencyBusy) return
    setEmergencyBusy(true)
    setEmergencyActionMsg("")
    setEmergencyActionMsgKey("")
    try {
      await caregiverSosResolve({
        apiBaseUrl: session.apiBaseUrl,
        token: session.token,
        id
      })
      setEmergencyActionMsgKey("sos.resolvedHint")
      stopEmergencyVibration()
      // 立即關卡；家屬端靠 inbox 輪詢＋resolved 推播同步清掉
      setGlobalEmergency(null)
      setEmergencyActionMsg("")
      setEmergencyActionMsgKey("")
    } catch (err) {
      setEmergencyActionMsg(err.message || "")
      setEmergencyActionMsgKey("sos.resolveFail")
    } finally {
      setEmergencyBusy(false)
    }
  }, [emergencyBusy, globalEmergency, session?.apiBaseUrl, session?.token])

  const handleSosRemind = useCallback(async () => {
    const id = getSosRecordId(globalEmergency)
    if (!id || !session?.token || emergencyBusy) return
    setEmergencyBusy(true)
    setEmergencyActionMsg("")
    setEmergencyActionMsgKey("")
    try {
      await familySosRemind({
        apiBaseUrl: session.apiBaseUrl,
        token: session.token,
        id
      })
      setEmergencyActionMsgKey("sos.remindHint")
    } catch (err) {
      setEmergencyActionMsg(err.message || "")
      setEmergencyActionMsgKey("sos.remindFail")
    } finally {
      setEmergencyBusy(false)
    }
  }, [emergencyBusy, globalEmergency, session?.apiBaseUrl, session?.token])

  const openHealthCard = useCallback(async () => {
    const patientEmail =
      globalEmergency?.patientEmail ||
      session?.user?.linkedPatientEmail ||
      session?.user?.activePatientEmail ||
      ""
    if (!patientEmail || !session?.token) {
      setHealthCard(null)
      setHealthCardError("missing-elder")
      setHealthCardLoading(false)
      return
    }
    setHealthCardLoading(true)
    setHealthCardError("")
    try {
      const data = await mobileGetHealthCard({
        apiBaseUrl: session.apiBaseUrl,
        token: session.token,
        patientEmail
      })
      setHealthCard(data?.healthCard || null)
    } catch (err) {
      setHealthCard(null)
      setHealthCardError(err.message || "讀取失敗")
    } finally {
      setHealthCardLoading(false)
    }
  }, [
    globalEmergency?.patientEmail,
    session?.apiBaseUrl,
    session?.token,
    session?.user?.activePatientEmail,
    session?.user?.linkedPatientEmail
  ])

  useEffect(() => {
    let mounted = true
    setCareSosReady(false)
    const role = session?.role
    if (role !== "family" && role !== "caregiver") return undefined
    careSosBaselined.current = false
    const scope = role === "caregiver" ? CAREGIVER_SOS_SCOPE : FAMILY_SOS_SCOPE

    loadLastSeenSosEvent(scope).then(eventId => {
      if (!mounted) return
      setLastCareSosId(eventId)
      setCareSosReady(true)
    })

    return () => {
      mounted = false
    }
  }, [session?.role])

  useEffect(() => {
    const role = session?.role
    if ((role !== "family" && role !== "caregiver") || !session?.token || !session?.apiBaseUrl || !careSosReady) {
      return undefined
    }

    const scope = role === "caregiver" ? CAREGIVER_SOS_SCOPE : FAMILY_SOS_SCOPE

    let stopped = false
    async function pollCareSos() {
      try {
        const data = await mobileSosInbox({
          apiBaseUrl: session.apiBaseUrl,
          token: session.token
        })
        if (stopped) return
        const activeRecord = (data.records || []).find(record => isOpenSosStatus(record.status))
        const eventId = getSosRecordId(activeRecord)
        if (!activeRecord) {
          setGlobalEmergency(prev => {
            if (prev) stopEmergencyVibration()
            return null
          })
          return
        }
        if (!careSosBaselined.current) {
          careSosBaselined.current = true
          if (!lastCareSosId && eventId) {
            setLastCareSosId(eventId)
            saveLastSeenSosEvent(scope, eventId)
            return
          }
        }
        // 同一件 SOS：若卡仍開著，刷新地址／狀態；家屬關閉後不重彈
        setGlobalEmergency(prev => {
          if (prev && getSosRecordId(prev) === eventId) return activeRecord
          return prev
        })
        if (!eventId || eventId === lastCareSosId) return

        setLastCareSosId(eventId)
        saveLastSeenSosEvent(scope, eventId)
        setGlobalEmergency(activeRecord)
        startEmergencyVibration()
      } catch {
        // Keep the app quiet during transient network gaps.
      }
    }

    pollCareSos()
    const timer = setInterval(pollCareSos, 5000)
    return () => {
      stopped = true
      clearInterval(timer)
      stopEmergencyVibration()
    }
  }, [careSosReady, lastCareSosId, session?.apiBaseUrl, session?.role, session?.token])

  useEffect(() => {
    const canRegisterPush =
      session?.role === "family" || session?.role === "caregiver" || session?.role === "patient"
    if (!canRegisterPush || !session?.token || !session?.apiBaseUrl) return undefined

    let cancelled = false
    const run = async () => {
      // 首次＋短暫重試（模擬器／冷啟動 getToken 偶發失敗）
      for (const delay of [0, 1500, 4000]) {
        if (cancelled) return
        if (delay) await new Promise(r => setTimeout(r, delay))
        const ok = await registerPushToken({
          apiBaseUrl: session.apiBaseUrl,
          token: session.token
        })
        if (ok) return
      }
    }
    run()

    const unsubRefresh = onPushTokenRefresh({
      apiBaseUrl: session.apiBaseUrl,
      token: session.token
    })
    const unsubActive = onAppActiveReregister({
      apiBaseUrl: session.apiBaseUrl,
      token: session.token
    })

    return () => {
      cancelled = true
      unsubRefresh()
      unsubActive()
    }
  }, [session?.apiBaseUrl, session?.role, session?.token])

  useEffect(() => {
    if (!session?.token) return undefined
    return onChatNotificationOpen((senderEmail) => {
      setActiveScreen("home")
      setPendingChatPartner(senderEmail)
    })
  }, [session?.token])

  // 舊全螢幕 feature 路由：目前無呼叫端（主路徑＝MainTabShell）。保留給未來深連／推播，勿誤以為現用。
  const handleOpenFeature = feature => {
    setActiveFeature(feature)
    if (feature?.special === "language") {
      setActiveScreen("language-support")
    } else if (feature?.special === "phrase-library") {
      setActiveScreen("phrase-library")
    } else if (feature?.special === "chat") {
      setActiveScreen("chat")
    } else {
      setActiveScreen("feature")
    }
  }

  const persistApiBase = async apiBaseUrl => {
    const next = trimTrailingSlash(apiBaseUrl)
    if (next) await handleSaveSettings({ apiBaseUrl: next })
    return next
  }

  const handleAuthenticated = async payload => {
    const apiBaseUrl = await persistApiBase(payload.apiBaseUrl || settings.apiBaseUrl)
    const accountLang = payload.user?.lang
    if (accountLang && ["zh", "en", "id", "vi", "tl", "th"].includes(accountLang)) {
      setUiLang(accountLang)
      await saveSettings({ ...settings, apiBaseUrl, uiLang: accountLang })
    }
    if (payload.needsRole || !payload.role) {
      setLoginDraft({
        apiBaseUrl,
        email: payload.user?.email || "",
        name: payload.user?.name || "",
        token: payload.token,
        mode: "auth"
      })
      setActiveScreen("role-select")
      return
    }
    await handleLoginSuccess({
      token: payload.token,
      role: payload.role,
      user: payload.user,
      apiBaseUrl
    })
  }

  const handleNeedsVerify = async draftInput => {
    const apiBaseUrl = await persistApiBase(draftInput.apiBaseUrl || settings.apiBaseUrl)
    setLoginDraft({
      apiBaseUrl,
      email: String(draftInput.email || "").trim().toLowerCase(),
      name: String(draftInput.name || "").trim(),
      initialCode: draftInput.devCode || "",
      mode: "auth",
      intent: "register"
    })
    setActiveScreen("verify")
  }

  const handleOpenDevRoleSelect = async draftInput => {
    const apiBaseUrl = await persistApiBase(draftInput.apiBaseUrl || settings.apiBaseUrl)
    setLoginDraft({
      apiBaseUrl,
      email: String(draftInput.email || "patient@test.com").trim().toLowerCase(),
      name: String(draftInput.name || "Dev").trim(),
      mode: "dev"
    })
    setActiveScreen("role-select")
  }

  const handleVerified = async payload => {
    const apiBaseUrl = await persistApiBase(payload.apiBaseUrl || loginDraft?.apiBaseUrl || settings.apiBaseUrl)
    if (payload.needsRole || !payload.role) {
      setLoginDraft({
        apiBaseUrl,
        email: payload.user?.email || loginDraft?.email || "",
        name: payload.user?.name || loginDraft?.name || "",
        token: payload.token,
        mode: "auth",
        intent: "register"
      })
      setActiveScreen("role-select")
      return
    }
    await handleLoginSuccess({
      token: payload.token,
      role: payload.role,
      user: payload.user,
      apiBaseUrl
    })
  }

  useEffect(() => {
    if (booting) return undefined

    const consumeOauthUrl = async url => {
      const parsed = parseOauthDeepLink(url)
      if (!parsed?.token) return
      try {
        const apiBaseUrl = settings.apiBaseUrl
        const me = await mobileMe({ apiBaseUrl, token: parsed.token })
        await handleAuthenticated({
          apiBaseUrl,
          token: me.token || parsed.token,
          user: me.user,
          role: me.role || me.user?.role || null,
          needsRole: Boolean(me.needsRole || parsed.needsRole || !me.role)
        })
      } catch (err) {
        console.log("oauth deep link failed:", err?.message || err)
      }
    }

    Linking.getInitialURL().then(url => {
      if (url) consumeOauthUrl(url)
    })
    const sub = Linking.addEventListener("url", event => {
      if (event?.url) consumeOauthUrl(event.url)
    })
    return () => sub.remove()
  }, [booting, settings.apiBaseUrl])

  if (booting) {
    return (
      <I18nProvider lang={uiLang}>
        <SafeAreaView style={styles.bootScreen}>
          <ActivityIndicator size="large" color={colors.pine} />
        </SafeAreaView>
      </I18nProvider>
    )
  }

  if (!session?.token || !session?.role) {
    const forceRoleSelect = Boolean(session?.token && !session?.role)
    return (
      <I18nProvider lang={uiLang}>
      <SafeAreaView style={styles.safeArea}>
        {activeScreen === "role-select" || forceRoleSelect ? (
          <RoleSelectScreen
            loginDraft={
              loginDraft ||
              (session?.token
                ? {
                    apiBaseUrl: session.apiBaseUrl,
                    email: session.user?.email || "",
                    name: session.user?.name || "",
                    token: session.token,
                    mode: "auth"
                  }
                : null)
            }
            onBack={() => {
              if (forceRoleSelect) {
                handleLogout()
                return
              }
              setActiveScreen(
                loginDraft?.token && loginDraft?.intent === "register" ? "verify" : "auth"
              )
            }}
            onLoginSuccess={handleLoginSuccess}
          />
        ) : activeScreen === "verify" ? (
          <VerifyScreen
            apiBaseUrl={loginDraft?.apiBaseUrl || settings.apiBaseUrl}
            email={loginDraft?.email}
            initialCode={loginDraft?.initialCode || ""}
            onBack={() => setActiveScreen("auth")}
            onVerified={handleVerified}
          />
        ) : (
          <AuthScreen
            defaultApiBaseUrl={settings.apiBaseUrl}
            defaultLang={uiLang}
            onAuthenticated={handleAuthenticated}
            onNeedsVerify={handleNeedsVerify}
            onOpenDevRoleSelect={handleOpenDevRoleSelect}
            onRegisterLangChange={async (code) => {
              setUiLang(code)
              await saveSettings({ ...settings, uiLang: code })
            }}
          />
        )}
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      </SafeAreaView>
      </I18nProvider>
    )
  }

  return (
    <I18nProvider lang={uiLang}>
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {activeScreen === "home" ? (
          <MainTabShell
            role={session.role}
            user={session.user}
            apiBaseUrl={session.apiBaseUrl}
            token={session.token}
            uiLang={uiLang}
            onUiLangChange={handleUiLangChange}
            onLogout={handleLogout}
            onSessionUpdate={handleSessionUpdate}
            openChatWithEmail={pendingChatPartner}
            onOpenChatConsumed={() => setPendingChatPartner("")}
          />
        ) : null}

        {/* 舊全螢幕路由保留：推播／外部深連可再用 */}
        {activeScreen === "blood-pressure" ? (
          <BloodPressureScreen
            role={session.role}
            user={session.user}
            apiBaseUrl={session.apiBaseUrl}
            token={session.token}
            uiLang={uiLang}
            onBack={() => setActiveScreen("home")}
          />
        ) : null}

        {activeScreen === "vision" ? (
          <VisionScreen
            role={session.role}
            apiBaseUrl={session.apiBaseUrl}
            token={session.token}
            uiLang={uiLang}
            onBack={() => setActiveScreen("home")}
          />
        ) : null}

        {activeScreen === "feature" ? (
          <NativeFeatureScreen
            feature={activeFeature}
            role={session.role}
            user={session.user}
            apiBaseUrl={session.apiBaseUrl}
            token={session.token}
            uiLang={uiLang}
            onBack={() => setActiveScreen("home")}
          />
        ) : null}

        {activeScreen === "language-support" || activeScreen === "phrase-library" ? (
          <PhraseLibraryScreen
            apiBaseUrl={session.apiBaseUrl}
            token={session.token}
            uiLang={uiLang}
            role={session.role}
            onBack={() => setActiveScreen("home")}
          />
        ) : null}

        {activeScreen === "chat" ? (
          <ChatScreen
            apiBaseUrl={session.apiBaseUrl}
            token={session.token}
            myEmail={session.user?.email}
            role={session.role}
            uiLang={uiLang}
            onBack={() => setActiveScreen("home")}
            onOpenCareCircle={() => setActiveScreen("home")}
          />
        ) : null}
      </View>

      <GlobalEmergencyModal
        visible={Boolean(globalEmergency)}
        record={globalEmergency}
        role={session?.role}
        busy={emergencyBusy}
        actionMsg={emergencyActionMsg}
        actionMsgKey={emergencyActionMsgKey}
        apiBaseUrl={session?.apiBaseUrl}
        token={session?.token}
        healthCard={healthCard}
        healthLoading={healthCardLoading}
        healthError={healthCardError}
        onResolve={handleSosResolve}
        onRemind={handleSosRemind}
        onOpen119={() => openPhone("119")}
        onOpenHealth={openHealthCard}
        onOpenFullGuide={() => setFirstAidFullOpen(true)}
        onDismiss={closeGlobalEmergency}
      />

      <Modal
        animationType="slide"
        visible={firstAidFullOpen}
        onRequestClose={() => setFirstAidFullOpen(false)}
      >
        <CaregiverFirstAidScreen
          onBack={() => setFirstAidFullOpen(false)}
          apiBaseUrl={session?.apiBaseUrl}
          token={session?.token}
        />
      </Modal>

      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
    </SafeAreaView>
    </I18nProvider>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: StatusBar.currentHeight || 0,
    backgroundColor: colors.bg
  },
  bootScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg
  },
  container: {
    flex: 1
  },
  emergencyBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(127, 29, 29, 0.52)"
  },
  emergencyPanel: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    gap: 8
  },
  emergencyStatus: {
    color: "#b42318",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.2
  },
  emergencyMessage: {
    color: "#7a271a",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34
  },
  emergencyMapBtn: {
    alignSelf: "flex-start",
    marginTop: 4,
    backgroundColor: "#fef3f2",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#fecdca"
  },
  emergencyMapBtnText: {
    color: "#b42318",
    fontWeight: "800",
    fontSize: 14
  },
  emergencyAddress: {
    color: "#344054",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22
  },
  emergencyName: {
    color: "#98a2b3",
    fontSize: 13,
    fontWeight: "600"
  },
  emergencyHint: {
    color: "#027a48",
    fontWeight: "700",
    fontSize: 13
  },
  emergencyActionsCol: {
    marginTop: 8,
    gap: 10
  },
  cta119: {
    backgroundColor: "#b42318",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center"
  },
  cta119Text: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 1
  },
  ctaSecondary: {
    backgroundColor: "#dc6803",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center"
  },
  ctaSecondaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900"
  },
  ctaGhost: {
    borderWidth: 1.5,
    borderColor: "#d0d5dd",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 46,
    justifyContent: "center",
    backgroundColor: "#fff"
  },
  ctaGhostText: {
    color: "#344054",
    fontSize: 15,
    fontWeight: "800"
  },
  ctaDisabled: {
    opacity: 0.55
  },
  handlingBadge: {
    backgroundColor: "#ecfdf3",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#abefc6"
  },
  handlingBadgeText: {
    color: "#027a48",
    fontWeight: "800",
    textAlign: "center"
  },
  dismissEmergencyBtn: {
    marginTop: 4,
    alignItems: "center",
    paddingVertical: 10
  },
  dismissEmergencyText: {
    color: "#667085",
    fontWeight: "900"
  },
  healthBackdrop: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(16, 24, 40, 0.55)",
    padding: 20
  },
  healthPanel: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    maxHeight: "80%"
  },
  healthTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#101828"
  },
  healthSub: {
    marginTop: 4,
    color: "#667085",
    fontWeight: "600",
    marginBottom: 10
  },
  healthScroll: {
    maxHeight: 360
  },
  healthRow: {
    marginBottom: 10,
    gap: 2
  },
  healthLabel: {
    color: "#98a2b3",
    fontSize: 12,
    fontWeight: "700"
  },
  healthValue: {
    color: "#101828",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22
  },
  firstAidToggle: {
    marginTop: 8,
    marginBottom: 6
  },
  firstAidToggleText: {
    color: colors.pine,
    fontWeight: "800"
  },
  firstAidLine: {
    color: "#344054",
    lineHeight: 22,
    marginBottom: 4
  },
  healthClose: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 10
  },
  healthCloseText: {
    color: "#667085",
    fontWeight: "900"
  }
})
