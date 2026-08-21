import { useState } from "react"
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList } from "react-native"

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)

export default function TimePicker({ visible, value, onConfirm, onCancel }) {
  const d = value ? new Date(value) : new Date()
  const [selHour, setSelHour] = useState(d.getHours())
  const [selMinute, setSelMinute] = useState(d.getMinutes())

  const handleConfirm = () => {
    const now = new Date()
    const result = new Date(now.getFullYear(), now.getMonth(), now.getDate(), selHour, selMinute)
    onConfirm(result)
  }

  const renderHour = ({ item }) => (
    <TouchableOpacity
      style={[s.item, item === selHour && s.itemSel]}
      onPress={() => setSelHour(item)}
    >
      <Text style={[s.itemText, item === selHour && s.itemTextSel]}>{String(item).padStart(2, "0")}</Text>
    </TouchableOpacity>
  )

  const renderMinute = ({ item }) => (
    <TouchableOpacity
      style={[s.item, item === selMinute && s.itemSel]}
      onPress={() => setSelMinute(item)}
    >
      <Text style={[s.itemText, item === selMinute && s.itemTextSel]}>{String(item).padStart(2, "0")}</Text>
    </TouchableOpacity>
  )

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.panel}>
          <View style={s.header}>
            <TouchableOpacity onPress={onCancel}><Text style={s.cancel}>取消</Text></TouchableOpacity>
            <Text style={s.title}>選擇時間</Text>
            <TouchableOpacity onPress={handleConfirm}><Text style={s.done}>確定</Text></TouchableOpacity>
          </View>
          <View style={s.pickerRow}>
            <View style={s.col}>
              <Text style={s.colLabel}>時</Text>
              <FlatList
                data={HOURS}
                keyExtractor={i => String(i)}
                renderItem={renderHour}
                style={s.list}
                showsVerticalScrollIndicator={false}
                initialScrollIndex={Math.max(0, selHour - 3)}
                getItemLayout={(_, index) => ({ length: 44, offset: 44 * index, index })}
              />
            </View>
            <Text style={s.sep}>:</Text>
            <View style={s.col}>
              <Text style={s.colLabel}>分</Text>
              <FlatList
                data={MINUTES}
                keyExtractor={i => String(i)}
                renderItem={renderMinute}
                style={s.list}
                showsVerticalScrollIndicator={false}
                initialScrollIndex={Math.max(0, selMinute - 3)}
                getItemLayout={(_, index) => ({ length: 44, offset: 44 * index, index })}
              />
            </View>
          </View>
          <Text style={s.preview}>{String(selHour).padStart(2, "0")}:{String(selMinute).padStart(2, "0")}</Text>
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
  pickerRow: { flexDirection: "row", justifyContent: "center", alignItems: "flex-start", height: 220 },
  col: { width: 80, alignItems: "center" },
  colLabel: { fontSize: 13, color: "#999", marginBottom: 8 },
  list: { height: 176 },
  item: { height: 44, justifyContent: "center", alignItems: "center", borderRadius: 8, marginVertical: 1 },
  itemSel: { backgroundColor: "#e6f4ff" },
  itemText: { fontSize: 20, color: "#333" },
  itemTextSel: { color: "#1890ff", fontWeight: "bold" },
  sep: { fontSize: 28, fontWeight: "bold", color: "#333", marginTop: 30, marginHorizontal: 8 },
  preview: { textAlign: "center", fontSize: 28, fontWeight: "bold", color: "#1890ff", marginTop: 12 },
})
