import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  AppState,
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { io } from "socket.io-client"
import { apiRequest, mobileCareCircle } from "../lib/api"
import {
  loadChatNicknames,
  saveChatNickname,
  saveChatPartner
} from "../lib/storage"
import { useI18n } from "../i18n/I18nContext"
import { formatChatDayDivider, formatTimeShort } from "../i18n/dateLocale"
import TranslatedUgcText from "../components/TranslatedUgcText"
import FaceTalkSheet from "../components/FaceTalkSheet"
import { ChatVoiceBubble, ChatVoiceRecorder } from "../components/ChatVoice"
import { AvatarMark } from "../components/AvatarMark"
import { saveAvatarUri } from "../lib/avatarStore"
import { resolveCarePresetKey } from "../lib/presetResolve"
import {
  SPEECH_LOCALE,
  bindUtteranceHandlers,
  clearVoiceHandlers,
  abortVoiceWav,
  isVoiceAvailable,
  polishSpeechText,
  requestMicPermission,
  startListening,
  stopListening,
  usesAppleOnDeviceSpeech
} from "../lib/speechCare"
import { colors } from "./new_ui/tokens"
import { NeoIcon } from "./new_ui/NeoIcons"
import { ensureFilled, decorateInbox, screenshotChatMessages } from "./new_ui/screenshotFill"

function emailNorm(value) {
  return String(value || "").trim().toLowerCase()
}

function isVoicePlaceholder(text) {
  const s = String(text || "").trim()
  if (!s) return true
  return s === "語音訊息" || s === "Voice message"
}

function phraseContentKey(phraseKey) {
  const raw = String(phraseKey || "").trim()
  if (!raw) return undefined
  return raw.startsWith("chat.preset.") ? raw : `chat.preset.${raw}`
}

function mapChatMessage(msg, me, i = 0) {
  const fromMe = emailNorm(msg.senderEmail) === me
  const kind = msg.kind === "voice" ? "voice" : "text"
  return {
    id: String(msg._id || msg.clientMsgId || `${msg.timestamp || i}`),
    kind,
    audioUrl: msg.audioUrl || "",
    durationSec: Number(msg.audioDurationSec || msg.durationSec) || 0,
    senderEmail: emailNorm(msg.senderEmail),
    targetEmail: emailNorm(msg.targetEmail),
    displayText: fromMe
      ? msg.originalText || msg.displayText || ""
      : msg.translatedText || msg.originalText || msg.displayText || "",
    originalText: msg.originalText || "",
    translatedText: msg.translatedText || "",
    sourceLang: msg.sourceLang || "",
    phraseKey: msg.phraseKey || "",
    timestamp: msg.timestamp
  }
}


const ROLE_AVATAR = {
  patient: "E",
  caregiver: "C",
  family: "F"
}

const ROLE_AVATAR_BG = {
  patient: "#1F4A38",
  caregiver: "#1F4A38",
  family: "#E8D5A3"
}

const ROLE_AVATAR_FG = {
  patient: "#FFFFFF",
  caregiver: "#FFFFFF",
  family: "#FFFFFF"
}

/**
 * 訊息＝照護圈成員對話列表＋對方個人資料
 * - 不手動輸 email；列表／頂欄不以 email 當主顯示
 * - 綁定照護圈後自動出現對方；點頭像進資料
 */
