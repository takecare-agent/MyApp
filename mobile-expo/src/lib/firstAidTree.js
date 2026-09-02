/**
 * R98 看護緊急選答樹。
 * 步驟只連官方／醫學會／健保署民眾頁。圖與片上網找現成教材，不自繪幾何圖。
 */

export const AID_ROOT = "home"

const img = {
  cpr: require("../assets/aid/wiki-cpr.png"),
  choke: require("../assets/aid/wiki-heimlich.jpg"),
  bleed: require("../assets/aid/wiki-bleed.jpg"),
  burn: require("../assets/aid/wiki-burns.png"),
  side: require("../assets/aid/wiki-recovery.jpg")
}

export const AID_HOME_NOW = [
  { id: "cpr", labelKey: "aid.home.cpr", next: "leaf_cpr", urgent: true, image: img.cpr },
  { id: "choke", labelKey: "aid.home.choke", next: "q2a", image: img.choke },
  { id: "bleed", labelKey: "aid.home.bleed", next: "leaf_bleed", image: img.bleed },
  { id: "fast", labelKey: "aid.home.fast", next: "leaf_fast", image: img.side },
  { id: "chest", labelKey: "aid.home.chest", next: "leaf_chest", image: img.cpr },
  { id: "seizure", labelKey: "aid.home.seizure", next: "leaf_seizure", image: img.side },
  { id: "foam", labelKey: "aid.home.foam", next: "leaf_foam", image: img.side },
  { id: "sugar", labelKey: "aid.home.sugar", next: "leaf_sugar", image: img.side }
]

export const AID_HOME_CALL = [
  { id: "burn", labelKey: "aid.home.burn", next: "leaf_burn", image: img.burn },
  { id: "heat", labelKey: "aid.home.heat", next: "leaf_heat", image: img.burn },
  { id: "fall", labelKey: "aid.home.fall", next: "leaf_fall", image: img.bleed },
  { id: "poison", labelKey: "aid.home.poison", next: "leaf_poison", image: img.side },
  { id: "allergy", labelKey: "aid.home.allergy", next: "leaf_allergy", image: img.side },
  { id: "drown", labelKey: "aid.home.drown", next: "leaf_drown", image: img.cpr },
  { id: "unsure", labelKey: "aid.home.unsure", next: "q0", image: img.side }
]

export const AID_HOME_TILES = [...AID_HOME_NOW, ...AID_HOME_CALL]

export const AID_SOURCES = {
  s1: { labelKey: "aid.src.s1", url: "https://dep.mohw.gov.tw/DOMA/cp-2710-7586-106.html" },
  s2: { labelKey: "aid.src.s2", url: "https://cpr.heart.org/en/resuscitation-science/cpr-and-ecc-guidelines/adult-basic-life-support" },
  s3: { labelKey: "aid.src.s3", url: "https://www.tfdp.com.tw/cht/index.php?article_id=203&code=list&flag=detail&ids=66" },
  s4: { labelKey: "aid.src.s4", url: "https://www.mohw.gov.tw/cp-3791-39530-1.html" },
  s5: { labelKey: "aid.src.s5", url: "https://www.epilepsy.org.tw/en/knowledge" },
  s6: { labelKey: "aid.src.s6", url: "https://www.mohw.gov.tw/cp-16-81443-1.html" },
  s7: { labelKey: "aid.src.s7", url: "https://www.tfdp.com.tw/cht/index.php?article_id=204&code=list&flag=detail&ids=120" },
  s8: { labelKey: "aid.src.s8", url: "https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=577&pid=10751" },
  s9: { labelKey: "aid.src.s9", url: "https://www.nhi.gov.tw/ch/cp-2765-532c8-2951-1.html" },
  s10: { labelKey: "aid.src.s10", url: "https://www.mohw.gov.tw/cp-16-54896-1.html" },
  s11: { labelKey: "aid.src.s11", url: "https://www.nhi.gov.tw/ch/cp-2760-50513-2951-1.html" },
  s12: { labelKey: "aid.src.s12", url: "https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=127&pid=14279" },
  s13: { labelKey: "aid.src.s13", url: "https://www.nhi.gov.tw/ch/cp-2779-21af8-2951-1.html" },
  s14: { labelKey: "aid.src.s14", url: "https://www.nhi.gov.tw/ch/cp-2771-6facf-2951-1.html" },
  s15: { labelKey: "aid.src.s15", url: "https://www.nhi.gov.tw/ch/cp-2756-04bf4-2951-1.html" }
}

