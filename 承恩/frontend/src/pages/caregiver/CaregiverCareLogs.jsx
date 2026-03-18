import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

function getVitalStateClass(state) {
  return state === "abnormal" ? "risk-pill risk-high" : "risk-pill risk-low"
}

export default function CaregiverCareLogs() {
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
      const res = await fetch("http://localhost:5000/caregiver/care-logs/history?limit=10", {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Load failed")
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("讀取照護紀錄資料失敗。")
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
      const res = await fetch("http://localhost:5000/caregiver/care-logs/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Sync failed")
      }
      setStatusMessage(`已同步第 ${data.sampleIndex + 1} 筆照護紀錄資料。`)
      await loadHistory()
    } catch (error) {
      console.error(error)
      setErrorMessage("同步照護紀錄資料失敗。")
    } finally {
      setSyncing(false)
    }
  }

  const latestRecord = useMemo(() => records[0] || null, [records])
  const tasks = latestRecord?.tasks || []
  const vitals = latestRecord?.vitals || null

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/caregiver")}>
            返回總覽
          </button>
          <span className="section-kicker">日常照護紀錄</span>
        </div>

        <h2 className="section-title">照護清單與生理資料</h2>
        <p className="section-subtitle">
          按「同步虛擬紀錄」會寫入 MongoDB 一筆資料，並更新最新照護清單與生理數據。
        </p>

        <div className="action-row">
          <button className="secondary-btn" onClick={handleSync} disabled={syncing}>
            {syncing ? "同步中..." : "同步虛擬紀錄"}
          </button>
          <button className="secondary-btn" onClick={loadHistory} disabled={loading}>
            {loading ? "載入中..." : "讀取最新 10 筆"}
          </button>
        </div>

        {statusMessage && <p className="section-subtitle">{statusMessage}</p>}
        {errorMessage && <p className="error-state">{errorMessage}</p>}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={3}>目前沒有照護任務資料</td>
                </tr>
              ) : (
                tasks.map((row, index) => (
                  <tr key={`${row.task}-${index}`}>
                    <td>{row.task}</td>
                    <td>{row.status}</td>
                    <td>{row.time}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="feature-grid">
          <div className="feature-card static">
            <div className="feature-title">Heart Rate</div>
            <div className="feature-value">{vitals ? `${vitals.heartRate} bpm` : "-"}</div>
            <span className={getVitalStateClass(vitals?.heartRateState)}>
              {vitals?.heartRateState || "unknown"}
            </span>
          </div>
          <div className="feature-card static">
            <div className="feature-title">Blood Pressure</div>
            <div className="feature-value">{vitals ? vitals.bloodPressure : "-"}</div>
            <span className={getVitalStateClass(vitals?.bloodPressureState)}>
              {vitals?.bloodPressureState || "unknown"}
            </span>
          </div>
          <div className="feature-card static">
            <div className="feature-title">SpO2</div>
            <div className="feature-value">{vitals ? `${vitals.spo2}%` : "-"}</div>
            <span className={getVitalStateClass(vitals?.spo2State)}>
              {vitals?.spo2State || "unknown"}
            </span>
          </div>
        </div>

        <div className="stack-list">
          {records.map(item => (
            <div className="list-card" key={item._id}>
              <div className="list-card-head">
                <div className="list-title">{item.logId || "-"}</div>
                <span className="risk-pill risk-low">{formatTime(item.happenedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
