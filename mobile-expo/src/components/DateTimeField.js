import { useEffect, useMemo, useRef, useState } from "react"
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native"
import { useI18n } from "../i18n/I18nContext"
import {
  formatHourUnit,
  formatMinuteUnit,
  formatMonthYearTitle,
  weekdayShortLabels
} from "../i18n/dateLocale"
import { colors } from "../screens/new_ui/tokens"

const ITEM_H = 48
const VISIBLE = 5
const PAD = Math.floor(VISIBLE / 2) * ITEM_H
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)

function pad2(n) {
  return String(n).padStart(2, "0")
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** 鬧鐘滾輪：可點選＋拖曳；模擬器滑鼠滾輪不穩時點數字即可 */
export function WheelColumn({ items, value, onChange, formatItem }) {
  const listRef = useRef(null)
  const index = Math.max(0, items.indexOf(value))

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index, animated: false })
      } catch {
        listRef.current?.scrollToOffset({ offset: index * ITEM_H, animated: false })
      }
    })
    return () => cancelAnimationFrame(id)
  }, [index])

  const step = (delta) => {
    const next = Math.max(0, Math.min(items.length - 1, index + delta))
    onChange(items[next])
  }

  return (
    <View style={styles.wheelWrap}>
      <Pressable style={styles.stepBtn} onPress={() => step(-1)} hitSlop={8}>
        <Text style={styles.stepText}>▲</Text>
      </Pressable>
      <View style={styles.wheelCol}>
        <View pointerEvents="none" style={styles.wheelHighlight} />
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => String(item)}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_H}
          decelerationRate="fast"
          getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
          contentContainerStyle={{ paddingVertical: PAD }}
          onMomentumScrollEnd={(e) => {
            const i = Math.max(
              0,
              Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM_H))
            )
            if (items[i] !== value) onChange(items[i])
          }}
          onScrollToIndexFailed={() => {
            listRef.current?.scrollToOffset({ offset: index * ITEM_H, animated: false })
          }}
          renderItem={({ item }) => {
            const active = item === value
            return (
              <Pressable style={styles.wheelItem} onPress={() => onChange(item)}>
                <Text style={[styles.wheelText, active ? styles.wheelTextOn : null]}>
                  {(formatItem || pad2)(item)}
                </Text>
              </Pressable>
            )
          }}
        />
      </View>
      <Pressable style={styles.stepBtn} onPress={() => step(1)} hitSlop={8}>
        <Text style={styles.stepText}>▼</Text>
      </Pressable>
    </View>
  )
}

/**
 * 日期：月曆
 * 時間：點開底部 sheet；滾輪可點／可拖／上下鍵（模擬器滑鼠友善）
 */
