import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { API_BASE_URL } from "../../config/runtime"

// 必須與後端 BloodPressureRecord.mood enum 一致（勿再放「疲倦」）
const MOOD_OPTIONS = ["平靜", "開心", "焦慮", "頭暈", "未標記"]

function numberOrNull(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toDate(value) {
  const date = new Date(value || Date.now())
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function formatDateTime(value) {
  return toDate(value).toLocaleString("zh-TW", { hour12: false })
}

function getBpStatus(sys, dia) {
  if (sys >= 180 || dia >= 120) return { level: "超高血壓", className: "danger" }
  if (sys >= 140 || dia >= 90) return { level: "高血壓", className: "danger" }
  if (sys < 90 || dia < 60) return { level: "偏低", className: "warning" }
  if (sys >= 120 || dia >= 80) return { level: "血壓前期", className: "warning" }
  return { level: "正常", className: "normal" }
}

function normalizeRecord(record) {
  const sys = numberOrNull(record?.sys)
  const dia = numberOrNull(record?.dia)
  const pulse = numberOrNull(record?.pulse)
  return {
    ...record,
    sys,
    dia,
    pulse,
    measuredAt: record?.measuredAt || record?.createdAt || Date.now(),
    mood: record?.mood || "未標記",
    status: sys != null && dia != null ? getBpStatus(sys, dia) : getBpStatus(120, 80)
  }
}

function getSourceLabel(source) {
  if (source === "health-connect") return "Health Connect"
  if (source === "manual-entry") return "手動輸入"
  if (source === "caregiver-entry") return "看護代輸入"
  if (source === "mock-seed") return "舊測試資料"
  return source || "照護系統"
}

export default function BloodPressureDashboard({
  role,
  homePath,
  endpointBase,
  title = "血壓照護",
  subtitle = "",
  readOnly = false
}) {
  const navigate = useNavigate()
  const token = localStorage.getItem("token")
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [form, setForm] = useState({
    sys: "120",
    dia: "80",
    pulse: "72",
    mood: "未標記"
  })

  const normalizedRecords = useMemo(
    () => records.map(normalizeRecord).sort((a, b) => toDate(b.measuredAt) - toDate(a.measuredAt)),
    [records]
  )
  const latest = normalizedRecords[0] || null
  const abnormalCount = normalizedRecords.filter(record => record.status.className !== "normal").length

  const loadHistory = useCallback(async () => {
    if (!token) {
      navigate("/")
      return
    }

    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${API_BASE_URL}${endpointBase}/history?limit=100`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Load blood pressure failed")
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [endpointBase, navigate, token])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const updateForm = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const saveRecord = async () => {
    if (readOnly) {
      setError("家屬端僅能查看血壓資料。")
      return
    }
    if (!token) {
      navigate("/")
      return
    }

    const sys = Number(form.sys)
    const dia = Number(form.dia)
    const pulse = form.pulse === "" ? "" : Number(form.pulse)

    if (!Number.isFinite(sys) || !Number.isFinite(dia)) {
      setError("請輸入有效的收縮壓與舒張壓。")
      return
    }
    if (sys < 50 || sys > 260 || dia < 30 || dia > 180) {
      setError("血壓數值超出合理範圍。")
      return
    }
    if (form.pulse !== "" && (!Number.isFinite(pulse) || pulse < 30 || pulse > 220)) {
      setError("脈搏需介於 30 到 220 bpm。")
      return
    }

    setSaving(true)
    setMessage("")
    setError("")
    try {
      const res = await fetch(`${API_BASE_URL}${endpointBase}/record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ sys, dia, pulse, mood: form.mood })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Save blood pressure failed")
      setMessage(`已儲存 ${data.record?.sys || sys}/${data.record?.dia || dia} mmHg`)
      await loadHistory()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bp-page">
      <div className="bp-phone">
        <header className="bp-header">
          <div>
            <h1>{title}</h1>
            <p>{subtitle || "血壓資料以 Health Connect 匯入與照護紀錄為準"}</p>
          </div>
          <button className="bp-link-btn" onClick={() => navigate(homePath)}>返回</button>
        </header>

        <main className="bp-content">
          {loading ? <p className="loading-state">載入血壓資料中...</p> : null}
          {message ? <div className="bp-toast success">{message}</div> : null}
          {error ? <div className="bp-toast error">{error}</div> : null}

          <section className="bp-latest-card">
            <div className="bp-card-head">
              <div>
                <h2>最新血壓</h2>
                <p>{latest ? formatDateTime(latest.measuredAt) : "尚無紀錄"}</p>
              </div>
              {latest ? (
                <span className={`bp-status-pill ${latest.status.className}`}>{latest.status.level}</span>
              ) : null}
            </div>

            <div className="bp-value-panel">
              <div>
                <span>收縮壓</span>
                <strong>{latest?.sys ?? "--"}</strong>
              </div>
              <div>
                <span>舒張壓</span>
                <strong>{latest?.dia ?? "--"}</strong>
              </div>
              <div>
                <span>脈搏</span>
                <strong>{latest?.pulse ?? "--"}</strong>
              </div>
              <em>mmHg / bpm</em>
            </div>

            <div className="bp-advice-box">
              Health Connect 同步只在 mobile 原生 App 執行；web 版不再產生模擬血壓資料。
            </div>
          </section>

          <section className="bp-analysis-card">
            <h2>血壓摘要</h2>
            <div className="bp-pulse-summary">
              <div>
                <span>總筆數</span>
                <strong>{normalizedRecords.length}</strong>
              </div>
              <div>
                <span>異常筆數</span>
                <strong>{abnormalCount}</strong>
              </div>
            </div>
          </section>

          {!readOnly ? (
            <section className="bp-diary-card">
              <h2>{role === "caregiver" ? "看護代新增" : "手動新增"}</h2>
              <div className="bp-input-grid">
                <label>
                  <span>收縮壓</span>
                  <input value={form.sys} onChange={event => updateForm("sys", event.target.value)} inputMode="numeric" />
                  <small>mmHg</small>
                </label>
                <label>
                  <span>舒張壓</span>
                  <input value={form.dia} onChange={event => updateForm("dia", event.target.value)} inputMode="numeric" />
                  <small>mmHg</small>
                </label>
                <label>
                  <span>脈搏</span>
                  <input value={form.pulse} onChange={event => updateForm("pulse", event.target.value)} inputMode="numeric" />
                  <small>bpm</small>
                </label>
              </div>
              <div className="bp-mood-grid">
                {MOOD_OPTIONS.map(mood => (
                  <button
                    key={mood}
                    className={form.mood === mood ? "selected" : ""}
                    onClick={() => updateForm("mood", mood)}
                  >
                    <span>{mood}</span>
                  </button>
                ))}
              </div>
              <button className="bp-save-btn" onClick={saveRecord} disabled={saving}>
                {saving ? "儲存中..." : "儲存血壓紀錄"}
              </button>
            </section>
          ) : null}

          <section className="bp-diary-card">
            <div className="bp-record-title">
              <h2>血壓紀錄</h2>
              <button onClick={loadHistory}>重新整理</button>
            </div>
            {normalizedRecords.length ? (
              normalizedRecords.map(record => (
                <article className="bp-diary-item" key={record._id || `${record.measuredAt}-${record.sys}-${record.dia}`}>
                  <div>
                    <time>{formatDateTime(record.measuredAt)}</time>
                    <strong>{record.sys}/{record.dia} mmHg</strong>
                    <p>脈搏 {record.pulse ?? "--"} bpm · {record.mood} · {getSourceLabel(record.source)}</p>
                  </div>
                  <span className={`bp-status-pill ${record.status.className}`}>{record.status.level}</span>
                </article>
              ))
            ) : (
              <div className="bp-empty-list">尚無血壓紀錄。</div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
