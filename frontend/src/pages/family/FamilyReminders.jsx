import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { API_BASE_URL } from "../../config/runtime"

const CATEGORY_OPTIONS = ["用藥提醒", "醫療行程", "生理量測", "生活照護", "其他"]

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

function toDateTimeLocalString(value) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export default function FamilyReminders() {
  const navigate = useNavigate()
  const token = localStorage.getItem("token")

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState("")
  const [editingId, setEditingId] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [form, setForm] = useState({
    category: "用藥提醒",
    content: "",
    time: "",
    note: ""
  })

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

      const res = await fetch(`${API_BASE_URL}/family/reminders?${params.toString()}`, {
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

  const resetForm = () => {
    setForm({
      category: "用藥提醒",
      content: "",
      time: "",
      note: ""
    })
    setEditingId("")
  }

  const handleSubmit = async () => {
    if (!token) {
      navigate("/")
      return
    }

    if (!form.content.trim() || !form.time) {
      setErrorMessage("請完整輸入提醒內容與提醒時間。")
      return
    }

    setSaving(true)
    setStatusMessage("")
    setErrorMessage("")
    try {
      const url = editingId
        ? `${API_BASE_URL}/family/reminders/${editingId}`
        : `${API_BASE_URL}/family/reminders`
      const method = editingId ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          category: form.category,
          content: form.content.trim(),
          time: form.time,
          note: form.note.trim()
        })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Save reminder failed")
      }

      setStatusMessage(editingId ? "提醒已更新。" : "提醒已新增。")
      resetForm()
      await loadRecords()
    } catch (error) {
      console.error(error)
      setErrorMessage("儲存提醒失敗，請稍後再試。")
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = item => {
    setEditingId(item._id)
    setForm({
      category: item.category || "用藥提醒",
      content: item.content || "",
      time: toDateTimeLocalString(item.time),
      note: item.note || ""
    })
    setStatusMessage("")
    setErrorMessage("")
  }

  const handleDelete = async id => {
    if (!token) {
      navigate("/")
      return
    }

    setDeletingId(id)
    setStatusMessage("")
    setErrorMessage("")
    try {
      const res = await fetch(`${API_BASE_URL}/family/reminders/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Delete reminder failed")
      }
      setStatusMessage("提醒已刪除。")
      if (editingId === id) {
        resetForm()
      }
      await loadRecords()
    } catch (error) {
      console.error(error)
      setErrorMessage("刪除提醒失敗，請稍後再試。")
    } finally {
      setDeletingId("")
    }
  }

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/family")}>
            返回家屬首頁
          </button>
          <span className="section-kicker">提醒清單</span>
        </div>

        <h2 className="section-title">家屬提醒任務管理</h2>
        <p className="section-subtitle">
          由家屬建立照護提醒，照顧者端可接收並標記完成。
        </p>

        <div className="filter-grid">
          <div>
            <label className="input-label" htmlFor="family-reminder-category">
              提醒類別
            </label>
            <select
              id="family-reminder-category"
              value={form.category}
              onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
            >
              {CATEGORY_OPTIONS.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="input-label" htmlFor="family-reminder-time">
              提醒時間
            </label>
            <input
              id="family-reminder-time"
              type="datetime-local"
              value={form.time}
              onChange={e => setForm(prev => ({ ...prev, time: e.target.value }))}
            />
          </div>
          <div>
            <label className="input-label" htmlFor="family-reminder-status-filter">
              顯示狀態
            </label>
            <select
              id="family-reminder-status-filter"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="pending">未完成</option>
              <option value="done">已完成</option>
            </select>
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 0 }}>
          <div>
            <label className="input-label" htmlFor="family-reminder-content">
              提醒內容
            </label>
            <input
              id="family-reminder-content"
              type="text"
              placeholder="例如：晚餐後服用降壓藥"
              value={form.content}
              onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
            />
          </div>
          <div>
            <label className="input-label" htmlFor="family-reminder-note">
              備註
            </label>
            <textarea
              id="family-reminder-note"
              rows={2}
              placeholder="例如：若頭暈請先測血壓再服藥"
              value={form.note}
              onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
            />
          </div>
        </div>

        <div className="action-row">
          <button className="primary-btn" onClick={handleSubmit} disabled={saving}>
            {saving ? "儲存中..." : editingId ? "更新提醒" : "新增提醒"}
          </button>
          <button className="secondary-btn" onClick={loadRecords} disabled={loading}>
            {loading ? "載入中..." : "重新整理"}
          </button>
          {editingId ? (
            <button className="secondary-btn" onClick={resetForm}>
              取消編輯
            </button>
          ) : null}
        </div>

        {statusMessage && <p className="section-subtitle">{statusMessage}</p>}
        {errorMessage && <p className="error-state">{errorMessage}</p>}

        <div className="stack-list">
          {records.length === 0 ? (
            <div className="list-card">
              <div className="list-title">目前沒有提醒事項</div>
              <div className="list-meta">先建立一筆提醒，照顧者端就能看到。</div>
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
                    {item.isCompleted ? "已完成" : "未完成"}
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
                  <button className="secondary-btn" onClick={() => handleEdit(item)}>
                    編輯
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => handleDelete(item._id)}
                    disabled={deletingId === item._id}
                  >
                    {deletingId === item._id ? "刪除中..." : "刪除"}
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