import { AppState, NativeModules, PermissionsAndroid, Platform } from "react-native"
import { apiRequest } from "./api"

export function isFirebaseNativeReady() {
  return Boolean(NativeModules?.RNFBAppModule)
}

function getMessaging() {
  if (!isFirebaseNativeReady()) return null
  try {
    // eslint-disable-next-line global-require
    return require("@react-native-firebase/messaging").default
  } catch (err) {
    console.warn("[push] messaging module load failed:", err?.message || err)
    return null
  }
}

async function requestNotificationPermission(messaging) {
  if (Platform.OS === "android" && Platform.Version >= 33) {
    const already = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    )
    if (already) return true
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    )
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      console.warn("[push] POST_NOTIFICATIONS denied:", result)
      return false
    }
  }

  if (Platform.OS === "ios") {
    const status = await messaging().requestPermission()
    const ok =
      status === messaging.AuthorizationStatus.AUTHORIZED ||
      status === messaging.AuthorizationStatus.PROVISIONAL
    if (!ok) console.warn("[push] iOS permission denied:", status)
    return ok
  }

  return true
}

/**
 * 註冊 FCM token 到後端。失敗時回傳 null 並打 console（勿再靜默吞掉）。
 * @returns {Promise<string|null>}
 */
export async function registerPushToken({ apiBaseUrl, token }) {
  const messaging = getMessaging()
  if (!messaging) {
    console.warn("[push] Firebase native not ready (RNFBAppModule missing)")
    return null
  }
  if (!apiBaseUrl || !token) {
    console.warn("[push] missing apiBaseUrl or session token")
    return null
  }

  try {
    const hasPermission = await requestNotificationPermission(messaging)
    if (!hasPermission) return null

    // iOS 才需要；Android 呼叫有時會丟錯，導致後面 getToken 永遠跑不到
    if (Platform.OS === "ios") {
      await messaging().registerDeviceForRemoteMessages()
    }

    const pushToken = await messaging().getToken()
    if (!pushToken) {
      console.warn("[push] getToken returned empty")
      return null
    }

    await apiRequest({
      apiBaseUrl,
      path: "/notifications/register",
      method: "POST",
      token,
      body: {
        token: pushToken,
        platform: Platform.OS
      }
    })

    console.log("[push] registered", pushToken.slice(0, 24) + "…")
    return pushToken
  } catch (err) {
    console.warn("[push] register failed:", err?.message || err)
    return null
  }
}

export function onPushTokenRefresh({ apiBaseUrl, token }) {
  const messaging = getMessaging()
  if (!messaging || !apiBaseUrl || !token) return () => {}

  try {
    return messaging().onTokenRefresh(pushToken => {
      if (!pushToken) return
      apiRequest({
        apiBaseUrl,
        path: "/notifications/register",
        method: "POST",
        token,
        body: {
          token: pushToken,
          platform: Platform.OS
        }
      })
        .then(() => console.log("[push] token refreshed"))
        .catch(err => console.warn("[push] refresh register failed:", err?.message || err))
    })
  } catch (err) {
    console.warn("[push] onTokenRefresh setup failed:", err?.message || err)
    return () => {}
  }
}

/** 回到前景時再註冊一次（避開首次 getToken 失敗／權限剛開） */
export function onAppActiveReregister({ apiBaseUrl, token }) {
  if (!apiBaseUrl || !token) return () => {}
  const sub = AppState.addEventListener("change", next => {
    if (next !== "active") return
    registerPushToken({ apiBaseUrl, token }).catch(() => {})
  })
  return () => sub.remove()
}

export function setBackgroundPushHandler() {
  if (!isFirebaseNativeReady()) return
  const messaging = getMessaging()
  if (!messaging) return

  try {
    // 帶 notification payload 時系統會自己顯示；此處保留 handler 以免 RNFB 警告
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      console.log("[push] background message", remoteMessage?.messageId || "")
    })
  } catch (err) {
    console.warn("[push] setBackgroundMessageHandler failed:", err?.message || err)
  }
}

function senderFromRemote(remoteMessage) {
  return String(remoteMessage?.data?.senderEmail || "").trim().toLowerCase()
}

/** 點系統通知 → 打開該則對話（R95） */
export function onChatNotificationOpen(handler) {
  const messaging = getMessaging()
  if (!messaging || typeof handler !== "function") return () => {}

  try {
    messaging()
      .getInitialNotification()
      .then((msg) => {
        const sender = senderFromRemote(msg)
        if (sender) handler(sender)
      })
      .catch(() => {})
    return messaging().onNotificationOpenedApp((msg) => {
      const sender = senderFromRemote(msg)
      if (sender) handler(sender)
    })
  } catch (err) {
    console.warn("[push] onChatNotificationOpen failed:", err?.message || err)
    return () => {}
  }
}
