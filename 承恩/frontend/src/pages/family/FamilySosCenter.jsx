import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

const LAST_SEEN_KEY = "family_last_seen_sos_event_id"

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

export default function FamilySosCenter() {
  const navigate = useNavigate()
  const token = localStorage.getItem("token")

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("active")
  const [resolvingId, setResolvingId] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [alertPopup, setAlertPopup] = useState(null)

  const latestActive = useMemo(
    () => records.find(item => item.status === "active"),
    [records]
  )
  const activeCount = useMemo(
    () => records.filter(item => item.status === "active").length,
    [records]
  )

  const rememberSeenEvent = eventId => {
    if (!eventId) return
    localStorage.setItem(LAST_SEEN_KEY, eventId)
  }

  const openMap = item => {
    const hasCoordinates = Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude)
    const query = hasCoordinates
      ? `${item.latitude},${item.longitude}`
      : item?.locationLabel

    if (!query) return

    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const callBack = item => {
    window.location.href = `tel:${item?.patientPhone || "119"}`
  }

  const loadHistory = useCallback(async (silent = false) => {
    if (!token) {
      navigate("/")
      return
    }

    if (!silent) {
      setLoading(true)
    }

    try {
      const res = await fetch(
        `http://localhost:5000/family/sos/history?status=${statusFilter}&limit=30`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Load family SOS failed")
      }

      const nextRecords = Array.isArray(data.records) ? data.records : []
      setRecords(nextRecords)

      const incoming = nextRecords.find(item => item.status === "active")
      const lastSeen = localStorage.getItem(LAST_SEEN_KEY)
      if (incoming?.eventId && incoming.eventId !== lastSeen) {
        setAlertPopup(incoming)
        setStatusMessage("收到新的 SOS 求救通知。")
      }
    } catch (error) {
      console.error(error)
      setErrorMessage("無法取得 SOS 通知，請稍後再試。")
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [navigate, statusFilter, token])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    const timer = setInterval(() => {
      loadHistory(true)
    }, 10000)
    return () => clearInterval(timer)
  }, [loadHistory])

  const handleResolve = async (id, options = { closePopup: false }) => {
    if (!token) {
      navigate("/")
      return
    }

    setResolvingId(id)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const res = await fetch(`http://localhost:5000/family/sos/${id}/resolve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Resolve failed")
      }

      if (data.record?.eventId) {
        rememberSeenEvent(data.record.eventId)
      }
      setStatusMessage("已標記 SOS 事件為完成。")

      if (options.closePopup) {
        setAlertPopup(null)
      }
      await loadHistory(true)
    } catch (error) {
      console.error(error)
      setErrorMessage("更新 SOS 狀態失敗，請稍後再試。")
    } finally {
      setResolvingId("")
    }
  }

  const closePopup = () => {
    if (alertPopup?.eventId) {
      rememberSeenEvent(alertPopup.eventId)
    }
    setAlertPopup(null)
  }

  if (loading) {
    return (
      <div className="home-page">
        <div className="home-card">
          <h2 className="section-title">SOS 通知中心</h2>
          <p className="loading-state">載入中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/family")}>
            返回總覽
          </button>
          <span className="section-kicker">SOS 通知接收</span>
        </div>

        <h2 className="section-title">家屬緊急通知中心</h2>
        <p className="section-subtitle">
          已整合家屬端接警報流程：輪詢接收 SOS、彈窗提醒、地圖導航、電話回撥與事件結案。
        </p>

        <div className="metric-row">
          <div className="metric-card">
            <div className="metric-label">目前篩選</div>
            <div className="metric-value">
              {statusFilter === "active" ? "未結案" : statusFilter === "resolved" ? "已結案" : "全部"}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">未結案</div>
            <div className="metric-value">{activeCount}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">事件總數</div>
            <div className="metric-value">{records.length}</div>
          </div>
        </div>

        <div className="filter-grid">
          <div>
            <label className="input-label" htmlFor="family-sos-status-filter">
              事件狀態
            </label>
            <select
              id="family-sos-status-filter"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="active">未結案</option>
              <option value="resolved">已結案</option>
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
              <button className="primary-btn" onClick={() => openMap(latestActive)}>
                開啟地圖導航
              </button>
              <button className="secondary-btn" onClick={() => callBack(latestActive)}>
                立即回撥電話
              </button>
            </div>
          </div>
        ) : null}

        <div className="stack-list">
          {records.length === 0 ? (
            <div className="list-card">
              <div className="list-title">目前沒有 SOS 事件</div>
              <div className="list-meta">等待受顧者端或照顧端觸發 SOS 後會顯示在這裡。</div>
            </div>
          ) : (
            records.map(item => (
              <div className="list-card" key={item._id}>
                <div className="list-card-head">
                  <div>
                    <div className="list-title">{item.patientName || "受顧者"}</div>
                    <div className="list-meta">編號：{item.eventId}</div>
                  </div>
                  <span className={item.status === "active" ? "risk-pill risk-high" : "risk-pill risk-low"}>
                    {item.status === "active" ? "高優先" : "已完成"}
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
                    <div className="field-key">回撥電話</div>
                    <div className="field-value">{item.patientPhone || "-"}</div>
                  </div>
                </div>

                <div className="action-row">
                  <button className="secondary-btn" onClick={() => openMap(item)}>
                    地圖
                  </button>
                  <button className="secondary-btn" onClick={() => callBack(item)}>
                    回撥
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => handleResolve(item._id)}
                    disabled={item.status !== "active" || resolvingId === item._id}
                  >
                    {resolvingId === item._id ? "更新中..." : "標記已聯繫"}
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
            <h3>緊急求救通知</h3>
            <p className="alert-strong">{alertPopup.patientName || "受顧者"} 需要協助</p>
            <p className="alert-meta">事件編號：{alertPopup.eventId}</p>
            <p className="alert-meta">時間：{formatTime(alertPopup.triggeredAt)}</p>
            <p className="alert-meta">位置：{alertPopup.locationLabel || "-"}</p>

            <div className="action-row">
              <button className="primary-btn" onClick={() => openMap(alertPopup)}>
                開啟地圖導航
              </button>
              <button className="secondary-btn" onClick={() => callBack(alertPopup)}>
                立即回撥電話
              </button>
            </div>
            <div className="action-row">
              <button
                className="secondary-btn"
                onClick={() => handleResolve(alertPopup._id, { closePopup: true })}
                disabled={resolvingId === alertPopup._id}
              >
                {resolvingId === alertPopup._id ? "更新中..." : "標記已處理"}
              </button>
              <button className="secondary-btn" onClick={closePopup}>
                稍後處理
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
