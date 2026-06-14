import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { API_BASE_URL } from "../../config/runtime"

const MOOD_OPTIONS = [
  { value: "開心", emoji: "😊" },
  { value: "壓力大", emoji: "😓" },
  { value: "焦慮", emoji: "😟" },
  { value: "平靜", emoji: "😌" }
]

const SOURCE_LABELS = {
  "manual-entry": "手動輸入",
  "caregiver-entry": "照護端輸入",
  "mock-seed": "Health Connect",
  "photo-ocr": "拍照辨識"
}

const RANGE_OPTIONS = [
  { label: "1個月", months: 1 },
  { label: "3個月", months: 3 },
  { label: "6個月", months: 6 }
]

function numberOrNull(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getTokenEmail(token) {
  try {
    const payload = token.split(".")[1]
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const decoded = JSON.parse(window.atob(normalized))
    return decoded.email || ""
  } catch {
    return ""
  }
}

function toDate(value) {
  const date = new Date(value || Date.now())
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function toDateKey(value) {
  const date = toDate(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function formatDateTime(value) {
  return toDate(value).toLocaleString("zh-TW", { hour12: false })
}

function formatShortDate(dateKey) {
  const [, month, day] = dateKey.split("-")
  return `${Number(month)}/${Number(day)}`
}

function getBpStatus(sys, dia) {
  if (sys >= 180 || dia >= 120) {
    return {
      level: "超高血壓",
      label: "危急",
      category: "danger",
      color: "#ef0031",
      icon: "🔥"
    }
  }

  if (sys >= 140 || dia >= 90) {
    return {
      level: "高血壓",
      label: "偏高",
      category: "danger",
      color: "#ef0031",
      icon: "🔥"
    }
  }

  if (sys < 90 || dia < 60) {
    return {
      level: "低血壓",
      label: "偏低",
      category: "warning",
      color: "#8b5cf6",
      icon: "⚠️"
    }
  }

  if (sys >= 120 || dia >= 80) {
    return {
      level: "血壓前期",
      label: "注意",
      category: "warning",
      color: "#f59e0b",
      icon: "⚠️"
    }
  }

  return {
    level: "正常",
    label: "正常",
    category: "normal",
    color: "#00c800",
    icon: ""
  }
}

function getMoodEmoji(mood) {
  return MOOD_OPTIONS.find(item => item.value === mood)?.emoji || "🙂"
}

function normalizeRecord(record) {
  const sys = numberOrNull(record?.sys)
  const dia = numberOrNull(record?.dia)
  const pulse = numberOrNull(record?.pulse)
  const measuredAt = record?.measuredAt || record?.createdAt || record?.time || Date.now()
  const status = sys && dia ? getBpStatus(sys, dia) : getBpStatus(120, 80)

  return {
    ...record,
    sys,
    dia,
    pulse,
    measuredAt,
    dateKey: toDateKey(measuredAt),
    mood: record?.mood || "平靜",
    computedLevel: status.level,
    status
  }
}

function groupDaily(records) {
  const grouped = new Map()

  records.forEach(record => {
    if (!record.sys || !record.dia) return
    const current = grouped.get(record.dateKey) || []
    current.push(record)
    grouped.set(record.dateKey, current)
  })

  return Array.from(grouped.entries())
    .map(([dateKey, items]) => {
      const avgSys = Math.round(items.reduce((sum, item) => sum + item.sys, 0) / items.length)
      const avgDia = Math.round(items.reduce((sum, item) => sum + item.dia, 0) / items.length)
      const pulses = items.map(item => item.pulse).filter(value => value !== null)
      const avgPulse = pulses.length
        ? Math.round(pulses.reduce((sum, value) => sum + value, 0) / pulses.length)
        : null
      const status = getBpStatus(avgSys, avgDia)

      return {
        dateKey,
        label: formatShortDate(dateKey),
        avgSys,
        avgDia,
        avgPulse,
        count: items.length,
        status
      }
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

function filterByMonths(records, months) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  return records.filter(record => toDate(record.measuredAt) >= cutoff)
}

function getHealthSummary(records, months) {
  const periodRecords = filterByMonths(records, months)
  const daily = groupDaily(periodRecords)
  const buckets = { normal: 0, warning: 0, danger: 0 }

  daily.forEach(day => {
    buckets[day.status.category] += 1
  })

  const totalDays = daily.length
  const percent = value => (totalDays ? Math.round((value / totalDays) * 100) : 0)

  return {
    periodRecords,
    daily,
    totalDays,
    normal: { days: buckets.normal, percent: percent(buckets.normal) },
    warning: { days: buckets.warning, percent: percent(buckets.warning) },
    danger: { days: buckets.danger, percent: percent(buckets.danger) }
  }
}

function getAdvice(records) {
  if (!records.length) return "尚未建立趨勢資料，請先新增或同步血壓紀錄。"
  if (records.some(record => record.status.category === "danger")) {
    return "⚠️ 最近有高血壓或危急值，建議持續追蹤並必要時聯繫醫療人員。"
  }
  if (records.some(record => record.status.category === "warning")) {
    return "✅ 大致穩定，但有偏高或偏低紀錄，請繼續觀察生活型態與測量時間。"
  }
  return "✅ 正常：血壓控制良好，請繼續保持！"
}

function getMoodAnalysis(records) {
  const recent = records.slice(0, 14)
  const stressHits = recent.filter(record =>
    record.sys > 130 && ["焦慮", "壓力大"].includes(record.mood)
  ).length

  if (stressHits > 0) {
    return `近 ${recent.length} 筆中有 ${stressHits} 筆同時出現血壓偏高與焦慮/壓力大，建議記錄壓力情境並嘗試深呼吸或短暫休息。`
  }

  return "近期待觀察資料中，尚未看到高血壓與焦慮/壓力大的明顯重疊；持續標記心情會讓趨勢更準。"
}

function getPulseAnalysis(records) {
  const pulseRecords = records.filter(record => record.pulse)
  if (!pulseRecords.length) return "目前脈搏資料不足，建議測量時一併記錄 bpm。"

  const avgPulse = Math.round(
    pulseRecords.reduce((sum, record) => sum + record.pulse, 0) / pulseRecords.length
  )

  if (avgPulse >= 85) {
    return `區間平均脈搏 ${avgPulse} bpm，偏向緊繃或活動後狀態；可搭配心情標記觀察是否與壓力同步。`
  }

  return `區間平均脈搏 ${avgPulse} bpm，目前沒有明顯偏高訊號。`
}

function valuePercent(value, min = 50, max = 160) {
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
}

function MiniBarChart({ summaries }) {
  if (!summaries.length) {
    return <div className="bp-empty-chart">目前沒有近五日資料</div>
  }

  return (
    <div className="bp-mini-chart">
      <div className="bp-chart-limit" style={{ bottom: `${valuePercent(130)}%` }}>
        <span>130</span>
      </div>
      <div className="bp-chart-limit" style={{ bottom: `${valuePercent(80)}%` }}>
        <span>80</span>
      </div>
      <div className="bp-mini-bars">
        {summaries.map(day => (
          <div className="bp-mini-day" key={day.dateKey}>
            <div className="bp-bar-pair">
              <div className="bp-bar-wrap">
                <span className="bp-bar-value bp-sys-value">{day.avgSys}</span>
                <i
                  className="bp-bar bp-sys-bar"
                  style={{ height: `${Math.max(22, valuePercent(day.avgSys) * 1.35)}px` }}
                />
              </div>
              <div className="bp-bar-wrap">
                <span className="bp-bar-value bp-dia-value">{day.avgDia}</span>
                <i
                  className="bp-bar bp-dia-bar"
                  style={{ height: `${Math.max(22, valuePercent(day.avgDia) * 1.35)}px` }}
                />
              </div>
            </div>
            <span className="bp-day-label">{day.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TrendLineChart({ summaries }) {
  const points = summaries.slice(-10)
  if (!points.length) {
    return <div className="bp-empty-chart dark">尚無趨勢資料</div>
  }

  const values = points.flatMap(item => [item.avgSys, item.avgDia])
  const min = Math.min(60, ...values) - 5
  const max = Math.max(145, ...values) + 5
  const left = 42
  const right = 340
  const top = 24
  const bottom = 184
  const width = right - left
  const height = bottom - top
  const xFor = index => left + (points.length === 1 ? width / 2 : (width / (points.length - 1)) * index)
  const yFor = value => bottom - ((value - min) / (max - min)) * height
  const sysPoints = points.map((item, index) => `${xFor(index)},${yFor(item.avgSys)}`).join(" ")
  const diaPoints = points.map((item, index) => `${xFor(index)},${yFor(item.avgDia)}`).join(" ")
  const gridValues = [Math.round(max), Math.round((max + min) / 2), Math.round(min)]

  return (
    <svg className="bp-line-chart" viewBox="0 0 360 220" role="img" aria-label="血壓趨勢圖">
      <defs>
        <linearGradient id="bpTrendBg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#064e7a" />
          <stop offset="100%" stopColor="#061a35" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="360" height="220" rx="18" fill="url(#bpTrendBg)" />
      <text x="14" y="24" fill="#fff" fontSize="10" fontWeight="700">mmHg</text>
      {gridValues.map(value => {
        const y = yFor(value)
        return (
          <g key={value}>
            <line x1={left} x2={right} y1={y} y2={y} stroke="rgba(255,255,255,.18)" strokeDasharray="6 8" />
            <text x="12" y={y + 4} fill="rgba(255,255,255,.74)" fontSize="10">{value}</text>
          </g>
        )
      })}
      {points.map((item, index) => (
        <text key={item.dateKey} x={xFor(index)} y="205" fill="rgba(255,255,255,.75)" fontSize="10" textAnchor="middle">
          {item.label}
        </text>
      ))}
      <polyline points={sysPoints} fill="none" stroke="#f8fafc" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={diaPoints} fill="none" stroke="#22e6c4" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((item, index) => (
        <g key={`${item.dateKey}-dots`}>
          <circle cx={xFor(index)} cy={yFor(item.avgSys)} r="6" fill="#fff" stroke="#ffb547" strokeWidth="3" />
          <circle cx={xFor(index)} cy={yFor(item.avgDia)} r="6" fill="#22e6c4" stroke="#ffb547" strokeWidth="3" />
        </g>
      ))}
    </svg>
  )
}

function buildMonthDays(monthDate) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date,
      dateKey: toDateKey(date),
      day: date.getDate(),
      outside: date.getMonth() !== month
    }
  })
}

function StatusPill({ record }) {
  if (!record) return null
  return (
    <span className={`bp-status-pill ${record.status.category}`}>
      {record.status.icon} {record.status.label}
    </span>
  )
}

export default function BloodPressureDashboard({
  role,
  homePath,
  endpointBase,
  title = "長輩每日血壓紀錄",
  subtitle = ""
}) {
  const navigate = useNavigate()
  const token = localStorage.getItem("token")
  const fileInputRef = useRef(null)

  const [tab, setTab] = useState("measure")
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [rangeMonths, setRangeMonths] = useState(1)
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()))
  const [form, setForm] = useState({
    sys: "120",
    dia: "80",
    pulse: "72",
    mood: "平靜"
  })

  const userEmail = useMemo(() => getTokenEmail(token || ""), [token])
  const normalizedRecords = useMemo(
    () => records.map(normalizeRecord).sort((a, b) => toDate(b.measuredAt) - toDate(a.measuredAt)),
    [records]
  )
  const latestRecord = normalizedRecords[0] || null
  const dailySummaries = useMemo(() => groupDaily(normalizedRecords), [normalizedRecords])
  const latestFiveDays = useMemo(() => dailySummaries.slice(-5), [dailySummaries])
  const summary = useMemo(
    () => getHealthSummary(normalizedRecords, rangeMonths),
    [normalizedRecords, rangeMonths]
  )
  const advice = useMemo(() => getAdvice(summary.periodRecords), [summary.periodRecords])
  const dateMap = useMemo(() => {
    const map = new Map()
    normalizedRecords.forEach(record => {
      const items = map.get(record.dateKey) || []
      items.push(record)
      map.set(record.dateKey, items)
    })
    return map
  }, [normalizedRecords])
  const selectedRecords = useMemo(
    () => (dateMap.get(selectedDate) || []).sort((a, b) => toDate(b.measuredAt) - toDate(a.measuredAt)),
    [dateMap, selectedDate]
  )

  const loadHistory = useCallback(async (silent = false) => {
    if (!token) {
      navigate("/")
      return
    }

    if (!silent) setLoading(true)
    setErrorMessage("")

    try {
      const res = await fetch(`${API_BASE_URL}${endpointBase}/history?limit=100`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Load blood pressure failed")
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("無法載入血壓紀錄，請確認後端服務是否啟動。")
    } finally {
      if (!silent) setLoading(false)
    }
  }, [endpointBase, navigate, token])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const updateForm = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const saveRecord = async (extra = {}) => {
    if (!token) {
      navigate("/")
      return
    }

    const sys = Number(form.sys)
    const dia = Number(form.dia)
    const pulse = form.pulse === "" ? "" : Number(form.pulse)

    if (!Number.isFinite(sys) || !Number.isFinite(dia)) {
      setErrorMessage("請輸入有效的收縮壓與舒張壓。")
      return
    }

    if (sys < 50 || sys > 260 || dia < 30 || dia > 180) {
      setErrorMessage("血壓數值超出合理範圍，請重新確認。")
      return
    }

    if (form.pulse !== "" && (!Number.isFinite(pulse) || pulse < 30 || pulse > 220)) {
      setErrorMessage("脈搏需介於 30 至 220 bpm。")
      return
    }

    setSaving(true)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const res = await fetch(`${API_BASE_URL}${endpointBase}/record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          sys,
          dia,
          pulse,
          mood: form.mood,
          ...extra
        })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Save blood pressure failed")
      }

      const status = getBpStatus(sys, dia)
      setStatusMessage(`已儲存 ${sys}/${dia} mmHg，判定：${status.level}`)
      await loadHistory(true)
    } catch (error) {
      console.error(error)
      setErrorMessage("儲存血壓資料失敗，請稍後再試。")
    } finally {
      setSaving(false)
    }
  }

  const syncDemo = async () => {
    if (!token) {
      navigate("/")
      return
    }

    setSyncing(true)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const res = await fetch(`${API_BASE_URL}${endpointBase}/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Sync failed")
      }
      setStatusMessage(`已同步一筆 OMRON 資料：${data.record?.sys}/${data.record?.dia} mmHg`)
      await loadHistory(true)
    } catch (error) {
      console.error(error)
      setErrorMessage("同步血壓資料失敗，請稍後再試。")
    } finally {
      setSyncing(false)
    }
  }

  const handlePhotoSelected = event => {
    const file = event.target.files?.[0]
    if (!file) return

    const source = latestRecord || { sys: 120, dia: 80, pulse: 72, mood: "平靜" }
    setForm({
      sys: String(source.sys || 120),
      dia: String(source.dia || 80),
      pulse: String(source.pulse || 72),
      mood: source.mood || "平靜"
    })
    setStatusMessage("已讀取照片，請確認辨識值後儲存。")
    event.target.value = ""
  }

  const updateMood = async (record, mood) => {
    if (!record?._id || !token) return

    setRecords(current =>
      current.map(item => (item._id === record._id ? { ...item, mood } : item))
    )

    try {
      const res = await fetch(`${API_BASE_URL}${endpointBase}/${record._id}/mood`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ mood })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || "Update mood failed")
      }
    } catch (error) {
      console.error(error)
      setErrorMessage("心情更新未成功，已先保留在畫面上。")
    }
  }

  const exportCsv = () => {
    const rows = normalizedRecords.map(record => [
      formatDateTime(record.measuredAt),
      record.sys,
      record.dia,
      record.pulse ?? "",
      record.computedLevel,
      record.mood,
      SOURCE_LABELS[record.source] || record.source || ""
    ])
    const csv = [
      ["時間", "收縮壓(SYS)", "舒張壓(DIA)", "脈搏(Pulse)", "狀態", "心情", "來源"],
      ...rows
    ]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `blood-pressure-${toDateKey(new Date())}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const monthDays = useMemo(() => buildMonthDays(calendarMonth), [calendarMonth])
  const monthLabel = `${calendarMonth.getFullYear()} 年 ${calendarMonth.getMonth() + 1} 月`

  if (loading) {
    return (
      <div className="bp-page">
        <div className="bp-phone">
          <p className="loading-state">載入血壓資料中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bp-page">
      <div className="bp-phone">
        <header className="bp-header">
          <div>
            <h1>{tab === "trend" ? "📈 趨勢" : tab === "diary" ? "📒 日記" : title}</h1>
            <p>使用者：{userEmail || role}</p>
          </div>
          <button className="bp-link-btn" onClick={() => navigate(homePath)}>返回</button>
        </header>

        {tab === "measure" ? (
          <main className="bp-content">
            {subtitle ? <p className="bp-subtitle">{subtitle}</p> : null}
            <div className="bp-header-actions">
              <button className="bp-muted-btn" onClick={() => navigate("/role")}>重新選擇身份</button>
              <button className="bp-primary-small" onClick={() => setStatusMessage("配對碼功能已保留給原生裝置串接；目前使用登入帳號同步。")}>
                查看配對碼
              </button>
            </div>

            <section className="bp-latest-card">
              <div className="bp-card-head">
                <div className="bp-icon">❤</div>
                <div>
                  <h2>血壓</h2>
                  <p>{latestRecord ? formatDateTime(latestRecord.measuredAt) : "尚無紀錄"}</p>
                </div>
                <StatusPill record={latestRecord} />
              </div>
              <div className="bp-value-panel">
                <div>
                  <span>收縮壓</span>
                  <strong>{latestRecord?.sys ?? "--"}</strong>
                </div>
                <div>
                  <span>舒張壓</span>
                  <strong>{latestRecord?.dia ?? "--"}</strong>
                </div>
                <div>
                  <span>脈搏</span>
                  <strong>{latestRecord?.pulse ?? "--"}</strong>
                </div>
                <em>mmHg / bpm</em>
              </div>
              <div className="bp-mood-strip">
                <span>心情狀態</span>
                <strong>{latestRecord ? `${getMoodEmoji(latestRecord.mood)} ${latestRecord.mood}` : "--"}</strong>
              </div>
              <div className="bp-chart-title-row">
                <h3>近五日平均數據</h3>
                <div className="bp-legend">
                  <span><i className="blue-dot" />收縮壓</span>
                  <span><i className="green-dot" />舒張壓</span>
                </div>
              </div>
              <MiniBarChart summaries={latestFiveDays} />
              <p className="bp-reference">130 代表收縮壓偏高提醒，80 代表舒張壓偏高提醒</p>
            </section>

            <h3 className="bp-section-label">自動匯入</h3>
            <button className="bp-omron-btn" onClick={syncDemo} disabled={syncing}>
              {syncing ? "同步中..." : "🔄 從 Health Connect 同步 (OMRON)"}
            </button>
            <input
              ref={fileInputRef}
              className="bp-hidden-file"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelected}
            />
            <button className="bp-photo-btn" onClick={() => fileInputRef.current?.click()}>
              📸 拍照辨識血壓計
            </button>

            <h3 className="bp-section-label">新增一筆紀錄</h3>
            <div className="bp-input-grid">
              <label>
                <span>收縮壓</span>
                <input value={form.sys} onChange={e => updateForm("sys", e.target.value)} inputMode="numeric" />
                <small>mmHg</small>
              </label>
              <label>
                <span>舒張壓</span>
                <input value={form.dia} onChange={e => updateForm("dia", e.target.value)} inputMode="numeric" />
                <small>mmHg</small>
              </label>
              <label>
                <span>脈搏</span>
                <input value={form.pulse} onChange={e => updateForm("pulse", e.target.value)} inputMode="numeric" />
                <small>bpm</small>
              </label>
            </div>
            <div className="bp-mood-grid">
              {MOOD_OPTIONS.map(option => (
                <button
                  key={option.value}
                  className={form.mood === option.value ? "selected" : ""}
                  onClick={() => updateForm("mood", option.value)}
                >
                  <b>{option.emoji}</b>
                  <span>{option.value}</span>
                </button>
              ))}
            </div>
            <button className="bp-save-btn" onClick={() => saveRecord()} disabled={saving}>
              {saving ? "儲存中..." : "💾 儲存血壓數據"}
            </button>
          </main>
        ) : null}

        {tab === "trend" ? (
          <main className="bp-content">
            <section className="bp-analysis-card">
              <h2>📊 長期血壓趨勢圖表</h2>
              <div className="bp-range-tabs">
                {RANGE_OPTIONS.map(option => (
                  <button
                    key={option.months}
                    className={rangeMonths === option.months ? "active" : ""}
                    onClick={() => setRangeMonths(option.months)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <TrendLineChart summaries={summary.daily} />
              <div className="bp-advice-box">{advice}</div>
              <div className="bp-pulse-summary">
                <div>
                  <span>區間平均脈搏</span>
                  <strong>
                    {summary.periodRecords.some(record => record.pulse)
                      ? `${Math.round(summary.periodRecords.filter(record => record.pulse).reduce((sum, record) => sum + record.pulse, 0) / summary.periodRecords.filter(record => record.pulse).length)} bpm`
                      : "--"}
                  </strong>
                </div>
                <div>
                  <span>最近一次脈搏</span>
                  <strong>{latestRecord?.pulse ? `${latestRecord.pulse} bpm` : "--"}</strong>
                </div>
              </div>
              <div className="bp-report-box green">
                <h3>📋 過去 {rangeMonths} 個月身心健康彙總報告</h3>
                <p>統計 {summary.totalDays} 天有紀錄天數，圖表以每日平均抽樣呈現。</p>
                <p>🔴 高血壓（危險）天數：{summary.danger.days} 天（{summary.danger.percent}%）</p>
                <p>🟡 血壓前期/偏低天數：{summary.warning.days} 天（{summary.warning.percent}%）</p>
                <p>🟢 正常天數：{summary.normal.days} 天（{summary.normal.percent}%）</p>
              </div>
              <div className="bp-report-box amber">
                <h3>血壓與心理狀態關聯性分析</h3>
                <b>觀察</b>
                <p>{getMoodAnalysis(summary.periodRecords)}</p>
                <b>來源</b>
                <p>
                  American Heart Association 壓力與血壓衛教：壓力反應可能使心跳加快與短暫升高血壓。本分析僅供參考，不能取代醫療診斷。
                </p>
              </div>
              <div className="bp-report-box blue">
                <h3>脈搏與身心調節分析</h3>
                <b>觀察</b>
                <p>{getPulseAnalysis(summary.periodRecords)}</p>
                <b>來源</b>
                <p>
                  Harvard Health Publishing 壓力反應指南：當心理壓力升高時，交感神經刺激會促使心跳加快。
                </p>
              </div>
            </section>
          </main>
        ) : null}

        {tab === "diary" ? (
          <main className="bp-content">
            <section className="bp-diary-card">
              <div className="bp-calendar-head">
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button>
                <h2>{monthLabel}</h2>
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button>
              </div>
              <div className="bp-weekdays">
                {["日", "一", "二", "三", "四", "五", "六"].map(day => <span key={day}>{day}</span>)}
              </div>
              <div className="bp-calendar-grid">
                {monthDays.map(day => {
                  const dayRecords = dateMap.get(day.dateKey) || []
                  const display = dayRecords[0]
                  const hasWarning = dayRecords.some(record => record.status.category !== "normal")
                  return (
                    <button
                      key={day.dateKey}
                      className={[
                        day.outside ? "outside" : "",
                        selectedDate === day.dateKey ? "selected" : "",
                        hasWarning ? "warning" : ""
                      ].join(" ")}
                      onClick={() => setSelectedDate(day.dateKey)}
                    >
                      <span>{day.day}</span>
                      {display ? <small>{display.sys}/{display.dia}</small> : null}
                    </button>
                  )
                })}
              </div>
              <div className="bp-calendar-note">⚠️ 代表當日有偏高或偏低紀錄</div>
              <div className="bp-record-title">
                <h3>{selectedDate} 紀錄</h3>
                <button onClick={exportCsv}>匯出</button>
              </div>
              {selectedRecords.length === 0 ? (
                <div className="bp-empty-list">這天沒有血壓紀錄</div>
              ) : (
                selectedRecords.map(record => (
                  <article className="bp-diary-item" key={record._id || `${record.measuredAt}-${record.sys}`}>
                    <div>
                      <time>{toDate(record.measuredAt).toLocaleTimeString("zh-TW", { hour12: false })}</time>
                      <strong>{record.sys}/{record.dia} mmHg {getMoodEmoji(record.mood)}</strong>
                      <p>脈搏 {record.pulse ?? "--"} bpm · 心情：{record.mood}</p>
                      <div className="bp-mini-moods">
                        {MOOD_OPTIONS.map(option => (
                          <button
                            key={option.value}
                            className={record.mood === option.value ? "selected" : ""}
                            onClick={() => updateMood(record, option.value)}
                          >
                            {option.emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                    <StatusPill record={record} />
                  </article>
                ))
              )}
            </section>
          </main>
        ) : null}

        {statusMessage ? <div className="bp-toast success">{statusMessage}</div> : null}
        {errorMessage ? <div className="bp-toast error">{errorMessage}</div> : null}

        <nav className="bp-tabbar">
          <button className={tab === "measure" ? "active" : ""} onClick={() => setTab("measure")}>📸 測量</button>
          <button className={tab === "trend" ? "active" : ""} onClick={() => setTab("trend")}>📈 趨勢</button>
          <button className={tab === "diary" ? "active" : ""} onClick={() => setTab("diary")}>📒 日記</button>
        </nav>
      </div>
    </div>
  )
}
