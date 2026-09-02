import { Pressable, StyleSheet, Text, View } from "react-native"
import { colors } from "../screens/new_ui/tokens"

function toDate(value) {
  const date = new Date(value || Date.now())
  return Number.isNaN(date.getTime()) ? new Date() : date
}

export function formatMonthLabel(dateKey, lang = "zh") {
  const date = toDate(`${dateKey}T00:00:00`)
  try {
    const locale = ({ zh: "zh-TW", en: "en-US", id: "id-ID", vi: "vi-VN", tl: "fil-PH", th: "th-TH" })[lang] || "zh-TW"
    return date.toLocaleDateString(locale, { year: "numeric", month: "long" })
  } catch {
    return date.toLocaleDateString("zh-TW", { year: "numeric", month: "long" })
  }
}

export function shiftMonth(dateKey, offset) {
  const date = toDate(`${dateKey}T00:00:00`)
  date.setMonth(date.getMonth() + offset)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function isBetween(dateKey, startKey, endKey) {
  if (!dateKey || !startKey || !endKey) return false
  const a = startKey <= endKey ? startKey : endKey
  const b = startKey <= endKey ? endKey : startKey
  return dateKey >= a && dateKey <= b
}

/**
 * 共用月曆（血壓單日／異常歷程區間）。
 * rangeStart／rangeEnd 有值時高亮區間；否則用 selectedDate 單日。
 */
export default function MonthCalendar({
  dateKey,
  days,
  selectedDate,
  rangeStart,
  rangeEnd,
  onSelectDate,
  onShiftMonth,
  weekdays = ["日", "一", "二", "三", "四", "五", "六"],
  lang = "zh",
  legend,
  renderValue,
  footer
}) {
  return (
    <View style={styles.calendarCard}>
      <View style={styles.calendarHeader}>
        <Pressable style={styles.monthButton} onPress={() => onShiftMonth(-1)}>
          <Text style={styles.monthButtonText}>‹</Text>
        </Pressable>
        <Text style={styles.calendarTitle}>{formatMonthLabel(dateKey, lang)}</Text>
        <Pressable style={styles.monthButton} onPress={() => onShiftMonth(1)}>
          <Text style={styles.monthButtonText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {weekdays.map((day, idx) => (
          <Text key={idx} style={styles.weekLabel}>{day}</Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {days.map(day => {
          if (day.blank) return <View key={day.key} style={styles.customDay} />
          const inRange = rangeStart && rangeEnd
            ? isBetween(day.dateKey, rangeStart, rangeEnd)
            : false
          const isEdge = day.dateKey === rangeStart || day.dateKey === rangeEnd
          const selected = !rangeStart && selectedDate === day.dateKey
          const valueNode = typeof renderValue === "function"
            ? renderValue(day)
            : (day.topRecord
              ? (
                <Text
                  style={[
                    styles.dayValue,
                    { color: day.hasDanger ? "#cf1322" : day.topRecord.status?.color || colors.text }
                  ]}
                >
                  {day.topRecord.sys}/{day.topRecord.dia}
                </Text>
              )
              : (day.markLabel
                ? <Text style={styles.dayValue}>{day.markLabel}</Text>
                : null))
          return (
            <Pressable
              key={day.key}
              style={[
                styles.customDay,
                day.hasAbnormal && styles.abnormalDay,
                day.hasDanger && styles.dangerDay,
                inRange && styles.inRangeDay,
                (selected || isEdge) && styles.selectedDay
              ]}
              onPress={() => onSelectDate(day.dateKey)}
            >
              {day.hasAbnormal ? (
                <Text style={styles.abnormalDayIcon}>{day.hasDanger ? "!" : "•"}</Text>
              ) : null}
              <Text style={[
                styles.dayLabel,
                day.hasDanger && styles.dangerDayText,
                (selected || isEdge) && styles.selectedDayText
              ]}
              >
                {day.day}
              </Text>
              {valueNode}
            </Pressable>
          )
        })}
      </View>
      {legend ? (
        <View style={styles.calendarLegend}>
          <Text style={styles.calendarLegendText}>{legend}</Text>
        </View>
      ) : null}
      {footer || null}
    </View>
  )
}

const styles = StyleSheet.create({
  calendarCard: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: "#f8fbff",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  calendarTitle: {
    color: colors.text,
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
    color: colors.pine,
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
  inRangeDay: {
    backgroundColor: colors.mintSoft
  },
  selectedDay: {
    backgroundColor: colors.pine,
    borderWidth: 1,
    borderColor: colors.pine
  },
  selectedDayText: {
    color: "#fff"
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
    color: colors.text,
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
  }
})
