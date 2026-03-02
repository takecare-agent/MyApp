import { useNavigate } from "react-router-dom"

const pressureRows = [
  { date: "03/02 08:30", sys: "128", dia: "82", pulse: "76", status: "偏高" },
  { date: "03/01 20:50", sys: "118", dia: "76", pulse: "73", status: "正常" },
  { date: "02/28 08:10", sys: "142", dia: "92", pulse: "84", status: "高血壓" }
]

const judgeRules = [
  "正常：SYS < 120 且 DIA < 80",
  "偏高：SYS 120 - 129",
  "高血壓：SYS >= 140 或 DIA >= 90",
  "低血壓：SYS < 90 或 DIA < 60"
]

export default function PatientBloodPressure() {
  const navigate = useNavigate()

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/patient")}>
            返回總覽
          </button>
          <span className="section-kicker">血壓機介面</span>
        </div>

        <h2 className="section-title">血壓量測與家屬同步畫面</h2>
        <p className="section-subtitle">
          包含藍牙自動傳輸與手動輸入備援欄位，並列出異常判斷規則與趨勢資料。
        </p>

        <div className="filter-grid">
          <div>
            <label className="input-label" htmlFor="sys">
              收縮壓 SYS
            </label>
            <input id="sys" type="number" placeholder="例如 128" />
          </div>
          <div>
            <label className="input-label" htmlFor="dia">
              舒張壓 DIA
            </label>
            <input id="dia" type="number" placeholder="例如 82" />
          </div>
          <div>
            <label className="input-label" htmlFor="pulse">
              心跳 Pulse
            </label>
            <input id="pulse" type="number" placeholder="例如 76" />
          </div>
          <div className="filter-submit">
            <button className="primary-btn">送出量測</button>
          </div>
        </div>

        <div className="rule-box">
          <div className="rule-title">血壓異常判斷</div>
          <ul className="rule-list">
            {judgeRules.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>時間</th>
                <th>SYS</th>
                <th>DIA</th>
                <th>Pulse</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>
              {pressureRows.map(item => (
                <tr key={item.date}>
                  <td>{item.date}</td>
                  <td>{item.sys}</td>
                  <td>{item.dia}</td>
                  <td>{item.pulse}</td>
                  <td>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="action-row">
          <button className="secondary-btn">切換日/週/月趨勢圖</button>
          <button className="secondary-btn">同步到家屬端</button>
        </div>
      </div>
    </div>
  )
}
