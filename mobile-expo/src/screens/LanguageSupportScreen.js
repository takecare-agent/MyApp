import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { apiRequest } from "../lib/api"
import { LANG_OPTIONS as APP_LANGS } from "../i18n/languages"
import {
  bindUtteranceHandlers,
  destroyVoice,
  isVoiceAvailable,
  requestMicPermission as requestCareMic,
  speakText,
  startListening,
  stopListening,
  stopSpeaking
} from "../lib/speechCare"
import { colors } from "./new_ui/tokens"

const UI_TEXT = {
  zh: {
    title: "多語支援",
    subtitle: "語言設定、語音翻譯與危險警示",
    interfaceLang: "介面語言",
    myLang: "我的語言（訊息自動翻譯成此語言）",
    saveLang: "儲存語言設定",
    voiceSection: "語音輸入",
    voiceHint: "講完整句後再按停止，才翻譯成中文並朗讀一次",
    startRec: "🎤 開始說話",
    stopRec: "⏹ 停止（自動翻譯）",
    listening: "聆聽中...",
    translateSection: "翻譯工具",
    translateHint: "翻譯成繁體中文並自動播放語音（Gemini AI）",
    inputLabel: "語句內容",
    translateBtn: "翻譯並播放",
    translating: "翻譯中...",
    playBtn: "▶ 重新播放",
    stopPlay: "⏹ 停止",
    systemPhrases: "系統照護語句",
    tapToTranslate: "點擊即翻譯成中文並播放",
    customPhrases: "家屬自訂語句",
    dangerSection: "危險語句警示",
    historySection: "語言支援歷史",
    refresh: "重新整理",
    syncBtn: "同步資料",
    syncing: "同步中...",
    noData: "尚無資料",
    saved: "已儲存 ✓",
    saveFail: "儲存失敗",
    permDenied: "未取得麥克風權限",
    voiceError: "語音辨識失敗",
    voiceUnavailable: "這支手機沒有語音引擎，請改打字",
    back: "返回",
    resultLang: "繁體中文", translateFail: "翻譯失敗", micTitle: "麥克風權限", micMsg: "語音辨識需要麥克風權限", micAllow: "允許",
  },
  en: {
    title: "Language Support",
    subtitle: "Language, voice translation & alerts",
    interfaceLang: "Interface Language",
    myLang: "My Language (messages auto-translated to this)",
    saveLang: "Save Setting",
    voiceSection: "Voice Input",
    voiceHint: "Tap mic to speak. After stop, auto-translates to Chinese & plays",
    startRec: "🎤 Start Speaking",
    stopRec: "⏹ Stop (Auto Translate)",
    listening: "Listening...",
    translateSection: "Translation Tool",
    translateHint: "Translates to Traditional Chinese & auto-plays audio (Gemini AI)",
    inputLabel: "Phrase Content",
    translateBtn: "Translate & Play",
    translating: "Translating...",
    playBtn: "▶ Replay",
    stopPlay: "⏹ Stop",
    systemPhrases: "System Care Phrases",
    tapToTranslate: "Tap to translate to Chinese & play",
    customPhrases: "Family Phrases",
    dangerSection: "Danger Alerts",
    historySection: "Language History",
    refresh: "Refresh",
    syncBtn: "Sync Data",
    syncing: "Syncing...",
    noData: "No data",
    saved: "Saved ✓",
    saveFail: "Save failed",
    permDenied: "Microphone permission denied",
    voiceError: "Voice recognition failed",
    back: "Back",
    resultLang: "Chinese", translateFail: "Translation failed", micTitle: "Microphone", micMsg: "Speech recognition needs the microphone", micAllow: "Allow",
  },
  id: {
    title: "Dukungan Bahasa",
    subtitle: "Bahasa, terjemahan suara & peringatan",
    interfaceLang: "Bahasa Antarmuka",
    myLang: "Bahasa Saya (pesan otomatis diterjemahkan)",
    saveLang: "Simpan Pengaturan",
    voiceSection: "Input Suara",
    voiceHint: "Ketuk mikrofon, setelah berhenti otomatis diterjemahkan ke Mandarin",
    startRec: "🎤 Mulai Bicara",
    stopRec: "⏹ Berhenti (Terjemahkan Otomatis)",
    listening: "Mendengarkan...",
    translateSection: "Alat Terjemahan",
    translateHint: "Terjemahkan ke Mandarin Tradisional & putar suara otomatis (Gemini AI)",
    inputLabel: "Isi Kalimat",
    translateBtn: "Terjemahkan & Putar",
    translating: "Menerjemahkan...",
    playBtn: "▶ Putar Ulang",
    stopPlay: "⏹ Berhenti",
    systemPhrases: "Frasa Perawatan Sistem",
    tapToTranslate: "Ketuk untuk terjemahkan ke Mandarin & putar",
    customPhrases: "Frasa Keluarga",
    dangerSection: "Peringatan Bahaya",
    historySection: "Riwayat Bahasa",
    refresh: "Segarkan",
    syncBtn: "Sinkronisasi",
    syncing: "Menyinkronkan...",
    noData: "Belum ada data",
    saved: "Tersimpan ✓",
    saveFail: "Gagal menyimpan",
    permDenied: "Izin mikrofon ditolak",
    voiceError: "Pengenalan suara gagal",
    back: "Kembali",
    resultLang: "Mandarin", translateFail: "Terjemahan gagal", micTitle: "Mikrofon", micMsg: "Pengenalan suara butuh mikrofon", micAllow: "Izinkan",
  },
  vi: {
    title: "Hỗ Trợ Ngôn Ngữ",
    subtitle: "Ngôn ngữ, dịch giọng nói & cảnh báo",
    interfaceLang: "Ngôn Ngữ Giao Diện",
    myLang: "Ngôn ngữ của tôi (tin nhắn tự động dịch)",
    saveLang: "Lưu Cài Đặt",
    voiceSection: "Nhập Giọng Nói",
    voiceHint: "Nhấn mic để nói, sau khi dừng tự động dịch sang tiếng Trung và phát",
    startRec: "🎤 Bắt Đầu Nói",
    stopRec: "⏹ Dừng (Tự Động Dịch)",
    listening: "Đang Nghe...",
    translateSection: "Công Cụ Dịch",
    translateHint: "Dịch sang tiếng Trung Phồn thể & tự động phát giọng nói (Gemini AI)",
    inputLabel: "Nội Dung Câu",
    translateBtn: "Dịch & Phát",
    translating: "Đang Dịch...",
    playBtn: "▶ Phát Lại",
    stopPlay: "⏹ Dừng",
    systemPhrases: "Câu Chăm Sóc Hệ Thống",
    tapToTranslate: "Nhấn để dịch sang tiếng Trung & phát",
    customPhrases: "Câu Gia Đình",
    dangerSection: "Cảnh Báo Nguy Hiểm",
    historySection: "Lịch Sử Ngôn Ngữ",
    refresh: "Làm Mới",
    syncBtn: "Đồng Bộ",
    syncing: "Đang Đồng Bộ...",
    noData: "Chưa có dữ liệu",
    saved: "Đã lưu ✓",
    saveFail: "Lưu thất bại",
    permDenied: "Quyền micrô bị từ chối",
    voiceError: "Nhận dạng giọng nói thất bại",
    back: "Quay Lại",
    resultLang: "Tiếng Trung", translateFail: "Dịch thất bại", micTitle: "Micro", micMsg: "Nhận dạng giọng nói cần micro", micAllow: "Cho phép",
  },
  tl: {
    title: "Suporta sa Wika",
    subtitle: "Wika, pagsasalin ng boses & alerto",
    interfaceLang: "Wika ng Interface",
    myLang: "Aking Wika (mensahe ay awtomatikong isinalin)",
    saveLang: "I-save ang Setting",
    voiceSection: "Voice Input",
    voiceHint: "I-tap ang mikropono, pagkatapos ihinto ay awtomatikong isalin sa Tsino",
    startRec: "🎤 Magsimulang Magsalita",
    stopRec: "⏹ Itigil (Auto Isalin)",
    listening: "Nakikinig...",
    translateSection: "Tool sa Pagsasalin",
    translateHint: "Isasalin sa Tradisyonal na Tsino & awtomatikong i-play (Gemini AI)",
    inputLabel: "Nilalaman ng Parirala",
    translateBtn: "Isalin & I-play",
    translating: "Isinasalin...",
    playBtn: "▶ I-replay",
    stopPlay: "⏹ Itigil",
    systemPhrases: "Mga Pariralang Sistema",
    tapToTranslate: "I-tap para isalin sa Tsino & i-play",
    customPhrases: "Mga Pariralang Pamilya",
    dangerSection: "Alerto sa Panganib",
    historySection: "Kasaysayan ng Wika",
    refresh: "I-refresh",
    syncBtn: "I-sync",
    syncing: "Nag-si-sync...",
    noData: "Walang data",
    saved: "Nai-save ✓",
    saveFail: "Hindi ma-save",
    permDenied: "Tinanggihan ang pahintulot sa mikropono",
    voiceError: "Nabigo ang pagkilala ng boses",
    back: "Bumalik",
    resultLang: "Chinese", translateFail: "Hindi naisalin", micTitle: "Mikropono", micMsg: "Kailangan ang mikropono para sa speech", micAllow: "Payagan",
  },
  th: {
    title: "การสนับสนุนภาษา",
    subtitle: "ภาษา การแปลเสียง และการแจ้งเตือน",
    interfaceLang: "ภาษาอินเทอร์เฟซ",
    myLang: "ภาษาของฉัน (ข้อความแปลอัตโนมัติ)",
    saveLang: "บันทึกการตั้งค่า",
    voiceSection: "ป้อนเสียง",
    voiceHint: "แตะไมค์พูด หลังหยุดจะแปลเป็นภาษาจีนและเล่นอัตโนมัติ",
    startRec: "🎤 เริ่มพูด",
    stopRec: "⏹ หยุด (แปลอัตโนมัติ)",
    listening: "กำลังฟัง...",
    translateSection: "เครื่องมือแปล",
    translateHint: "แปลเป็นภาษาจีนดั้งเดิม & เล่นเสียงอัตโนมัติ (Gemini AI)",
    inputLabel: "เนื้อหาประโยค",
    translateBtn: "แปลและเล่น",
    translating: "กำลังแปล...",
    playBtn: "▶ เล่นซ้ำ",
    stopPlay: "⏹ หยุด",
    systemPhrases: "ประโยคดูแลระบบ",
    tapToTranslate: "แตะเพื่อแปลเป็นภาษาจีนและเล่น",
    customPhrases: "ประโยคครอบครัว",
    dangerSection: "การแจ้งเตือนอันตราย",
    historySection: "ประวัติภาษา",
    refresh: "รีเฟรช",
    syncBtn: "ซิงค์ข้อมูล",
    syncing: "กำลังซิงค์...",
    noData: "ยังไม่มีข้อมูล",
    saved: "บันทึกแล้ว ✓",
    saveFail: "บันทึกไม่สำเร็จ",
    permDenied: "ถูกปฏิเสธสิทธิ์ไมค์",
    voiceError: "การรู้จำเสียงล้มเหลว",
    back: "กลับ",
    resultLang: "ภาษาจีน", translateFail: "แปลไม่สำเร็จ", micTitle: "ไมโครโฟน", micMsg: "การรู้จำเสียงต้องใช้ไมโครโฟน", micAllow: "อนุญาต",
  }
}

