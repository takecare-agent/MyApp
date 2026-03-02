import { useNavigate } from "react-router-dom"

export default function PatientSos() {
  const navigate = useNavigate()

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/patient")}>
            返回總覽
          </button>
          <span className="section-kicker">一鍵 SOS</span>
        </div>

        <h2 className="section-title">緊急求助按鈕介面</h2>
        <p className="section-subtitle">
          依簡報設計大按鈕避免誤觸，按下後顯示「已通知，請稍候」狀態畫面。
        </p>

        <div className="sos-panel">
          <button className="sos-button">SOS</button>
          <div className="sos-hint">按下後將通知家屬端與看護端</div>
          <div className="sos-confirm">已通知，請稍候</div>
        </div>

        <div className="action-row">
          <button className="secondary-btn">聯絡主要家屬</button>
          <button className="secondary-btn">聯絡看護</button>
        </div>
      </div>
    </div>
  )
}
