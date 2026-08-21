import { PermissionsAndroid, Platform } from "react-native"
import { apiRequest } from "./api"

function getMessaging() {
  try {
    return require("@react-native-firebase/messaging").default
  } catch {
    return null
  }
}

async function requestNotificationPermission(messaging) {
  if (Platform.OS === "android" && Platform.Version >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    )
    if (result !== PermissionsAndroid.RESULTS.GRANTED) return false
  }

  if (Platform.OS === "ios") {
    const status = await messaging().requestPermission()
    return (
      status === messaging.AuthorizationStatus.AUTHORIZED ||
      status === messaging.AuthorizationStatus.PROVISIONAL
    )
  }

  return true
}

export async function registerFamilyPushToken({ apiBaseUrl, token }) {
  const messaging = getMessaging()
  if (!messaging || !apiBaseUrl || !token) return null

  try {
    const hasPermission = await requestNotificationPermission(messaging)
    if (!hasPermission) return null

    await messaging().registerDeviceForRemoteMessages()
    const pushToken = await messaging().getToken()
    if (!pushToken) return null

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

    return pushToken
  } catch {
    return null
  }
}

export function onFamilyPushTokenRefresh({ apiBaseUrl, token }) {
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
      }).catch(() => {})
    })
  } catch {
    return () => {}
  }
}

export function setBackgroundPushHandler() {
  const messaging = getMessaging()
  if (!messaging) return

  try {
    messaging().setBackgroundMessageHandler(async () => {})
  } catch {
    // Firebase is optional until google-services.json is added.
  }
}