const LANG_OPTIONS = APP_LANGS

const STT_LANG_MAP = {
  zh: "zh", en: "en", id: "id", vi: "vi", tl: "tl", th: "th"
}

async function requestMicPermission(t) {
  return requestCareMic({
    title: t.micTitle,
    message: t.micMsg,
    allow: t.micAllow
  })
}

// 翻譯並播放繁體中文 TTS（共用邏輯）
async function translateAndPlay({ text, apiBaseUrl, token, targetLang, setTranslateInput, setTranslatedResult, setTranslating, setIsPlaying, failText }) {
  if (!text?.trim()) return
  const lang = targetLang || "zh"
  setTranslateInput(text)
  setTranslatedResult("")
  setTranslating(true)
  try {
    const data = await apiRequest({
      apiBaseUrl, path: "/translate", method: "POST", token,
      body: { text: text.trim(), targetLang: lang }
    })
    const result = data.translatedText || ""
    setTranslatedResult(result)
    if (result) {
      setIsPlaying(true)
      await speakText(result, lang)
      setIsPlaying(false)
    }
  } catch { setTranslatedResult(failText || "") }
  finally { setTranslating(false) }
}

const SYSTEM_PHRASES = [
  { zh: "你還好嗎？", en: "Are you okay?", id: "Apakah kamu baik-baik saja?", vi: "Bạn có ổn không?", tl: "Kumusta ka?", th: "คุณเป็นอย่างไรบ้าง?" },
  { zh: "請先坐下。", en: "Please sit down.", id: "Tolong duduk dulu.", vi: "Hãy ngồi xuống trước.", tl: "Mangyaring umupo muna.", th: "กรุณานั่งก่อน" },
  { zh: "該吃藥了。", en: "Time to take your medicine.", id: "Saatnya minum obat.", vi: "Đến giờ uống thuốc rồi.", tl: "Oras na para uminom ng gamot.", th: "ถึงเวลากินยาแล้ว" },
  { zh: "需要幫忙嗎？", en: "Do you need help?", id: "Apakah kamu butuh bantuan?", vi: "Bạn có cần giúp đỡ không?", tl: "Kailangan mo ba ng tulong?", th: "คุณต้องการความช่วยเหลือไหม?" },
  { zh: "慢慢來，不急。", en: "Take your time.", id: "Pelan-pelan saja.", vi: "Từ từ thôi, không vội.", tl: "Dahan-dahan lang, walang madalian.", th: "ค่อยๆ ทำ ไม่ต้องรีบ" },
  { zh: "我在這裡陪你。", en: "I am here with you.", id: "Saya ada di sini bersamamu.", vi: "Tôi ở đây với bạn.", tl: "Nandito ako kasama mo.", th: "ฉันอยู่ที่นี่กับคุณ" },
  { zh: "需要上廁所嗎？", en: "Do you need the toilet?", id: "Apakah kamu perlu ke toilet?", vi: "Bạn có cần đi vệ sinh không?", tl: "Kailangan mo bang pumunta sa banyo?", th: "คุณต้องเข้าห้องน้ำไหม?" },
  { zh: "請保持清醒。", en: "Please stay awake.", id: "Tolong tetap sadar.", vi: "Hãy giữ tỉnh táo.", tl: "Mangyaring manatiling gising.", th: "กรุณาอยู่ในสติ" },
  { zh: "我去叫護士。", en: "I will call the nurse.", id: "Saya akan panggil perawat.", vi: "Tôi sẽ gọi y tá.", tl: "Tatawag ako ng nars.", th: "ฉันจะเรียกพยาบาล" },
  { zh: "哪裡不舒服？", en: "Where does it hurt?", id: "Di mana yang sakit?", vi: "Đau ở đâu?", tl: "Saan masakit?", th: "เจ็บที่ไหน?" },
  { zh: "請做深呼吸。", en: "Please take a deep breath.", id: "Tolong tarik napas dalam.", vi: "Hãy hít thở sâu.", tl: "Mangyaring huminga nang malalim.", th: "กรุณาหายใจเข้าลึกๆ" },
  { zh: "放輕鬆，我幫你。", en: "Relax, I will help you.", id: "Santai, saya bantu kamu.", vi: "Thư giãn, tôi sẽ giúp bạn.", tl: "Mag-relax, tutulungan kita.", th: "ผ่อนคลาย ฉันจะช่วยคุณ" }
]

