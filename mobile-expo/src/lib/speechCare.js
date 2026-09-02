import { PermissionsAndroid, Platform } from "react-native"
import Voice from "@react-native-voice/voice"
import Tts from "react-native-tts"
import { apiRequest } from "./api"

export const SPEECH_LOCALE = {
  zh: "zh-TW",
  en: "en-US",
  id: "id-ID",
  vi: "vi-VN",
  tl: "fil-PH",
  th: "th-TH"
}

export async function requestMicPermission(labels) {
  if (Platform.OS !== "android") return true
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: labels?.title || "",
        message: labels?.message || "",
        buttonPositive: labels?.allow || "OK"
      }
    )
    return result === PermissionsAndroid.RESULTS.GRANTED
  } catch {
    return false
  }
}

export function pickBestTranscript(value) {
  const list = Array.isArray(value) ? value.map((s) => String(s || "").trim()).filter(Boolean) : []
  if (!list.length) return ""
  return list.reduce((best, cur) => (cur.length > best.length ? cur : best), list[0])
}

export async function polishSpeechText({ apiBaseUrl, token, text, lang }) {
  const raw = String(text || "").trim()
  if (!raw || !apiBaseUrl || !token) return raw
  try {
    const data = await apiRequest({
      apiBaseUrl,
      path: "/stt-polish",
      method: "POST",
      token,
      body: { text: raw, lang }
    })
    return String(data?.text || raw).trim() || raw
  } catch {
    return raw
  }
}

export async function isVoiceAvailable() {
  try {
    const ok = await Voice.isAvailable()
    return Boolean(ok)
  } catch {
    return false
  }
}

/**
 * 只在講完（onSpeechEnd）才交最終稿。Android 的 onSpeechResults 會一直噴半句，
 * 若在那裡翻譯／朗讀就會覆誦十幾次。
 */
export function bindUtteranceHandlers({ onHeard, onComplete, onError }) {
  let last = ""
  let completed = false
  const finish = () => {
    if (completed) return
    completed = true
    onComplete?.(last)
  }
  Voice.onSpeechPartialResults = (e) => {
    const text = pickBestTranscript(e?.value)
    if (text) {
      last = text
      onHeard?.(text)
    }
  }
  Voice.onSpeechResults = (e) => {
    const text = pickBestTranscript(e?.value)
    if (text) {
      last = text
      onHeard?.(text)
    }
  }
  Voice.onSpeechEnd = () => finish()
  Voice.onSpeechError = () => {
    if (last) finish()
    else onError?.()
  }
  return {
    completeNow: () => finish(),
    reset: () => {
      last = ""
      completed = false
    }
  }
}

export async function startListening(lang) {
  const available = await isVoiceAvailable()
  if (!available) {
    const err = new Error("VOICE_UNAVAILABLE")
    err.code = "VOICE_UNAVAILABLE"
    throw err
  }
  const locale = SPEECH_LOCALE[lang] || SPEECH_LOCALE.zh
  try {
    await Voice.start(locale, {
      EXTRA_MAX_RESULTS: 5,
      EXTRA_PARTIAL_RESULTS: false,
      EXTRA_LANGUAGE_MODEL: "LANGUAGE_MODEL_FREE_FORM",
      EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2500,
      EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 2500
    })
  } catch {
    await Voice.start(locale)
  }
}

export async function stopListening() {
  try {
    await Voice.stop()
  } catch {
    // already stopped
  }
}

export async function destroyVoice() {
  try {
    await Voice.destroy()
  } catch {
    // ignore
  }
  Voice.removeAllListeners()
}

export async function speakText(text, lang) {
  const locale = SPEECH_LOCALE[lang] || SPEECH_LOCALE.zh
  const line = String(text || "").trim()
  if (!line) return
  try {
    await Tts.stop()
  } catch {
    // ignore
  }
  try {
    await Tts.setDefaultLanguage(locale)
  } catch {
    // device may lack that voice; still speak
  }
  try {
    await Tts.speak(line)
  } catch {
    // Huawei 等無 TTS 引擎時不要閃退
  }
}

export async function stopSpeaking() {
  try {
    await Tts.stop()
  } catch {
    // ignore
  }
}
