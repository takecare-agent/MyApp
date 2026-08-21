import { useState } from "react"
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native"

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"]

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

export default function CalendarPicker({ visible, value, onConfirm, onCancel }) {
  const d = value ? new Date(value) : new Date()
  const [viewYear, setViewYear] = useState(d.getFullYear())
  const [viewMonth, setViewMonth] = useState(d.getMonth())
  const [selYear, setSelYear] = useState(d.getFullYear())
  const [selMonth, setSelMonth] = useState(d.getMonth())
  const [selDay, setSelDay] = useState(d.getDate())

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const today = new Date()
  const isToday = (day) => day && viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate()
  const isSel = (day) => day && day === selDay && viewMonth === selMonth && viewYear === selYear

  const handleConfirm = () => {
    onConfirm(new Date(selYear, selMonth, selDay))
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.panel}>
          <View style={s.header}>
            <TouchableOpacity onPress={onCancel}><Text style={s.cancel}>取消</Text></TouchableOpacity>
            <Text style={s.title}>選擇日期</Text>
            <TouchableOpacity onPress={handleConfirm}><Text style={s.done}>確定</Text></TouchableOpacity>
          </View>
          <View style={s.nav}>
            <TouchableOpacity onPress={prevMonth} style={s.navBtn}><Text style={s.navText}>◀</Text></TouchableOpacity>
            <Text style={s.monthLabel}>{viewYear} 年 {viewMonth + 1} 月</Text>
            <TouchableOpacity onPress={nextMonth} style={s.navBtn}><Text style={s.navText}>▶</Text></TouchableOpacity>
          </View>
          <View style={s.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={[s.weekText, (i === 0 || i === 6) && s.weekend]}>{w}</Text>
            ))}
          </View>
          <View style={s.grid}>
            {cells.map((day, idx) => (
              <View key={idx} style={s.cellWrap}>
                {day !== null && (
                  <TouchableOpacity
                    style={[s.cell, isSel(day) && s.cellSel, isToday(day) && !isSel(day) && s.cellToday]}
                    onPress={() => { setSelYear(viewYear); setSelMonth(viewMonth); setSelDay(day) }}
                  >
                    <Text style={[s.cellText, isSel(day) && s.cellTextSel, isToday(day) && !isSel(day) && s.cellTextToday]}>{day}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  panel: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "88%" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  cancel: { color: "#888", fontSize: 16, padding: 4 },
  title: { fontSize: 17, fontWeight: "bold", color: "#333" },
  done: { color: "#1890ff", fontSize: 16, fontWeight: "bold", padding: 4 },
  nav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  navBtn: { padding: 8 },
  navText: { fontSize: 18, color: "#1890ff" },
  monthLabel: { fontSize: 17, fontWeight: "600", color: "#333" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekText: { flex: 1, textAlign: "center", fontSize: 13, color: "#999", fontWeight: "600" },
  weekend: { color: "#ff6b6b" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cellWrap: { width: "14.28%", aspectRatio: 1, padding: 2 },
  cell: { flex: 1, justifyContent: "center", alignItems: "center", borderRadius: 22 },
  cellSel: { backgroundColor: "#1890ff" },
  cellToday: { backgroundColor: "#e6f4ff" },
  cellText: { fontSize: 16, color: "#333" },
  cellTextSel: { color: "#fff", fontWeight: "bold" },
  cellTextToday: { color: "#1890ff", fontWeight: "600" },
})