export default function ChatScreen({
  apiBaseUrl,
  token,
  myEmail,
  role: _role,
  uiLang: _uiLang,
  onBack,
  embedded = false,
  onOpenCareCircle,
  onUnreadChange,
  pendingPartnerEmail,
  onPendingPartnerConsumed,
  onThreadChange
}) {
  const { t, lang } = useI18n()
  const [kbPad, setKbPad] = useState(0)

  const [contacts, setContacts] = useState([])
  const [inboxLoading, setInboxLoading] = useState(true)
  const [inboxError, setInboxError] = useState("")
  const [refreshing, setRefreshing] = useState(false)

  const [partner, setPartner] = useState(null) // { email, name, role }
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState("")
  const [loading, setLoading] = useState(false)
  const [connStatus, setConnStatus] = useState("disconnected")
  const [phraseOpen, setPhraseOpen] = useState(false)
  const [phraseEditing, setPhraseEditing] = useState(false)
  const [faceOpen, setFaceOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voiceHint, setVoiceHint] = useState("")
  const [shortcutDraft, setShortcutDraft] = useState("")
  const [shortcutEditId, setShortcutEditId] = useState("")
  const [customPhrases, setCustomPhrases] = useState([])
  const [nicknames, setNicknames] = useState({})
  const [profileModal, setProfileModal] = useState(null) // { email, name, role, draft, experience }

  const socketRef = useRef(null)
  const flatListRef = useRef(null)
  const partnerRef = useRef(null)
  const pendingPhraseKeyRef = useRef("")
  const voiceTranscriptRef = useRef("")
  const iosVoiceSessionRef = useRef(null)
  const faceOpenRef = useRef(false)

  useEffect(() => {
    partnerRef.current = partner
    onThreadChange?.(Boolean(partner))
  }, [partner, onThreadChange])

  useEffect(() => {
    faceOpenRef.current = faceOpen
    if (!faceOpen) return
    Keyboard.dismiss()
    setRecording(false)
    setVoiceHint("")
    iosVoiceSessionRef.current = null
    clearVoiceHandlers()
    abortVoiceWav().catch(() => {})
  }, [faceOpen])

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow"
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"
    const onChange = (e) => {
      const endY = e?.endCoordinates?.screenY
      if (typeof endY !== "number") return
      setKbPad(Math.max(0, Dimensions.get("window").height - endY))
    }
    const onHide = () => setKbPad(0)
    const showSub = Keyboard.addListener(showEvt, onChange)
    const hideSub = Keyboard.addListener(hideEvt, onHide)
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  const looksLikeEmail = (value) => /@/.test(String(value || "").trim())

  const displayTitle = (item) => {
    if (!item) return ""
    const key = String(item.email || "").toLowerCase()
    const nick = String(nicknames[key] || "").trim()
    // 暱稱／帳號名若誤存成 email，列表仍不當標題露出
    if (nick && !looksLikeEmail(nick)) return nick
    const name = String(item.name || "").trim()
    if (name && !looksLikeEmail(name)) return name
    return t(`roles.${item.role}`) || t("chat.unnamed")
  }

  const openProfile = (item) => {
    if (!item?.email) return
    const key = String(item.email).toLowerCase()
    setProfileModal({
      email: key,
      name: String(item.name || "").trim(),
      role: item.role || "",
      experience: String(item.experience || "").trim(),
      draft: String(nicknames[key] || "")
    })
    if (!apiBaseUrl || !token) return
    apiRequest({
      apiBaseUrl,
      path: `/mobile/circle-profile?email=${encodeURIComponent(key)}`,
      token
    }).then((data) => {
      setProfileModal((prev) => {
        if (!prev || prev.email !== key) return prev
        return {
          ...prev,
          name: String(data?.name || prev.name || "").trim(),
          role: data?.role || prev.role || "",
          experience: String(data?.experience || "").trim()
        }
      })
    }).catch(() => {})
  }

  const persistNickname = async (partnerEmail, nickname) => {
    await saveChatNickname(myEmail, partnerEmail, nickname)
    const map = await loadChatNicknames(myEmail)
    setNicknames(map)
    setProfileModal(null)
  }

  const loadPhrases = useCallback(async () => {
    try {
      const data = await apiRequest({ apiBaseUrl, path: "/custom-phrases", token })
      setCustomPhrases(Array.isArray(data) ? data : [])
    } catch {
      setCustomPhrases([])
    }
  }, [apiBaseUrl, token])

  const loadInbox = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setInboxError("")
    try {
      const me = emailNorm(myEmail)
      const [circleResult, inboxResult] = await Promise.allSettled([
        mobileCareCircle({ apiBaseUrl, token }),
        apiRequest({ apiBaseUrl, path: "/chat-inbox", token })
      ])
      const circle = circleResult.status === "fulfilled" ? circleResult.value : null
      const meta = inboxResult.status === "fulfilled" ? inboxResult.value : { threads: [], unreadTotal: 0 }
      const members = Array.isArray(circle?.members) ? circle.members : []
      const threads = Array.isArray(meta?.threads) ? meta.threads : []
      members.forEach((m) => {
        if (m?.email && m?.avatarData) saveAvatarUri(m.email, m.avatarData)
      })
      threads.forEach((row) => {
        if (row?.partnerEmail && row?.avatarData) saveAvatarUri(row.partnerEmail, row.avatarData)
      })
      const byPartner = Object.fromEntries(threads.map((row) => [emailNorm(row.partnerEmail), row]))
      const mapThreadBits = (hit = {}) => ({
        lastPreview: hit.lastPreview || "",
        lastKind: hit.lastKind || "",
        lastSourceLang: hit.lastSourceLang || "",
        lastPhraseKey: hit.lastPhraseKey || "",
        lastAt: hit.lastAt || null,
        unread: Number(hit.unread || 0)
      })
      const fromMembers = members
        .filter((m) => m?.email && emailNorm(m.email) !== me)
        .map((m) => ({
          email: emailNorm(m.email),
          name: m.name || "",
          role: m.role || "",
          lang: m.lang || "",
          experience: m.experience || "",
          ...mapThreadBits(byPartner[emailNorm(m.email)])
        }))
      const known = new Set(fromMembers.map((row) => row.email))
      const fromThreads = threads
        .filter((row) => {
          const email = emailNorm(row.partnerEmail)
          return email && email !== me && !known.has(email)
        })
        .map((row) => ({
          email: emailNorm(row.partnerEmail),
          name: row.partnerName || "",
          role: row.partnerRole || "",
          lang: "",
          experience: row.partnerExperience || "",
          ...mapThreadBits(row)
        }))
      const list = decorateInbox([...fromMembers, ...fromThreads], me)
      list.sort((a, b) => {
        const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0
        const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0
        if (tb !== ta) return tb - ta
        const order = { patient: 0, caregiver: 1, family: 2 }
        return (order[a.role] ?? 9) - (order[b.role] ?? 9)
      })
      setContacts(list)
      if (typeof onUnreadChange === "function") {
        onUnreadChange(Number(meta?.unreadTotal || list.reduce((sum, row) => sum + (row.unread || 0), 0)))
      }
      if (!list.length && circleResult.status === "rejected" && inboxResult.status === "rejected" && !silent) {
        const reason = circleResult.reason || inboxResult.reason
        setInboxError(reason?.message || t("common.loadFailed"))
      }
    } catch (err) {
      if (!silent) setInboxError(err.message || t("common.loadFailed"))
      setContacts(decorateInbox([], emailNorm(myEmail)))
    } finally {
      setInboxLoading(false)
      setRefreshing(false)
    }
  }, [apiBaseUrl, token, myEmail, t, onUnreadChange])

  useEffect(() => {
    setInboxLoading(true)
    loadInbox()
  }, [loadInbox])

  useEffect(() => {
    let alive = true
    loadChatNicknames(myEmail).then((map) => {
      if (alive) setNicknames(map || {})
    })
    return () => {
      alive = false
    }
  }, [myEmail])

  const loadHistory = async (pEmail, { silent } = {}) => {
    if (!silent) setLoading(true)
    const me = emailNorm(myEmail)
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: `/chat-history?partnerEmail=${encodeURIComponent(emailNorm(pEmail))}`,
        token
      })
      const list = ensureFilled(Array.isArray(data) ? data : [], () => screenshotChatMessages(me, pEmail), 3)
      setMessages(
        list.map((msg, i) => mapChatMessage(msg, me, i))
      )
      requestAnimationFrame(() => {
        try {
          flatListRef.current?.scrollToOffset?.({ offset: 0, animated: false })
        } catch {
          // ignore
        }
      })
    } catch {
      const fallback = ensureFilled([], () => screenshotChatMessages(me, pEmail), 3)
      setMessages(fallback.map((msg, i) => mapChatMessage(msg, me, i)))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    if (partner?.email) loadHistory(partner.email)
  }, [partner?.email, apiBaseUrl, token, myEmail])

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return
      const email = partnerRef.current?.email
      if (email) loadHistory(email, { silent: true })
    })
    return () => sub.remove()
  }, [apiBaseUrl, token, myEmail])

  useEffect(() => {
    if (partner?.email) loadPhrases()
  }, [partner?.email, loadPhrases])

  useEffect(() => {
    const socket = io(apiBaseUrl, {
      transports: ["websocket", "polling"],
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 800,
      forceNew: true
    })
    socketRef.current = socket
    setConnStatus("connecting")

    socket.on("connect", () => {
      setConnStatus("connected")
      socket.emit("join_room", { email: emailNorm(myEmail) })
      const focused = emailNorm(partnerRef.current?.email)
      if (focused) socket.emit("chat_focus", { email: emailNorm(myEmail), partnerEmail: focused })
    })
    socket.on("connect_error", () => setConnStatus("disconnected"))
    socket.on("disconnect", () => setConnStatus("disconnected"))

    socket.on("new_message", (msg) => {
      const me = emailNorm(myEmail)
      const from = emailNorm(msg.senderEmail)
      const to = emailNorm(msg.targetEmail)
      const current = emailNorm(partnerRef.current?.email)
      const inThisThread = current && ((from === me && to === current) || (from === current && to === me))
      if (inThisThread) {
        const incomingId = String(msg._id || msg.clientMsgId || "")
        setMessages((prev) => {
          if (incomingId && prev.some((m) => m.id === incomingId || (msg.clientMsgId && m.id === msg.clientMsgId))) {
            return prev
          }
          return [
            ...prev,
            mapChatMessage({ ...msg, clientMsgId: msg.clientMsgId }, me)
          ]
        })
        requestAnimationFrame(() => {
          try {
            flatListRef.current?.scrollToOffset?.({ offset: 0, animated: true })
          } catch {
            // inverted list may not be mounted
          }
        })
        if (from !== me) {
          apiRequest({
            apiBaseUrl,
            path: "/chat-read",
            method: "POST",
            token,
            body: { partnerEmail: from }
          }).catch(() => {})
        }
        return
      }
      if (to === me && from !== me) {
        loadInbox({ silent: true })
      }
    })

    return () => {
      socket.emit("chat_blur", { email: emailNorm(myEmail) })
      socket.off("new_message")
      socket.disconnect()
      socketRef.current = null
      setConnStatus("disconnected")
    }
  }, [apiBaseUrl, myEmail, token, loadInbox])

  const markRead = (partnerEmail) => {
    apiRequest({
      apiBaseUrl,
      path: "/chat-read",
      method: "POST",
      token,
      body: { partnerEmail: emailNorm(partnerEmail) }
    }).catch(() => {})
  }

  const openThread = (item) => {
    setMessages([])
    setPartner(item)
    saveChatPartner(myEmail, item.email)
    markRead(item.email)
    setContacts((prev) => {
      const next = prev.map((row) => (
        emailNorm(row.email) === emailNorm(item.email) ? { ...row, unread: 0 } : row
      ))
      if (typeof onUnreadChange === "function") {
        onUnreadChange(next.reduce((sum, row) => sum + Number(row.unread || 0), 0))
      }
      return next
    })
    socketRef.current?.emit("chat_focus", {
      email: emailNorm(myEmail),
      partnerEmail: emailNorm(item.email)
    })
  }

  const closeThread = () => {
    socketRef.current?.emit("chat_blur", { email: emailNorm(myEmail) })
    setPartner(null)
    setMessages([])
    setInputText("")
    loadInbox({ silent: true })
  }

  useEffect(() => {
    const want = emailNorm(pendingPartnerEmail)
    if (!want) return
    const hit = contacts.find((row) => emailNorm(row.email) === want)
    if (!hit) return
    openThread(hit)
    if (typeof onPendingPartnerConsumed === "function") onPendingPartnerConsumed()
  }, [pendingPartnerEmail, contacts])

  const handleSend = () => {
    const text = inputText.trim()
    if (!text || !partner?.email || !socketRef.current) return
    if (!socketRef.current.connected) {
      setVoiceHint(t("chat.connecting"))
      socketRef.current.connect()
    }
    const me = emailNorm(myEmail)
    const them = emailNorm(partner.email)
    const pending = String(pendingPhraseKeyRef.current || "").trim()
    const presetKey = pending
      ? (pending.startsWith("chat.preset.") ? pending : `chat.preset.${pending}`)
      : resolveCarePresetKey({ text })
    pendingPhraseKeyRef.current = ""
    const phraseKey = presetKey && String(presetKey).startsWith("chat.preset.")
      ? String(presetKey).slice("chat.preset.".length)
      : ""
    const clientMsgId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setMessages((prev) => [
      ...prev,
      {
        id: clientMsgId,
        senderEmail: me,
        targetEmail: them,
        displayText: text,
        originalText: text,
        sourceLang: lang,
        phraseKey,
        timestamp: new Date().toISOString()
      }
    ])
    socketRef.current.emit("send_message", {
      senderEmail: me,
      targetEmail: them,
      text,
      sourceLang: lang,
      phraseKey,
      clientMsgId
    })
    setInputText("")
  }

  const openPhrases = () => {
    loadPhrases()
    setPhraseEditing(false)
    setShortcutDraft("")
    setShortcutEditId("")
    setPhraseOpen(true)
  }

  const closePhrases = () => {
    setPhraseOpen(false)
    setPhraseEditing(false)
    setShortcutDraft("")
    setShortcutEditId("")
  }

  const voiceLockUntilRef = useRef(0)

  const handleMic = async () => {
    if (faceOpenRef.current || voiceBusy || !partner?.email) return
    const now = Date.now()
    if (recording) {
      if (now < voiceLockUntilRef.current) return
      if (Platform.OS === "ios" && usesAppleOnDeviceSpeech(lang)) {
        try { await stopListening() } catch { /* ignore */ }
        iosVoiceSessionRef.current?.completeNow?.()
        iosVoiceSessionRef.current = null
        clearVoiceHandlers()
      }
      setRecording(false)
      return
    }
    const ok = await requestMicPermission({
      title: t("phrase.micTitle"),
      message: t("phrase.micMsg"),
      allow: t("phrase.micAllow")
    })
    if (!ok) {
      setVoiceHint(t("phrase.permDenied"))
      return
    }
    voiceTranscriptRef.current = ""
    voiceLockUntilRef.current = now + 400
    setVoiceHint(t("chat.voiceRecording"))
    setRecording(true)
    if (Platform.OS === "ios" && usesAppleOnDeviceSpeech(lang)) {
      const available = await isVoiceAvailable()
      if (available) {
        iosVoiceSessionRef.current = bindUtteranceHandlers({
          onHeard: (text) => {
            if (faceOpenRef.current) return
            voiceTranscriptRef.current = text
            if (text) setVoiceHint(text)
          },
          onComplete: (text) => {
            if (faceOpenRef.current) return
            if (text) voiceTranscriptRef.current = text
          },
          onError: () => {}
        })
        try {
          await startListening(lang, { silenceMs: 4000 })
        } catch {
          iosVoiceSessionRef.current = null
        }
      }
    }
  }

  const sendVoiceBlob = async ({ mime, b64, durationSec }) => {
    if (!partner?.email || !b64) return
    setVoiceBusy(true)
    setVoiceHint(t("chat.voiceSending"))
    const me = emailNorm(myEmail)
    const them = emailNorm(partner.email)
    const clientMsgId = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    // iOS 有蘋果語音的語才帶 transcript；菲律賓文等 Apple 不支援的語改由後端 Whisper 聽 WAV
    let transcript = ""
    if (Platform.OS === "ios" && usesAppleOnDeviceSpeech(lang)) {
      transcript = String(voiceTranscriptRef.current || "").trim()
      if (transcript) {
        transcript = await polishSpeechText({ apiBaseUrl, token, text: transcript, lang })
      }
    }
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: "/chat/voice",
        method: "POST",
        token,
        body: {
          targetEmail: them,
          audioBase64: b64,
          mimeType: mime || "audio/webm",
          sourceLang: lang,
          transcript,
          clientMsgId
        }
      })
      const saved = data?.message || {}
      const merged = {
        ...saved,
        originalText: saved.originalText || transcript,
        translatedText: saved.translatedText || saved.originalText || transcript,
        audioDurationSec: saved.audioDurationSec || durationSec || 0,
        clientMsgId
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === clientMsgId || (saved._id && m.id === String(saved._id)))) return prev
        return [...prev, mapChatMessage(merged, me)]
      })
      setVoiceHint("")
    } catch {
      setVoiceHint(t("chat.voiceFail"))
    } finally {
      voiceTranscriptRef.current = ""
      iosVoiceSessionRef.current = null
      if (Platform.OS === "ios" && !faceOpenRef.current) clearVoiceHandlers()
      setVoiceBusy(false)
    }
  }

  const saveShortcut = async () => {
    const text = shortcutDraft.trim()
    if (!text) return
    try {
      if (shortcutEditId) {
        await apiRequest({
          apiBaseUrl,
          path: `/custom-phrases/${shortcutEditId}`,
          method: "PATCH",
          token,
          body: { text }
        })
      } else {
        await apiRequest({
          apiBaseUrl,
          path: "/custom-phrases",
          method: "POST",
          token,
          body: { text }
        })
      }
      setShortcutDraft("")
      setShortcutEditId("")
      await loadPhrases()
    } catch {
      // keep draft
    }
  }

  const beginEditShortcut = (item) => {
    setShortcutDraft(item.text)
    setShortcutEditId(item.id)
    setPhraseEditing(true)
  }

  const removeShortcutRow = (item) => {
    if (item?.custom) {
      deleteShortcut(item.id)
    }
  }

  const deleteShortcut = async (id) => {
    if (!id) return
    try {
      await apiRequest({
        apiBaseUrl,
        path: `/custom-phrases/${id}`,
        method: "DELETE",
        token
      })
      await loadPhrases()
    } catch {
      // ignore
    }
  }

  const insertPhrase = (text, presetKey = "") => {
    const next = String(text || "").trim()
    if (!next) return
    setInputText((prev) => {
      const cur = String(prev || "")
      if (!cur.trim()) {
        pendingPhraseKeyRef.current = String(presetKey || "").trim()
        return next
      }
      pendingPhraseKeyRef.current = ""
      return `${cur}${cur.endsWith(" ") || cur.endsWith("\n") ? "" : " "}${next}`
    })
    closePhrases()
  }

  const phraseRows = customPhrases.map((p) => ({
    key: `c-${p.id || p._id || p.text}`,
    id: p.id || p._id,
    text: p.text,
    custom: true
  }))
  const visibleRows = phraseRows

  const formatTime = (ts) => {
    if (!ts) return ""
    return formatTimeShort(ts, lang)
  }

  const listData = useMemo(() => {
    const chrono = messages.slice().sort((a, b) => {
      const ta = new Date(a.timestamp || 0).getTime()
      const tb = new Date(b.timestamp || 0).getTime()
      return ta - tb
    })
    const rows = []
    let lastDay = ""
    chrono.forEach((msg) => {
      const day = String(msg.timestamp || "").slice(0, 10)
      if (day && day !== lastDay) {
        rows.push({
          rowType: "date",
          id: `day-${day}`,
          label: formatChatDayDivider(msg.timestamp, lang)
        })
        lastDay = day
      }
      rows.push({ rowType: "msg", ...msg })
    })
    return rows.reverse()
  }, [messages, lang])

  const renderMessage = ({ item }) => {
    if (item.rowType === "date") {
      return (
        <View style={styles.dateChipWrap}>
          <Text style={styles.dateChip}>{item.label}</Text>
        </View>
      )
    }
    const isMe = emailNorm(item.senderEmail) === emailNorm(myEmail)
    const incomingText = item.originalText || item.displayText || ""
    const contentKey = phraseContentKey(item.phraseKey)
    const voiceSrc = item.kind === "voice" && item.audioUrl
      ? (String(item.audioUrl).startsWith("http")
        ? `${item.audioUrl}${item.audioUrl.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`
        : `${String(apiBaseUrl || "").replace(/\/+$/, "")}${item.audioUrl}?access_token=${encodeURIComponent(token)}`)
      : ""
    const captionRaw = item.originalText || item.displayText || ""
    const voiceHasTranscript = item.kind === "voice" && !isVoicePlaceholder(captionRaw)
    const timeLabel = formatTime(item.timestamp)
    return (
      <View style={[styles.bubbleRow, isMe ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
        {isMe && timeLabel ? <Text style={styles.timeOutside}>{timeLabel}</Text> : null}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          {item.kind === "voice" ? (
            <>
              <ChatVoiceBubble
                audioUrl={voiceSrc}
                caption=""
                isMe={isMe}
                playLabel={t("chat.voicePlay")}
                pageOrigin={String(apiBaseUrl || "").replace(/\/+$/, "")}
                durationSec={item.durationSec}
              />
              {voiceHasTranscript ? (
                <TranslatedUgcText
                  text={item.originalText || item.displayText || ""}
                  sourceLang={item.sourceLang}
                  apiBaseUrl={apiBaseUrl}
                  token={token}
                  allowOriginal={!isMe}
                  style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}
                />
              ) : null}
            </>
          ) : (
            <TranslatedUgcText
              text={incomingText}
              sourceLang={item.sourceLang}
              contentKey={contentKey}
              messageKey={item.phraseKey}
              apiBaseUrl={apiBaseUrl}
              token={token}
              allowOriginal={!isMe}
              style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}
            />
          )}
        </View>
        {!isMe && timeLabel ? <Text style={styles.timeOutside}>{timeLabel}</Text> : null}
      </View>
    )
  }

  const renderContact = ({ item }) => {
    const title = displayTitle(item)
    const roleLabel = t(`roles.${item.role}`) || item.role || ""
    return (
      <Pressable
        style={styles.contactRow}
        onPress={() => openThread(item)}
        onLongPress={() => openProfile(item)}
        delayLongPress={380}
      >
        <Pressable
          onPress={() => openProfile(item)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("chat.profileTitle")}
        >
          <AvatarMark email={item.email} size={44} apiBaseUrl={apiBaseUrl} token={token} />
        </Pressable>
        <View style={styles.contactBody}>
          <Text style={styles.contactName} numberOfLines={1}>{title}</Text>
          {(item.lastKind === "voice" && isVoicePlaceholder(item.lastPreview))
            || (!item.lastKind && isVoicePlaceholder(item.lastPreview)) ? (
            <View style={styles.voicePreviewRow}>
              <NeoIcon name="volume-2" size={14} color={colors.textMuted} />
              <Text style={[styles.contactMeta, item.unread ? styles.contactUnread : null]} numberOfLines={1}>
                {t("chat.voiceMsg")}
              </Text>
            </View>
          ) : item.lastPreview ? (
            <TranslatedUgcText
              text={item.lastPreview}
              sourceLang={item.lastSourceLang}
              contentKey={phraseContentKey(item.lastPhraseKey)}
              messageKey={item.lastPhraseKey}
              apiBaseUrl={apiBaseUrl}
              token={token}
              compact
              numberOfLines={1}
              style={[styles.contactMeta, item.unread ? styles.contactUnread : null]}
            />
          ) : roleLabel ? (
            <Text style={styles.contactMeta} numberOfLines={1}>{roleLabel}</Text>
          ) : null}
        </View>
        {item.unread > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{item.unread > 9 ? "9+" : String(item.unread)}</Text>
          </View>
        ) : null}
        <NeoIcon name="chevron-right" size={18} color="#8E95A3" />
      </Pressable>
    )
  }

  const profileModalEl = profileModal ? (
    <Modal visible animationType="fade" transparent onRequestClose={() => setProfileModal(null)}>
      <View style={styles.nickMask}>
        <Pressable style={styles.nickDismiss} onPress={() => setProfileModal(null)} />
        <View style={styles.nickSheet}>
          <Text style={styles.nickTitle}>{t("chat.profileTitle")}</Text>
          <View style={styles.profileAvatarRow}>
            <AvatarMark email={profileModal.email} size={56} apiBaseUrl={apiBaseUrl} token={token} inModal />
            <View style={styles.profileAvatarMeta}>
              <Text style={styles.profileHeroName} numberOfLines={2}>
                {String(nicknames[profileModal.email] || "").trim() ||
                  profileModal.name ||
                  t(`roles.${profileModal.role}`) ||
                  t("chat.unnamed")}
              </Text>
              {profileModal.role ? (
                <Text style={styles.profileHeroRole}>
                  {t(`roles.${profileModal.role}`) || profileModal.role}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.profileField}>
            <Text style={styles.profileLabel}>{t("chat.profileRole")}</Text>
            <Text style={styles.profileValue}>
              {t(`roles.${profileModal.role}`) || profileModal.role || "—"}
            </Text>
          </View>
          <View style={styles.profileField}>
            <Text style={styles.profileLabel}>{t("chat.profileEmail")}</Text>
            <Text style={styles.profileValue} selectable>
              {profileModal.email}
            </Text>
          </View>
          <View style={styles.profileField}>
            <Text style={styles.profileLabel}>{t("chat.accountName")}</Text>
            <Text style={styles.profileValue}>
              {profileModal.name ? profileModal.name : "—"}
            </Text>
          </View>
          <View style={styles.profileField}>
            <Text style={styles.profileLabel}>{t("profile.experience")}</Text>
            <Text style={styles.profileValue}>
              {profileModal.experience ? profileModal.experience : "—"}
            </Text>
          </View>

          <Text style={styles.profileLabel}>{t("chat.setNick")}</Text>
          <TextInput
            style={styles.nickInput}
            value={profileModal.draft}
            onChangeText={(text) =>
              setProfileModal((prev) => (prev ? { ...prev, draft: text } : prev))
            }
            placeholder={t("chat.nickPlaceholder")}
            placeholderTextColor="#9ca3af"
            maxLength={40}
          />
          <View style={styles.nickActions}>
            <Pressable
              style={styles.nickClearBtn}
              onPress={() => persistNickname(profileModal.email, "")}
            >
              <Text style={styles.nickClearText}>{t("chat.clearNick")}</Text>
            </Pressable>
            <Pressable
              style={styles.nickSaveBtn}
              onPress={() => persistNickname(profileModal.email, profileModal.draft)}
            >
              <Text style={styles.nickSaveText}>{t("chat.saveNick")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  ) : null

  const statusColor =
    connStatus === "connected" ? colors.pine : connStatus === "connecting" ? "#f59e0b" : "#9ca3af"
  const statusLabel = t(`chat.${connStatus}`) || t("chat.disconnected")

  // —— 對話列表 ——
  if (!partner) {
    return (
      <View style={styles.screen}>
        {embedded ? null : (
          <View style={styles.header}>
            {!onBack ? <View style={styles.backBtn} /> : (
              <Pressable onPress={onBack} style={styles.backBtn}>
                <Text style={styles.backText}>{t("common.back")}</Text>
              </Pressable>
            )}
            <View style={styles.headerCenter}>
              <Text style={styles.title}>{t("chat.inboxTitle")}</Text>
            </View>
            <View style={{ width: 48 }} />
          </View>
        )}

        {inboxLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.pine} />
            <Text style={styles.loadingText}>{t("chat.loading")}</Text>
          </View>
        ) : (
          <FlatList
            data={contacts}
            keyExtractor={(item) => item.email}
            renderItem={renderContact}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true)
                  loadInbox({ silent: true })
                }}
                tintColor={colors.pine}
              />
            }
            contentContainerStyle={contacts.length ? styles.inboxList : styles.centerGrow}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>{t("chat.inboxEmpty")}</Text>
                <Text style={styles.emptyHint}>{t("chat.inboxHint")}</Text>
                {inboxError ? <Text style={styles.errorText}>{inboxError}</Text> : null}
                {typeof onOpenCareCircle === "function" ? (
                  <Pressable style={styles.linkBtn} onPress={onOpenCareCircle}>
                    <Text style={styles.linkBtnText}>{t("chat.openCircle")}</Text>
                  </Pressable>
                ) : null}
              </View>
            }
          />
        )}
        {profileModalEl}
      </View>
    )
  }

  // —— 單一對話 ——
  const partnerTitle = displayTitle(partner)
  const partnerRole = t(`roles.${partner.role}`) || partner.role || ""

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={closeThread} style={styles.backBtn}>
          <NeoIcon name="chevron-left" size={18} color="#10B981" />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
        <Pressable
          style={styles.headerCenter}
          onPress={() => openProfile(partner)}
          accessibilityRole="button"
          accessibilityLabel={t("chat.profileTitle")}
        >
          <Text style={styles.title} numberOfLines={1}>{partnerTitle}</Text>
          {partnerRole ? (
            <Text style={styles.partnerEmailText} numberOfLines={1}>{partnerRole}</Text>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => {
            Keyboard.dismiss()
            faceOpenRef.current = true
            clearVoiceHandlers()
            abortVoiceWav().catch(() => {})
            setVoiceHint("")
            setFaceOpen(true)
          }}
          style={styles.faceBtn}
          accessibilityRole="button"
          accessibilityLabel={t("chat.faceTalk")}
        >
          <NeoIcon name="globe" size={14} color="#10B981" />
          <Text style={styles.faceBtnText}>{t("chat.faceTalk")}</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.pine} />
            <Text style={styles.loadingText}>{t("chat.loading")}</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={listData}
            inverted={listData.length > 0}
            keyExtractor={(item, i) => item.id || item.rowType + String(i)}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>{t("chat.noHistory")}</Text>
              </View>
            }
          />
        )}

        <View style={[styles.composer, { paddingBottom: kbPad > 0 ? kbPad : (Platform.OS === "ios" ? 20 : 8) }]}>
          {recording || voiceHint ? (
            <Text style={styles.voiceHint}>{voiceHint || t("chat.voiceHint")}</Text>
          ) : null}
          <ChatVoiceRecorder
            recording={recording && !faceOpen}
            locale={SPEECH_LOCALE[lang] || SPEECH_LOCALE.zh}
            enableSpeech={false}
            onStarted={() => {
              if (faceOpenRef.current) return
              setVoiceHint(t("chat.voiceRecording"))
            }}
            onRecorded={(blob) => {
              if (faceOpenRef.current) return
              if (!blob?.b64) return
              sendVoiceBlob(blob)
            }}
            onFail={(err) => {
              if (faceOpenRef.current) return
              setRecording(false)
              const code = String(err || "")
              if (code === "TOO_SHORT" || /too short/i.test(code)) {
                setVoiceHint(t("chat.voiceTooShort"))
                return
              }
              if (code === "SILENCE" || /no sound/i.test(code)) {
                setVoiceHint(t("chat.voiceSilent"))
                return
              }
              setVoiceHint(t("chat.voiceFail"))
            }}
          />
          <View style={styles.inputBar}>
            <Pressable style={[styles.micBtn, recording ? styles.micBtnLive : null]} onPress={handleMic}>
              <NeoIcon name="mic" size={18} color="#FFFFFF" />
            </Pressable>
            <Pressable
              style={styles.plusBtn}
              onPress={openPhrases}
              accessibilityRole="button"
              accessibilityLabel={t("chat.shortcuts")}
            >
              <NeoIcon name="plus" size={18} color="#FFFFFF" />
            </Pressable>
            <TextInput
              style={styles.messageInput}
              value={inputText}
              editable={!faceOpen}
              showSoftInputOnFocus={!faceOpen}
              onChangeText={(v) => {
                pendingPhraseKeyRef.current = ""
                setInputText(v)
              }}
              placeholder={t("chat.placeholder")}
              multiline
              maxLength={500}
              onSubmitEditing={handleSend}
            />
            <Pressable
              style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim()}
            >
              <Text style={styles.sendBtnText}>{t("chat.send")}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <Modal visible={phraseOpen} animationType="slide" transparent onRequestClose={closePhrases}>
        <View style={styles.phraseMask}>
          <Pressable style={styles.phraseDismiss} onPress={closePhrases} />
          <View style={styles.phraseSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.phraseHead}>
              <Text style={styles.phraseTitle}>{t("chat.shortcuts")}</Text>
              <Pressable onPress={() => setPhraseEditing((prev) => !prev)} hitSlop={8}>
                <Text style={styles.phraseHeadBtn}>
                  {phraseEditing ? t("chat.editDone") : t("chat.editShortcuts")}
                </Text>
              </Pressable>
            </View>
            {phraseEditing ? (
              <View style={styles.shortcutAdd}>
                <TextInput
                  style={[styles.nickInput, styles.shortcutInput]}
                  value={shortcutDraft}
                  onChangeText={setShortcutDraft}
                  placeholder={t("chat.shortcutPh")}
                  placeholderTextColor="#9ca3af"
                />
                <Pressable style={styles.nickSaveBtn} onPress={saveShortcut}>
                  <Text style={styles.nickSaveText}>
                    {shortcutEditId ? t("common.save") : t("chat.addShortcut")}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <FlatList
              data={visibleRows}
              keyExtractor={(item) => item.key}
              style={styles.phraseList}
              ListEmptyComponent={<Text style={styles.phraseEmpty}>{t("chat.phraseEmpty")}</Text>}
              ListFooterComponent={null}
              renderItem={({ item }) => (
                phraseEditing ? (
                  <View style={styles.phraseRow}>
                    <Text style={styles.phraseText}>{item.text}</Text>
                    <View style={styles.phraseActions}>
                      {item.custom ? (
                        <Pressable onPress={() => beginEditShortcut(item)} hitSlop={8}>
                          <Text style={styles.rowAction}>{t("chat.editShortcuts")}</Text>
                        </Pressable>
                      ) : null}
                      <Pressable onPress={() => removeShortcutRow(item)} hitSlop={8}>
                        <Text style={styles.delText}>{t("phrase.delete")}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable style={styles.phrasePickRow} onPress={() => insertPhrase(item.text, item.presetKey)}>
                    <Text style={styles.phrasePickText}>{item.text}</Text>
                    <NeoIcon name="chevron-right" size={16} color="#6C727A" />
                  </Pressable>
                )
              )}
            />
          </View>
        </View>
      </Modal>
      <FaceTalkSheet
        visible={faceOpen}
        onClose={() => {
          faceOpenRef.current = false
          setFaceOpen(false)
        }}
        apiBaseUrl={apiBaseUrl}
        token={token}
        myLang={lang}
        partnerLang={partner?.lang}
      />
      {profileModalEl}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8
  },
  backBtn: { minWidth: 64, flexDirection: "row", alignItems: "center", gap: 2 },
  backText: { color: "#10B981", fontWeight: "800", fontSize: 15 },
  headerCenter: { flex: 1, alignItems: "center" },
  title: { color: colors.text, fontSize: 18, fontWeight: "900" },
  partnerEmailText: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: 60,
    justifyContent: "flex-end"
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: "700" },

  inboxList: { paddingVertical: 8 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    marginHorizontal: 12,
    marginVertical: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.mintSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: { color: colors.pine, fontWeight: "900", fontSize: 18 },
  contactBody: { flex: 1, gap: 2 },
  contactName: { color: colors.text, fontWeight: "800", fontSize: 16 },
  contactUnread: { color: colors.text, fontWeight: "800" },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  unreadBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  faceBtn: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#10B981"
  },
  faceBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  voicePreviewRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  composer: { backgroundColor: colors.bg },
  quickWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 4
  },
  quickChip: {
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: colors.mintSoft,
    borderWidth: 1,
    borderColor: colors.border
  },
  quickChipText: { color: colors.mint, fontWeight: "700", fontSize: 13 },
  quickEdit: { paddingHorizontal: 8, paddingVertical: 6 },
  quickEditText: { color: colors.pine, fontWeight: "800", fontSize: 13 },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "#10B981",
    alignItems: "center",
    justifyContent: "center"
  },
  micBtnLive: { backgroundColor: "#b91c1c" },
  micBtnText: { color: "#fff", fontSize: 16 },
  voiceHint: { color: "#b91c1c", fontWeight: "700", fontSize: 12, paddingHorizontal: 4, paddingBottom: 4 },
  shortcutAdd: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4, paddingHorizontal: 12 },
  shortcutInput: { flex: 1 },
  delText: { color: "#ef4444", fontWeight: "800", fontSize: 13 },
  contactMeta: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  nickBtn: {
    backgroundColor: colors.mintSoft,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border
  },
  nickBtnText: { color: colors.pine, fontWeight: "800", fontSize: 11 },
  chevron: { color: "#9ca3af", fontSize: 22, fontWeight: "600" },

  nickMask: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.4)",
    paddingHorizontal: 24
  },
  nickDismiss: { ...StyleSheet.absoluteFillObject },
  nickSheet: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderCurve: "continuous",
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  nickTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  nickHint: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  profileAvatarRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  avatarLg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarTextLg: { fontWeight: "900", fontSize: 22 },
  profileAvatarMeta: { flex: 1, gap: 2 },
  profileHeroName: { color: colors.text, fontSize: 17, fontWeight: "900" },
  profileHeroRole: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  profileField: { gap: 2, marginTop: 2 },
  profileLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  profileValue: { color: colors.text, fontSize: 15, fontWeight: "700" },
  nickInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.bg
  },
  nickActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  nickClearBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.bg
  },
  nickClearText: { color: "#6b7280", fontWeight: "800", fontSize: 13 },
  nickSaveBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.pine
  },
  nickSaveText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  centerGrow: { flexGrow: 1, justifyContent: "center", padding: 24 },
  loadingText: { color: colors.textMuted, marginTop: 8 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  phraseEmpty: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 28,
    paddingHorizontal: 16,
    fontWeight: "600"
  },
  emptyBox: { alignItems: "center", gap: 8, paddingHorizontal: 24 },
  emptyTitle: { color: colors.text, fontWeight: "800", fontSize: 16, textAlign: "center" },
  emptyHint: { color: colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  errorText: { color: "#dc2626", marginTop: 8, textAlign: "center" },
  linkBtn: {
    marginTop: 14,
    backgroundColor: colors.pine,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  linkBtnText: { color: "#fff", fontWeight: "800" },

  messageList: { padding: 12, gap: 8 },

  bubbleRow: { flexDirection: "row", marginVertical: 3, alignItems: "flex-end", gap: 6 },
  bubbleRowRight: { justifyContent: "flex-end" },
  bubbleRowLeft: { justifyContent: "flex-start" },

  bubble: {
    maxWidth: "78%",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4
  },
  bubbleMe: {
    backgroundColor: "#1F4A38",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)"
  },
  bubbleThem: {
    backgroundColor: "#1E2025",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTextMe: { color: "#fff" },
  bubbleTextThem: { color: colors.text },
  timeOutside: {
    fontSize: 10,
    color: "#8E95A3",
    fontWeight: "600",
    marginBottom: 2,
    maxWidth: 48
  },
  dateChipWrap: {
    alignItems: "center",
    marginVertical: 10
  },
  dateChip: {
    color: "#8E95A3",
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999
  },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8
  },
  plusBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderCurve: "continuous",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  plusBtnText: { color: colors.text, fontSize: 22, fontWeight: "400", marginTop: -1 },
  phraseBtn: {
    backgroundColor: colors.mintSoft,
    borderRadius: 12,
    borderCurve: "continuous",
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 72
  },
  phraseBtnText: { color: colors.pine, fontWeight: "800", fontSize: 12 },
  messageInput: {
    flex: 1,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.card
  },
  sendBtn: {
    backgroundColor: "#10B981",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  sendBtnDisabled: { backgroundColor: "rgba(16,185,129,0.35)" },
  sendBtnText: { color: "#fff", fontWeight: "900" },

  phraseMask: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(11,13,14,0.55)" },
  phraseDismiss: { flex: 1 },
  phraseSheet: {
    backgroundColor: "#16181D",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 24,
    maxHeight: "72%",
    gap: 4
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 4
  },
  phraseHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  phraseTitle: { fontSize: 18, fontWeight: "700", color: "#FFFFFF", flex: 1 },
  phraseHeadBtn: { color: "#10B981", fontWeight: "700", fontSize: 14 },
  phraseList: { maxHeight: 400 },
  phrasePickRow: {
    height: 52,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)"
  },
  phrasePickText: { color: "#FFFFFF", fontSize: 16, fontWeight: "400", flex: 1, marginRight: 8 },
  phraseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: 16,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)"
  },
  phraseText: { color: "#FFFFFF", fontSize: 16, flex: 1, lineHeight: 22 },
  phraseActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  rowAction: { color: colors.pine, fontWeight: "600", fontSize: 15 },
  restoreBtn: { alignItems: "center", paddingVertical: 16 },
  restoreBtnText: { color: "#64748b", fontWeight: "600", fontSize: 15 },
  phraseClose: { marginTop: 12, alignItems: "center", paddingVertical: 10 },
  phraseCloseText: { color: colors.pine, fontWeight: "800" }
})
