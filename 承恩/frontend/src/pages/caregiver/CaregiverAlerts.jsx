import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

const EVENT_TYPES = ["跌倒", "離床", "久坐不動", "異常行為", "呼救手勢", "其他"]
const SEVERITY_OPTIONS = ["高", "中", "低"]
const STATUS_OPTIONS = ["未處理", "處理中", "已完成"]

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

export default function CaregiverAlerts() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState("")
  const [severityFilter, setSeverityFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [form, setForm] = useState({
    type: "跌倒",
    severity: "高",
    location: "",
    description: "",
    status: "未處理"
  })

  const token = localStorage.getItem("token")

  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", "50")
    if (severityFilter !== "all") params.set("severity", severityFilter)
    if (statusFilter !== "all") params.set("status", statusFilter)
    return params.toString()
  }, [severityFilter, statusFilter])

  const loadHistory = useCallback(async () => {
    if (!token) {
      navigate("/")
      return
    }

    setLoading(true)
    setErrorMessage("")

    try {
      const res = await fetch(`http://localhost:5000/caregiver/alerts/history?${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Load alerts failed")
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("無法載入異常事件，請稍後再試。")
    } finally {
      setLoading(false)
    }
  }, [navigate, query, token])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleCreate = async () => {
    if (!token) {
      navigate("/")
      return
    }

    if (!form.type.trim()) {
      setErrorMessage("請選擇事件類型。")
      return
    }

    setSubmitting(true)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const res = await fetch("http://localhost:5000/caregiver/alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          type: form.type.trim(),
          severity: form.severity,
          location: form.location.trim(),
          description: form.description.trim(),
          status: form.status
        })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Create alert failed")
      }

      setStatusMessage("異常事件已回報。")
      setForm({
        type: "跌倒",
        severity: "高",
        location: "",
        description: "",
        status: "未處理"
      })
      await loadHistory()
    } catch (error) {
      console.error(error)
      setErrorMessage("回報異常事件失敗，請稍後再試。")
    } finally {
      setSubmitting(false)
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
      const res = await fetch("http://localhost:5000/caregiver/alerts/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Sync failed")
      }
      setStatusMessage("已新增一筆示範異常事件。")
      await loadHistory()
    } catch (error) {
      console.error(error)
      setErrorMessage("新增示範資料失敗，請稍後再試。")
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
      const res = await fetch(`http://localhost:5000/caregiver/alerts/${id}/status`, {
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
          <button className="ghost-btn" onClick={() => navigate("/caregiver")}>
            返回看護首頁
          </button>
          <span className="section-kicker">異常事件面板</span>
        </div>

        <h2 className="section-title">危險行為偵測與即時警示</h2>
        <p className="section-subtitle">
          看護端可回報異常事件、調整事件狀態，家屬端會同步看到相同紀錄。
        </p>

        <div className="filter-grid">
          <div>
            <label className="input-label" htmlFor="cg-alert-type">
              事件類型
            </label>
            <select
              id="cg-alert-type"
              value={form.type}
              onChange={e => handleChange("type", e.target.value)}
            >
              {EVENT_TYPES.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="input-label" htmlFor="cg-alert-severity">
              危險等級
            </label>
            <select
              id="cg-alert-severity"
              value={form.severity}
              onChange={e => handleChange("severity", e.target.value)}
            >
              {SEVERITY_OPTIONS.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="input-label" htmlFor="cg-alert-status">
              初始狀態
            </label>
            <select
              id="cg-alert-status"
              value={form.status}
              onChange={e => handleChange("status", e.target.value)}
            >
              {STATUS_OPTIONS.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 0 }}>
          <div>
            <label className="input-label" htmlFor="cg-alert-location">
              發生地點
            </label>
            <input
              id="cg-alert-location"
              type="text"
              placeholder="例如：客廳 / 臥室 / 浴室"
              value={form.location}
              onChange={e => handleChange("location", e.target.value)}
            />
          </div>
          <div>
            <label className="input-label" htmlFor="cg-alert-description">
              事件說明
            </label>
            <textarea
              id="cg-alert-description"
              rows={3}
              placeholder="例如：浴室疑似跌倒，已先協助坐下並觀察。"
              value={form.description}
              onChange={e => handleChange("description", e.target.value)}
            />
          </div>
        </div>

        <div className="action-row">
          <button className="primary-btn" onClick={handleCreate} disabled={submitting}>
            {submitting ? "回報中..." : "回報異常事件"}
          </button>
          <button className="secondary-btn" onClick={handleSyncDemo} disabled={syncing}>
            {syncing ? "新增中..." : "新增示範資料"}
          </button>
        </div>

        <div className="filter-grid">
          <div>
            <label className="input-label" htmlFor="cg-filter-severity">
              篩選等級
            </label>
            <select
              id="cg-filter-severity"
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
            <label className="input-label" htmlFor="cg-filter-status">
              篩選狀態
            </label>
            <select
              id="cg-filter-status"
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

        {statusMessage && <p className="section-subtitle">{statusMessage}</p>}
        {errorMessage && <p className="error-state">{errorMessage}</p>}

        <div className="stack-list">
          {records.length === 0 ? (
            <div className="list-card">
              <div className="list-title">目前沒有異常事件</div>
              <div className="list-meta">可先用上方表單建立事件，或新增示範資料。</div>
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
                    <div className="field-key">發生時間</div>
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
                    onClick={() => handleUpdateStatus(item._id, "未處理")}
                    disabled={updatingId === item._id || item.status === "未處理"}
                  >
                    設為未處理
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => handleUpdateStatus(item._id, "處理中")}
                    disabled={updatingId === item._id || item.status === "處理中"}
                  >
                    設為處理中
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => handleUpdateStatus(item._id, "已完成")}
                    disabled={updatingId === item._id || item.status === "已完成"}
                  >
                    設為已完成
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
