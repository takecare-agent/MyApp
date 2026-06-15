import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { API_BASE_URL } from "../../config/runtime"

const MODEL_ACTIONS = [
  "DANGER: FALL（跌倒）",
  "CRITICAL SOS: WAVING（呼救揮手）",
  "OFF_BED（離床）",
  "SEDENTARY（久坐不動）"
]

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

function formatConfidence(value) {
  const confidence = Number(value)
  if (!Number.isFinite(confidence)) return "-"
  return `${(Math.max(confidence, 0) * 100).toFixed(1)}%`
}

function severityClass(level) {
  if (level === "高") return "risk-pill risk-high"
  if (level === "中") return "risk-pill risk-medium"
  return "risk-pill risk-low"
}

function sourceLabel(source) {
  if (source === "vision-model") return "模型回傳"
  if (source === "vision-mock") return "影像偵測"
  return source || "-"
}

export default function PatientVisionDetection() {
  const navigate = useNavigate()
  const token = localStorage.getItem("token")

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [detecting, setDetecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [form, setForm] = useState({
    frameTag: "",
    location: "",
    description: ""
  })

  const latestRecord = useMemo(() => (records.length > 0 ? records[0] : null), [records])

  const loadHistory = useCallback(async () => {
    if (!token) {
      navigate("/")
      return
    }

    setLoading(true)
    setErrorMessage("")

    try {
      const res = await fetch(`${API_BASE_URL}/patient/vision/history?limit=30`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Load vision records failed")
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("無法載入影像偵測資料，請稍後再試。")
    } finally {
      setLoading(false)
    }
  }, [navigate, token])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleDetect = async () => {
    if (!token) {
      navigate("/")
      return
    }

    setDetecting(true)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const res = await fetch(`${API_BASE_URL}/patient/vision/detect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Detect failed")
      }

      const alertText = data.linkedAlert ? "已同步建立高風險警示。" : "未建立額外警示。"
      setStatusMessage(`${data.message} ${alertText}`)
      await loadHistory()
    } catch (error) {
      console.error(error)
      setErrorMessage("影像偵測失敗，請稍後再試。")
    } finally {
      setDetecting(false)
    }
  }

  const handleSyncDemo = async () => {
    if (!token) {
      navigate("/")
      return
    }

    setSyncing(true)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const res = await fetch(`${API_BASE_URL}/patient/vision/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Sync failed")
      }
      setStatusMessage(`已新增偵測資料（第 ${data.sampleIndex + 1} 筆）。`)
      await loadHistory()
    } catch (error) {
      console.error(error)
      setErrorMessage("同步影像資料失敗，請稍後再試。")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/patient")}>
            返回受顧者首頁
          </button>
          <span className="section-kicker">影像偵測</span>
        </div>

        <h2 className="section-title">影像模型偵測事件</h2>
        {latestRecord && (
          <div className="sos-banner">
            <div className="sos-title">最新偵測</div>
            <div className="sos-value">{latestRecord.action || "-"}</div>
            <span className={severityClass(latestRecord.severity)}>{latestRecord.severity || "-"}</span>
          </div>
        )}

        <div className="form-grid">
          <div>
            <label className="input-label" htmlFor="patient-frame-tag">
              影格標記（選填）
            </label>
            <input
              id="patient-frame-tag"
              type="text"
              placeholder="例如 camera-A-frame-001"
              value={form.frameTag}
              onChange={e => handleChange("frameTag", e.target.value)}
            />
          </div>
          <div>
            <label className="input-label" htmlFor="patient-location">
              位置（選填）
            </label>
            <input
              id="patient-location"
              type="text"
              placeholder="例如 客廳 / 臥室"
              value={form.location}
              onChange={e => handleChange("location", e.target.value)}
            />
          </div>
          <div>
            <label className="input-label" htmlFor="patient-description">
              備註（選填）
            </label>
            <textarea
              id="patient-description"
              rows={3}
              placeholder="可補充事件說明"
              value={form.description}
              onChange={e => handleChange("description", e.target.value)}
            />
          </div>
        </div>

        <div className="action-row">
          <button className="primary-btn" onClick={handleDetect} disabled={detecting}>
            {detecting ? "偵測中..." : "觸發影像偵測"}
          </button>
          <button className="secondary-btn" onClick={handleSyncDemo} disabled={syncing}>
            {syncing ? "同步中..." : "同步事件"}
          </button>
          <button className="secondary-btn" onClick={loadHistory} disabled={loading}>
            {loading ? "載入中..." : "重新整理"}
          </button>
        </div>

        <div className="rule-box">
          <div className="rule-title">模型事件代碼</div>
          <ul className="rule-list">
            {MODEL_ACTIONS.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {statusMessage && <p className="section-subtitle">{statusMessage}</p>}
        {errorMessage && <p className="error-state">{errorMessage}</p>}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>時間</th>
                <th>動作事件</th>
                <th>等級</th>
                <th>信心值</th>
                <th>位置</th>
                <th>來源</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={6}>目前沒有影像偵測紀錄</td>
                </tr>
              ) : (
                records.map(item => (
                  <tr key={item._id}>
                    <td>{formatTime(item.detectedAt)}</td>
                    <td>{item.action || "-"}</td>
                    <td>{item.severity || "-"}</td>
                    <td>{formatConfidence(item.confidence)}</td>
                    <td>{item.location || "-"}</td>
                    <td>{sourceLabel(item.source)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
