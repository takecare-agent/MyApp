import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { apiRequest } from "../lib/api"
import { useI18n } from "../i18n/I18nContext"
import { LangPickField } from "../components/LangListPicker"
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
import { colors } from "./new_ui/tokens"
import { ensureFilled, screenshotPhrases } from "./new_ui/screenshotFill"

import { chatPresetKeysForRole } from "../lib/chatPresets"

/**
 * R85：面對面翻譯＝說／打一句 → 翻成對方語言 → 可朗讀
 * 看護舊「語言」頁已併入此頁，不再寫死翻成中文
 */
export default function PhraseLibraryScreen({
  apiBaseUrl,
  token,
  role,
  onBack,
  embedded = false,
  onInsertText
}) {
  const { t, lang } = useI18n()
  const canManage = role === "family"
  const [phrases, setPhrases] = useState([])
  const [loading, setLoading] = useState(true)
  const [newText, setNewText] = useState("")
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")

  const [speakLang, setSpeakLang] = useState(lang || "zh")
  const [translateTarget, setTranslateTarget] = useState(() =>
    lang === "zh" ? "vi" : "zh"
  )
  const [translateInput, setTranslateInput] = useState("")
  const [translatedResult, setTranslatedResult] = useState("")
  const [translating, setTranslating] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState("")

  const speakLangRef = useRef(speakLang)
  const translateTargetRef = useRef(translateTarget)
  const runTranslateRef = useRef(null)
  const sessionRef = useRef(null)

  useEffect(() => {
    speakLangRef.current = speakLang
  }, [speakLang])
  useEffect(() => {
    translateTargetRef.current = translateTarget
  }, [translateTarget])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiRequest({ apiBaseUrl, path: "/custom-phrases", token })
      setPhrases(ensureFilled(Array.isArray(data) ? data : [], screenshotPhrases, 3))
    } catch {
      setPhrases(ensureFilled([], screenshotPhrases, 3))
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl, token])

  useEffect(() => {
    load()
  }, [load])

  const runTranslate = useCallback(
    async (raw, { play } = {}) => {
      const text = String(raw || "").trim()
      if (!text) return
      const target = translateTargetRef.current
      setTranslating(true)
      setTranslatedResult("")
      setMsg("")
      try {
        if (speakLangRef.current === target) {
          setTranslatedResult(text)
          if (play) {
            setIsPlaying(true)
            await speakText(text, target)
          }
          return
        }
        const data = await apiRequest({
          apiBaseUrl,
          path: "/translate",
          method: "POST",
          token,
          body: { text, targetLang: target }
        })
        const result = String(data.translatedText || "").trim()
        setTranslatedResult(result)
        if (play && result) {
          setIsPlaying(true)
          await speakText(result, target)
        }
      } catch {
        setTranslatedResult("")
        setMsg(t("phrase.translateFail"))
      } finally {
        setTranslating(false)
      }
    },
    [apiBaseUrl, token, t]
  )

  useEffect(() => {
    runTranslateRef.current = runTranslate
  }, [runTranslate])

  const ensureSpeechSession = () => {
    if (sessionRef.current) return
    sessionRef.current = bindUtteranceHandlers({
      onHeard: (partial) => setTranslateInput(partial),
      onComplete: async (raw) => {
        setIsListening(false)
        setVoiceStatus("")
        if (!raw) {
          setVoiceStatus(t("phrase.voiceError"))
          return
        }
        const polished = await polishSpeechText({
          apiBaseUrl,
          token,
          text: raw,
          lang: speakLangRef.current
        })
        setTranslateInput(polished)
        await runTranslateRef.current?.(polished, { play: true })
        setIsPlaying(false)
      },
      onError: () => {
        setIsListening(false)
        setVoiceStatus(t("phrase.voiceError"))
      }
    })
  }

  useEffect(() => () => {
    destroyVoice()
    stopSpeaking()
    sessionRef.current = null
  }, [])

  const fillTranslate = (text) => {
    setTranslateInput(text)
    setTranslatedResult("")
    setMsg("")
    runTranslate(text, { play: false })
  }

  const handleVoiceToggle = async () => {
    if (isListening) {
      await stopListening()
      setIsListening(false)
      setTimeout(() => sessionRef.current?.completeNow?.(), 300)
      return
    }
    const granted = await requestMicPermission({
      title: t("phrase.micTitle"),
      message: t("phrase.micMsg"),
      allow: t("phrase.micAllow")
    })
    if (!granted) {
      setVoiceStatus(t("phrase.permDenied"))
      return
    }
    const available = await isVoiceAvailable()
    if (!available) {
      setVoiceStatus(t("phrase.voiceUnavailable"))
      return
    }
    try {
      ensureSpeechSession()
      setTranslatedResult("")
      sessionRef.current?.reset?.()
      setVoiceStatus(t("phrase.listening"))
      setIsListening(true)
      await startListening(speakLang)
    } catch (err) {
      setIsListening(false)
      setVoiceStatus(err?.code === "VOICE_UNAVAILABLE" ? t("phrase.voiceUnavailable") : t("phrase.voiceError"))
    }
  }

  const handleTranslate = () => {
    runTranslate(translateInput, { play: false })
  }

  const handlePlay = async () => {
    if (!translatedResult) return
    if (isPlaying) {
      await stopSpeaking()
      setIsPlaying(false)
      return
    }
    setIsPlaying(true)
    await speakText(translatedResult, translateTarget)
  }

  const handleShareCopy = async () => {
    if (!translatedResult) return
    try {
      await Share.share({ message: translatedResult })
    } catch {
      Alert.alert(t("phrase.copiedTitle"), translatedResult)
    }
  }

  const handleInsert = () => {
    if (!translatedResult || !onInsertText) return
    onInsertText(translatedResult)
    setMsg(t("phrase.inserted"))
  }

  const handleAdd = async () => {
    if (!canManage || !newText.trim()) return
    setSaving(true)
    setMsg("")
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: "/custom-phrases",
        method: "POST",
        token,
        body: { text: newText.trim() }
      })
      if (data.success) {
        setNewText("")
        setMsg(t("phrase.added"))
        await load()
      } else setMsg(t("phrase.addFail"))
    } catch {
      setMsg(t("phrase.addFail"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!canManage || !id) return
    try {
      await apiRequest({
        apiBaseUrl,
        path: `/custom-phrases/${id}`,
        method: "DELETE",
        token
      })
      await load()
    } catch {
      setMsg(t("phrase.delFail"))
    }
  }

  return (
    <View style={styles.screen}>
      {!embedded && onBack ? (
        <Pressable onPress={onBack} style={styles.backRow}>
          <Text style={styles.back}>‹ {t("common.back")}</Text>
        </Pressable>
      ) : null}

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        {embedded ? null : <Text style={styles.title}>{t("phrase.title")}</Text>}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("phrase.faceTitle")}</Text>

          <LangPickField label={t("phrase.speakLang")} value={speakLang} onChange={setSpeakLang} />
          <LangPickField label={t("phrase.hearLang")} value={translateTarget} onChange={setTranslateTarget} />

          <TextInput
            style={styles.textArea}
            value={translateInput}
            onChangeText={setTranslateInput}
            placeholder={t("phrase.inputPh")}
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
          />

          <View style={styles.actionRow}>
            <Pressable
              style={[styles.micBtn, isListening ? styles.micBtnLive : null]}
              onPress={handleVoiceToggle}
            >
              <Text style={styles.micBtnText}>
                {isListening ? t("phrase.micStop") : t("phrase.micStart")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.primary, styles.flexBtn, translating || !translateInput.trim() ? styles.disabled : null]}
              onPress={handleTranslate}
              disabled={translating || !translateInput.trim()}
            >
              <Text style={styles.primaryText}>
                {translating ? t("phrase.translating") : t("phrase.translate")}
              </Text>
            </Pressable>
          </View>
          {voiceStatus ? <Text style={styles.voiceStatus}>{voiceStatus}</Text> : null}

          {translatedResult ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>{t("phrase.result")}</Text>
              <Text style={styles.resultText}>{translatedResult}</Text>
              <View style={styles.resultActions}>
                <Pressable style={styles.secondary} onPress={handlePlay}>
                  <Text style={styles.secondaryText}>
                    {isPlaying ? t("phrase.stopPlay") : t("phrase.play")}
                  </Text>
                </Pressable>
                <Pressable style={styles.secondary} onPress={handleShareCopy}>
                  <Text style={styles.secondaryText}>{t("phrase.share")}</Text>
                </Pressable>
                {onInsertText ? (
                  <Pressable style={styles.secondary} onPress={handleInsert}>
                    <Text style={styles.secondaryText}>{t("phrase.insertChat")}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
          {msg ? <Text style={styles.msg}>{msg}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("phrase.system")}</Text>
          <View style={styles.chipWrap}>
            {chatPresetKeysForRole(role).map((key) => {
              const text = t(`chat.preset.${key}`)
              return (
                <Pressable key={key} style={styles.quickChip} onPress={() => fillTranslate(text)}>
                  <Text style={styles.quickChipText}>{text}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>{t("phrase.mine")}</Text>
            <Pressable onPress={load}>
              <Text style={styles.link}>{t("common.refresh")}</Text>
            </Pressable>
          </View>
          {loading ? (
            <ActivityIndicator color={colors.mint} style={styles.loader} />
          ) : phrases.length === 0 ? (
            <Text style={styles.empty}>{t("phrase.emptyCustom")}</Text>
          ) : (
            phrases.map((p) => (
              <View key={String(p.id || p._id)} style={styles.item}>
                <Pressable style={styles.itemFlex} onPress={() => fillTranslate(p.text)}>
                  <Text style={styles.itemText}>{p.text}</Text>
                </Pressable>
                {canManage ? (
                  <Pressable onPress={() => handleDelete(p.id || p._id)}>
                    <Text style={styles.del}>{t("phrase.delete")}</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}

          {canManage ? (
            <>
              <TextInput
                style={styles.input}
                value={newText}
                onChangeText={setNewText}
                placeholder={t("phrase.addPh")}
                placeholderTextColor={colors.textMuted}
              />
              <Pressable
                style={[styles.primary, saving || !newText.trim() ? styles.disabled : null]}
                onPress={handleAdd}
                disabled={saving || !newText.trim()}
              >
                <Text style={styles.primaryText}>{saving ? t("common.saving") : t("phrase.savePhrase")}</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.hint}>{t("phrase.caregiverHint")}</Text>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  backRow: { paddingHorizontal: 14, paddingTop: 10 },
  back: { color: colors.mint, fontWeight: "800" },
  pad: { padding: 16, paddingBottom: 40, gap: 12 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  hint: { color: colors.textMuted, lineHeight: 20, fontSize: 13 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    borderCurve: "continuous",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: colors.bg,
    fontWeight: "600"
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    borderCurve: "continuous",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: colors.bg,
    fontWeight: "600",
    minHeight: 72,
    textAlignVertical: "top"
  },
  actionRow: { flexDirection: "row", gap: 8 },
  flexBtn: { flex: 1 },
  micBtn: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderCurve: "continuous",
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border
  },
  micBtnLive: { backgroundColor: colors.clay, borderColor: colors.clay },
  micBtnText: { color: colors.text, fontWeight: "800" },
  voiceStatus: { color: colors.clay, fontWeight: "700", fontSize: 13 },
  primary: {
    backgroundColor: colors.mint,
    borderRadius: 12,
    borderCurve: "continuous",
    paddingVertical: 12,
    alignItems: "center"
  },
  disabled: { opacity: 0.55 },
  primaryText: { color: colors.bg, fontWeight: "800" },
  secondary: {
    borderWidth: 1,
    borderColor: colors.mint,
    borderRadius: 12,
    borderCurve: "continuous",
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    backgroundColor: colors.card
  },
  secondaryText: { color: colors.mint, fontWeight: "800" },
  resultBox: {
    backgroundColor: colors.mintSoft,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8
  },
  resultLabel: { color: colors.mint, fontWeight: "800", fontSize: 12 },
  resultText: { color: colors.text, fontWeight: "700", fontSize: 16, lineHeight: 24 },
  resultActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  msg: { color: colors.mint, fontWeight: "700" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { color: colors.mint, fontWeight: "700" },
  empty: { color: colors.textMuted, paddingVertical: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.mintSoft,
    borderWidth: 1,
    borderColor: colors.border
  },
  quickChipText: { color: colors.mint, fontWeight: "700", fontSize: 13 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 10
  },
  itemFlex: { flex: 1 },
  itemText: { flex: 1, color: colors.text, fontWeight: "700", fontSize: 15 },
  del: { color: colors.clay, fontWeight: "800" },
  loader: { marginVertical: 16 }
})
