import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Linking,
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

const HEALTH_CONNECT_PERMISSIONS = [
  { accessType: "read", recordType: "BloodPressure" },
  { accessType: "read", recordType: "HeartRate" }
]
const PULSE_MATCH_WINDOW_MS = 15 * 60 * 1000
const UNMARKED_MOOD = "未標記"
const MOOD_OPTIONS = [
  { value: "平靜", emoji: "🙂" },
  { value: "疲倦", emoji: "😌" },
  { value: "焦慮", emoji: "😟" },
  { value: "頭暈", emoji: "😵" }
]
const STRESS_MOODS = new Set(["焦慮", "頭暈"])

function getAndroidHealthConnect() {
  if (Platform.OS !== "android") return null
  try {
    return require("react-native-health-connect")
  } catch {
    return null
  }
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

function formatDateTime(value) {
  return toDate(value).toLocaleString("zh-TW", { hour12: false })
}

function formatShortDate(dateKey) {
  const [, month, day] = dateKey.split("-")
  return `${Number(month)}/${Number(day)}`
}

function formatShortDateTime(value) {
  const date = toDate(value)
  const dateLabel = date.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" })
  const timeLabel = date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })
  return `${dateLabel} ${timeLabel}`
}

function getBpStatus(sys, dia) {
  if (sys >= 180 || dia >= 120) {
    return {
      level: "超高血壓",
      familyLabel: "危險高血壓",
      color: "#cf1322",
      softColor: "#fff1f0",
      category: "danger",
      isAbnormal: true,
      isCritical: true,
      recommendation: "請立即聯絡長輩，確認症狀並評估就醫。"
    }
  }
  if (sys >= 140 || dia >= 90) {
    return {
      level: "高血壓",
      familyLabel: "高血壓警戒",
      color: "#cf1322",
      softColor: "#fff1f0",
      category: "danger",
      isAbnormal: true,
      isCritical: false,
      recommendation: "請儘快確認長輩狀況，安排休息後複測。"
    }
  }
  if (sys < 90 || dia < 60) {
    return {
      level: "偏低",
      familyLabel: "血壓偏低",
      color: "#722ed1",
      softColor: "#f9f0ff",
      category: "warning",
      isAbnormal: true,
      isCritical: false,
      recommendation: "請確認是否頭暈、無力，必要時聯絡醫師。"
    }
  }
  if (sys >= 120 || dia >= 80) {
    return {
      level: "血壓前期",
      familyLabel: "血壓前期",
      color: "#b54708",
      softColor: "#fff7e6",
      category: "warning",
      isAbnormal: false,
      isCritical: false,
      recommendation: "建議增加監測頻率，並留意飲食與作息。"
    }
  }
  return {
    level: "正常",
    familyLabel: "正常",
    color: "#067647",
    softColor: "#ecfdf3",
    category: "normal",
    isAbnormal: false,
    isCritical: false,
    recommendation: "目前血壓穩定，維持固定量測與紀錄。"
  }
}

function getPulseStatus(pulse) {
  if (pulse == null) return { label: "未記錄", color: "#667085" }
  if (pulse < 50) return { label: "心跳偏慢", color: "#722ed1" }
  if (pulse > 100) return { label: "心跳偏快", color: "#cf1322" }
  return { label: "心跳正常", color: "#067647" }
}

