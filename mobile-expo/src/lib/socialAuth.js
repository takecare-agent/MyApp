import { Linking, NativeModules, Platform } from "react-native"
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

/** 瀏覽器 OAuth（沿用後端 passport；不需原生 Google SDK 也能用） */
export async function startGoogleBrowserOAuth(apiBaseUrl) {
  const base = trimSlash(apiBaseUrl)
  if (!base) throw new Error("auth.needApi")
  const url = `${base}/auth/google?mobile=1`
  const can = await Linking.canOpenURL(url)
  if (!can) throw new Error("auth.googleOpenFail")
  await Linking.openURL(url)
}

async function loadConfig(apiBaseUrl) {
  try {
    return await mobileAuthConfig({ apiBaseUrl })
  } catch {
    return null
  }
}

/** 原生 Google Sign-In → 後端驗 idToken；失敗則改瀏覽器 OAuth */
export async function signInWithGoogle({ apiBaseUrl, preferBrowser = false }) {
  const config = await loadConfig(apiBaseUrl)

  if (preferBrowser || !config?.google?.webClientId) {
    await startGoogleBrowserOAuth(apiBaseUrl)
    return { mode: "browser" }
  }

  const hasNativeGoogle = Boolean(
    NativeModules?.RNGoogleSignin || NativeModules?.RNGoogleSignIn
  )
  if (!hasNativeGoogle) {
    await startGoogleBrowserOAuth(apiBaseUrl)
    return { mode: "browser" }
  }

  try {
    const { GoogleSignin } = require("@react-native-google-signin/google-signin")
    GoogleSignin.configure({
      webClientId: config.google.webClientId,
      iosClientId: config?.google?.iosClientId || undefined,
      offlineAccess: false
    })

    if (Platform.OS === "android") {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
    }

    const response = await GoogleSignin.signIn()
    if (response?.type === "cancelled") {
      return { mode: "cancelled" }
    }
    const idToken = response?.data?.idToken || (await GoogleSignin.getTokens()).idToken
    if (!idToken) throw new Error("no idToken")

    const data = await mobileAuthGoogle({ apiBaseUrl, idToken })
    return { mode: "token", data }
  } catch (err) {
    const codes = statusCodesSafe()
    if (err?.code === "SIGN_IN_CANCELLED" || (codes.SIGN_IN_CANCELLED && err?.code === codes.SIGN_IN_CANCELLED)) {
      return { mode: "cancelled" }
    }
    console.log("native google sign-in fallback:", err?.message || err)
    await startGoogleBrowserOAuth(apiBaseUrl)
    return { mode: "browser" }
  }
}

function statusCodesSafe() {
  try {
    return require("@react-native-google-signin/google-signin").statusCodes
  } catch {
    return {}
  }
}

export async function signInWithApple({ apiBaseUrl }) {
  if (Platform.OS !== "ios") {
    throw new Error("auth.appleIosOnly")
  }
  if (!NativeModules?.RNAppleAuthModule && !NativeModules?.AppleAuthModule) {
    throw new Error("auth.appleRebuild")
  }
  const appleAuth = require("@invertase/react-native-apple-authentication").default
  const config = await loadConfig(apiBaseUrl)
  if (config && config.apple && config.apple.enabled === false) {
    throw new Error("auth.appleClientId")
  }

  const response = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME]
  })

  if (!response.identityToken) {
    throw new Error("auth.appleNoToken")
  }

  const data = await mobileAuthApple({
    apiBaseUrl,
    identityToken: response.identityToken,
    fullName: response.fullName || null
  })
  return { mode: "token", data }
}