export default function LanguageSupportScreen({ apiBaseUrl, token, onBack, uiLang: propUiLang, onUiLangChange, embedded = false }) {
  const uiLang = propUiLang || "zh"
  const t = { ...UI_TEXT.zh, ...(UI_TEXT[uiLang] || {}) }

  const [isListening, setIsListening] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState("")

  const [translateInput, setTranslateInput] = useState("")
  const [translatedResult, setTranslatedResult] = useState("")
  const [translating, setTranslating] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [targetLang, setTargetLang] = useState(uiLang === "zh" ? "vi" : "zh")

  const [customPhrases, setCustomPhrases] = useState([])
  const [loadingPhrases, setLoadingPhrases] = useState(false)
  const [dangerLogs, setDangerLogs] = useState([])
  const [loadingDanger, setLoadingDanger] = useState(false)
  const [historyRecords, setHistoryRecords] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [historyMsg, setHistoryMsg] = useState("")

  // refs 避免 Voice 回調中的 stale closure
  const apiBaseUrlRef = useRef(apiBaseUrl)
  const tokenRef = useRef(token)
  const setTranslateInputRef = useRef(setTranslateInput)
  const setTranslatedResultRef = useRef(setTranslatedResult)
  const setTranslatingRef = useRef(setTranslating)
  const setIsPlayingRef = useRef(setIsPlaying)
  const sessionRef = useRef(null)
  const targetLangRef = useRef(targetLang)

  useEffect(() => { apiBaseUrlRef.current = apiBaseUrl }, [apiBaseUrl])
  useEffect(() => { tokenRef.current = token }, [token])
  useEffect(() => { targetLangRef.current = targetLang }, [targetLang])

  useEffect(() => () => {
    destroyVoice()
    stopSpeaking()
    sessionRef.current = null
  }, [])

  const ensureSpeechSession = () => {
    if (sessionRef.current) return
    sessionRef.current = bindUtteranceHandlers({
      onHeard: (text) => setTranslateInput(text),
      onComplete: async (text) => {
        setIsListening(false)
        setVoiceStatus("")
        if (!text) {
          setVoiceStatus(t.voiceError)
          return
        }
        await translateAndPlay({
          text,
          apiBaseUrl: apiBaseUrlRef.current,
          token: tokenRef.current,
          targetLang: targetLangRef.current,
          setTranslateInput: setTranslateInputRef.current,
          setTranslatedResult: setTranslatedResultRef.current,
          setTranslating: setTranslatingRef.current,
          setIsPlaying: setIsPlayingRef.current,
          failText: t.translateFail
        })
      },
      onError: () => {
        setIsListening(false)
        setVoiceStatus(t.voiceError)
      }
    })
  }

  // ── 載入資料 ──
  const loadCustomPhrases = useCallback(async () => {
    setLoadingPhrases(true)
    try {
      const data = await apiRequest({ apiBaseUrl, path: "/custom-phrases", token })
      setCustomPhrases(Array.isArray(data) ? data : [])
    } catch { /* 靜默失敗 */ }
    finally { setLoadingPhrases(false) }
  }, [apiBaseUrl, token])

  const loadDangerLogs = useCallback(async () => {
    setLoadingDanger(true)
    try {
      const data = await apiRequest({ apiBaseUrl, path: "/danger-logs", token })
      setDangerLogs(Array.isArray(data) ? data : [])
    } catch { /* 靜默失敗 */ }
    finally { setLoadingDanger(false) }
  }, [apiBaseUrl, token])

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const data = await apiRequest({ apiBaseUrl, path: "/caregiver/language/history?limit=5", token })
      setHistoryRecords(Array.isArray(data.records) ? data.records : [])
    } catch { /* 靜默失敗 */ }
    finally { setLoadingHistory(false) }
  }, [apiBaseUrl, token])

  useEffect(() => {
    loadCustomPhrases()
    loadDangerLogs()
    loadHistory()
  }, [loadCustomPhrases, loadDangerLogs, loadHistory])

  // ── 語音輸入開關 ──
  const handleVoiceToggle = async () => {
    if (isListening) {
      await stopListening()
      setIsListening(false)
      setTimeout(() => sessionRef.current?.completeNow?.(), 300)
      return
    }
    const available = await isVoiceAvailable()
    if (!available) {
      setVoiceStatus(t.voiceUnavailable || t.voiceError)
      return
    }
    const granted = await requestMicPermission(t)
    if (!granted) { setVoiceStatus(t.permDenied); return }
    try {
      ensureSpeechSession()
      setTranslateInput("")
      setTranslatedResult("")
      sessionRef.current?.reset?.()
      setIsListening(true)
      setVoiceStatus(t.listening)
      await startListening(STT_LANG_MAP[uiLang] || "zh")
    } catch (err) {
      setIsListening(false)
      setVoiceStatus(err?.code === "VOICE_UNAVAILABLE" ? (t.voiceUnavailable || t.voiceError) : t.voiceError)
    }
  }

  // ── 手動翻譯並播放（翻譯框按鈕）──
  const handleTranslate = async () => {
    if (!translateInput.trim()) return
    if (isPlaying) { await stopSpeaking(); setIsPlaying(false) }
    await translateAndPlay({
      text: translateInput,
      apiBaseUrl, token,
      targetLang,
      setTranslateInput, setTranslatedResult, setTranslating, setIsPlaying,
      failText: t.translateFail
    })
  }

  // ── 點選語句：自動翻譯並播放 ──
  const handlePhraseSelect = useCallback(async (text) => {
    if (!text?.trim()) return
    if (isPlaying) { await stopSpeaking(); setIsPlaying(false) }
    await translateAndPlay({
      text,
      apiBaseUrl, token,
      targetLang,
      setTranslateInput, setTranslatedResult, setTranslating, setIsPlaying,
      failText: t.translateFail
    })
  }, [apiBaseUrl, token, isPlaying, t.translateFail, targetLang])

  // ── 手動重新播放 TTS ──
  const handlePlayTts = async () => {
    if (!translatedResult) return
    if (isPlaying) { await stopSpeaking(); setIsPlaying(false); return }
    setIsPlaying(true)
    await speakText(translatedResult, targetLang)
    setIsPlaying(false)
  }

  // ── 同步歷史 ──
  const handleSync = async () => {
    setSyncing(true); setHistoryMsg("")
    try {
      const data = await apiRequest({ apiBaseUrl, path: "/caregiver/language/sync", method: "POST", token })
      setHistoryMsg(`${t.syncBtn}: ${(data.sampleIndex ?? 0) + 1}`)
      await loadHistory()
    } catch (e) { setHistoryMsg(e.message) }
    finally { setSyncing(false) }
  }

  return (
    <View style={styles.screen}>
      {embedded ? null : (
        <View style={styles.header}>
          {!onBack ? null : (
            <Pressable onPress={onBack}>
              <Text style={styles.backText}>{t.back}</Text>
            </Pressable>
          )}
          <Text style={styles.title}>{t.title}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.container}>

        {/* ── 語音輸入 ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t.voiceSection}</Text>
          <View style={styles.langRow}>
            {APP_LANGS.map((item) => (
              <Pressable
                key={item.code}
                style={[styles.refreshBtn, targetLang === item.code ? styles.micBtnActive : null]}
                onPress={() => setTargetLang(item.code)}
              >
                <Text style={styles.refreshBtnText}>{item.short}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.micBtn, isListening && styles.micBtnActive]}
            onPress={handleVoiceToggle}
          >
            <Text style={styles.micBtnText}>
              {isListening ? t.stopRec : t.startRec}
            </Text>
          </Pressable>

          {voiceStatus ? (
            <View style={styles.statusRow}>
              {isListening
                ? <ActivityIndicator size="small" color="#ef4444" style={{ marginRight: 6 }} />
                : null}
              <Text style={[styles.hint, isListening && { color: "#ef4444" }]}>{voiceStatus}</Text>
            </View>
          ) : null}

          {translateInput && !isListening ? (
            <View style={styles.recognizedBox}>
              <Text style={styles.recognizedText}>{translateInput}</Text>
            </View>
          ) : null}
        </View>

        {/* ── 翻譯工具 ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t.translateSection}</Text>

          <Text style={styles.label}>{t.inputLabel}</Text>
          <TextInput
            style={styles.textArea}
            value={translateInput}
            onChangeText={setTranslateInput}
            placeholder="..."
            multiline
            numberOfLines={3}
          />

          <Pressable
            style={styles.primaryBtn}
            onPress={handleTranslate}
            disabled={translating || !translateInput.trim()}
          >
            <Text style={styles.primaryBtnText}>{translating ? t.translating : t.translateBtn}</Text>
          </Pressable>

          {translating ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.pine} style={{ marginRight: 6 }} />
              <Text style={styles.hint}>{t.translating}</Text>
            </View>
          ) : null}

          {translatedResult ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>
                {APP_LANGS.find((item) => item.code === targetLang)?.label || t.resultLang}
              </Text>
              <Text style={styles.resultText}>{translatedResult}</Text>
              <Pressable
                style={[styles.playBtn, isPlaying && styles.playBtnActive]}
                onPress={handlePlayTts}
              >
                <Text style={styles.playBtnText}>
                  {isPlaying ? t.stopPlay : t.playBtn}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* ── 系統短語庫 ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t.systemPhrases}</Text>
          {SYSTEM_PHRASES.map((phrase, i) => {
            const primary = phrase[uiLang] || phrase.zh
            const secondary = uiLang !== "zh" ? phrase.zh : phrase.en
            return (
              <Pressable
                key={i}
                style={styles.phraseCard}
                onPress={() => handlePhraseSelect(primary)}
              >
                <Text style={styles.phrasePrimary}>{primary}</Text>
                <Text style={styles.phraseSecondary}>{secondary}</Text>
              </Pressable>
            )
          })}
        </View>

        {/* ── 家屬自訂語句 ── */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>{t.customPhrases}</Text>
            <Pressable style={styles.refreshBtn} onPress={loadCustomPhrases} disabled={loadingPhrases}>
              <Text style={styles.refreshBtnText}>{loadingPhrases ? "..." : t.refresh}</Text>
            </Pressable>
          </View>
          {customPhrases.length === 0
            ? <Text style={styles.emptyText}>{t.noData}</Text>
            : customPhrases.map(p => (
              <Pressable
                key={p.id}
                style={styles.phraseCard}
                onPress={() => handlePhraseSelect(p.text)}
              >
                <Text style={styles.phrasePrimary}>{p.text}</Text>
              </Pressable>
            ))
          }
        </View>

        {/* ── 危險語句記錄 ── */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>{t.dangerSection}</Text>
            <Pressable style={styles.refreshBtn} onPress={loadDangerLogs} disabled={loadingDanger}>
              <Text style={styles.refreshBtnText}>{loadingDanger ? "..." : t.refresh}</Text>
            </Pressable>
          </View>
          {dangerLogs.length === 0
            ? <Text style={styles.emptyText}>{t.noData}</Text>
            : dangerLogs.map((log, i) => (
              <View key={i} style={styles.dangerCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.dangerText} numberOfLines={2}>{log.phrase}</Text>
                  <View style={styles.dangerBadge}><Text style={styles.dangerBadgeText}>!</Text></View>
                </View>
                <Text style={styles.phraseSecondary}>{log.senderName || log.senderEmail} · {log.time}</Text>
              </View>
            ))
          }
        </View>

        {/* ── 歷史記錄 ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t.historySection}</Text>
          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={loadHistory} disabled={loadingHistory}>
              <Text style={styles.secondaryBtnText}>{loadingHistory ? "..." : t.refresh}</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={handleSync} disabled={syncing}>
              <Text style={styles.secondaryBtnText}>{syncing ? t.syncing : t.syncBtn}</Text>
            </Pressable>
          </View>
          {historyMsg ? <Text style={styles.successText}>{historyMsg}</Text> : null}
          {loadingHistory
            ? <ActivityIndicator color={colors.pine} />
            : historyRecords.length === 0
              ? <Text style={styles.emptyText}>{t.noData}</Text>
              : historyRecords.map((r, i) => (
                <View key={i} style={styles.historyCard}>
                  <Text style={styles.phrasePrimary}>{r.sessionId}</Text>
                  <Text style={styles.phraseSecondary}>{r.language} · {r.voice}</Text>
                </View>
              ))
          }
        </View>

      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14
  },
  backText: { color: colors.pine, fontWeight: "900" },
  title: { marginTop: 8, color: colors.text, fontSize: 22, fontWeight: "900" },
  subtitle: { marginTop: 4, color: "#526b88", lineHeight: 20 },
  container: { padding: 16, gap: 12, paddingBottom: 32 },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    gap: 8
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  hint: { color: "#6a7e99", fontSize: 12 },
  label: { color: "#244569", fontWeight: "800", fontSize: 13, marginTop: 2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: "#c7d8ed", backgroundColor: "#fff"
  },
  chipActiveBlue: { backgroundColor: colors.pine, borderColor: colors.pine },
  chipActiveGreen: { backgroundColor: colors.pine, borderColor: colors.pine },
  chipText: { color: "#1f507f", fontSize: 12, fontWeight: "700" },
  chipTextWhite: { color: "#fff" },
  micBtn: {
    backgroundColor: colors.pine,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4
  },
  micBtnActive: { backgroundColor: "#ef4444" },
  micBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  recognizedBox: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 8,
    padding: 10,
    marginTop: 4
  },
  recognizedText: { color: "#1e3a5f", fontSize: 15, lineHeight: 22 },
  textArea: {
    borderWidth: 1, borderColor: "#c8d8ee", borderRadius: 10,
    backgroundColor: "#fbfdff", paddingHorizontal: 10, paddingVertical: 9,
    color: colors.text, minHeight: 72, textAlignVertical: "top"
  },
  primaryBtn: {
    backgroundColor: colors.pine, borderRadius: 10,
    paddingVertical: 12, alignItems: "center", marginTop: 4
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
  resultBox: {
    backgroundColor: "#f0fdf4", borderWidth: 1,
    borderColor: "#bbf7d0", borderRadius: 8, padding: 12, gap: 8
  },
  resultLabel: { color: "#065f46", fontSize: 11, fontWeight: "700" },
  resultText: { color: "#065f46", fontSize: 15, lineHeight: 22 },
  playBtn: {
    backgroundColor: colors.pine, borderRadius: 8,
    paddingVertical: 9, paddingHorizontal: 14, alignSelf: "flex-start"
  },
  playBtnActive: { backgroundColor: "#6b7280" },
  playBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  phraseCard: {
    borderWidth: 1, borderColor: "#e5eef9",
    borderRadius: 8, padding: 10, backgroundColor: "#f8faff"
  },
  phrasePrimary: { color: colors.text, fontWeight: "800", fontSize: 14 },
  phraseSecondary: { color: "#6a7e99", fontSize: 11, marginTop: 2 },
  dangerCard: {
    borderWidth: 1, borderColor: "#fecaca",
    borderRadius: 8, padding: 10, backgroundColor: "#fff5f5", gap: 4
  },
  dangerText: { color: "#7f1d1d", fontWeight: "800", fontSize: 14, flex: 1, marginRight: 8 },
  dangerBadge: {
    backgroundColor: "#ef4444", borderRadius: 12,
    width: 22, height: 22, alignItems: "center", justifyContent: "center"
  },
  dangerBadgeText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  historyCard: {
    borderWidth: 1, borderColor: "#e5eef9",
    borderRadius: 8, padding: 10, backgroundColor: "#f8faff"
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  actions: { flexDirection: "row", gap: 8 },
  secondaryBtn: {
    flex: 1, backgroundColor: "#fff", borderWidth: 1,
    borderColor: "#c7d8ed", borderRadius: 10, paddingVertical: 9, alignItems: "center"
  },
  secondaryBtnText: { color: colors.pine, fontWeight: "900", fontSize: 13 },
  refreshBtn: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#c7d8ed",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4
  },
  refreshBtnText: { color: "#1f507f", fontSize: 12, fontWeight: "800" },
  successText: { color: "#067647", fontWeight: "800", fontSize: 13 },
  emptyText: { color: "#6a7e99", fontSize: 13, paddingVertical: 4 }
})
