import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { io } from "socket.io-client"
import { API_BASE_URL } from "../../config/runtime"

const LANG_OPTIONS = [
  { code: "zh", label: "中文" },
  { code: "en", label: "English" },
  { code: "id", label: "印尼文 (Bahasa)" },
  { code: "vi", label: "越南文 (Tiếng Việt)" },
  { code: "tl", label: "菲律賓文 (Filipino)" },
  { code: "th", label: "泰文 (ภาษาไทย)" },
]

const DEFAULT_PHRASES = [
  { text: "你還好嗎？", lang: "中文 / 台語 / 英文" },
  { text: "需要幫忙嗎？", lang: "中文 / 印尼文 / 越南文" },
  { text: "該吃藥了。", lang: "中文 / 英文 / 越南文" },
]

function getSocketUrl() {
  try { return new URL(API_BASE_URL).origin } catch { return API_BASE_URL }
}

function getEmailFromToken(token) {
  try { return JSON.parse(atob(token.split(".")[1])).email || "" } catch { return "" }
}

function formatTime(value) {
  if (!value) return "-"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("zh-TW", { hour12: false })
}

export default function FamilyPhraseLibrary() {
  const navigate = useNavigate()
  const token = localStorage.getItem("token")
  const myEmail = getEmailFromToken(token)

  // 語言設定
  const [myLang, setMyLang] = useState("zh")

  // 自訂語句庫
  const [phrases, setPhrases] = useState([])
  const [loadingPhrases, setLoadingPhrases] = useState(true)
  const [newPhraseText, setNewPhraseText] = useState("")
  const [saving, setSaving] = useState(false)
  const [phraseMsg, setPhraseMsg] = useState("")

  // 即時聊天
  const socketRef = useRef(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const [partnerEmail, setPartnerEmail] = useState("")
  const [chatInput, setChatInput] = useState("")
  const [messages, setMessages] = useState([])
  const chatEndRef = useRef(null)

  // 危險語句記錄
  const [dangerLogs, setDangerLogs] = useState([])
  const [loadingDanger, setLoadingDanger] = useState(false)

  // ── Socket.io 初始化 ──
  useEffect(() => {
    if (!token) { navigate("/"); return }
    const socket = io(getSocketUrl(), { transports: ["websocket", "polling"] })
    socketRef.current = socket
    socket.on("connect", () => {
      setSocketConnected(true)
      socket.emit("join_room", { email: myEmail })
    })
    socket.on("disconnect", () => setSocketConnected(false))
    socket.on("new_message", (msg) => {
      setMessages(prev => [...prev, {
        senderEmail: msg.senderEmail,
        text: msg.displayText,
        timestamp: msg.timestamp,
        isMine: msg.senderEmail === myEmail
      }])
    })
    return () => socket.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── 載入自訂語句 ──
  const loadPhrases = useCallback(async () => {
    if (!token) return
    setLoadingPhrases(true)
    try {
      const res = await fetch(`${API_BASE_URL}/custom-phrases`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setPhrases(Array.isArray(data) ? data : [])
    } catch { /* 靜默失敗 */ }
    finally { setLoadingPhrases(false) }
  }, [token])

  // ── 載入危險語句記錄 ──
  const loadDangerLogs = useCallback(async () => {
    if (!token) return
    setLoadingDanger(true)
    try {
      const res = await fetch(`${API_BASE_URL}/danger-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setDangerLogs(Array.isArray(data) ? data : [])
    } catch { /* 靜默失敗 */ }
    finally { setLoadingDanger(false) }
  }, [token])

  useEffect(() => { loadPhrases(); loadDangerLogs() }, [loadPhrases, loadDangerLogs])

  // ── 新增語句 ──
  const handleAddPhrase = async () => {
    if (!newPhraseText.trim() || !token) return
    setSaving(true); setPhraseMsg("")
    try {
      const res = await fetch(`${API_BASE_URL}/custom-phrases`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: newPhraseText.trim() })
      })
      const data = await res.json()
      if (data.success) {
        setNewPhraseText("")
        setPhraseMsg("語句已新增 ✓")
        await loadPhrases()
      } else {
        setPhraseMsg("新增失敗")
      }
    } catch { setPhraseMsg("新增失敗") }
    finally { setSaving(false) }
  }

  // ── 刪除語句 ──
  const handleDeletePhrase = async (id) => {
    if (!token) return
    try {
      await fetch(`${API_BASE_URL}/custom-phrases/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      })
      await loadPhrases()
    } catch { /* 靜默失敗 */ }
  }

  // ── 載入聊天歷史 ──
  const loadChatHistory = async () => {
    if (!partnerEmail.trim() || !token) return
    try {
      const res = await fetch(
        `${API_BASE_URL}/chat-history?partnerEmail=${encodeURIComponent(partnerEmail.trim())}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const data = await res.json()
      if (Array.isArray(data)) {
        setMessages(data.map(m => ({
          senderEmail: m.senderEmail,
          text: m.senderEmail === myEmail ? m.originalText : m.translatedText,
          timestamp: m.timestamp,
          isMine: m.senderEmail === myEmail
        })))
      }
    } catch { /* 靜默失敗 */ }
  }

  // ── 送出聊天訊息 ──
  const handleSend = () => {
    if (!chatInput.trim() || !partnerEmail.trim() || !socketRef.current) return
    socketRef.current.emit("send_message", {
      senderEmail: myEmail,
      targetEmail: partnerEmail.trim(),
      text: chatInput.trim(),
      sourceLang: myLang
    })
    // 同時追蹤危險語句
    if (token) {
      fetch(`${API_BASE_URL}/track-phrase`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: chatInput.trim() })
      }).then(r => r.json()).then(d => {
        if (d.isDangerous) loadDangerLogs()
      }).catch(() => {})
    }
    setChatInput("")
  }

  // ── 點擊語句填入聊天框 ──
  const handleUsePhrase = (text) => {
    setChatInput(text)
  }

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/family")}>返回總覽</button>
          <span className="section-kicker">常用關懷語句庫</span>
        </div>
        <h2 className="section-title">多語關懷語句與即時溝通</h2>

        {/* ── 語言設定 ── */}
        <div className="custom-box">
          <label className="input-label">我的語言（訊息將自動翻譯給看護）</label>
          <div className="action-row">
            <select
              value={myLang}
              onChange={e => setMyLang(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}
            >
              {LANG_OPTIONS.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <button
              className="secondary-btn"
              onClick={async () => {
                if (!token) return
                await fetch(`${API_BASE_URL}/update-lang`, {
                  method: "PATCH",
                  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ lang: myLang })
                })
              }}
            >
              儲存語言設定
            </button>
          </div>
        </div>

        {/* ── 預設語句 ── */}
        <label className="input-label" style={{ marginBottom: 6, display: "block" }}>預設關懷語句</label>
        <div className="stack-list">
          {DEFAULT_PHRASES.map(item => (
            <div className="list-card" key={item.text}>
              <div className="list-card-head">
                <div className="list-title">{item.text}</div>
                <span className="risk-pill risk-low">預設語句</span>
              </div>
              <div className="list-meta">支援語音：{item.lang}</div>
              <div className="action-row">
                <button className="secondary-btn" onClick={() => handleUsePhrase(item.text)}>填入聊天</button>
              </div>
            </div>
          ))}
        </div>

        {/* ── 自訂語句庫 ── */}
        <div className="custom-box">
          <div className="action-row" style={{ marginBottom: 8 }}>
            <label className="input-label" style={{ margin: 0 }}>自訂語句庫</label>
            <button className="secondary-btn" onClick={loadPhrases} disabled={loadingPhrases}>
              {loadingPhrases ? "載入中..." : "重新整理"}
            </button>
          </div>

          <div className="tag-list" style={{ marginBottom: 8 }}>
            {phrases.length === 0
              ? <span style={{ color: "#9ca3af", fontSize: 13 }}>尚未新增自訂語句</span>
              : phrases.map(p => (
                <span
                  key={p.id}
                  className="tag-chip"
                  style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
                  onClick={() => handleUsePhrase(p.text)}
                  title="點擊填入聊天框"
                >
                  {p.text}
                  <span
                    style={{ color: "#9ca3af", fontSize: 12, cursor: "pointer" }}
                    onClick={e => { e.stopPropagation(); handleDeletePhrase(p.id) }}
                    title="刪除"
                  >
                    ✕
                  </span>
                </span>
              ))
            }
          </div>

          <label className="input-label">新增自訂語句</label>
          <textarea
            rows={3}
            placeholder="輸入希望新增的關懷語句..."
            value={newPhraseText}
            onChange={e => setNewPhraseText(e.target.value)}
          />
          <div className="action-row">
            <button className="primary-btn" onClick={handleAddPhrase} disabled={saving || !newPhraseText.trim()}>
              {saving ? "儲存中..." : "儲存語句"}
            </button>
            <button className="secondary-btn" onClick={() => setNewPhraseText("")}>清除內容</button>
          </div>
          {phraseMsg && <p className="section-subtitle" style={{ marginTop: 6 }}>{phraseMsg}</p>}
        </div>

        {/* ── 即時聊天 ── */}
        <div className="custom-box">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <label className="input-label" style={{ margin: 0 }}>即時聊天（傳送給看護）</label>
            <span style={{ fontSize: 12, color: socketConnected ? "#22c55e" : "#ef4444" }}>
              {socketConnected ? "● 已連線" : "○ 未連線"}
            </span>
          </div>

          <div className="filter-grid" style={{ marginBottom: 8 }}>
            <div>
              <label className="input-label">看護 Email</label>
              <input
                type="email"
                placeholder="輸入看護的 Email..."
                value={partnerEmail}
                onChange={e => setPartnerEmail(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button className="secondary-btn" onClick={loadChatHistory}>載入歷史訊息</button>
            </div>
          </div>

          <div style={{
            height: 220, overflowY: "auto", background: "#f9fafb",
            borderRadius: 8, padding: "10px 12px", marginBottom: 8,
            border: "1px solid #e5e7eb", display: "flex", flexDirection: "column", gap: 6
          }}>
            {messages.length === 0
              ? <p style={{ color: "#9ca3af", fontSize: 13, margin: "auto" }}>尚無訊息</p>
              : messages.map((m, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.isMine ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "70%", padding: "6px 12px", borderRadius: 12,
                    background: m.isMine ? "#8b5cf6" : "#e5e7eb",
                    color: m.isMine ? "#fff" : "#111827", fontSize: 14
                  }}>
                    {m.text}
                  </div>
                  <span style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                    {m.isMine ? "我" : m.senderEmail} · {formatTime(m.timestamp)}
                  </span>
                </div>
              ))
            }
            <div ref={chatEndRef} />
          </div>

          <div className="action-row">
            <input
              placeholder="輸入訊息或點擊語句填入..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
              style={{ flex: 1 }}
            />
            <button className="primary-btn" onClick={handleSend} disabled={!socketConnected || !partnerEmail.trim()}>
              送出
            </button>
          </div>
        </div>

        {/* ── 危險語句記錄 ── */}
        <div className="custom-box">
          <div className="action-row" style={{ marginBottom: 8 }}>
            <label className="input-label" style={{ margin: 0 }}>危險語句警示（近 7 天）</label>
            <button className="secondary-btn" onClick={loadDangerLogs} disabled={loadingDanger}>
              {loadingDanger ? "載入中..." : "重新整理"}
            </button>
          </div>
          <div className="stack-list">
            {dangerLogs.length === 0
              ? <div className="list-card"><div className="list-title" style={{ color: "#9ca3af" }}>近期無危險語句</div></div>
              : dangerLogs.map((log, i) => (
                <div className="list-card" key={i}>
                  <div className="list-card-head">
                    <div className="list-title">{log.phrase}</div>
                    <span className="risk-pill" style={{ background: "#fee2e2", color: "#dc2626" }}>危險</span>
                  </div>
                  <div className="list-meta">{log.senderName || log.senderEmail} · {log.time}</div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}
