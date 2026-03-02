import { useNavigate } from "react-router-dom"

const alerts = [
  {
    id: "AL-20260302-001",
    type: "跌倒",
    level: "高",
    time: "2026-03-02 14:18",
    location: "客廳",
    status: "未處理"
  },
  {
    id: "AL-20260302-002",
    type: "離床",
    level: "中",
    time: "2026-03-02 10:44",
    location: "臥室",
    status: "處理中"
  },
  {
    id: "AL-20260301-009",
    type: "久坐不動",
    level: "低",
    time: "2026-03-01 21:05",
    location: "餐桌區",
    status: "已完成"
  }
]

function getLevelClass(level) {
  if (level === "高") return "risk-pill risk-high"
  if (level === "中") return "risk-pill risk-medium"
  return "risk-pill risk-low"
}

export default function FamilyAlerts() {
  const navigate = useNavigate()

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/family")}>
            返回總覽
          </button>
          <span className="section-kicker">危險事件即時通知</span>
        </div>

        <h2 className="section-title">即時推播事件列表</h2>
        <p className="section-subtitle">
          模擬 App 推播後進入的事件總覽，顯示事件類型、時間、位置與處理狀態。
        </p>

        <div className="toolbar-row">
          <select defaultValue="all">
            <option value="all">全部事件</option>
            <option value="high">高風險優先</option>
            <option value="pending">只看未處理</option>
          </select>
          <button className="secondary-btn">重新整理</button>
        </div>

        <div className="stack-list">
          {alerts.map(item => (
            <div key={item.id} className="list-card">
              <div className="list-card-head">
                <div>
                  <div className="list-title">{item.type}</div>
                  <div className="list-meta">事件編號：{item.id}</div>
                </div>
                <span className={getLevelClass(item.level)}>風險 {item.level}</span>
              </div>
              <div className="list-grid">
                <div>
                  <div className="field-key">發生時間</div>
                  <div className="field-value">{item.time}</div>
                </div>
                <div>
                  <div className="field-key">位置</div>
                  <div className="field-value">{item.location}</div>
                </div>
                <div>
                  <div className="field-key">處理狀態</div>
                  <div className="field-value">{item.status}</div>
                </div>
              </div>
              <div className="action-row">
                <button className="secondary-btn">查看截圖</button>
                <button className="secondary-btn">開啟事件頁</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
