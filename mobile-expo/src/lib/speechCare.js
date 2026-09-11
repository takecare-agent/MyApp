import { NativeModules, PermissionsAndroid, Platform } from "react-native"
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

const LOCALE_FALLBACKS = {
  zh: ["zh-TW", "zh-CN", "zh-HK", "zh"],
  en: ["en-US", "en-GB", "en"],
  vi: ["vi-VN", "vi"],
  id: ["id-ID", "id", "in-ID"],
  tl: ["fil-PH", "fil_PH", "tl-PH", "tl_PH", "fil", "tl"],
  th: ["th-TH", "th"]
}

/** Apple Speech 沒有 Filipino/Tagalog（只有 en-PH）。這些語改走 Whisper。 */
export function usesAppleOnDeviceSpeech(lang) {
  const code = String(lang || "").toLowerCase()
  if (code === "tl" || code.startsWith("fil")) return false
  return true
}

const VoiceWav = NativeModules.VoiceWav

export async function abortVoiceWav() {
  if (typeof VoiceWav?.cancel === "function") {
    try {
      await VoiceWav.cancel()
      return
    } catch {
      // fall through
    }
  }
  if (typeof VoiceWav?.stop === "function") {
    try {
      await VoiceWav.stop()
    } catch {
      // idle / too short
    }
  }
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

let voiceHandlerGen = 0

export function clearVoiceHandlers() {
  voiceHandlerGen += 1
  Voice.onSpeechPartialResults = () => {}
  Voice.onSpeechResults = () => {}
  Voice.onSpeechStart = () => {}
  Voice.onSpeechEnd = () => {}
  Voice.onSpeechError = () => {}
}

/**
 * 只在講完（onSpeechEnd）才交最終稿。Android 的 onSpeechResults 會一直噴半句，
 * 若在那裡翻譯／朗讀就會覆誦十幾次。
 */
export function bindUtteranceHandlers({ onHeard, onComplete }) {
  const gen = ++voiceHandlerGen
  let last = ""
  let completed = false
  const finish = () => {
    if (gen !== voiceHandlerGen) return
    if (completed) return
    completed = true
    onComplete?.(last)
  }
  Voice.onSpeechPartialResults = (e) => {
    if (gen !== voiceHandlerGen) return
    const text = pickBestTranscript(e?.value)
    if (text) {
      last = text
      onHeard?.(text)
    }
  }
  Voice.onSpeechResults = (e) => {
    if (gen !== voiceHandlerGen) return
    const text = pickBestTranscript(e?.value)
    if (text) {
      last = text
      onHeard?.(text)
    }
  }
  // startListening 開頭的 stop/cancel 會噴空的 End/Error；沒聽到字就不要結案，
  // 否則口譯一按「說」就顯示聽不清楚，真正辨識還跑去聊天紅字。
  Voice.onSpeechEnd = () => {
    if (gen !== voiceHandlerGen) return
    if (last) finish()
  }
  Voice.onSpeechError = () => {
    if (gen !== voiceHandlerGen) return
    if (last) finish()
  }
  return {
    completeNow: () => finish(),
    reset: () => {
      if (gen !== voiceHandlerGen) return
      last = ""
      completed = false
    }
  }
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

export async function startListening(lang, opts = {}) {
  const available = await isVoiceAvailable()
  if (!available) {
    const err = new Error("VOICE_UNAVAILABLE")
    err.code = "VOICE_UNAVAILABLE"
    throw err
  }
  const locales = LOCALE_FALLBACKS[lang] || LOCALE_FALLBACKS.zh
  const silence = Math.max(800, Number(opts.silenceMs) || 2500)
  const extras = {
    EXTRA_MAX_RESULTS: 5,
    EXTRA_PARTIAL_RESULTS: true,
    EXTRA_LANGUAGE_MODEL: "LANGUAGE_MODEL_FREE_FORM",
    EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: silence,
    EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: silence
  }
  try {
    const recognizing = await Voice.isRecognizing()
    if (recognizing) await Voice.cancel()
  } catch {
    // ignore
  }
  let lastErr = null
  for (const locale of locales) {
    try {
      await Voice.start(locale, extras)
      return locale
    } catch (err) {
      lastErr = err
      try {
        await Voice.start(locale)
        return locale
      } catch (err2) {
        lastErr = err2
      }
    }
  }
  const fail = lastErr || new Error("VOICE_UNAVAILABLE")
  fail.code = "VOICE_UNAVAILABLE"
  throw fail
}

export async function stopListening() {
  try {
    await Voice.stop()
  } catch {
    // already stopped
  }
}

export async function destroyVoice() {
  voiceHandlerGen += 1
  try {
    await Voice.destroy()
  } catch {
    // ignore
  }
  try {
    Voice.removeAllListeners()
  } catch {
    // ignore
  }
  Voice.onSpeechPartialResults = () => {}
  Voice.onSpeechResults = () => {}
  Voice.onSpeechStart = () => {}
  Voice.onSpeechEnd = () => {}
  Voice.onSpeechError = () => {}
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
    await Promise.race([
      Tts.speak(line),
      new Promise((resolve) => setTimeout(resolve, 4000))
    ])
  } catch {
    // Huawei 等無 TTS 引擎時不要卡住口譯
  }
}

export async function stopSpeaking() {
  try {
    await Tts.stop()
  } catch {
    // ignore
  }
}
