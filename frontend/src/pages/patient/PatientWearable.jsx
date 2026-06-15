import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { API_BASE_URL } from "../../config/runtime"

const FALLBACK_RECORD = {
  heartRate: 74,
  spo2: 97,
  steps: 4132,
  note: "日常活動範圍",
  isAbnormal: false,
  recordedAt: null
}

function formatTime(value) {
  if (!value) return "尚未同步"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "尚未同步"
  return date.toLocaleString("zh-TW", { hour12: false })
}

export default function PatientWearable() {
  const navigate = useNavigate()
  const [latestRecord, setLatestRecord] = useState(null)
  const [history, setHistory] = useState([])
  const [loadingLatest, setLoadingLatest] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const token = localStorage.getItem("token")

  const loadLatest = useCallback(async () => {
    if (!token) {
      navigate("/")
      return
    }

    setLoadingLatest(true)
    setErrorMessage("")

    try {
      const res = await fetch(`${API_BASE_URL}/patient/wearable/latest`, {
        headers: { Authorization: "Bearer " + token }
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "讀取最新資料失敗")
      }

      setLatestRecord(data.record || null)
    } catch (error) {
      console.error(error)
      setErrorMessage("讀取穿戴資料失敗，先顯示預設值。")
    } finally {
      setLoadingLatest(false)
    }
  }, [navigate, token])

  const loadHistory = useCallback(async () => {
    if (!token) {
      navigate("/")
      return
    }

    setLoadingHistory(true)
    setErrorMessage("")

    try {
      const res = await fetch(`${API_BASE_URL}/patient/wearable/history?limit=10`, {
        headers: { Authorization: "Bearer " + token }
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "讀取歷史資料失敗")
      }

      setHistory(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("讀取歷史資料失敗。")
    } finally {
      setLoadingHistory(false)
    }
  }, [navigate, token])

  useEffect(() => {
    loadLatest()
    loadHistory()
  }, [loadHistory, loadLatest])

  const handleSync = async () => {
    if (!token) {
      navigate("/")
      return
    }

    setSyncing(true)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const res = await fetch(`${API_BASE_URL}/patient/wearable/sync`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token }
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "同步失敗")
      }

      setLatestRecord(data.record || null)
      setStatusMessage(`已同步第 ${data.sampleIndex + 1} 筆裝置資料。`)
      await loadHistory()
    } catch (error) {
      console.error(error)
      setErrorMessage("同步裝置資料失敗，請稍後再試。")
    } finally {
      setSyncing(false)
    }
  }

  const currentRecord = latestRecord || FALLBACK_RECORD
  const wearableData = [
    {
      label: "心率",
      value: `${currentRecord.heartRate} bpm`,
      range: "正常 60 - 100 bpm",
      abnormal: "過高或過低時通知家屬，標記生理異常事件。"
    },
    {
      label: "血氧濃度",
      value: `${currentRecord.spo2}%`,
      range: "正常 >= 95%",
      abnormal: "低於設定值觸發警示。"
    },
    {
      label: "活動量/步數",
      value: `${currentRecord.steps.toLocaleString("en-US")} steps`,
      range: "日常活動範圍",
      abnormal: "過低可能久躺，過高可能焦躁或遊走。"
    }
  ]

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/patient")}>
            返回總覽
          </button>
          <span className="section-kicker">穿戴式裝置功能</span>
        </div>

        <h2 className="section-title">手環生理監測面板</h2>
        <p className="section-subtitle">
          同步裝置資料後，會即時更新生理數據與異常紀錄。
        </p>
        <p className="section-subtitle">
          最後同步時間：{formatTime(currentRecord.recordedAt)}
        </p>

        <div className="feature-grid">
          {wearableData.map(item => (
            <div className="feature-card static" key={item.label}>
              <div className="feature-title">{item.label}</div>
              <div className="feature-value">{item.value}</div>
              <div className="feature-desc">{item.range}</div>
              <div className="feature-note">{item.abnormal}</div>
            </div>
          ))}
        </div>

        <div className="action-row">
          <button className="secondary-btn" onClick={handleSync} disabled={syncing}>
            {syncing ? "同步中..." : "同步裝置資料"}
          </button>
          <button
            className="secondary-btn"
            onClick={loadHistory}
            disabled={loadingHistory}
          >
            {loadingHistory ? "載入中..." : "查看異常歷史"}
          </button>
        </div>

        {loadingLatest && <p className="section-subtitle">正在讀取最新資料...</p>}
        {statusMessage && <p className="section-subtitle">{statusMessage}</p>}
        {errorMessage && <p className="error-state">{errorMessage}</p>}

        <div className="stack-list">
          {history.length === 0 ? (
            <div className="list-card">
              <div className="list-title">目前尚無同步紀錄</div>
              <div className="list-meta">先按「同步裝置資料」即可建立第一筆資料。</div>
            </div>
          ) : (
            history.map(item => (
              <div className="list-card" key={item._id}>
                <div className="list-card-head">
                  <div>
                    <div className="list-title">{formatTime(item.recordedAt)}</div>
                    <div className="list-meta">{item.note || "裝置同步"}</div>
                  </div>
                  <span className={item.isAbnormal ? "risk-pill risk-high" : "risk-pill risk-low"}>
                    {item.isAbnormal ? "異常" : "正常"}
                  </span>
                </div>
                <div className="list-grid">
                  <div>
                    <div className="field-key">心率</div>
                    <div className="field-value">{item.heartRate} bpm</div>
                  </div>
                  <div>
                    <div className="field-key">血氧</div>
                    <div className="field-value">{item.spo2}%</div>
                  </div>
                  <div>
                    <div className="field-key">步數</div>
                    <div className="field-value">{item.steps.toLocaleString("en-US")} steps</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