function getMoodEmoji(mood) {
  return MOOD_OPTIONS.find(item => item.value === mood)?.emoji || "🙂"
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
    mood: record?.mood || UNMARKED_MOOD,
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

function getSampledTrendSummaries(daily, maxPoints = LONG_TREND_MAX_POINTS) {
  if (daily.length <= maxPoints) return daily
  const step = (daily.length - 1) / (maxPoints - 1)
  return Array.from({ length: maxPoints }, (_, index) => daily[Math.round(index * step)])
}

function getPeriodicObservation(summary) {
  if (!summary.totalDays) return "目前資料量不足，請先累積血壓紀錄。"
  if (summary.danger.percent >= 30) return "高血壓天數比例偏高，建議儘快與醫師討論近期控制策略。"
  if (summary.warning.percent >= 40) return "血壓前期或警示天數較多，建議留意鹽分、睡眠、壓力與固定量測。"
  return "目前大多數紀錄落在穩定範圍，請持續維持規律量測與生活管理。"
}

function getTrendSummary(records, months) {
  const periodRecords = getRecordsWithinMonths(records, months)
  const summary = getHealthSummary(periodRecords)
  return {
    ...summary,
    periodicObservation: getPeriodicObservation(summary)
  }
}

function formatMonthLabel(dateKey) {
  const date = toDate(`${dateKey}T00:00:00`)
  return date.toLocaleDateString("zh-TW", { year: "numeric", month: "long" })
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

function getSourceLabel(source) {
  if (source === "health-connect") return "Health Connect"
  if (source === "manual") return "手動輸入"
  if (source === "mock" || source === "mock-seed") return "舊測試資料"
  return "照護系統"
}

function getFamilyNextStep(latest, abnormalCount) {
  if (!latest) return "等待長輩端同步第一筆血壓資料。"
  if (latest.status.isCritical) return "立即聯絡長輩並確認是否需要就醫。"
  if (latest.status.category === "danger") return "請長輩休息後複測，並通知照顧者持續觀察。"
  if (abnormalCount >= 3) return "近 3 個月異常偏多，建議安排固定量測與門診討論。"
  return "維持每日追蹤，必要時提醒長輩補量測。"
}

function getHealthAdvice(records) {
  if (!records.length) return "尚未有血壓資料，請先從長輩端同步或手動新增紀錄。"
  if (records.some(record => record.status.isCritical)) {
    return "出現 180/120 以上的超高血壓紀錄，請立即確認症狀並評估就醫。"
  }
  if (records.some(record => record.status.category === "danger")) {
    return "近期有高血壓紀錄，建議固定複測並觀察是否與睡眠、飲食或情緒相關。"
  }
  if (records.some(record => record.status.category === "warning")) {
    return "血壓已有前期或偏低訊號，建議維持每日量測並留意身體不適。"
  }
  return "目前血壓趨勢穩定，維持固定量測與健康生活型態。"
}

function getMoodStressAnalysis(records) {
  const recent = records.slice(0, 14)
  const stressHits = recent.filter(record => record.sys > 140 && isStressMood(record.mood)).length
  const markedCount = recent.filter(record => isMarkedMood(record.mood)).length

  if (stressHits > 0) {
    return `近 ${recent.length} 筆中有 ${stressHits} 筆同時出現高血壓與焦慮或頭暈，建議記錄發生情境。`
  }
  if (markedCount > 0) {
    return "已有心情標記，可持續觀察情緒、睡眠與血壓波動的關係。"
  }
  return "尚未累積足夠心情標記，建議每次量測後補上當下感受。"
}

function getPulseMoodAnalysis(records) {
  const recent = records.slice(0, 14)
  const pulseRecords = recent.filter(record => record.pulse != null)
  if (!pulseRecords.length) return "尚未有脈搏資料，Health Connect 同步時會嘗試一起補入。"

  const averagePulse = Math.round(
    pulseRecords.reduce((sum, record) => sum + record.pulse, 0) / pulseRecords.length
  )
  const overlap = pulseRecords.filter(
    record => record.pulse >= 85 && record.sys > 130 && isStressMood(record.mood)
  ).length

  if (overlap > 0) {
    return `有 ${overlap} 筆紀錄同時出現心跳偏快、血壓偏高與壓力心情，建議留意休息與回診討論。`
  }
  return `近期平均脈搏約 ${averagePulse} bpm，可搭配心情標記一起追蹤。`
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
const MINI_CHART_LABEL_SPACE = 40
const LONG_CHART_HEIGHT = 148
const LONG_CHART_LABEL_SPACE = 40
const LONG_TREND_MAX_POINTS = 14

function toChartHeight(value, chartHeight) {
  const ratio = (value - CHART_MIN) / (CHART_MAX - CHART_MIN)
  return Math.max(18, Math.min(chartHeight, ratio * chartHeight))
}

function toChartLineBottom(value, chartHeight, labelSpace) {
  return labelSpace + toChartHeight(value, chartHeight)
}

function getChartPointBottom(value, chartHeight, labelSpace) {
  return labelSpace + toChartHeight(value, chartHeight)
}

function getTrendPoints(summaries, key, chartWidth, chartHeight, labelSpace) {
  if (!summaries.length || !chartWidth) return []
  const step = summaries.length > 1 ? chartWidth / (summaries.length - 1) : 0
  return summaries.map((day, index) => ({
    ...day,
    key: day.key || day.dateKey,
    dateKey: day.dateKey,
    value: day[key],
    x: summaries.length > 1 ? step * index : chartWidth / 2,
    y: getChartPointBottom(day[key], chartHeight, labelSpace)
  }))
}

function TrendLineOverlay({ summaries, chartWidth, onSelectDay }) {
  const plotWidth = Math.max(0, chartWidth - 12)
  const sysPoints = getTrendPoints(summaries, "avgSys", plotWidth, LONG_CHART_HEIGHT, 0)
  const diaPoints = getTrendPoints(summaries, "avgDia", plotWidth, LONG_CHART_HEIGHT, 0)

  return (
    <View style={styles.trendOverlay}>
      <TrendLine points={sysPoints} color="#1f74d1" warningLimit={130} onSelectPoint={onSelectDay} />
      <TrendLine points={diaPoints} color="#17a36b" warningLimit={80} onSelectPoint={onSelectDay} />
    </View>
  )
}

function TrendLine({ points, color, warningLimit, onSelectPoint }) {
  if (!points.length) return null

  return (
    <>
      {points.slice(0, -1).map((point, index) => {
        const next = points[index + 1]
        const dx = next.x - point.x
        const dy = next.y - point.y
        const length = Math.sqrt(dx * dx + dy * dy)
        const angle = Math.atan2(-dy, dx) * (180 / Math.PI)

        return (
          <View
            key={`${point.key}-${next.key}`}
            style={[
              styles.trendSegment,
              {
                left: (point.x + next.x) / 2 - length / 2,
                bottom: (point.y + next.y) / 2,
                width: length,
                backgroundColor: color,
                transform: [{ rotate: `${angle}deg` }]
              }
            ]}
          />
        )
      })}
      {points.map(point => {
        const overLimit = point.value > warningLimit

        return (
          <Pressable
            key={point.key}
            hitSlop={8}
            onPress={() => onSelectPoint(point)}
            style={[
              styles.trendPointButton,
              {
                left: point.x - 18,
                bottom: point.y - 16
              }
            ]}
          >
            {overLimit ? (
              <View style={styles.trendWarningMarker}>
                <Text style={styles.trendWarningText}>!</Text>
              </View>
            ) : null}
            <View style={[styles.trendDot, { borderColor: color }]} />
          </Pressable>
        )
      })}
    </>
  )
}

function MiniTrendChart({ summaries }) {
  if (!summaries.length) {
    return <Text style={styles.emptyText}>{"\u5c1a\u7121\u8840\u58d3\u8da8\u52e2\u8cc7\u6599"}</Text>
  }

  return (
    <View style={styles.miniChart}>
      <View style={[styles.limitLine, { bottom: toChartLineBottom(130, MINI_CHART_HEIGHT, MINI_CHART_LABEL_SPACE) }]} />
      <View
        style={[
          styles.limitLine,
          {
            bottom: toChartLineBottom(80, MINI_CHART_HEIGHT, MINI_CHART_LABEL_SPACE),
            borderColor: "#17a36b"
          }
        ]}
      />
      {summaries.map(day => {
        const sysHeight = toChartHeight(day.avgSys, MINI_CHART_HEIGHT)
        const diaHeight = toChartHeight(day.avgDia, MINI_CHART_HEIGHT)
        return (
          <View key={day.dateKey} style={styles.chartDay}>
            <View style={styles.chartBars}>
              <View style={[styles.sysBar, { height: sysHeight }]} />
              <View style={[styles.diaBar, { height: diaHeight }]} />
            </View>
            <Text style={styles.chartValue}>{day.avgSys}/{day.avgDia}</Text>
            <Text style={styles.chartLabel}>{day.label}</Text>
          </View>
        )
      })}
    </View>
  )
}

function LongTrendChart({ summaries }) {
  const [chartWidth, setChartWidth] = useState(0)
  const [selectedDay, setSelectedDay] = useState(null)

  if (!summaries.length) {
    return <Text style={styles.emptyText}>{"\u5c1a\u7121\u9577\u671f\u8da8\u52e2\u8cc7\u6599"}</Text>
  }

  return (
    <View style={styles.longChartFrame}>
      <Text style={styles.chartAxisTag}>mmHg</Text>
      <View
        style={styles.longChart}
      >
        <View
          style={styles.longTrendPlot}
          onLayout={event => setChartWidth(event.nativeEvent.layout.width)}
        >
          <View style={[styles.limitLine, { bottom: toChartHeight(130, LONG_CHART_HEIGHT) }]} />
          <View
            style={[
              styles.limitLine,
              {
                bottom: toChartHeight(80, LONG_CHART_HEIGHT),
                borderColor: "#17a36b"
              }
            ]}
          />
          <TrendLineOverlay summaries={summaries} chartWidth={chartWidth} onSelectDay={setSelectedDay} />
        </View>
        <View
          style={[
            styles.longChartLabels,
            summaries.length === 1 && styles.longChartLabelsSingle
          ]}
        >
          {summaries.map((day, index) => {
            const showValue = summaries.length <= 7 || index % 2 === 0 || index === summaries.length - 1
            return (
              <View key={day.key || day.dateKey} style={styles.longChartLabelSlot}>
                {showValue ? <Text style={styles.longChartValue}>{day.avgSys}/{day.avgDia}</Text> : null}
                <Text style={styles.chartLabel}>{day.label}</Text>
              </View>
            )
          })}
        </View>
      </View>
      <View style={styles.legendRow}>
        <Text style={styles.legendSys}>{"\u6536\u7e2e\u58d3"}</Text>
        <Text style={styles.legendDia}>{"\u8212\u5f35\u58d3"}</Text>
        <Text style={styles.legendLimit}>{"\u8b66\u793a\u7dda 130/80"}</Text>
      </View>
      <Modal
        transparent
        visible={!!selectedDay}
        animationType="fade"
        onRequestClose={() => setSelectedDay(null)}
      >
        <Pressable style={styles.trendModalBackdrop} onPress={() => setSelectedDay(null)}>
          <Pressable style={styles.trendModalCard} onPress={event => event.stopPropagation()}>
            <Text style={styles.trendModalTitle}>{selectedDay?.title || selectedDay?.dateKey}</Text>
            <Text style={styles.trendModalMeta}>{selectedDay?.label} 每日平均</Text>
            <View style={styles.trendDetailGrid}>
              <View style={styles.trendDetailItem}>
                <Text style={styles.trendDetailLabel}>收縮壓</Text>
                <Text style={styles.trendDetailValue}>{selectedDay?.avgSys} mmHg</Text>
              </View>
              <View style={styles.trendDetailItem}>
                <Text style={styles.trendDetailLabel}>舒張壓</Text>
                <Text style={styles.trendDetailValue}>{selectedDay?.avgDia} mmHg</Text>
              </View>
              <View style={styles.trendDetailItem}>
                <Text style={styles.trendDetailLabel}>平均脈搏</Text>
                <Text style={styles.trendDetailValue}>{selectedDay?.avgPulse ?? "--"} bpm</Text>
              </View>
              <View style={styles.trendDetailItem}>
                <Text style={styles.trendDetailLabel}>紀錄筆數</Text>
                <Text style={styles.trendDetailValue}>{selectedDay?.count ?? 0} 筆</Text>
              </View>
            </View>
            <View style={[styles.trendStatusBox, selectedDay && { borderLeftColor: selectedDay.status.color }]}>
              <Text style={[styles.trendStatusText, selectedDay && { color: selectedDay.status.color }]}>
                {selectedDay?.status.level}
              </Text>
              <Text style={styles.trendStatusAdvice}>{selectedDay?.status.recommendation}</Text>
            </View>
            <Pressable style={styles.trendModalButton} onPress={() => setSelectedDay(null)}>
              <Text style={styles.trendModalButtonText}>關閉</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

function CalendarMonth({ dateKey, days, selectedDate, onSelectDate, onShiftMonth }) {
  return (
    <View style={styles.calendarCard}>
      <View style={styles.calendarHeader}>
        <Pressable style={styles.monthButton} onPress={() => onShiftMonth(-1)}>
          <Text style={styles.monthButtonText}>‹</Text>
        </Pressable>
        <Text style={styles.calendarTitle}>{formatMonthLabel(dateKey)}</Text>
        <Pressable style={styles.monthButton} onPress={() => onShiftMonth(1)}>
          <Text style={styles.monthButtonText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {["日", "一", "二", "三", "四", "五", "六"].map(day => (
          <Text key={day} style={styles.weekLabel}>{day}</Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {days.map(day => {
          if (day.blank) return <View key={day.key} style={styles.customDay} />
          const selected = selectedDate === day.dateKey
          return (
            <Pressable
              key={day.key}
              style={[
                styles.customDay,
                day.hasAbnormal && styles.abnormalDay,
                day.hasDanger && styles.dangerDay,
                selected && styles.selectedDay
              ]}
              onPress={() => onSelectDate(day.dateKey)}
            >
              {day.hasAbnormal ? (
                <Text style={styles.abnormalDayIcon}>{day.hasDanger ? "!" : "•"}</Text>
              ) : null}
              <Text style={[styles.dayLabel, day.hasDanger && styles.dangerDayText]}>
                {day.day}
              </Text>
              {day.topRecord ? (
                <Text
                  style={[
                    styles.dayValue,
                    { color: day.hasDanger ? "#cf1322" : day.topRecord.status.color }
                  ]}
                >
                  {day.topRecord.sys}/{day.topRecord.dia}
                </Text>
              ) : null}
            </Pressable>
          )
        })}
      </View>
      <View style={styles.calendarLegend}>
        <Text style={styles.calendarLegendText}>標記日期代表當天有血壓紀錄，紅框代表有高風險數值。</Text>
      </View>
    </View>
  )
}

export default function BloodPressureScreen({
  role,
  user,
  apiBaseUrl,
  token,
  onBack
}) {
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
  const [completedDailyTasks, setCompletedDailyTasks] = useState({})
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()))
  const [diaryModalDate, setDiaryModalDate] = useState(null)
  const [familyAbnormalModalOpen, setFamilyAbnormalModalOpen] = useState(false)
  const [summaryMonths, setSummaryMonths] = useState(1)
  const [form, setForm] = useState({
    sys: "120",
    dia: "80",
    pulse: "72",
    mood: UNMARKED_MOOD
  })

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
    () => getSampledTrendSummaries(trendSummary.daily),
    [trendSummary]
  )
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
  const todayTaskKey = toDateKey(new Date())
  const selectedRecords = useMemo(
    () => sortRecordsAbnormalFirst(normalizedRecords.filter(record => record.dateKey === selectedDate)),
    [normalizedRecords, selectedDate]
  )
  const diaryModalRecords = useMemo(
    () => diaryModalDate
      ? sortRecordsAbnormalFirst(normalizedRecords.filter(record => record.dateKey === diaryModalDate))
      : [],
    [normalizedRecords, diaryModalDate]
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
  const familyThreeMonthAbnormalRecords = useMemo(
    () => recentThreeMonthRecords.filter(record => record.status.isAbnormal),
    [recentThreeMonthRecords]
  )
  const familyAbnormalRecords = useMemo(
    () => familyThreeMonthAbnormalRecords.slice(0, 6),
    [familyThreeMonthAbnormalRecords]
  )
  const familyRecentSevenTrendSummaries = useMemo(
    () =>
      normalizedRecords
        .slice(0, 7)
        .reverse()
        .map((record, index) => ({
          key: record._id || `${record.measuredAt}-${index}`,
          dateKey: record.dateKey,
          title: formatDateTime(record.measuredAt),
          label: formatShortDateTime(record.measuredAt),
          avgSys: record.sys,
          avgDia: record.dia,
          avgPulse: record.pulse,
          count: 1,
          status: record.status
        })),
    [normalizedRecords]
  )

  const handleSelectDiaryDate = dateKey => {
    setSelectedDate(dateKey)
    setDiaryModalDate(dateKey)
  }
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
        path: `${apiPrefix}/blood-pressure/history?limit=100`,
        token
      })
      setRecords(Array.isArray(data.records) ? data.records : [])
      if (typeof data.linkedPatientEmail === "string") {
        setLinkedPatientEmail(data.linkedPatientEmail)
      }
    } catch (loadError) {
      setError(loadError.message)
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
      setError("家屬端僅能查看長輩資料，請由受顧者端或照顧者端新增血壓紀錄。")
      return
    }

    const sys = Number(form.sys)
    const dia = Number(form.dia)
    const pulse = form.pulse === "" ? "" : Number(form.pulse)

    if (!Number.isFinite(sys) || !Number.isFinite(dia)) {
      setError("請輸入有效的收縮壓與舒張壓。")
      return
    }
    if (sys < 50 || sys > 260 || dia < 30 || dia > 180) {
      setError("血壓數值超出合理範圍，請重新確認。")
      return
    }
    if (form.pulse !== "" && (!Number.isFinite(pulse) || pulse < 30 || pulse > 220)) {
      setError("脈搏需介於 30 到 220 bpm。")
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
        body: { sys, dia, pulse, mood: form.mood }
      })
      const status = getBpStatus(sys, dia)
      setMessage(`已儲存 ${data.record?.sys || sys}/${data.record?.dia || dia} mmHg，狀態：${status.level}`)
      setForm({ sys: "", dia: "", pulse: "", mood: UNMARKED_MOOD })
      await loadHistory()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSync = async () => {
    if (readOnly) {
      setError("家屬端只讀；同步請在受顧者端或照顧者端執行。")
      return
    }

    setSyncing(true)
    setMessage("")
    setError("")
    try {
      if (Platform.OS !== "android") {
        setError("Health Connect 同步目前僅支援 Android 實機。")
        return
      }

      const healthConnect = getAndroidHealthConnect()
      if (!healthConnect?.initialize || !healthConnect?.readRecords) {
        setError("尚未載入 Health Connect 套件，請重新安裝原生 App。")
        return
      }

      const initialized = await healthConnect.initialize()
      if (!initialized) {
        setError("無法初始化 Health Connect，請確認手機已安裝並啟用 Health Connect。")
        return
      }

      let hasPermissions = false
      try {
        const granted = await healthConnect.getGrantedPermissions?.()
        const grantedReads = new Set(
          Array.isArray(granted)
            ? granted.filter(item => item.accessType === "read").map(item => item.recordType)
            : []
        )
        hasPermissions = HEALTH_CONNECT_PERMISSIONS.every(item => grantedReads.has(item.recordType))
      } catch {}

      if (!hasPermissions) {
        const granted = await healthConnect.requestPermission(HEALTH_CONNECT_PERMISSIONS)
        const grantedReads = new Set(
          Array.isArray(granted)
            ? granted.filter(item => item.accessType === "read").map(item => item.recordType)
            : []
        )
        hasPermissions = HEALTH_CONNECT_PERMISSIONS.every(item => grantedReads.has(item.recordType))
      }

      if (!hasPermissions) {
        setError("尚未取得 Health Connect 血壓與心率讀取權限。")
        return
      }

      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000)
      const timeRangeFilter = {
        operator: "between",
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      }

      const bpResult = await healthConnect.readRecords("BloodPressure", { timeRangeFilter })
      const bpRecords = Array.isArray(bpResult?.records) ? bpResult.records : []
      let heartRateRecords = []
      try {
        const heartRateResult = await healthConnect.readRecords("HeartRate", { timeRangeFilter })
        heartRateRecords = Array.isArray(heartRateResult?.records) ? heartRateResult.records : []
      } catch {}

      const mappedRecords = mapHealthConnectBloodPressureRecords(bpRecords, heartRateRecords)
      if (!mappedRecords.length) {
        setMessage("近 30 天 Health Connect 尚無可同步的血壓資料。")
        return
      }

      const data = await apiRequest({
        apiBaseUrl,
        path: `${apiPrefix}/blood-pressure/import`,
        method: "POST",
        token,
        body: { records: mappedRecords }
      })
      setMessage(
        `Health Connect 同步完成：新增 ${data.importedCount || 0} 筆，補入脈搏 ${data.pulseBackfillCount || 0} 筆，略過重複 ${data.skippedCount || 0} 筆。`
      )
      await loadHistory()
    } catch (syncError) {
      setError(
        `${syncError.message || "Health Connect 同步失敗"}。請確認血壓計 App 已寫入 Health Connect，並授權本 App 讀取血壓與心率。`
      )
    } finally {
      setSyncing(false)
    }
  }

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

  const toggleDailyTask = taskKey => {
    const storageKey = `${todayTaskKey}:${taskKey}`
    setCompletedDailyTasks(current => ({
      ...current,
      [storageKey]: !current[storageKey]
    }))
  }

  if (role === "caregiver") {
    const caregiverNextStep = latest
      ? latest.status.isCritical
        ? "立即確認長輩症狀，必要時聯絡家屬並協助就醫。"
        : latest.status.category === "danger"
          ? "請安排長輩休息 5 分鐘後複測，並在照護紀錄中註記。"
          : latest.status.category === "warning"
            ? "持續追蹤今日血壓，留意頭暈、疲倦或焦慮狀態。"
            : "目前狀態穩定，維持例行量測與同步。"
      : "尚無血壓資料，請先同步或手動新增第一筆紀錄。"
    const caregiverDailyTasks = [
      {
        key: "morning-check",
        title: "晨間血壓確認",
        desc: latest ? `最新紀錄 ${latest.sys}/${latest.dia} mmHg` : "同步或新增今日第一筆血壓。"
      },
      {
        key: "mood-note",
        title: "心情狀態註記",
        desc: latest ? `目前標記：${getMoodEmoji(latest.mood)} ${latest.mood}` : "量測後補上長輩當下狀態。"
      },
      {
        key: "family-notify",
        title: "異常通知家屬",
        desc: latest?.status.isAbnormal ? latest.status.recommendation : "目前無需通知，維持觀察。"
      },
      {
        key: "evening-review",
        title: "晚間回顧",
        desc: "交班前確認是否已同步資料並完成必要備註。"
      }
    ]
    const completedCount = caregiverDailyTasks.filter(
      task => completedDailyTasks[`${todayTaskKey}:${task.key}`]
    ).length

    return (
      <View style={styles.screen}>
        <View style={styles.headerCard}>
          <Pressable onPress={onBack}>
            <Text style={styles.backText}>返回</Text>
          </Pressable>
          <Text style={styles.title}>看護血壓照護</Text>
          <Text style={styles.sub}>同步、代輸入與每日照護任務。</Text>
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          {loading ? <ActivityIndicator color="#1f74d1" /> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {latest?.status.isAbnormal ? (
            <View style={[styles.alertBanner, { borderLeftColor: latest.status.color }]}>
              <Text style={styles.alertTitle}>需要看護確認</Text>
              <Text style={styles.bodyText}>{latest.status.recommendation}</Text>
            </View>
          ) : null}

          <View style={[styles.latestCard, latest && { borderLeftColor: latest.status.color, borderLeftWidth: 5 }]}>
            <View style={styles.cardHead}>
              <View>
                <Text style={styles.sectionTitle}>目前照護血壓</Text>
                <Text style={styles.rowSub}>{latest ? formatDateTime(latest.measuredAt) : "尚無紀錄"}</Text>
              </View>
              {latest ? (
                <Text style={[styles.statusBadge, { color: latest.status.color, backgroundColor: latest.status.softColor }]}>
                  {latest.status.level}
                </Text>
              ) : null}
            </View>

            <View style={styles.valueGrid}>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>收縮壓</Text>
                <Text style={styles.bigValue}>{latest?.sys ?? "--"}</Text>
                <Text style={styles.unitText}>mmHg</Text>
              </View>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>舒張壓</Text>
                <Text style={styles.bigValue}>{latest?.dia ?? "--"}</Text>
                <Text style={styles.unitText}>mmHg</Text>
              </View>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>脈搏</Text>
                <Text style={styles.bigValue}>{latest?.pulse ?? "--"}</Text>
                <Text style={styles.unitText}>bpm</Text>
              </View>
            </View>

            <View style={styles.moodStrip}>
              <Text style={styles.moodStripLabel}>心情狀態</Text>
              <Text style={styles.moodStripValue}>
                {latest ? `${getMoodEmoji(latest.mood)} ${latest.mood}` : "--"}
              </Text>
            </View>

            {latest ? (
              <View style={styles.inlineMoodRow}>
                {MOOD_OPTIONS.map(option => (
                  <Pressable
                    key={option.value}
                    style={[styles.moodChipSmall, latest.mood === option.value && styles.moodChipSelected]}
                    onPress={() => updateMood(latest, option.value)}
                  >
                    <Text style={styles.moodChipText}>{option.emoji}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.adviceBox}>
              <Text style={styles.adviceTitle}>看護下一步</Text>
              <Text style={styles.bodyText}>{caregiverNextStep}</Text>
            </View>
          </View>

          <View style={styles.taskCard}>
            <View style={styles.cardHead}>
              <View>
                <Text style={styles.sectionTitle}>今日照護任務</Text>
                <Text style={styles.rowSub}>{completedCount}/{caregiverDailyTasks.length} 已完成</Text>
              </View>
              <Text style={styles.taskDate}>{todayTaskKey}</Text>
            </View>
            {caregiverDailyTasks.map(task => {
              const checked = Boolean(completedDailyTasks[`${todayTaskKey}:${task.key}`])
              return (
                <Pressable
                  key={task.key}
                  style={[styles.taskRow, checked && styles.taskRowDone]}
                  onPress={() => toggleDailyTask(task.key)}
                >
                  <View style={[styles.taskCheck, checked && styles.taskCheckDone]}>
                    <Text style={styles.taskCheckText}>{checked ? "✓" : ""}</Text>
                  </View>
                  <View style={styles.taskBody}>
                    <Text style={[styles.taskTitle, checked && styles.taskTextDone]}>{task.title}</Text>
                    <Text style={styles.taskDesc}>{task.desc}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>同步與代輸入</Text>
            <Pressable style={styles.buttonSecondary} onPress={handleSync} disabled={syncing}>
              {syncing ? (
                <ActivityIndicator color="#1f74d1" />
              ) : (
                <Text style={styles.buttonSecondaryText}>從 Health Connect 同步</Text>
              )}
            </Pressable>

            <Text style={styles.sectionTitleSpacing}>看護手動新增</Text>
            <View style={styles.inputGrid}>
              <View style={styles.inputCell}>
                <Text style={styles.label}>收縮壓</Text>
                <TextInput
                  style={styles.input}
                  value={form.sys}
                  onChangeText={value => updateForm("sys", value)}
                  keyboardType="numeric"
                  placeholder="128"
                />
              </View>
              <View style={styles.inputCell}>
                <Text style={styles.label}>舒張壓</Text>
                <TextInput
                  style={styles.input}
                  value={form.dia}
                  onChangeText={value => updateForm("dia", value)}
                  keyboardType="numeric"
                  placeholder="82"
                />
              </View>
              <View style={styles.inputCell}>
                <Text style={styles.label}>脈搏</Text>
                <TextInput
                  style={styles.input}
                  value={form.pulse}
                  onChangeText={value => updateForm("pulse", value)}
                  keyboardType="numeric"
                  placeholder="76"
                />
              </View>
            </View>

            <Text style={styles.label}>心情</Text>
            <View style={styles.moodGrid}>
              {MOOD_OPTIONS.map(option => (
                <Pressable
                  key={option.value}
                  style={[styles.moodChip, form.mood === option.value && styles.moodChipSelected]}
                  onPress={() => updateForm("mood", option.value)}
                >
                  <Text style={styles.moodEmoji}>{option.emoji}</Text>
                  <Text style={styles.moodLabel}>{option.value}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.buttonPrimary} onPress={handleRecord} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonPrimaryText}>儲存看護血壓紀錄</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    )
  }

  if (false && role === "caregiver") {
    const caregiverPriorityRecords = recentThreeMonthRecords
      .filter(record => record.status.isAbnormal || getPulseStatus(record.pulse).color === "#cf1322")
      .slice(0, 6)
    const caregiverNextStep = latest
      ? latest.status.isCritical
        ? "立即確認長輩症狀，必要時聯絡家屬並協助就醫。"
        : latest.status.category === "danger"
          ? "請安排長輩休息 5 分鐘後複測，並在照護紀錄中註記。"
          : latest.status.category === "warning"
            ? "持續追蹤今日血壓，留意頭暈、疲倦或焦慮狀態。"
            : "目前狀態穩定，維持例行量測與同步。"
      : "尚無血壓資料，請先同步或代為新增第一筆紀錄。"

    return (
      <View style={styles.screen}>
        <View style={styles.headerCard}>
          <Pressable onPress={onBack}>
            <Text style={styles.backText}>返回</Text>
          </Pressable>
          <Text style={styles.title}>看護端血壓照護工作台</Text>
          <Text style={styles.sub}>同步、代輸入、異常優先追蹤與照護建議</Text>
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          {loading ? <ActivityIndicator color="#1f74d1" /> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {latest?.status.isAbnormal ? (
            <View style={[styles.alertBanner, { borderLeftColor: latest.status.color }]}>
              <Text style={styles.alertTitle}>需要看護確認</Text>
              <Text style={styles.bodyText}>{latest.status.recommendation}</Text>
            </View>
          ) : null}

          <View style={[styles.latestCard, latest && { borderLeftColor: latest.status.color, borderLeftWidth: 5 }]}>
            <View style={styles.cardHead}>
              <View>
                <Text style={styles.sectionTitle}>目前照護血壓</Text>
                <Text style={styles.rowSub}>{latest ? formatDateTime(latest.measuredAt) : "尚無紀錄"}</Text>
              </View>
              {latest ? (
                <Text style={[styles.statusBadge, { color: latest.status.color, backgroundColor: latest.status.softColor }]}>
                  {latest.status.level}
                </Text>
              ) : null}
            </View>

            <View style={styles.valueGrid}>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>收縮壓</Text>
                <Text style={styles.bigValue}>{latest?.sys ?? "--"}</Text>
                <Text style={styles.unitText}>mmHg</Text>
              </View>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>舒張壓</Text>
                <Text style={styles.bigValue}>{latest?.dia ?? "--"}</Text>
                <Text style={styles.unitText}>mmHg</Text>
              </View>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>脈搏</Text>
                <Text style={styles.bigValue}>{latest?.pulse ?? "--"}</Text>
                <Text style={styles.unitText}>bpm</Text>
              </View>
            </View>

            <View style={styles.moodStrip}>
              <Text style={styles.moodStripLabel}>心情狀態</Text>
              <Text style={styles.moodStripValue}>
                {latest ? `${getMoodEmoji(latest.mood)} ${latest.mood}` : "--"}
              </Text>
            </View>

            {latest ? (
              <View style={styles.inlineMoodRow}>
                {MOOD_OPTIONS.map(option => (
                  <Pressable
                    key={option.value}
                    style={[styles.moodChipSmall, latest.mood === option.value && styles.moodChipSelected]}
                    onPress={() => updateMood(latest, option.value)}
                  >
                    <Text style={styles.moodChipText}>{option.emoji}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.adviceBox}>
              <Text style={styles.adviceTitle}>看護下一步</Text>
              <Text style={styles.bodyText}>{caregiverNextStep}</Text>
            </View>
          </View>

          <View style={styles.analysisCard}>
            <Text style={styles.sectionTitle}>舊版看護分析</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>近 3 個月異常</Text>
                <Text style={styles.summaryValue}>{familyStats.abnormalCount} 筆</Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>總量測</Text>
                <Text style={styles.summaryValue}>{familyStats.total} 筆</Text>
              </View>
            </View>
            <MiniTrendChart summaries={groupDaily(recentThreeMonthRecords).slice(-7)} />
            <View style={styles.legendRow}>
              <Text style={styles.legendSys}>收縮壓</Text>
              <Text style={styles.legendDia}>舒張壓</Text>
              <Text style={styles.legendLimit}>警戒線 130/80</Text>
            </View>
          </View>

          <View style={styles.historyCard}>
            <View style={styles.cardHead}>
              <Text style={styles.sectionTitle}>優先處理紀錄</Text>
            </View>
            {caregiverPriorityRecords.length ? (
              caregiverPriorityRecords.map(record => (
                <View key={record._id || `${record.dateKey}-${record.sys}-${record.dia}`} style={styles.recordCard}>
                  <View style={styles.cardHead}>
                    <View>
                      <Text style={styles.rowMain}>{record.sys}/{record.dia} mmHg</Text>
                      <Text style={styles.rowSub}>{formatDateTime(record.measuredAt)}</Text>
                      <Text style={styles.rowSub}>脈搏 {record.pulse ?? "--"} bpm・{getSourceLabel(record.source)}</Text>
                    </View>
                    <Text style={[styles.statusBadge, { color: record.status.color, backgroundColor: record.status.softColor }]}>
                      {record.status.level}
                    </Text>
                  </View>
                  <Text style={styles.recordMood}>心情：{getMoodEmoji(record.mood)} {record.mood}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>目前沒有需要優先處理的異常紀錄。</Text>
            )}
          </View>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>同步與代輸入</Text>
            <Pressable style={styles.buttonSecondary} onPress={handleSync} disabled={syncing}>
              {syncing ? (
                <ActivityIndicator color="#1f74d1" />
              ) : (
                <Text style={styles.buttonSecondaryText}>從 Health Connect 同步</Text>
              )}
            </Pressable>

            <Text style={styles.sectionTitleSpacing}>看護代新增一筆</Text>
            <View style={styles.inputGrid}>
              <View style={styles.inputCell}>
                <Text style={styles.label}>收縮壓</Text>
                <TextInput
                  style={styles.input}
                  value={form.sys}
                  onChangeText={value => updateForm("sys", value)}
                  keyboardType="numeric"
                  placeholder="128"
                />
              </View>
              <View style={styles.inputCell}>
                <Text style={styles.label}>舒張壓</Text>
                <TextInput
                  style={styles.input}
                  value={form.dia}
                  onChangeText={value => updateForm("dia", value)}
                  keyboardType="numeric"
                  placeholder="82"
                />
              </View>
              <View style={styles.inputCell}>
                <Text style={styles.label}>脈搏</Text>
                <TextInput
                  style={styles.input}
                  value={form.pulse}
                  onChangeText={value => updateForm("pulse", value)}
                  keyboardType="numeric"
                  placeholder="76"
                />
              </View>
            </View>

            <Text style={styles.label}>心情</Text>
            <View style={styles.moodGrid}>
              {MOOD_OPTIONS.map(option => (
                <Pressable
                  key={option.value}
                  style={[styles.moodChip, form.mood === option.value && styles.moodChipSelected]}
                  onPress={() => updateForm("mood", option.value)}
                >
                  <Text style={styles.moodEmoji}>{option.emoji}</Text>
                  <Text style={styles.moodLabel}>{option.value}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.buttonPrimary} onPress={handleRecord} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonPrimaryText}>儲存看護血壓紀錄</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    )
  }

  if (role === "family") {
    const pulseStatus = getPulseStatus(latest?.pulse)
    const familyNextStep = getFamilyNextStep(latest, familyStats.abnormalCount)
    const connectionLabel = linkedPatientEmail
      ? `已連接長輩：${linkedPatientEmail}`
      : "尚未連接長輩帳號"

    return (
      <View style={styles.screen}>
        <View style={styles.headerCard}>
          <Pressable onPress={onBack}>
            <Text style={styles.backText}>返回</Text>
          </Pressable>
          <Text style={styles.title}>長輩每日血壓監控</Text>
          <Text style={styles.sub}>家屬端固定查看近 3 個月資料</Text>
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.connectionBox}>
            <Text style={styles.connectionTitle}>資料來源</Text>
            <Text style={styles.connectionText}>{connectionLabel}</Text>
          </View>

          {loading ? <ActivityIndicator color="#1f74d1" /> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {latest?.status.isAbnormal ? (
            <View style={[styles.alertBanner, { borderLeftColor: latest.status.color }]}>
              <Text style={styles.alertTitle}>血壓提醒</Text>
              <Text style={styles.bodyText}>{latest.status.recommendation}</Text>
            </View>
          ) : null}

          <View style={[styles.latestCard, latest && { borderLeftColor: latest.status.color, borderLeftWidth: 5 }]}>
            <View style={styles.cardHead}>
              <View>
                <Text style={styles.sectionTitle}>最新一筆血壓同步</Text>
                <Text style={styles.rowSub}>{latest ? formatDateTime(latest.measuredAt) : "尚無紀錄"}</Text>
              </View>
              {latest ? (
                <Text style={[styles.statusBadge, { color: latest.status.color, backgroundColor: latest.status.softColor }]}>
                  {latest.status.familyLabel}
                </Text>
              ) : null}
            </View>

            <View style={styles.valueGrid}>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>收縮壓</Text>
                <Text style={styles.bigValue}>{latest?.sys ?? "--"}</Text>
                <Text style={styles.unitText}>mmHg</Text>
              </View>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>舒張壓</Text>
                <Text style={styles.bigValue}>{latest?.dia ?? "--"}</Text>
                <Text style={styles.unitText}>mmHg</Text>
              </View>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>脈搏</Text>
                <Text style={styles.bigValue}>{latest?.pulse ?? "--"}</Text>
                <Text style={styles.unitText}>bpm</Text>
              </View>
            </View>

            <View style={styles.familyInfoRow}>
              <Text style={styles.familyInfoText}>來源：{getSourceLabel(latest?.source)}</Text>
              <Text style={[styles.familyInfoText, { color: pulseStatus.color }]}>{pulseStatus.label}</Text>
            </View>

            <View style={[styles.recommendationBox, latest && { borderLeftColor: latest.status.color }]}>
              <Text style={styles.adviceTitle}>家屬追蹤重點</Text>
              <Text style={styles.bodyText}>{latest?.status.recommendation || "等待長輩端同步血壓資料。"}</Text>
            </View>
          </View>

          <View style={styles.analysisCard}>
            <Text style={styles.sectionTitle}>家屬追蹤看板</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>目前狀態</Text>
                <Text style={[styles.summaryValue, latest && { color: latest.status.color }]}>
                  {latest?.status.familyLabel || "--"}
                </Text>
              </View>
              <Pressable
                style={[styles.summaryBox, styles.summaryBoxPressable]}
                onPress={() => setFamilyAbnormalModalOpen(true)}
              >
                <Text style={styles.summaryLabel}>近 3 個月異常</Text>
                <Text style={styles.summaryValue}>{familyStats.abnormalCount} 筆</Text>
              </Pressable>
            </View>
            <View style={styles.adviceBox}>
              <Text style={styles.adviceTitle}>家屬下一步</Text>
              <Text style={styles.bodyText}>{familyNextStep}</Text>
            </View>
          </View>

          <View style={styles.analysisCard}>
            <View style={styles.cardHead}>
              <Text style={styles.sectionTitle}>近 7 次血壓趨勢</Text>
            </View>
            <LongTrendChart summaries={familyRecentSevenTrendSummaries} />
          </View>

          <View style={styles.analysisCard}>
            <Text style={styles.sectionTitle}>近 3 個月血壓監控摘要</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Text style={styles.summaryLabel}>平均收縮壓</Text>
                <Text style={styles.summaryValue}>{familyStats.avgSys}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.summaryLabel}>平均舒張壓</Text>
                <Text style={styles.summaryValue}>{familyStats.avgDia}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.summaryLabel}>最高收縮壓</Text>
                <Text style={styles.summaryValue}>{familyStats.maxSys}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.summaryLabel}>最低收縮壓</Text>
                <Text style={styles.summaryValue}>{familyStats.minSys}</Text>
              </View>
            </View>
            <Text style={styles.bodyText}>總量測 {familyStats.total} 筆，異常優先顯示如下。</Text>
            {familyAbnormalRecords.length ? (
              familyAbnormalRecords.map(record => (
                <View key={record._id || `${record.dateKey}-${record.sys}-${record.dia}`} style={styles.alertRecord}>
                  <Text style={styles.rowMain}>{record.sys}/{record.dia} mmHg</Text>
                  <Text style={styles.rowSub}>{formatDateTime(record.measuredAt)}・{record.status.familyLabel}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>目前沒有異常血壓紀錄。</Text>
            )}
          </View>

          <Modal
            transparent
            visible={familyAbnormalModalOpen}
            animationType="fade"
            onRequestClose={() => setFamilyAbnormalModalOpen(false)}
          >
            <Pressable style={styles.diaryModalBackdrop} onPress={() => setFamilyAbnormalModalOpen(false)}>
              <Pressable style={styles.diaryModalCard} onPress={event => event.stopPropagation()}>
                <View style={styles.diaryModalHeader}>
                  <View>
                    <Text style={styles.diaryModalTitle}>近 3 個月異常血壓</Text>
                    <Text style={styles.diaryModalMeta}>{familyThreeMonthAbnormalRecords.length} 筆異常紀錄</Text>
                  </View>
                  <Pressable style={styles.diaryModalClose} onPress={() => setFamilyAbnormalModalOpen(false)}>
                    <Text style={styles.diaryModalCloseText}>×</Text>
                  </Pressable>
                </View>

                {familyThreeMonthAbnormalRecords.length === 0 ? (
                  <Text style={styles.emptyDayText}>目前沒有異常血壓紀錄。</Text>
                ) : (
                  <ScrollView style={styles.diaryModalList}>
                    {familyThreeMonthAbnormalRecords.map(record => (
                      <View key={record._id || `${record.measuredAt}-${record.sys}-${record.dia}`} style={styles.diaryModalRecord}>
                        <View style={styles.recordLeft}>
                          <Text style={styles.recordText}>{formatDateTime(record.measuredAt)}</Text>
                          <View style={styles.recordValueRow}>
                            <Text style={styles.recordVal}>{record.sys}/{record.dia} mmHg</Text>
                          </View>
                          <Text style={styles.recordPulse}>脈搏 {record.pulse ?? "--"} bpm</Text>
                          <Text style={styles.diaryModalAdvice}>{record.status.recommendation}</Text>
                        </View>
                        <View style={[styles.levelTag, { backgroundColor: record.status.color }]}>
                          <Text style={styles.levelTagText}>{record.status.familyLabel}</Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </Pressable>
            </Pressable>
          </Modal>
        </ScrollView>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerCard}>
        <Pressable onPress={onBack}>
          <Text style={styles.backText}>返回</Text>
        </Pressable>
        <Text style={styles.title}>
          {role === "caregiver" ? "照顧者血壓照護" : "長輩每日血壓紀錄"}
        </Text>
        <Text style={styles.sub}>Health Connect 同步、手動新增、趨勢分析與心情日記</Text>
      </View>

      <View style={styles.tabRow}>
        {[
          ["measure", "量測"],
          ["trend", "趨勢"],
          ["diary", "日記"]
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
        {loading ? <ActivityIndicator color="#1f74d1" /> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {activeTab === "measure" ? (
          <>
            <View style={styles.latestCard}>
              <View style={styles.cardHead}>
                <View>
                  <Text style={styles.sectionTitle}>血壓</Text>
                  <Text style={styles.rowSub}>{latest ? formatDateTime(latest.measuredAt) : "尚無紀錄"}</Text>
                </View>
                {latest ? (
                  <Text style={[styles.statusBadge, { color: latest.status.color, backgroundColor: latest.status.softColor }]}>
                    {latest.status.level}
                  </Text>
                ) : null}
              </View>

              <View style={styles.valueGrid}>
                <View style={styles.valueBox}>
                  <Text style={styles.valueLabel}>收縮壓</Text>
                  <Text style={styles.bigValue}>{latest?.sys ?? "--"}</Text>
                  <Text style={styles.unitText}>mmHg</Text>
                </View>
                <View style={styles.valueBox}>
                  <Text style={styles.valueLabel}>舒張壓</Text>
                  <Text style={styles.bigValue}>{latest?.dia ?? "--"}</Text>
                  <Text style={styles.unitText}>mmHg</Text>
                </View>
                <View style={styles.valueBox}>
                  <Text style={styles.valueLabel}>脈搏</Text>
                  <Text style={styles.bigValue}>{latest?.pulse ?? "--"}</Text>
                  <Text style={styles.unitText}>bpm</Text>
                </View>
              </View>

              <View style={styles.moodStrip}>
                <Text style={styles.moodStripLabel}>心情狀態</Text>
                <Text style={styles.moodStripValue}>
                  {latest ? `${getMoodEmoji(latest.mood)} ${latest.mood}` : "--"}
                </Text>
              </View>

              {latest ? (
                <View style={styles.inlineMoodRow}>
                  {MOOD_OPTIONS.map(option => (
                    <Pressable
                      key={option.value}
                      style={[styles.moodChipSmall, latest.mood === option.value && styles.moodChipSelected]}
                      onPress={() => updateMood(latest, option.value)}
                    >
                      <Text style={styles.moodChipText}>{option.emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <Text style={styles.sectionHint}>近 5 日趨勢</Text>
              <MiniTrendChart summaries={latestFiveDays} />
              <View style={styles.legendRow}>
                <Text style={styles.legendSys}>收縮壓</Text>
                <Text style={styles.legendDia}>舒張壓</Text>
                <Text style={styles.legendLimit}>警戒線 130/80</Text>
              </View>

              {warningDays.length ? (
                <View style={styles.warningBox}>
                  <Text style={styles.adviceTitle}>每日警示</Text>
                  {warningDays.map(day => (
                    <Text key={day.dateKey} style={styles.bodyText}>
                      {day.label} 平均 {day.avgSys}/{day.avgDia}，{day.status.level}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>自動匯入</Text>
              <Pressable style={styles.buttonSecondary} onPress={handleSync} disabled={syncing}>
                {syncing ? (
                  <ActivityIndicator color="#1f74d1" />
                ) : (
                  <Text style={styles.buttonSecondaryText}>從 Health Connect 同步</Text>
                )}
              </Pressable>

              <Text style={styles.sectionTitleSpacing}>新增一筆紀錄</Text>
              <View style={styles.inputGrid}>
                <View style={styles.inputCell}>
                  <Text style={styles.label}>收縮壓</Text>
                  <TextInput
                    style={styles.input}
                    value={form.sys}
                    onChangeText={value => updateForm("sys", value)}
                    keyboardType="numeric"
                    placeholder="128"
                  />
                </View>
                <View style={styles.inputCell}>
                  <Text style={styles.label}>舒張壓</Text>
                  <TextInput
                    style={styles.input}
                    value={form.dia}
                    onChangeText={value => updateForm("dia", value)}
                    keyboardType="numeric"
                    placeholder="82"
                  />
                </View>
                <View style={styles.inputCell}>
                  <Text style={styles.label}>脈搏</Text>
                  <TextInput
                    style={styles.input}
                    value={form.pulse}
                    onChangeText={value => updateForm("pulse", value)}
                    keyboardType="numeric"
                    placeholder="76"
                  />
                </View>
              </View>

              <Text style={styles.label}>心情</Text>
              <View style={styles.moodGrid}>
                {MOOD_OPTIONS.map(option => (
                  <Pressable
                    key={option.value}
                    style={[styles.moodChip, form.mood === option.value && styles.moodChipSelected]}
                    onPress={() => updateForm("mood", option.value)}
                  >
                    <Text style={styles.moodEmoji}>{option.emoji}</Text>
                    <Text style={styles.moodLabel}>{option.value}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable style={styles.buttonPrimary} onPress={handleRecord} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonPrimaryText}>儲存血壓紀錄</Text>
                )}
              </Pressable>
            </View>
          </>
        ) : null}

        {activeTab === "trend" ? (
          <View style={styles.analysisCard}>
            <Text style={styles.analysisTitle}>{"\u9577\u671f\u8840\u58d3\u8da8\u52e2"}</Text>
            <View style={styles.segmentedControl}>
              {HEALTH_SUMMARY_RANGES.map(range => {
                const selected = summaryMonths === range.months
                return (
                  <Pressable
                    key={range.months}
                    style={[styles.segmentButton, selected && styles.segmentButtonActive]}
                    onPress={() => setSummaryMonths(range.months)}
                  >
                    <Text style={[styles.segmentButtonText, selected && styles.segmentButtonTextActive]}>
                      {range.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <LongTrendChart summaries={trendChartSummaries} />

            <View style={styles.chartSummaryRow}>
              <View style={styles.chartSummaryPill}>
                <Text style={styles.chartSummaryLabel}>{"\u7d00\u9304\u5929\u6578"}</Text>
                <Text style={styles.chartSummaryValue}>{trendSummary.totalDays}</Text>
              </View>
              <View style={styles.chartSummaryPill}>
                <Text style={styles.chartSummaryLabel}>{"\u9ad8\u98a8\u96aa"}</Text>
                <Text style={styles.chartSummaryValue}>{trendSummary.danger.days}</Text>
              </View>
              <View style={styles.chartSummaryPill}>
                <Text style={styles.chartSummaryLabel}>{"\u8b66\u793a"}</Text>
                <Text style={styles.chartSummaryValue}>{trendSummary.warning.days}</Text>
              </View>
            </View>

            <View style={styles.adviceBox}>
              <Text style={styles.adviceText}>{getHealthAdvice(trendRecords)}</Text>
            </View>

            {trendPulseRecords.length ? (
              <View style={styles.pulseSummaryBox}>
                <View style={styles.pulseSummaryItem}>
                  <Text style={styles.pulseSummaryLabel}>{"\u5e73\u5747\u8108\u640f"}</Text>
                  <Text style={styles.pulseSummaryValue}>{avgTrendPulse} bpm</Text>
                </View>
                <View style={styles.pulseSummaryDivider} />
                <View style={styles.pulseSummaryItem}>
                  <Text style={styles.pulseSummaryLabel}>{"\u6700\u8fd1\u8108\u640f"}</Text>
                  <Text style={styles.pulseSummaryValue}>{latestTrendPulse} bpm</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.macroSummaryBox}>
              <Text style={styles.macroSummaryTitle}>{"\u8fd1"} {summaryMonths} {"\u500b\u6708\u5065\u5eb7\u6458\u8981"}</Text>
              <Text style={styles.macroSummaryMeta}>
                {"\u7d71\u8a08"} {trendSummary.totalDays} {"\u500b\u6709\u7d00\u9304\u7684\u65e5\u671f\uff0c\u4f9d\u6bcf\u65e5\u5e73\u5747\u8840\u58d3\u5206\u985e\u3002"}
              </Text>
              <View style={styles.macroSummaryRow}>
                <View style={[styles.macroSummaryDot, styles.macroSummaryDotDanger]} />
                <Text style={styles.macroSummaryText}>
                  {"\u9ad8\u8840\u58d3\u98a8\u96aa\u5929\u6578\uff1a"}{trendSummary.danger.days}{" \u5929\uff08"}{trendSummary.danger.percent}{"%\uff09"}
                </Text>
              </View>
              <View style={styles.macroSummaryRow}>
                <View style={[styles.macroSummaryDot, styles.macroSummaryDotWarning]} />
                <Text style={styles.macroSummaryText}>
                  {"\u8840\u58d3\u524d\u671f/\u8b66\u793a\u5929\u6578\uff1a"}{trendSummary.warning.days}{" \u5929\uff08"}{trendSummary.warning.percent}{"%\uff09"}
                </Text>
              </View>
              <View style={styles.macroSummaryRow}>
                <View style={[styles.macroSummaryDot, styles.macroSummaryDotNormal]} />
                <Text style={styles.macroSummaryText}>
                  {"\u6b63\u5e38\u5929\u6578\uff1a"}{trendSummary.normal.days}{" \u5929\uff08"}{trendSummary.normal.percent}{"%\uff09"}
                </Text>
              </View>
              <Text style={styles.macroSummaryObservation}>{trendSummary.periodicObservation}</Text>
            </View>

            <View style={styles.moodAnalysisBox}>
              <Text style={styles.moodAnalysisTitle}>{"\u8840\u58d3\u8207\u5fc3\u7406\u72c0\u614b\u95dc\u806f\u6027\u5206\u6790"}</Text>
              <Text style={styles.analysisLabel}>{"\u89c0\u5bdf"}</Text>
              <Text style={styles.moodAnalysisText}>{getMoodStressAnalysis(trendRecords)}</Text>
              <Text style={styles.analysisLabel}>{"\u53c3\u8003\u4f86\u6e90"}</Text>
              <Text
                style={styles.sourceLinkText}
                onPress={() => Linking.openURL("https://www.heart.org/en/health-topics/high-blood-pressure/changes-you-can-make-to-manage-high-blood-pressure/managing-stress-to-control-high-blood-pressure")}
              >
                American Heart Association - Managing Stress to Control High Blood Pressure
              </Text>
              <Text style={styles.moodSourceText}>
                {"\u58d3\u529b\u53ef\u80fd\u9020\u6210\u77ed\u66ab\u8840\u58d3\u4e0a\u5347\uff0c\u5efa\u8b70\u642d\u914d\u547c\u5438\u3001\u904b\u52d5\u3001\u7761\u7720\u8207\u751f\u6d3b\u7fd2\u6163\u7ba1\u7406\u3002\u672c\u5206\u6790\u50c5\u4f9b\u53c3\u8003\uff0c\u4e0d\u80fd\u53d6\u4ee3\u91ab\u7642\u8a3a\u65b7\u3002"}
              </Text>
            </View>

            <View style={styles.pulseAnalysisBox}>
              <Text style={styles.pulseAnalysisTitle}>{"\u8108\u640f\u8207\u60c5\u7dd2\u58d3\u529b\u5206\u6790"}</Text>
              <Text style={styles.analysisLabel}>{"\u89c0\u5bdf"}</Text>
              <Text style={styles.pulseAnalysisText}>{getPulseMoodAnalysis(trendRecords)}</Text>
              <Text style={styles.analysisLabel}>{"\u53c3\u8003\u4f86\u6e90"}</Text>
              <Text
                style={styles.sourceLinkText}
                onPress={() => Linking.openURL("https://www.health.harvard.edu/heart-health/hows-your-heart-rate-and-why-it-matters")}
              >
                Harvard Health Publishing - How's your heart rate and why it matters?
              </Text>
              <Text style={styles.pulseSourceText}>
                {"\u5b89\u975c\u72c0\u614b\u4e0b\u7684\u8108\u640f\u6703\u53d7\u60c5\u7dd2\u3001\u58d3\u529b\u3001\u6d3b\u52d5\u91cf\u8207\u85e5\u7269\u5f71\u97ff\uff0c\u8acb\u642d\u914d\u8840\u58d3\u3001\u5fc3\u60c5\u8207\u75c7\u72c0\u4e00\u8d77\u89c0\u5bdf\u3002"}
              </Text>
            </View>
          </View>
        ) : null}

        {activeTab === "diary" ? (
          <View style={styles.historyCard}>
            <View style={styles.cardHead}>
              <Text style={styles.sectionTitle}>血壓日記</Text>
            </View>

            <CalendarMonth
              dateKey={selectedDate}
              days={calendarDays}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDiaryDate}
              onShiftMonth={offset => setSelectedDate(current => shiftMonth(current, offset))}
            />

            <View style={styles.diaryDetailHeader}>
              <Text style={styles.detailTitle}>{selectedDate} 的紀錄</Text>
              <Text style={styles.detailMeta}>{selectedRecords.length} 筆</Text>
            </View>
            {selectedRecords.length === 0 ? (
              <Text style={styles.emptyDayText}>這天沒有血壓紀錄</Text>
            ) : (
              selectedRecords.map(record => (
                <View key={record._id || `${record.dateKey}-${record.sys}-${record.dia}`} style={styles.diaryRecordItem}>
                  <View style={styles.recordLeft}>
                    <Text style={styles.recordText}>{formatDateTime(record.measuredAt)}</Text>
                    <View style={styles.recordValueRow}>
                      <Text style={styles.recordVal}>{record.sys}/{record.dia} mmHg</Text>
                      <Text style={styles.recordMoodIcon}>{getMoodEmoji(record.mood)}</Text>
                    </View>
                    <Text style={styles.recordPulse}>脈搏 {record.pulse ?? "--"} bpm</Text>
                    <Text style={styles.recordMood}>心情：{getMoodEmoji(record.mood)} {record.mood}</Text>
                    <View style={styles.recordMoodPicker}>
                      {MOOD_OPTIONS.map(option => (
                        <Pressable
                          key={option.value}
                          style={[styles.recordMoodChip, record.mood === option.value && styles.recordMoodChipSelected]}
                          onPress={() => updateMood(record, option.value)}
                        >
                          <Text style={styles.recordMoodChipText}>{option.emoji}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View style={[styles.levelTag, { backgroundColor: record.status.color }]}>
                    <Text style={styles.levelTagText}>{record.status.level}</Text>
                  </View>
                </View>
              ))
            )}

            <Modal
              transparent
              visible={!!diaryModalDate}
              animationType="fade"
              onRequestClose={() => setDiaryModalDate(null)}
            >
              <Pressable style={styles.diaryModalBackdrop} onPress={() => setDiaryModalDate(null)}>
                <Pressable style={styles.diaryModalCard} onPress={event => event.stopPropagation()}>
                  <View style={styles.diaryModalHeader}>
                    <View>
                      <Text style={styles.diaryModalTitle}>{diaryModalDate} 的紀錄</Text>
                      <Text style={styles.diaryModalMeta}>{diaryModalRecords.length} 筆血壓資料</Text>
                    </View>
                    <Pressable style={styles.diaryModalClose} onPress={() => setDiaryModalDate(null)}>
                      <Text style={styles.diaryModalCloseText}>×</Text>
                    </Pressable>
                  </View>

                  {diaryModalRecords.length === 0 ? (
                    <Text style={styles.emptyDayText}>這天沒有血壓紀錄</Text>
                  ) : (
                    <ScrollView style={styles.diaryModalList}>
                      {diaryModalRecords.map(record => (
                        <View key={record._id || `${record.dateKey}-${record.sys}-${record.dia}`} style={styles.diaryModalRecord}>
                          <View style={styles.recordLeft}>
                            <Text style={styles.recordText}>{formatDateTime(record.measuredAt)}</Text>
                            <View style={styles.recordValueRow}>
                              <Text style={styles.recordVal}>{record.sys}/{record.dia} mmHg</Text>
                              <Text style={styles.recordMoodIcon}>{getMoodEmoji(record.mood)}</Text>
                            </View>
                            <Text style={styles.recordPulse}>脈搏 {record.pulse ?? "--"} bpm</Text>
                            <Text style={styles.recordMood}>心情：{getMoodEmoji(record.mood)} {record.mood}</Text>
                            <Text style={styles.diaryModalAdvice}>{record.status.recommendation}</Text>
                          </View>
                          <View style={[styles.levelTag, { backgroundColor: record.status.color }]}>
                            <Text style={styles.levelTagText}>{record.status.level}</Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </Pressable>
              </Pressable>
            </Modal>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f2f7ff"
  },
  container: {
    padding: 16,
    gap: 12,
    paddingBottom: 28
  },
  headerCard: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#d8e6ff",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12
  },
  backText: {
    color: "#1f74d1",
    fontWeight: "800"
  },
  title: {
    marginTop: 8,
    fontSize: 21,
    fontWeight: "800",
    color: "#11355c"
  },
  sub: {
    marginTop: 4,
    color: "#4e6482",
    lineHeight: 20
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#d8e6ff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8
  },
  tabBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d7e4f6",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fbff"
  },
  tabBtnActive: {
    backgroundColor: "#1f74d1",
    borderColor: "#1f74d1"
  },
  tabText: {
    color: "#1f507f",
    fontWeight: "800"
  },
  tabTextActive: {
    color: "#fff"
  },
  latestCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 14
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 14
  },
  analysisCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 14
  },
  historyCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 14
  },
  taskCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 14,
    gap: 10
  },
  taskDate: {
    color: "#526b88",
    fontSize: 12,
    fontWeight: "900"
  },
  taskRow: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: "#e1ebf8",
    backgroundColor: "#f8fbff",
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  taskRowDone: {
    backgroundColor: "#f0f9f5",
    borderColor: "#b7ebd0"
  },
  taskCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#9bb3ce",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff"
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
    color: "#173e67",
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
    color: "#173e67"
  },
  sectionTitleSpacing: {
    marginTop: 18,
    marginBottom: 4,
    fontSize: 18,
    fontWeight: "800",
    color: "#173e67"
  },
  sectionHint: {
    marginTop: 14,
    marginBottom: 6,
    color: "#4f6582",
    fontWeight: "800"
  },
  valueGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12
  },
  valueBox: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#f7fbff",
    borderWidth: 1,
    borderColor: "#e1ebf8",
    padding: 10,
    alignItems: "center"
  },
  valueLabel: {
    color: "#59728e",
    fontSize: 12,
    fontWeight: "700"
  },
  bigValue: {
    marginTop: 4,
    fontSize: 25,
    fontWeight: "900",
    color: "#11355c"
  },
  unitText: {
    marginTop: 2,
    color: "#70839d",
    fontSize: 11
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontWeight: "900",
    fontSize: 12,
    overflow: "hidden"
  },
  moodStrip: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#fff7e6",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  moodStripLabel: {
    color: "#8c5a00",
    fontWeight: "800"
  },
  moodStripValue: {
    color: "#ad6800",
    fontWeight: "900"
  },
  inlineMoodRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10
  },
  moodChipSmall: {
    width: 38,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8e1ed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fafcff"
  },
  moodChipText: {
    fontSize: 17
  },
  miniChart: {
    height: 166,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 10,
    position: "relative",
    overflow: "hidden"
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
    alignItems: "center"
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
    backgroundColor: "#1f74d1"
  },
  diaBar: {
    width: 10,
    borderRadius: 8,
    backgroundColor: "#17a36b"
  },
  chartValue: {
    marginTop: 5,
    color: "#173e67",
    fontSize: 11,
    fontWeight: "800"
  },
  chartLabel: {
    marginTop: 2,
    color: "#6b8198",
    fontSize: 11
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8
  },
  legendSys: {
    color: "#1f74d1",
    fontWeight: "800",
    fontSize: 12
  },
  legendDia: {
    color: "#17a36b",
    fontWeight: "800",
    fontSize: 12
  },
  legendLimit: {
    color: "#b54708",
    fontWeight: "800",
    fontSize: 12
  },
  label: {
    marginTop: 10,
    marginBottom: 6,
    color: "#244569",
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
    borderColor: "#c8d8ee",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "#fbfdff",
    color: "#173e67"
  },
  moodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12
  },
  moodChip: {
    flexBasis: "48%",
    minHeight: 58,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d8e1ed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fafcff"
  },
  moodChipSelected: {
    borderColor: "#1f74d1",
    backgroundColor: "#edf6ff"
  },
  moodEmoji: {
    fontSize: 20
  },
  moodLabel: {
    marginTop: 2,
    color: "#31587d",
    fontWeight: "800"
  },
  buttonPrimary: {
    backgroundColor: "#1f74d1",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  buttonPrimaryText: {
    color: "#fff",
    fontWeight: "900"
  },
  buttonSecondary: {
    marginTop: 10,
    backgroundColor: "#fff",
    borderColor: "#c7d8ed",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center"
  },
  buttonSecondaryText: {
    color: "#1f74d1",
    fontWeight: "900"
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
    color: "#4f6682",
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
    borderColor: "#e1ebf8",
    backgroundColor: "#f8fbff",
    borderRadius: 10,
    padding: 10
  },
  summaryBoxPressable: {
    borderColor: "#1f74d1",
    backgroundColor: "#edf6ff"
  },
  summaryLabel: {
    color: "#607990",
    fontSize: 11,
    fontWeight: "800"
  },
  summaryValue: {
    marginTop: 6,
    color: "#173e67",
    fontSize: 17,
    fontWeight: "900"
  },
  summaryMeta: {
    marginTop: 2,
    color: "#7890a6",
    fontSize: 12
  },
  adviceBox: {
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#1f74d1",
    backgroundColor: "#edf6ff",
    borderRadius: 10,
    padding: 12
  },
  pulseBox: {
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#2f54eb",
    backgroundColor: "#f0f5ff",
    borderRadius: 10,
    padding: 12
  },
  moodAnalysisBox: {
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#faad14",
    backgroundColor: "#fff7e6",
    borderRadius: 10,
    padding: 12
  },
  pulseAnalysisBox: {
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#2f54eb",
    backgroundColor: "#f0f5ff",
    borderRadius: 10,
    padding: 12
  },
  recommendationBox: {
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#1f74d1",
    backgroundColor: "#f8fbff",
    borderRadius: 10,
    padding: 12
  },
  alertBanner: {
    borderLeftWidth: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffd8d2",
    backgroundColor: "#fff7f6",
    padding: 12
  },
  alertTitle: {
    color: "#b42318",
    fontWeight: "900"
  },
  warningBox: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: "#fff7e6",
    borderWidth: 1,
    borderColor: "#fedf89",
    padding: 12
  },
  adviceTitle: {
    color: "#173e67",
    fontWeight: "900"
  },
  familyInfoRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  familyInfoText: {
    color: "#4f6682",
    fontWeight: "800",
    fontSize: 12
  },
  connectionBox: {
    backgroundColor: "#f8fbff",
    borderWidth: 1,
    borderColor: "#d8e6ff",
    borderRadius: 12,
    padding: 12
  },
  connectionTitle: {
    color: "#174a7c",
    fontSize: 13,
    fontWeight: "900"
  },
  connectionText: {
    marginTop: 4,
    color: "#526b88",
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
    borderColor: "#e1ebf8",
    backgroundColor: "#f8fbff",
    borderRadius: 10,
    padding: 10
  },
  alertRecord: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#edf3fd",
    paddingTop: 10
  },
  dateRow: {
    gap: 8,
    paddingVertical: 12
  },
  dateChip: {
    minWidth: 58,
    borderWidth: 1,
    borderColor: "#d8e1ed",
    borderRadius: 10,
    backgroundColor: "#fafcff",
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center"
  },
  dateChipSelected: {
    borderColor: "#1f74d1",
    backgroundColor: "#edf6ff"
  },
  dateChipAbnormal: {
    borderColor: "#cf1322"
  },
  dateChipText: {
    color: "#173e67",
    fontWeight: "900"
  },
  dateChipMeta: {
    marginTop: 2,
    color: "#70839d",
    fontSize: 11
  },
  selectedDateTitle: {
    color: "#173e67",
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
    color: "#173e67",
    fontSize: 16
  },
  rowSub: {
    marginTop: 3,
    color: "#70839d",
    fontSize: 12
  },
  recordMood: {
    marginTop: 8,
    color: "#4f6682",
    fontWeight: "800"
  },
  refreshText: {
    color: "#1f74d1",
    fontWeight: "900"
  },
  emptyText: {
    color: "#6a7e99",
    paddingVertical: 12
  },
  analysisTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#173e67",
    marginBottom: 10
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#eef6ff",
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
    backgroundColor: "#1f74d1"
  },
  segmentButtonText: {
    color: "#4f6682",
    fontWeight: "900",
    fontSize: 13
  },
  segmentButtonTextActive: {
    color: "#fff"
  },
  longChartFrame: {
    position: "relative",
    borderRadius: 12,
    backgroundColor: "#f7fbff",
    borderWidth: 1,
    borderColor: "#d8e6ff",
    paddingHorizontal: 10,
    paddingTop: 20,
    paddingBottom: 10,
    overflow: "hidden"
  },
  chartAxisTag: {
    position: "absolute",
    top: 6,
    left: 8,
    color: "#1f507f",
    fontSize: 10,
    fontWeight: "900"
  },
  longChart: {
    position: "relative",
    minHeight: 232,
    paddingTop: 10,
    overflow: "visible"
  },
  longTrendPlot: {
    position: "relative",
    height: 174,
    marginHorizontal: 6,
    overflow: "visible"
  },
  longChartLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 9
  },
  longChartLabelsSingle: {
    justifyContent: "center"
  },
  longChartLabelSlot: {
    flex: 1,
    minWidth: 0,
    alignItems: "center"
  },
  trendOverlay: {
    position: "absolute",
    left: 6,
    right: 6,
    top: 0,
    bottom: 0,
    zIndex: 4
  },
  trendSegment: {
    position: "absolute",
    height: 3,
    borderRadius: 3,
    opacity: 0.9
  },
  trendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    backgroundColor: "#fff"
  },
  trendPointButton: {
    position: "absolute",
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  trendWarningMarker: {
    position: "absolute",
    bottom: 26,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#cf1322",
    alignItems: "center",
    justifyContent: "center"
  },
  trendWarningText: {
    color: "#fff",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900"
  },
  longChartValue: {
    minHeight: 14,
    color: "#173e67",
    fontSize: 10,
    fontWeight: "900"
  },
  longSysBar: {
    width: 12,
    borderRadius: 8,
    backgroundColor: "#1f74d1"
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
  trendModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 28, 48, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20
  },
  trendModalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 16
  },
  trendModalTitle: {
    color: "#173e67",
    fontSize: 18,
    fontWeight: "900"
  },
  trendModalMeta: {
    marginTop: 3,
    color: "#607990",
    fontSize: 12,
    fontWeight: "800"
  },
  trendDetailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  trendDetailItem: {
    width: "48%",
    borderRadius: 8,
    backgroundColor: "#f7fbff",
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 10
  },
  trendDetailLabel: {
    color: "#607990",
    fontSize: 11,
    fontWeight: "900"
  },
  trendDetailValue: {
    marginTop: 4,
    color: "#173e67",
    fontSize: 15,
    fontWeight: "900"
  },
  trendStatusBox: {
    marginTop: 12,
    borderLeftWidth: 5,
    borderLeftColor: "#1f74d1",
    backgroundColor: "#f8fbff",
    borderRadius: 8,
    padding: 10
  },
  trendStatusText: {
    fontWeight: "900"
  },
  trendStatusAdvice: {
    marginTop: 4,
    color: "#4f6682",
    lineHeight: 20,
    fontWeight: "700"
  },
  trendModalButton: {
    marginTop: 14,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "#1f74d1",
    alignItems: "center",
    justifyContent: "center"
  },
  trendModalButtonText: {
    color: "#fff",
    fontWeight: "900"
  },
  adviceText: {
    color: "#1f507f",
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
    borderColor: "#d8e6ff",
    backgroundColor: "#f8fbff",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: "center"
  },
  chartSummaryLabel: {
    color: "#607990",
    fontSize: 11,
    fontWeight: "900"
  },
  chartSummaryValue: {
    marginTop: 3,
    color: "#173e67",
    fontSize: 18,
    fontWeight: "900"
  },
  pulseSummaryBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#fff7e6",
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
    backgroundColor: "#fedf89",
    marginHorizontal: 10
  },
  pulseSummaryLabel: {
    color: "#8c5a00",
    fontSize: 12,
    fontWeight: "900"
  },
  pulseSummaryValue: {
    marginTop: 4,
    color: "#ad6800",
    fontSize: 18,
    fontWeight: "900"
  },
  macroSummaryBox: {
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#f7fbff",
    borderLeftWidth: 5,
    borderLeftColor: "#17a36b"
  },
  macroSummaryTitle: {
    color: "#173e67",
    fontWeight: "900",
    fontSize: 15
  },
  macroSummaryMeta: {
    marginTop: 6,
    marginBottom: 10,
    color: "#4f6682",
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
    color: "#244569",
    lineHeight: 19,
    fontWeight: "800"
  },
  macroSummaryObservation: {
    marginTop: 4,
    color: "#173e67",
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
    color: "#173e67",
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
  sourceLinkText: {
    color: "#1f74d1",
    lineHeight: 19,
    fontSize: 12,
    fontWeight: "900",
    textDecorationLine: "underline",
    marginBottom: 4
  },
  pulseAnalysisTitle: {
    color: "#173e67",
    fontSize: 15,
    fontWeight: "900"
  },
  pulseAnalysisText: {
    color: "#1f507f",
    lineHeight: 20,
    fontWeight: "700"
  },
  pulseSourceText: {
    color: "#4f6682",
    lineHeight: 18,
    fontSize: 12
  },
  calendarCard: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: "#f8fbff",
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 10
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  calendarTitle: {
    color: "#173e67",
    fontSize: 16,
    fontWeight: "900"
  },
  monthButton: {
    width: 36,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#edf6ff",
    alignItems: "center",
    justifyContent: "center"
  },
  monthButtonText: {
    color: "#1f74d1",
    fontSize: 22,
    fontWeight: "900"
  },
  weekRow: {
    flexDirection: "row",
    marginBottom: 6
  },
  weekLabel: {
    width: "14.285%",
    textAlign: "center",
    color: "#607990",
    fontWeight: "900",
    fontSize: 12
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  customDay: {
    width: "14.285%",
    minHeight: 54,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginVertical: 2
  },
  abnormalDay: {
    backgroundColor: "#fff7e6",
    borderWidth: 1,
    borderColor: "#f59e0b"
  },
  dangerDay: {
    backgroundColor: "#fff1f0",
    borderWidth: 1,
    borderColor: "#cf1322"
  },
  selectedDay: {
    backgroundColor: "#edf6ff",
    borderWidth: 1,
    borderColor: "#1f74d1"
  },
  abnormalDayIcon: {
    position: "absolute",
    top: 3,
    right: 5,
    color: "#cf1322",
    fontSize: 10,
    fontWeight: "900"
  },
  dayLabel: {
    color: "#173e67",
    fontWeight: "900"
  },
  dayValue: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "900"
  },
  dangerDayText: {
    color: "#cf1322"
  },
  calendarLegend: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#edf6ff"
  },
  calendarLegendText: {
    color: "#4f6682",
    fontSize: 12,
    textAlign: "center",
    fontWeight: "700"
  },
  diaryDetailHeader: {
    marginTop: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  detailTitle: {
    color: "#173e67",
    fontWeight: "900",
    fontSize: 15
  },
  detailMeta: {
    color: "#607990",
    fontWeight: "800"
  },
  emptyDayText: {
    padding: 16,
    borderRadius: 10,
    backgroundColor: "#f8fbff",
    color: "#6a7e99",
    textAlign: "center",
    fontWeight: "800"
  },
  diaryModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 28, 48, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18
  },
  diaryModalCard: {
    width: "100%",
    maxWidth: 390,
    maxHeight: "78%",
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 14
  },
  diaryModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10
  },
  diaryModalTitle: {
    color: "#173e67",
    fontSize: 17,
    fontWeight: "900"
  },
  diaryModalMeta: {
    marginTop: 3,
    color: "#607990",
    fontSize: 12,
    fontWeight: "800"
  },
  diaryModalClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#edf6ff",
    alignItems: "center",
    justifyContent: "center"
  },
  diaryModalCloseText: {
    color: "#1f507f",
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "900"
  },
  diaryModalList: {
    maxHeight: 430
  },
  diaryModalRecord: {
    borderTopWidth: 1,
    borderTopColor: "#edf3fd",
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  diaryModalAdvice: {
    marginTop: 6,
    color: "#4f6682",
    lineHeight: 18,
    fontSize: 12,
    fontWeight: "700"
  },
  diaryRecordItem: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#edf3fd",
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
    color: "#173e67",
    fontSize: 18,
    fontWeight: "900"
  },
  recordMoodIcon: {
    marginLeft: 8,
    fontSize: 18
  },
  recordPulse: {
    marginTop: 3,
    color: "#b54708",
    fontSize: 12,
    fontWeight: "800"
  },
  recordMoodPicker: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8
  },
  recordMoodChip: {
    width: 34,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8e1ed",
    backgroundColor: "#fafcff",
    alignItems: "center",
    justifyContent: "center"
  },
  recordMoodChipSelected: {
    borderColor: "#1f74d1",
    backgroundColor: "#edf6ff"
  },
  recordMoodChipText: {
    fontSize: 16
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
  }
})
