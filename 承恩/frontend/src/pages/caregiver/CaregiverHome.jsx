import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

const modules = [
  {
    title: "SOS 指揮中心",
    description: "接收受顧者一鍵求救、快速導航與結案處理。",
    path: "/caregiver/sos"
  },
  {
    title: "危險行為偵測與即時警示",
    description: "事件分級、處理流程與快速處置入口。",
    path: "/caregiver/alerts"
  },
  {
    title: "日常照護紀錄",
    description: "用藥、飲食、活動與生理資訊回報面板。",
    path: "/caregiver/care-logs"
  },
  {
    title: "受顧者血壓監測",
    description: "代輸血壓資料、同步示範紀錄與快速風險判定。",
    path: "/caregiver/blood-pressure"
  },
  {
    title: "影像偵測中心",
    description: "觸發影像模型，追蹤跌倒、呼救與離床事件。",
    path: "/caregiver/vision"
  },
  {
    title: "提醒任務清單",
    description: "接收家屬提醒，完成後回報任務狀態。",
    path: "/caregiver/reminders"
  },
  {
    title: "跨語言與溝通支援",
    description: "母語切換、警示翻譯與關懷語句播放。",
    path: "/caregiver/language"
  },
  {
    title: "系統穩定與備援",
    description: "網路狀態、緊急按鈕與事件影像備援。",
    path: "/caregiver/system"
  }
]

const quickStats = [
  { label: "今日警示", value: "4" },
  { label: "處理中", value: "2" },
  { label: "已完成", value: "7" }
]

export default function CaregiverHome() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      const token = localStorage.getItem("token")
      if (!token) {
        navigate("/")
        return
      }

      setLoading(true)
      setError("")

      try {
        const checkRes = await fetch("http://localhost:5000/caregiver/check-profile", {
          headers: { Authorization: "Bearer " + token }
        })
        if (!checkRes.ok) {
          throw new Error("failed to validate caregiver profile")
        }
        const checkData = await checkRes.json()
        if (!checkData.profileCompleted) {
          navigate("/caregiver/setup")
          return
        }

        const profileRes = await fetch("http://localhost:5000/caregiver/profile", {
          headers: { Authorization: "Bearer " + token }
        })
        if (!profileRes.ok) {
          throw new Error("failed to load caregiver profile")
        }
        const data = await profileRes.json()
        if (!cancelled) {
          setProfile(data)
        }
      } catch (loadError) {
        console.error(loadError)
        if (!cancelled) {
          setError("無法載入看護資料，請稍後再試。")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [navigate])

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("role")
    navigate("/")
  }

  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <h2 className="section-title">看護端首頁</h2>
          <p className="loading-state">載入中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <div className="card">
          <h2 className="section-title">看護端首頁</h2>
          <p className="error-state">{error}</p>
          <button className="primary-btn" onClick={() => window.location.reload()}>
            重新嘗試
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <span className="section-kicker">看護端</span>
        <div className="home-header">
          <h2 className="section-title">看護功能總覽</h2>
          <span className="status-chip">介面原型</span>
        </div>
        <p className="section-subtitle">
          歡迎回來，{profile?.name || "看護人員"}。以下頁面依照簡報需求整理，先提供前端介面。
        </p>

        <div className="metric-row">
          {quickStats.map(item => (
            <div key={item.label} className="metric-card">
              <div className="metric-label">{item.label}</div>
              <div className="metric-value">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="feature-grid">
          {modules.map(item => (
            <button
              key={item.title}
              className="feature-card"
              onClick={() => navigate(item.path)}
            >
              <div className="feature-title">{item.title}</div>
              <div className="feature-desc">{item.description}</div>
              <span className="feature-link">前往頁面</span>
            </button>
          ))}
        </div>

        <div className="profile-grid">
          <div className="profile-item">
            <div className="profile-label">看護姓名</div>
            <div className="profile-value">{profile?.name || "-"}</div>
          </div>
          <div className="profile-item">
            <div className="profile-label">照護經驗</div>
            <div className="profile-value">{profile?.experience || "-"}</div>
          </div>
        </div>

        <div className="action-row">
          <button className="secondary-btn" onClick={() => navigate("/caregiver/setup")}>
            編輯看護資料
          </button>
          <button className="secondary-btn danger-btn" onClick={handleLogout}>
            登出
          </button>
        </div>
      </div>
    </div>
  )
}
