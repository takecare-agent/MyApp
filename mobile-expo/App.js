import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  Vibration,
  View
} from "react-native"
import AuthScreen from "./src/screens/AuthScreen"
import BloodPressureScreen from "./src/screens/BloodPressureScreen"
import ChatScreen from "./src/screens/ChatScreen"
import LanguageSupportScreen from "./src/screens/LanguageSupportScreen"
import NativeFeatureScreen from "./src/screens/NativeFeatureScreen"
import PhraseLibraryScreen from "./src/screens/PhraseLibraryScreen"
import RoleHomeScreen from "./src/screens/RoleHomeScreen"
import RoleSelectScreen from "./src/screens/RoleSelectScreen"
import VisionScreen from "./src/screens/VisionScreen"
import {
  clearSession,
  loadLastSeenSosEvent,
  loadSession,
  loadSettings,
  saveLastSeenSosEvent,
  saveSession,
  saveSettings
} from "./src/lib/storage"
import { apiRequest } from "./src/lib/api"

const DEFAULT_API_BASE_URL = "http://192.168.1.100:5000"
const FAMILY_SOS_SCOPE = "family"
const EMERGENCY_VIBRATION = [0, 900, 250, 900, 250, 1400]

function getSosRecordId(record) {
  return String(record?._id || record?.eventId || "")
}

function formatSosTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString("zh-TW", { hour12: false })
}

function openPhone(phone) {
  const normalized = String(phone || "").trim()
  if (normalized) Linking.openURL(`tel:${normalized}`)
}

