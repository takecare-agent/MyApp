import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { API_BASE_URL } from "../../config/runtime"

function formatTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-TW", { hour12: false })
}

function getCurrentLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude
        resolve({
          latitude,
          longitude,
          locationLabel: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
        })
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 30000
      }
    )
  })
}

export default function PatientSos() {
  const navigate = useNavigate()
  const token = localStorage.getItem("token")

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("需要立即協助，請盡快前往現場。")
  const [patientPhone, setPatientPhone] = useState("")
  const [records, setRecords] = useState([])
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const latestRecord = useMemo(() => records[0], [records])

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
      if (!res.ok) return
      if (typeof data.phone === "string" && data.phone.trim()) {
        setPatientPhone(data.phone.trim())
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

    if (!silent) {
      setLoading(true)
    }

    try {
      const res = await fetch(`${API_BASE_URL}/patient/sos/history?limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Load history failed")
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (error) {
      console.error(error)
      setErrorMessage("無法載入 SOS 歷史紀錄，請稍後再試。")
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [navigate, token])

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      await Promise.all([loadProfile(), loadHistory()])
      if (!cancelled) {
        setLoading(false)
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [loadHistory, loadProfile])

  const handleCall119 = () => {
    window.location.href = "tel:119"
  }

  const openMap = item => {
    const hasCoordinates = Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude)
    const query = hasCoordinates
      ? `${item.latitude},${item.longitude}`
      : item?.locationLabel

    if (!query) return

    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const handleTriggerSos = async () => {
    if (!token) {
      navigate("/")
      return
    }

    setSubmitting(true)
    setStatusMessage("")
    setErrorMessage("")

    try {
      const location = await getCurrentLocation()
      const res = await fetch(`${API_BASE_URL}/patient/sos/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message,
          patientPhone,
          locationLabel: location?.locationLabel,
          latitude: location?.latitude,
          longitude: location?.longitude
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Trigger SOS failed")
      }

      setStatusMessage(`SOS 已送出（事件編號：${data.record?.eventId || "已建立"}）。`)
      await loadHistory(true)
      handleCall119()
    } catch (error) {
      console.error(error)
      setErrorMessage("SOS 發送失敗，請再試一次。")
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
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/patient")}>
            返回總覽
          </button>
          <span className="section-kicker">一鍵 SOS</span>
        </div>

        <h2 className="section-title">緊急求救中心</h2>
        <p className="section-subtitle">
          已串接組員 SOS 流程核心：按下按鈕會送出事件、附上定位（可用時），並直接切到 119 撥號。
        </p>

        <div className="sos-panel">
          <button className="sos-button" onClick={handleTriggerSos} disabled={submitting}>
            {submitting ? "發送中..." : "SOS"}
          </button>
          <div className="sos-hint">發送後會同步通知照顧端，並建立事件紀錄。</div>
          <div className="sos-confirm">{statusMessage || "準備就緒"}</div>
        </div>

        <div className="custom-box">
          <div className="form-grid">
            <div>
              <label className="input-label" htmlFor="patient-sos-message">
                SOS 說明
              </label>
              <textarea
                id="patient-sos-message"
                rows="2"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="例如：我在客廳跌倒，請立刻協助。"
              />
            </div>
            <div>
              <label className="input-label" htmlFor="patient-sos-phone">
                回撥電話
              </label>
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
          <button className="secondary-btn" onClick={handleCall119}>
            直接撥打 119
          </button>
          <button className="secondary-btn" onClick={() => loadHistory()}>
            重新整理紀錄
          </button>
        </div>

        {errorMessage && <p className="error-state">{errorMessage}</p>}

        {latestRecord && latestRecord.status === "active" ? (
          <div className="sos-banner">
            <div className="sos-title">最新未結案 SOS</div>
            <div className="sos-value">
              {latestRecord.eventId} | {formatTime(latestRecord.triggeredAt)}
            </div>
            <div className="action-row">
              <button
                className="primary-btn"
                onClick={() => openMap(latestRecord)}
                disabled={
                  !latestRecord.locationLabel &&
                  !(Number.isFinite(latestRecord.latitude) && Number.isFinite(latestRecord.longitude))
                }
              >
                開啟地圖定位
              </button>
              <button
                className="secondary-btn"
                onClick={() => {
                  window.location.href = `tel:${latestRecord.patientPhone || "119"}`
                }}
              >
                撥打電話
              </button>
            </div>
          </div>
        ) : null}

        <div className="stack-list">
          {records.length === 0 ? (
            <div className="list-card">
              <div className="list-title">目前沒有 SOS 紀錄</div>
              <div className="list-meta">按下 SOS 後會顯示最近事件與處理狀態。</div>
            </div>
          ) : (
            records.map(item => (
              <div className="list-card" key={item._id}>
                <div className="list-card-head">
                  <div>
                    <div className="list-title">{item.message || "SOS 事件"}</div>
                    <div className="list-meta">事件編號：{item.eventId}</div>
                  </div>
                  <span className={item.status === "active" ? "risk-pill risk-high" : "risk-pill risk-low"}>
                    {item.status === "active" ? "處理中" : "已結案"}
                  </span>
                </div>

                <div className="list-grid">
                  <div>
                    <div className="field-key">時間</div>
                    <div className="field-value">{formatTime(item.triggeredAt)}</div>
                  </div>
                  <div>
                    <div className="field-key">定位</div>
                    <div className="field-value">{item.locationLabel || "-"}</div>
                  </div>
                  <div>
                    <div className="field-key">回撥電話</div>
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