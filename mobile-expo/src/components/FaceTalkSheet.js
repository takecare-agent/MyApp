import { useEffect, useRef, useState } from "react"
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { apiRequest } from "../lib/api"
import { useI18n } from "../i18n/I18nContext"
import { LANG_OPTIONS } from "../i18n/languages"
import {
  bindUtteranceHandlers,
  destroyVoice,
  isVoiceAvailable,
  polishSpeechText,
  requestMicPermission,
  speakText,
  startListening,
  stopListening,
  stopSpeaking
} from "../lib/speechCare"
import { colors } from "../screens/new_ui/tokens"

/**
 * 口譯：人在旁邊時開口說 → 講完再翻成對方語言 → 朗讀一次
 * 不進聊天室
 */
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

  useEffect(() => {
    if (!visible) {
      stopListening()
      stopSpeaking()
      setListening(false)
      setStatus("")
      return undefined
    }

    let cancelled = false
    const runOnce = async (raw) => {
      if (busyRef.current) return
      const text = String(raw || "").trim()
      setListening(false)
      if (!text) {
        setStatus(t("phrase.voiceError"))
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
        setStatus(t("phrase.translateFail"))
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    }

    isVoiceAvailable().then((ok) => {
      if (cancelled) return
      if (!ok) {
        setStatus(t("phrase.voiceUnavailable"))
        return
      }
      sessionRef.current = bindUtteranceHandlers({
        onHeard: (text) => setHeard(text),
        onComplete: (text) => {
          runOnce(text)
        },
        onError: () => {
          setListening(false)
          setStatus(t("phrase.voiceError"))
        }
      })
    })

    return () => {
      cancelled = true
      destroyVoice()
      stopSpeaking()
      sessionRef.current = null
    }
  }, [visible, apiBaseUrl, token, t])

  const toggleMic = async () => {
    if (listening) {
      await stopListening()
      setListening(false)
      setTimeout(() => sessionRef.current?.completeNow?.(), 300)
      return
    }
    const okEngine = await isVoiceAvailable()
    if (!okEngine) {
      setStatus(t("phrase.voiceUnavailable"))
      return
    }
    const ok = await requestMicPermission({
      title: t("phrase.micTitle"),
      message: t("phrase.micMsg"),
      allow: t("phrase.micAllow")
    })
    if (!ok) {
      setStatus(t("phrase.permDenied"))
      return
    }
    setSpoken("")
    setHeard("")
    sessionRef.current?.reset?.()
    setListening(true)
    setStatus(t("phrase.listening"))
    try {
      await startListening(speakLang)
    } catch (err) {
      setListening(false)
      setStatus(err?.code === "VOICE_UNAVAILABLE" ? t("phrase.voiceUnavailable") : t("phrase.voiceError"))
    }
  }

  if (!visible) return null

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.mask}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{t("chat.faceTalk")}</Text>
          <Text style={styles.label}>{t("phrase.speakLang")}</Text>
          <View style={styles.row}>
            {LANG_OPTIONS.map((item) => (
              <Pressable
                key={`s-${item.code}`}
                style={[styles.chip, speakLang === item.code ? styles.chipOn : null]}
                onPress={() => setSpeakLang(item.code)}
              >
                <Text style={[styles.chipText, speakLang === item.code ? styles.chipTextOn : null]}>
                  {item.short}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>{t("phrase.hearLang")}</Text>
          <View style={styles.row}>
            {LANG_OPTIONS.map((item) => (
              <Pressable
                key={`h-${item.code}`}
                style={[styles.chip, hearLang === item.code ? styles.chipOn : null]}
                onPress={() => setHearLang(item.code)}
              >
                <Text style={[styles.chipText, hearLang === item.code ? styles.chipTextOn : null]}>
                  {item.short}
                </Text>
              </Pressable>
            ))}
          </View>
          {heard ? <TextInput style={styles.box} value={heard} editable={false} multiline /> : null}
          {spoken ? (
            <View style={styles.out}>
              <Text style={styles.outText}>{spoken}</Text>
            </View>
          ) : null}
          {status ? <Text style={styles.status}>{status}</Text> : null}
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
  mask: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.35)" },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: 28,
    gap: 8
  },
  title: { fontSize: 17, fontWeight: "800", color: colors.text },
  hint: { color: "#6a7e99", fontSize: 13, lineHeight: 18 },
  label: { color: "#244569", fontWeight: "700", fontSize: 13, marginTop: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#c7d8ed"
  },
  chipOn: { backgroundColor: colors.pine, borderColor: colors.pine },
  chipText: { color: "#3a5678", fontWeight: "700", fontSize: 13 },
  chipTextOn: { color: "#fff" },
  box: {
    borderWidth: 1,
    borderColor: "#c8d8ee",
    borderRadius: 10,
    padding: 10,
    color: colors.text,
    minHeight: 44
  },
  out: {
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#bbf7d0"
  },
  outText: { color: "#14532d", fontWeight: "700", fontSize: 16, lineHeight: 22 },
  status: { color: "#b91c1c", fontWeight: "700", fontSize: 13 },
  mic: {
    backgroundColor: colors.text,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  micLive: { backgroundColor: "#b91c1c" },
  micText: { color: "#fff", fontWeight: "800" },
  close: { alignItems: "center", paddingVertical: 8 },
  closeText: { color: colors.pine, fontWeight: "800" }
})
