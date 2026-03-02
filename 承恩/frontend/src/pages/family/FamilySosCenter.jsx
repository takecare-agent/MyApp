import { useNavigate } from "react-router-dom"

const sosEvents = [
  {
    id: "SOS-20260302-003",
    source: "受顧者按鈕觸發",
    time: "2026-03-02 16:02",
    location: "臥室",
    caregiver: "林看護"
  },
  {
    id: "SOS-20260301-011",
    source: "看護端緊急按鈕",
    time: "2026-03-01 08:27",
    location: "浴室",
    caregiver: "王看護"
  }
]

export default function FamilySosCenter() {
  const navigate = useNavigate()

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/family")}>
            返回總覽
          </button>
          <span className="section-kicker">SOS 通知接收</span>
        </div>

        <h2 className="section-title">高優先權事件中心</h2>
        <p className="section-subtitle">
          家屬收到 SOS 後可快速撥打看護電話、查看位置與進入事件詳情頁。
        </p>

        <div className="sos-banner">
          <div className="sos-title">最近一次 SOS</div>
          <div className="sos-value">2026-03-02 16:02 | 臥室</div>
          <div className="action-row">
            <button className="primary-btn">撥打看護電話</button>
            <button className="secondary-btn">查看看護位置</button>
          </div>
        </div>

        <div className="stack-list">
          {sosEvents.map(item => (
            <div className="list-card" key={item.id}>
              <div className="list-card-head">
                <div>
                  <div className="list-title">{item.source}</div>
                  <div className="list-meta">編號：{item.id}</div>
                </div>
                <span className="risk-pill risk-high">高優先</span>
              </div>

              <div className="list-grid">
                <div>
                  <div className="field-key">時間</div>
                  <div className="field-value">{item.time}</div>
                </div>
                <div>
                  <div className="field-key">位置</div>
                  <div className="field-value">{item.location}</div>
                </div>
                <div>
                  <div className="field-key">看護</div>
                  <div className="field-value">{item.caregiver}</div>
                </div>
              </div>

              <div className="action-row">
                <button className="secondary-btn">事件詳情</button>
                <button className="secondary-btn">標記已聯繫</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
