import { Platform } from "react-native"
import { mobileAuthApple, mobileAuthGoogle, mobileAuthConfig } from "./api"

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "")
}

export function parseOauthDeepLink(url) {
  if (!url || !String(url).startsWith("takecare://")) return null
  try {
    const normalized = String(url).replace("takecare://", "https://takecare.local/")
    const parsed = new URL(normalized)
    const token = parsed.searchParams.get("token")
    if (!token) return null
    return {
      token,
      needsRole: parsed.searchParams.get("needsRole") === "1",
      email: parsed.searchParams.get("email") || ""
    }
  } catch {
    return null
  }
}

function isCancelled(err) {
  const code = String(err?.code || err?.message || "")
  return (
    code === "SIGN_IN_CANCELLED" ||
    code === "1001" ||
    /cancel/i.test(code) ||
    err?.type === "cancelled"
  )
}

function googleWebUrl(apiBaseUrl) {
  return `${trimSlash(apiBaseUrl)}/auth/google?mobile=1`
}

/**
 * iOS 沒有 Google iOS OAuth client + reversed URL scheme 時，原生 SDK 會直接閃退。
 * 官方做法：Info.plist 加 com.googleusercontent.apps.xxx，configure(webClientId)。
 * 目前專案沒有 iOS client，所以 iOS 一律走 App 內 WebView OAuth（Reload 即可，不必重編）。
 * Android 可先試原生，失敗再 WebView。
 */
export async function signInWithGoogle({ apiBaseUrl }) {
  const base = trimSlash(apiBaseUrl)
  if (!base) throw new Error("auth.needApi")
  const fallback = { mode: "webview", url: googleWebUrl(base) }

  if (Platform.OS !== "android") return fallback

  try {
    const config = await loadConfig(apiBaseUrl)
    const { GoogleSignin } = require("@react-native-google-signin/google-signin")
    const webClientId = config?.google?.webClientId || ""
    if (!webClientId) return fallback
    GoogleSignin.configure({
      webClientId,
      offlineAccess: false
    })
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
    try { await GoogleSignin.signOut() } catch { /* 清掉上次帳號才能重選 */ }
    const response = await GoogleSignin.signIn()
    if (response?.type === "cancelled") return { mode: "cancelled" }
    const idToken =
      response?.data?.idToken ||
      response?.idToken ||
      (await GoogleSignin.getTokens()).idToken
    if (!idToken) throw new Error("no idToken")
    const data = await mobileAuthGoogle({ apiBaseUrl, idToken })
    return { mode: "token", data }
  } catch (err) {
    if (isCancelled(err)) return { mode: "cancelled" }
    console.log("native google sign-in fallback:", err?.message || err)
    return fallback
  }
}

async function loadConfig(apiBaseUrl) {
  try {
    return await mobileAuthConfig({ apiBaseUrl })
  } catch {
    return null
  }
}

export async function signInWithApple({ apiBaseUrl }) {
  if (Platform.OS !== "ios") {
    throw new Error("auth.appleIosOnly")
  }
  let appleAuth
  try {
    appleAuth = require("@invertase/react-native-apple-authentication").default
  } catch {
    throw new Error("auth.appleRebuild")
  }
  if (appleAuth.isSupported === false) {
    throw new Error("auth.appleRebuild")
  }
  try {
    const response = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME]
    })

    if (response?.user && appleAuth.State && response.state === appleAuth.State.CANCELLED) {
      return { mode: "cancelled" }
    }
    if (!response.identityToken) {
      throw new Error("auth.appleNoToken")
    }

    const data = await mobileAuthApple({
      apiBaseUrl,
      identityToken: response.identityToken,
      fullName: response.fullName || null
    })
    return { mode: "token", data }
  } catch (err) {
    const code = String(err?.code ?? "")
    const msg = String(err?.message || "")
    if (isCancelled(err)) return { mode: "cancelled" }
    if (code === "1000" || /1000/.test(msg)) {
      throw new Error("auth.appleCode1000")
    }
    if (
      /not available|authorizationattemptfailed|com\.apple\.AuthenticationServices/i.test(msg)
    ) {
      throw new Error("auth.appleRebuild")
    }
    throw err
  }
}
