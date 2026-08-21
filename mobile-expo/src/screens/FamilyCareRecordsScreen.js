import { useCallback, useState, useEffect } from "react"
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  RefreshControl,
  Alert
} from "react-native"
import Ionicons from "react-native-vector-icons/Ionicons"
import { apiRequest } from "../lib/api"
import CalendarPicker from "../components/CalendarPicker"
import TimePicker from "../components/TimePicker"
import DateRangePicker from "../components/DateRangePicker"
import { colors } from "../theme"

const CATEGORY_OPTIONS = [
  { label: "請選擇分類", value: "" },
  { label: "個人照護", value: "personal" },
  { label: "飲食", value: "diet" },
  { label: "醫療", value: "medical" },
  { label: "活動", value: "activity" },
  { label: "清潔", value: "cleaning" }
]

const SUB_ITEMS = {
  personal: [
    { label: "請選擇項目", value: "" },
    { label: "協助沐浴", value: "協助沐浴" },
    { label: "更換尿布", value: "更換尿布" },
    { label: "剪指甲", value: "剪指甲" },
    { label: "翻身拍背", value: "翻身拍背" },
    { label: "口腔清潔", value: "口腔清潔" },
    { label: "協助如廁", value: "協助如廁" },
    { label: "協助更衣", value: "協助更衣" },
    { label: "協助行走", value: "協助行走" },
    { label: "其他", value: "__other__" }
  ],
  diet: [
    { label: "請選擇項目", value: "" },
    { label: "早餐", value: "早餐" },
    { label: "午餐", value: "午餐" },
    { label: "晚餐", value: "晚餐" },
    { label: "點心", value: "點心" },
    { label: "協助進食", value: "協助進食" },
    { label: "鼻胃管餵食", value: "鼻胃管餵食" },
    { label: "喝水/補充水分", value: "喝水/補充水分" },
    { label: "其他", value: "__other__" }
  ],
  medical: [
    { label: "請選擇項目", value: "" },
    { label: "口服藥物", value: "口服藥物" },
    { label: "胰島素注射", value: "胰島素注射" },
    { label: "傷口護理", value: "傷口護理" },
    { label: "血壓測量", value: "血壓測量" },
    { label: "血糖測量", value: "血糖測量" },
    { label: "霧化治療", value: "霧化治療" },
    { label: "氧氣治療", value: "氧氣治療" },
    { label: "其他", value: "__other__" }
  ],
  activity: [
    { label: "請選擇項目", value: "" },
    { label: "床上復健運動", value: "床上復健運動" },
    { label: "關節活動", value: "關節活動" },
    { label: "站立訓練", value: "站立訓練" },
    { label: "散步", value: "散步" },
    { label: "團體活動", value: "團體活動" },
    { label: "認知訓練", value: "認知訓練" },
    { label: "社交互動", value: "社交互動" },
    { label: "其他", value: "__other__" }
  ],
  cleaning: [
    { label: "請選擇項目", value: "" },
    { label: "環境整理", value: "環境整理" },
    { label: "床單更換", value: "床單更換" },
    { label: "衣物清洗", value: "衣物清洗" },
    { label: "協助沐浴", value: "協助沐浴" },
    { label: "頭髮梳理", value: "頭髮梳理" },
    { label: "個人衛生", value: "個人衛生" },
    { label: "其他", value: "__other__" }
  ]
}

const CATEGORY_LABELS = {
  personal: "個人照護",
  diet: "飲食",
  medical: "醫療",
  activity: "活動",
  cleaning: "清潔"
}

