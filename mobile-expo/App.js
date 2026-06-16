import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  StyleSheet,
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
  loadSession,
  loadSettings,
  saveSession,
  saveSettings
} from "./src/lib/storage"

const DEFAULT_API_BASE_URL = "http://192.168.1.100:5000"

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

  const handleUiLangChange = async (lang) => {
    setUiLang(lang)
    await saveSettings({ ...settings, uiLang: lang })
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
    await clearSession()
  }

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
  }
})
