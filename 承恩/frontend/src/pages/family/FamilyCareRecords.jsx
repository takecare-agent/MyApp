import { useNavigate } from "react-router-dom"

const records = [
  {
    time: "08:10",
    medicine: "已完成",
    meal: "已完成",
    toilet: "正常",
    activity: "散步 20 分鐘"
  },
  {
    time: "12:35",
    medicine: "已完成",
    meal: "完成 80%",
    toilet: "正常",
    activity: "午休"
  },
  {
    time: "19:15",
    medicine: "未執行",
    meal: "已完成",
    toilet: "待確認",
    activity: "客廳活動"
  }
]

export default function FamilyCareRecords() {
  const navigate = useNavigate()

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/family")}>
            返回總覽
          </button>
          <span className="section-kicker">照護紀錄瀏覽</span>
        </div>

        <h2 className="section-title">每日照護任務紀錄</h2>
        <p className="section-subtitle">
          根據簡報需求提供日期篩選與詳細紀錄查看，供家屬快速掌握今日照護狀態。
        </p>

        <div className="toolbar-row">
          <input type="date" defaultValue="2026-03-02" />
          <button className="secondary-btn">套用日期</button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>時間</th>
                <th>用藥</th>
                <th>飲食</th>
                <th>如廁情況</th>
                <th>活動情況</th>
              </tr>
            </thead>
            <tbody>
              {records.map(item => (
                <tr key={item.time}>
                  <td>{item.time}</td>
                  <td>{item.medicine}</td>
                  <td>{item.meal}</td>
                  <td>{item.toilet}</td>
                  <td>{item.activity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="action-row">
          <button className="secondary-btn">查看看護備註</button>
          <button className="secondary-btn">匯出當日報表</button>
        </div>
      </div>
    </div>
  )
}
