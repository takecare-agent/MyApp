import { useNavigate } from "react-router-dom"

const modules = [
  {
    title: "危險事件即時通知",
    description: "查看跌倒、離床、久坐與異常行為即時推播。",
    path: "/family/alerts"
  },
  {
    title: "SOS 通知中心",
    description: "集中處理看護或受顧者觸發的緊急求助事件。",
    path: "/family/sos"
  },
  {
    title: "照護紀錄瀏覽",
    description: "依日期查看用藥、飲食、如廁與活動紀錄。",
    path: "/family/care-records"
  },
  {
    title: "危險事件查詢",
    description: "用日期與事件類型查詢歷史事件與處理狀態。",
    path: "/family/events"
  },
  {
    title: "關懷語句庫",
    description: "一鍵播放常用關懷語句，支援多語音版本。",
    path: "/family/phrases"
  },
  {
    title: "家屬提醒清單",
    description: "建立照護提醒並同步到照顧者執行端。",
    path: "/family/reminders"
  }
]

const quickStats = [
  { label: "今日事件", value: "3" },
  { label: "未處理", value: "1" },
  { label: "已完成", value: "6" }
]

export default function FamilyHome() {
  const navigate = useNavigate()

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("role")
    navigate("/")
  }

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <span className="section-kicker">家屬端</span>
        <div className="home-header">
          <h2 className="section-title">家屬功能總覽</h2>
        </div>
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

        <div className="action-row">
          <button className="secondary-btn" onClick={() => navigate("/family/setup")}>
            編輯家屬資料
          </button>
          <button className="secondary-btn danger-btn" onClick={handleLogout}>
            登出
          </button>
        </div>
      </div>
    </div>
  )
}
