import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

function toDateInputValue(date) {
  const localDate = new Date(date)
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset())
  return localDate.toISOString().slice(0, 10)
}

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

export default function FamilyEventHistory() {
  const navigate = useNavigate()
  const [startDate, setStartDate] = useState(toDateInputValue(new Date(Date.now() - 7 * 86400000)))
  const [endDate, setEndDate] = useState(toDateInputValue(new Date()))
  const [eventType, setEventType] = useState("all")
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const token = localStorage.getItem("token")

  const loadEvents = useCallback(async () => {
    if (!token) {
      navigate("/")
      return
    }

    setLoading(true)
    setErrorMessage("")

    try {
      const query = new URLSearchParams({
        limit: "10",
        type: eventType
      })
      if (startDate) query.set("startDate", startDate)
      if (endDate) query.set("endDate", endDate)

      const res = await fetch(
        `http://localhost:5000/family/events/history?${query.toString()}`,
        {
          headers: { Authorization: "Bearer " + token }
        }
      )
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "查詢失敗")
      }

      setEvents(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("查詢危險事件失敗。")
    } finally {
      setLoading(false)
    }
  }, [endDate, eventType, navigate, startDate, token])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  const handleSync = async () => {
    if (!token) {
      navigate("/")
      return
    }

    setSyncing(true)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const res = await fetch("http://localhost:5000/family/events/sync", {
        method: "POST",
        headers: { Authorization: "Bearer " + token }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "同步失敗")
      }

      setStatusMessage(`已同步第 ${data.sampleIndex + 1} 筆虛擬危險事件。`)
      await loadEvents()
    } catch (error) {
      console.error(error)
      setErrorMessage("同步危險事件失敗。")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/family")}>
            返回總覽
          </button>
          <span className="section-kicker">危險事件紀錄查詢</span>
        </div>

        <h2 className="section-title">條件查詢與歷史事件清單</h2>
        <p className="section-subtitle">
          點「同步虛擬事件」會寫入 MongoDB 一筆資料，再依日期與類型查詢最新 10 筆。
        </p>

        <div className="filter-grid">
          <div>
            <label className="input-label" htmlFor="event-start">
              起始日期
            </label>
            <input
              id="event-start"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="input-label" htmlFor="event-end">
              結束日期
            </label>
            <input
              id="event-end"
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <label className="input-label" htmlFor="event-type">
              事件類型
            </label>
            <select
              id="event-type"
              value={eventType}
              onChange={e => setEventType(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="跌倒">跌倒</option>
              <option value="離床">離床</option>
              <option value="久坐不動">久坐不動</option>
              <option value="呼救手勢">呼救手勢</option>
              <option value="異常行為">異常行為</option>
            </select>
          </div>
          <div className="filter-submit">
            <button className="primary-btn" onClick={loadEvents} disabled={loading}>
              {loading ? "查詢中..." : "查詢事件"}
            </button>
          </div>
        </div>

        <div className="action-row">
          <button className="secondary-btn" onClick={handleSync} disabled={syncing}>
            {syncing ? "同步中..." : "同步虛擬事件"}
          </button>
          <button className="secondary-btn" onClick={loadEvents} disabled={loading}>
            讀取最新 10 筆
          </button>
        </div>

        {statusMessage && <p className="section-subtitle">{statusMessage}</p>}
        {errorMessage && <p className="error-state">{errorMessage}</p>}

        <div className="stack-list">
          {events.length === 0 ? (
            <div className="list-card">
              <div className="list-title">查無事件資料</div>
              <div className="list-meta">可以先按「同步虛擬事件」。</div>
            </div>
          ) : (
            events.map(item => (
              <div className="list-card" key={item._id}>
                <div className="list-card-head">
                  <div>
                    <div className="list-title">{item.type}</div>
                    <div className="list-meta">{item.eventId || "-"}</div>
                  </div>
                  <span className="risk-pill risk-medium">{item.status}</span>
                </div>
                <p className="list-description">{item.description}</p>
                <div className="list-grid">
                  <div>
                    <div className="field-key">發生時間</div>
                    <div className="field-value">{formatTime(item.happenedAt)}</div>
                  </div>
                  <div>
                    <div className="field-key">附件</div>
                    <div className="field-value">{item.media}</div>
                  </div>
                </div>
                <div className="action-row">
                  <button className="secondary-btn">檢視內容</button>
                  <button className="secondary-btn">更新處理狀態</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
