import { useEffect, useRef, useState } from "react"
import { Keyboard, Modal, NativeModules, Platform, Pressable, StyleSheet, Text, View } from "react-native"
import { apiRequest } from "../lib/api"
import { useI18n } from "../i18n/I18nContext"
import { ChatVoiceRecorder } from "./ChatVoice"
import { LangPickField } from "./LangListPicker"
import {
  abortVoiceWav,
  bindUtteranceHandlers,
  clearVoiceHandlers,
  destroyVoice,
  isVoiceAvailable,
  polishSpeechText,
  requestMicPermission,
  speakText,
  startListening,
  stopListening,
  stopSpeaking,
  usesAppleOnDeviceSpeech
} from "../lib/speechCare"

const VoiceWav = NativeModules.VoiceWav
const useAndroidWav = Platform.OS === "android" && typeof VoiceWav?.start === "function"

export default function FaceTalkSheet({ visible, onClose, apiBaseUrl, token, myLang, partnerLang }) {
  const { t } = useI18n()
  const speakDefault = myLang || "zh"
  const hearDefault = partnerLang && partnerLang !== speakDefault
    ? partnerLang
    : (speakDefault === "zh" ? "vi" : "zh")
  const [speakLang, setSpeakLang] = useState(speakDefault)
  const [hearLang, setHearLang] = useState(hearDefault)
  const [heard, setHeard] = useState("")
  const [spoken, setSpoken] = useState("")
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const speakRef = useRef(speakLang)
  const hearRef = useRef(hearLang)
  const sessionRef = useRef(null)
  const busyRef = useRef(false)
  const listeningRef = useRef(false)
  const tRef = useRef(t)
  const wavArmedRef = useRef(false)

  tRef.current = t
  listeningRef.current = listening
  const useIosWhisper = Platform.OS === "ios" && !usesAppleOnDeviceSpeech(speakLang)

  useEffect(() => {
    if (!visible) return
    const nextSpeak = myLang || "zh"
    const nextHear = partnerLang && partnerLang !== nextSpeak
      ? partnerLang
      : (nextSpeak === "zh" ? "vi" : "zh")
    setSpeakLang(nextSpeak)
    setHearLang(nextHear)
  }, [visible, myLang, partnerLang])

  useEffect(() => {
    speakRef.current = speakLang
  }, [speakLang])
  useEffect(() => {
    hearRef.current = hearLang
  }, [hearLang])
  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  const finishUtterance = async (raw) => {
    if (busyRef.current) return
    const text = String(raw || "").trim()
    setListening(false)
    listeningRef.current = false
    const tr = tRef.current
    if (!text) {
      setStatus(tr("phrase.voiceError"))
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      const polished = await polishSpeechText({
        apiBaseUrl,
        token,
        text,
        lang: speakRef.current
      })
      setHeard(polished)
      if (speakRef.current === hearRef.current) {
        setSpoken(polished)
        await speakText(polished, hearRef.current)
      } else {
        const data = await apiRequest({
          apiBaseUrl,
          path: "/translate",
          method: "POST",
          token,
          body: { text: polished, targetLang: hearRef.current }
        })
        const out = String(data?.translatedText || polished).trim()
        setSpoken(out)
        await speakText(out, hearRef.current)
      }
      setStatus("")
    } catch {
      setStatus(tr("phrase.translateFail"))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const attachIosHandlers = () => {
    sessionRef.current = bindUtteranceHandlers({
      onHeard: (text) => setHeard(text),
      onComplete: (text) => {
        finishUtterance(text)
      },
      onError: () => {
        setListening(false)
        setStatus(tRef.current("phrase.voiceError"))
      }
    })
  }

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss()
      setHeard("")
      setSpoken("")
      setStatus("")
      setListening(false)
      listeningRef.current = false
      return undefined
    }
    stopSpeaking()
    sessionRef.current = null
    if (wavArmedRef.current && useAndroidWav) {
      wavArmedRef.current = false
      abortVoiceWav().catch(() => {})
    }
    clearVoiceHandlers()
    destroyVoice().catch(() => {})
    setListening(false)
    setStatus("")
    return undefined
  }, [visible])

  const transcribeWav = async (b64) => {
    const tr = tRef.current
    if (!b64) {
      setStatus(tr("phrase.voiceError"))
      return
    }
    setStatus(tr("chat.voiceSending"))
    const data = await apiRequest({
      apiBaseUrl,
      path: "/stt",
      method: "POST",
      token,
      body: { audioBase64: b64, mimeType: "audio/wav", sourceLang: speakRef.current }
    })
    await finishUtterance(String(data?.text || "").trim())
  }

  const startAndroidWav = async () => {
    const tr = tRef.current
    const ok = await requestMicPermission({
      title: tr("phrase.micTitle"),
      message: tr("phrase.micMsg"),
      allow: tr("phrase.micAllow")
    })
    if (!ok) {
      setStatus(tr("phrase.permDenied"))
      return
    }
    Keyboard.dismiss()
    setSpoken("")
    setHeard("")
    setStatus(tr("phrase.listening"))
    try {
      await abortVoiceWav()
      await VoiceWav.start()
      wavArmedRef.current = true
      setListening(true)
    } catch {
      wavArmedRef.current = false
      setListening(false)
      setStatus(tr("phrase.voiceError"))
    }
  }

  const stopAndroidWav = async () => {
    const tr = tRef.current
    setListening(false)
    if (!wavArmedRef.current) return
    wavArmedRef.current = false
    try {
      const res = await VoiceWav.stop()
      const b64 = res?.b64
      if (!b64) {
        setStatus(tr("phrase.voiceError"))
        return
      }
      setStatus(tr("chat.voiceSending"))
      await transcribeWav(b64)
    } catch {
      setStatus(tr("phrase.voiceError"))
    }
  }

  const startIosWav = async () => {
    const tr = tRef.current
    const ok = await requestMicPermission({
      title: tr("phrase.micTitle"),
      message: tr("phrase.micMsg"),
      allow: tr("phrase.micAllow")
    })
    if (!ok) {
      setStatus(tr("phrase.permDenied"))
      return
    }
    Keyboard.dismiss()
    setSpoken("")
    setHeard("")
    setStatus(tr("phrase.listening"))
    wavArmedRef.current = true
    setListening(true)
    listeningRef.current = true
  }

  const toggleMic = async () => {
    const tr = tRef.current
    if (useAndroidWav) {
      if (listening) {
        await stopAndroidWav()
        return
      }
      await startAndroidWav()
      return
    }

    if (useIosWhisper) {
      if (listening) {
        wavArmedRef.current = false
        setListening(false)
        listeningRef.current = false
        return
      }
      await startIosWav()
      return
    }

    if (listening) {
      await stopListening()
      setListening(false)
      setTimeout(() => sessionRef.current?.completeNow?.(), 300)
      return
    }
    const okEngine = await isVoiceAvailable()
    if (!okEngine) {
      setStatus(tr("phrase.voiceUnavailable"))
      return
    }
    const ok = await requestMicPermission({
      title: tr("phrase.micTitle"),
      message: tr("phrase.micMsg"),
      allow: tr("phrase.micAllow")
    })
    if (!ok) {
      setStatus(tr("phrase.permDenied"))
      return
    }
    setSpoken("")
    setHeard("")
    Keyboard.dismiss()
    sessionRef.current = null
    await destroyVoice()
    attachIosHandlers()
    setListening(true)
    listeningRef.current = true
    setStatus(tr("phrase.listening"))
    try {
      await startListening(speakLang)
    } catch {
      setListening(false)
      listeningRef.current = false
      setStatus(tr("phrase.voiceUnavailable"))
    }
  }

  useEffect(() => {
    if (!visible || !listeningRef.current || useAndroidWav) return undefined
    if (!usesAppleOnDeviceSpeech(speakLang)) {
      stopListening().catch(() => {})
      setListening(false)
      listeningRef.current = false
      return undefined
    }
    let cancelled = false
    ;(async () => {
      try {
        sessionRef.current?.reset?.()
        attachIosHandlers()
        await startListening(speakLang)
      } catch {
        if (!cancelled) {
          setListening(false)
          listeningRef.current = false
          setStatus(tRef.current("phrase.voiceUnavailable"))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [speakLang, visible])

  if (!visible) return null

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.mask}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t("chat.faceTalk")}</Text>
          <LangPickField label={t("phrase.speakLang")} value={speakLang} onChange={setSpeakLang} />
          <LangPickField label={t("phrase.hearLang")} value={hearLang} onChange={setHearLang} />
          {heard ? <Text style={styles.box}>{heard}</Text> : null}
          {spoken ? (
            <View style={styles.out}>
              <Text style={styles.outText} selectable>{spoken}</Text>
            </View>
          ) : null}
          {status ? <Text style={styles.status}>{status}</Text> : null}
          {useIosWhisper ? (
            <View style={{ height: 0, overflow: "hidden" }}>
              <ChatVoiceRecorder
                recording={listening}
                enableSpeech={false}
                locale="fil-PH"
                onRecorded={(blob) => {
                  if (!blob?.b64) {
                    setStatus(tRef.current("phrase.voiceError"))
                    return
                  }
                  transcribeWav(blob.b64).catch(() => {
                    setStatus(tRef.current("phrase.voiceError"))
                  })
                }}
                onFail={() => setStatus(tRef.current("phrase.voiceError"))}
              />
            </View>
          ) : null}
          <Pressable style={[styles.mic, listening ? styles.micLive : null]} onPress={toggleMic} disabled={busy}>
            <Text style={styles.micText}>
              {listening ? t("phrase.micStop") : t("chat.faceSpeak")}
            </Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>{t("common.back")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  mask: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(11,13,14,0.55)" },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: "#16181D",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 16,
    paddingBottom: 28,
    gap: 8
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 8
  },
  title: { fontSize: 17, fontWeight: "800", color: "#FFFFFF" },
  box: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: 10,
    color: "#FFFFFF",
    backgroundColor: "#121418",
    minHeight: 44
  },
  out: {
    backgroundColor: "#12281E",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.4)"
  },
  outText: { color: "#10B981", fontWeight: "700", fontSize: 16, lineHeight: 22 },
  status: { color: "#FF5C5C", fontWeight: "700", fontSize: 13 },
  mic: {
    backgroundColor: "#10B981",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center"
  },
  micLive: { backgroundColor: "#FF4D4D" },
  micText: { color: "#000000", fontWeight: "800" },
  close: { alignItems: "center", paddingVertical: 12 },
  closeText: { color: "#10B981", fontWeight: "700", fontSize: 14 }
})
