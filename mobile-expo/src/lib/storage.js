import AsyncStorage from "@react-native-async-storage/async-storage"

const SESSION_KEY = "TAKECARE_EXPO_SESSION_V1"
const SETTINGS_KEY = "TAKECARE_EXPO_SETTINGS_V1"
const SOS_PHONE_KEY = "TAKECARE_EXPO_SOS_PHONE_V1"
const LAST_SOS_EVENT_KEY = "TAKECARE_EXPO_LAST_SOS_EVENT_V1"
const CHAT_PARTNER_KEY = "TAKECARE_EXPO_CHAT_PARTNER_V1"

function scopedKey(prefix, scope) {
  return `${prefix}:${String(scope || "default").trim() || "default"}`
}

export async function saveSession(session) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export async function loadSession() {
  const raw = await AsyncStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function clearSession() {
  await AsyncStorage.removeItem(SESSION_KEY)
}

export async function saveSettings(settings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export async function loadSettings() {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function saveSosPhone(scope, phone) {
  await AsyncStorage.setItem(scopedKey(SOS_PHONE_KEY, scope), String(phone || "").trim())
}

export async function loadSosPhone(scope) {
  return (await AsyncStorage.getItem(scopedKey(SOS_PHONE_KEY, scope))) || ""
}

export async function saveLastSeenSosEvent(scope, eventId) {
  await AsyncStorage.setItem(scopedKey(LAST_SOS_EVENT_KEY, scope), String(eventId || ""))
}

export async function loadLastSeenSosEvent(scope) {
  return (await AsyncStorage.getItem(scopedKey(LAST_SOS_EVENT_KEY, scope))) || ""
}

export async function saveChatPartner(myEmail, partnerEmail) {
  await AsyncStorage.setItem(scopedKey(CHAT_PARTNER_KEY, myEmail), String(partnerEmail || "").trim())
}

export async function loadChatPartner(myEmail) {
  return (await AsyncStorage.getItem(scopedKey(CHAT_PARTNER_KEY, myEmail))) || ""
}
