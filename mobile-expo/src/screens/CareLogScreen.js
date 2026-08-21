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

export default function CareLogScreen({ apiBaseUrl, token, role, onBack }) {
  const [records, setRecords] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [formModalVisible, setFormModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editId, setEditId] = useState(null)
  const [dateRange, setDateRange] = useState({ start: todayStr(), end: todayStr() })

  const [form, setForm] = useState({
    recordDate: new Date(),
    recordTime: new Date(),
    category: "",
    subItem: "",
    customItem: "",
    note: ""
  })

  const [editForm, setEditForm] = useState({
    recordDate: new Date(),
    recordTime: new Date(),
    category: "",
    subItem: "",
    customItem: "",
    note: ""
  })

  const fetchRecords = useCallback(async () => {
    try {
      const isFamily = role === "family"
      const path = isFamily ? "/family/care-records/history" : "/caregiver/care-logs/history"
      console.log("fetchRecords path:", path, "role:", role)
      const data = await apiRequest({ apiBaseUrl, path, token })
      console.log("fetchRecords data:", JSON.stringify(data))
      if (isFamily) {
        const records = Array.isArray(data) ? data : (Array.isArray(data?.records) ? data.records : [])
        console.log("family records count:", records.length)
        setRecords(records)
      } else {
        setRecords(Array.isArray(data?.records) ? data.records : [])
      }
    } catch (e) {
      console.error("取得照護紀錄失敗", e)
    }
  }, [apiBaseUrl, token, role])

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

  // 當 records 載入時，自動套用當前 dateRange 篩選
  useEffect(() => {
    if (records.length === 0) {
      setFiltered([])
      return
    }
    if (!dateRange.start) {
      setFiltered(records)
    } else {
      // 提取 record 的年月日字串，用字串比對避免時區問題
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

  const [showDateModal, setShowDateModal] = useState(false)
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showSubItemModal, setShowSubItemModal] = useState(false)
  const [tempDate, setTempDate] = useState(new Date())
  const [tempTime, setTempTime] = useState(new Date())

  const [showEditDateModal, setShowEditDateModal] = useState(false)
  const [showEditTimeModal, setShowEditTimeModal] = useState(false)
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false)
  const [showEditSubItemModal, setShowEditSubItemModal] = useState(false)
  const [tempEditDate, setTempEditDate] = useState(new Date())
  const [tempEditTime, setTempEditTime] = useState(new Date())

  const openDatePicker = () => {
    setTempDate(new Date(form.recordDate))
    setShowDateModal(true)
  }

  const openTimePicker = () => {
    setTempTime(new Date(form.recordTime))
    setShowTimeModal(true)
  }

  const handleCategoryChange = (category) => {
    setForm(prev => ({ ...prev, category, subItem: "" }))
  }

  const handleAdd = () => {
    const now = new Date()
    setForm({
      recordDate: now,
      recordTime: now,
      category: "",
      subItem: "",
      customItem: "",
      note: ""
    })
    setFormModalVisible(true)
  }

  const handleSave = async () => {
    if (!form.category) {
      Alert.alert("請選擇分類")
      return
    }
    if (!form.subItem) {
      Alert.alert("請選擇項目")
      return
    }
    if (form.subItem === "__other__" && !form.customItem.trim()) {
      Alert.alert("請輸入自訂項目")
      return
    }

    try {
      const isFamily = role === "family"
      const basePath = isFamily ? "/family/care-records" : "/caregiver/care-logs"
      const finalItem = form.subItem === "__other__" ? form.customItem.trim() : form.subItem
      // 合併日期和時間
      const combined = new Date(form.recordDate)
      combined.setHours(form.recordTime.getHours(), form.recordTime.getMinutes(), form.recordTime.getSeconds())
      const result = await apiRequest({
        apiBaseUrl,
        path: basePath,
        method: "POST",
        token,
        body: {
          category: form.category,
          subItem: finalItem,
          note: form.note,
          recordDate: combined.toISOString()
        }
      })
      // 直接更新 records 狀態
      setRecords(prev => [result, ...prev])
      setFormModalVisible(false)
    } catch (e) {
      Alert.alert("儲存失敗：" + e.message)
    }
  }

  const openEditModal = (item) => {
    setEditId(item._id)
    const cat = item.category || ""
    // 優先使用 recordDate，否則用 happenedAt，最後才是 createdAt
    const dateSource = item.recordDate || item.happenedAt || item.createdAt
    const recordDate = dateSource ? new Date(dateSource) : new Date()
    setEditForm({
      recordDate: recordDate,
      recordTime: recordDate,
      category: cat,
      subItem: item.subItem || "",
      customItem: "",
      note: item.note || ""
    })
    setTempEditDate(recordDate)
    setTempEditTime(recordDate)
    setShowEditDateModal(false)
    setShowEditTimeModal(false)
    setShowEditCategoryModal(false)
    setShowEditSubItemModal(false)
    setEditModalVisible(true)
  }

  const editSubItemOptions = (SUB_ITEMS[editForm.category] || []).filter(i => i.value)

  const handleEdit = async () => {
    if (!editId) return
    try {
      const isFamily = role === "family"
      const basePath = isFamily ? "/family/care-records" : "/caregiver/care-logs"
      const finalItem = editForm.subItem === "__other__" ? editForm.customItem.trim() : editForm.subItem
      // 合併日期和時間
      const combined = new Date(editForm.recordDate)
      combined.setHours(editForm.recordTime.getHours(), editForm.recordTime.getMinutes(), editForm.recordTime.getSeconds())
      const body = {
        category: editForm.category,
        subItem: finalItem,
        note: editForm.note,
        recordDate: combined.toISOString()
      }
      const result = await apiRequest({
        apiBaseUrl,
        path: `${basePath}/${editId}`,
        method: "PUT",
        token,
        body
      })
      // 直接更新 records 狀態，避免等待 fetchRecords
      setRecords(prev => prev.map(r => r._id === result._id ? result : r))
      setEditModalVisible(false)
      setEditId(null)
    } catch (e) {
      Alert.alert("修改失敗：" + e.message)
    }
  }

  const handleDelete = async (id) => {
    Alert.alert(
      "刪除確認",
      "確定要刪除這筆記錄嗎？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "刪除",
          style: "destructive",
          onPress: async () => {
            try {
              const isFamily = role === "family"
              const basePath = isFamily ? "/family/care-records" : "/caregiver/care-logs"
              await apiRequest({
                apiBaseUrl,
                path: `${basePath}/${id}`,
                method: "DELETE",
                token
              })
              // 直接更新 records 狀態
              setRecords(prev => prev.filter(r => r._id !== id))
            } catch (e) {
              console.error("刪除失敗:", e)
              Alert.alert("刪除失敗", e.message || JSON.stringify(e))
            }
          }
        }
      ]
    )
  }

  const formatTime = (iso) => {
    if (!iso) return "--"
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={role === "caregiver" ? () => openEditModal(item) : undefined}>
      <View style={styles.cardHeader}>
        <View style={styles.timeBadge}>
          <Ionicons name="calendar-outline" size={13} color="#fff" />
          <Text style={styles.timeText}>{formatTime(item.recordDate || item.happenedAt || item.createdAt)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {item.caregiverName ? <Text style={styles.caregiverText}>{item.caregiverName}</Text> : null}
          {role === "caregiver" && (
            <>
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); openEditModal(item) }} style={styles.actionBtn}>
                <Ionicons name="create-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDelete(item._id) }} style={styles.actionBtn}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </TouchableOpacity>
            </>
          )}
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
        {item.bloodPressure ? (
          <View style={styles.detailRow}>
            <Ionicons name="heart" size={14} color={colors.danger} />
            <Text style={styles.detailText} numberOfLines={1}>
              <Text style={styles.bold}>血壓：</Text>{item.bloodPressure}
            </Text>
          </View>
        ) : null}
        {item.heartRate ? (
          <View style={styles.detailRow}>
            <Ionicons name="pulse" size={14} color={colors.warning} />
            <Text style={styles.detailText} numberOfLines={1}>
              <Text style={styles.bold}>心率：</Text>{item.heartRate} bpm
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

      {role === "caregiver" && (
        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addBtnText}>新增紀錄</Text>
          </TouchableOpacity>
        </View>
      )}

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

      <Modal visible={formModalVisible} animationType="slide" transparent={false}>
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setFormModalVisible(false)} style={styles.modalBack}>
              <Text style={styles.modalBackText}>取消</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>新增照護紀錄</Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={styles.modalSaveText}>儲存</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <Text style={styles.sectionTitle}>記錄時間</Text>
            <View style={styles.dateTimeRow}>
              <TouchableOpacity style={styles.dateTimeBtn} onPress={openDatePicker}>
                <Ionicons name="calendar-outline" size={18} color="#1f74d1" />
                <Text style={styles.dateTimeText}>{formatDateForDisplay(form.recordDate)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateTimeBtn} onPress={openTimePicker}>
                <Ionicons name="time-outline" size={18} color="#1f74d1" />
                <Text style={styles.dateTimeText}>{formatTimeForDisplay(form.recordTime)}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>分類</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => setShowCategoryModal(true)}>
              <Text style={[styles.dropdownText, !form.category && styles.dropdownPlaceholder]}>
                {form.category ? CATEGORY_LABELS[form.category] : "請選擇分類"}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#999" />
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>項目</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => form.category ? setShowSubItemModal(true) : Alert.alert("請先選擇分類")}>
              <Text style={[styles.dropdownText, !form.subItem && styles.dropdownPlaceholder]}>
                {form.subItem === "__other__" ? "其他（自訂）" : (form.subItem || "請選擇項目")}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#999" />
            </TouchableOpacity>

            {form.subItem === "__other__" && (
              <>
                <Text style={styles.sectionTitle}>自訂項目名稱</Text>
                <TextInput
                  style={styles.input}
                  placeholder="請輸入項目名稱"
                  value={form.customItem}
                  onChangeText={v => setForm(prev => ({ ...prev, customItem: v }))}
                />
              </>
            )}

            <Text style={styles.sectionTitle}>備註</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="請輸入觀察或特別狀況..."
              multiline
              numberOfLines={4}
              value={form.note}
              onChangeText={v => setForm(prev => ({ ...prev, note: v }))}
            />

            <View style={styles.confirmBtnContainer}>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleSave}>
                <Ionicons name="cloud-upload" size={20} color="#fff" />
                <Text style={styles.confirmBtnText}>確認上傳</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* 編輯 Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent={false}>
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.modalBack}>
              <Text style={styles.modalBackText}>取消</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>修改照護紀錄</Text>
            <TouchableOpacity onPress={handleEdit}>
              <Text style={styles.modalSaveText}>儲存</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <Text style={styles.sectionTitle}>記錄時間</Text>
            <View style={styles.dateTimeRow}>
              <TouchableOpacity style={styles.dateTimeBtn} onPress={() => { setTempEditDate(new Date(editForm.recordDate)); setShowEditDateModal(true) }}>
                <Ionicons name="calendar-outline" size={18} color="#1f74d1" />
                <Text style={styles.dateTimeText}>{formatDateForDisplay(editForm.recordDate)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateTimeBtn} onPress={() => { setTempEditTime(new Date(editForm.recordTime)); setShowEditTimeModal(true) }}>
                <Ionicons name="time-outline" size={18} color="#1f74d1" />
                <Text style={styles.dateTimeText}>{formatTimeForDisplay(editForm.recordTime)}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>分類</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => setShowEditCategoryModal(true)}>
              <Text style={[styles.dropdownText, !editForm.category && styles.dropdownPlaceholder]}>
                {editForm.category ? CATEGORY_LABELS[editForm.category] : "請選擇分類"}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#999" />
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>項目</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => editForm.category ? setShowEditSubItemModal(true) : Alert.alert("請先選擇分類")}>
              <Text style={[styles.dropdownText, !editForm.subItem && styles.dropdownPlaceholder]}>
                {editForm.subItem === "__other__" ? "其他（自訂）" : (editForm.subItem || "請選擇項目")}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#999" />
            </TouchableOpacity>

            {editForm.subItem === "__other__" && (
              <>
                <Text style={styles.sectionTitle}>自訂項目名稱</Text>
                <TextInput
                  style={styles.input}
                  placeholder="請輸入項目名稱"
                  value={editForm.customItem}
                  onChangeText={v => setEditForm(prev => ({ ...prev, customItem: v }))}
                />
              </>
            )}

            <Text style={styles.sectionTitle}>備註</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="請輸入觀察或特別狀況..."
              multiline
              numberOfLines={4}
              value={editForm.note}
              onChangeText={v => setEditForm(prev => ({ ...prev, note: v }))}
            />

            <View style={styles.confirmBtnContainer}>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleEdit}>
                <Ionicons name="cloud-upload" size={20} color="#fff" />
                <Text style={styles.confirmBtnText}>確認修改</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <CalendarPicker
        visible={showEditDateModal}
        value={tempEditDate}
        onConfirm={(date) => { setTempEditDate(date); setEditForm(prev => ({ ...prev, recordDate: date })); setShowEditDateModal(false) }}
        onCancel={() => setShowEditDateModal(false)}
      />

      <TimePicker
        visible={showEditTimeModal}
        value={tempEditTime}
        onConfirm={(date) => { setTempEditTime(date); setEditForm(prev => ({ ...prev, recordTime: date })); setShowEditTimeModal(false) }}
        onCancel={() => setShowEditTimeModal(false)}
      />

      {/* 編輯 - 分類選擇器 */}
      <Modal visible={showEditCategoryModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>選擇分類</Text>
              <TouchableOpacity onPress={() => setShowEditCategoryModal(false)}><Text style={styles.pickerDone}>完成</Text></TouchableOpacity>
            </View>
            <FlatList
              data={Object.entries(CATEGORY_LABELS)}
              keyExtractor={([key]) => key}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, editForm.category === item[0] && styles.pickerItemSelected]}
                  onPress={() => { setEditForm(prev => ({ ...prev, category: item[0], subItem: "" })); setShowEditCategoryModal(false) }}
                >
                  <Text style={[styles.pickerItemText, editForm.category === item[0] && styles.pickerItemTextSelected]}>{ITEM_ICONS[item[0]]} {item[1]}</Text>
                  {editForm.category === item[0] && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* 編輯 - 項目選擇器 */}
      <Modal visible={showEditSubItemModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>選擇項目</Text>
              <TouchableOpacity onPress={() => setShowEditSubItemModal(false)}><Text style={styles.pickerDone}>完成</Text></TouchableOpacity>
            </View>
            <FlatList
              data={editSubItemOptions}
              keyExtractor={item => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, editForm.subItem === item.value && styles.pickerItemSelected]}
                  onPress={() => { setEditForm(prev => ({ ...prev, subItem: item.value })); setShowEditSubItemModal(false) }}
                >
                  <Text style={[styles.pickerItemText, editForm.subItem === item.value && styles.pickerItemTextSelected]}>{item.value ? getItemIcon(item.value) : ""} {item.label}</Text>
                  {editForm.subItem === item.value && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      <CalendarPicker
        visible={showDateModal}
        value={tempDate}
        onConfirm={(date) => { setTempDate(date); setForm(prev => ({ ...prev, recordDate: date })); setShowDateModal(false) }}
        onCancel={() => setShowDateModal(false)}
      />

      <TimePicker
        visible={showTimeModal}
        value={tempTime}
        onConfirm={(date) => { setTempTime(date); setForm(prev => ({ ...prev, recordTime: date })); setShowTimeModal(false) }}
        onCancel={() => setShowTimeModal(false)}
      />

      <Modal visible={showCategoryModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCategoryModal(false)}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>選擇分類</Text>
            </View>
            {CATEGORY_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.pickerItem, form.category === opt.value && styles.pickerItemActive]}
                onPress={() => {
                  handleCategoryChange(opt.value)
                  setShowCategoryModal(false)
                }}
              >
                <Text style={[styles.pickerItemText, form.category === opt.value && styles.pickerItemTextActive]}>
                  {opt.value ? ITEM_ICONS[opt.value] : ""} {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showSubItemModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSubItemModal(false)}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>選擇項目</Text>
            </View>
            {(SUB_ITEMS[form.category] || []).map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.pickerItem, form.subItem === opt.value && styles.pickerItemActive]}
                onPress={() => {
                  setForm(prev => ({ ...prev, subItem: opt.value }))
                  setShowSubItemModal(false)
                }}
              >
                <Text style={[styles.pickerItemText, form.subItem === opt.value && styles.pickerItemTextActive]}>
                  {opt.value ? getItemIcon(opt.value) : ""} {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
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

  actionBar: { flexDirection: "row", padding: 15, backgroundColor: "#fff", gap: 10 },
  addBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#1890ff", padding: 12, borderRadius: 10, gap: 6 },
  addBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  refreshBtn: { width: 44, height: 44, borderWidth: 1, borderColor: "#c7d8ed", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  refreshBtnSmall: { padding: 6 },

  listContainer: { padding: 16, paddingBottom: 30 },
  emptyText: { textAlign: "center", marginTop: 50, color: colors.textMuted, fontSize: 15 },

  card: { backgroundColor: colors.card, borderRadius: 12, marginBottom: 12, padding: 14, elevation: 2 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  timeBadge: { flexDirection: "row", alignItems: "center", backgroundColor: colors.success, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 4 },
  timeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  caregiverText: { fontSize: 11, color: colors.textMuted },
  actionBtn: { padding: 4 },

  detailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailText: { fontSize: 13, color: colors.text, flex: 1 },
  bold: { fontWeight: "600", color: colors.textSub },
  itemIcon: { fontSize: 15 },

  modalScreen: { flex: 1, backgroundColor: "#fcfcfc" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: Platform.OS === "ios" ? 50 : 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee" },
  modalBack: { padding: 5 },
  modalBackText: { color: "#666", fontSize: 16 },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  modalSaveText: { color: "#1890ff", fontSize: 16, fontWeight: "bold" },
  modalBody: { flex: 1, padding: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#333", marginTop: 20, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: "#fff", marginBottom: 10 },
  textArea: { height: 100, textAlignVertical: "top" },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  optionBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: "#ddd", backgroundColor: "#fff", flexDirection: "row", alignItems: "center", gap: 6 },
  optionBtnActive: { backgroundColor: "#1890ff", borderColor: "#1890ff" },
  optionBtnText: { color: "#555", fontSize: 14 },
  optionBtnTextActive: { color: "#fff", fontWeight: "bold" },

  dateTimeRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
  dateTimeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#e8f0fe", padding: 14, borderRadius: 10, gap: 8 },
  dateTimeText: { fontSize: 16, color: "#1f74d1", fontWeight: "600" },

  careGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10 },
  careItem: { width: "30%", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#ddd", backgroundColor: "#fff" },
  careItemActive: { backgroundColor: "#e8f0fe", borderColor: "#1f74d1" },
  careIcon: { fontSize: 24, marginBottom: 4 },
  careText: { fontSize: 12, color: "#555", textAlign: "center" },
  careTextActive: { color: "#1f74d1", fontWeight: "bold" },

  confirmBtnContainer: { marginTop: 30, marginBottom: 50 },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#1890ff", padding: 16, borderRadius: 25, gap: 8 },
  confirmBtnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },

  pickerOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  pickerDismissArea: { flex: 1 },
  pickerToolbar: { flexDirection: "row", justifyContent: "space-between", padding: 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#ddd" },
  pickerCancel: { color: "#666", fontSize: 16 },
  pickerDone: { color: "#1f74d1", fontSize: 16, fontWeight: "bold" },

  dropdown: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14 },
  dropdownText: { fontSize: 16, color: "#333" },
  dropdownPlaceholder: { color: "#999" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  pickerModal: { backgroundColor: "#fff", borderRadius: 16, width: "100%", maxHeight: "70%", overflow: "hidden" },
  pickerModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  pickerModalTitle: { fontSize: 17, fontWeight: "bold", color: "#333" },
  pickerContainer: { backgroundColor: "#fff", borderRadius: 16, width: "100%", maxHeight: "70%", overflow: "hidden" },
  pickerHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee", alignItems: "center" },
  pickerTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  pickerItem: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  pickerItemActive: { backgroundColor: "#e8f0fe" },
  pickerItemText: { fontSize: 16, color: "#333" },
  pickerItemTextActive: { color: "#1f74d1", fontWeight: "bold" },
  pickerItemSelected: { backgroundColor: "#e8f0fe" },
  pickerItemTextSelected: { color: "#1f74d1", fontWeight: "bold" }
})
