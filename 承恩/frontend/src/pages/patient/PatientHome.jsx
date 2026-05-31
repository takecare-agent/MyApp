import { useNavigate } from "react-router-dom"

const modules = [
  {
    title: "一鍵 SOS 求助",
    description: "大按鈕介面，觸發後同步通知家屬端與看護端。",
    path: "/patient/sos"
  },
  {
    title: "穿戴式裝置監測",
    description: "心率、血氧與活動量面板，顯示異常判定區間。",
    path: "/patient/wearable"
  },
  {
    title: "血壓量測與趨勢",
    description: "血壓機資料展示與手動備援輸入介面。",
    path: "/patient/blood-pressure"
  },
  {
    title: "影像偵測事件",
    description: "整合影像模型結果，查看跌倒與呼救手勢事件。",
    path: "/patient/vision"
  }
]

const healthSummary = [
  { label: "心率", value: "74 bpm", state: "正常" },
  { label: "血氧", value: "97%", state: "正常" },
  { label: "血壓", value: "128 / 82", state: "偏高" }
]

export default function PatientHome() {
  const navigate = useNavigate()

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("role")
    navigate("/")
  }

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <span className="section-kicker">受顧者端</span>
        <div className="home-header">
          <h2 className="section-title">受顧者介面總覽</h2>
          <span className="status-chip">介面原型</span>
        </div>
        <p className="section-subtitle">
          依照簡報需求建立 SOS、穿戴數據與血壓量測頁，先提供畫面供後續串接。
        </p>

        <div className="metric-row">
          {healthSummary.map(item => (
            <div className="metric-card" key={item.label}>
              <div className="metric-label">{item.label}</div>
              <div className="metric-value">{item.value}</div>
              <div className="metric-note">{item.state}</div>
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
          <button className="secondary-btn" onClick={() => navigate("/patient/setup")}>
            編輯受顧者資料
          </button>
          <button className="secondary-btn danger-btn" onClick={handleLogout}>
            登出
          </button>
        </div>
      </div>
    </div>
  )
}
