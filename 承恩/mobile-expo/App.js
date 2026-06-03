import { StatusBar } from "expo-status-bar"
import { useEffect, useState } from "react"
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from "react-native"
import AuthScreen from "./src/screens/AuthScreen"
import BloodPressureScreen from "./src/screens/BloodPressureScreen"
import RoleHomeScreen from "./src/screens/RoleHomeScreen"
import RoleSelectScreen from "./src/screens/RoleSelectScreen"
import VisionScreen from "./src/screens/VisionScreen"
import WebAppScreen from "./src/screens/WebAppScreen"
import {
  clearSession,
  loadSession,
  loadSettings,
  saveSession,
  saveSettings
} from "./src/lib/storage"

const DEFAULT_API_BASE_URL = "http://192.168.1.100:5000"
const DEFAULT_WEB_BASE_URL = "http://192.168.1.100:5173"

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "")
}

function deriveWebBaseUrl(apiBaseUrl) {
  const normalizedApiBaseUrl = trimTrailingSlash(apiBaseUrl)
  if (!normalizedApiBaseUrl) return DEFAULT_WEB_BASE_URL

  if (/:\d+$/.test(normalizedApiBaseUrl)) {
    return normalizedApiBaseUrl.replace(/:\d+$/, ":5173")
  }

  return `${normalizedApiBaseUrl}:5173`
}

function getRoleHomePath(role) {
  if (role === "patient") return "/patient"
  if (role === "family") return "/family"
  if (role === "caregiver") return "/caregiver"
  return "/role"
}

function normalizeSettings(rawSettings) {
  const apiBaseUrl = trimTrailingSlash(rawSettings?.apiBaseUrl || DEFAULT_API_BASE_URL)
  const webBaseUrl = trimTrailingSlash(
    rawSettings?.webBaseUrl || deriveWebBaseUrl(apiBaseUrl)
  )

  return { apiBaseUrl, webBaseUrl }
}

export default function App() {
  const [booting, setBooting] = useState(true)
  const [session, setSession] = useState(null)
  const [settings, setSettings] = useState(normalizeSettings())
  const [activeScreen, setActiveScreen] = useState("auth")
  const [activeWebRoute, setActiveWebRoute] = useState({
    path: "",
    title: ""
  })
  const [loginDraft, setLoginDraft] = useState(null)

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

        if (savedSession?.token) {
          setSession({
            ...savedSession,
            apiBaseUrl:
              savedSession.apiBaseUrl || mergedSettings.apiBaseUrl,
            webBaseUrl:
              savedSession.webBaseUrl || mergedSettings.webBaseUrl
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
      ),
      webBaseUrl: trimTrailingSlash(
        nextSession.webBaseUrl || settings.webBaseUrl
      )
    }
    const roleHomePath = getRoleHomePath(mergedSession.role)
    setSession(mergedSession)
    setLoginDraft(null)
    setActiveWebRoute({
      path: roleHomePath,
      title: `${mergedSession.role || "role"} home`
    })
    setActiveScreen("web")
    await saveSession(mergedSession)
  }

  const handleLogout = async () => {
    setSession(null)
    setActiveScreen("auth")
    setActiveWebRoute({ path: "", title: "" })
    setLoginDraft(null)
    await clearSession()
  }

  const handleOpenWebRoute = (path, title) => {
    setActiveWebRoute({ path, title: title || "Web Module" })
    setActiveScreen("web")
  }

  const handleProceedFromAuth = async draftInput => {
    const draft = {
      apiBaseUrl: trimTrailingSlash(draftInput.apiBaseUrl),
      webBaseUrl: trimTrailingSlash(draftInput.webBaseUrl),
      email: String(draftInput.email || "").trim().toLowerCase(),
      name: String(draftInput.name || "").trim()
    }

    await handleSaveSettings({
      apiBaseUrl: draft.apiBaseUrl,
      webBaseUrl: draft.webBaseUrl
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
            defaultWebBaseUrl={settings.webBaseUrl}
            onProceed={handleProceedFromAuth}
          />
        )}
        <StatusBar style="dark" />
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
            webBaseUrl={session.webBaseUrl}
            onOpenBloodPressure={() => setActiveScreen("blood-pressure")}
            onOpenVision={() => setActiveScreen("vision")}
            onOpenWebRoute={handleOpenWebRoute}
            onLogout={handleLogout}
          />
        ) : null}

        {activeScreen === "blood-pressure" ? (
          <BloodPressureScreen
            role={session.role}
            apiBaseUrl={session.apiBaseUrl}
            token={session.token}
            onBack={() => setActiveScreen("home")}
          />
        ) : null}

        {activeScreen === "vision" ? (
          <VisionScreen
            role={session.role}
            apiBaseUrl={session.apiBaseUrl}
            token={session.token}
            onBack={() => setActiveScreen("home")}
          />
        ) : null}

        {activeScreen === "web" ? (
          <WebAppScreen
            role={session.role}
            token={session.token}
            apiBaseUrl={session.apiBaseUrl}
            webBaseUrl={session.webBaseUrl}
            routePath={activeWebRoute.path}
            routeTitle={activeWebRoute.title}
            onBack={() => setActiveScreen("home")}
            onLogout={handleLogout}
          />
        ) : null}
      </View>
      <StatusBar style="dark" />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
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