export const AID_TREE = {
  q0: {
    type: "q",
    promptKey: "aid.q0",
    sources: ["s1"],
    choices: [
      { id: "unsafe", labelKey: "aid.q0.unsafe", next: "leaf_leave" },
      { id: "safe", labelKey: "aid.q0.safe", next: "q1" }
    ]
  },
  q1: {
    type: "q",
    promptKey: "aid.q1",
    sources: ["s1"],
    choices: [
      { id: "no", labelKey: "aid.q1.no", next: "q1b" },
      { id: "yes", labelKey: "aid.q1.yes", next: "q2" }
    ]
  },
  q1b: {
    type: "q",
    promptKey: "aid.q1b",
    hintKey: "aid.q1b.hint",
    sources: ["s1", "s2"],
    choices: [
      { id: "no", labelKey: "aid.q1b.no", next: "leaf_cpr" },
      { id: "yes", labelKey: "aid.q1b.yes", next: "leaf_breathe" }
    ]
  },
  q2: {
    type: "q",
    promptKey: "aid.q2",
    sources: ["s1"],
    choices: [
      { id: "choke", labelKey: "aid.q2.choke", next: "q2a" },
      { id: "fast", labelKey: "aid.q2.fast", next: "leaf_fast" },
      { id: "chest", labelKey: "aid.q2.chest", next: "leaf_chest" },
      { id: "seizure", labelKey: "aid.q2.seizure", next: "leaf_seizure" },
      { id: "foam", labelKey: "aid.q2.foam", next: "leaf_foam" },
      { id: "sugar", labelKey: "aid.q2.sugar", next: "leaf_sugar" },
      { id: "other", labelKey: "aid.q2.other", next: "q2b" }
    ]
  },
  q2b: {
    type: "q",
    promptKey: "aid.q2b",
    sources: ["s1"],
    choices: [
      { id: "bleed", labelKey: "aid.home.bleed", next: "leaf_bleed" },
      { id: "burn", labelKey: "aid.home.burn", next: "leaf_burn" },
      { id: "heat", labelKey: "aid.home.heat", next: "leaf_heat" },
      { id: "fall", labelKey: "aid.home.fall", next: "leaf_fall" },
      { id: "poison", labelKey: "aid.home.poison", next: "leaf_poison" },
      { id: "allergy", labelKey: "aid.home.allergy", next: "leaf_allergy" },
      { id: "drown", labelKey: "aid.home.drown", next: "leaf_drown" }
    ]
  },
  q2a: {
    type: "q",
    promptKey: "aid.q2a",
    image: img.choke,
    sources: ["s3"],
    choices: [
      { id: "yes", labelKey: "aid.q2a.yes", next: "leaf_mild" },
      { id: "no", labelKey: "aid.q2a.no", next: "leaf_heimlich" }
    ]
  },
  leaf_leave: {
    type: "leaf",
    titleKey: "aid.leaf.leave.title",
    bodyKeys: ["aid.leaf.leave.1"],
    sources: ["s1"]
  },
  leaf_cpr: {
    type: "leaf",
    titleKey: "aid.leaf.cpr.title",
    bodyKeys: ["aid.leaf.cpr.1", "aid.leaf.cpr.2", "aid.leaf.cpr.3"],
    videoId: "fw5cpbIqQ3w",
    image: img.cpr,
    hasMetronome: true,
    sources: ["s1", "s2"]
  },
  leaf_breathe: {
    type: "leaf",
    titleKey: "aid.leaf.breathe.title",
    bodyKeys: ["aid.leaf.breathe.1", "aid.leaf.breathe.2"],
    extraNext: { id: "worse", labelKey: "aid.gotoCpr", next: "leaf_cpr" },
    sources: ["s1"]
  },
  leaf_mild: {
    type: "leaf",
    titleKey: "aid.leaf.mild.title",
    bodyKeys: ["aid.leaf.mild.1"],
    image: img.choke,
    sources: ["s3"]
  },
  leaf_heimlich: {
    type: "leaf",
    titleKey: "aid.leaf.heimlich.title",
    bodyKeys: ["aid.leaf.heimlich.1"],
    videoId: "rMyDMSt5RMo",
    image: img.choke,
    extraNext: { id: "lost", labelKey: "aid.gotoCpr", next: "leaf_cpr" },
    sources: ["s3"]
  },
  leaf_fast: {
    type: "leaf",
    titleKey: "aid.leaf.fast.title",
    bodyKeys: ["aid.leaf.fast.1", "aid.leaf.fast.side"],
    image: img.side,
    sources: ["s4", "s15"]
  },
  leaf_chest: {
    type: "leaf",
    titleKey: "aid.leaf.chest.title",
    bodyKeys: ["aid.leaf.chest.1"],
    image: img.cpr,
    sources: ["s13"]
  },
  leaf_seizure: {
    type: "leaf",
    titleKey: "aid.leaf.seizure.title",
    bodyKeys: ["aid.leaf.seizure.1", "aid.leaf.seizure.2", "aid.leaf.seizure.3"],
    image: img.side,
    sources: ["s5"]
  },
  leaf_foam: {
    type: "leaf",
    titleKey: "aid.leaf.foam.title",
    bodyKeys: ["aid.leaf.foam.1", "aid.leaf.seizure.2"],
    image: img.side,
    sources: ["s5"]
  },
  leaf_bleed: {
    type: "leaf",
    titleKey: "aid.leaf.bleed.title",
    bodyKeys: ["aid.leaf.bleed.1"],
    image: img.bleed,
    sources: ["s7"]
  },
  leaf_burn: {
    type: "leaf",
    titleKey: "aid.leaf.burn.title",
    bodyKeys: ["aid.leaf.burn.1"],
    image: img.burn,
    sources: ["s6"]
  },
  leaf_heat: {
    type: "leaf",
    titleKey: "aid.leaf.heat.title",
    bodyKeys: ["aid.leaf.heat.1"],
    sources: ["s8"]
  },
  leaf_poison: {
    type: "leaf",
    titleKey: "aid.leaf.poison.title",
    bodyKeys: ["aid.leaf.poison.1"],
    poisonTel: "tel:0228717121",
    sources: ["s9"]
  },
  leaf_drown: {
    type: "leaf",
    titleKey: "aid.leaf.drown.title",
    bodyKeys: ["aid.leaf.drown.1"],
    extraNext: { id: "cpr", labelKey: "aid.gotoCpr", next: "leaf_cpr" },
    sources: ["s10", "s1"]
  },
  leaf_allergy: {
    type: "leaf",
    titleKey: "aid.leaf.allergy.title",
    bodyKeys: ["aid.leaf.allergy.1"],
    sources: ["s14"]
  },
  leaf_fall: {
    type: "leaf",
    titleKey: "aid.leaf.fall.title",
    bodyKeys: ["aid.leaf.fall.1"],
    sources: ["s11"]
  },
  leaf_sugar: {
    type: "leaf",
    titleKey: "aid.leaf.sugar.title",
    bodyKeys: ["aid.leaf.sugar.1"],
    extraNext: { id: "worse", labelKey: "aid.gotoCpr", next: "leaf_cpr" },
    sources: ["s12"]
  },
  leaf_just119: {
    type: "leaf",
    titleKey: "aid.leaf.just119.title",
    bodyKeys: ["aid.leaf.just119.1"],
    sources: ["s1"]
  }
}
