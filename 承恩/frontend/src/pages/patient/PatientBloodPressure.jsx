import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

const JUDGE_RULES = [
  "正常：SYS < 120 且 DIA < 80",
  "偏高：SYS 120 - 139 或 DIA 80 - 89",
  "高血壓：SYS >= 140 或 DIA >= 90",
  "低血壓：SYS < 90 或 DIA < 60"
]

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

function levelClass(level) {
  if (level === "高血壓" || level === "低血壓") return "risk-pill risk-high"
  if (level === "偏高") return "risk-pill risk-medium"
  return "risk-pill risk-low"
}

export default function PatientBloodPressure() {
  const navigate = useNavigate()
  const token = localStorage.getItem("token")

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [form, setForm] = useState({
    sys: "",
    dia: "",
    pulse: ""
  })

  const latestRecord = useMemo(() => (records.length > 0 ? records[0] : null), [records])

  const loadHistory = useCallback(async () => {
    if (!token) {
      navigate("/")
      return
    }

    setLoading(true)
    setErrorMessage("")
    try {
      const res = await fetch("http://localhost:5000/patient/blood-pressure/history?limit=30", {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Load blood pressure failed")
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("無法載入血壓資料，請稍後再試。")
    } finally {
      setLoading(false)
    }
  }, [navigate, token])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleRecord = async () => {
    if (!token) {
      navigate("/")
      return
    }

    if (!form.sys || !form.dia) {
      setErrorMessage("請先輸入 SYS 與 DIA。")
      return
    }

    setSaving(true)
    setStatusMessage("")
    setErrorMessage("")
    try {
      const res = await fetch("http://localhost:5000/patient/blood-pressure/record", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          sys: Number(form.sys),
          dia: Number(form.dia),
          pulse: form.pulse === "" ? "" : Number(form.pulse)
        })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Save blood pressure failed")
      }

      setStatusMessage(`紀錄成功，判定為「${data.record?.level || "-"}」。`)
      setForm({ sys: "", dia: "", pulse: "" })
      await loadHistory()
    } catch (error) {
      console.error(error)
      setErrorMessage("新增血壓紀錄失敗，請稍後再試。")
    } finally {
      setSaving(false)
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
      const res = await fetch("http://localhost:5000/patient/blood-pressure/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Sync failed")
      }
      setStatusMessage(`已新增一筆示範血壓資料（${data.record?.sys}/${data.record?.dia}）。`)
      await loadHistory()
    } catch (error) {
      console.error(error)
      setErrorMessage("新增示範資料失敗，請稍後再試。")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/patient")}>
            返回受顧者首頁
          </button>
          <span className="section-kicker">血壓管理</span>
        </div>

        <h2 className="section-title">血壓量測與趨勢資料</h2>
        <p className="section-subtitle">
          支援手動輸入與示範資料同步，並依照血壓規則自動判定風險級別。
        </p>

        {latestRecord && (
          <div className="sos-banner">
            <div className="sos-title">最新量測</div>
            <div className="sos-value">
              {latestRecord.sys}/{latestRecord.dia} mmHg
            </div>
            <span className={levelClass(latestRecord.level)}>{latestRecord.level}</span>
          </div>
        )}

        <div className="filter-grid">
          <div>
            <label className="input-label" htmlFor="bp-sys">
              收縮壓 SYS
            </label>
            <input
              id="bp-sys"
              type="number"
              placeholder="例如 128"
              value={form.sys}
              onChange={e => handleChange("sys", e.target.value)}
            />
          </div>
          <div>
            <label className="input-label" htmlFor="bp-dia">
              舒張壓 DIA
            </label>
            <input
              id="bp-dia"
              type="number"
              placeholder="例如 82"
              value={form.dia}
              onChange={e => handleChange("dia", e.target.value)}
            />
          </div>
          <div>
            <label className="input-label" htmlFor="bp-pulse">
              脈搏 Pulse
            </label>
            <input
              id="bp-pulse"
              type="number"
              placeholder="例如 76"
              value={form.pulse}
              onChange={e => handleChange("pulse", e.target.value)}
            />
          </div>
        </div>

        <div className="action-row">
          <button className="primary-btn" onClick={handleRecord} disabled={saving}>
            {saving ? "儲存中..." : "儲存紀錄"}
          </button>
          <button className="secondary-btn" onClick={handleSyncDemo} disabled={syncing}>
            {syncing ? "同步中..." : "同步示範資料"}
          </button>
          <button className="secondary-btn" onClick={loadHistory} disabled={loading}>
            {loading ? "載入中..." : "重新整理"}
          </button>
        </div>

        <div className="rule-box">
          <div className="rule-title">血壓異常判斷規則</div>
          <ul className="rule-list">
            {JUDGE_RULES.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {statusMessage && <p className="section-subtitle">{statusMessage}</p>}
        {errorMessage && <p className="error-state">{errorMessage}</p>}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>時間</th>
                <th>SYS</th>
                <th>DIA</th>
                <th>Pulse</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={5}>目前沒有血壓紀錄</td>
                </tr>
              ) : (
                records.map(item => (
                  <tr key={item._id}>
                    <td>{formatTime(item.measuredAt)}</td>
                    <td>{item.sys}</td>
                    <td>{item.dia}</td>
                    <td>{item.pulse ?? "-"}</td>
                    <td>{item.level}</td>
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
