import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

export default function CaregiverReminders() {
  const navigate = useNavigate()
  const token = localStorage.getItem("token")

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState("")
  const [statusFilter, setStatusFilter] = useState("pending")
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const loadRecords = useCallback(async () => {
    if (!token) {
      navigate("/")
      return
    }

    setLoading(true)
    setErrorMessage("")
    try {
      const params = new URLSearchParams()
      params.set("limit", "60")
      if (statusFilter === "pending") params.set("completed", "false")
      if (statusFilter === "done") params.set("completed", "true")

      const res = await fetch(`http://localhost:5000/caregiver/reminders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Load reminders failed")
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("無法載入提醒清單，請稍後再試。")
    } finally {
      setLoading(false)
    }
  }, [navigate, statusFilter, token])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const updateReminderState = async (id, action) => {
    if (!token) {
      navigate("/")
      return
    }

    setUpdatingId(id)
    setStatusMessage("")
    setErrorMessage("")
    try {
      const endpoint = action === "complete" ? "complete" : "reset"
      const res = await fetch(`http://localhost:5000/caregiver/reminders/${id}/${endpoint}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Update reminder failed")
      }
      setStatusMessage(action === "complete" ? "提醒已標記完成。" : "提醒已改回未完成。")
      await loadRecords()
    } catch (error) {
      console.error(error)
      setErrorMessage("更新提醒狀態失敗，請稍後再試。")
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
          <span className="section-kicker">提醒任務清單</span>
        </div>

        <h2 className="section-title">照顧者提醒任務</h2>
        <p className="section-subtitle">
          接收家屬端指派的提醒事項，完成後可回報狀態。
        </p>

        <div className="toolbar-row">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">全部</option>
            <option value="pending">未完成</option>
            <option value="done">已完成</option>
          </select>
          <button className="secondary-btn" onClick={loadRecords} disabled={loading}>
            {loading ? "載入中..." : "重新整理"}
          </button>
        </div>

        {statusMessage && <p className="section-subtitle">{statusMessage}</p>}
        {errorMessage && <p className="error-state">{errorMessage}</p>}

        <div className="stack-list">
          {records.length === 0 ? (
            <div className="list-card">
              <div className="list-title">目前沒有提醒事項</div>
              <div className="list-meta">等待家屬新增提醒後，任務會顯示在這裡。</div>
            </div>
          ) : (
            records.map(item => (
              <div key={item._id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <div className="list-title">{item.category || "提醒事項"}</div>
                    <div className="list-meta">提醒編號：{item.reminderId || "-"}</div>
                  </div>
                  <span className={item.isCompleted ? "risk-pill risk-low" : "risk-pill risk-medium"}>
                    {item.isCompleted ? "已完成" : "待完成"}
                  </span>
                </div>

                <p className="list-description">{item.content || "-"}</p>

                <div className="list-grid">
                  <div>
                    <div className="field-key">提醒時間</div>
                    <div className="field-value">{formatTime(item.time)}</div>
                  </div>
                  <div>
                    <div className="field-key">備註</div>
                    <div className="field-value">{item.note || "-"}</div>
                  </div>
                  <div>
                    <div className="field-key">完成時間</div>
                    <div className="field-value">{formatTime(item.completedAt)}</div>
                  </div>
                </div>

                <div className="action-row">
                  <button
                    className="secondary-btn"
                    onClick={() => updateReminderState(item._id, "complete")}
                    disabled={updatingId === item._id || item.isCompleted}
                  >
                    標記完成
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => updateReminderState(item._id, "reset")}
                    disabled={updatingId === item._id || !item.isCompleted}
                  >
                    改回未完成
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