export default function DateTimeField({
  label,
  value,
  onChange,
  mode = "datetime"
}) {
  const { t, lang } = useI18n()
  const weekdays = weekdayShortLabels(lang)
  const hourUnit = formatHourUnit(lang)
  const minuteUnit = formatMinuteUnit(lang)
  const current = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date()
  const today = useMemo(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  }, [])

  const [viewYear, setViewYear] = useState(current.getFullYear())
  const [viewMonth, setViewMonth] = useState(current.getMonth())
  const [timeOpen, setTimeOpen] = useState(false)
  const [draftH, setDraftH] = useState(current.getHours())
  const [draftM, setDraftM] = useState(current.getMinutes())

  const valueKey = current.getTime()
  useEffect(() => {
    setViewYear(current.getFullYear())
    setViewMonth(current.getMonth())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey])

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1)
    const startPad = first.getDay()
    const total = new Date(viewYear, viewMonth + 1, 0).getDate()
    const list = []
    for (let i = 0; i < startPad; i += 1) list.push(null)
    for (let day = 1; day <= total; day += 1) {
      list.push(new Date(viewYear, viewMonth, day))
    }
    return list
  }, [viewYear, viewMonth])

  const applyDate = (dayDate) => {
    const next = new Date(current)
    next.setFullYear(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate())
    onChange(next)
  }

  const openTime = () => {
    setDraftH(current.getHours())
    setDraftM(current.getMinutes())
    setTimeOpen(true)
  }

  const confirmTime = () => {
    const next = new Date(current)
    next.setHours(draftH, draftM, 0, 0)
    onChange(next)
    setTimeOpen(false)
  }

  const shiftMonth = (delta) => {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      {mode !== "time" ? (
        <View style={styles.calCard}>
          <View style={styles.calHeader}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={8}>
              <Text style={styles.navBtn}>‹</Text>
            </Pressable>
            <Text style={styles.calTitle}>
              {formatMonthYearTitle(viewYear, viewMonth, lang)}
            </Text>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={8}>
              <Text style={styles.navBtn}>›</Text>
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {weekdays.map((w, i) => (
              <Text key={`${w}-${i}`} style={styles.weekLabel}>{w}</Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((cell, idx) => {
              if (!cell) return <View key={`e-${idx}`} style={styles.dayCell} />
              const selected = sameDay(cell, current)
              const isToday = sameDay(cell, today)
              return (
                <Pressable
                  key={cell.toISOString()}
                  style={[
                    styles.dayCell,
                    isToday ? styles.dayToday : null,
                    selected ? styles.daySelected : null
                  ]}
                  onPress={() => applyDate(cell)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      selected ? styles.dayTextSelected : null,
                      isToday && !selected ? styles.dayTextToday : null
                    ]}
                  >
                    {cell.getDate()}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ) : null}

      <Text style={styles.subLabel}>{t("datetime.time")}</Text>
      <View style={styles.timeChipRow}>
        <Pressable style={styles.timeChip} onPress={openTime}>
          <Text style={styles.timeChipValue}>
            {hourUnit ? `${pad2(current.getHours())}${hourUnit}` : pad2(current.getHours())}
          </Text>
          <Text style={styles.timeChipChevron}>▼</Text>
        </Pressable>
        <Text style={styles.timeChipColon}>:</Text>
        <Pressable style={styles.timeChip} onPress={openTime}>
          <Text style={styles.timeChipValue}>
            {minuteUnit ? `${pad2(current.getMinutes())}${minuteUnit}` : pad2(current.getMinutes())}
          </Text>
          <Text style={styles.timeChipChevron}>▼</Text>
        </Pressable>
      </View>

      <Modal
        visible={timeOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTimeOpen(false)}
      >
        {/* 外層不用包住 sheet 的 Pressable，否則 Android／模擬器會吞掉滾動 */}
        <View style={styles.sheetMask}>
          <Pressable style={styles.sheetDismiss} onPress={() => setTimeOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHead}>
              <Pressable onPress={() => setTimeOpen(false)} hitSlop={8}>
                <Text style={styles.sheetCancel}>{t("common.cancel")}</Text>
              </Pressable>
              <Text style={styles.sheetTitle}>{t("datetime.setTime")}</Text>
              <Pressable onPress={confirmTime} hitSlop={8}>
                <Text style={styles.sheetDone}>{t("datetime.done")}</Text>
              </Pressable>
            </View>

            <View style={styles.alarmRow}>
              <View style={styles.alarmCol}>
                <Text style={styles.alarmCaption}>{t("datetime.hour")}</Text>
                <WheelColumn items={HOURS} value={draftH} onChange={setDraftH} />
              </View>
              <Text style={styles.alarmColon}>:</Text>
              <View style={styles.alarmCol}>
                <Text style={styles.alarmCaption}>{t("datetime.minute")}</Text>
                <WheelColumn items={MINUTES} value={draftM} onChange={setDraftM} />
              </View>
            </View>

            <Text style={styles.sheetPreview}>
              {pad2(draftH)}:{pad2(draftM)}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  label: { fontSize: 14, fontWeight: "700", color: "#374151", marginBottom: 8 },
  subLabel: { fontSize: 13, fontWeight: "600", color: "#6b7280", marginTop: 12, marginBottom: 6 },
  calCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    backgroundColor: "#fff",
    padding: 12
  },
  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  navBtn: { fontSize: 28, color: colors.pine, fontWeight: "600", paddingHorizontal: 8 },
  calTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekLabel: {
    width: `${100 / 7}%`,
    textAlign: "center",
    fontSize: 12,
    color: "#9ca3af",
    fontWeight: "700"
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999
  },
  dayToday: { backgroundColor: colors.bg },
  daySelected: { backgroundColor: colors.pine },
  dayText: { fontSize: 15, fontWeight: "600", color: "#111827" },
  dayTextSelected: { color: "#fff" },
  dayTextToday: { color: colors.pine },

  timeChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  timeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  timeChipValue: { fontSize: 18, fontWeight: "800", color: "#111827" },
  timeChipChevron: { fontSize: 12, color: "#9ca3af", fontWeight: "700" },
  timeChipColon: { fontSize: 22, fontWeight: "800", color: "#111827" },

  sheetMask: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  sheetDismiss: { flex: 1 },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 28,
    paddingHorizontal: 16
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    marginTop: 10,
    marginBottom: 8
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginBottom: 4
  },
  sheetCancel: { fontSize: 16, color: "#6b7280", fontWeight: "600", minWidth: 48 },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  sheetDone: { fontSize: 16, color: colors.pine, fontWeight: "800", minWidth: 48, textAlign: "right" },
  alarmRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4
  },
  alarmCol: { alignItems: "center" },
  alarmCaption: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6b7280",
    marginBottom: 4
  },
  alarmColon: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    marginHorizontal: 10,
    marginTop: 28
  },
  wheelWrap: { alignItems: "center" },
  stepBtn: { paddingVertical: 4, paddingHorizontal: 16 },
  stepText: { fontSize: 14, color: colors.pine, fontWeight: "800" },
  wheelCol: {
    width: 96,
    height: ITEM_H * VISIBLE,
    overflow: "hidden"
  },
  wheelHighlight: {
    position: "absolute",
    left: 6,
    right: 6,
    top: PAD,
    height: ITEM_H,
    borderRadius: 10,
    backgroundColor: colors.mintSoft,
    zIndex: 0
  },
  wheelItem: {
    height: ITEM_H,
    alignItems: "center",
    justifyContent: "center"
  },
  wheelText: { fontSize: 22, color: "#c0c4cc", fontWeight: "600" },
  wheelTextOn: { color: "#111827", fontWeight: "800", fontSize: 26 },
  sheetPreview: {
    textAlign: "center",
    marginTop: 10,
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280"
  }
})
