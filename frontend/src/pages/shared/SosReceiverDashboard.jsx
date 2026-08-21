import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { API_BASE_URL } from "../../config/runtime"
import { callPhone, openMapLocation } from "../../lib/nativeBridge"

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

export default function SosReceiverDashboard({
  role,
  homePath,
  endpointBase,
  title,
  subtitle
}) {
  const navigate = useNavigate()
  const token = localStorage.getItem("token")
  const lastSeenKey = `${role}_last_seen_sos_event_id`

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("active")
  const [resolvingId, setResolvingId] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [alertPopup, setAlertPopup] = useState(null)

  const activeCount = useMemo(
    () => records.filter(item => item.status === "active").length,
    [records]
  )
  const latestActive = useMemo(
    () => records.find(item => item.status === "active"),
    [records]
  )

  const rememberSeenEvent = eventId => {
    if (eventId) localStorage.setItem(lastSeenKey, eventId)
  }

  const loadHistory = useCallback(async (silent = false) => {
    if (!token) {
      navigate("/")
      return
    }

    if (!silent) setLoading(true)

    try {
      const res = await fetch(
        `${API_BASE_URL}${endpointBase}/history?status=${statusFilter}&limit=30`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Load SOS failed")
      }

      const nextRecords = Array.isArray(data.records) ? data.records : []
      setRecords(nextRecords)

      const incoming = nextRecords.find(item => item.status === "active")
      const lastSeen = localStorage.getItem(lastSeenKey)
      if (incoming?.eventId && incoming.eventId !== lastSeen) {
        setAlertPopup(incoming)
        setStatusMessage("收到新的 SOS 求救通知。")
      }
    } catch (error) {
      console.error(error)
      setErrorMessage("無法取得 SOS 通知，請稍後再試。")
    } finally {
      if (!silent) setLoading(false)
    }
  }, [endpointBase, lastSeenKey, navigate, statusFilter, token])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    const timer = setInterval(() => {
      loadHistory(true)
    }, 10000)

    return () => clearInterval(timer)
  }, [loadHistory])

  const resolveEvent = async (id, { closePopup = false } = {}) => {
    if (!token) {
      navigate("/")
      return
    }

    setResolvingId(id)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const res = await fetch(`${API_BASE_URL}${endpointBase}/${id}/resolve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Resolve failed")
      }

      if (data.record?.eventId) rememberSeenEvent(data.record.eventId)
      if (closePopup) setAlertPopup(null)
      setStatusMessage("已將 SOS 事件標記為完成。")
      await loadHistory(true)
    } catch (error) {
      console.error(error)
      setErrorMessage("更新 SOS 狀態失敗，請稍後再試。")
    } finally {
      setResolvingId("")
    }
  }

  const closePopup = () => {
    if (alertPopup?.eventId) rememberSeenEvent(alertPopup.eventId)
    setAlertPopup(null)
  }

  if (loading) {
    return (
      <div className="home-page">
        <div className="home-card">
          <h2 className="section-title">{title}</h2>
          <p className="loading-state">載入中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="home-page">
      <div className="home-card wide-card sos-clean-page">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate(homePath)}>
            返回總覽
          </button>
          <span className="section-kicker">SOS 通知接收</span>
        </div>

        <h2 className="section-title">{title}</h2>
        <p className="section-subtitle">{subtitle}</p>

        <div className="metric-row">
          <div className="metric-card">
            <div className="metric-label">目前篩選</div>
            <div className="metric-value">
              {statusFilter === "active" ? "未結案" : statusFilter === "resolved" ? "已處理" : "全部"}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">未結案</div>
            <div className="metric-value">{activeCount}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">事件數</div>
            <div className="metric-value">{records.length}</div>
          </div>
        </div>

        <div className="filter-grid">
          <div>
            <label className="input-label" htmlFor={`${role}-sos-status`}>事件狀態</label>
            <select
              id={`${role}-sos-status`}
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
            >
              <option value="active">未結案</option>
              <option value="resolved">已處理</option>
              <option value="all">全部</option>
            </select>
          </div>
          <div className="filter-submit">
            <button className="primary-btn" onClick={() => loadHistory()}>
              重新整理
            </button>
          </div>
        </div>

        {statusMessage && <p className="section-subtitle">{statusMessage}</p>}
        {errorMessage && <p className="error-state">{errorMessage}</p>}

        {latestActive ? (
          <div className="sos-banner">
            <div className="sos-title">最新未結案 SOS</div>
            <div className="sos-value">
              {latestActive.patientName || "受顧者"} | {formatTime(latestActive.triggeredAt)}
            </div>
            <div className="action-row">
              <button className="primary-btn" onClick={() => openMapLocation(latestActive)}>
                開啟地圖導航
              </button>
              <button className="secondary-btn" onClick={() => callPhone(latestActive.patientPhone || "119")}>
                回撥電話
              </button>
            </div>
          </div>
        ) : null}

        <div className="stack-list">
          {records.length === 0 ? (
            <div className="list-card">
              <div className="list-title">目前沒有 SOS 事件</div>
              <div className="list-meta">等待受顧者端觸發 SOS 後會顯示在這裡。</div>
            </div>
          ) : (
            records.map(item => (
              <div className="list-card" key={item._id}>
                <div className="list-card-head">
                  <div>
                    <div className="list-title">{item.patientName || "受顧者"}</div>
                    <div className="list-meta">事件編號：{item.eventId}</div>
                  </div>
                  <span className={item.status === "active" ? "risk-pill risk-high" : "risk-pill risk-low"}>
                    {item.status === "active" ? "未結案" : "已處理"}
                  </span>
                </div>

                <p className="list-description">{item.message || "受顧者觸發 SOS 求救"}</p>

                <div className="list-grid">
                  <div>
                    <div className="field-key">時間</div>
                    <div className="field-value">{formatTime(item.triggeredAt)}</div>
                  </div>
                  <div>
                    <div className="field-key">位置</div>
                    <div className="field-value">{item.locationLabel || "-"}</div>
                  </div>
                  <div>
                    <div className="field-key">電話</div>
                    <div className="field-value">{item.patientPhone || "-"}</div>
                  </div>
                </div>

                <div className="action-row">
                  <button className="secondary-btn" onClick={() => openMapLocation(item)}>
                    地圖
                  </button>
                  <button className="secondary-btn" onClick={() => callPhone(item.patientPhone || "119")}>
                    電話
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => resolveEvent(item._id)}
                    disabled={item.status !== "active" || resolvingId === item._id}
                  >
                    {resolvingId === item._id ? "更新中..." : "標記已處理"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {alertPopup ? (
        <div className="alert-overlay">
          <div className="alert-modal">
            <div className="alert-icon">⚠️</div>
            <h3>緊急 SOS 通知</h3>
            <p className="alert-strong">{alertPopup.patientName || "受顧者"} 需要協助</p>
            <p className="alert-meta">事件編號：{alertPopup.eventId}</p>
            <p className="alert-meta">時間：{formatTime(alertPopup.triggeredAt)}</p>
            <p className="alert-meta">位置：{alertPopup.locationLabel || "-"}</p>

            <div className="action-row">
              <button className="primary-btn" onClick={() => openMapLocation(alertPopup)}>
                開啟地圖導航
              </button>
              <button className="secondary-btn" onClick={() => callPhone(alertPopup.patientPhone || "119")}>
                回撥電話
              </button>
            </div>
            <div className="action-row">
              <button
                className="secondary-btn"
                onClick={() => resolveEvent(alertPopup._id, { closePopup: true })}
                disabled={resolvingId === alertPopup._id}
              >
                {resolvingId === alertPopup._id ? "更新中..." : "標記已處理"}
              </button>
              <button className="secondary-btn" onClick={closePopup}>
                先關閉
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
