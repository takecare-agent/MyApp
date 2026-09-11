import AsyncStorage from "@react-native-async-storage/async-storage"

const PREFIX = "TAKECARE_AVATAR_V1:"
const listeners = new Set()

function keyFor(email) {
  return PREFIX + String(email || "").trim().toLowerCase()
}

export function subscribeAvatars(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit() {
  listeners.forEach((fn) => {
    try { fn() } catch { /* ignore */ }
  })
}

export async function loadAvatarUri(email) {
  if (!email) return ""
  try {
    return (await AsyncStorage.getItem(keyFor(email))) || ""
  } catch {
    return ""
  }
}

export async function saveAvatarUri(email, uri) {
  if (!email) return
  const key = keyFor(email)
  if (uri) await AsyncStorage.setItem(key, String(uri))
  else await AsyncStorage.removeItem(key)
  emit()
}
