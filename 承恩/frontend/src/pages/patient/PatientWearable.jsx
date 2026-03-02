import { useNavigate } from "react-router-dom"

const wearableData = [
  {
    label: "心率",
    value: "74 bpm",
    range: "正常 60 - 100 bpm",
    abnormal: "過高或過低時通知家屬，標記生理異常事件。"
  },
  {
    label: "血氧濃度",
    value: "97%",
    range: "正常 >= 95%",
    abnormal: "低於設定值觸發警示。"
  },
  {
    label: "活動量/步數",
    value: "4,132 steps",
    range: "日常活動範圍",
    abnormal: "過低可能久躺，過高可能焦躁或遊走。"
  }
]

export default function PatientWearable() {
  const navigate = useNavigate()

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
          介面展示心率、血氧、活動量三類資訊，並附上異常判斷說明。
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
          <button className="secondary-btn">同步裝置資料</button>
          <button className="secondary-btn">查看異常歷史</button>
        </div>
      </div>
    </div>
  )
}
