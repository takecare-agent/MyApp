import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { apiRequest } from "../lib/api"
import MonthCalendar from "../components/MonthCalendar"
import { colors } from "./new_ui/tokens"
import { NeoIcon } from "./new_ui/NeoIcons"
import { ensureFilled, screenshotBpRecords } from "./new_ui/screenshotFill"
import { formatDateTime as formatDateTimeLocale } from "../i18n/dateLocale"

const HEALTH_CONNECT_PERMISSIONS = [
  { accessType: "read", recordType: "BloodPressure" },
  { accessType: "read", recordType: "HeartRate" }
]
const PULSE_MATCH_WINDOW_MS = 15 * 60 * 1000
const UNMARKED_MOOD = "未標記"
const MOOD_UNMARKED_LABELS = {
  zh: "未標記",
  en: "Not set",
  id: "Belum ditandai",
  vi: "Chưa đánh dấu",
  tl: "Hindi naka-marka",
  th: "ยังไม่บันทึก"
}
const MOOD_OPTIONS = [
  {
    value: "平靜",
    tint: "#10B981",
    wash: "rgba(16,185,129,0.15)",
    icon: "emoticon-neutral",
    labels: { zh: "平靜", en: "Calm", id: "Tenang", vi: "Bình tĩnh", tl: "Kalmado", th: "สงบ" }
  },
  {
    value: "開心",
    tint: "#FFA726",
    wash: "rgba(255,167,38,0.15)",
    icon: "emoticon-happy",
    labels: { zh: "開心", en: "Happy", id: "Senang", vi: "Vui", tl: "Masaya", th: "ดีใจ" }
  },
  {
    value: "焦慮",
    tint: "#FF7043",
    wash: "rgba(255,112,67,0.15)",
    icon: "emoticon-confused",
    labels: { zh: "焦慮", en: "Anxious", id: "Cemas", vi: "Lo âu", tl: "Balisa", th: "กังวล" }
  },
  {
    value: "頭暈",
    tint: "#EF5350",
    wash: "rgba(239,83,80,0.15)",
    icon: "emoticon-dizzy",
    labels: { zh: "頭暈", en: "Dizzy", id: "Pusing", vi: "Chóng mặt", tl: "Nahihilo", th: "เวียนหัว" }
  }
]

function moodDisplay(raw, lang) {
  const key = lang || "zh"
  if (!raw || raw === UNMARKED_MOOD) return MOOD_UNMARKED_LABELS[key] || MOOD_UNMARKED_LABELS.en
  const opt = MOOD_OPTIONS.find((item) => item.value === raw)
  if (!opt) return raw
  return opt.labels[key] || opt.labels.en
}

function MoodDot({ mood, size = 14, selected = false }) {
  const opt = MOOD_OPTIONS.find((item) => item.value === mood)
  const tint = opt?.tint || "#98a2b3"
  if (opt?.icon) {
    return <NeoIcon name={opt.icon} size={size} color={tint} />
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: selected ? tint : "rgba(255,255,255,0.08)",
        borderWidth: 2,
        borderColor: tint
      }}
    />
  )
}