const ITEM_ICONS = {
  personal: "👤", diet: "🍽️", medical: "🏥", activity: "🚶", cleaning: "🧹",
  "協助沐浴": "🛁", "更換尿布": "🧷", "剪指甲": "✂️", "翻身拍背": "🤲",
  "口腔清潔": "🦷", "協助如廁": "🚽", "協助更衣": "👔", "協助行走": "🚶",
  "早餐": "🌅", "午餐": "☀️", "晚餐": "🌙", "點心": "🍪",
  "協助進食": "🥄", "鼻胃管餵食": "💉", "喝水/補充水分": "💧",
  "口服藥物": "💊", "胰島素注射": "💉", "傷口護理": "🩹", "血壓測量": "❤️",
  "血糖測量": "🩸", "霧化治療": "🌫️", "氧氣治療": "🌬️",
  "床上復健運動": "🛏️", "關節活動": "💪", "站立訓練": "🧍", "散步": "🚶",
  "團體活動": "👥", "認知訓練": "🧠", "社交互動": "💬",
  "環境整理": "🏠", "床單更換": "🛏️", "衣物清洗": "👕",
  "頭髮梳理": "💇", "個人衛生": "🧼",
  "__other__": "✏️"
}
const getItemIcon = (item) => ITEM_ICONS[item] || "📋"

