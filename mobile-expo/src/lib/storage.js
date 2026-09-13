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

const CHAT_NICK_KEY = "TAKECARE_EXPO_CHAT_NICK_V1"

/** LINE 式備註暱稱：僅自己裝置可見，key＝對方 email */
export async function loadChatNicknames(myEmail) {
  const raw = await AsyncStorage.getItem(scopedKey(CHAT_NICK_KEY, myEmail))
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

const HIDDEN_PRESET_KEY = "TAKECARE_EXPO_CHAT_HIDDEN_PRESET_V1"

export async function loadHiddenChatPresets(myEmail) {
  const raw = await AsyncStorage.getItem(scopedKey(HIDDEN_PRESET_KEY, myEmail))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map((k) => String(k)) : []
  } catch {
    return []
  }
}

export async function saveHiddenChatPresets(myEmail, keys) {
  const me = String(myEmail || "").trim().toLowerCase()
  if (!me) return
  const list = Array.isArray(keys) ? keys.map((k) => String(k)) : []
  await AsyncStorage.setItem(scopedKey(HIDDEN_PRESET_KEY, me), JSON.stringify(list))
}

const ACTIVITY_SEEN_KEY = "TAKECARE_WATCH_ACTIVITY_SEEN_V1"

export async function loadActivitySeenAt() {
  const raw = await AsyncStorage.getItem(ACTIVITY_SEEN_KEY)
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export async function saveActivitySeenAt(ts) {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return
  await AsyncStorage.setItem(ACTIVITY_SEEN_KEY, String(n))
}

export async function saveChatNickname(myEmail, partnerEmail, nickname) {
  const me = String(myEmail || "").trim().toLowerCase()
  const partner = String(partnerEmail || "").trim().toLowerCase()
  if (!me || !partner) return
  const map = await loadChatNicknames(me)
  const nick = String(nickname || "").trim()
  if (nick) map[partner] = nick
  else delete map[partner]
  await AsyncStorage.setItem(scopedKey(CHAT_NICK_KEY, me), JSON.stringify(map))
}
