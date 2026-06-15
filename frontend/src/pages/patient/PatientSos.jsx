import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { API_BASE_URL } from "../../config/runtime"
import { callPhone, getCurrentLocation, openMapLocation } from "../../lib/nativeBridge"

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

export default function PatientSos() {
  const navigate = useNavigate()
  const token = localStorage.getItem("token")

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("需要立即協助，請盡快前往現場。")
  const [patientPhone, setPatientPhone] = useState("")
  const [manualLocation, setManualLocation] = useState("")
  const [records, setRecords] = useState([])
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const latestActive = useMemo(
    () => records.find(item => item.status === "active"),
    [records]
  )

  const loadProfile = useCallback(async () => {
    if (!token) {
      navigate("/")
      return
    }

    try {
      const res = await fetch(`${API_BASE_URL}/patient/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok && typeof data.phone === "string") {
        setPatientPhone(data.phone)
      }
    } catch (error) {
      console.error(error)
    }
  }, [navigate, token])

  const loadHistory = useCallback(async (silent = false) => {
    if (!token) {
      navigate("/")
      return
    }

    if (!silent) setLoading(true)

    try {
      const res = await fetch(`${API_BASE_URL}/patient/sos/history?limit=20`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Load SOS history failed")
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("無法載入 SOS 紀錄，請稍後再試。")
    } finally {
      if (!silent) setLoading(false)
    }
  }, [navigate, token])

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      await Promise.all([loadProfile(), loadHistory(true)])
      if (!cancelled) setLoading(false)
    }

    init()

    return () => {
      cancelled = true
    }
  }, [loadHistory, loadProfile])

  const triggerSos = async () => {
    if (!token) {
      navigate("/")
      return
    }

    setSubmitting(true)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const location = await getCurrentLocation()
      const locationLabel = location?.locationLabel || manualLocation.trim() || "未取得定位，請電話確認位置"

      const res = await fetch(`${API_BASE_URL}/patient/sos/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message,
          patientPhone,
          locationLabel,
          latitude: location?.latitude,
          longitude: location?.longitude
        })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Trigger SOS failed")
      }

      setStatusMessage(`SOS 已送出，事件編號：${data.record?.eventId || "-"}`)
      await loadHistory(true)
      callPhone("119")
    } catch (error) {
      console.error(error)
      setErrorMessage("SOS 送出失敗，請確認網路或直接撥打 119。")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="home-page">
        <div className="home-card">
          <h2 className="section-title">一鍵 SOS</h2>
          <p className="loading-state">載入中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="home-page">
      <div className="home-card wide-card sos-clean-page">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/patient")}>
            返回總覽
          </button>
          <span className="section-kicker">一鍵 SOS</span>
        </div>

        <h2 className="section-title">緊急求救中心</h2>
        <p className="section-subtitle">
          按下 SOS 後會建立事件並同步到家屬端/照護端，同時嘗試開啟電話撥打 119。
        </p>

        <div className="sos-panel">
          <button className="sos-button" onClick={triggerSos} disabled={submitting}>
            {submitting ? "送出中..." : "SOS"}
          </button>
          <div className="sos-hint">送出後會附上定位或你手動填寫的位置。</div>
          <div className="sos-confirm">{statusMessage || "準備就緒"}</div>
        </div>

        <div className="custom-box">
          <div className="form-grid">
            <div>
              <label className="input-label" htmlFor="patient-sos-message">SOS 說明</label>
              <textarea
                id="patient-sos-message"
                rows="2"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="例如：跌倒、胸悶、需要協助"
              />
            </div>
            <div>
              <label className="input-label" htmlFor="patient-sos-location">位置補充</label>
              <input
                id="patient-sos-location"
                value={manualLocation}
                onChange={e => setManualLocation(e.target.value)}
                placeholder="例如：客廳、浴室、房間"
              />
            </div>
            <div>
              <label className="input-label" htmlFor="patient-sos-phone">回撥電話</label>
              <input
                id="patient-sos-phone"
                value={patientPhone}
                onChange={e => setPatientPhone(e.target.value)}
                placeholder="例如：0912345678"
              />
            </div>
          </div>
        </div>

        <div className="action-row">
          <button className="secondary-btn" onClick={() => callPhone("119")}>直接撥打 119</button>
          <button className="secondary-btn" onClick={() => loadHistory()}>重新整理紀錄</button>
        </div>

        {errorMessage && <p className="error-state">{errorMessage}</p>}

        {latestActive ? (
          <div className="sos-banner">
            <div className="sos-title">最新未結案 SOS</div>
            <div className="sos-value">
              {latestActive.eventId} | {formatTime(latestActive.triggeredAt)}
            </div>
            <div className="action-row">
              <button className="primary-btn" onClick={() => openMapLocation(latestActive)}>
                開啟地圖定位
              </button>
              <button className="secondary-btn" onClick={() => callPhone(latestActive.patientPhone || "119")}>
                回撥電話
              </button>
            </div>
          </div>
        ) : null}

        <div className="stack-list">
          {records.length === 0 ? (
            <div className="list-card">
              <div className="list-title">目前沒有 SOS 紀錄</div>
              <div className="list-meta">送出 SOS 後，家屬端與照護端會輪詢收到事件。</div>
            </div>
          ) : (
            records.map(item => (
              <div className="list-card" key={item._id}>
                <div className="list-card-head">
                  <div>
                    <div className="list-title">{item.message || "SOS 求救"}</div>
                    <div className="list-meta">事件編號：{item.eventId}</div>
                  </div>
                  <span className={item.status === "active" ? "risk-pill risk-high" : "risk-pill risk-low"}>
                    {item.status === "active" ? "未結案" : "已處理"}
                  </span>
                </div>

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
                    <div className="field-key">電話</div>
                    <div className="field-value">{item.patientPhone || "-"}</div>
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
