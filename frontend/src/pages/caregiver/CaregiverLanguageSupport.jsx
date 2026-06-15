import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { API_BASE_URL } from "../../config/runtime"

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

export default function CaregiverLanguageSupport() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const token = localStorage.getItem("token")

  const loadHistory = useCallback(async () => {
    if (!token) {
      navigate("/")
      return
    }

    setLoading(true)
    setErrorMessage("")

    try {
      const res = await fetch(`${API_BASE_URL}/caregiver/language/history?limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Load failed")
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("讀取語言支援資料失敗。")
    } finally {
      setLoading(false)
    }
  }, [navigate, token])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleSync = async () => {
    if (!token) {
      navigate("/")
      return
    }

    setSyncing(true)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const res = await fetch(`${API_BASE_URL}/caregiver/language/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Sync failed")
      }
      setStatusMessage(`已同步第 ${data.sampleIndex + 1} 筆跨語言資料。`)
      await loadHistory()
    } catch (error) {
      console.error(error)
      setErrorMessage("同步語言支援資料失敗。")
    } finally {
      setSyncing(false)
    }
  }

  const latest = useMemo(() => records[0] || null, [records])
  const translatedAlerts = latest?.translatedAlerts || []
  const phrases = latest?.phrases || []

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/caregiver")}>
            返回總覽
          </button>
          <span className="section-kicker">跨語言支援</span>
        </div>

        <h2 className="section-title">母語切換與語句庫</h2>
        <p className="section-subtitle">
          同步語言資料後，會更新翻譯與語句列表。
        </p>

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
          {translatedAlerts.length === 0 ? (
            <div className="list-card">
              <div className="list-title">目前沒有翻譯資料</div>
            </div>
          ) : (
            translatedAlerts.map((item, index) => (
              <div className="list-card" key={`${item.original}-${index}`}>
                <div className="list-card-head">
                  <div className="list-title">{item.original}</div>
                  <span className="risk-pill risk-low">{item.locale}</span>
                </div>
                <div className="list-description">{item.translated}</div>
              </div>
            ))
          )}
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Phrase</th>
                <th>Language Pack</th>
              </tr>
            </thead>
            <tbody>
              {phrases.length === 0 ? (
                <tr>
                  <td colSpan={2}>目前沒有語句資料</td>
                </tr>
              ) : (
                phrases.map((item, index) => (
                  <tr key={`${item.text}-${index}`}>
                    <td>{item.text}</td>
                    <td>{item.lang}</td>
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
