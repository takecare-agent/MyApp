import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { API_BASE_URL } from "../../config/runtime"

function toDateInputValue(date) {
  const localDate = new Date(date)
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset())
  return localDate.toISOString().slice(0, 10)
}

export default function FamilyCareRecords() {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(toDateInputValue(new Date()))
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const token = localStorage.getItem("token")

  const loadRecords = useCallback(async (dateValue = selectedDate) => {
    if (!token) {
      navigate("/")
      return
    }

    setLoading(true)
    setErrorMessage("")

    try {
      const query = new URLSearchParams({ limit: "10" })
      if (dateValue) query.set("date", dateValue)

      const res = await fetch(
        `${API_BASE_URL}/family/care-records/history?${query.toString()}`,
        {
          headers: { Authorization: "Bearer " + token }
        }
      )
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "讀取照護紀錄失敗")
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("讀取照護紀錄失敗。")
    } finally {
      setLoading(false)
    }
  }, [navigate, selectedDate, token])

  useEffect(() => {
    loadRecords(selectedDate)
  }, [loadRecords, selectedDate])

  const handleSync = async () => {
    if (!token) {
      navigate("/")
      return
    }

    setSyncing(true)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const res = await fetch(`${API_BASE_URL}/family/care-records/sync`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "同步失敗")
      }
      setStatusMessage(`已同步第 ${data.sampleIndex + 1} 筆照護紀錄。`)
      await loadRecords(selectedDate)
    } catch (error) {
      console.error(error)
      setErrorMessage("同步照護紀錄失敗。")
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
          <span className="section-kicker">照護紀錄瀏覽</span>
        </div>

        <h2 className="section-title">每日照護任務紀錄</h2>
        <p className="section-subtitle">
          同步照護紀錄後，可依日期讀取最新紀錄。
        </p>

        <div className="toolbar-row">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          />
          <button
            className="secondary-btn"
            onClick={() => loadRecords(selectedDate)}
            disabled={loading}
          >
            {loading ? "載入中..." : "套用日期"}
          </button>
        </div>

        <div className="action-row">
          <button className="secondary-btn" onClick={handleSync} disabled={syncing}>
            {syncing ? "同步中..." : "同步照護紀錄"}
          </button>
          <button
            className="secondary-btn"
            onClick={() => loadRecords(selectedDate)}
            disabled={loading}
          >
            讀取最新 10 筆
          </button>
        </div>

        {statusMessage && <p className="section-subtitle">{statusMessage}</p>}
        {errorMessage && <p className="error-state">{errorMessage}</p>}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>時間</th>
                <th>用藥</th>
                <th>飲食</th>
                <th>如廁情況</th>
                <th>活動情況</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={5}>目前無照護紀錄，請先同步資料。</td>
                </tr>
              ) : (
                records.map(item => (
                  <tr key={item._id}>
                    <td>{item.time}</td>
                    <td>{item.medicine}</td>
                    <td>{item.meal}</td>
                    <td>{item.toilet}</td>
                    <td>{item.activity}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
