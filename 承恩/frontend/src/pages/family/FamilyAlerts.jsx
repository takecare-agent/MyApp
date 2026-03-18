import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

function levelClass(level) {
  if (level === "高") return "risk-pill risk-high"
  if (level === "中") return "risk-pill risk-medium"
  return "risk-pill risk-low"
}

export default function FamilyAlerts() {
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState([])
  const [filter, setFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const token = localStorage.getItem("token")

  const loadAlerts = useCallback(async () => {
    if (!token) {
      navigate("/")
      return
    }

    setLoading(true)
    setErrorMessage("")

    try {
      const res = await fetch("http://localhost:5000/family/alerts/history?limit=10", {
        headers: { Authorization: "Bearer " + token }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "讀取即時通知失敗")
      }
      setAlerts(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("讀取即時通知資料失敗。")
    } finally {
      setLoading(false)
    }
  }, [navigate, token])

  useEffect(() => {
    loadAlerts()
  }, [loadAlerts])

  const handleSync = async () => {
    if (!token) {
      navigate("/")
      return
    }

    setSyncing(true)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const res = await fetch("http://localhost:5000/family/alerts/sync", {
        method: "POST",
        headers: { Authorization: "Bearer " + token }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "同步失敗")
      }

      setStatusMessage(`已同步第 ${data.sampleIndex + 1} 筆虛擬通知資料。`)
      await loadAlerts()
    } catch (error) {
      console.error(error)
      setErrorMessage("同步通知資料失敗。")
    } finally {
      setSyncing(false)
    }
  }

  const filteredAlerts = useMemo(() => {
    if (filter === "high") return alerts.filter(item => item.level === "高")
    if (filter === "pending") return alerts.filter(item => item.status === "未處理")
    return alerts
  }, [alerts, filter])

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/family")}>
            返回總覽
          </button>
          <span className="section-kicker">危險事件即時通知</span>
        </div>

        <h2 className="section-title">即時推播事件列表</h2>
        <p className="section-subtitle">
          點「同步虛擬通知」會寫入 MongoDB 一筆資料，並重新載入最新 10 筆通知紀錄。
        </p>

        <div className="toolbar-row">
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">全部事件</option>
            <option value="high">高風險優先</option>
            <option value="pending">只看未處理</option>
          </select>
          <button className="secondary-btn" onClick={loadAlerts} disabled={loading}>
            {loading ? "載入中..." : "重新整理"}
          </button>
        </div>

        <div className="action-row">
          <button className="secondary-btn" onClick={handleSync} disabled={syncing}>
            {syncing ? "同步中..." : "同步虛擬通知"}
          </button>
          <button className="secondary-btn" onClick={loadAlerts} disabled={loading}>
            讀取最新 10 筆
          </button>
        </div>

        {statusMessage && <p className="section-subtitle">{statusMessage}</p>}
        {errorMessage && <p className="error-state">{errorMessage}</p>}

        <div className="stack-list">
          {filteredAlerts.length === 0 ? (
            <div className="list-card">
              <div className="list-title">目前無通知資料</div>
              <div className="list-meta">先按「同步虛擬通知」建立資料。</div>
            </div>
          ) : (
            filteredAlerts.map(item => (
              <div key={item._id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <div className="list-title">{item.type}</div>
                    <div className="list-meta">事件編號：{item.alertId || "-"}</div>
                  </div>
                  <span className={levelClass(item.level)}>風險 {item.level}</span>
                </div>
                <div className="list-grid">
                  <div>
                    <div className="field-key">發生時間</div>
                    <div className="field-value">{formatTime(item.happenedAt)}</div>
                  </div>
                  <div>
                    <div className="field-key">位置</div>
                    <div className="field-value">{item.location}</div>
                  </div>
                  <div>
                    <div className="field-key">處理狀態</div>
                    <div className="field-value">{item.status}</div>
                  </div>
                </div>
                <div className="action-row">
                  <button className="secondary-btn">查看截圖</button>
                  <button className="secondary-btn">開啟事件頁</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