function MoodPicker({ value, onChange, lang, compact = false }) {
  return (
    <View style={compact ? styles.moodRowCompact : styles.moodRow}>
      {MOOD_OPTIONS.map((option) => {
        const selected = value === option.value
        const label = moodDisplay(option.value, lang)
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            style={[
              compact ? styles.moodItemCompact : styles.moodItem,
              selected ? styles.moodItemOn : null
            ]}
          >
            <MoodDot mood={option.value} size={compact ? 22 : 28} selected={selected} />
            <Text
              style={[
                compact ? styles.moodItemLabelCompact : styles.moodItemLabel,
                selected ? { color: option.tint } : null
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
const STRESS_MOODS = new Set(["焦慮", "頭暈"])

const UI_TEXT = {
  zh: {
    back: "返回", caregiverTitle: "看護血壓照護", caregiverSub: "同步、代輸入與每日照護任務。",
    patientTitle: "長輩每日血壓紀錄", patientSub: "同步、手動新增與趨勢分析",
    familyTitle: "長輩每日血壓監控", familySub: "總覽最新數值，並可看 1／3／6 月趨勢",
    tabMeasure: "量測", tabTrend: "趨勢", tabDiary: "日記", tabOverview: "總覽",
    chartGrain1m: "每日平均", chartGrain3m: "每週平均", chartGrain6m: "每兩週平均", logTitle: "量測紀錄",
    noRecord: "尚無紀錄", refresh: "重新整理", syncHC: "從 Health Connect 同步",
    moodStatus: "心情狀態", sysBP: "收縮壓", diaBP: "舒張壓", pulse: "脈搏", mood: "心情",
    alertNeedsConfirm: "需要看護確認", bpAlert: "血壓提醒",
    currentBP: "目前血壓", nextStepLabel: "照護者建議",
    nextCritical: "立即確認長輩症狀，必要時聯絡家屬並協助就醫。",
    nextDanger: "請安排長輩休息 5 分鐘後複測，並在照護紀錄中註記。",
    nextWarning: "持續追蹤今日血壓，留意頭暈或焦慮狀態。",
    nextStable: "目前狀態穩定，維持例行量測與同步。",
    nextNoData: "尚無血壓資料，請先同步或手動新增第一筆紀錄。",
    dailyTasksTitle: "今日照護任務", completed: "已完成",
    taskMorning: "晨間血壓確認",
    taskMorningLatestFn: (sys, dia) => `最新紀錄 ${sys}/${dia} mmHg`,
    taskMorningNew: "同步或新增今日第一筆血壓。",
    taskMoodTitle: "心情狀態註記",
    taskMoodCurrentFn: (mood) => `目前標記：${mood}`,
    taskMoodNew: "量測後補上長輩當下狀態。",
    taskNotify: "異常通知家屬", taskNotifyOk: "目前無需通知，維持觀察。",
    taskEvening: "晚間回顧", taskEveningDesc: "交班前確認是否已同步資料並完成必要備註。",
    syncInput: "同步與代輸入", caregiverAddTitle: "看護手動新增", saveCaregiver: "儲存看護血壓紀錄",
    dataSource: "資料來源", linkedTo: "已連接長輩：", notLinked: "尚未連接長輩帳號",
    latestSync: "最新一筆血壓同步", sourcePrefix: "來源：",
    familyFocus: "家屬追蹤重點", waitForSync: "等待長輩端同步血壓資料。",
    familyDashboard: "家屬追蹤看板", currentStatus: "目前狀態",
    threeMonthAbnormal: "近 3 個月異常", recordUnit: " 筆",
    familyNextStepLabel: "家屬下一步", trend3m: "近 3 個月每日血壓趨勢",
    legendSys: "收縮壓", legendDia: "舒張壓", legendLimit: "警戒線 130/80",
    summary3m: "近 3 個月血壓監控摘要",
    avgSysLabel: "平均收縮壓", avgDiaLabel: "平均舒張壓",
    maxSysLabel: "最高收縮壓", minSysLabel: "最低收縮壓",
    totalPrefix: "總量測", abnormalSuffix: " 筆，異常優先顯示如下。",
    noAbnormal: "目前沒有異常血壓紀錄。",
    bpLabel: "血壓", fiveDayTrend: "近 5 日趨勢", dailyAlert: "每日警示", avgPrefix: "平均",
    autoImport: "從血壓計同步", addRecord: "對照血壓計手動輸入", saveRecord: "儲存血壓紀錄",
    meterHint: "量完先開歐姆龍 App 把這次量測傳到手機，再按同步。若沒進來，把血壓計螢幕上的數字打進來。",
    range1m: "1個月", range3m: "3個月", range6m: "6個月",
    bpDiary: "血壓日記", dateRecordsSuffix: " 的紀錄", emptyDay: "這天沒有血壓紀錄",
    pulsePrefix: "脈搏", moodPrefix: "心情：",
    levelCritical: "超高血壓", levelDanger: "高血壓", levelLow: "偏低",
    levelPrehypertension: "血壓前期", levelNormal: "正常",
    familyLabelCritical: "危險高血壓", familyLabelDanger: "高血壓警戒",
    familyLabelLow: "血壓偏低", familyLabelPrehypertension: "血壓前期", familyLabelNormal: "正常",
    recCritical: "請立即聯絡長輩，確認症狀並評估就醫。",
    recDanger: "請儘快確認長輩狀況，安排休息後複測。",
    recLow: "請確認是否頭暈、無力，必要時聯絡醫師。",
    recPrehypertension: "建議增加監測頻率，並留意飲食與作息。",
    recNormal: "目前血壓穩定，維持固定量測與紀錄。",
    srcManual: "手動輸入", srcOldData: "舊測試資料", srcCareSystem: "照護系統",
    familyNoData: "等待長輩端同步第一筆血壓資料。",
    familyCritical: "立即聯絡長輩並確認是否需要就醫。",
    familyDanger: "請長輩休息後複測，並通知照顧者持續觀察。",
    familyManyAbnormal: "近 3 個月異常偏多，建議安排固定量測與門診討論。",
    familyNormal: "維持每日追蹤，必要時提醒長輩補量測。",
    adviceNoData: "尚未有血壓資料，請先從長輩端同步或手動新增紀錄。",
    adviceCritical: "出現 180/120 以上的超高血壓紀錄，請立即確認症狀並評估就醫。",
    adviceDanger: "近期有高血壓紀錄，建議固定複測並觀察是否與睡眠、飲食或情緒相關。",
    adviceWarning: "血壓已有前期或偏低訊號，建議維持每日量測並留意身體不適。",
    adviceNormal: "目前血壓趨勢穩定，維持固定量測與健康生活型態。",
    moodStressHitFn: (n, total) => `近 ${total} 筆中有 ${n} 筆同時出現高血壓與焦慮或頭暈，建議記錄發生情境。`,
    moodStressContinue: "已有心情標記，可持續觀察情緒、睡眠與血壓波動的關係。",
    moodStressEmpty: "尚未累積足夠心情標記，建議每次量測後補上當下感受。",
    pulseNoData: "尚未有脈搏資料。同步歐姆龍／Health Connect 或手動輸入後會顯示。",
    pulseOverlapFn: (n) => `有 ${n} 筆紀錄心跳偏快且血壓偏高，建議休息後再量。`,
    pulseAvgFn: (avg) => `近期平均靜息脈搏約 ${avg} bpm。`,
    pulseAdviceFn: (avg) => {
      if (avg < 50) return `近期平均靜息脈搏約 ${avg} bpm。2018 ACC/AHA/HRS 心搏過緩指引把竇性心率 <50 列為評估參考之一，但不能單靠數字診斷；若有頭暈、無力或昏厥請就醫。`
      if (avg < 60) return `近期平均靜息脈搏約 ${avg} bpm，低於 AHA 常見靜息範圍 60–100。低於 60 不一定是病（藥物、睡眠、運動習慣也可能）；若伴隨不適應就醫討論。`
      if (avg <= 100) return `近期平均靜息脈搏約 ${avg} bpm，落在美國心臟協會（AHA）多數成人靜息心率 60–100 bpm 的常見範圍（坐或躺、冷靜、無不適時）。`
      return `近期平均靜息脈搏約 ${avg} bpm，高於 AHA 靜息常見上限 100 bpm。可能受活動、發燒、咖啡因或緊張影響；休息後再量，若持續偏快或有胸悶／喘，請就醫。`
    },
    savedMsgFn: (sys, dia, level) => `已儲存 ${sys}/${dia} mmHg，狀態：${level}`,
    pulseUnknown: "未記錄", pulseSlow: "心跳偏慢", pulseFast: "心跳偏快", pulseNormal: "心跳正常",
    obsNoData: "目前資料量不足，請先累積血壓紀錄。",
    obsDanger: "高血壓天數比例偏高，建議儘快與醫師討論近期控制策略。",
    obsWarning: "血壓前期或警示天數較多，建議留意鹽分、睡眠、壓力與固定量測。",
    obsNormal: "目前大多數紀錄落在穩定範圍，請持續維持規律量測與生活管理。",
    noMiniTrendData: "尚無血壓趨勢資料", noLongTrendData: "尚無長期趨勢資料",
    calendarLegend: "• 有紀錄　紅框＝偏高",
    weekdays: ["日", "一", "二", "三", "四", "五", "六"],
    errFamilyReadOnly: "家屬端僅能查看長輩資料，請由受顧者端或照顧者端新增血壓紀錄。",
    errInvalidBP: "請輸入有效的收縮壓與舒張壓。",
    errOutOfRange: "血壓數值超出合理範圍，請重新確認。",
    errInvalidPulse: "脈搏需介於 30 到 220 bpm。",
    errFamilySync: "家屬端只讀；同步請在受顧者端或照顧者端執行。",
    errNotAndroid: "Health Connect 同步目前僅支援 Android 實機。",
    errIosHealth: "iPhone 未支援藍牙血壓計，請手動輸入。",
    syncHealth: "iPhone 未支援",
    meterHintIos: "iPhone 未支援藍牙血壓計，請手動輸入。",
    errNoHCPackage: "尚未載入 Health Connect 套件，請重新安裝原生 App。",
    errHCInitFail: "無法初始化 Health Connect，請確認手機已安裝並啟用 Health Connect。",
    errNoHCPerms: "尚未取得 Health Connect 血壓讀取權限。",
    hcNoData: "近 30 天 Health Connect 尚無可同步的血壓資料。請先開歐姆龍 App 把這次量測傳到手機。",
    syncBusy: "正在同步…",
    hcSyncDoneFn: (imported, pulse, skipped) => `Health Connect 同步完成：新增 ${imported} 筆，補入脈搏 ${pulse} 筆，略過重複 ${skipped} 筆。`,
    hcSyncNoNewFn: (sys, dia, when) => `沒有新筆。Health Connect 最新已是 ${sys}/${dia}（${when}）。若剛量的數字不同，先開歐姆龍 App 傳進手機再同步。`,
    hcSyncLatestFn: (sys, dia, when) => `最新 ${sys}/${dia}（${when}）`,
    hcSyncErrFn: (msg) => `${msg}。請確認歐姆龍 App 已把量測寫入 Health Connect，並授權本 App 讀取血壓。`,
    periodStats: (days) => `統計 ${days} 個有紀錄的日期，依每日平均血壓分類。`,
    highRiskDaysFn: (days, pct) => `高血壓風險天數：${days} 天（${pct}%）`,
    warningDaysFn: (days, pct) => `血壓前期/警示天數：${days} 天（${pct}%）`,
    normalDaysFn: (days, pct) => `正常天數：${days} 天（${pct}%）`,
    periodSummaryFn: (months) => `近 ${months} 個月健康摘要`,
    moodStressTitle: "心情提醒",
    pulseStressTitle: "脈搏觀察",
    observation: "觀察", reference: "參考來源",
    moodSourceNote: "僅供日常觀察，不能取代醫療診斷。",
    pulseSourceNote: "參考：AHA《All About Heart Rate》多數成人靜息 60–100 bpm（坐／躺、冷靜）；2018 ACC/AHA/HRS 心搏過緩指引以竇性心率 <50 搭配症狀評估。本欄非診斷。",
    recordDays: "紀錄天數", highRisk: "高風險", warning: "警示",
    avgPulse: "平均脈搏", recentPulse: "最近脈搏",
    logTime: "時間", logBp: "收縮/舒張", logPulse: "脈搏",
    logPage: "{page}/{total}",
    chartSourceNote: "紀錄表對齊 AHA 居家血壓日誌（日期、時間、收縮、舒張、脈搏）。線圖為輔助趨勢。警戒 130/80 依 2025 AHA/ACC 高血壓指引。非診斷。",
  },
  en: {
    back: "Back", caregiverTitle: "Caregiver BP Care", caregiverSub: "Sync, proxy entry, and daily care tasks.",
    patientTitle: "Daily Blood Pressure Log", patientSub: "Sync, manual entry, trend analysis & mood diary",
    familyTitle: "Family BP Monitor", familySub: "Family view of last 3 months",
    tabMeasure: "Measure", tabTrend: "Trend", tabDiary: "Diary", tabOverview: "Overview",
    chartGrain1m: "Daily average", chartGrain3m: "Weekly average", chartGrain6m: "Biweekly average", logTitle: "Readings",
    noRecord: "No record yet", refresh: "Refresh", syncHC: "Sync from Health Connect",
    moodStatus: "Mood", sysBP: "Systolic", diaBP: "Diastolic", pulse: "Pulse", mood: "Mood",
    alertNeedsConfirm: "Needs Caregiver Confirmation", bpAlert: "BP Alert",
    currentBP: "Current Care BP", nextStepLabel: "Caregiver Next Step",
    nextCritical: "Immediately check elder's symptoms; contact family and assist with medical care if needed.",
    nextDanger: "Arrange rest for 5 minutes then recheck; note in care log.",
    nextWarning: "Continue monitoring today's BP; watch for dizziness, fatigue, or anxiety.",
    nextStable: "Status stable. Continue routine measurement and sync.",
    nextNoData: "No BP data yet. Please sync or manually add the first record.",
    dailyTasksTitle: "Today's Care Tasks", completed: "completed",
    taskMorning: "Morning BP Check",
    taskMorningLatestFn: (sys, dia) => `Latest: ${sys}/${dia} mmHg`,
    taskMorningNew: "Sync or add today's first BP reading.",
    taskMoodTitle: "Mood Note",
    taskMoodCurrentFn: (mood) => `Marked: ${mood}`,
    taskMoodNew: "Add mood after measurement.",
    taskNotify: "Alert Family", taskNotifyOk: "No alert needed; continue monitoring.",
    taskEvening: "Evening Review", taskEveningDesc: "Before handoff, confirm sync and notes are complete.",
    syncInput: "Sync & Proxy Entry", caregiverAddTitle: "Caregiver Manual Entry", saveCaregiver: "Save Caregiver BP Record",
    dataSource: "Data Source", linkedTo: "Linked elder: ", notLinked: "No elder account linked",
    latestSync: "Latest BP Sync", sourcePrefix: "Source: ",
    familyFocus: "Family Focus", waitForSync: "Waiting for elder to sync BP data.",
    familyDashboard: "Family Dashboard", currentStatus: "Current Status",
    threeMonthAbnormal: "3-Month Abnormal", recordUnit: " records",
    familyNextStepLabel: "Family Next Step", trend3m: "3-Month Daily BP Trend",
    legendSys: "Systolic", legendDia: "Diastolic", legendLimit: "Alert 130/80",
    summary3m: "3-Month BP Summary",
    avgSysLabel: "Avg Systolic", avgDiaLabel: "Avg Diastolic",
    maxSysLabel: "Max Systolic", minSysLabel: "Min Systolic",
    totalPrefix: "Total", abnormalSuffix: " records, abnormal shown below.",
    noAbnormal: "No abnormal BP records.",
    bpLabel: "Blood Pressure", fiveDayTrend: "5-Day Trend", dailyAlert: "Daily Alert", avgPrefix: "Avg",
    autoImport: "Auto Import", addRecord: "Add a Record", saveRecord: "Save BP Record",
    meterHint: "Open Omron Connect first so this reading reaches the phone, then tap sync. If it still does not appear, type the numbers from the meter.",
    range1m: "1 Month", range3m: "3 Months", range6m: "6 Months",
    bpDiary: "BP Diary", dateRecordsSuffix: " records", emptyDay: "No BP records for this day",
    pulsePrefix: "Pulse", moodPrefix: "Mood: ",
    levelCritical: "Hypertensive Crisis", levelDanger: "High BP", levelLow: "Low BP",
    levelPrehypertension: "Prehypertension", levelNormal: "Normal",
    familyLabelCritical: "Critical High BP", familyLabelDanger: "High BP Alert",
    familyLabelLow: "Low BP", familyLabelPrehypertension: "Prehypertension", familyLabelNormal: "Normal",
    recCritical: "Contact elder immediately and assess need for medical care.",
    recDanger: "Confirm elder's condition quickly; arrange rest and recheck.",
    recLow: "Check for dizziness or weakness; contact doctor if needed.",
    recPrehypertension: "Increase monitoring frequency; watch diet and sleep.",
    recNormal: "BP is stable. Maintain regular measurement and logging.",
    srcManual: "Manual Entry", srcOldData: "Old Test Data", srcCareSystem: "Care System",
    familyNoData: "Waiting for elder's first BP sync.",
    familyCritical: "Contact elder immediately to assess if medical care is needed.",
    familyDanger: "Ask elder to rest and recheck; notify caregiver to monitor.",
    familyManyAbnormal: "Many abnormals in 3 months. Schedule regular checks and a clinic visit.",
    familyNormal: "Keep daily monitoring; remind elder to measure when needed.",
    adviceNoData: "No BP data yet. Sync from elder or add manually.",
    adviceCritical: "BP ≥180/120 recorded. Verify symptoms and consider medical care immediately.",
    adviceDanger: "Recent high BP. Check regularly; observe link with sleep, diet, or mood.",
    adviceWarning: "Prehypertension or low BP signal detected. Daily monitoring recommended.",
    adviceNormal: "BP trend is stable. Keep regular measurement and healthy habits.",
    moodStressHitFn: (n, total) => `${n} of the last ${total} records show high BP with anxiety or dizziness. Log the context.`,
    moodStressContinue: "Mood tags recorded. Continue tracking mood, sleep, and BP fluctuations.",
    moodStressEmpty: "Not enough mood tags yet. Add one after each measurement.",
    pulseNoData: "No pulse data yet. Health Connect sync will attempt to backfill.",
    pulseOverlapFn: (n) => `${n} records show high pulse, high BP, and stress mood together. Monitor rest and follow up.`,
    pulseAvgFn: (avg) => `Recent resting pulse avg ~${avg} bpm.`,
    pulseAdviceFn: (avg) => {
      if (avg < 50) return `Recent resting pulse avg ~${avg} bpm. 2018 ACC/AHA/HRS bradycardia guidance uses sinus rate <50 bpm as one evaluation cue, not a diagnosis by number alone. Seek care if dizzy, weak, or fainting.`
      if (avg < 60) return `Recent resting pulse avg ~${avg} bpm, below the AHA usual 60–100 range. Below 60 is not always illness (medication, sleep, fitness). See a clinician if you feel unwell.`
      if (avg <= 100) return `Recent resting pulse avg ~${avg} bpm, within the AHA usual adult resting range of 60–100 bpm (sitting/lying, calm, feeling well).`
      return `Recent resting pulse avg ~${avg} bpm, above the AHA usual resting upper limit of 100 bpm. Activity, fever, caffeine, or stress can raise it. Recheck at rest; seek care if it stays high or you have chest tightness/shortness of breath.`
    },
    savedMsgFn: (sys, dia, level) => `Saved ${sys}/${dia} mmHg, status: ${level}`,
    pulseUnknown: "Unknown", pulseSlow: "Slow Pulse", pulseFast: "Fast Pulse", pulseNormal: "Normal Pulse",
    obsNoData: "Not enough data. Please accumulate more BP records.",
    obsDanger: "High BP days are frequent. Discuss management with a doctor soon.",
    obsWarning: "Several prehypertension or warning days. Watch salt, sleep, stress, and measure regularly.",
    obsNormal: "Most records are in the stable range. Keep regular measurement and healthy habits.",
    noMiniTrendData: "No trend data", noLongTrendData: "No long-term trend data",
    calendarLegend: "• = logged　Red = high",
    weekdays: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
    errFamilyReadOnly: "Family view is read-only. Use the patient or caregiver app to add records.",
    errInvalidBP: "Please enter valid systolic and diastolic values.",
    errOutOfRange: "BP values out of reasonable range. Please check and try again.",
    errInvalidPulse: "Pulse must be between 30 and 220 bpm.",
    errFamilySync: "Family view is read-only. Sync must be done from patient or caregiver app.",
    errNotAndroid: "Health Connect sync is only supported on Android devices.",
    errIosHealth: "iPhone does not support the Bluetooth blood pressure meter. Enter the reading manually.",
    syncHealth: "Not supported on iPhone",
    meterHintIos: "iPhone does not support the Bluetooth blood pressure meter. Enter the reading manually.",
    errNoHCPackage: "Health Connect package not loaded. Please reinstall the native app.",
    errHCInitFail: "Cannot initialize Health Connect. Please confirm it is installed and enabled.",
    errNoHCPerms: "Health Connect blood pressure read permission not granted.",
    hcNoData: "No syncable BP data in Health Connect (last 30 days). Open Omron Connect first to transfer this reading.",
    syncBusy: "Syncing…",
    hcSyncDoneFn: (imported, pulse, skipped) => `Health Connect sync done: added ${imported}, pulse backfilled ${pulse}, skipped ${skipped}.`,
    hcSyncNoNewFn: (sys, dia, when) => `No new rows. Latest Health Connect reading is already ${sys}/${dia} (${when}). If the cuff shows a different number, open Omron Connect first, then sync again.`,
    hcSyncLatestFn: (sys, dia, when) => `Latest ${sys}/${dia} (${when})`,
    hcSyncErrFn: (msg) => `${msg}. Make sure Omron Connect wrote this reading to Health Connect and that this app can read blood pressure.`,
    periodStats: (days) => `Stats from ${days} recorded days, by daily avg BP category.`,
    highRiskDaysFn: (days, pct) => `High BP risk days: ${days} (${pct}%)`,
    warningDaysFn: (days, pct) => `Prehypertension/warning days: ${days} (${pct}%)`,
    normalDaysFn: (days, pct) => `Normal days: ${days} (${pct}%)`,
    periodSummaryFn: (months) => `${months}-Month Health Summary`,
    moodStressTitle: "BP & Mood Correlation Analysis",
    pulseStressTitle: "Pulse observation",
    observation: "Observation", reference: "Reference",
    moodSourceNote: "Stress may cause temporary BP elevation. Combine with breathing, exercise, sleep, and lifestyle management. This analysis is for reference only.",
    pulseSourceNote: "Sources: AHA All About Heart Rate — most adults rest at 60–100 bpm when sitting/lying and calm. 2018 ACC/AHA/HRS bradycardia guideline uses sinus rate <50 bpm with symptoms as an evaluation cue, not a diagnosis by number alone.",
    recordDays: "Recorded Days", highRisk: "High Risk", warning: "Warning",
    avgPulse: "Avg Pulse", recentPulse: "Recent Pulse",
    logTime: "Time", logBp: "Sys/Dia", logPulse: "Pulse",
    logPage: "{page}/{total}",
    chartSourceNote: "The log follows AHA home BP monitoring (date, time, systolic, diastolic, pulse). The line chart is secondary. Alert 130/80 is from the 2025 AHA/ACC hypertension guideline. Not a diagnosis.",
  },
  id: {
    back: "Kembali", caregiverTitle: "Perawatan TD Pengasuh", caregiverSub: "Sinkronkan, masuk pengganti, dan tugas perawatan harian.",
    patientTitle: "Catatan TD Harian", patientSub: "Sinkron, entri manual, analisis tren & catatan mood",
    familyTitle: "Pantau TD Keluarga", familySub: "Tampilan keluarga 3 bulan terakhir",
    tabMeasure: "Ukur", tabTrend: "Tren", tabDiary: "Diary", tabOverview: "Ringkasan",
    chartGrain1m: "Rata-rata harian", chartGrain3m: "Rata-rata mingguan", chartGrain6m: "Rata-rata 2 minggu", logTitle: "Catatan",
    noRecord: "Belum ada catatan", refresh: "Segarkan", syncHC: "Sinkron dari Health Connect",
    moodStatus: "Suasana Hati", sysBP: "Sistolik", diaBP: "Diastolik", pulse: "Denyut Nadi", mood: "Mood",
    alertNeedsConfirm: "Perlu Konfirmasi Pengasuh", bpAlert: "Peringatan TD",
    currentBP: "TD Perawatan Saat Ini", nextStepLabel: "Langkah Pengasuh Selanjutnya",
    nextCritical: "Segera periksa gejala; hubungi keluarga dan bantu ke dokter jika perlu.",
    nextDanger: "Istirahatkan 5 menit lalu ukur ulang; catat di log.",
    nextWarning: "Terus pantau TD hari ini; perhatikan pusing, lelah, atau cemas.",
    nextStable: "Status stabil. Lanjutkan pengukuran rutin dan sinkron.",
    nextNoData: "Belum ada data TD. Sinkron atau tambah catatan pertama.",
    dailyTasksTitle: "Tugas Perawatan Hari Ini", completed: "selesai",
    taskMorning: "Cek TD Pagi",
    taskMorningLatestFn: (sys, dia) => `Terbaru: ${sys}/${dia} mmHg`,
    taskMorningNew: "Sinkron atau tambahkan TD pertama hari ini.",
    taskMoodTitle: "Catatan Mood",
    taskMoodCurrentFn: (mood) => `Ditandai: ${mood}`,
    taskMoodNew: "Tambahkan mood setelah pengukuran.",
    taskNotify: "Beri Tahu Keluarga", taskNotifyOk: "Tidak perlu notifikasi; lanjutkan pemantauan.",
    taskEvening: "Tinjauan Malam", taskEveningDesc: "Sebelum selesai, pastikan sinkron dan catatan lengkap.",
    syncInput: "Sinkron & Entri Pengganti", caregiverAddTitle: "Entri Manual Pengasuh", saveCaregiver: "Simpan Catatan TD Pengasuh",
    dataSource: "Sumber Data", linkedTo: "Terhubung ke: ", notLinked: "Akun pasien belum terhubung",
    latestSync: "Sinkron TD Terbaru", sourcePrefix: "Sumber: ",
    familyFocus: "Fokus Keluarga", waitForSync: "Menunggu pasien sinkron data TD.",
    familyDashboard: "Dasbor Keluarga", currentStatus: "Status Saat Ini",
    threeMonthAbnormal: "Abnormal 3 Bulan", recordUnit: " catatan",
    familyNextStepLabel: "Langkah Keluarga Selanjutnya", trend3m: "Tren TD Harian 3 Bulan",
    legendSys: "Sistolik", legendDia: "Diastolik", legendLimit: "Batas 130/80",
    summary3m: "Ringkasan TD 3 Bulan",
    avgSysLabel: "Rata-rata Sistolik", avgDiaLabel: "Rata-rata Diastolik",
    maxSysLabel: "Sistolik Maks", minSysLabel: "Sistolik Min",
    totalPrefix: "Total", abnormalSuffix: " catatan, abnormal di bawah.",
    noAbnormal: "Tidak ada catatan TD abnormal.",
    bpLabel: "Tekanan Darah", fiveDayTrend: "Tren 5 Hari", dailyAlert: "Peringatan Harian", avgPrefix: "Rata-rata",
    autoImport: "Impor Otomatis", addRecord: "Tambah Catatan", saveRecord: "Simpan Catatan TD",
    meterHint: "Setelah ukur, kembali ke halaman ini untuk sinkron. Jika tensimeter tidak masuk Health Connect, ketik angkanya.",
    range1m: "1 Bulan", range3m: "3 Bulan", range6m: "6 Bulan",
    bpDiary: "Diary TD", dateRecordsSuffix: " catatan", emptyDay: "Tidak ada catatan TD untuk hari ini",
    pulsePrefix: "Denyut", moodPrefix: "Mood: ",
    levelCritical: "Krisis Hipertensi", levelDanger: "TD Tinggi", levelLow: "TD Rendah",
    levelPrehypertension: "Pra-Hipertensi", levelNormal: "Normal",
    familyLabelCritical: "TD Kritis", familyLabelDanger: "Peringatan TD Tinggi",
    familyLabelLow: "TD Rendah", familyLabelPrehypertension: "Pra-Hipertensi", familyLabelNormal: "Normal",
    recCritical: "Segera hubungi pasien dan pertimbangkan perawatan medis.",
    recDanger: "Periksa kondisi; istirahatkan dan ukur ulang.",
    recLow: "Cek pusing atau lemas; hubungi dokter jika perlu.",
    recPrehypertension: "Tingkatkan frekuensi pemantauan; perhatikan diet dan istirahat.",
    recNormal: "TD stabil. Pertahankan pengukuran dan pencatatan rutin.",
    srcManual: "Entri Manual", srcOldData: "Data Tes Lama", srcCareSystem: "Sistem Perawatan",
    familyNoData: "Menunggu sinkron TD pertama dari pasien.",
    familyCritical: "Segera hubungi pasien untuk perawatan medis.",
    familyDanger: "Minta pasien istirahat dan ukur ulang; beri tahu pengasuh.",
    familyManyAbnormal: "Banyak abnormal dalam 3 bulan. Jadwalkan pemeriksaan rutin.",
    familyNormal: "Terus pantau harian; ingatkan pasien untuk mengukur.",
    adviceNoData: "Belum ada data TD. Sinkron atau tambah secara manual.",
    adviceCritical: "TD ≥180/120 tercatat. Periksa gejala dan pertimbangkan ke dokter.",
    adviceDanger: "TD tinggi baru-baru ini. Ukur ulang dan perhatikan pola tidur, makan, mood.",
    adviceWarning: "Sinyal pra-hipertensi atau TD rendah. Pantau harian.",
    adviceNormal: "Tren TD stabil. Pertahankan pengukuran rutin.",
    moodStressHitFn: (n, total) => `${n} dari ${total} catatan terakhir menunjukkan TD tinggi dengan kecemasan/pusing.`,
    moodStressContinue: "Tag mood tercatat. Terus pantau mood, tidur, dan TD.",
    moodStressEmpty: "Belum cukup tag mood. Tambahkan setelah setiap pengukuran.",
    pulseNoData: "Belum ada data denyut nadi. Sinkron Health Connect akan mencoba mengisinya.",
    pulseOverlapFn: (n) => `${n} catatan menunjukkan denyut tinggi, TD tinggi, dan mood stres. Pantau istirahat.`,
    pulseAvgFn: (avg) => `Rata-rata denyut istirahat ~${avg} bpm.`,
    pulseAdviceFn: (avg) => {
      if (avg < 50) return `Rata-rata denyut istirahat ~${avg} bpm. ACC/AHA/HRS 2018 memakai sinus <50 sebagai salah satu petunjuk evaluasi, bukan diagnosis dari angka saja. Jika pusing, lemas, atau pingsan, ke dokter.`
      if (avg < 60) return `Rata-rata denyut istirahat ~${avg} bpm, di bawah kisaran biasa AHA 60–100. Di bawah 60 belum tentu sakit (obat, tidur, olahraga). Jika tidak nyaman, konsultasikan.`
      if (avg <= 100) return `Rata-rata denyut istirahat ~${avg} bpm, dalam kisaran biasa AHA untuk dewasa: 60–100 bpm saat duduk/berbaring, tenang.`
      return `Rata-rata denyut istirahat ~${avg} bpm, di atas batas biasa AHA 100 bpm. Aktivitas, demam, kafein, atau stres bisa menaikkan. Ukur ulang saat istirahat; jika tetap tinggi atau dada sesak/napas pendek, ke dokter.`
    },
    savedMsgFn: (sys, dia, level) => `Disimpan ${sys}/${dia} mmHg, status: ${level}`,
    pulseUnknown: "Tidak Dicatat", pulseSlow: "Denyut Lambat", pulseFast: "Denyut Cepat", pulseNormal: "Denyut Normal",
    obsNoData: "Data belum cukup. Kumpulkan lebih banyak catatan TD.",
    obsDanger: "Hari TD tinggi terlalu banyak. Diskusikan dengan dokter segera.",
    obsWarning: "Banyak hari pra-hipertensi. Perhatikan garam, tidur, stres.",
    obsNormal: "Sebagian besar catatan stabil. Pertahankan rutinitas.",
    noMiniTrendData: "Belum ada data tren", noLongTrendData: "Belum ada data tren jangka panjang",
    calendarLegend: "Tanggal bertanda memiliki catatan TD. Batas merah = nilai risiko tinggi.",
    weekdays: ["Mi", "Se", "Se", "Ra", "Ka", "Ju", "Sa"],
    errFamilyReadOnly: "Tampilan keluarga hanya baca. Tambah catatan dari app pasien atau pengasuh.",
    errInvalidBP: "Masukkan nilai sistolik dan diastolik yang valid.",
    errOutOfRange: "Nilai TD di luar rentang wajar. Periksa kembali.",
    errInvalidPulse: "Denyut harus antara 30 dan 220 bpm.",
    errFamilySync: "Tampilan keluarga hanya baca. Sinkron dari app pasien atau pengasuh.",
    errNotAndroid: "Sinkron Health Connect hanya didukung di perangkat Android.",
    errIosHealth: "iPhone belum mendukung tensimeter Bluetooth. Masukkan angkanya secara manual.",
    syncHealth: "Tidak didukung di iPhone",
    meterHintIos: "iPhone belum mendukung tensimeter Bluetooth. Masukkan angkanya secara manual.",
    errNoHCPackage: "Paket Health Connect belum dimuat. Pasang ulang app native.",
    errHCInitFail: "Tidak dapat menginisialisasi Health Connect. Pastikan sudah diinstal.",
    errNoHCPerms: "Izin baca TD Health Connect belum diberikan.",
    hcNoData: "Tidak ada data TD yang dapat disinkron di Health Connect (30 hari terakhir). Buka Omron Connect dulu.",
    syncBusy: "Sedang sinkron…",
    hcSyncDoneFn: (imported, pulse, skipped) => `Sinkron selesai: ditambahkan ${imported}, denyut ${pulse}, dilewati ${skipped}.`,
    hcSyncNoNewFn: (sys, dia, when) => `Tidak ada baris baru. Data Health Connect terbaru sudah ${sys}/${dia} (${when}).`,
    hcSyncLatestFn: (sys, dia, when) => `Terbaru ${sys}/${dia} (${when})`,
    hcSyncErrFn: (msg) => `${msg}. Pastikan Omron Connect menulis ke Health Connect dan izin diberikan.`,
    periodStats: (days) => `Statistik dari ${days} hari tercatat, per kategori rata-rata harian.`,
    highRiskDaysFn: (days, pct) => `Hari risiko TD tinggi: ${days} (${pct}%)`,
    warningDaysFn: (days, pct) => `Hari pra-hipertensi/peringatan: ${days} (${pct}%)`,
    normalDaysFn: (days, pct) => `Hari normal: ${days} (${pct}%)`,
    periodSummaryFn: (months) => `Ringkasan Kesehatan ${months} Bulan`,
    moodStressTitle: "Analisis Korelasi TD & Mood",
    pulseStressTitle: "Analisis Denyut & Stres Emosi",
    observation: "Pengamatan", reference: "Referensi",
    moodSourceNote: "Stres dapat menyebabkan lonjakan TD sementara. Kombinasikan dengan pernapasan, olahraga, tidur, dan manajemen gaya hidup.",
    pulseSourceNote: "Denyut nadi istirahat dipengaruhi oleh mood, stres, aktivitas, dan obat-obatan. Amati bersama TD, mood, dan gejala.",
    recordDays: "Hari Tercatat", highRisk: "Risiko Tinggi", warning: "Peringatan",
    avgPulse: "Denyut Rata-rata", recentPulse: "Denyut Terbaru",
    logTime: "Waktu", logBp: "Sistol/Diastol", logPulse: "Denyut",
    logPage: "{page}/{total}",
    chartSourceNote: "Tabel mengikuti pemantauan TD rumah AHA (tanggal, waktu, sistol, diastol, denyut). Grafik garis hanya bantu. Ambang 130/80 dari pedoman hipertensi AHA/ACC 2025. Bukan diagnosis.",
  },
  vi: {
    back: "Quay Lại", caregiverTitle: "Chăm Sóc HA (Người Chăm)", caregiverSub: "Đồng bộ, nhập thay và công việc chăm sóc hàng ngày.",
    patientTitle: "Nhật Ký HA Hàng Ngày", patientSub: "Đồng bộ, nhập tay, phân tích xu hướng & nhật ký tâm trạng",
    familyTitle: "Theo Dõi HA Người Cao Tuổi", familySub: "Chế độ xem gia đình 3 tháng gần nhất",
    tabMeasure: "Đo", tabTrend: "Xu Hướng", tabDiary: "Nhật Ký", tabOverview: "Tổng quan",
    chartGrain1m: "TB theo ngày", chartGrain3m: "TB theo tuần", chartGrain6m: "TB 2 tuần", logTitle: "Nhật ký đo",
    noRecord: "Chưa có dữ liệu", refresh: "Làm Mới", syncHC: "Đồng Bộ Health Connect",
    moodStatus: "Tâm Trạng", sysBP: "Tâm Thu", diaBP: "Tâm Trương", pulse: "Mạch", mood: "Tâm Trạng",
    alertNeedsConfirm: "Cần Xác Nhận Người Chăm", bpAlert: "Cảnh Báo HA",
    currentBP: "HA Chăm Sóc Hiện Tại", nextStepLabel: "Bước Tiếp Theo (Người Chăm)",
    nextCritical: "Ngay lập tức kiểm tra triệu chứng; liên hệ gia đình và hỗ trợ điều trị.",
    nextDanger: "Cho nghỉ 5 phút rồi đo lại; ghi chú vào nhật ký.",
    nextWarning: "Tiếp tục theo dõi HA hôm nay; chú ý chóng mặt, mệt hoặc lo lắng.",
    nextStable: "Trạng thái ổn định. Tiếp tục đo định kỳ và đồng bộ.",
    nextNoData: "Chưa có dữ liệu HA. Vui lòng đồng bộ hoặc thêm dữ liệu đầu tiên.",
    dailyTasksTitle: "Công Việc Chăm Sóc Hôm Nay", completed: "hoàn thành",
    taskMorning: "Kiểm Tra HA Sáng",
    taskMorningLatestFn: (sys, dia) => `Gần nhất: ${sys}/${dia} mmHg`,
    taskMorningNew: "Đồng bộ hoặc thêm HA đầu tiên hôm nay.",
    taskMoodTitle: "Ghi Chú Tâm Trạng",
    taskMoodCurrentFn: (mood) => `Đã đánh dấu: ${mood}`,
    taskMoodNew: "Thêm tâm trạng sau khi đo.",
    taskNotify: "Thông Báo Gia Đình", taskNotifyOk: "Không cần thông báo; tiếp tục theo dõi.",
    taskEvening: "Tổng Kết Buổi Tối", taskEveningDesc: "Trước khi kết thúc, xác nhận đồng bộ và ghi chú.",
    syncInput: "Đồng Bộ & Nhập Thay", caregiverAddTitle: "Người Chăm Nhập Tay", saveCaregiver: "Lưu Dữ Liệu HA Người Chăm",
    dataSource: "Nguồn Dữ Liệu", linkedTo: "Đã kết nối: ", notLinked: "Chưa kết nối tài khoản",
    latestSync: "Đồng Bộ HA Gần Nhất", sourcePrefix: "Nguồn: ",
    familyFocus: "Trọng Tâm Gia Đình", waitForSync: "Đang đợi đồng bộ dữ liệu HA.",
    familyDashboard: "Bảng Điều Khiển Gia Đình", currentStatus: "Trạng Thái Hiện Tại",
    threeMonthAbnormal: "Bất Thường 3 Tháng", recordUnit: " bản ghi",
    familyNextStepLabel: "Bước Tiếp Theo (Gia Đình)", trend3m: "Xu Hướng HA 3 Tháng",
    legendSys: "Tâm Thu", legendDia: "Tâm Trương", legendLimit: "Ngưỡng 130/80",
    summary3m: "Tóm Tắt HA 3 Tháng",
    avgSysLabel: "TB Tâm Thu", avgDiaLabel: "TB Tâm Trương",
    maxSysLabel: "Tâm Thu Tối Đa", minSysLabel: "Tâm Thu Tối Thiểu",
    totalPrefix: "Tổng", abnormalSuffix: " bản ghi, bất thường hiển thị dưới.",
    noAbnormal: "Không có bản ghi HA bất thường.",
    bpLabel: "Huyết Áp", fiveDayTrend: "Xu Hướng 5 Ngày", dailyAlert: "Cảnh Báo Hàng Ngày", avgPrefix: "TB",
    autoImport: "Nhập Tự Động", addRecord: "Thêm Bản Ghi", saveRecord: "Lưu Bản Ghi HA",
    meterHint: "Đo xong quay lại trang này sẽ đồng bộ. Nếu máy không ghi vào Health Connect, nhập số trên màn hình.",
    range1m: "1 Tháng", range3m: "3 Tháng", range6m: "6 Tháng",
    bpDiary: "Nhật Ký HA", dateRecordsSuffix: " bản ghi", emptyDay: "Không có bản ghi HA cho ngày này",
    pulsePrefix: "Mạch", moodPrefix: "Tâm Trạng: ",
    levelCritical: "Khủng Hoảng HA", levelDanger: "HA Cao", levelLow: "HA Thấp",
    levelPrehypertension: "Tiền Tăng HA", levelNormal: "Bình Thường",
    familyLabelCritical: "HA Nguy Kịch", familyLabelDanger: "Cảnh Báo HA Cao",
    familyLabelLow: "HA Thấp", familyLabelPrehypertension: "Tiền Tăng HA", familyLabelNormal: "Bình Thường",
    recCritical: "Liên hệ ngay và đánh giá nhu cầu điều trị y tế.",
    recDanger: "Xác nhận tình trạng; cho nghỉ và đo lại.",
    recLow: "Kiểm tra chóng mặt hoặc yếu; liên hệ bác sĩ nếu cần.",
    recPrehypertension: "Tăng tần suất theo dõi; chú ý chế độ ăn và nghỉ ngơi.",
    recNormal: "HA ổn định. Duy trì đo đạc và ghi chép định kỳ.",
    srcManual: "Nhập Tay", srcOldData: "Dữ Liệu Cũ", srcCareSystem: "Hệ Thống Chăm Sóc",
    familyNoData: "Đang chờ đồng bộ HA đầu tiên.",
    familyCritical: "Liên hệ ngay để đánh giá nhu cầu y tế.",
    familyDanger: "Yêu cầu nghỉ và đo lại; thông báo người chăm.",
    familyManyAbnormal: "Nhiều bất thường trong 3 tháng. Đặt lịch kiểm tra định kỳ.",
    familyNormal: "Tiếp tục theo dõi hàng ngày; nhắc nhở đo khi cần.",
    adviceNoData: "Chưa có dữ liệu HA. Đồng bộ hoặc nhập thủ công.",
    adviceCritical: "HA ≥180/120 được ghi nhận. Kiểm tra triệu chứng ngay.",
    adviceDanger: "HA cao gần đây. Đo lại và theo dõi giấc ngủ, chế độ ăn, tâm trạng.",
    adviceWarning: "Phát hiện tín hiệu tiền tăng HA hoặc HA thấp. Theo dõi hàng ngày.",
    adviceNormal: "Xu hướng HA ổn định. Duy trì đo đạc và lối sống lành mạnh.",
    moodStressHitFn: (n, total) => `${n}/${total} bản ghi cho thấy HA cao kèm lo lắng/chóng mặt.`,
    moodStressContinue: "Đã có ghi chú tâm trạng. Tiếp tục theo dõi tâm trạng, giấc ngủ và HA.",
    moodStressEmpty: "Chưa đủ ghi chú tâm trạng. Thêm sau mỗi lần đo.",
    pulseNoData: "Chưa có dữ liệu mạch. Health Connect sẽ thử điền khi đồng bộ.",
    pulseOverlapFn: (n) => `${n} bản ghi cho thấy mạch nhanh, HA cao và tâm trạng căng thẳng. Theo dõi nghỉ ngơi.`,
    pulseAvgFn: (avg) => `Mạch lúc nghỉ TB gần đây ~${avg} bpm.`,
    pulseAdviceFn: (avg) => {
      if (avg < 50) return `Mạch lúc nghỉ TB ~${avg} bpm. ACC/AHA/HRS 2018 dùng nhịp xoang <50 như một gợi ý đánh giá, không chẩn đoán chỉ bằng số. Nếu chóng mặt, mệt hoặc ngất hãy gặp bác sĩ.`
      if (avg < 60) return `Mạch lúc nghỉ TB ~${avg} bpm, thấp hơn khoảng thường 60–100 của AHA. Dưới 60 chưa chắc bệnh (thuốc, ngủ, tập luyện). Có khó chịu thì nên hỏi bác sĩ.`
      if (avg <= 100) return `Mạch lúc nghỉ TB ~${avg} bpm, nằm trong khoảng thường của AHA cho người lớn: 60–100 bpm khi ngồi/nằm, bình tĩnh.`
      return `Mạch lúc nghỉ TB ~${avg} bpm, cao hơn ngưỡng thường 100 bpm của AHA. Vận động, sốt, caffeine hoặc căng thẳng có thể làm tăng. Đo lại khi nghỉ; nếu vẫn cao hoặc tức ngực/khó thở hãy gặp bác sĩ.`
    },
    savedMsgFn: (sys, dia, level) => `Đã lưu ${sys}/${dia} mmHg, trạng thái: ${level}`,
    pulseUnknown: "Không Ghi Nhận", pulseSlow: "Mạch Chậm", pulseFast: "Mạch Nhanh", pulseNormal: "Mạch Bình Thường",
    obsNoData: "Dữ liệu chưa đủ. Cần thêm bản ghi HA.",
    obsDanger: "Tỷ lệ ngày HA cao quá lớn. Thảo luận với bác sĩ sớm.",
    obsWarning: "Nhiều ngày tiền tăng HA. Chú ý muối, giấc ngủ, căng thẳng.",
    obsNormal: "Hầu hết các bản ghi đều ổn định. Tiếp tục duy trì.",
    noMiniTrendData: "Chưa có dữ liệu xu hướng", noLongTrendData: "Chưa có dữ liệu xu hướng dài hạn",
    calendarLegend: "Ngày có đánh dấu có bản ghi HA. Viền đỏ = giá trị nguy cơ cao.",
    weekdays: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
    errFamilyReadOnly: "Chế độ gia đình chỉ đọc. Thêm từ app người cao tuổi hoặc người chăm.",
    errInvalidBP: "Vui lòng nhập giá trị tâm thu và tâm trương hợp lệ.",
    errOutOfRange: "Giá trị HA ngoài phạm vi hợp lý. Kiểm tra lại.",
    errInvalidPulse: "Mạch phải từ 30 đến 220 bpm.",
    errFamilySync: "Chế độ gia đình chỉ đọc. Đồng bộ từ app người cao tuổi hoặc người chăm.",
    errNotAndroid: "Đồng bộ Health Connect chỉ hỗ trợ thiết bị Android.",
    errIosHealth: "iPhone chưa hỗ trợ máy đo huyết áp Bluetooth. Hãy nhập số thủ công.",
    syncHealth: "iPhone chưa hỗ trợ",
    meterHintIos: "iPhone chưa hỗ trợ máy đo huyết áp Bluetooth. Hãy nhập số thủ công.",
    errNoHCPackage: "Gói Health Connect chưa được tải. Cài lại app native.",
    errHCInitFail: "Không thể khởi tạo Health Connect. Đảm bảo đã cài và bật.",
    errNoHCPerms: "Chưa cấp quyền đọc HA từ Health Connect.",
    hcNoData: "Không có dữ liệu HA có thể đồng bộ trong Health Connect (30 ngày qua). Hãy mở Omron Connect trước.",
    syncBusy: "Đang đồng bộ…",
    hcSyncDoneFn: (imported, pulse, skipped) => `Đồng bộ xong: đã thêm ${imported}, mạch ${pulse}, bỏ qua ${skipped}.`,
    hcSyncNoNewFn: (sys, dia, when) => `Không có dòng mới. Health Connect mới nhất đã là ${sys}/${dia} (${when}).`,
    hcSyncLatestFn: (sys, dia, when) => `Mới nhất ${sys}/${dia} (${when})`,
    hcSyncErrFn: (msg) => `${msg}. Đảm bảo Omron Connect ghi vào Health Connect và cấp quyền.`,
    periodStats: (days) => `Thống kê từ ${days} ngày có bản ghi, theo danh mục HA TB hàng ngày.`,
    highRiskDaysFn: (days, pct) => `Ngày nguy cơ HA cao: ${days} (${pct}%)`,
    warningDaysFn: (days, pct) => `Ngày tiền tăng HA/cảnh báo: ${days} (${pct}%)`,
    normalDaysFn: (days, pct) => `Ngày bình thường: ${days} (${pct}%)`,
    periodSummaryFn: (months) => `Tóm Tắt Sức Khỏe ${months} Tháng`,
    moodStressTitle: "Phân Tích Tương Quan HA & Tâm Trạng",
    pulseStressTitle: "Quan sát mạch",
    observation: "Quan Sát", reference: "Tham Khảo",
    moodSourceNote: "Căng thẳng có thể gây tăng HA tạm thời. Kết hợp với hơi thở, vận động, giấc ngủ và quản lý lối sống.",
    pulseSourceNote: "Nguồn: AHA — mạch lúc nghỉ của hầu hết người lớn 60–100 bpm khi ngồi/nằm, bình tĩnh. Hướng dẫn ACC/AHA/HRS 2018 dùng nhịp xoang <50 kèm triệu chứng để đánh giá, không chẩn đoán chỉ bằng con số.",
    recordDays: "Ngày Có Bản Ghi", highRisk: "Nguy Cơ Cao", warning: "Cảnh Báo",
    avgPulse: "Mạch TB", recentPulse: "Mạch Gần Nhất",
    logTime: "Thời gian", logBp: "Tâm thu/Tâm trương", logPulse: "Mạch",
    logPage: "{page}/{total}",
    chartSourceNote: "Bảng theo nhật ký HA tại nhà của AHA (ngày, giờ, tâm thu, tâm trương, mạch). Biểu đồ đường chỉ phụ. Ngưỡng 130/80 theo hướng dẫn tăng huyết áp AHA/ACC 2025. Không phải chẩn đoán.",
  },
  tl: {
    back: "Bumalik", caregiverTitle: "Pag-aalaga ng BP", caregiverSub: "I-sync, proxy entry, at mga gawain sa pag-aalaga.",
    patientTitle: "Araw-araw na Talaan ng BP", patientSub: "Sync, manu-manong entry, pagsusuri ng trend at mood diary",
    familyTitle: "Subaybayan ang BP ng Pasyente", familySub: "Tingnan ng pamilya ang nakalipas na 3 buwan",
    tabMeasure: "Sukatin", tabTrend: "Trend", tabDiary: "Talaarawan", tabOverview: "Pangkalahatan",
    chartGrain1m: "Daily average", chartGrain3m: "Weekly average", chartGrain6m: "Biweekly average", logTitle: "Readings",
    noRecord: "Wala pang talaan", refresh: "I-refresh", syncHC: "I-sync mula sa Health Connect",
    moodStatus: "Mood", sysBP: "Systolic", diaBP: "Diastolic", pulse: "Pulso", mood: "Mood",
    alertNeedsConfirm: "Kailangan ng Kumpirmasyon ng Tagapag-alaga", bpAlert: "Babala ng BP",
    currentBP: "Kasalukuyang BP ng Pag-aalaga", nextStepLabel: "Susunod na Hakbang (Tagapag-alaga)",
    nextCritical: "Agad na suriin ang sintomas; makipag-ugnayan sa pamilya at tulungan sa medikal kung kailangan.",
    nextDanger: "Pahintulutan ng 5 minuto pagkatapos sukatin muli; itala sa log.",
    nextWarning: "Patuloy na subaybayan ang BP ngayon; bantayan ang pagkahilo, pagod, o pagkabalisa.",
    nextStable: "Matatag ang kalagayan. Ipagpatuloy ang regular na pagsukat at sync.",
    nextNoData: "Wala pang data ng BP. Mag-sync o magdagdag ng unang talaan.",
    dailyTasksTitle: "Mga Gawain sa Pag-aalaga Ngayon", completed: "nakumpleto",
    taskMorning: "Pagsusuri ng BP sa Umaga",
    taskMorningLatestFn: (sys, dia) => `Pinakabago: ${sys}/${dia} mmHg`,
    taskMorningNew: "Mag-sync o magdagdag ng unang BP ngayon.",
    taskMoodTitle: "Tala ng Mood",
    taskMoodCurrentFn: (mood) => `Minarkahan: ${mood}`,
    taskMoodNew: "Magdagdag ng mood pagkatapos sukatin.",
    taskNotify: "Abisuhan ang Pamilya", taskNotifyOk: "Hindi kailangan ng abiso; ipagpatuloy ang pagmamanman.",
    taskEvening: "Pagsusuri sa Gabi", taskEveningDesc: "Bago matapos, kumpirmahin ang sync at mga tala.",
    syncInput: "Sync at Proxy Entry", caregiverAddTitle: "Mano-manong Entry ng Tagapag-alaga", saveCaregiver: "I-save ang Talaan ng BP ng Tagapag-alaga",
    dataSource: "Pinagmulan ng Data", linkedTo: "Nakakonekta sa: ", notLinked: "Walang konektadong account ng pasyente",
    latestSync: "Pinakabagong BP Sync", sourcePrefix: "Pinagmulan: ",
    familyFocus: "Pokus ng Pamilya", waitForSync: "Naghihintay ng sync ng BP mula sa pasyente.",
    familyDashboard: "Dashboard ng Pamilya", currentStatus: "Kasalukuyang Kalagayan",
    threeMonthAbnormal: "Hindi Normal sa 3 Buwan", recordUnit: " talaan",
    familyNextStepLabel: "Susunod na Hakbang (Pamilya)", trend3m: "Trend ng BP sa 3 Buwan",
    legendSys: "Systolic", legendDia: "Diastolic", legendLimit: "Limitasyon 130/80",
    summary3m: "Buod ng BP sa 3 Buwan",
    avgSysLabel: "Avg Systolic", avgDiaLabel: "Avg Diastolic",
    maxSysLabel: "Max Systolic", minSysLabel: "Min Systolic",
    totalPrefix: "Kabuuan", abnormalSuffix: " talaan, hindi normal ay ipinapakita sa ibaba.",
    noAbnormal: "Walang hindi normal na talaan ng BP.",
    bpLabel: "Blood Pressure", fiveDayTrend: "Trend sa 5 Araw", dailyAlert: "Araw-araw na Babala", avgPrefix: "Avg",
    autoImport: "Auto Import", addRecord: "Magdagdag ng Talaan", saveRecord: "I-save ang Talaan ng BP",
    meterHint: "Pagkatapos mag-measure, bumalik dito para i-sync. Kung hindi pumasok sa Health Connect, i-type ang numero.",
    range1m: "1 Buwan", range3m: "3 Buwan", range6m: "6 Buwan",
    bpDiary: "Talaarawan ng BP", dateRecordsSuffix: " talaan", emptyDay: "Walang talaan ng BP para sa araw na ito",
    pulsePrefix: "Pulso", moodPrefix: "Mood: ",
    levelCritical: "Krisis ng Hypertension", levelDanger: "Mataas na BP", levelLow: "Mababang BP",
    levelPrehypertension: "Pre-hypertension", levelNormal: "Normal",
    familyLabelCritical: "Kritikal na BP", familyLabelDanger: "Babala ng Mataas na BP",
    familyLabelLow: "Mababang BP", familyLabelPrehypertension: "Pre-hypertension", familyLabelNormal: "Normal",
    recCritical: "Makipag-ugnayan agad at suriin ang pangangailangan sa medikal.",
    recDanger: "Kumpirmahin ang kalagayan; magpahinga at sukatin muli.",
    recLow: "Suriin ang pagkahilo o kahinaan; makipag-ugnayan sa doktor kung kailangan.",
    recPrehypertension: "Dagdagan ang dalas ng pagmamanman; bantayan ang diyeta at pahinga.",
    recNormal: "Matatag ang BP. Panatilihin ang regular na pagsukat at pagtatala.",
    srcManual: "Mano-manong Entry", srcOldData: "Lumang Test Data", srcCareSystem: "Care System",
    familyNoData: "Naghihintay ng unang BP sync mula sa pasyente.",
    familyCritical: "Makipag-ugnayan agad para sa pangangailangang medikal.",
    familyDanger: "Humingi ng pahinga at sukatin muli; abisuhan ang tagapag-alaga.",
    familyManyAbnormal: "Maraming hindi normal sa 3 buwan. Mag-iskedyul ng regular na pagsusuri.",
    familyNormal: "Ipagpatuloy ang araw-araw na pagmamanman; paalalahanin na sukatin.",
    adviceNoData: "Wala pang data ng BP. Mag-sync o mano-manong magdagdag.",
    adviceCritical: "BP ≥180/120 natala. Suriin ang sintomas agad.",
    adviceDanger: "Kamakailang mataas na BP. Sukatin muli at bantayan ang tulog, pagkain, mood.",
    adviceWarning: "Senyales ng pre-hypertension o mababang BP. Araw-araw na pagmamanman.",
    adviceNormal: "Matatag ang trend ng BP. Panatilihin ang regular na pagsukat.",
    moodStressHitFn: (n, total) => `${n}/${total} talaan ay nagpapakita ng mataas na BP na may pagkabalisa/pagkahilo.`,
    moodStressContinue: "May mga mood tag. Patuloy na subaybayan ang mood, tulog, at BP.",
    moodStressEmpty: "Hindi pa sapat na mood tags. Magdagdag pagkatapos ng bawat pagsukat.",
    pulseNoData: "Wala pang data ng pulso. Susubukan ng Health Connect sync na punan ito.",
    pulseOverlapFn: (n) => `${n} talaan ay nagpapakita ng mabilis na pulso, mataas na BP, at stress mood. Bantayan ang pahinga.`,
    pulseAvgFn: (avg) => `Average resting pulse ~${avg} bpm.`,
    pulseAdviceFn: (avg) => {
      if (avg < 50) return `Average resting pulse ~${avg} bpm. ACC/AHA/HRS 2018 uses sinus rate <50 as one evaluation cue, not a diagnosis by number alone. See a doctor if dizzy, weak, or fainting.`
      if (avg < 60) return `Average resting pulse ~${avg} bpm, below the usual AHA range of 60–100. Below 60 is not always illness (medicine, sleep, exercise). Consult if unwell.`
      if (avg <= 100) return `Average resting pulse ~${avg} bpm, within the usual AHA adult range of 60–100 bpm when sitting/lying and calm.`
      return `Average resting pulse ~${avg} bpm, above the usual AHA limit of 100 bpm. Activity, fever, caffeine, or stress can raise it. Recheck at rest; see a doctor if it stays high or there is chest tightness/shortness of breath.`
    },
    savedMsgFn: (sys, dia, level) => `Na-save ${sys}/${dia} mmHg, status: ${level}`,
    pulseUnknown: "Hindi Naitala", pulseSlow: "Mabagal na Pulso", pulseFast: "Mabilis na Pulso", pulseNormal: "Normal na Pulso",
    obsNoData: "Hindi pa sapat ang data. Mangailangan ng mas maraming talaan ng BP.",
    obsDanger: "Masyadong maraming araw ng mataas na BP. Kumonsulta sa doktor.",
    obsWarning: "Maraming araw na pre-hypertension. Bantayan ang asin, tulog, stress.",
    obsNormal: "Karamihan sa mga talaan ay matatag. Ipagpatuloy ang rutina.",
    noMiniTrendData: "Walang data ng trend", noLongTrendData: "Walang data ng pangmatagalang trend",
    calendarLegend: "Minarkahang petsa ay may talaan ng BP. Pulang hangganan = mataas na panganib.",
    weekdays: ["Li", "Lu", "Ma", "Mi", "Hu", "Bi", "Sa"],
    errFamilyReadOnly: "Read-only ang view ng pamilya. Magdagdag mula sa app ng pasyente o tagapag-alaga.",
    errInvalidBP: "Mangyaring magpasok ng wastong systolic at diastolic na halaga.",
    errOutOfRange: "Ang mga halaga ng BP ay wala sa makatwirang hanay. Suriin muli.",
    errInvalidPulse: "Ang pulso ay dapat na nasa pagitan ng 30 at 220 bpm.",
    errFamilySync: "Read-only ang view ng pamilya. I-sync mula sa app ng pasyente o tagapag-alaga.",
    errNotAndroid: "Ang Health Connect sync ay sinusuportahan lamang sa Android.",
    errIosHealth: "Hindi sinusuportahan ng iPhone ang Bluetooth na BP meter. I-type muna ang numero.",
    syncHealth: "Hindi available sa iPhone",
    meterHintIos: "Hindi sinusuportahan ng iPhone ang Bluetooth na BP meter. I-type muna ang numero.",
    errNoHCPackage: "Hindi na-load ang pakete ng Health Connect. Muling i-install ang native app.",
    errHCInitFail: "Hindi mapasimulan ang Health Connect. Tiyaking naka-install at naka-enable.",
    errNoHCPerms: "Hindi pa ibinibigay ang pahintulot sa pagbabasa ng BP mula sa Health Connect.",
    hcNoData: "Walang data ng BP na maaaring i-sync sa Health Connect (nakalipas na 30 araw). Buksan muna ang Omron Connect.",
    syncBusy: "Sini-sync…",
    hcSyncDoneFn: (imported, pulse, skipped) => `Sync tapos na: naidagdag ${imported}, pulso ${pulse}, nilaktawan ${skipped}.`,
    hcSyncNoNewFn: (sys, dia, when) => `Walang bagong tala. Pinakabago sa Health Connect ay ${sys}/${dia} (${when}).`,
    hcSyncLatestFn: (sys, dia, when) => `Pinakabago ${sys}/${dia} (${when})`,
    hcSyncErrFn: (msg) => `${msg}. Tiyaking nagsusulat ang Omron Connect sa Health Connect at may pahintulot.`,
    periodStats: (days) => `Istatistika mula sa ${days} na naitala na araw, ayon sa kategorya ng avg na BP sa bawat araw.`,
    highRiskDaysFn: (days, pct) => `Mga araw na may mataas na panganib ng BP: ${days} (${pct}%)`,
    warningDaysFn: (days, pct) => `Mga araw ng pre-hypertension/babala: ${days} (${pct}%)`,
    normalDaysFn: (days, pct) => `Mga normal na araw: ${days} (${pct}%)`,
    periodSummaryFn: (months) => `Buod ng Kalusugan ng ${months} Buwan`,
    moodStressTitle: "Pagsusuri ng Ugnayan ng BP at Mood",
    pulseStressTitle: "Pagsusuri ng Pulso at Emosyonal na Stress",
    observation: "Pagmamasid", reference: "Sanggunian",
    moodSourceNote: "Maaaring magdulot ng pansamantalang pagtaas ng BP ang stress. Pagsamahin sa paghinga, ehersisyo, tulog, at pamamahala ng pamumuhay.",
    pulseSourceNote: "Ang pulso sa pahinga ay naaapektuhan ng mood, stress, aktibidad, at gamot. Obserbahin kasama ang BP, mood, at sintomas.",
    recordDays: "Naitala na Mga Araw", highRisk: "Mataas na Panganib", warning: "Babala",
    avgPulse: "Avg na Pulso", recentPulse: "Pinakabagong Pulso",
    logTime: "Oras", logBp: "Sys/Dia", logPulse: "Pulso",
    logPage: "{page}/{total}",
    chartSourceNote: "Ang talaan ay sumusunod sa AHA home BP (petsa, oras, systolic, diastolic, pulso). Ang line chart ay pantulong. Ang 130/80 ay mula sa 2025 AHA/ACC hypertension guideline. Hindi diagnosis.",
  },
  th: {
    back: "กลับ", caregiverTitle: "ดูแลความดันโลหิต (ผู้ดูแล)", caregiverSub: "ซิงค์ บันทึกแทน และงานดูแลรายวัน",
    patientTitle: "บันทึกความดันโลหิตรายวัน", patientSub: "ซิงค์ บันทึกด้วยตนเอง วิเคราะห์แนวโน้ม และไดอารี่อารมณ์",
    familyTitle: "ติดตามความดันโลหิตผู้สูงอายุ", familySub: "มุมมองครอบครัว 3 เดือนล่าสุด",
    tabMeasure: "วัด", tabTrend: "แนวโน้ม", tabDiary: "ไดอารี่", tabOverview: "ภาพรวม",
    chartGrain1m: "ค่าเฉลี่ยรายวัน", chartGrain3m: "ค่าเฉลี่ยรายสัปดาห์", chartGrain6m: "ค่าเฉลี่ย 2 สัปดาห์", logTitle: "บันทึก",
    noRecord: "ยังไม่มีบันทึก", refresh: "รีเฟรช", syncHC: "ซิงค์จาก Health Connect",
    moodStatus: "อารมณ์", sysBP: "ซิสโตลิก", diaBP: "ไดแอสโตลิก", pulse: "ชีพจร", mood: "อารมณ์",
    alertNeedsConfirm: "ต้องการการยืนยันจากผู้ดูแล", bpAlert: "แจ้งเตือนความดันโลหิต",
    currentBP: "ความดันโลหิตปัจจุบัน", nextStepLabel: "ขั้นตอนถัดไป (ผู้ดูแล)",
    nextCritical: "ตรวจสอบอาการทันที ติดต่อครอบครัวและช่วยรับการรักษาหากจำเป็น",
    nextDanger: "ให้พักผ่อน 5 นาทีแล้ววัดซ้ำ บันทึกในบันทึกการดูแล",
    nextWarning: "ติดตามความดันโลหิตวันนี้ต่อไป ระวังอาการวิงเวียน อ่อนเพลีย หรือวิตกกังวล",
    nextStable: "สถานะคงที่ วัดและซิงค์ตามปกติ",
    nextNoData: "ยังไม่มีข้อมูลความดันโลหิต กรุณาซิงค์หรือเพิ่มบันทึกแรก",
    dailyTasksTitle: "งานดูแลวันนี้", completed: "เสร็จแล้ว",
    taskMorning: "ตรวจความดันโลหิตตอนเช้า",
    taskMorningLatestFn: (sys, dia) => `ล่าสุด: ${sys}/${dia} mmHg`,
    taskMorningNew: "ซิงค์หรือเพิ่มความดันโลหิตแรกของวันนี้",
    taskMoodTitle: "บันทึกอารมณ์",
    taskMoodCurrentFn: (mood) => `ทำเครื่องหมาย: ${mood}`,
    taskMoodNew: "เพิ่มอารมณ์หลังการวัด",
    taskNotify: "แจ้งครอบครัว", taskNotifyOk: "ไม่จำเป็นต้องแจ้ง ติดตามต่อไป",
    taskEvening: "ทบทวนตอนเย็น", taskEveningDesc: "ก่อนสิ้นสุด ยืนยันการซิงค์และบันทึก",
    syncInput: "ซิงค์และบันทึกแทน", caregiverAddTitle: "ผู้ดูแลบันทึกด้วยตนเอง", saveCaregiver: "บันทึกข้อมูลความดันโลหิตของผู้ดูแล",
    dataSource: "แหล่งข้อมูล", linkedTo: "เชื่อมต่อกับ: ", notLinked: "ยังไม่ได้เชื่อมต่อบัญชีผู้ป่วย",
    latestSync: "ซิงค์ความดันโลหิตล่าสุด", sourcePrefix: "แหล่งที่มา: ",
    familyFocus: "จุดสนใจครอบครัว", waitForSync: "รอการซิงค์ข้อมูลความดันโลหิต",
    familyDashboard: "แดชบอร์ดครอบครัว", currentStatus: "สถานะปัจจุบัน",
    threeMonthAbnormal: "ผิดปกติ 3 เดือน", recordUnit: " บันทึก",
    familyNextStepLabel: "ขั้นตอนถัดไป (ครอบครัว)", trend3m: "แนวโน้มความดันโลหิตรายวัน 3 เดือน",
    legendSys: "ซิสโตลิก", legendDia: "ไดแอสโตลิก", legendLimit: "เกณฑ์ 130/80",
    summary3m: "สรุปความดันโลหิต 3 เดือน",
    avgSysLabel: "ซิสโตลิกเฉลี่ย", avgDiaLabel: "ไดแอสโตลิกเฉลี่ย",
    maxSysLabel: "ซิสโตลิกสูงสุด", minSysLabel: "ซิสโตลิกต่ำสุด",
    totalPrefix: "รวม", abnormalSuffix: " บันทึก ผิดปกติแสดงด้านล่าง",
    noAbnormal: "ไม่มีบันทึกความดันโลหิตที่ผิดปกติ",
    bpLabel: "ความดันโลหิต", fiveDayTrend: "แนวโน้ม 5 วัน", dailyAlert: "แจ้งเตือนรายวัน", avgPrefix: "เฉลี่ย",
    autoImport: "นำเข้าอัตโนมัติ", addRecord: "เพิ่มบันทึก", saveRecord: "บันทึกข้อมูลความดันโลหิต",
    meterHint: "วัดเสร็จแล้วกลับมาหน้านี้จะซิงค์เอง ถ้าเครื่องไม่เข้า Health Connect ให้กรอกตัวเลขบนจอ",
    range1m: "1 เดือน", range3m: "3 เดือน", range6m: "6 เดือน",
    bpDiary: "ไดอารี่ความดันโลหิต", dateRecordsSuffix: " บันทึก", emptyDay: "ไม่มีบันทึกความดันโลหิตสำหรับวันนี้",
    pulsePrefix: "ชีพจร", moodPrefix: "อารมณ์: ",
    levelCritical: "วิกฤตความดันโลหิต", levelDanger: "ความดันโลหิตสูง", levelLow: "ความดันโลหิตต่ำ",
    levelPrehypertension: "ก่อนความดันโลหิตสูง", levelNormal: "ปกติ",
    familyLabelCritical: "ความดันโลหิตวิกฤต", familyLabelDanger: "แจ้งเตือนความดันโลหิตสูง",
    familyLabelLow: "ความดันโลหิตต่ำ", familyLabelPrehypertension: "ก่อนความดันโลหิตสูง", familyLabelNormal: "ปกติ",
    recCritical: "ติดต่อทันทีและประเมินความจำเป็นในการรักษาพยาบาล",
    recDanger: "ยืนยันสภาพ พักและวัดซ้ำ",
    recLow: "ตรวจสอบอาการวิงเวียนหรืออ่อนแรง ติดต่อแพทย์หากจำเป็น",
    recPrehypertension: "เพิ่มความถี่ในการติดตาม ดูแลอาหารและการพักผ่อน",
    recNormal: "ความดันโลหิตคงที่ รักษาการวัดและบันทึกสม่ำเสมอ",
    srcManual: "บันทึกด้วยตนเอง", srcOldData: "ข้อมูลทดสอบเก่า", srcCareSystem: "ระบบดูแล",
    familyNoData: "รอการซิงค์ความดันโลหิตแรก",
    familyCritical: "ติดต่อทันทีเพื่อประเมินความต้องการทางการแพทย์",
    familyDanger: "ให้พักและวัดซ้ำ แจ้งผู้ดูแล",
    familyManyAbnormal: "ผิดปกติหลายครั้งใน 3 เดือน นัดตรวจสม่ำเสมอ",
    familyNormal: "ติดตามรายวัน เตือนให้วัดเมื่อจำเป็น",
    adviceNoData: "ยังไม่มีข้อมูลความดันโลหิต ซิงค์หรือเพิ่มด้วยตนเอง",
    adviceCritical: "บันทึก BP ≥180/120 ตรวจสอบอาการทันที",
    adviceDanger: "ความดันโลหิตสูงเร็วๆ นี้ วัดซ้ำและดูรูปแบบการนอน อาหาร อารมณ์",
    adviceWarning: "พบสัญญาณก่อนความดันโลหิตสูงหรือต่ำ ติดตามรายวัน",
    adviceNormal: "แนวโน้มความดันโลหิตคงที่ รักษาการวัดสม่ำเสมอ",
    moodStressHitFn: (n, total) => `${n}/${total} บันทึกแสดงความดันโลหิตสูงพร้อมความวิตกกังวล/วิงเวียน`,
    moodStressContinue: "มีการบันทึกอารมณ์แล้ว ติดตามอารมณ์ การนอน และความดันโลหิตต่อไป",
    moodStressEmpty: "ยังไม่มีการบันทึกอารมณ์เพียงพอ เพิ่มหลังการวัดแต่ละครั้ง",
    pulseNoData: "ยังไม่มีข้อมูลชีพจร Health Connect จะพยายามเติมเมื่อซิงค์",
    pulseOverlapFn: (n) => `${n} บันทึกแสดงชีพจรเร็ว ความดันโลหิตสูง และอารมณ์เครียด ดูแลการพักผ่อน`,
    pulseAvgFn: (avg) => `ชีพจรขณะพักเฉลี่ย ~${avg} bpm`,
    pulseAdviceFn: (avg) => {
      if (avg < 50) return `ชีพจรขณะพักเฉลี่ย ~${avg} bpm ตามแนวทาง ACC/AHA/HRS 2018 อัตราไซนัส <50 เป็นเพียงหนึ่งในสัญญาณประเมิน ไม่ใช่การวินิจฉัยจากตัวเลขอย่างเดียว หากเวียนหัว อ่อนแรง หรือเป็นลม ให้พบแพทย์`
      if (avg < 60) return `ชีพจรขณะพักเฉลี่ย ~${avg} bpm ต่ำกว่าช่วงปกติของ AHA 60–100 ค่าต่ำกว่า 60 ไม่ได้แปลว่าป่วยเสมอ (ยา การนอน ออกกำลังกาย) หากไม่สบายตัวควรปรึกษาแพทย์`
      if (avg <= 100) return `ชีพจรขณะพักเฉลี่ย ~${avg} bpm อยู่ในช่วงปกติของสมาคมหัวใจอเมริกัน (AHA) สำหรับผู้ใหญ่: 60–100 bpm เมื่อนั่งหรือนอน ใจเย็น ไม่มีอาการ`
      return `ชีพจรขณะพักเฉลี่ย ~${avg} bpm สูงกว่าเพดานปกติ 100 bpm ของ AHA กิจกรรม ไข้ คาเฟอีน หรือความเครียดอาจทำให้สูงขึ้น วัดซ้ำตอนพัก หากยังสูงหรือแน่นหน้าอก/หายใจลำบาก ให้พบแพทย์`
    },
    savedMsgFn: (sys, dia, level) => `บันทึกแล้ว ${sys}/${dia} mmHg สถานะ: ${level}`,
    pulseUnknown: "ไม่ได้บันทึก", pulseSlow: "ชีพจรช้า", pulseFast: "ชีพจรเร็ว", pulseNormal: "ชีพจรปกติ",
    obsNoData: "ข้อมูลไม่เพียงพอ สะสมบันทึกความดันโลหิตเพิ่มเติม",
    obsDanger: "วันที่ความดันโลหิตสูงมีสัดส่วนสูง ปรึกษาแพทย์เร็วๆ นี้",
    obsWarning: "หลายวันก่อนความดันโลหิตสูง ดูแลเกลือ การนอน ความเครียด",
    obsNormal: "ส่วนใหญ่บันทึกอยู่ในเกณฑ์คงที่ รักษาวิถีชีวิตที่ดี",
    noMiniTrendData: "ยังไม่มีข้อมูลแนวโน้ม", noLongTrendData: "ยังไม่มีข้อมูลแนวโน้มระยะยาว",
    calendarLegend: "วันที่มีเครื่องหมายมีบันทึกความดันโลหิต กรอบสีแดง = ค่าความเสี่ยงสูง",
    weekdays: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"],
    errFamilyReadOnly: "มุมมองครอบครัวเป็นแบบอ่านอย่างเดียว เพิ่มจากแอปผู้ป่วยหรือผู้ดูแล",
    errInvalidBP: "กรุณาใส่ค่าซิสโตลิกและไดแอสโตลิกที่ถูกต้อง",
    errOutOfRange: "ค่าความดันโลหิตอยู่นอกช่วงที่สมเหตุสมผล ตรวจสอบอีกครั้ง",
    errInvalidPulse: "ชีพจรต้องอยู่ระหว่าง 30 ถึง 220 bpm",
    errFamilySync: "มุมมองครอบครัวเป็นแบบอ่านอย่างเดียว ซิงค์จากแอปผู้ป่วยหรือผู้ดูแล",
    errNotAndroid: "การซิงค์ Health Connect รองรับเฉพาะ Android เท่านั้น",
    errIosHealth: "iPhone ยังไม่รองรับเครื่องวัดความดัน Bluetooth กรอกตัวเลขเอง",
    syncHealth: "iPhone ยังไม่รองรับ",
    meterHintIos: "iPhone ยังไม่รองรับเครื่องวัดความดัน Bluetooth กรอกตัวเลขเอง",
    errNoHCPackage: "แพ็คเกจ Health Connect ยังไม่โหลด ติดตั้งแอป native ใหม่",
    errHCInitFail: "ไม่สามารถเริ่มต้น Health Connect ตรวจสอบว่าติดตั้งและเปิดใช้งานแล้ว",
    errNoHCPerms: "ยังไม่ได้รับอนุญาตอ่านความดันโลหิตจาก Health Connect",
    hcNoData: "ไม่มีข้อมูลความดันโลหิตที่ซิงค์ได้ใน Health Connect (30 วันที่ผ่านมา) เปิด Omron Connect ก่อน",
    syncBusy: "กำลังซิงค์…",
    hcSyncDoneFn: (imported, pulse, skipped) => `ซิงค์เสร็จ: เพิ่ม ${imported} รายการ ชีพจร ${pulse} รายการ ข้าม ${skipped} รายการ`,
    hcSyncNoNewFn: (sys, dia, when) => `ไม่มีรายการใหม่ ค่าล่าสุดใน Health Connect คือ ${sys}/${dia} (${when})`,
    hcSyncLatestFn: (sys, dia, when) => `ล่าสุด ${sys}/${dia} (${when})`,
    hcSyncErrFn: (msg) => `${msg} ตรวจสอบว่า Omron Connect เขียนข้อมูลลง Health Connect และมีการอนุญาต`,
    periodStats: (days) => `สถิติจาก ${days} วันที่มีบันทึก ตามหมวดหมู่ค่าเฉลี่ยรายวัน`,
    highRiskDaysFn: (days, pct) => `วันที่มีความเสี่ยงสูง: ${days} วัน (${pct}%)`,
    warningDaysFn: (days, pct) => `วันก่อนความดันโลหิตสูง/แจ้งเตือน: ${days} วัน (${pct}%)`,
    normalDaysFn: (days, pct) => `วันปกติ: ${days} วัน (${pct}%)`,
    periodSummaryFn: (months) => `สรุปสุขภาพ ${months} เดือน`,
    moodStressTitle: "การวิเคราะห์ความสัมพันธ์ระหว่างความดันโลหิตและอารมณ์",
    pulseStressTitle: "การวิเคราะห์ชีพจรและความเครียดทางอารมณ์",
    observation: "การสังเกต", reference: "อ้างอิง",
    moodSourceNote: "ความเครียดอาจทำให้ความดันโลหิตสูงชั่วคราว ควรผสมผสานกับการหายใจ การออกกำลังกาย การนอน และการจัดการวิถีชีวิต",
    pulseSourceNote: "ชีพจรขณะพักได้รับผลจากอารมณ์ ความเครียด กิจกรรม และยา ควรสังเกตร่วมกับความดันโลหิต อารมณ์ และอาการ",
    recordDays: "วันที่มีบันทึก", highRisk: "ความเสี่ยงสูง", warning: "คำเตือน",
    avgPulse: "ชีพจรเฉลี่ย", recentPulse: "ชีพจรล่าสุด",
    logTime: "เวลา", logBp: "ตัวบน/ตัวล่าง", logPulse: "ชีพจร",
    logPage: "{page}/{total}",
    chartSourceNote: "ตารางตามบันทึกความดันที่บ้านของ AHA (วันที่ เวลา ตัวบน ตัวล่าง ชีพจร) กราฟเส้นเป็นแนวโน้มเสริม เกณฑ์ 130/80 ตามแนวทางความดันโลหิตสูง AHA/ACC 2025 ไม่ใช่การวินิจฉัย",
  },
}

function getAndroidHealthConnect() {
  if (Platform.OS !== "android") return null
  try {
    return require("react-native-health-connect")
  } catch {
    return null
  }
}

function grantedReadTypes(granted) {
  const list = Array.isArray(granted) ? granted : []
  return new Set(
    list
      .filter(item => !item?.accessType || item.accessType === "read")
      .map(item => item?.recordType)
      .filter(Boolean)
  )
}

async function readAllHealthConnectRecords(healthConnect, recordType, timeRangeFilter) {
  const all = []
  let pageToken
  for (let i = 0; i < 8; i += 1) {
    const result = await healthConnect.readRecords(recordType, {
      timeRangeFilter,
      ...(pageToken ? { pageToken } : {})
    })
    const rows = Array.isArray(result?.records)
      ? result.records
      : (Array.isArray(result) ? result : [])
    all.push(...rows)
    pageToken = result?.pageToken
    if (!pageToken) break
  }
  return all
}

function numberOrNull(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function quantityToNumber(value) {
  if (value == null) return null
  return (
    numberOrNull(value) ??
    numberOrNull(value.inMillimetersOfMercury) ??
    numberOrNull(value.millimetersOfMercury) ??
    numberOrNull(value.mmHg) ??
    numberOrNull(value.value)
  )
}

function normalizePulse(value) {
  const pulse =
    numberOrNull(value) ??
    numberOrNull(value?.beatsPerMinute) ??
    numberOrNull(value?.bpm) ??
    numberOrNull(value?.value) ??
    numberOrNull(value?.inBeatsPerMinute)
  if (pulse == null || pulse < 30 || pulse > 220) return null
  return Math.round(pulse)
}

function getBloodPressureRecordTime(record) {
  const value =
    record?.time ||
    record?.measurementTime ||
    record?.startTime ||
    record?.metadata?.lastModifiedTime
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getHeartRateSampleTime(sample) {
  const value = sample?.time || sample?.startTime || sample?.endTime
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getPulseFromBloodPressureRecord(record) {
  return (
    normalizePulse(record?.pulse) ??
    normalizePulse(record?.pulseRate) ??
    normalizePulse(record?.heartRate) ??
    normalizePulse(record?.beatsPerMinute) ??
    normalizePulse(record?.bpm)
  )
}

function getPulseFromHeartRateRecords(heartRateRecords, targetDate) {
  let nearestPulse = null
  let nearestDiff = Number.POSITIVE_INFINITY
  const targetTime = targetDate.getTime()

  heartRateRecords.forEach(record => {
    const samples = Array.isArray(record?.samples) ? record.samples : []
    samples.forEach(sample => {
      const pulse = normalizePulse(sample)
      const sampleDate = getHeartRateSampleTime(sample)
      if (pulse == null || !sampleDate) return
      const diff = Math.abs(sampleDate.getTime() - targetTime)
      if (diff <= PULSE_MATCH_WINDOW_MS && diff < nearestDiff) {
        nearestPulse = pulse
        nearestDiff = diff
      }
    })
  })

  return nearestPulse
}

function getStableBpSyncKey(sys, dia, date, metadataId) {
  return metadataId || `hc_bp_${date.getTime()}_${Math.round(sys)}_${Math.round(dia)}`
}

function mapHealthConnectBloodPressureRecords(bpRecords, heartRateRecords) {
  return bpRecords
    .map(record => {
      const sys = quantityToNumber(record?.systolic)
      const dia = quantityToNumber(record?.diastolic)
      const measuredAt = getBloodPressureRecordTime(record)
      if (sys == null || dia == null || !measuredAt) return null

      const roundedSys = Math.round(sys)
      const roundedDia = Math.round(dia)
      const metadataId = typeof record?.metadata?.id === "string" ? record.metadata.id : ""
      const pulse =
        getPulseFromBloodPressureRecord(record) ??
        getPulseFromHeartRateRecords(heartRateRecords, measuredAt)

      return {
        sys: roundedSys,
        dia: roundedDia,
        pulse,
        mood: UNMARKED_MOOD,
        measuredAt: measuredAt.toISOString(),
        source: "health-connect",
        syncKey: getStableBpSyncKey(roundedSys, roundedDia, measuredAt, metadataId)
      }
    })
    .filter(Boolean)
}

function toDate(value) {
  const date = new Date(value || Date.now())
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function toDateKey(value) {
  const date = toDate(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function formatDateTime(value, lang = "zh") {
  return formatDateTimeLocale(value, lang)
}

function formatShortDate(dateKey) {
  const [, month, day] = dateKey.split("-")
  return `${Number(month)}/${Number(day)}`
}

function getBpStatus(sys, dia) {
  if (sys >= 180 || dia >= 120) {
    return {
      level: "超高血壓", levelKey: "levelCritical",
      familyLabel: "危險高血壓", familyLabelKey: "familyLabelCritical",
      color: "#E05A47", softColor: "rgba(224,90,71,0.18)",
      category: "danger", isAbnormal: true, isCritical: true,
      recommendation: "請立即聯絡長輩，確認症狀並評估就醫。", recommendationKey: "recCritical"
    }
  }
  if (sys >= 140 || dia >= 90) {
    return {
      level: "高血壓", levelKey: "levelDanger",
      familyLabel: "高血壓警戒", familyLabelKey: "familyLabelDanger",
      color: "#E05A47", softColor: "rgba(224,90,71,0.18)",
      category: "danger", isAbnormal: true, isCritical: false,
      recommendation: "請儘快確認長輩狀況，安排休息後複測。", recommendationKey: "recDanger"
    }
  }
  if (sys < 90 || dia < 60) {
    return {
      level: "偏低", levelKey: "levelLow",
      familyLabel: "血壓偏低", familyLabelKey: "familyLabelLow",
      color: "#A78BFA", softColor: "rgba(167,139,250,0.18)",
      category: "warning", isAbnormal: true, isCritical: false,
      recommendation: "請確認是否頭暈、無力，必要時聯絡醫師。", recommendationKey: "recLow"
    }
  }
  if (sys >= 120 || dia >= 80) {
    return {
      level: "血壓前期", levelKey: "levelPrehypertension",
      familyLabel: "血壓前期", familyLabelKey: "familyLabelPrehypertension",
      color: "#FFA726", softColor: "rgba(255,167,38,0.15)",
      category: "warning", isAbnormal: false, isCritical: false,
      recommendation: "建議增加監測頻率，並留意飲食與作息。", recommendationKey: "recPrehypertension"
    }
  }
  return {
    level: "正常", levelKey: "levelNormal",
    familyLabel: "正常", familyLabelKey: "familyLabelNormal",
    color: "#10B981", softColor: "rgba(16,185,129,0.18)",
    category: "normal", isAbnormal: false, isCritical: false,
    recommendation: "目前血壓穩定，維持固定量測與紀錄。", recommendationKey: "recNormal"
  }
}

function getPulseStatus(pulse, t) {
  if (pulse == null) return { label: t ? t.pulseUnknown : "未記錄", color: "#8E95A3" }
  if (pulse < 50) return { label: t ? t.pulseSlow : "心跳偏慢", color: "#A78BFA" }
  if (pulse > 100) return { label: t ? t.pulseFast : "心跳偏快", color: "#E05A47" }
  return { label: t ? t.pulseNormal : "心跳正常", color: "#10B981" }
}

function normalizeDisplayMood(mood) {
  return mood === "疲倦" ? "開心" : mood
}

function isMarkedMood(mood) {
  return Boolean(mood && mood !== UNMARKED_MOOD)
}

function isStressMood(mood) {
  return isMarkedMood(mood) && STRESS_MOODS.has(mood)
}

function normalizeRecord(record) {
  const sys = numberOrNull(record?.sys)
  const dia = numberOrNull(record?.dia)
  const pulse = numberOrNull(record?.pulse)
  const measuredAt = record?.measuredAt || record?.createdAt || record?.time || Date.now()
  const status = sys != null && dia != null ? getBpStatus(sys, dia) : getBpStatus(120, 80)

  return {
    ...record,
    sys,
    dia,
    pulse,
    measuredAt,
    dateKey: toDateKey(measuredAt),
    mood: normalizeDisplayMood(record?.mood || UNMARKED_MOOD),
    computedLevel: status.level,
    status
  }
}

function groupDaily(records) {
  const grouped = new Map()

  records.forEach(record => {
    if (record.sys == null || record.dia == null) return
    const list = grouped.get(record.dateKey) || []
    list.push(record)
    grouped.set(record.dateKey, list)
  })

  return Array.from(grouped.entries())
    .map(([dateKey, items]) => {
      const avgSys = Math.round(items.reduce((sum, item) => sum + item.sys, 0) / items.length)
      const avgDia = Math.round(items.reduce((sum, item) => sum + item.dia, 0) / items.length)
      const pulses = items.map(item => item.pulse).filter(value => value != null)
      const avgPulse = pulses.length
        ? Math.round(pulses.reduce((sum, value) => sum + value, 0) / pulses.length)
        : null
      return {
        dateKey,
        label: formatShortDate(dateKey),
        avgSys,
        avgDia,
        avgPulse,
        count: items.length,
        status: getBpStatus(avgSys, avgDia)
      }
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

function getHealthSummary(records) {
  const daily = groupDaily(records)
  const buckets = { normal: 0, warning: 0, danger: 0 }
  daily.forEach(day => {
    buckets[day.status.category] += 1
  })
  const totalDays = daily.length
  const percent = value => (totalDays ? Math.round((value / totalDays) * 100) : 0)

  return {
    daily,
    totalDays,
    normal: { days: buckets.normal, percent: percent(buckets.normal) },
    warning: { days: buckets.warning, percent: percent(buckets.warning) },
    danger: { days: buckets.danger, percent: percent(buckets.danger) }
  }
}

const HEALTH_SUMMARY_RANGES = [
  { label: "1個月", months: 1 },
  { label: "3個月", months: 3 },
  { label: "6個月", months: 6 }
]

function getRecentRecords(records, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return records.filter(record => toDate(record.measuredAt).getTime() >= cutoff)
}

function getRecordsWithinMonths(records, months) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  return records.filter(record => toDate(record.measuredAt).getTime() >= cutoff.getTime())
}

function getSampledTrendSummaries(daily, maxPoints = 10) {
  if (daily.length <= maxPoints) return daily
  const step = (daily.length - 1) / (maxPoints - 1)
  return Array.from({ length: maxPoints }, (_, index) => daily[Math.round(index * step)])
}

function buildTrendChart(daily, months) {
  if (!daily.length) return []
  const bucketDays = months >= 6 ? 14 : months >= 3 ? 7 : 1
  if (bucketDays === 1) return getSampledTrendSummaries(daily, 8)
  const groups = new Map()
  for (const day of daily) {
    const d = toDate(`${day.dateKey}T00:00:00`)
    if (!Number.isFinite(d.getTime())) continue
    const bucket = Math.floor(d.getTime() / (bucketDays * 24 * 60 * 60 * 1000))
    const list = groups.get(bucket) || []
    list.push(day)
    groups.set(bucket, list)
  }
  const rows = Array.from(groups.keys())
    .sort((a, b) => a - b)
    .map((bucket) => {
      const items = groups.get(bucket)
      const avgSys = Math.round(items.reduce((sum, item) => sum + item.avgSys, 0) / items.length)
      const avgDia = Math.round(items.reduce((sum, item) => sum + item.avgDia, 0) / items.length)
      const last = items[items.length - 1]
      return {
        dateKey: last.dateKey,
        label: formatShortDate(last.dateKey),
        avgSys,
        avgDia,
        avgPulse: null,
        count: items.reduce((sum, item) => sum + (item.count || 1), 0),
        status: getBpStatus(avgSys, avgDia)
      }
    })
  return getSampledTrendSummaries(rows, 10)
}

function getPeriodicObservationKey(summary) {
  if (!summary.totalDays) return "obsNoData"
  if (summary.danger.percent >= 30) return "obsDanger"
  if (summary.warning.percent >= 40) return "obsWarning"
  return "obsNormal"
}

function getTrendSummary(records, months) {
  const periodRecords = getRecordsWithinMonths(records, months)
  const summary = getHealthSummary(periodRecords)
  return {
    ...summary,
    periodicObservationKey: getPeriodicObservationKey(summary)
  }
}

function shiftMonth(dateKey, offset) {
  const date = toDate(`${dateKey}T00:00:00`)
  date.setMonth(date.getMonth() + offset)
  return toDateKey(date)
}

function getCalendarDays(dateKey, records) {
  const baseDate = toDate(`${dateKey}T00:00:00`)
  const year = baseDate.getFullYear()
  const month = baseDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const recordMap = new Map()

  records.forEach(record => {
    const dayRecords = recordMap.get(record.dateKey) || []
    dayRecords.push(record)
    recordMap.set(record.dateKey, dayRecords)
  })

  const cells = []
  for (let i = 0; i < firstDay.getDay(); i += 1) {
    cells.push({ key: `blank-${i}`, blank: true })
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const dayDate = new Date(year, month, day)
    const dayKey = toDateKey(dayDate)
    const dayRecords = sortRecordsAbnormalFirst(recordMap.get(dayKey) || [])
    cells.push({
      key: dayKey,
      dateKey: dayKey,
      day,
      records: dayRecords,
      topRecord: dayRecords[0],
      hasAbnormal: dayRecords.some(record => record.status.isAbnormal),
      hasDanger: dayRecords.some(record => record.status.category === "danger")
    })
  }

  return cells
}

function getFamilyStats(records) {
  const valid = records.filter(record => record.sys != null && record.dia != null)
  const abnormal = valid.filter(record => record.status.isAbnormal)
  const avg = key =>
    valid.length ? Math.round(valid.reduce((sum, record) => sum + record[key], 0) / valid.length) : "--"

  return {
    total: valid.length,
    abnormalCount: abnormal.length,
    avgSys: avg("sys"),
    avgDia: avg("dia"),
    maxSys: valid.length ? Math.max(...valid.map(record => record.sys)) : "--",
    minSys: valid.length ? Math.min(...valid.map(record => record.sys)) : "--"
  }
}

function getSourceLabel(source, t) {
  if (source === "health-connect") return "Health Connect"
  if (source === "manual") return t ? t.srcManual : "手動輸入"
  if (source === "mock" || source === "mock-seed") return t ? t.srcOldData : "舊測試資料"
  return t ? t.srcCareSystem : "照護系統"
}

function getFamilyNextStep(latest, abnormalCount, t) {
  if (!latest) return t ? t.familyNoData : "等待長輩端同步第一筆血壓資料。"
  if (latest.status.isCritical) return t ? t.familyCritical : "立即聯絡長輩並確認是否需要就醫。"
  if (latest.status.category === "danger") return t ? t.familyDanger : "請長輩休息後複測，並通知照顧者持續觀察。"
  if (abnormalCount >= 3) return t ? t.familyManyAbnormal : "近 3 個月異常偏多，建議安排固定量測與門診討論。"
  return t ? t.familyNormal : "維持每日追蹤，必要時提醒長輩補量測。"
}

function getHealthAdvice(records, t) {
  if (!records.length) return t ? t.adviceNoData : "尚未有血壓資料，請先從長輩端同步或手動新增紀錄。"
  if (records.some(record => record.status.isCritical)) {
    return t ? t.adviceCritical : "出現 180/120 以上的超高血壓紀錄，請立即確認症狀並評估就醫。"
  }
  if (records.some(record => record.status.category === "danger")) {
    return t ? t.adviceDanger : "近期有高血壓紀錄，建議固定複測並觀察是否與睡眠、飲食或情緒相關。"
  }
  if (records.some(record => record.status.category === "warning")) {
    return t ? t.adviceWarning : "血壓已有前期或偏低訊號，建議維持每日量測並留意身體不適。"
  }
  return t ? t.adviceNormal : "目前血壓趨勢穩定，維持固定量測與健康生活型態。"
}

function getMoodStressAnalysis(records, t) {
  const recent = records.slice(0, 14)
  const stressHits = recent.filter(record => record.sys > 140 && isStressMood(record.mood)).length
  const markedCount = recent.filter(record => isMarkedMood(record.mood)).length

  if (stressHits > 0) {
    return t ? t.moodStressHitFn(stressHits, recent.length)
      : `近 ${recent.length} 筆中有 ${stressHits} 筆同時出現高血壓與焦慮或頭暈，建議記錄發生情境。`
  }
  if (markedCount > 0) return t ? t.moodStressContinue : "已有心情標記，可持續觀察情緒、睡眠與血壓波動的關係。"
  return t ? t.moodStressEmpty : "尚未累積足夠心情標記，建議每次量測後補上當下感受。"
}

function getPulseMoodAnalysis(records, t) {
  const recent = records.slice(0, 14)
  const pulseRecords = recent.filter(record => record.pulse != null)
  if (!pulseRecords.length) return t ? t.pulseNoData : "尚未有脈搏資料。"

  const averagePulse = Math.round(
    pulseRecords.reduce((sum, record) => sum + record.pulse, 0) / pulseRecords.length
  )
  if (t?.pulseAdviceFn) return t.pulseAdviceFn(averagePulse)
  if (t?.pulseAvgFn) return t.pulseAvgFn(averagePulse)
  if (averagePulse < 50) {
    return `近期平均靜息脈搏約 ${averagePulse} bpm。2018 ACC/AHA/HRS 心搏過緩指引把竇性心率 <50 列為評估參考之一，但不能單靠數字診斷；若有頭暈、無力或昏厥請就醫。`
  }
  if (averagePulse < 60) {
    return `近期平均靜息脈搏約 ${averagePulse} bpm，低於 AHA 常見靜息範圍 60–100。低於 60 不一定是病（藥物、睡眠、運動習慣也可能）；若伴隨不適應就醫討論。`
  }
  if (averagePulse <= 100) {
    return `近期平均靜息脈搏約 ${averagePulse} bpm，落在美國心臟協會（AHA）多數成人靜息心率 60–100 bpm 的常見範圍（坐或躺、冷靜、無不適時）。`
  }
  return `近期平均靜息脈搏約 ${averagePulse} bpm，高於 AHA 靜息常見上限 100 bpm。可能受活動、發燒、咖啡因或緊張影響；休息後再量，若持續偏快或有胸悶／喘，請就醫。`
}

function sortRecordsAbnormalFirst(records) {
  return [...records].sort((a, b) => {
    const abnormalDiff = Number(b.status.isAbnormal) - Number(a.status.isAbnormal)
    if (abnormalDiff !== 0) return abnormalDiff
    return toDate(b.measuredAt) - toDate(a.measuredAt)
  })
}

const CHART_MIN = 40
const CHART_MAX = 200
const MINI_CHART_HEIGHT = 116
const MINI_CHART_LABEL_SPACE = 34
const LONG_CHART_HEIGHT = 168
const LONG_CHART_LABEL_SPACE = 40

function toChartHeight(value, chartHeight) {
  const ratio = (value - CHART_MIN) / (CHART_MAX - CHART_MIN)
  return Math.max(18, Math.min(chartHeight, ratio * chartHeight))
}

function toChartLineBottom(value, chartHeight, labelSpace) {
  return labelSpace + toChartHeight(value, chartHeight)
}

function toChartLimitBottom(value, chartHeight) {
  return toChartHeight(value, chartHeight)
}

function MiniTrendChart({ summaries, t }) {
  if (!summaries.length) {
    return <Text style={styles.emptyText}>{t ? t.noMiniTrendData : "\u5c1a\u7121\u8840\u58d3\u8da8\u52e2\u8cc7\u6599"}</Text>
  }

  return (
    <View style={styles.miniChart}>
      <View pointerEvents="none" style={styles.miniChartPlot}>
        <View style={[styles.limitLine, { bottom: toChartLineBottom(130, MINI_CHART_HEIGHT, MINI_CHART_LABEL_SPACE), borderColor: "#EF4444" }]} />
        <View
          style={[
            styles.limitLine,
            {
              bottom: toChartLineBottom(80, MINI_CHART_HEIGHT, MINI_CHART_LABEL_SPACE),
              borderColor: "#FBBF24"
            }
          ]}
        />
      </View>
      {summaries.map((day, index) => {
        const next = summaries[index + 1]
        const sysBottom = toChartLineBottom(day.avgSys, MINI_CHART_HEIGHT, MINI_CHART_LABEL_SPACE)
        const diaBottom = toChartLineBottom(day.avgDia, MINI_CHART_HEIGHT, MINI_CHART_LABEL_SPACE)
        const nextSysBottom = next ? toChartLineBottom(next.avgSys, MINI_CHART_HEIGHT, MINI_CHART_LABEL_SPACE) : sysBottom
        const nextDiaBottom = next ? toChartLineBottom(next.avgDia, MINI_CHART_HEIGHT, MINI_CHART_LABEL_SPACE) : diaBottom
        const sysAngle = next ? Math.atan2(sysBottom - nextSysBottom, 34) : 0
        const diaAngle = next ? Math.atan2(diaBottom - nextDiaBottom, 34) : 0
        return (
          <View key={day.dateKey} style={styles.chartDay}>
            {next ? (
              <>
                <View
                  style={[
                    styles.miniLineSegment,
                    styles.miniLineSegmentSys,
                    { bottom: sysBottom, transform: [{ rotate: `${sysAngle}rad` }] }
                  ]}
                />
                <View
                  style={[
                    styles.miniLineSegment,
                    styles.miniLineSegmentDia,
                    { bottom: diaBottom, transform: [{ rotate: `${diaAngle}rad` }] }
                  ]}
                />
              </>
            ) : null}
            <Text
              style={[
                styles.chartValue,
                { bottom: Math.min(sysBottom + 8, MINI_CHART_LABEL_SPACE + MINI_CHART_HEIGHT + 8) }
              ]}
            >
              <Text style={[styles.chartValueSys, day.status.isAbnormal && { color: day.status.color }]}>
                {day.avgSys}
              </Text>
              <Text style={styles.chartValueSlash}>/</Text>
              <Text style={[styles.chartValueDia, day.status.isAbnormal && { color: day.status.color }]}>
                {day.avgDia}
              </Text>
            </Text>
            <View
              style={[
                styles.miniLinePoint,
                styles.miniLinePointSys,
                day.status.isAbnormal && { backgroundColor: day.status.color },
                { bottom: sysBottom }
              ]}
            />
            <View
              style={[
                styles.miniLinePoint,
                styles.miniLinePointDia,
                { bottom: diaBottom }
              ]}
            />
            <Text style={styles.chartLabel}>{day.label}</Text>
          </View>
        )
      })}
    </View>
  )
}

function LongTrendChart({ summaries, t, onSelectPoint }) {
  const [plotW, setPlotW] = useState(0)
  const [picked, setPicked] = useState(null)
  const rows = summaries || []
  const plotH = 168
  const axisVals = [180, 130, 80, 40]

  if (!rows.length) {
    return <Text style={styles.emptyText}>{t ? t.noLongTrendData : "\u5c1a\u7121\u9577\u671f\u8da8\u52e2\u8cc7\u6599"}</Text>
  }

  const xAt = (index) => (rows.length <= 1 ? plotW / 2 : (index / (rows.length - 1)) * plotW)
  const yAt = (value) => {
    const ratio = (Number(value) - CHART_MIN) / (CHART_MAX - CHART_MIN)
    return plotH - Math.max(0, Math.min(1, ratio)) * plotH
  }
  const labelIdx = new Set(
    [0, Math.floor((rows.length - 1) / 3), Math.floor(((rows.length - 1) * 2) / 3), rows.length - 1].filter((n) => n >= 0)
  )
  const pick = (day) => {
    setPicked(day)
    onSelectPoint?.(day)
  }

  return (
    <View style={styles.bpChartCard}>
      {picked ? (
        <Text style={styles.bpChartReadout}>
          {picked.label}  {picked.avgSys}/{picked.avgDia} mmHg
        </Text>
      ) : (
        <Text style={styles.bpChartReadoutMuted}>{t ? t.legendLimit : "130/80"}</Text>
      )}
      <View style={styles.bpChartRow}>
        <View style={[styles.bpYCol, { height: plotH }]}>
          {axisVals.map((value) => (
            <Text key={value} style={[styles.bpYLabel, { top: yAt(value) - 7 }]}>{value}</Text>
          ))}
        </View>
        <View
          style={[styles.bpPlot, { height: plotH }]}
          onLayout={(e) => setPlotW(e.nativeEvent.layout.width)}
        >
          <View style={[styles.bpGuide, { top: yAt(130), borderColor: "#EF4444" }]} />
          <View style={[styles.bpGuide, { top: yAt(80), borderColor: "#FBBF24" }]} />
          {plotW > 0 ? rows.map((day, index) => {
            const next = rows[index + 1]
            const x = xAt(index)
            const sysY = yAt(day.avgSys)
            const diaY = yAt(day.avgDia)
            const segs = []
            if (next) {
              const nx = xAt(index + 1)
              const nSysY = yAt(next.avgSys)
              const nDiaY = yAt(next.avgDia)
              const sysLen = Math.max(2, Math.hypot(nx - x, nSysY - sysY))
              const diaLen = Math.max(2, Math.hypot(nx - x, nDiaY - diaY))
              segs.push(
                <View
                  key={`s-${day.dateKey}`}
                  pointerEvents="none"
                  style={[
                    styles.bpSeg,
                    styles.bpSegSys,
                    {
                      left: x,
                      top: sysY,
                      width: sysLen,
                      transform: [{ rotate: `${Math.atan2(nSysY - sysY, nx - x)}rad` }]
                    }
                  ]}
                />,
                <View
                  key={`d-${day.dateKey}`}
                  pointerEvents="none"
                  style={[
                    styles.bpSeg,
                    styles.bpSegDia,
                    {
                      left: x,
                      top: diaY,
                      width: diaLen,
                      transform: [{ rotate: `${Math.atan2(nDiaY - diaY, nx - x)}rad` }]
                    }
                  ]}
                />
              )
            }
            return (
              <View key={day.dateKey}>
                {segs}
                <Pressable
                  onPress={() => pick(day)}
                  hitSlop={10}
                  style={[styles.bpDotSys, { left: x - 5, top: sysY - 5 }]}
                />
                <Pressable
                  onPress={() => pick(day)}
                  hitSlop={10}
                  style={[styles.bpDotDia, { left: x - 4, top: diaY - 4 }]}
                />
              </View>
            )
          }) : null}
        </View>
      </View>
      <View style={styles.bpXRow}>
        {rows.map((day, index) => (
          <Text key={`x-${day.dateKey}`} style={[styles.bpXLabel, { opacity: labelIdx.has(index) ? 1 : 0 }]}>
            {labelIdx.has(index) ? day.label : " "}
          </Text>
        ))}
      </View>
      <View style={styles.legendRow}>
        <Text style={styles.legendSys}>{t ? t.legendSys : "\u6536\u7e2e\u58d3"}</Text>
        <Text style={styles.legendDia}>{t ? t.legendDia : "\u8212\u5f35\u58d3"}</Text>
        <Text style={styles.legendLimit}>{t ? t.legendLimit : "\u8b66\u6212\u7dda 130/80"}</Text>
      </View>
    </View>
  )
}

function TrendPanel({
  t,
  lang,
  summaryMonths,
  setSummaryMonths,
  trendChartSummaries,
  trendSummary,
  trendRecords,
  trendSpanLabel,
  trendRangeStats,
  avgTrendPulse,
  latestTrendPulse,
  trendPulseRecords
}) {
  const [logPage, setLogPage] = useState(0)
  const sortedLogs = useMemo(
    () => (trendRecords || []).slice().sort((a, b) => toDate(b.measuredAt) - toDate(a.measuredAt)),
    [trendRecords]
  )
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(sortedLogs.length / pageSize))
  const safePage = Math.min(logPage, pageCount - 1)
  const pageRows = sortedLogs.slice(safePage * pageSize, safePage * pageSize + pageSize)

  useEffect(() => {
    setLogPage(0)
  }, [summaryMonths, sortedLogs.length])

  return (
    <View style={styles.analysisCard}>
      <Text style={styles.analysisTitle}>{t.trend3m}</Text>
      {trendSpanLabel ? <Text style={styles.trendSpanText}>{trendSpanLabel}</Text> : null}
      <Text style={styles.trendSpanText}>
        {summaryMonths >= 6 ? t.chartGrain6m : summaryMonths >= 3 ? t.chartGrain3m : t.chartGrain1m}
      </Text>
      <View style={styles.segmentedControl}>
        {HEALTH_SUMMARY_RANGES.map(range => {
          const selected = summaryMonths === range.months
          const rangeLabel = range.months === 1 ? t.range1m : range.months === 3 ? t.range3m : t.range6m
          return (
            <Pressable
              key={range.months}
              style={[styles.segmentButton, selected && styles.segmentButtonActive]}
              onPress={() => setSummaryMonths(range.months)}
            >
              <Text style={[styles.segmentButtonText, selected && styles.segmentButtonTextActive]}>
                {rangeLabel}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <LongTrendChart summaries={trendChartSummaries} t={t} onSelectPoint={() => {}} />
      <Text style={styles.pulseSourceText}>{t.chartSourceNote}</Text>

      <View style={styles.bpLogCard}>
        <Text style={styles.macroSummaryTitle}>{t.logTitle}</Text>
        <View style={styles.bpLogRow}>
          <Text style={[styles.bpLogWhen, styles.bpLogHead]}>{t.logTime || "時間"}</Text>
          <Text style={[styles.bpLogVal, styles.bpLogHead]}>{t.logBp || "收縮/舒張"}</Text>
          <Text style={[styles.bpLogPulse, styles.bpLogHead]}>{t.logPulse || "脈搏"}</Text>
        </View>
        {pageRows.map((record) => (
          <View key={record._id || `${record.dateKey}-${record.sys}-${record.dia}`} style={styles.bpLogRow}>
            <Text style={styles.bpLogWhen}>{formatDateTime(record.measuredAt, lang)}</Text>
            <Text style={styles.bpLogVal}>
              <Text style={styles.bpLogSys}>{record.sys}</Text>
              <Text>{" / "}</Text>
              <Text style={styles.bpLogDia}>{record.dia}</Text>
            </Text>
            <Text style={styles.bpLogPulse}>{record.pulse ?? "--"}</Text>
          </View>
        ))}
        <View style={styles.bpLogPager}>
          <Pressable
            onPress={() => setLogPage((p) => Math.max(0, p - 1))}
            disabled={safePage <= 0}
            hitSlop={8}
            style={[styles.bpLogPageBtn, safePage <= 0 && styles.bpLogPageBtnOff]}
          >
            <Text style={styles.bpLogPageText}>{"<"}</Text>
          </Pressable>
          <Text style={styles.bpLogPageMeta}>
            {t.logPage
              ? String(t.logPage).replace("{page}", String(safePage + 1)).replace("{total}", String(pageCount))
              : `${safePage + 1}/${pageCount}`}
          </Text>
          <Pressable
            onPress={() => setLogPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            hitSlop={8}
            style={[styles.bpLogPageBtn, safePage >= pageCount - 1 && styles.bpLogPageBtnOff]}
            accessibilityLabel={t.logNext || ">"}
          >
            <Text style={styles.bpLogPageText}>{">"}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.chartSummaryRow}>
        <View style={styles.chartSummaryPill}>
          <Text style={styles.chartSummaryLabel}>{t.recordDays}</Text>
          <Text style={styles.chartSummaryValue}>{trendSummary.totalDays}</Text>
        </View>
        <View style={styles.chartSummaryPill}>
          <Text style={styles.chartSummaryLabel}>{t.highRisk}</Text>
          <Text style={styles.chartSummaryValue}>{trendSummary.danger.days}</Text>
        </View>
        <View style={styles.chartSummaryPill}>
          <Text style={styles.chartSummaryLabel}>{t.warning}</Text>
          <Text style={styles.chartSummaryValue}>{trendSummary.warning.days}</Text>
        </View>
      </View>

      <View style={styles.chartSummaryRow}>
        <View style={styles.chartSummaryPill}>
          <Text style={styles.chartSummaryLabel}>{t.avgSysLabel}</Text>
          <Text style={styles.chartSummaryValue}>{trendRangeStats?.avgSys ?? "--"}</Text>
        </View>
        <View style={styles.chartSummaryPill}>
          <Text style={styles.chartSummaryLabel}>{t.maxSysLabel}</Text>
          <Text style={styles.chartSummaryValue}>{trendRangeStats?.maxSys ?? "--"}</Text>
        </View>
        <View style={styles.chartSummaryPill}>
          <Text style={styles.chartSummaryLabel}>{t.minSysLabel}</Text>
          <Text style={styles.chartSummaryValue}>{trendRangeStats?.minSys ?? "--"}</Text>
        </View>
      </View>

      <View style={styles.adviceBox}>
        <Text style={styles.adviceText}>{getHealthAdvice(trendRecords, t)}</Text>
      </View>

      {trendPulseRecords.length ? (
        <View style={styles.pulseSummaryBox}>
          <View style={styles.pulseSummaryItem}>
            <Text style={styles.pulseSummaryLabel}>{t.avgPulse}</Text>
            <Text style={styles.pulseSummaryValue}>{avgTrendPulse} bpm</Text>
          </View>
          <View style={styles.pulseSummaryDivider} />
          <View style={styles.pulseSummaryItem}>
            <Text style={styles.pulseSummaryLabel}>{t.recentPulse}</Text>
            <Text style={styles.pulseSummaryValue}>{latestTrendPulse} bpm</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.macroSummaryBox}>
        <Text style={styles.macroSummaryTitle}>{t.periodSummaryFn(summaryMonths)}</Text>
        <Text style={styles.macroSummaryMeta}>{t.periodStats(trendSummary.totalDays)}</Text>
        <View style={styles.macroSummaryRow}>
          <View style={[styles.macroSummaryDot, styles.macroSummaryDotDanger]} />
          <Text style={styles.macroSummaryText}>{t.highRiskDaysFn(trendSummary.danger.days, trendSummary.danger.percent)}</Text>
        </View>
        <View style={styles.macroSummaryRow}>
          <View style={[styles.macroSummaryDot, styles.macroSummaryDotWarning]} />
          <Text style={styles.macroSummaryText}>{t.warningDaysFn(trendSummary.warning.days, trendSummary.warning.percent)}</Text>
        </View>
        <View style={styles.macroSummaryRow}>
          <View style={[styles.macroSummaryDot, styles.macroSummaryDotNormal]} />
          <Text style={styles.macroSummaryText}>{t.normalDaysFn(trendSummary.normal.days, trendSummary.normal.percent)}</Text>
        </View>
        <Text style={styles.macroSummaryObservation}>{t[trendSummary.periodicObservationKey]}</Text>
      </View>

      <View style={styles.pulseAnalysisBox}>
        <Text style={styles.pulseAnalysisTitle}>{t.pulseStressTitle}</Text>
        <Text style={styles.pulseAnalysisText}>{getPulseMoodAnalysis(trendRecords, t)}</Text>
        <Text style={styles.pulseSourceText}>{t.pulseSourceNote}</Text>
      </View>
    </View>
  )
}

function BloodPressureAlertPanel({ record, title, t }) {
  if (!record?.status?.isAbnormal) return null

  const level = t?.[record.status.levelKey] || record.status.level
  const recommendation = t?.[record.status.recommendationKey] || record.status.recommendation

  return (
    <View
      style={[
        styles.alertBanner,
        record.status.isCritical && styles.alertBannerCritical,
        { borderLeftColor: record.status.color }
      ]}
    >
      <View style={styles.alertHeaderRow}>
        <View style={[styles.alertIcon, { backgroundColor: record.status.color }]}>
          <Text style={styles.alertIconText}>!</Text>
        </View>
        <View style={styles.alertHeaderText}>
          <Text style={styles.alertTitle}>{title}</Text>
          <Text style={[styles.alertLevelText, { color: record.status.color }]}>{level}</Text>
        </View>
      </View>
      <Text style={styles.alertBodyText}>{recommendation}</Text>
    </View>
  )
}

export default function BloodPressureScreen({
  role,
  user,
  apiBaseUrl,
  token,
  uiLang,
  onBack,
  embedded = false
}) {
  const langKey = uiLang || "zh"
  const t = { ...UI_TEXT.zh, ...(UI_TEXT[langKey] || {}) }
  const apiPrefix =
    role === "caregiver" ? "/caregiver" : role === "family" ? "/family" : "/patient"
  const readOnly = role === "family"
  const [activeTab, setActiveTab] = useState("measure")
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [linkedPatientEmail, setLinkedPatientEmail] = useState(user?.linkedPatientEmail || "")
  const [linkedPatientName, setLinkedPatientName] = useState(
    user?.linkedPatientName || user?.activePatientName || user?.patientName || ""
  )
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()))
  const [selectedTrendDay, setSelectedTrendDay] = useState(null)
  const [selectedFamilyRecord, setSelectedFamilyRecord] = useState(null)
  const [summaryMonths, setSummaryMonths] = useState(1)
  const [form, setForm] = useState({
    sys: "",
    dia: "",
    pulse: "",
    mood: UNMARKED_MOOD
  })
  const syncLock = useRef(false)

  const normalizedRecords = useMemo(
    () => records.map(normalizeRecord).sort((a, b) => toDate(b.measuredAt) - toDate(a.measuredAt)),
    [records]
  )
  const latest = normalizedRecords[0] || null
  const dailySummaries = useMemo(() => groupDaily(normalizedRecords), [normalizedRecords])
  const latestFiveDays = useMemo(() => dailySummaries.slice(-5), [dailySummaries])
  const summary = useMemo(() => getHealthSummary(normalizedRecords), [normalizedRecords])
  const trendRecords = useMemo(
    () => getRecordsWithinMonths(normalizedRecords, summaryMonths),
    [normalizedRecords, summaryMonths]
  )
  const trendSummary = useMemo(
    () => getTrendSummary(normalizedRecords, summaryMonths),
    [normalizedRecords, summaryMonths]
  )
  const trendChartSummaries = useMemo(
    () => buildTrendChart(trendSummary.daily, summaryMonths),
    [trendSummary, summaryMonths]
  )
  const trendSpanLabel = useMemo(() => {
    if (!trendRecords.length) return ""
    const times = trendRecords
      .map((record) => toDate(record.measuredAt).getTime())
      .filter((n) => Number.isFinite(n))
    if (!times.length) return ""
    return `${toDateKey(new Date(Math.min(...times)))} → ${toDateKey(new Date(Math.max(...times)))}`
  }, [trendRecords])
  const trendRangeStats = useMemo(() => getFamilyStats(trendRecords), [trendRecords])
  const trendPulseRecords = useMemo(
    () => trendRecords.slice(0, 14).reverse().filter(record => record.pulse != null),
    [trendRecords]
  )
  const avgTrendPulse = useMemo(
    () =>
      trendPulseRecords.length
        ? Math.round(trendPulseRecords.reduce((sum, record) => sum + record.pulse, 0) / trendPulseRecords.length)
        : null,
    [trendPulseRecords]
  )
  const latestTrendPulse = trendPulseRecords.length ? trendPulseRecords[trendPulseRecords.length - 1].pulse : null
  const selectedRecords = useMemo(
    () => sortRecordsAbnormalFirst(normalizedRecords.filter(record => record.dateKey === selectedDate)),
    [normalizedRecords, selectedDate]
  )
  const calendarDays = useMemo(
    () => getCalendarDays(selectedDate, normalizedRecords),
    [selectedDate, normalizedRecords]
  )
  const diaryDateKeys = useMemo(() => {
    const uniqueKeys = Array.from(new Set(normalizedRecords.map(record => record.dateKey)))
    const today = toDateKey(new Date())
    if (!uniqueKeys.includes(today)) uniqueKeys.unshift(today)
    return uniqueKeys.slice(0, 14)
  }, [normalizedRecords])
  const recentThreeMonthRecords = useMemo(
    () => getRecentRecords(normalizedRecords, 90),
    [normalizedRecords]
  )
  const familyStats = useMemo(
    () => getFamilyStats(recentThreeMonthRecords),
    [recentThreeMonthRecords]
  )
  const familyAbnormalRecords = useMemo(
    () => recentThreeMonthRecords.filter(record => record.status.isAbnormal).slice(0, 6),
    [recentThreeMonthRecords]
  )
  const warningDays = useMemo(
    () => dailySummaries.filter(day => day.status.isAbnormal).slice(-3),
    [dailySummaries]
  )

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: `${apiPrefix}/blood-pressure/history?limit=200`,
        token
      })
      setRecords(ensureFilled(Array.isArray(data.records) ? data.records : [], screenshotBpRecords, 40))
      if (typeof data.linkedPatientEmail === "string") {
        setLinkedPatientEmail(data.linkedPatientEmail)
      }
      if (typeof data.linkedPatientName === "string" && data.linkedPatientName) {
        setLinkedPatientName(data.linkedPatientName)
      }
    } catch (loadError) {
      setError(loadError.message)
      setRecords(ensureFilled([], screenshotBpRecords, 40))
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl, apiPrefix, token])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const updateForm = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleRecord = async () => {
    if (readOnly) {
      setError(t.errFamilyReadOnly)
      return
    }

    const sys = Number(form.sys)
    const dia = Number(form.dia)
    const pulse = form.pulse === "" ? "" : Number(form.pulse)

    if (!Number.isFinite(sys) || !Number.isFinite(dia)) {
      setError(t.errInvalidBP)
      return
    }
    if (sys < 50 || sys > 260 || dia < 30 || dia > 180) {
      setError(t.errOutOfRange)
      return
    }
    if (form.pulse !== "" && (!Number.isFinite(pulse) || pulse < 30 || pulse > 220)) {
      setError(t.errInvalidPulse)
      return
    }

    setSaving(true)
    setMessage("")
    setError("")
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: `${apiPrefix}/blood-pressure/record`,
        method: "POST",
        token,
        body: { sys, dia, pulse }
      })
      const status = getBpStatus(sys, dia)
      setMessage(t.savedMsgFn(data.record?.sys || sys, data.record?.dia || dia, t[status.levelKey] || status.level))
      setForm({ sys: "", dia: "", pulse: "", mood: UNMARKED_MOOD })
      await loadHistory()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSync = useCallback(async (opts) => {
    const silent = Boolean(opts && opts.silent)
    if (readOnly) {
      if (!silent) setError(t.errFamilySync)
      return
    }
    if (Platform.OS !== "android") {
      if (!silent) setError(t.errIosHealth || t.errNotAndroid)
      return
    }
    if (syncLock.current) {
      if (!silent) setMessage(t.syncBusy || "正在同步…")
      return
    }
    syncLock.current = true

    setSyncing(true)
    if (!silent) {
      setMessage("")
      setError("")
    }
    try {
      const healthConnect = getAndroidHealthConnect()
      if (!healthConnect?.initialize || !healthConnect?.readRecords) {
        if (!silent) setError(t.errNoHCPackage)
        return
      }

      const sdk = healthConnect.SdkAvailabilityStatus || { SDK_AVAILABLE: 3 }
      try {
        const status = await healthConnect.getSdkStatus?.()
        if (status != null && status !== sdk.SDK_AVAILABLE) {
          if (!silent) setError(t.errHCInitFail)
          return
        }
      } catch {
        /* 部分機型沒有 getSdkStatus，改走 initialize */
      }

      const initialized = await healthConnect.initialize()
      if (!initialized) {
        if (!silent) setError(t.errHCInitFail)
        return
      }

      let hasPermissions = false
      try {
        hasPermissions = grantedReadTypes(await healthConnect.getGrantedPermissions?.()).has("BloodPressure")
      } catch {}

      if (!hasPermissions) {
        const granted = await healthConnect.requestPermission(HEALTH_CONNECT_PERMISSIONS)
        hasPermissions = grantedReadTypes(granted).has("BloodPressure")
      }

      if (!hasPermissions) {
        if (!silent) setError(t.errNoHCPerms)
        return
      }

      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000)
      const timeRangeFilter = {
        operator: "between",
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      }

      const bpRecords = await readAllHealthConnectRecords(healthConnect, "BloodPressure", timeRangeFilter)
      let heartRateRecords = []
      try {
        heartRateRecords = await readAllHealthConnectRecords(healthConnect, "HeartRate", timeRangeFilter)
      } catch {}

      const mappedRecords = mapHealthConnectBloodPressureRecords(bpRecords, heartRateRecords)
      if (!mappedRecords.length) {
        if (!silent) setMessage(t.hcNoData)
        return
      }
      const newest = [...mappedRecords].sort(
        (a, b) => new Date(b.measuredAt) - new Date(a.measuredAt)
      )[0]
      const newestWhen = newest ? formatDateTime(newest.measuredAt, langKey) : ""

      const data = await apiRequest({
        apiBaseUrl,
        path: `${apiPrefix}/blood-pressure/import`,
        method: "POST",
        token,
        body: { records: mappedRecords }
      })
      const imported = data.importedCount || 0
      const pulse = data.pulseBackfillCount || 0
      const skipped = data.skippedCount || 0
      if (!silent || imported > 0 || pulse > 0) {
        const latestLine = newest && (t.hcSyncLatestFn || t.hcSyncNoNewFn)
          ? (imported === 0 && skipped > 0
            ? (t.hcSyncNoNewFn
              ? t.hcSyncNoNewFn(newest.sys, newest.dia, newestWhen)
              : `沒有新筆。Health Connect 最新已是 ${newest.sys}/${newest.dia}（${newestWhen}）。`)
            : `${t.hcSyncDoneFn(imported, pulse, skipped)} ${t.hcSyncLatestFn ? t.hcSyncLatestFn(newest.sys, newest.dia, newestWhen) : ""}`.trim())
          : t.hcSyncDoneFn(imported, pulse, skipped)
        setMessage(latestLine)
        setError("")
      }
      await loadHistory()
    } catch (syncError) {
      if (!silent) setError(t.hcSyncErrFn(syncError.message || "Health Connect sync failed"))
    } finally {
      setSyncing(false)
      syncLock.current = false
    }
  }, [readOnly, t.errFamilySync, t.errIosHealth, t.errNotAndroid, t.errNoHCPackage, t.errHCInitFail, t.errNoHCPerms, t.hcNoData, t.hcSyncDoneFn, t.hcSyncErrFn, t.hcSyncNoNewFn, t.hcSyncLatestFn, t.syncBusy, apiBaseUrl, apiPrefix, token, loadHistory, langKey])

  useEffect(() => {
    if (readOnly || Platform.OS !== "android") return
    handleSync({ silent: true })
  }, [handleSync, readOnly])

  useEffect(() => {
    if (readOnly || Platform.OS !== "android") return
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") handleSync({ silent: true })
    })
    return () => sub.remove()
  }, [handleSync, readOnly])

  const updateMood = async (record, mood) => {
    if (readOnly || !record?._id) return

    setRecords(current =>
      current.map(item => (item._id === record._id ? { ...item, mood } : item))
    )

    try {
      await apiRequest({
        apiBaseUrl,
        path: `${apiPrefix}/blood-pressure/${record._id}/mood`,
        method: "PATCH",
        token,
        body: { mood }
      })
    } catch (moodError) {
      setError(moodError.message)
      await loadHistory()
    }
  }

  const trendPanel = (
    <TrendPanel
      t={t}
      lang={langKey}
      summaryMonths={summaryMonths}
      setSummaryMonths={setSummaryMonths}
      trendChartSummaries={trendChartSummaries}
      trendSummary={trendSummary}
      trendRecords={trendRecords}
      trendSpanLabel={trendSpanLabel}
      trendRangeStats={trendRangeStats}
      avgTrendPulse={avgTrendPulse}
      latestTrendPulse={latestTrendPulse}
      trendPulseRecords={trendPulseRecords}
    />
  )

  if (role === "caregiver") {
    const caregiverNextStep = latest
      ? latest.status.isCritical ? t.nextCritical
        : latest.status.category === "danger" ? t.nextDanger
        : latest.status.category === "warning" ? t.nextWarning
        : t.nextStable
      : t.nextNoData

    return (
      <View style={styles.screen}>
        {embedded ? null : (
          <View style={styles.headerCard}>
            {!onBack ? null : (
              <Pressable onPress={onBack}>
                <Text style={styles.backText}>{t.back}</Text>
              </Pressable>
            )}
            <Text style={styles.title}>{t.caregiverTitle}</Text>
            <Text style={styles.sub}>{t.caregiverSub}</Text>
          </View>
        )}

        <View style={styles.tabRow}>
          {[
            ["measure", t.tabMeasure],
            ["trend", t.tabTrend]
          ].map(([key, label]) => (
            <Pressable
              key={key}
              style={[styles.tabBtn, activeTab === key && styles.tabBtnActive]}
              onPress={() => setActiveTab(key)}
            >
              <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          {activeTab === "trend" ? trendPanel : (
          <>
          {loading ? <ActivityIndicator color={colors.pine} /> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <BloodPressureAlertPanel record={latest} title={t.alertNeedsConfirm} t={t} />

          <View
            style={[
              styles.latestCard,
              latest && { borderLeftColor: latest.status.color, borderLeftWidth: 5 },
              latest?.status.isAbnormal && styles.latestCardAbnormal,
              latest?.status.isCritical && styles.latestCardCritical
            ]}
          >
            <View style={styles.cardHead}>
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <NeoIcon name="heart-fill" size={18} color="#FF4D4D" />
                  <Text style={styles.sectionTitle}>{t.currentBP}</Text>
                </View>
                <Text style={styles.rowSub}>{latest ? formatDateTime(latest.measuredAt, langKey) : t.noRecord}</Text>
              </View>
              {latest ? (
                <Text
                  style={[
                    styles.statusBadge,
                    latest.status.isAbnormal && styles.statusBadgeAbnormal,
                    latest.status.levelKey === "levelPrehypertension" ? styles.statusBadgePre : null,
                    { color: latest.status.color, backgroundColor: latest.status.softColor }
                  ]}
                >
                  {t[latest.status.levelKey] || latest.status.level}
                </Text>
              ) : null}
            </View>

            <View style={styles.valueGrid}>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>{t.sysBP}</Text>
                <Text style={styles.bigValue}>{latest?.sys ?? "--"}</Text>
                <Text style={styles.unitText}>mmHg</Text>
              </View>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>{t.diaBP}</Text>
                <Text style={styles.bigValue}>{latest?.dia ?? "--"}</Text>
                <Text style={styles.unitText}>mmHg</Text>
              </View>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>{t.pulse}</Text>
                <Text style={styles.bigValue}>{latest?.pulse ?? "--"}</Text>
                <Text style={styles.unitText}>bpm</Text>
              </View>
            </View>

            {latest ? (
              <View style={styles.adviceBox}>
                <NeoIcon name="lightbulb-on" size={20} color="#FACC15" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.adviceTitle}>{t.nextStepLabel}</Text>
                  <Text style={styles.adviceBody}>{caregiverNextStep}</Text>
                </View>
                <NeoIcon name="chevron-right" size={16} color="#10B981" />
              </View>
            ) : null}
          </View>

          <View style={styles.formCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <NeoIcon name="link" size={16} color="#10B981" />
              <Text style={styles.sectionTitle}>{t.syncInput}</Text>
            </View>
            {Platform.OS === "ios" ? (
              <Text style={styles.meterHint}>{t.meterHintIos || "iPhone 未支援藍牙血壓計，請手動輸入。"}</Text>
            ) : (
              <>
                <Pressable style={styles.buttonSecondary} onPress={handleSync} disabled={syncing}>
                  {syncing ? (
                    <ActivityIndicator color="#10B981" />
                  ) : (
                    <>
                      <NeoIcon name="heart-circle" size={18} color="#10B981" />
                      <Text style={styles.buttonSecondaryText}>{t.syncHC}</Text>
                    </>
                  )}
                </Pressable>
                <Text style={styles.meterHint}>{t.meterHint || "量完回到這個頁面會自動同步。"}</Text>
              </>
            )}

            <Text style={styles.sectionTitleSpacing}>{t.caregiverAddTitle}</Text>
            <View style={styles.inputGrid}>
              <View style={styles.inputCell}>
                <Text style={styles.label}>{t.sysBP}</Text>
                <View style={styles.inputMeterWrap}>
                  <TextInput
                    style={styles.inputMeter}
                    value={form.sys}
                    onChangeText={value => updateForm("sys", value)}
                    keyboardType="numeric"
                    placeholder="128"
                  />
                  <NeoIcon name="chevron-right" size={14} color="#8E95A3" />
                </View>
              </View>
              <View style={styles.inputCell}>
                <Text style={styles.label}>{t.diaBP}</Text>
                <View style={styles.inputMeterWrap}>
                  <TextInput
                    style={styles.inputMeter}
                    value={form.dia}
                    onChangeText={value => updateForm("dia", value)}
                    keyboardType="numeric"
                    placeholder="82"
                  />
                  <NeoIcon name="chevron-right" size={14} color="#8E95A3" />
                </View>
              </View>
              <View style={styles.inputCell}>
                <Text style={styles.label}>{t.pulse}</Text>
                <View style={styles.inputMeterWrap}>
                  <TextInput
                    style={styles.inputMeter}
                    value={form.pulse}
                    onChangeText={value => updateForm("pulse", value)}
                    keyboardType="numeric"
                    placeholder="76"
                  />
                  <NeoIcon name="chevron-right" size={14} color="#8E95A3" />
                </View>
              </View>
            </View>

            <Pressable style={styles.buttonPrimary} onPress={handleRecord} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonPrimaryText}>{t.saveCaregiver}</Text>
              )}
            </Pressable>
          </View>
          </>
          )}
        </ScrollView>

      </View>
    )
  }

  if (role === "family") {
    const pulseStatus = getPulseStatus(latest?.pulse, t)
    const familyNextStep = getFamilyNextStep(latest, familyStats.abnormalCount, t)
    const latestWhen = latest ? formatDateTime(latest.measuredAt, langKey) : t.noRecord
    const latestSub = linkedPatientName ? `${linkedPatientName} · ${latestWhen}` : latestWhen

    return (
      <View style={styles.screen}>
        {embedded ? null : (
          <View style={styles.headerCard}>
            {!onBack ? null : (
              <Pressable onPress={onBack}>
                <Text style={styles.backText}>{t.back}</Text>
              </Pressable>
            )}
            <Text style={styles.title}>{t.familyTitle}</Text>
            <Text style={styles.sub}>{t.familySub}</Text>
          </View>
        )}

        <View style={styles.tabRow}>
          {[
            ["measure", t.tabOverview],
            ["trend", t.tabTrend]
          ].map(([key, label]) => (
            <Pressable
              key={key}
              style={[styles.tabBtn, activeTab === key && styles.tabBtnActive]}
              onPress={() => setActiveTab(key)}
            >
              <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          {activeTab === "trend" ? trendPanel : (
          <>
          {loading ? <ActivityIndicator color={colors.pine} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View
            style={[
              styles.latestCard,
              latest && { borderLeftColor: latest.status.color, borderLeftWidth: 5 },
              latest?.status.isAbnormal && styles.latestCardAbnormal,
              latest?.status.isCritical && styles.latestCardCritical
            ]}
          >
            <View style={styles.cardHead}>
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <NeoIcon name="heart-fill" size={18} color="#FF4D4D" />
                  <Text style={styles.sectionTitle}>{t.currentBP}</Text>
                </View>
                <Text style={styles.rowSub}>{latestSub}</Text>
              </View>
              {latest ? (
                <Text
                  style={[
                    styles.statusBadge,
                    latest.status.levelKey === "levelPrehypertension" ? styles.statusBadgePre : null,
                    { color: latest.status.color, backgroundColor: latest.status.softColor }
                  ]}
                >
                  {t[latest.status.familyLabelKey] || latest.status.familyLabel}
                </Text>
              ) : null}
            </View>

            <View style={styles.valueGrid}>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>{t.sysBP}</Text>
                <Text style={styles.bigValue}>{latest?.sys ?? "--"}</Text>
                <Text style={styles.unitText}>mmHg</Text>
              </View>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>{t.diaBP}</Text>
                <Text style={styles.bigValue}>{latest?.dia ?? "--"}</Text>
                <Text style={styles.unitText}>mmHg</Text>
              </View>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>{t.pulse}</Text>
                <Text style={styles.bigValue}>{latest?.pulse ?? "--"}</Text>
                <Text style={styles.unitText}>bpm</Text>
              </View>
            </View>

            {latest ? (
              <View style={styles.familyInfoRow}>
                <Text style={styles.familyInfoText}>{getSourceLabel(latest.source, t)}</Text>
                <Text style={[styles.familyInfoText, { color: pulseStatus.color }]}>{pulseStatus.label}</Text>
              </View>
            ) : null}

            {latest ? (
              <View style={styles.adviceBox}>
                <NeoIcon name="lightbulb-on" size={20} color="#FACC15" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.adviceTitle}>{t.familyNextStepLabel}</Text>
                  <Text style={styles.adviceBody}>{familyNextStep}</Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.analysisCard}>
            <View style={styles.cardHead}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <NeoIcon name="activity" size={16} color={colors.pine} />
                <Text style={styles.sectionTitle}>{t.trend3m}</Text>
              </View>
              <Pressable onPress={loadHistory} disabled={loading}>
                <Text style={styles.refreshText}>{t.refresh}</Text>
              </Pressable>
            </View>
            <MiniTrendChart summaries={groupDaily(recentThreeMonthRecords).slice(-7)} t={t} />
            <View style={styles.legendRow}>
              <Text style={styles.legendSys}>{t.legendSys}</Text>
              <Text style={styles.legendDia}>{t.legendDia}</Text>
              <Text style={styles.legendLimit}>{t.legendLimit}</Text>
            </View>
          </View>

          <View style={styles.analysisCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <NeoIcon name="calendar" size={16} color={colors.pine} />
              <Text style={styles.sectionTitle}>{t.summary3m}</Text>
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Text style={styles.summaryLabel}>{t.avgSysLabel}</Text>
                <Text style={styles.summaryValue}>{familyStats.avgSys}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.summaryLabel}>{t.avgDiaLabel}</Text>
                <Text style={styles.summaryValue}>{familyStats.avgDia}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.summaryLabel}>{t.maxSysLabel}</Text>
                <Text style={styles.summaryValue}>{familyStats.maxSys}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.summaryLabel}>{t.minSysLabel}</Text>
                <Text style={styles.summaryValue}>{familyStats.minSys}</Text>
              </View>
            </View>
            {familyAbnormalRecords.length ? (
              familyAbnormalRecords.slice(0, 4).map(record => (
                <Pressable
                  key={record._id || `${record.dateKey}-${record.sys}-${record.dia}`}
                  style={({ pressed }) => [
                    styles.alertRecord,
                    { borderLeftColor: record.status.color },
                    pressed && styles.alertRecordPressed
                  ]}
                  onPress={() => setSelectedFamilyRecord(record)}
                >
                  <Text style={styles.rowMain}>{record.sys}/{record.dia} mmHg</Text>
                  <Text style={[styles.rowSub, { color: record.status.color }]}>
                    {formatDateTime(record.measuredAt, langKey)}・{t[record.status.familyLabelKey] || record.status.familyLabel}
                  </Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.emptyText}>{t.noAbnormal}</Text>
            )}
          </View>
          </>
          )}
        </ScrollView>

        <Modal
          animationType="fade"
          transparent
          visible={Boolean(selectedFamilyRecord)}
          onRequestClose={() => setSelectedFamilyRecord(null)}
        >
          <View style={styles.detailModalBackdrop}>
            <View style={styles.detailModalPanel}>
              <View style={styles.detailModalHead}>
                <View>
                  <Text style={styles.detailModalTitle}>
                    {selectedFamilyRecord ? `${selectedFamilyRecord.sys}/${selectedFamilyRecord.dia} mmHg` : ""}
                  </Text>
                  <Text style={styles.detailModalSub}>
                    {selectedFamilyRecord ? formatDateTime(selectedFamilyRecord.measuredAt, langKey) : ""}
                  </Text>
                </View>
                <Pressable style={styles.detailModalClose} onPress={() => setSelectedFamilyRecord(null)}>
                  <Text style={styles.detailModalCloseText}>X</Text>
                </Pressable>
              </View>

              {selectedFamilyRecord ? (
                <>
                  <View style={[styles.detailAlertPill, { borderColor: selectedFamilyRecord.status.color }]}>
                    <Text style={styles.detailAlertIcon}>!</Text>
                    <Text style={[styles.detailAlertText, { color: selectedFamilyRecord.status.color }]}>
                      {t[selectedFamilyRecord.status.familyLabelKey] || selectedFamilyRecord.status.familyLabel}
                    </Text>
                  </View>

                  <View style={styles.detailGrid}>
                    <View style={styles.detailCell}>
                      <Text style={styles.detailLabel}>{t.sysBP}</Text>
                      <Text style={[styles.detailValue, { color: selectedFamilyRecord.status.color }]}>
                        {selectedFamilyRecord.sys}
                      </Text>
                      <Text style={styles.detailUnit}>mmHg</Text>
                    </View>
                    <View style={styles.detailCell}>
                      <Text style={styles.detailLabel}>{t.diaBP}</Text>
                      <Text style={[styles.detailValue, { color: selectedFamilyRecord.status.color }]}>
                        {selectedFamilyRecord.dia}
                      </Text>
                      <Text style={styles.detailUnit}>mmHg</Text>
                    </View>
                    <View style={styles.detailCell}>
                      <Text style={styles.detailLabel}>{t.pulse}</Text>
                      <Text style={styles.detailValue}>{selectedFamilyRecord.pulse ?? "--"}</Text>
                      <Text style={styles.detailUnit}>bpm</Text>
                    </View>
                  </View>

                  <Text style={styles.detailModalMeta}>
                    {t.moodPrefix}{moodDisplay(selectedFamilyRecord.mood, langKey)}
                  </Text>
                  <Text style={styles.detailModalMeta}>
                    {t.sourcePrefix}{getSourceLabel(selectedFamilyRecord.source, t)}
                  </Text>
                  <Text style={styles.detailAdvice}>
                    {t[selectedFamilyRecord.status.recommendationKey] || selectedFamilyRecord.status.recommendation}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        </Modal>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {embedded ? null : (
        <View style={styles.headerCard}>
          {!onBack ? null : (
            <Pressable onPress={onBack}>
              <Text style={styles.backText}>{t.back}</Text>
            </Pressable>
          )}
          <Text style={styles.title}>{t.patientTitle}</Text>
          <Text style={styles.sub}>{t.patientSub}</Text>
        </View>
      )}

      <View style={styles.tabRow}>
        {[
          ["measure", t.tabMeasure],
          ["trend", t.tabTrend]
        ].map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.tabBtn, activeTab === key && styles.tabBtnActive]}
            onPress={() => setActiveTab(key)}
          >
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {loading ? <ActivityIndicator color={colors.pine} /> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {activeTab === "measure" ? (
          <>
            <View
              style={[
                styles.latestCard,
                latest && { borderLeftColor: latest.status.color, borderLeftWidth: 5 },
                latest?.status.isAbnormal && styles.latestCardAbnormal,
                latest?.status.isCritical && styles.latestCardCritical
              ]}
            >
              <View style={styles.cardHead}>
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <NeoIcon name="heart-fill" size={18} color="#FF4D4D" />
                    <Text style={styles.sectionTitle}>{t.bpLabel}</Text>
                  </View>
                  <Text style={styles.rowSub}>{latest ? formatDateTime(latest.measuredAt, langKey) : t.noRecord}</Text>
                </View>
                {latest ? (
                  <Text
                    style={[
                      styles.statusBadge,
                      latest.status.isAbnormal && styles.statusBadgeAbnormal,
                      { color: latest.status.color, backgroundColor: latest.status.softColor }
                    ]}
                  >
                    {t[latest.status.levelKey] || latest.status.level}
                  </Text>
                ) : null}
              </View>

              <BloodPressureAlertPanel record={latest} title={t.bpAlert} t={t} />

              <View style={styles.valueGrid}>
                <View style={[styles.valueBox, latest?.status.isAbnormal && styles.valueBoxAbnormal]}>
                  <Text style={styles.valueLabel}>{t.sysBP}</Text>
                  <Text style={[styles.bigValue, latest?.status.isAbnormal && { color: latest.status.color }]}>{latest?.sys ?? "--"}</Text>
                  <Text style={styles.unitText}>mmHg</Text>
                </View>
                <View style={[styles.valueBox, latest?.status.isAbnormal && styles.valueBoxAbnormal]}>
                  <Text style={styles.valueLabel}>{t.diaBP}</Text>
                  <Text style={[styles.bigValue, latest?.status.isAbnormal && { color: latest.status.color }]}>{latest?.dia ?? "--"}</Text>
                  <Text style={styles.unitText}>mmHg</Text>
                </View>
                <View style={styles.valueBox}>
                  <Text style={styles.valueLabel}>{t.pulse}</Text>
                  <Text style={styles.bigValue}>{latest?.pulse ?? "--"}</Text>
                  <Text style={styles.unitText}>bpm</Text>
                </View>
              </View>

              <Text style={styles.sectionHint}>{t.fiveDayTrend}</Text>
              <MiniTrendChart summaries={latestFiveDays} t={t} />
              <View style={styles.legendRow}>
                <Text style={styles.legendSys}>{t.legendSys}</Text>
                <Text style={styles.legendDia}>{t.legendDia}</Text>
                <Text style={styles.legendLimit}>{t.legendLimit}</Text>
              </View>

              {warningDays.length ? (
                <View style={styles.warningBox}>
                  <Text style={styles.adviceTitle}>{t.dailyAlert}</Text>
                  {warningDays.map(day => (
                    <Text key={day.dateKey} style={styles.bodyText}>
                      {day.label} {t.avgPrefix} {day.avgSys}/{day.avgDia}，{t[day.status.levelKey] || day.status.level}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>{t.autoImport}</Text>
              {Platform.OS === "ios" ? (
                <Text style={styles.meterHint}>{t.meterHintIos || "iPhone 未支援藍牙血壓計，請手動輸入。"}</Text>
              ) : (
                <>
                  <Text style={styles.meterHint}>{t.meterHint || "量完回到這個頁面會自動同步。"}</Text>
                  <Pressable style={styles.buttonPrimary} onPress={handleSync} disabled={syncing}>
                    {syncing ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.buttonPrimaryText}>{t.syncHC}</Text>
                    )}
                  </Pressable>
                </>
              )}

              <Text style={styles.sectionTitleSpacing}>{t.addRecord}</Text>
              <View style={styles.inputGrid}>
                <View style={styles.inputCell}>
                  <Text style={styles.label}>{t.sysBP}</Text>
                  <TextInput
                    style={styles.inputMeter}
                    value={form.sys}
                    onChangeText={value => updateForm("sys", value)}
                    keyboardType="numeric"
                    placeholder="128"
                  />
                </View>
                <View style={styles.inputCell}>
                  <Text style={styles.label}>{t.diaBP}</Text>
                  <TextInput
                    style={styles.inputMeter}
                    value={form.dia}
                    onChangeText={value => updateForm("dia", value)}
                    keyboardType="numeric"
                    placeholder="82"
                  />
                </View>
                <View style={styles.inputCell}>
                  <Text style={styles.label}>{t.pulse}</Text>
                  <TextInput
                    style={styles.inputMeter}
                    value={form.pulse}
                    onChangeText={value => updateForm("pulse", value)}
                    keyboardType="numeric"
                    placeholder="76"
                  />
                </View>
              </View>

              <Pressable style={styles.buttonPrimary} onPress={handleRecord} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonPrimaryText}>{t.saveRecord}</Text>
                )}
              </Pressable>
            </View>
          </>
        ) : null}

        {activeTab === "trend" ? trendPanel : null}

        {activeTab === "diary" ? (
          <View style={styles.historyCard}>
            <View style={styles.cardHead}>
              <Text style={styles.sectionTitle}>{t.bpDiary}</Text>
              <Pressable onPress={loadHistory} disabled={loading}>
                <Text style={styles.refreshText}>{t.refresh}</Text>
              </Pressable>
            </View>

            <MonthCalendar
              dateKey={selectedDate}
              days={calendarDays}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onShiftMonth={offset => setSelectedDate(current => shiftMonth(current, offset))}
              weekdays={t.weekdays}
              lang={uiLang || "zh"}
              legend={t.calendarLegend}
            />

            <View style={styles.diaryDetailHeader}>
              <Text style={styles.detailTitle}>{selectedDate}{t.dateRecordsSuffix}</Text>
              <Text style={styles.detailMeta}>{selectedRecords.length}{t.recordUnit}</Text>
            </View>
            {selectedRecords.length === 0 ? (
              <Text style={styles.emptyDayText}>{t.emptyDay}</Text>
            ) : (
              selectedRecords.map(record => (
                <View key={record._id || `${record.dateKey}-${record.sys}-${record.dia}`} style={styles.diaryRecordItem}>
                  <View style={styles.recordLeft}>
                    <Text style={styles.recordText}>{formatDateTime(record.measuredAt, langKey)}</Text>
                    <View style={styles.recordValueRow}>
                      <Text style={styles.recordVal}>{record.sys}/{record.dia} mmHg</Text>
                    </View>
                    <Text style={styles.recordPulse}>{t.pulsePrefix} {record.pulse ?? "--"} bpm</Text>
                  </View>
                  <View style={[styles.levelTag, { backgroundColor: record.status.color }]}>
                    <Text style={styles.levelTagText}>{t[record.status.levelKey] || record.status.level}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(selectedTrendDay)}
        onRequestClose={() => setSelectedTrendDay(null)}
      >
        <View style={styles.detailModalBackdrop}>
          <View style={styles.detailModalPanel}>
            <View style={styles.detailModalHead}>
              <View>
                <Text style={styles.detailModalTitle}>{selectedTrendDay?.label || ""}</Text>
                <Text style={styles.detailModalSub}>{t.trend3m}</Text>
              </View>
              <Pressable style={styles.detailModalClose} onPress={() => setSelectedTrendDay(null)}>
                <Text style={styles.detailModalCloseText}>×</Text>
              </Pressable>
            </View>

            {selectedTrendDay?.status?.isAbnormal ? (
              <View style={[styles.detailAlertPill, { borderColor: selectedTrendDay.status.color }]}>
                <Text style={styles.detailAlertIcon}>🔥</Text>
                <Text style={[styles.detailAlertText, { color: selectedTrendDay.status.color }]}>
                  {t[selectedTrendDay.status.levelKey] || selectedTrendDay.status.level}
                </Text>
              </View>
            ) : (
              <View style={styles.detailStablePill}>
                <Text style={styles.detailStableText}>{t.levelNormal}</Text>
              </View>
            )}

            <View style={styles.detailGrid}>
              <View style={styles.detailCell}>
                <Text style={styles.detailLabel}>{t.legendSys}</Text>
                <Text style={styles.detailValue}>{selectedTrendDay?.avgSys ?? "--"}</Text>
                <Text style={styles.detailUnit}>mmHg</Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={styles.detailLabel}>{t.legendDia}</Text>
                <Text style={styles.detailValue}>{selectedTrendDay?.avgDia ?? "--"}</Text>
                <Text style={styles.detailUnit}>mmHg</Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={styles.detailLabel}>{t.avgPulse}</Text>
                <Text style={styles.detailValue}>{selectedTrendDay?.avgPulse ?? "--"}</Text>
                <Text style={styles.detailUnit}>bpm</Text>
              </View>
            </View>

            <Text style={styles.detailModalMeta}>{t.recordDays}: {selectedTrendDay?.count ?? 0}</Text>
            <Text style={styles.detailAdvice}>
              {selectedTrendDay?.status
                ? t[selectedTrendDay.status.recommendationKey] || selectedTrendDay.status.recommendation
                : ""}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  container: {
    padding: 16,
    gap: 12,
    paddingBottom: 28
  },
  headerCard: {
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12
  },
  backText: {
    color: colors.pine,
    fontWeight: "800"
  },
  title: {
    marginTop: 8,
    fontSize: 21,
    fontWeight: "800",
    color: colors.text
  },
  sub: {
    marginTop: 4,
    color: colors.textMuted,
    lineHeight: 20
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8
  },
  tabBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card
  },
  tabBtnActive: {
    backgroundColor: colors.pine,
    borderColor: colors.pine
  },
  tabText: {
    color: colors.textMuted,
    fontWeight: "800"
  },
  tabTextActive: {
    color: "#0D0F11"
  },
  latestCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14
  },
  latestCardAbnormal: {
    borderColor: "#E05A47",
    backgroundColor: "rgba(224,90,71,0.12)",
    shadowColor: "#E05A47",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  latestCardCritical: {
    borderColor: "#E05A47",
    backgroundColor: "rgba(224,90,71,0.18)"
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14
  },
  analysisCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14
  },
  historyCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14
  },
  taskCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10
  },
  taskDate: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "900"
  },
  taskRow: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    borderRadius: 16,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  taskRowDone: {
    backgroundColor: colors.mintSoft,
    borderColor: colors.pine
  },
  taskCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card
  },
  taskCheckDone: {
    borderColor: "#17a36b",
    backgroundColor: "#17a36b"
  },
  taskCheckText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16
  },
  taskBody: {
    flex: 1
  },
  taskTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  taskTextDone: {
    color: "#067647"
  },
  taskDesc: {
    marginTop: 3,
    color: "#526b88",
    lineHeight: 18
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text
  },
  sectionTitleSpacing: {
    marginTop: 18,
    marginBottom: 4,
    fontSize: 18,
    fontWeight: "800",
    color: colors.text
  },
  sectionHint: {
    marginTop: 14,
    marginBottom: 6,
    color: colors.textMuted,
    fontWeight: "800"
  },
  valueGrid: {
    flexDirection: "row",
    gap: 10,
    marginVertical: 12
  },
  valueBox: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#13151B",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.45)",
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "center"
  },
  valueBoxAbnormal: {
    backgroundColor: "rgba(224,90,71,0.12)",
    borderColor: "#E05A47"
  },
  valueLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700"
  },
  bigValue: {
    marginTop: 4,
    fontSize: 30,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.6
  },
  unitText: {
    marginTop: 4,
    color: "#6C727A",
    fontSize: 11
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontWeight: "700",
    fontSize: 12,
    overflow: "hidden",
    backgroundColor: "rgba(255,167,38,0.15)",
    color: "#FFA726"
  },
  statusBadgePre: {
    backgroundColor: "rgba(255,167,38,0.15)",
    color: "#FFA726"
  },
  statusBadgeAbnormal: {
    borderWidth: 1,
    borderColor: "#ff9c8f",
    paddingHorizontal: 11,
    paddingVertical: 6,
    fontSize: 13
  },
  moodStrip: {
    marginTop: 10,
    paddingHorizontal: 0,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "transparent",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  moodStripLabel: {
    color: "#FFFFFF",
    fontWeight: "800"
  },
  moodStripValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  moodStripValue: {
    color: colors.text,
    fontWeight: "900"
  },
  moodRow: {
    flexDirection: "row",
    gap: 10,
    marginVertical: 12
  },
  moodRowCompact: {
    flexDirection: "row",
    gap: 10,
    marginVertical: 12
  },
  moodItem: {
    flex: 1,
    aspectRatio: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "#191B22",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  },
  moodItemCompact: {
    flex: 1,
    aspectRatio: 1,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "#191B22",
    alignItems: "center",
    justifyContent: "center",
    gap: 4
  },
  moodItemOn: {
    borderWidth: 2,
    borderColor: "#10B981",
    backgroundColor: "rgba(16,185,129,0.15)"
  },
  moodItemLabel: {
    color: "#8E95A3",
    fontWeight: "500",
    fontSize: 11,
    marginTop: 6,
    textAlign: "center"
  },
  moodItemLabelCompact: {
    color: "#8E95A3",
    fontWeight: "500",
    fontSize: 11,
    marginTop: 6,
    textAlign: "center"
  },
  miniChart: {
    height: 166,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 10,
    position: "relative",
    overflow: "visible"
  },
  miniChartPlot: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0
  },
  limitLine: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#f59e0b"
  },
  limitLineSys: {
    bottom: 66
  },
  limitLineDia: {
    bottom: 42,
    borderColor: "#10b981"
  },
  chartDay: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    position: "relative"
  },
  chartBars: {
    height: 116,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4
  },
  sysBar: {
    width: 10,
    borderRadius: 8,
    backgroundColor: colors.pine
  },
  diaBar: {
    width: 10,
    borderRadius: 8,
    backgroundColor: "#17a36b"
  },
  chartValue: {
    position: "absolute",
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
    zIndex: 4
  },
  chartValueSys: {
    color: colors.text,
    fontWeight: "900"
  },
  chartValueSlash: {
    color: "#7890a6",
    fontWeight: "900"
  },
  chartValueDia: {
    color: colors.text,
    fontWeight: "900"
  },
  chartLabel: {
    position: "absolute",
    bottom: 2,
    color: "#6b8198",
    fontSize: 11
  },
  miniLineSegment: {
    position: "absolute",
    left: "50%",
    width: 42,
    height: 3,
    borderRadius: 3,
    transformOrigin: "left center",
    zIndex: 1
  },
  miniLineSegmentSys: {
    backgroundColor: "#5EEAD4"
  },
  miniLineSegmentDia: {
    backgroundColor: "#FBBF24"
  },
  miniLinePoint: {
    position: "absolute",
    width: 12,
    height: 12,
    marginBottom: -6,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#fff",
    zIndex: 3
  },
  miniLinePointSys: {
    backgroundColor: "#5EEAD4"
  },
  miniLinePointDia: {
    width: 10,
    height: 10,
    marginBottom: -5,
    borderRadius: 5,
    backgroundColor: "#FBBF24"
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8
  },
  legendSys: {
    color: "#5EEAD4",
    fontWeight: "800",
    fontSize: 12
  },
  legendDia: {
    color: "#FBBF24",
    fontWeight: "800",
    fontSize: 12
  },
  legendLimit: {
    color: "#EF4444",
    fontWeight: "800",
    fontSize: 12
  },
  label: {
    marginTop: 10,
    marginBottom: 6,
    color: "#8E95A3",
    fontWeight: "700"
  },
  inputGrid: {
    flexDirection: "row",
    gap: 8
  },
  inputCell: {
    flex: 1
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: colors.bg,
    color: colors.text
  },
  inputMeterWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    backgroundColor: "#13151B",
    paddingVertical: 12,
    paddingHorizontal: 12
  },
  inputMeter: {
    flex: 1,
    borderWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 12,
    minHeight: 52,
    backgroundColor: "transparent",
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center"
  },
  meterHint: {
    marginTop: 8,
    marginBottom: 4,
    color: "#8E95A3",
    fontWeight: "600",
    lineHeight: 20
  },
  buttonPrimary: {
    backgroundColor: "#10B981",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center"
  },
  buttonPrimaryText: {
    color: "#0B0D0E",
    fontWeight: "800"
  },
  buttonSecondary: {
    marginTop: 10,
    height: 44,
    backgroundColor: "transparent",
    borderColor: "rgba(16,185,129,0.4)",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 0,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8
  },
  buttonSecondaryText: {
    color: "#10B981",
    fontWeight: "700",
    fontSize: 12
  },
  message: {
    color: "#067647",
    fontWeight: "700"
  },
  error: {
    color: "#b42318",
    fontWeight: "700"
  },
  bodyText: {
    color: colors.textMuted,
    lineHeight: 21,
    marginTop: 6
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12
  },
  summaryBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 10
  },
  summaryBoxPressable: {
    borderColor: "rgba(224,90,71,0.45)",
    backgroundColor: "rgba(224,90,71,0.12)"
  },
  summaryBoxPressed: {
    backgroundColor: "rgba(224,90,71,0.2)"
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800"
  },
  summaryValue: {
    marginTop: 6,
    color: colors.text,
    fontSize: 17,
    fontWeight: "900"
  },
  summaryMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12
  },
  adviceBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#13231B",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.3)",
    borderRadius: 16,
    padding: 16,
    marginVertical: 8
  },
  pulseBox: {
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#10B981",
    backgroundColor: "#13231B",
    borderRadius: 16,
    padding: 12
  },
  moodAnalysisBox: {
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#10B981",
    backgroundColor: "#13231B",
    borderRadius: 16,
    padding: 12
  },
  pulseAnalysisBox: {
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#10B981",
    backgroundColor: "#13231B",
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.28)",
    gap: 6
  },
  recommendationBox: {
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.pine,
    backgroundColor: colors.bg,
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border
  },
  alertBanner: {
    borderLeftWidth: 5,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(224,90,71,0.35)",
    backgroundColor: "rgba(224,90,71,0.14)",
    padding: 12,
    marginTop: 12
  },
  alertBannerCritical: {
    backgroundColor: "rgba(224,90,71,0.22)",
    borderColor: "rgba(224,90,71,0.55)"
  },
  alertHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  alertIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center"
  },
  alertIconText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900"
  },
  alertHeaderText: {
    flex: 1
  },
  alertTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16
  },
  alertLevelText: {
    marginTop: 2,
    fontSize: 20,
    fontWeight: "900"
  },
  alertBodyText: {
    marginTop: 8,
    color: colors.textMuted,
    lineHeight: 21,
    fontWeight: "800"
  },
  warningBox: {
    marginTop: 12,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: "rgba(245,158,11,0.14)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.35)",
    padding: 12
  },
  adviceTitle: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12
  },
  adviceBody: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 20,
    marginTop: 4,
    fontWeight: "400"
  },
  familyInfoRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  familyInfoText: {
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 12
  },
  connectionBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 12
  },
  connectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800"
  },
  connectionText: {
    marginTop: 4,
    color: colors.text,
    fontWeight: "800"
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  statCell: {
    width: "48%",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    borderRadius: 16,
    padding: 10
  },
  alertRecord: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderLeftWidth: 4,
    borderRadius: 16,
    backgroundColor: colors.card,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  alertRecordPressed: {
    backgroundColor: "rgba(255,255,255,0.06)"
  },
  alertRecordStatus: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "900"
  },
  dateRow: {
    gap: 8,
    paddingVertical: 12
  },
  dateChip: {
    minWidth: 58,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.card,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center"
  },
  dateChipSelected: {
    borderColor: colors.pine,
    backgroundColor: "rgba(133,159,120,0.18)"
  },
  dateChipAbnormal: {
    borderColor: "#E05A47"
  },
  dateChipText: {
    color: colors.text,
    fontWeight: "900"
  },
  dateChipMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 11
  },
  selectedDateTitle: {
    color: colors.text,
    fontWeight: "900",
    marginBottom: 8
  },
  recordCard: {
    borderTopWidth: 1,
    borderTopColor: "#edf3fd",
    paddingVertical: 12
  },
  rowMain: {
    fontWeight: "900",
    color: colors.text,
    fontSize: 16
  },
  rowSub: {
    marginTop: 3,
    color: "#8E95A3",
    fontSize: 12
  },
  recordMood: {
    marginTop: 8,
    color: colors.textMuted,
    fontWeight: "800"
  },
  refreshText: {
    color: colors.pine,
    fontWeight: "900"
  },
  emptyText: {
    color: colors.textMuted,
    paddingVertical: 12
  },
  analysisTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 10
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#121418",
    borderRadius: 8,
    padding: 3,
    marginBottom: 12
  },
  segmentButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center"
  },
  segmentButtonActive: {
    backgroundColor: colors.pine
  },
  segmentButtonText: {
    color: "#8E95A3",
    fontWeight: "900",
    fontSize: 13
  },
  segmentButtonTextActive: {
    color: "#fff"
  },
  longChartFrame: {
    position: "relative",
    borderRadius: 12,
    backgroundColor: "#121418",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 8,
    paddingTop: 20,
    paddingBottom: 10,
    overflow: "visible"
  },
  longChartBody: {
    flexDirection: "row",
    minHeight: LONG_CHART_HEIGHT + LONG_CHART_LABEL_SPACE
  },
  chartYAxis: {
    width: 28,
    position: "relative"
  },
  chartYLabel: {
    position: "absolute",
    left: 0,
    width: 26,
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: "700"
  },
  trendSpanText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8
  },
  bpChartCard: {
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: "#121418",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 12,
    overflow: "hidden"
  },
  bpChartReadout: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
    marginBottom: 8
  },
  bpChartReadoutMuted: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 12,
    marginBottom: 8
  },
  bpChartRow: { flexDirection: "row" },
  bpYCol: { width: 28, position: "relative" },
  bpYLabel: {
    position: "absolute",
    left: 0,
    width: 26,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700"
  },
  bpPlot: {
    flex: 1,
    overflow: "hidden",
    position: "relative"
  },
  bpGuide: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: "dashed"
  },
  bpSeg: {
    position: "absolute",
    height: 2,
    borderRadius: 2,
    transformOrigin: "left center"
  },
  bpSegSys: { backgroundColor: "#5EEAD4" },
  bpSegDia: { backgroundColor: "#FBBF24" },
  bpDotSys: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#5EEAD4",
    borderWidth: 2,
    borderColor: "#FFFFFF"
  },
  bpDotDia: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FBBF24",
    borderWidth: 2,
    borderColor: "#FFFFFF"
  },
  bpXRow: { flexDirection: "row", marginTop: 8, marginLeft: 28 },
  bpXLabel: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center"
  },
  bpLogCard: {
    marginTop: 8,
    gap: 8
  },
  bpLogRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)"
  },
  bpLogWhen: { flex: 1, color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  bpLogVal: { fontSize: 14, fontWeight: "800", width: 88, textAlign: "right", color: "#FFFFFF" },
  bpLogSys: { color: "#5EEAD4", fontWeight: "800" },
  bpLogDia: { color: "#FBBF24", fontWeight: "800" },
  bpLogPulse: { color: "#A8E6CF", fontSize: 12, fontWeight: "700", width: 44, textAlign: "right" },
  bpLogHead: { color: "#8E95A3", fontWeight: "800", fontSize: 11 },
  bpLogPager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    paddingTop: 8
  },
  bpLogPageBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1C1F27"
  },
  bpLogPageBtnOff: { opacity: 0.35 },
  bpLogPageText: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  bpLogPageMeta: { color: "#A8E6CF", fontSize: 13, fontWeight: "700" },
  chartAxisTag: {
    position: "absolute",
    top: 6,
    left: 8,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "900"
  },
  longChart: {
    position: "relative",
    height: 198,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 10,
    overflow: "hidden"
  },
  lineChart: {
    position: "relative",
    flex: 1,
    height: 222,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 32,
    paddingHorizontal: 8,
    overflow: "visible"
  },
  lineChartDay: {
    flex: 1,
    minWidth: 24,
    alignItems: "center",
    position: "relative",
    zIndex: 1
  },
  lineSegment: {
    position: "absolute",
    left: "50%",
    width: 42,
    height: 3,
    borderRadius: 3,
    transformOrigin: "left center"
  },
  lineSegmentSys: {
    backgroundColor: colors.pine
  },
  lineSegmentDia: {
    backgroundColor: "#17a36b"
  },
  linePoint: {
    position: "absolute",
    width: 12,
    height: 12,
    marginBottom: -6,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#fff",
    zIndex: 2
  },
  linePointSys: {
    backgroundColor: colors.pine
  },
  linePointDia: {
    backgroundColor: "#17a36b",
    width: 10,
    height: 10,
    borderRadius: 5
  },
  linePointValue: {
    position: "absolute",
    top: -20,
    left: -10,
    minWidth: 30,
    textAlign: "center",
    color: colors.text,
    fontSize: 10,
    fontWeight: "900"
  },
  lineChartLabel: {
    position: "absolute",
    bottom: 4
  },
  fireMarker: {
    position: "absolute",
    zIndex: 4,
    width: 28,
    height: 28,
    marginBottom: -14,
    borderRadius: 14,
    backgroundColor: "#fff1f0",
    borderWidth: 1,
    borderColor: "#ffb4a8",
    alignItems: "center",
    justifyContent: "center"
  },
  fireMarkerText: {
    fontSize: 17
  },
  longChartDay: {
    flex: 1,
    minWidth: 0,
    alignItems: "center"
  },
  longChartBars: {
    height: 148,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4
  },
  longSysBar: {
    width: 12,
    borderRadius: 8,
    backgroundColor: colors.pine
  },
  longDiaBar: {
    width: 12,
    borderRadius: 8,
    backgroundColor: "#17a36b"
  },
  longLimitSys: {
    bottom: 84
  },
  longLimitDia: {
    bottom: 58,
    borderColor: "#17a36b"
  },
  adviceText: {
    color: "#C8CDD4",
    lineHeight: 21,
    fontWeight: "700"
  },
  chartSummaryRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10
  },
  chartSummaryPill: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#121418",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: "center"
  },
  chartSummaryLabel: {
    color: "#8E95A3",
    fontSize: 11,
    fontWeight: "900"
  },
  chartSummaryValue: {
    marginTop: 3,
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  pulseSummaryBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#2A2110",
    borderRadius: 10,
    borderLeftWidth: 5,
    borderLeftColor: "#f59e0b",
    flexDirection: "row",
    alignItems: "center"
  },
  pulseSummaryItem: {
    flex: 1
  },
  pulseSummaryDivider: {
    width: 1,
    height: 38,
    backgroundColor: "rgba(245,158,11,0.35)",
    marginHorizontal: 10
  },
  pulseSummaryLabel: {
    color: "#FBBF24",
    fontSize: 12,
    fontWeight: "900"
  },
  pulseSummaryValue: {
    marginTop: 4,
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900"
  },
  macroSummaryBox: {
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#121418",
    borderLeftWidth: 5,
    borderLeftColor: "#17a36b"
  },
  macroSummaryTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 15
  },
  macroSummaryMeta: {
    marginTop: 6,
    marginBottom: 10,
    color: "#8E95A3",
    lineHeight: 19,
    fontWeight: "700"
  },
  macroSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8
  },
  macroSummaryDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 8
  },
  macroSummaryDotDanger: {
    backgroundColor: "#cf1322"
  },
  macroSummaryDotWarning: {
    backgroundColor: "#f59e0b"
  },
  macroSummaryDotNormal: {
    backgroundColor: "#17a36b"
  },
  macroSummaryText: {
    flex: 1,
    color: "#8E95A3",
    lineHeight: 19,
    fontWeight: "800"
  },
  macroSummaryObservation: {
    marginTop: 4,
    color: colors.text,
    lineHeight: 20,
    fontWeight: "800"
  },
  moodAnalysisTitle: {
    color: "#8c5a00",
    fontSize: 15,
    fontWeight: "900"
  },
  analysisLabel: {
    alignSelf: "flex-start",
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.72)",
    color: colors.text,
    fontSize: 11,
    fontWeight: "900"
  },
  moodAnalysisText: {
    color: "#5c3b00",
    lineHeight: 20,
    fontWeight: "700"
  },
  moodSourceText: {
    color: "#8c5a00",
    lineHeight: 18,
    fontSize: 12
  },
  analysisToggle: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingVertical: 4
  },
  analysisToggleText: {
    color: colors.pine,
    fontSize: 12,
    fontWeight: "800"
  },
  analysisDetail: {
    marginTop: 6,
    gap: 6
  },
  sourceLinkText: {
    color: colors.pine,
    lineHeight: 19,
    fontSize: 12,
    fontWeight: "900",
    textDecorationLine: "underline",
    marginBottom: 4
  },
  pulseAnalysisTitle: {
    color: "#A8E6CF",
    fontSize: 15,
    fontWeight: "900"
  },
  pulseAnalysisText: {
    color: "#FFFFFF",
    lineHeight: 20,
    fontWeight: "700"
  },
  pulseSourceText: {
    color: "#8E95A3",
    lineHeight: 18,
    fontSize: 12
  },
  diaryDetailHeader: {
    marginTop: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  detailTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 15
  },
  detailMeta: {
    color: colors.textMuted,
    fontWeight: "800"
  },
  emptyDayText: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.card,
    color: colors.textMuted,
    textAlign: "center",
    fontWeight: "800"
  },
  diaryRecordItem: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  recordLeft: {
    flex: 1
  },
  recordText: {
    color: "#70839d",
    fontSize: 12,
    fontWeight: "700"
  },
  recordValueRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3
  },
  recordVal: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  recordPulse: {
    marginTop: 3,
    color: "#b54708",
    fontSize: 12,
    fontWeight: "800"
  },
  levelTag: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8
  },
  levelTagText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900"
  },
  detailModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 31, 51, 0.42)",
    justifyContent: "center",
    padding: 20
  },
  detailModalPanel: {
    borderRadius: 24,
    borderCurve: "continuous",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16
  },
  detailModalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12
  },
  detailModalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900"
  },
  detailModalSub: {
    marginTop: 3,
    color: colors.textMuted,
    fontWeight: "800"
  },
  detailModalClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center"
  },
  detailModalCloseText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 28
  },
  detailAlertPill: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: "rgba(224,90,71,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  detailAlertIcon: {
    fontSize: 20
  },
  detailAlertText: {
    fontSize: 16,
    fontWeight: "900"
  },
  detailStablePill: {
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: "rgba(16,185,129,0.14)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  detailStableText: {
    color: colors.mint,
    fontWeight: "900"
  },
  detailGrid: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8
  },
  detailCell: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: 10,
    alignItems: "center"
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "900"
  },
  detailValue: {
    marginTop: 4,
    color: colors.text,
    fontSize: 22,
    fontWeight: "900"
  },
  detailUnit: {
    color: colors.textMuted,
    fontSize: 11
  },
  detailModalMeta: {
    marginTop: 12,
    color: colors.textMuted,
    fontWeight: "800"
  },
  detailAdvice: {
    marginTop: 8,
    color: "#8E95A3",
    lineHeight: 21,
    fontWeight: "800"
  }
})
