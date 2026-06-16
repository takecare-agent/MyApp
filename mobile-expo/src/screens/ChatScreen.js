import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { io } from "socket.io-client"
import { apiRequest } from "../lib/api"

const UI_TEXT = {
  zh: {
    title: "聊天室", back: "返回",
    partnerLabel: "對方 Email", startChat: "開始聊天",
    placeholder: "輸入訊息...", send: "傳送",
    loading: "載入歷史訊息...", noHistory: "尚無訊息，開始聊天吧",
    connecting: "連線中...", connected: "已連線", disconnected: "未連線",
    original: "原文",
  },
  en: {
    title: "Chat Room", back: "Back",
    partnerLabel: "Partner Email", startChat: "Start Chat",
    placeholder: "Type a message...", send: "Send",
    loading: "Loading history...", noHistory: "No messages yet",
    connecting: "Connecting...", connected: "Connected", disconnected: "Offline",
    original: "Original",
  },
  id: {
    title: "Ruang Obrolan", back: "Kembali",
    partnerLabel: "Email Mitra", startChat: "Mulai Chat",
    placeholder: "Ketik pesan...", send: "Kirim",
    loading: "Memuat riwayat...", noHistory: "Belum ada pesan",
    connecting: "Menghubungkan...", connected: "Terhubung", disconnected: "Offline",
    original: "Asli",
  },
  vi: {
    title: "Phòng Chat", back: "Quay Lại",
    partnerLabel: "Email Đối Tác", startChat: "Bắt Đầu Chat",
    placeholder: "Nhập tin nhắn...", send: "Gửi",
    loading: "Đang tải lịch sử...", noHistory: "Chưa có tin nhắn",
    connecting: "Đang kết nối...", connected: "Đã kết nối", disconnected: "Ngoại tuyến",
    original: "Gốc",
  },
  tl: {
    title: "Chat Room", back: "Bumalik",
    partnerLabel: "Email ng Kasosyo", startChat: "Simulan ang Chat",
    placeholder: "Mag-type ng mensahe...", send: "Ipadala",
    loading: "Nilo-load ang kasaysayan...", noHistory: "Walang mensahe pa",
    connecting: "Nagkokonekta...", connected: "Nakakonekta", disconnected: "Offline",
    original: "Orihinal",
  },
  th: {
    title: "ห้องแชท", back: "กลับ",
    partnerLabel: "อีเมลคู่สนทนา", startChat: "เริ่มแชท",
    placeholder: "พิมพ์ข้อความ...", send: "ส่ง",
    loading: "กำลังโหลดประวัติ...", noHistory: "ยังไม่มีข้อความ",
    connecting: "กำลังเชื่อมต่อ...", connected: "เชื่อมต่อแล้ว", disconnected: "ออฟไลน์",
    original: "ต้นฉบับ",
  },
}

