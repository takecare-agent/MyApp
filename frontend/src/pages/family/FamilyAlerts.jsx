import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { API_BASE_URL } from "../../config/runtime"

const STATUS_OPTIONS = ["未處理", "處理中", "已完成"]
const SEVERITY_OPTIONS = ["高", "中", "低"]

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

function severityClass(level) {
  if (level === "高") return "risk-pill risk-high"
  if (level === "中") return "risk-pill risk-medium"
  return "risk-pill risk-low"
}

export default function FamilyAlerts() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [updatingId, setUpdatingId] = useState("")
  const [severityFilter, setSeverityFilter] = useState("all")
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
      const params = new URLSearchParams()
      params.set("limit", "40")
      if (severityFilter !== "all") params.set("severity", severityFilter)
      if (statusFilter !== "all") params.set("status", statusFilter)

      const res = await fetch(`${API_BASE_URL}/family/alerts/history?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Load abnormal alerts failed")
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("無法載入異常事件，請稍後再試。")
    } finally {
      setLoading(false)
    }
  }, [navigate, severityFilter, statusFilter, token])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleSyncDemo = async () => {
    if (!token) {
      navigate("/")
      return
    }

    setSyncing(true)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const res = await fetch(`${API_BASE_URL}/family/alerts/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Sync failed")
      }
      setStatusMessage("已新增一筆異常事件。")
      await loadHistory()
    } catch (error) {
      console.error(error)
      setErrorMessage("新增事件失敗，請稍後再試。")
    } finally {
      setSyncing(false)
    }
  }

  const handleUpdateStatus = async (id, nextStatus) => {
    if (!token) {
      navigate("/")
      return
    }

    setUpdatingId(id)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const res = await fetch(`${API_BASE_URL}/family/alerts/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: nextStatus })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Update status failed")
      }
      setStatusMessage(`已更新事件狀態為「${nextStatus}」。`)
      await loadHistory()
    } catch (error) {
      console.error(error)
      setErrorMessage("更新狀態失敗，請稍後再試。")
    } finally {
      setUpdatingId("")
    }
  }

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/family")}>
            返回家屬首頁
          </button>
          <span className="section-kicker">異常事件中心</span>
        </div>

        <h2 className="section-title">異常事件即時通知</h2>
        <p className="section-subtitle">
          家屬端可即時查看事件分級與處理狀態，也可直接調整事件進度。
        </p>

        <div className="filter-grid">
          <div>
            <label className="input-label" htmlFor="family-alert-severity">
              危險等級
            </label>
            <select
              id="family-alert-severity"
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
            >
              <option value="all">全部</option>
              {SEVERITY_OPTIONS.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="input-label" htmlFor="family-alert-status">
              處理狀態
            </label>
            <select
              id="family-alert-status"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">全部</option>
              {STATUS_OPTIONS.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-submit">
            <button className="primary-btn" onClick={loadHistory} disabled={loading}>
              {loading ? "載入中..." : "重新查詢"}
            </button>
          </div>
        </div>

        <div className="action-row">
          <button className="secondary-btn" onClick={handleSyncDemo} disabled={syncing}>
            {syncing ? "新增中..." : "新增事件"}
          </button>
          <button className="secondary-btn" onClick={loadHistory} disabled={loading}>
            重新整理
          </button>
        </div>

        {statusMessage && <p className="section-subtitle">{statusMessage}</p>}
        {errorMessage && <p className="error-state">{errorMessage}</p>}

        <div className="stack-list">
          {records.length === 0 ? (
            <div className="list-card">
              <div className="list-title">目前沒有異常事件</div>
              <div className="list-meta">等待照顧者回報或系統偵測後，資料會顯示在這裡。</div>
            </div>
          ) : (
            records.map(item => (
              <div key={item._id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <div className="list-title">{item.type || "未命名事件"}</div>
                    <div className="list-meta">事件編號：{item.eventId || "-"}</div>
                  </div>
                  <span className={severityClass(item.severity)}>{item.severity || "中"}</span>
                </div>

                <p className="list-description">{item.description || "尚無補充說明。"}</p>

                <div className="list-grid">
                  <div>
                    <div className="field-key">事件時間</div>
                    <div className="field-value">{formatTime(item.happenedAt)}</div>
                  </div>
                  <div>
                    <div className="field-key">地點</div>
                    <div className="field-value">{item.location || "-"}</div>
                  </div>
                  <div>
                    <div className="field-key">狀態</div>
                    <div className="field-value">{item.status || "-"}</div>
                  </div>
                </div>

                <div className="action-row">
                  <button
                    className="secondary-btn"
                    onClick={() => handleUpdateStatus(item._id, "處理中")}
                    disabled={updatingId === item._id || item.status === "處理中"}
                  >
                    標記處理中
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => handleUpdateStatus(item._id, "已完成")}
                    disabled={updatingId === item._id || item.status === "已完成"}
                  >
                    標記已完成
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