const formatDateForDisplay = (date) => {
  if (!date) return ""
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const formatTimeForDisplay = (date) => {
  if (!date) return ""
  const d = new Date(date)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function FamilyCareRecordsScreen({ apiBaseUrl, token, role, onBack }) {
  const [records, setRecords] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [dateRange, setDateRange] = useState({ start: todayStr(), end: todayStr() })
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [detailModalVisible, setDetailModalVisible] = useState(false)

  const fetchRecords = useCallback(async () => {
    try {
      const data = await apiRequest({ apiBaseUrl, path: "/family/care-records/history", token })
      const list = Array.isArray(data) ? data : (Array.isArray(data?.records) ? data.records : [])
      setRecords(list)
    } catch (e) {
      console.error("取得照護紀錄失敗", e)
    }
  }, [apiBaseUrl, token])

  useEffect(() => {
    loadData()
  }, [fetchRecords])

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    await fetchRecords()
    if (!silent) setLoading(false)
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchRecords()
    setRefreshing(false)
  }

  useEffect(() => {
    if (records.length === 0) {
      setFiltered([])
      return
    }
    if (!dateRange.start) {
      setFiltered(records)
    } else {
      const getDateStr = (dateStr) => {
        if (!dateStr) return null
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return null
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }
      const startStr = dateRange.start
      const endStr = dateRange.end || dateRange.start
      setFiltered(records.filter(r => {
        const d = getDateStr(r.recordDate || r.happenedAt || r.createdAt)
        if (!d) return false
        return d >= startStr && d <= endStr
      }))
    }
  }, [records, dateRange])

  const handleDateRangeChange = (range) => {
    setDateRange(range)
  }

  const openDetailModal = (item) => {
    setSelectedRecord(item)
    setDetailModalVisible(true)
  }

  const formatTime = (iso) => {
    if (!iso) return "--"
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => openDetailModal(item)}>
      <View style={styles.cardHeader}>
        <View style={styles.timeBadge}>
          <Ionicons name="calendar-outline" size={13} color="#fff" />
          <Text style={styles.timeText}>{formatTime(item.recordDate || item.happenedAt || item.createdAt)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {item.caregiverName ? <Text style={styles.caregiverText}>{item.caregiverName}</Text> : null}
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </View>

      <View style={{ gap: 4 }}>
        {item.category ? (
          <View style={styles.detailRow}>
            <Ionicons name="folder-outline" size={14} color={colors.primary} />
            <Text style={styles.detailText} numberOfLines={1}>
              <Text style={styles.bold}>分類：</Text>{CATEGORY_LABELS[item.category] || item.category}
            </Text>
          </View>
        ) : null}
        {(item.bloodPressure || item.vitals?.bloodPressure) ? (
          <View style={styles.detailRow}>
            <Ionicons name="heart" size={14} color={colors.danger} />
            <Text style={styles.detailText} numberOfLines={1}>
              <Text style={styles.bold}>血壓：</Text>{item.bloodPressure || item.vitals?.bloodPressure}
            </Text>
          </View>
        ) : null}
        {(item.heartRate || item.vitals?.heartRate) ? (
          <View style={styles.detailRow}>
            <Ionicons name="pulse" size={14} color={colors.warning} />
            <Text style={styles.detailText} numberOfLines={1}>
              <Text style={styles.bold}>心率：</Text>{item.heartRate || item.vitals?.heartRate} bpm
            </Text>
          </View>
        ) : null}
        {item.vitals?.spo2 ? (
          <View style={styles.detailRow}>
            <Ionicons name="water" size={14} color="#2196F3" />
            <Text style={styles.detailText} numberOfLines={1}>
              <Text style={styles.bold}>血氧：</Text>{item.vitals.spo2}%
            </Text>
          </View>
        ) : null}
        {item.temperature ? (
          <View style={styles.detailRow}>
            <Ionicons name="thermometer" size={14} color={colors.primary} />
            <Text style={styles.detailText} numberOfLines={1}>
              <Text style={styles.bold}>體溫：</Text>{item.temperature} °C
            </Text>
          </View>
        ) : null}
        {item.subItem ? (
          <View style={styles.detailRow}>
            <Text style={styles.itemIcon}>{getItemIcon(item.subItem)}</Text>
            <Text style={styles.detailText} numberOfLines={1}>
              <Text style={styles.bold}>項目：</Text>{item.subItem}
            </Text>
          </View>
        ) : null}
        {item.tasks?.length > 0 ? (
          <View style={styles.detailRow}>
            <Ionicons name="checkbox-outline" size={14} color={colors.primary} />
            <Text style={styles.detailText} numberOfLines={1}>
              <Text style={styles.bold}>任務：</Text>{item.tasks.map(t => `${t.task}（${t.status}）`).join("、")}
            </Text>
          </View>
        ) : null}
        {item.note ? (
          <View style={styles.detailRow}>
            <Ionicons name="document-text-outline" size={15} color={colors.textSub} />
            <Text style={styles.detailText} numberOfLines={1}>
              <Text style={styles.bold}>內容：</Text>{item.note}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.backText}>返回</Text>
        </Pressable>
        <Text style={styles.title}>照護日誌</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.filterBar}>
        <DateRangePicker onRangeChange={handleDateRangeChange} />
      </View>

      <View style={styles.resultCount}>
        <Text style={{ fontSize: 13, color: colors.textSub }}>
          {dateRange.start
            ? `共 ${filtered.length} 筆記錄${dateRange.end && dateRange.end !== dateRange.start ? `（${dateRange.start} ~ ${dateRange.end}）` : `（${dateRange.start}）`}`
            : `共 ${records.length} 筆記錄`}
        </Text>
        <TouchableOpacity style={styles.refreshBtnSmall} onPress={onRefresh}>
          <Ionicons name="refresh" size={18} color="#1f74d1" />
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={colors.success} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.emptyText}>此日期沒有照護紀錄</Text>}
          extraData={filtered}
        />
      )}

      {/* 詳情 Modal */}
      <Modal visible={detailModalVisible} animationType="slide" transparent={false}>
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setDetailModalVisible(false)} style={styles.modalBack}>
              <Text style={styles.modalBackText}>返回</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>照護詳情</Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView style={styles.modalBody}>
            {selectedRecord && (
              <>
                <View style={styles.detailSection}>
                  <Text style={styles.sectionTitle}>記錄時間</Text>
                  <View style={styles.detailValue}>
                    <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                    <Text style={styles.detailValueText}>
                      {formatDateForDisplay(selectedRecord.recordDate || selectedRecord.happenedAt || selectedRecord.createdAt)}
                      {" "}
                      {formatTimeForDisplay(selectedRecord.recordDate || selectedRecord.happenedAt || selectedRecord.createdAt)}
                    </Text>
                  </View>
                </View>

                {selectedRecord.caregiverName && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>照護員</Text>
                    <View style={styles.detailValue}>
                      <Ionicons name="person-outline" size={18} color={colors.primary} />
                      <Text style={styles.detailValueText}>{selectedRecord.caregiverName}</Text>
                    </View>
                  </View>
                )}

                {selectedRecord.category && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>分類</Text>
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryIcon}>{ITEM_ICONS[selectedRecord.category]}</Text>
                      <Text style={styles.categoryText}>{CATEGORY_LABELS[selectedRecord.category]}</Text>
                    </View>
                  </View>
                )}

                {selectedRecord.subItem && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>項目</Text>
                    <View style={styles.subItemCard}>
                      <Text style={styles.subItemIcon}>{getItemIcon(selectedRecord.subItem)}</Text>
                      <Text style={styles.subItemText}>{selectedRecord.subItem}</Text>
                    </View>
                  </View>
                )}

                {(selectedRecord.bloodPressure || selectedRecord.vitals?.bloodPressure) && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>血壓</Text>
                    <View style={styles.detailValue}>
                      <Ionicons name="heart" size={18} color={colors.danger} />
                      <Text style={styles.detailValueText}>{selectedRecord.bloodPressure || selectedRecord.vitals?.bloodPressure}</Text>
                    </View>
                  </View>
                )}

                {(selectedRecord.heartRate || selectedRecord.vitals?.heartRate) && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>心率</Text>
                    <View style={styles.detailValue}>
                      <Ionicons name="pulse" size={18} color={colors.warning} />
                      <Text style={styles.detailValueText}>{selectedRecord.heartRate || selectedRecord.vitals?.heartRate} bpm</Text>
                    </View>
                  </View>
                )}

                {selectedRecord.vitals?.spo2 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>血氧</Text>
                    <View style={styles.detailValue}>
                      <Ionicons name="water" size={18} color="#2196F3" />
                      <Text style={styles.detailValueText}>{selectedRecord.vitals.spo2}%</Text>
                    </View>
                  </View>
                )}

                {selectedRecord.tasks?.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>任務</Text>
                    <View style={{ gap: 8 }}>
                      {selectedRecord.tasks.map((t, i) => (
                        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Ionicons name={t.status === "完成" ? "checkmark-circle" : "ellipse-outline"} size={16} color={t.status === "完成" ? colors.success : colors.textMuted} />
                          <Text style={styles.detailValueText}>{t.task}</Text>
                          <Text style={{ fontSize: 12, color: colors.textMuted }}>{t.time}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {selectedRecord.temperature && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>體溫</Text>
                    <View style={styles.detailValue}>
                      <Ionicons name="thermometer" size={18} color={colors.primary} />
                      <Text style={styles.detailValueText}>{selectedRecord.temperature} °C</Text>
                    </View>
                  </View>
                )}

                {selectedRecord.note && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>備註</Text>
                    <View style={styles.noteCard}>
                      <Text style={styles.noteText}>{selectedRecord.note}</Text>
                    </View>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#d8e6ff" },
  backText: { color: "#1f74d1", fontWeight: "900", fontSize: 16 },
  title: { fontSize: 18, fontWeight: "900", color: "#11355c" },

  filterBar: { backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  resultCount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, fontSize: 13, color: colors.textSub, backgroundColor: colors.bg },
  refreshBtnSmall: { padding: 6 },

  listContainer: { padding: 16, paddingBottom: 30 },
  emptyText: { textAlign: "center", marginTop: 50, color: colors.textMuted, fontSize: 15 },

  card: { backgroundColor: colors.card, borderRadius: 12, marginBottom: 12, padding: 14, elevation: 2 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  timeBadge: { flexDirection: "row", alignItems: "center", backgroundColor: colors.success, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 4 },
  timeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  caregiverText: { fontSize: 11, color: colors.textMuted },

  detailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailText: { fontSize: 13, color: colors.text, flex: 1 },
  bold: { fontWeight: "600", color: colors.textSub },
  itemIcon: { fontSize: 15 },

  modalScreen: { flex: 1, backgroundColor: "#fcfcfc" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: Platform.OS === "ios" ? 50 : 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee" },
  modalBack: { padding: 5 },
  modalBackText: { color: "#666", fontSize: 16 },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  modalBody: { flex: 1, padding: 20 },

  detailSection: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: colors.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  detailValue: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  detailValueText: { fontSize: 16, color: colors.text },
  categoryBadge: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, gap: 8, alignSelf: "flex-start" },
  categoryIcon: { fontSize: 20 },
  categoryText: { fontSize: 16, color: colors.text, fontWeight: "500" },
  subItemCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, gap: 10 },
  subItemIcon: { fontSize: 24 },
  subItemText: { fontSize: 16, color: colors.text, fontWeight: "500" },
  noteCard: { backgroundColor: "#fff", padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  noteText: { fontSize: 15, color: colors.text, lineHeight: 22 }
})
