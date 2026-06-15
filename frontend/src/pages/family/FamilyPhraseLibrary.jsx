import { useNavigate } from "react-router-dom"

const defaultPhrases = [
  { text: "你還好嗎？", lang: "中文 / 台語 / 英文" },
  { text: "需要幫忙嗎？", lang: "中文 / 印尼文 / 越南文" },
  { text: "該吃藥了。", lang: "中文 / 英文 / 越南文" }
]

const customPhrases = [
  "慢慢來，我在這裡陪你。",
  "先坐好，我去叫看護過來。",
  "如果不舒服請按 SOS。"
]

export default function FamilyPhraseLibrary() {
  const navigate = useNavigate()

  return (
    <div className="home-page">
      <div className="home-card wide-card">
        <div className="top-line">
          <button className="ghost-btn" onClick={() => navigate("/family")}>
            返回總覽
          </button>
          <span className="section-kicker">常用關懷語句庫</span>
        </div>

        <h2 className="section-title">多語音關懷語句介面</h2>
        <div className="stack-list">
          {defaultPhrases.map(item => (
            <div className="list-card" key={item.text}>
              <div className="list-card-head">
                <div className="list-title">{item.text}</div>
                <span className="risk-pill risk-low">預設語句</span>
              </div>
              <div className="list-meta">支援語音：{item.lang}</div>
              <div className="action-row">
                <button className="secondary-btn">播放語音</button>
                <button className="secondary-btn">加入常用</button>
              </div>
            </div>
          ))}
        </div>

        <div className="custom-box">
          <label className="input-label" htmlFor="new-phrase">
            新增自訂語句
          </label>
          <textarea
            id="new-phrase"
            rows={3}
            placeholder="輸入希望新增的關懷語句..."
          />
          <div className="action-row">
            <button className="primary-btn">儲存語句</button>
            <button className="secondary-btn">清除內容</button>
          </div>
        </div>

        <div className="tag-list">
          {customPhrases.map(item => (
            <span className="tag-chip" key={item}>
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
