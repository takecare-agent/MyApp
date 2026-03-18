import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

function riskClass(level) {
  if (level === "High") return "risk-pill risk-high"
  if (level === "Medium") return "risk-pill risk-medium"
  return "risk-pill risk-low"
}

export default function CaregiverAlerts() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [riskFilter, setRiskFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
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
      const res = await fetch("http://localhost:5000/caregiver/alerts/history?limit=10", {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Load failed")
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("讀取看護警示資料失敗。")
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
      const res = await fetch("http://localhost:5000/caregiver/alerts/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Sync failed")
      }
      setStatusMessage(`已同步第 ${data.sampleIndex + 1} 筆看護警示資料。`)
      await loadHistory()
    } catch (error) {
      console.error(error)
      setErrorMessage("同步看護警示資料失敗。")
    } finally {
      setSyncing(false)
    }
  }

  const filteredRecords = useMemo(() => {
    return records.filter(item => {
      const riskOk = riskFilter === "all" || item.riskLevel === riskFilter
      const statusOk = statusFilter === "all" || item.status === statusFilter
      return riskOk && statusOk
    })
  }, [records, riskFilter, statusFilter])

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/caregiver")}>
            返回總覽
          </button>
          <span className="section-kicker">危險行為偵測</span>
        </div>

        <h2 className="section-title">即時警示處理中心</h2>
        <p className="section-subtitle">
          按「同步虛擬警示」會寫入 MongoDB 一筆資料，並載入最新 10 筆事件。
        </p>

        <div className="filter-grid">
          <div>
            <label className="input-label" htmlFor="cg-risk-filter">
              風險等級
            </label>
            <select
              id="cg-risk-filter"
              value={riskFilter}
              onChange={e => setRiskFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
          <div>
            <label className="input-label" htmlFor="cg-status-filter">
              處理狀態
            </label>
            <select
              id="cg-status-filter"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="Pending">Pending</option>
              <option value="Processing">Processing</option>
              <option value="Done">Done</option>
            </select>
          </div>
          <div className="filter-submit">
            <button className="primary-btn" onClick={loadHistory} disabled={loading}>
              {loading ? "載入中..." : "重新整理"}
            </button>
          </div>
        </div>

        <div className="action-row">
          <button className="secondary-btn" onClick={handleSync} disabled={syncing}>
            {syncing ? "同步中..." : "同步虛擬警示"}
          </button>
          <button className="secondary-btn" onClick={loadHistory} disabled={loading}>
            讀取最新 10 筆
          </button>
        </div>

        {statusMessage && <p className="section-subtitle">{statusMessage}</p>}
        {errorMessage && <p className="error-state">{errorMessage}</p>}

        <div className="stack-list">
          {filteredRecords.length === 0 ? (
            <div className="list-card">
              <div className="list-title">目前沒有警示資料</div>
              <div className="list-meta">先按「同步虛擬警示」建立資料。</div>
            </div>
          ) : (
            filteredRecords.map(item => (
              <div key={item._id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <div className="list-title">{item.type}</div>
                    <div className="list-meta">ID: {item.alertId}</div>
                  </div>
                  <span className={riskClass(item.riskLevel)}>{item.riskLevel}</span>
                </div>
                <div className="list-grid">
                  <div>
                    <div className="field-key">Happened At</div>
                    <div className="field-value">{formatTime(item.happenedAt)}</div>
                  </div>
                  <div>
                    <div className="field-key">Status</div>
                    <div className="field-value">{item.status}</div>
                  </div>
                  <div>
                    <div className="field-key">Action</div>
                    <div className="field-value">{item.actionTaken || "-"}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