function openMap(record) {
  const lat = Number(record?.latitude)
  const lng = Number(record?.longitude)
  const query = Number.isFinite(lat) && Number.isFinite(lng)
    ? `${lat},${lng}`
    : String(record?.locationLabel || "").trim()
  if (query) {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`)
  }
}

function startEmergencyVibration() {
  try {
    Vibration.vibrate(EMERGENCY_VIBRATION, true)
  } catch {
    // Missing Android VIBRATE permission should not crash the app.
  }
}

function stopEmergencyVibration() {
  try {
    Vibration.cancel()
  } catch {
    // Some Android versions throw if the installed APK lacks VIBRATE.
  }
}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "")
}

function normalizeSettings(rawSettings) {
  const apiBaseUrl = trimTrailingSlash(rawSettings?.apiBaseUrl || DEFAULT_API_BASE_URL)
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
  const [lastFamilySosId, setLastFamilySosId] = useState("")
  const [familySosReady, setFamilySosReady] = useState(false)
  const [globalEmergency, setGlobalEmergency] = useState(null)
  const familySosBaselined = useRef(false)

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
          setSession({
            ...savedSession,
            apiBaseUrl:
              savedSession.apiBaseUrl || mergedSettings.apiBaseUrl
          })
          setActiveScreen("home")
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
  }

  const handleLogout = async () => {
    setSession(null)
    setActiveScreen("auth")
    setActiveFeature(null)
    setLoginDraft(null)
    setFamilySosReady(false)
    setGlobalEmergency(null)
    stopEmergencyVibration()
    await clearSession()
  }

  const closeGlobalEmergency = useCallback(() => {
    stopEmergencyVibration()
    setGlobalEmergency(null)
  }, [])

  useEffect(() => {
    let mounted = true
    setFamilySosReady(false)
    if (session?.role !== "family") return undefined
    familySosBaselined.current = false

    loadLastSeenSosEvent(FAMILY_SOS_SCOPE).then(eventId => {
      if (!mounted) return
      setLastFamilySosId(eventId)
      setFamilySosReady(true)
    })

    return () => {
      mounted = false
    }
  }, [session?.role])

  useEffect(() => {
    if (session?.role !== "family" || !session?.token || !session?.apiBaseUrl || !familySosReady) return undefined

    let stopped = false
    async function pollFamilySos() {
      try {
        const data = await apiRequest({
          apiBaseUrl: session.apiBaseUrl,
          path: "/family/sos/history",
          token: session.token
        })
        if (stopped) return
        const activeRecord = (data.records || []).find(record => record.status === "active")
        const eventId = getSosRecordId(activeRecord)
        if (!familySosBaselined.current) {
          familySosBaselined.current = true
          if (!lastFamilySosId && eventId) {
            setLastFamilySosId(eventId)
            saveLastSeenSosEvent(FAMILY_SOS_SCOPE, eventId)
            return
          }
        }
        if (!activeRecord || !eventId || eventId === lastFamilySosId) return

        setLastFamilySosId(eventId)
        saveLastSeenSosEvent(FAMILY_SOS_SCOPE, eventId)
        setGlobalEmergency(activeRecord)
        startEmergencyVibration()
      } catch {
        // Keep the app quiet during transient network gaps.
      }
    }

    pollFamilySos()
    const timer = setInterval(pollFamilySos, 5000)
    return () => {
      stopped = true
      clearInterval(timer)
      stopEmergencyVibration()
    }
  }, [familySosReady, lastFamilySosId, session?.apiBaseUrl, session?.role, session?.token])

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

  const handleProceedFromAuth = async draftInput => {
    const draft = {
      apiBaseUrl: trimTrailingSlash(draftInput.apiBaseUrl),
      email: String(draftInput.email || "").trim().toLowerCase(),
      name: String(draftInput.name || "").trim()
    }

    await handleSaveSettings({
      apiBaseUrl: draft.apiBaseUrl
    })
    setLoginDraft(draft)
    setActiveScreen("role-select")
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.bootScreen}>
        <ActivityIndicator size="large" color="#1f74d1" />
      </SafeAreaView>
    )
  }

  if (!session?.token) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {activeScreen === "role-select" ? (
          <RoleSelectScreen
            loginDraft={loginDraft}
            onBack={() => setActiveScreen("auth")}
            onLoginSuccess={handleLoginSuccess}
          />
        ) : (
          <AuthScreen
            defaultApiBaseUrl={settings.apiBaseUrl}
            onProceed={handleProceedFromAuth}
          />
        )}
        <StatusBar barStyle="dark-content" backgroundColor="#f2f7ff" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {activeScreen === "home" ? (
          <RoleHomeScreen
            role={session.role}
            user={session.user}
            apiBaseUrl={session.apiBaseUrl}
            uiLang={uiLang}
            onUiLangChange={handleUiLangChange}
            onOpenBloodPressure={() => setActiveScreen("blood-pressure")}
            onOpenVision={() => setActiveScreen("vision")}
            onOpenFeature={handleOpenFeature}
            onLogout={handleLogout}
          />
        ) : null}

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

        {activeScreen === "language-support" ? (
          <LanguageSupportScreen
            apiBaseUrl={session.apiBaseUrl}
            token={session.token}
            uiLang={uiLang}
            onUiLangChange={handleUiLangChange}
            onBack={() => setActiveScreen("home")}
          />
        ) : null}

        {activeScreen === "phrase-library" ? (
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
          />
        ) : null}
      </View>

      <Modal
        animationType="slide"
        transparent
        visible={Boolean(globalEmergency)}
        onRequestClose={closeGlobalEmergency}
      >
        <View style={styles.emergencyBackdrop}>
          <View style={styles.emergencyPanel}>
            <Text style={styles.emergencyTitle}>緊急 SOS</Text>
            <Text style={styles.emergencyText}>收到新的求救事件，手機已啟動連續震動提醒。</Text>
            <View style={styles.emergencyInfo}>
              <Text style={styles.emergencyLine}>事件：{globalEmergency?.eventId || "-"}</Text>
              <Text style={styles.emergencyLine}>姓名：{globalEmergency?.patientName || "-"}</Text>
              <Text style={styles.emergencyLine}>時間：{formatSosTime(globalEmergency?.triggeredAt)}</Text>
              <Text style={styles.emergencyLine}>位置：{globalEmergency?.locationLabel || "-"}</Text>
              <Text style={styles.emergencyLine}>電話：{globalEmergency?.patientPhone || "-"}</Text>
              <Text style={styles.emergencyLine}>訊息：{globalEmergency?.message || "-"}</Text>
            </View>
            <View style={styles.emergencyActions}>
              <Pressable style={styles.secondaryEmergencyBtn} onPress={() => openMap(globalEmergency)}>
                <Text style={styles.secondaryEmergencyText}>查看位置</Text>
              </Pressable>
              <Pressable style={styles.primaryEmergencyBtn} onPress={() => openPhone(globalEmergency?.patientPhone || "119")}>
                <Text style={styles.primaryEmergencyText}>撥打電話</Text>
              </Pressable>
            </View>
            <Pressable style={styles.dismissEmergencyBtn} onPress={closeGlobalEmergency}>
              <Text style={styles.dismissEmergencyText}>我知道了</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <StatusBar barStyle="dark-content" backgroundColor="#f2f7ff" />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: StatusBar.currentHeight || 0,
    backgroundColor: "#f2f7ff"
  },
  bootScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f2f7ff"
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
    padding: 18
  },
  emergencyTitle: {
    color: "#b42318",
    fontSize: 26,
    fontWeight: "900"
  },
  emergencyText: {
    marginTop: 6,
    color: "#7a271a",
    lineHeight: 20,
    fontWeight: "800"
  },
  emergencyInfo: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#fecdca",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff7f5",
    gap: 6
  },
  emergencyLine: {
    color: "#173e67",
    lineHeight: 20,
    fontWeight: "800"
  },
  emergencyActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14
  },
  primaryEmergencyBtn: {
    flex: 1,
    backgroundColor: "#b42318",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  primaryEmergencyText: {
    color: "#fff",
    fontWeight: "900"
  },
  secondaryEmergencyBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#c7d8ed",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  secondaryEmergencyText: {
    color: "#1f74d1",
    fontWeight: "900"
  },
  dismissEmergencyBtn: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 10
  },
  dismissEmergencyText: {
    color: "#667085",
    fontWeight: "900"
  }
})
