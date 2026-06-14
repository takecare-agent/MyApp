import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { API_BASE_URL } from "../../config/runtime"

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

export default function CaregiverSystemCenter() {
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
      const res = await fetch(`${API_BASE_URL}/caregiver/system/history?limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Load failed")
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("讀取系統備援資料失敗。")
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
      const res = await fetch(`${API_BASE_URL}/caregiver/system/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Sync failed")
      }
      setStatusMessage(`已同步第 ${data.sampleIndex + 1} 筆系統備援資料。`)
      await loadHistory()
    } catch (error) {
      console.error(error)
      setErrorMessage("同步系統備援資料失敗。")
    } finally {
      setSyncing(false)
    }
  }

  const latest = useMemo(() => records[0] || null, [records])
  const networkRows = latest?.networkRows || []
  const backupRows = latest?.backupRows || []
  const unstableCount = networkRows.filter(item => item.status !== "Stable").length

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/caregiver")}>
            返回總覽
          </button>
          <span className="section-kicker">系統穩定與備援</span>
        </div>

        <h2 className="section-title">系統健康度與備援檔案</h2>
        <p className="section-subtitle">
          同步系統資料後，會更新網路狀態與備援清單。
        </p>

        <div className="action-row">
          <button className="secondary-btn" onClick={handleSync} disabled={syncing}>
            {syncing ? "同步中..." : "同步系統資料"}
          </button>
          <button className="secondary-btn" onClick={loadHistory} disabled={loading}>
            {loading ? "載入中..." : "讀取最新 10 筆"}
          </button>
        </div>

        {statusMessage && <p className="section-subtitle">{statusMessage}</p>}
        {errorMessage && <p className="error-state">{errorMessage}</p>}

        <div className="feature-grid">
          <div className="feature-card static">
            <div className="feature-title">System Health</div>
            <div className="feature-value">{latest?.healthScore ?? "-"}%</div>
            <div className="feature-note">Unstable devices: {unstableCount}</div>
          </div>
          <div className="feature-card static">
            <div className="feature-title">Latest Snapshot</div>
            <div className="feature-desc">{formatTime(latest?.happenedAt)}</div>
            <div className="feature-note">System ID: {latest?.systemId || "-"}</div>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Area</th>
                <th>Status</th>
                <th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {networkRows.length === 0 ? (
                <tr>
                  <td colSpan={3}>目前沒有網路狀態資料</td>
                </tr>
              ) : (
                networkRows.map((item, index) => (
                  <tr key={`${item.area}-${index}`}>
                    <td>{item.area}</td>
                    <td>{item.status}</td>
                    <td>{item.signal}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="stack-list">
          {backupRows.length === 0 ? (
            <div className="list-card">
              <div className="list-title">目前沒有備援資料</div>
            </div>
          ) : (
            backupRows.map((item, index) => (
              <div className="list-card" key={`${item.event}-${index}`}>
                <div className="list-card-head">
                  <div>
                    <div className="list-title">{item.event}</div>
                    <div className="list-meta">{item.capturedAt}</div>
                  </div>
                  <span className="risk-pill risk-medium">{item.media}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
