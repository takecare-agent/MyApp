/** 健康卡短摘要（R87：卡上不塞長指引）。完整選答樹見 firstAidTree.js */
export const FIRST_AID_STEPS = [
  {
    title: "步驟 1：確認安全並呼叫患者",
    desc: "先確認現場安全，輕拍肩膀並大聲呼叫。若沒有反應，請立刻請旁人協助並準備撥打 119。",
    image: require("../assets/first-aid-step1.png")
  },
  {
    title: "步驟 2：撥打 119 並依指示急救",
    desc: "清楚告知位置、患者狀況與聯絡電話。依 119 指示進行 CPR、尋找 AED，直到救護人員抵達。",
    image: require("../assets/first-aid-step2.png")
  }
]

export const FIRST_AID_SUMMARY = [
  "確認現場安全並呼叫患者",
  "無反應時立即請人協助並撥打 119",
  "依指示進行急救，直到救護抵達"
]