export default function ChatScreen({ apiBaseUrl, token, myEmail, role, uiLang, onBack }) {
  const lang = uiLang || "zh"
  const t = UI_TEXT[lang] || UI_TEXT.zh

  const [partnerInput, setPartnerInput] = useState("")
  const [partnerEmail, setPartnerEmail] = useState("")
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState("")
  const [loading, setLoading] = useState(false)
  const [connStatus, setConnStatus] = useState("disconnected")

  const socketRef = useRef(null)
  const flatListRef = useRef(null)

  // 建立 Socket.io 連線
  useEffect(() => {
    if (!partnerEmail) return

    loadHistory(partnerEmail)

    const socket = io(apiBaseUrl, {
      transports: ["websocket"],
      timeout: 10000,
    })
    socketRef.current = socket

    socket.on("connect", () => {
      setConnStatus("connected")
      socket.emit("join_room", { email: myEmail })
    })

    socket.on("connect_error", () => setConnStatus("disconnected"))
    socket.on("disconnect", () => setConnStatus("disconnected"))

    socket.on("new_message", (msg) => {
      setMessages(prev => {
        const display = msg.senderEmail === myEmail ? msg.originalText : msg.displayText
        const newMsg = {
          id: `${Date.now()}-${Math.random()}`,
          senderEmail: msg.senderEmail,
          displayText: display || msg.displayText,
          originalText: msg.originalText,
          translatedText: msg.translatedText,
          timestamp: msg.timestamp,
          fromHistory: false,
        }
        return [...prev, newMsg]
      })
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      setConnStatus("disconnected")
    }
  }, [partnerEmail, apiBaseUrl, myEmail])

  const loadHistory = async (pEmail) => {
    setLoading(true)
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: `/chat-history?partnerEmail=${encodeURIComponent(pEmail)}`,
        token,
      })
      if (Array.isArray(data)) {
        const msgs = data.map((m) => ({
          id: m._id || `${m.timestamp}-${m.senderEmail}`,
          senderEmail: m.senderEmail,
          displayText: m.senderEmail === myEmail ? m.originalText : m.translatedText,
          originalText: m.originalText,
          translatedText: m.translatedText,
          timestamp: m.timestamp,
          fromHistory: true,
        }))
        setMessages(msgs)
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 150)
      }
    } catch { /* 靜默失敗 */ }
    finally { setLoading(false) }
  }

  const handleStartChat = () => {
    const email = partnerInput.trim().toLowerCase()
    if (!email) return
    setMessages([])
    setPartnerEmail(email)
  }

  const handleSend = () => {
    if (!inputText.trim() || !socketRef.current || !partnerEmail) return
    socketRef.current.emit("send_message", {
      senderEmail: myEmail,
      targetEmail: partnerEmail,
      text: inputText.trim(),
      sourceLang: lang,
    })
    setInputText("")
  }

  const formatTime = (ts) => {
    if (!ts) return ""
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    } catch { return "" }
  }

  const renderMessage = ({ item }) => {
    const isMe = item.senderEmail === myEmail
    const showOriginal = !isMe && item.originalText && item.originalText !== item.displayText
    return (
      <View style={[styles.bubbleRow, isMe ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
            {item.displayText}
          </Text>
          {showOriginal ? (
            <Text style={styles.bubbleOriginal}>
              {t.original}：{item.originalText}
            </Text>
          ) : null}
          <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
            {formatTime(item.timestamp)}
          </Text>
        </View>
      </View>
    )
  }

  const statusColor = connStatus === "connected" ? "#16a34a" : connStatus === "connecting" ? "#f59e0b" : "#9ca3af"
  const statusLabel = t[connStatus] || t.disconnected

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>{t.back}</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>{t.title}</Text>
          {partnerEmail ? (
            <Text style={styles.partnerEmailText} numberOfLines={1}>{partnerEmail}</Text>
          ) : null}
        </View>
        {partnerEmail ? (
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        ) : <View style={{ width: 60 }} />}
      </View>

      {/* 未選對象：顯示輸入框 */}
      {!partnerEmail ? (
        <View style={styles.setupSection}>
          <Text style={styles.setupLabel}>{t.partnerLabel}</Text>
          <TextInput
            style={styles.partnerInput}
            value={partnerInput}
            onChangeText={setPartnerInput}
            placeholder="example@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.startBtn, !partnerInput.trim() && styles.startBtnDisabled]}
            onPress={handleStartChat}
            disabled={!partnerInput.trim()}
          >
            <Text style={styles.startBtnText}>{t.startChat}</Text>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          {/* 訊息列表 */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color="#1f74d1" />
              <Text style={styles.loadingText}>{t.loading}</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item, i) => item.id || String(i)}
              renderItem={renderMessage}
              contentContainerStyle={styles.messageList}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={styles.emptyText}>{t.noHistory}</Text>
                </View>
              }
            />
          )}

          {/* 輸入欄 */}
          <View style={styles.inputBar}>
            <TextInput
              style={styles.messageInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder={t.placeholder}
              multiline
              maxLength={500}
              onSubmitEditing={handleSend}
            />
            <Pressable
              style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim()}
            >
              <Text style={styles.sendBtnText}>{t.send}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f2f7ff" },

  header: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff", borderBottomWidth: 1,
    borderBottomColor: "#d8e6ff", paddingHorizontal: 14,
    paddingVertical: 12, gap: 8,
  },
  backBtn: { width: 48 },
  backText: { color: "#1f74d1", fontWeight: "900", fontSize: 15 },
  headerCenter: { flex: 1, alignItems: "center" },
  title: { color: "#11355c", fontSize: 18, fontWeight: "900" },
  partnerEmailText: { color: "#526b88", fontSize: 11, marginTop: 2 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, width: 60, justifyContent: "flex-end" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: "700" },

  setupSection: {
    flex: 1, justifyContent: "center",
    padding: 32, gap: 14,
  },
  setupLabel: { color: "#173e67", fontWeight: "900", fontSize: 16, textAlign: "center" },
  partnerInput: {
    borderWidth: 1, borderColor: "#c8d8ee", borderRadius: 12,
    backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: "#173e67",
  },
  startBtn: {
    backgroundColor: "#1f74d1", borderRadius: 12,
    paddingVertical: 14, alignItems: "center",
  },
  startBtnDisabled: { backgroundColor: "#93c5fd" },
  startBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  loadingText: { color: "#6a7e99", marginTop: 8 },
  emptyText: { color: "#6a7e99", fontSize: 14 },

  messageList: { padding: 12, gap: 8, flexGrow: 1 },

  bubbleRow: { flexDirection: "row", marginVertical: 3 },
  bubbleRowRight: { justifyContent: "flex-end" },
  bubbleRowLeft: { justifyContent: "flex-start" },

  bubble: {
    maxWidth: "78%", borderRadius: 16, paddingHorizontal: 14,
    paddingVertical: 10, gap: 4,
  },
  bubbleMe: {
    backgroundColor: "#1f74d1",
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: "#fff", borderWidth: 1,
    borderColor: "#d8e6ff", borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTextMe: { color: "#fff" },
  bubbleTextThem: { color: "#173e67" },
  bubbleOriginal: { color: "#93c5fd", fontSize: 11, lineHeight: 16 },
  bubbleTime: { fontSize: 10, marginTop: 2 },
  bubbleTimeMe: { color: "#bfdbfe", textAlign: "right" },
  bubbleTimeThem: { color: "#9ca3af" },

  inputBar: {
    flexDirection: "row", alignItems: "flex-end",
    backgroundColor: "#fff", borderTopWidth: 1,
    borderTopColor: "#d8e6ff", padding: 10, gap: 8,
  },
  messageInput: {
    flex: 1, borderWidth: 1, borderColor: "#c8d8ee",
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
    fontSize: 15, color: "#173e67", maxHeight: 100,
    backgroundColor: "#f8faff",
  },
  sendBtn: {
    backgroundColor: "#1f74d1", borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  sendBtnDisabled: { backgroundColor: "#93c5fd" },
  sendBtnText: { color: "#fff", fontWeight: "900", fontSize: 14 },
})
