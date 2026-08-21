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

export default function CaregiverLanguageSupport() {
  const navigate = useNavigate()
  const token = localStorage.getItem("token")
  const myEmail = getEmailFromToken(token)

  // 歷史記錄
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  // 語言設定
  const [myLang, setMyLang] = useState("zh")
  const [savingLang, setSavingLang] = useState(false)
  const [langMsg, setLangMsg] = useState("")

  // 即時聊天
  const socketRef = useRef(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const [partnerEmail, setPartnerEmail] = useState("")
  const [chatInput, setChatInput] = useState("")
  const [messages, setMessages] = useState([])
  const chatEndRef = useRef(null)

  // 翻譯工具
  const [translateInput, setTranslateInput] = useState("")
  const [translateTarget, setTranslateTarget] = useState("id")
  const [translatedResult, setTranslatedResult] = useState("")
  const [translating, setTranslating] = useState(false)

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

  // ── 載入歷史記錄 ──
  const loadHistory = useCallback(async () => {
    if (!token) { navigate("/"); return }
    setLoading(true); setErrorMessage("")
    try {
      const res = await fetch(`${API_BASE_URL}/caregiver/language/history?limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Load failed")
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch { setErrorMessage("讀取語言支援資料失敗。") }
    finally { setLoading(false) }
  }, [navigate, token])

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

  useEffect(() => { loadHistory(); loadDangerLogs() }, [loadHistory, loadDangerLogs])

  // ── 同步歷史 ──
  const handleSync = async () => {
    if (!token) { navigate("/"); return }
    setSyncing(true); setStatusMessage(""); setErrorMessage("")
    try {
      const res = await fetch(`${API_BASE_URL}/caregiver/language/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Sync failed")
      setStatusMessage(`已同步第 ${data.sampleIndex + 1} 筆跨語言資料。`)
      await loadHistory()
    } catch { setErrorMessage("同步語言支援資料失敗。") }
    finally { setSyncing(false) }
  }

  // ── 儲存語言設定 ──
  const handleSaveLang = async () => {
    if (!token) return
    setSavingLang(true); setLangMsg("")
    try {
      const res = await fetch(`${API_BASE_URL}/update-lang`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lang: myLang })
      })
      const data = await res.json()
      setLangMsg(data.success ? "語言設定已儲存 ✓" : "儲存失敗")
    } catch { setLangMsg("儲存失敗") }
    finally { setSavingLang(false) }
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
    setChatInput("")
  }

  // ── 翻譯工具 ──
  const handleTranslate = async () => {
    if (!translateInput.trim() || !token) return
    setTranslating(true); setTranslatedResult("")
    try {
      const res = await fetch(`${API_BASE_URL}/translate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: translateInput.trim(), targetLang: translateTarget })
      })
      const data = await res.json()
      setTranslatedResult(data.translatedText || "")
    } catch { setTranslatedResult("翻譯失敗") }
    finally { setTranslating(false) }
  }

  const latest = records[0] || null
  const translatedAlerts = latest?.translatedAlerts || []
  const phrases = latest?.phrases || []

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/caregiver")}>返回總覽</button>
          <span className="section-kicker">跨語言支援</span>
        </div>
        <h2 className="section-title">母語切換與語句庫</h2>

        {/* ── 語言設定 ── */}
        <div className="custom-box">
          <label className="input-label">我的溝通語言（收到的訊息將自動翻譯成此語言）</label>
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
            <button className="primary-btn" onClick={handleSaveLang} disabled={savingLang}>
              {savingLang ? "儲存中..." : "儲存設定"}
            </button>
          </div>
          {langMsg && <p className="section-subtitle" style={{ marginTop: 6 }}>{langMsg}</p>}
        </div>

        {/* ── 即時聊天 ── */}
        <div className="custom-box">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <label className="input-label" style={{ margin: 0 }}>即時聊天</label>
            <span style={{ fontSize: 12, color: socketConnected ? "#22c55e" : "#ef4444" }}>
              {socketConnected ? "● 已連線" : "○ 未連線"}
            </span>
          </div>

          <div className="filter-grid" style={{ marginBottom: 8 }}>
            <div>
              <label className="input-label">對話對象 Email（家屬 / 患者）</label>
              <input
                type="email"
                placeholder="輸入對方 Email..."
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
                    background: m.isMine ? "#3b82f6" : "#e5e7eb",
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
              placeholder="輸入訊息（將自動翻譯給對方）..."
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

        {/* ── 翻譯工具 ── */}
        <div className="custom-box">
          <label className="input-label">翻譯工具（語氣柔化 + 多語翻譯）</label>
          <textarea
            rows={3}
            placeholder="輸入要翻譯的照護語句..."
            value={translateInput}
            onChange={e => setTranslateInput(e.target.value)}
          />
          <div className="action-row">
            <select
              value={translateTarget}
              onChange={e => setTranslateTarget(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}
            >
              {LANG_OPTIONS.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <button className="primary-btn" onClick={handleTranslate} disabled={translating}>
              {translating ? "翻譯中..." : "翻譯語句"}
            </button>
          </div>
          {translatedResult && (
            <div style={{ marginTop: 8, padding: "10px 14px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", fontSize: 14 }}>
              <div style={{ marginBottom: 6 }}>{translatedResult}</div>
              <button className="secondary-btn" onClick={() => setChatInput(translatedResult)}>
                填入聊天框
              </button>
            </div>
          )}
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

        {/* ── 歷史記錄（同步功能）── */}
        <p className="section-subtitle">同步語言資料後，會更新翻譯與語句列表。</p>
        <div className="action-row">
          <button className="secondary-btn" onClick={handleSync} disabled={syncing}>
            {syncing ? "同步中..." : "同步語言資料"}
          </button>
          <button className="secondary-btn" onClick={loadHistory} disabled={loading}>
            {loading ? "載入中..." : "讀取最新 10 筆"}
          </button>
        </div>

        {statusMessage && <p className="section-subtitle">{statusMessage}</p>}
        {errorMessage && <p className="error-state">{errorMessage}</p>}

        <div className="filter-grid">
          <div>
            <label className="input-label">Language</label>
            <input value={latest?.language || "-"} readOnly />
          </div>
          <div>
            <label className="input-label">Voice</label>
            <input value={latest?.voice || "-"} readOnly />
          </div>
          <div>
            <label className="input-label">Synced At</label>
            <input value={formatTime(latest?.happenedAt)} readOnly />
          </div>
        </div>

        <div className="stack-list">
          {translatedAlerts.length === 0
            ? <div className="list-card"><div className="list-title">目前沒有翻譯資料</div></div>
            : translatedAlerts.map((item, index) => (
              <div className="list-card" key={`${item.original}-${index}`}>
                <div className="list-card-head">
                  <div className="list-title">{item.original}</div>
                  <span className="risk-pill risk-low">{item.locale}</span>
                </div>
                <div className="list-description">{item.translated}</div>
              </div>
            ))
          }
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Phrase</th><th>Language Pack</th></tr>
            </thead>
            <tbody>
              {phrases.length === 0
                ? <tr><td colSpan={2}>目前沒有語句資料</td></tr>
                : phrases.map((item, index) => (
                  <tr key={`${item.text}-${index}`}>
                    <td>{item.text}</td>
                    <td>{item.lang}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
