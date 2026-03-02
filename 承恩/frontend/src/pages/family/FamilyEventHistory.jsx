import { useNavigate } from "react-router-dom"

const eventRows = [
  {
    id: "EV-2301",
    time: "2026-03-02 14:18",
    type: "跌倒",
    description: "客廳偵測到跌倒，系統自動截圖與發送通知。",
    media: "截圖 + 10 秒短片",
    status: "已完成"
  },
  {
    id: "EV-2299",
    time: "2026-03-01 21:05",
    type: "久坐不動",
    description: "連續 1 小時未移動，提醒活動。",
    media: "截圖",
    status: "處理中"
  },
  {
    id: "EV-2292",
    time: "2026-02-28 03:17",
    type: "離床",
    description: "夜間離床，已通知看護到場確認。",
    media: "短片",
    status: "已完成"
  }
]

export default function FamilyEventHistory() {
  const navigate = useNavigate()

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/family")}>
            返回總覽
          </button>
          <span className="section-kicker">危險事件紀錄查詢</span>
        </div>

        <h2 className="section-title">條件查詢與歷史事件清單</h2>
        <p className="section-subtitle">
          支援日期與事件類型篩選，並顯示描述、影像與處理狀態欄位。
        </p>

        <div className="filter-grid">
          <div>
            <label className="input-label" htmlFor="event-start">
              起始日期
            </label>
            <input id="event-start" type="date" defaultValue="2026-02-25" />
          </div>
          <div>
            <label className="input-label" htmlFor="event-end">
              結束日期
            </label>
            <input id="event-end" type="date" defaultValue="2026-03-02" />
          </div>
          <div>
            <label className="input-label" htmlFor="event-type">
              事件類型
            </label>
            <select id="event-type" defaultValue="all">
              <option value="all">全部</option>
              <option value="fall">跌倒</option>
              <option value="leave-bed">離床</option>
              <option value="inactive">久坐不動</option>
            </select>
          </div>
          <div className="filter-submit">
            <button className="primary-btn">查詢事件</button>
          </div>
        </div>

        <div className="stack-list">
          {eventRows.map(item => (
            <div className="list-card" key={item.id}>
              <div className="list-card-head">
                <div>
                  <div className="list-title">{item.type}</div>
                  <div className="list-meta">{item.id}</div>
                </div>
                <span className="risk-pill risk-medium">{item.status}</span>
              </div>
              <p className="list-description">{item.description}</p>
              <div className="list-grid">
                <div>
                  <div className="field-key">發生時間</div>
                  <div className="field-value">{item.time}</div>
                </div>
                <div>
                  <div className="field-key">附件</div>
                  <div className="field-value">{item.media}</div>
                </div>
              </div>
              <div className="action-row">
                <button className="secondary-btn">檢視內容</button>
                <button className="secondary-btn">更新處理狀態</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
