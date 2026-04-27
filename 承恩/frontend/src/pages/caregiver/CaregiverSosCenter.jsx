import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

export default function CaregiverSosCenter() {
  const navigate = useNavigate()
  const token = localStorage.getItem("token")

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState("")
  const [statusFilter, setStatusFilter] = useState("active")
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const activeCount = useMemo(
    () => records.filter(item => item.status === "active").length,
    [records]
  )
  const latestActive = useMemo(
    () => records.find(item => item.status === "active"),
    [records]
  )

  const loadHistory = useCallback(async (silent = false) => {
    if (!token) {
      navigate("/")
      return
    }

    if (!silent) {
      setLoading(true)
    }

    try {
      const query = `status=${statusFilter}&limit=30`
      const res = await fetch(`http://localhost:5000/caregiver/sos/history?${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Load SOS history failed")
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("無法取得 SOS 事件，請稍後再試。")
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
    }, 15000)

    return () => {
      clearInterval(timer)
    }
  }, [loadHistory])

  const handleOpenMap = item => {
    const hasCoordinates = Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude)
    const query = hasCoordinates
      ? `${item.latitude},${item.longitude}`
      : item?.locationLabel

    if (!query) return

    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const handleResolve = async id => {
    if (!token) {
      navigate("/")
      return
    }

    setResolvingId(id)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const res = await fetch(`http://localhost:5000/caregiver/sos/${id}/resolve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Resolve SOS failed")
      }
      setStatusMessage("已將 SOS 事件標記為完成。")
      await loadHistory(true)
    } catch (error) {
      console.error(error)
      setErrorMessage("更新事件狀態失敗，請稍後再試。")
    } finally {
      setResolvingId("")
    }
  }

  if (loading) {
    return (
      <div className="home-page">
        <div className="home-card">
          <h2 className="section-title">SOS 指揮中心</h2>
          <p className="loading-state">載入中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/caregiver")}>
            返回總覽
          </button>
          <span className="section-kicker">SOS 指揮中心</span>
        </div>

        <h2 className="section-title">緊急求救事件面板</h2>
        <p className="section-subtitle">
          這裡會接收受顧者端送出的 SOS 事件，可直接開啟地圖、回撥電話並標記處理完成。
        </p>

        <div className="metric-row">
          <div className="metric-card">
            <div className="metric-label">目前篩選</div>
            <div className="metric-value">{statusFilter === "active" ? "未結案" : statusFilter === "resolved" ? "已結案" : "全部"}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">未結案數</div>
            <div className="metric-value">{activeCount}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">總事件數</div>
            <div className="metric-value">{records.length}</div>
          </div>
        </div>

        <div className="filter-grid">
          <div>
            <label className="input-label" htmlFor="sos-status-filter">
              事件狀態
            </label>
            <select
              id="sos-status-filter"
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
              <button className="primary-btn" onClick={() => handleOpenMap(latestActive)}>
                地圖導航
              </button>
              <button
                className="secondary-btn"
                onClick={() => {
                  window.location.href = `tel:${latestActive.patientPhone || "119"}`
                }}
              >
                回撥電話
              </button>
            </div>
          </div>
        ) : null}

        <div className="stack-list">
          {records.length === 0 ? (
            <div className="list-card">
              <div className="list-title">目前沒有 SOS 事件</div>
              <div className="list-meta">等待受顧者端觸發求救後，會顯示在這裡。</div>
            </div>
          ) : (
            records.map(item => (
              <div key={item._id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <div className="list-title">{item.patientName || "受顧者"}</div>
                    <div className="list-meta">事件編號：{item.eventId}</div>
                  </div>
                  <span className={item.status === "active" ? "risk-pill risk-high" : "risk-pill risk-low"}>
                    {item.status === "active" ? "處理中" : "已結案"}
                  </span>
                </div>

                <p className="list-description">{item.message || "受顧者觸發 SOS 求救"}</p>

                <div className="list-grid">
                  <div>
                    <div className="field-key">發生時間</div>
                    <div className="field-value">{formatTime(item.triggeredAt)}</div>
                  </div>
                  <div>
                    <div className="field-key">定位資訊</div>
                    <div className="field-value">{item.locationLabel || "-"}</div>
                  </div>
                  <div>
                    <div className="field-key">回撥電話</div>
                    <div className="field-value">{item.patientPhone || "-"}</div>
                  </div>
                </div>

                <div className="action-row">
                  <button
                    className="secondary-btn"
                    onClick={() => handleOpenMap(item)}
                    disabled={
                      !item.locationLabel &&
                      !(Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
                    }
                  >
                    開啟地圖
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => {
                      window.location.href = `tel:${item.patientPhone || "119"}`
                    }}
                  >
                    回撥電話
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => handleResolve(item._id)}
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
    </div>
  )
}
