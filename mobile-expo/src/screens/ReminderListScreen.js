import { useCallback, useState, useEffect } from "react"
import {
  ActivityIndicator,
  Alert,
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
  RefreshControl
} from "react-native"
import Ionicons from "react-native-vector-icons/Ionicons"
import { apiRequest } from "../lib/api"
import CalendarPicker from "../components/CalendarPicker"
import TimePicker from "../components/TimePicker"

const CATEGORY_OPTIONS = ["用藥提醒", "醫療行程", "生理量測", "生活照護", "其他"]
const DETAIL_PRESETS = {
  "用藥提醒": ["飯後服用血壓藥", "睡前服用安眠藥", "三餐飯後服藥", "施打胰島素"],
  "醫療行程": ["醫院回診", "診所拿藥", "物理治療/復健", "施打疫苗"],
  "生理量測": ["測量血壓", "測量空腹血糖", "測量體溫", "測量體重"],
  "生活照護": ["協助洗澡", "更換尿布", "剪指甲", "翻身拍背"],
  "其他": []
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"]
const DAY_OPTIONS = [
  { label: "日", value: 0 },
  { label: "一", value: 1 },
  { label: "二", value: 2 },
  { label: "三", value: 3 },
  { label: "四", value: 4 },
  { label: "五", value: 5 },
  { label: "六", value: 6 }
]

export default function ReminderListScreen({ apiBaseUrl, token, role, onBack }) {
  const [reminders, setReminders] = useState([])
  const [templates, setTemplates] = useState([])
  const [remindersLoading, setRemindersLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [taskStatuses, setTaskStatuses] = useState({})
  const [addModalVisible, setAddModalVisible] = useState(false)
  const [activeTab, setActiveTab] = useState("single")

  // 新增表單狀態
  const now = new Date()
  const [formType, setFormType] = useState("single")
  const [formCategory, setFormCategory] = useState("用藥提醒")
  const [formDetail, setFormDetail] = useState(DETAIL_PRESETS["用藥提醒"][0])
  const [formCustomDetail, setFormCustomDetail] = useState("")
  const [formSelectedDate, setFormSelectedDate] = useState(now)
  const [formHour, setFormHour] = useState(now.getHours())
  const [formMinute, setFormMinute] = useState(now.getMinutes())
  const [formWeekdays, setFormWeekdays] = useState([])
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)

  // 選擇器 Modal 狀態
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerTitle, setPickerTitle] = useState("")
  const [pickerOptions, setPickerOptions] = useState([])
  const [pickerSelected, setPickerSelected] = useState(null)
  const [pickerOnSelect, setPickerOnSelect] = useState(null)

  // 編輯狀態
  const [editId, setEditId] = useState(null)
  const [editFormType, setEditFormType] = useState("single")
  const [editFormCategory, setEditFormCategory] = useState("用藥提醒")
  const [editFormDetail, setEditFormDetail] = useState("")
  const [editFormCustomDetail, setEditFormCustomDetail] = useState("")
  const [editFormSelectedDate, setEditFormSelectedDate] = useState(now)
  const [editFormHour, setEditFormHour] = useState(now.getHours())
  const [editFormMinute, setEditFormMinute] = useState(now.getMinutes())
  const [editFormWeekdays, setEditFormWeekdays] = useState([])
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [showEditDatePicker, setShowEditDatePicker] = useState(false)
  const [showEditTimePicker, setShowEditTimePicker] = useState(false)

  const formPresets = DETAIL_PRESETS[formCategory] || []

  // 根據角色取得正確的 API 路徑前綴
  const getReminderPath = (suffix = "") => {
    const prefix = role === "family" ? "/family/reminders" : "/caregiver/reminders"
    return suffix ? `${prefix}/${suffix}` : prefix
  }

  const fetchReminders = useCallback(async () => {
    try {
      const data = await apiRequest({ apiBaseUrl, path: getReminderPath(), token })
      const raw = Array.isArray(data) ? data : (Array.isArray(data?.records) ? data.records : [])
      const valid = raw.filter(r => r && typeof r === "object" && r.time && !isNaN(new Date(r.time).getTime()))
      setReminders(valid.sort((a, b) => new Date(a.time) - new Date(b.time)))
    } catch (e) {
      console.error("取得提醒失敗", e)
      setReminders([])
    }
  }, [apiBaseUrl, token, role])

  // task-templates 路由不存在，暫時停用 templates 功能
  const fetchTemplates = useCallback(async () => {
    // 後端無此路由，設為空陣列
    setTemplates([])
    setTaskStatuses({})
  }, [])

  const loadData = async () => {
    setRemindersLoading(true)
    await Promise.all([fetchReminders(), fetchTemplates()])
    setRemindersLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [fetchReminders, fetchTemplates])

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchReminders(), fetchTemplates()])
    setRefreshing(false)
  }

  const formatTime = (iso) => {
    if (!iso) return "--:--"
    const d = new Date(iso)
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  // 使用本地時間的年月日
  const todayLocal = new Date()
  const todayKey = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`

  const todayReminders = (Array.isArray(reminders) ? reminders : []).filter(r => {
    if (!r || !r.time) return false
    // 提取 r.time 的年月日字串，用字串比對避免時區問題
    const d = new Date(r.time)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return dateStr === todayKey
  })

  const allTasks = [
    ...todayReminders.map(r => ({ ...r, taskId: r._id, isReminder: true })),
    ...(Array.isArray(templates) ? templates.map(t => ({ ...t, taskId: t._id, isReminder: false })) : [])
  ]

  const completedCount = allTasks.filter(t => {
    if (!t) return false
    if (t.isReminder) return t.isCompleted
    return taskStatuses[t._id] === true
  }).length

  const toggleTask = (taskId, isReminder, value) => {
    // 先更新本地狀態
    if (isReminder) {
      setReminders(prev => (Array.isArray(prev) ? prev.map(r =>
        r._id === taskId ? { ...r, isCompleted: value } : r
      ) : []))
      // 後端使用 /complete 或 /reset 路徑
      const action = value ? "complete" : "reset"
      apiRequest({
        apiBaseUrl,
        path: getReminderPath(`${taskId}/${action}`),
        method: "PATCH",
        token
      }).catch(e => console.error("更新失敗", e))
    } else {
      setTaskStatuses(prev => ({ ...prev, [taskId]: value }))
      // templates 功能暫時停用
    }
  }

  const handleSubmit = () => {
    alert("已送出今日照護紀錄")
  }

  // 開啟日期選擇器
  const openDatePicker = () => {
    setShowDatePicker(true)
  }

  // 開啟時間選擇器
  const openTimePicker = () => {
    setShowTimePicker(true)
  }

  // 選擇類別
  const handleCategorySelect = (cat) => {
    setFormCategory(cat)
    setFormDetail(DETAIL_PRESETS[cat]?.[0] || "其他")
  }

  // 切換提醒類型時重置
  const handleTypeChange = (type) => {
    setFormType(type)
    if (type === "repeat") {
      // 重複不需日期，只重置時間
      setFormHour(now.getHours())
      setFormMinute(now.getMinutes())
    } else {
      // 單次重置為今天
      setFormSelectedDate(new Date())
    }
  }

  // 新增提醒
  const handleAddReminder = () => {
    const content = formDetail === "其他" || !formPresets.length ? formCustomDetail : formDetail
    if (!content.trim()) {
      alert("請填寫內容")
      return
    }
    if (formType === "repeat" && formWeekdays.length === 0) {
      alert("請選擇重複日")
      return
    }
    // 單次: 取 formSelectedDate 的日期 + 時間；重複: 今天日期 + 設定時間
    let dateObj
    if (formType === "single") {
      dateObj = new Date(
        formSelectedDate.getFullYear(),
        formSelectedDate.getMonth(),
        formSelectedDate.getDate(),
        formHour,
        formMinute
      )
    } else {
      dateObj = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        formHour,
        formMinute
      )
    }
    const body = {
      category: formCategory,
      content,
      time: dateObj.toISOString()
    }
    if (formType === "repeat") {
      body.isRecurring = true
      body.recurringWeekdays = formWeekdays
    }
    apiRequest({ apiBaseUrl, path: getReminderPath(), method: "POST", token, body })
      .then(() => {
        setAddModalVisible(false)
        return fetchReminders()
      })
      .catch(e => alert("儲存失敗：" + e.message))
  }

  const toggleFormWeekday = (d) => {
    setFormWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  // 開啟編輯
  const openEdit = (item) => {
    setEditId(item._id)
    const isRecurring = item.isRecurring || item.recurring
    const d = new Date(item.time)
    setEditFormType(isRecurring ? "repeat" : "single")
    setEditFormCategory(item.category || "用藥提醒")
    setEditFormDetail(DETAIL_PRESETS[item.category]?.[0] || item.content || "")
    setEditFormCustomDetail("")
    setEditFormSelectedDate(d)
    setEditFormHour(d.getHours())
    setEditFormMinute(d.getMinutes())
    setEditFormWeekdays(item.recurringWeekdays || item.weekdays || [])
    setEditModalVisible(true)
  }

  // 確認編輯
  const handleEditReminder = () => {
    const content = editFormDetail === "其他" || !DETAIL_PRESETS[editFormCategory]?.length ? editFormCustomDetail : editFormDetail
    if (!content.trim()) {
      alert("請填寫內容")
      return
    }
    if (editFormType === "repeat" && editFormWeekdays.length === 0) {
      alert("請選擇重複日")
      return
    }
    let dateObj
    if (editFormType === "single") {
      dateObj = new Date(
        editFormSelectedDate.getFullYear(),
        editFormSelectedDate.getMonth(),
        editFormSelectedDate.getDate(),
        editFormHour,
        editFormMinute
      )
    } else {
      dateObj = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        editFormHour,
        editFormMinute
      )
    }
    const body = {
      category: editFormCategory,
      content,
      time: dateObj.toISOString()
    }
    if (editFormType === "repeat") {
      body.isRecurring = true
      body.recurringWeekdays = editFormWeekdays
    }
    apiRequest({ apiBaseUrl, path: getReminderPath(editId), method: "PATCH", token, body })
      .then(() => {
        setEditModalVisible(false)
        setEditId(null)
        return fetchReminders()
      })
      .catch(e => alert("更新失敗：" + e.message))
  }

  // 刪除提醒
  const handleDeleteReminder = (id) => {
    Alert.alert("確認刪除", "確定要刪除這筆提醒嗎？", [
      { text: "取消", style: "cancel" },
      {
        text: "刪除",
        style: "destructive",
        onPress: () => {
          setDeletingId(id)
          apiRequest({ apiBaseUrl, path: getReminderPath(id), method: "DELETE", token })
            .then(() => fetchReminders())
            .catch(e => alert("刪除失敗：" + e.message))
            .finally(() => setDeletingId(null))
        }
      }
    ])
  }

  // ============ 照護員視圖 ============
  if (role === "caregiver") {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={onBack}>
            <Text style={styles.backText}>返回</Text>
          </Pressable>
          <Text style={styles.title}>今日照護清單</Text>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView contentContainerStyle={styles.caregiverListContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.caregiverDateBar}>
            <Text style={styles.caregiverDateLabel}>任務日期</Text>
            <Text style={styles.caregiverDateValue}>{todayKey}</Text>
            <Text style={styles.caregiverProgress}>{completedCount}/{allTasks.length} 完成</Text>
          </View>

          {remindersLoading ? (
            <ActivityIndicator size="large" color="#1f74d1" style={{ marginTop: 40 }} />
          ) : allTasks.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>今日尚無照護任務</Text>
              <Text style={styles.emptySubText}>家屬設定的提醒將顯示在這裡</Text>
            </View>
          ) : (
            allTasks.map(task => {
              const status = task.isReminder ? task.isCompleted : taskStatuses[task._id]
              return (
                <View key={task.taskId} style={styles.caregiverTaskCard}>
                  <View style={styles.caregiverTaskLeft}>
                    <View style={[styles.caregiverBadge, status === true && styles.caregiverBadgeDone]}>
                      <Text style={[styles.caregiverBadgeText, status === true && styles.caregiverBadgeTextDone]}>
                        {task.category || "照護任務"}
                      </Text>
                    </View>
                    <Text style={[styles.caregiverTaskContent, status === true && styles.caregiverTaskContentDone]}>
                      {task.content}
                    </Text>
                    <Text style={styles.caregiverTaskTime}>
                      {task.isReminder ? formatTime(task.time) : task.time}
                    </Text>
                  </View>
                  <View style={styles.caregiverTaskActions}>
                    <TouchableOpacity
                      style={[styles.caregiverActionBtn, status === true && styles.caregiverActionBtnActive]}
                      onPress={() => toggleTask(task.taskId, task.isReminder, true)}
                    >
                      <Text style={[styles.caregiverActionText, status === true && styles.caregiverActionTextActive]}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.caregiverActionBtn, status === false && styles.caregiverActionBtnSkip]}
                      onPress={() => toggleTask(task.taskId, task.isReminder, false)}
                    >
                      <Text style={[styles.caregiverActionText, status === false && styles.caregiverActionTextSkip]}>✗</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            })
          )}
        </ScrollView>
      </View>
    )
  }

  // ============ 家屬視圖 ============
  const singleReminders = (Array.isArray(reminders) ? reminders : []).filter(r => r && !r.isRecurring && !r.recurring)
  const recurringReminders = (Array.isArray(reminders) ? reminders : []).filter(r => r && (r.isRecurring || r.recurring))

  const renderSingleReminder = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardTopRight}>
        <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
          <Ionicons name="pencil" size={18} color="#1890ff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteReminder(item._id)} disabled={deletingId === item._id}>
          <Ionicons name="trash" size={18} color="#ff4d4f" />
        </TouchableOpacity>
      </View>
      <View style={styles.cardHeader}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.category}</Text>
        </View>
        <View style={[styles.statusBadge, item.isCompleted ? styles.statusDone : styles.statusPending]}>
          <Ionicons name={item.isCompleted ? "checkmark" : "time"} size={14} color="#555" />
          <Text style={styles.statusText}>{item.isCompleted ? "已完成" : "待處理"}</Text>
        </View>
      </View>
      <Text style={styles.content}>{item.content}</Text>
      <View style={styles.timeRow}>
        <Ionicons name="alarm-outline" size={18} color="#666" />
        <Text style={styles.timeLabel}> 預定時間：</Text>
        <Text style={styles.timeText}>{formatTime(item.time)}</Text>
      </View>
    </View>
  )

  const renderRecurringReminder = ({ item }) => {
    const weekdays = item.recurringWeekdays || item.weekdays || []
    const weekdayDisplay = weekdays.length > 0
      ? weekdays.map(d => WEEKDAY_LABELS[d]).join("、")
      : "未設定"

    return (
      <View style={styles.card}>
        <View style={styles.cardTopRight}>
          <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
            <Ionicons name="pencil" size={18} color="#1890ff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteReminder(item._id)} disabled={deletingId === item._id}>
            <Ionicons name="trash" size={18} color="#ff4d4f" />
          </TouchableOpacity>
        </View>
        <View style={styles.cardHeader}>
          <View style={[styles.badge, { backgroundColor: "#f6ffed", borderColor: "#b7eb8f" }]}>
            <Text style={[styles.badgeText, { color: "#389e0d" }]}>重複</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.category}</Text>
          </View>
        </View>
        <Text style={styles.content}>{item.content}</Text>
        <View style={styles.weekdayRow}>
          <Ionicons name="repeat-outline" size={18} color="#389e0d" />
          <Text style={styles.weekdayLabel}> 重複日：</Text>
          <Text style={styles.weekdayText}>{weekdayDisplay}</Text>
        </View>
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={18} color="#666" />
          <Text style={styles.timeLabel}> 提醒時間：</Text>
          <Text style={styles.timeText}>{formatTime(item.time)}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.backText}>返回</Text>
        </Pressable>
        <Text style={styles.title}>提醒事項</Text>
        <TouchableOpacity onPress={() => setAddModalVisible(true)}>
          <Text style={{ color: "#1890ff", fontWeight: "bold", fontSize: 16 }}>新增</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "single" && styles.tabActive]}
          onPress={() => setActiveTab("single")}
        >
          <Text style={[styles.tabText, activeTab === "single" && styles.tabTextActive]}>單次提醒</Text>
          <Text style={[styles.tabCount, activeTab === "single" && styles.tabCountActive]}>
            {singleReminders.length}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "repeat" && styles.tabActive]}
          onPress={() => setActiveTab("repeat")}
        >
          <Text style={[styles.tabText, activeTab === "repeat" && styles.tabTextActive]}>重複提醒</Text>
          <Text style={[styles.tabCount, activeTab === "repeat" && styles.tabCountActive]}>
            {recurringReminders.length}
          </Text>
        </TouchableOpacity>
      </View>

      {remindersLoading ? (
        <ActivityIndicator size="large" color="#1890ff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={activeTab === "single" ? singleReminders : recurringReminders}
          keyExtractor={i => i._id}
          renderItem={activeTab === "single" ? renderSingleReminder : renderRecurringReminder}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {activeTab === "single" ? "尚無單次提醒" : "尚無重複提醒"}
              </Text>
            </View>
          }
        />
      )}

      {/* 新增提醒 Modal */}
      <Modal visible={addModalVisible} animationType="slide" transparent={false}>
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setAddModalVisible(false)} style={styles.modalBack}>
              <Ionicons name="chevron-back" size={24} color="#333" />
              <Text style={styles.modalBackText}>返回</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>新增提醒</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalBody}>
            {/* 提醒類型 */}
            <Text style={styles.sectionLabel}>提醒類型</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, formType === "single" && styles.typeBtnActive]}
                onPress={() => handleTypeChange("single")}
              >
                <Ionicons name="time-outline" size={20} color={formType === "single" ? "#fff" : "#1890ff"} />
                <Text style={[styles.typeBtnText, formType === "single" && styles.typeBtnTextActive]}>單次</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, formType === "repeat" && styles.typeBtnActive]}
                onPress={() => handleTypeChange("repeat")}
              >
                <Ionicons name="repeat-outline" size={20} color={formType === "repeat" ? "#fff" : "#389e0d"} />
                <Text style={[styles.typeBtnText, formType === "repeat" && styles.typeBtnTextActive]}>重複</Text>
              </TouchableOpacity>
            </View>

            {/* 提醒類別 */}
            <Text style={styles.sectionLabel}>1. 提醒類別</Text>
            <View style={styles.optionGrid}>
              {CATEGORY_OPTIONS.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.optionBtn, formCategory === cat && styles.optionBtnActive]}
                  onPress={() => handleCategorySelect(cat)}
                >
                  <Text style={[styles.optionBtnText, formCategory === cat && styles.optionBtnTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 提醒內容 */}
            <Text style={styles.sectionLabel}>2. 提醒內容</Text>
            {formPresets.length > 0 ? (
              <View style={styles.optionGrid}>
                {formPresets.map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.optionBtn, formDetail === d && styles.optionBtnActive]}
                    onPress={() => setFormDetail(d)}
                  >
                    <Text style={[styles.optionBtnText, formDetail === d && styles.optionBtnTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.optionBtn, formDetail === "其他" && styles.optionBtnActive]}
                  onPress={() => setFormDetail("其他")}
                >
                  <Text style={[styles.optionBtnText, formDetail === "其他" && styles.optionBtnTextActive]}>其他</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {formDetail === "其他" || !formPresets.length ? (
              <TextInput
                style={styles.customInput}
                placeholder="請輸入自訂內容..."
                value={formCustomDetail}
                onChangeText={setFormCustomDetail}
              />
            ) : null}

            {/* 重複日 */}
            {formType === "repeat" && (
              <>
                <Text style={styles.sectionLabel}>3. 選擇重複日</Text>
                <View style={styles.weekdayGrid}>
                  {DAY_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.weekdayBtn, formWeekdays.includes(opt.value) && styles.weekdayBtnActive]}
                      onPress={() => toggleFormWeekday(opt.value)}
                    >
                      <Text style={[styles.weekdayBtnText, formWeekdays.includes(opt.value) && styles.weekdayBtnTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* 日期時間 */}
            <Text style={styles.sectionLabel}>{formType === "single" ? "3. 提醒日期與時間" : "3. 提醒時間"}</Text>

            <View style={styles.dateTimeRow}>
              {formType === "single" && (
                <TouchableOpacity style={styles.dateTimeBtn} onPress={openDatePicker}>
                  <Ionicons name="calendar-outline" size={20} color="#1890ff" />
                  <Text style={styles.dateTimeBtnText}>
                    {`${formSelectedDate.getFullYear()}/${String(formSelectedDate.getMonth() + 1).padStart(2, "0")}/${String(formSelectedDate.getDate()).padStart(2, "0")}`}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.dateTimeBtn, formType === "repeat" && styles.dateTimeBtnFull]} onPress={openTimePicker}>
                <Ionicons name="time-outline" size={20} color="#1890ff" />
                <Text style={styles.dateTimeBtnText}>{`${String(formHour).padStart(2, "0")}:${String(formMinute).padStart(2, "0")}`}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleAddReminder}>
              <Text style={styles.submitBtnText}>確認新增</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* 日曆選擇器 */}
      <CalendarPicker
        visible={showDatePicker}
        value={formSelectedDate}
        onConfirm={(date) => {
          setFormSelectedDate(date)
          setShowDatePicker(false)
        }}
        onCancel={() => setShowDatePicker(false)}
      />

      {/* 時間選擇器 */}
      <TimePicker
        visible={showTimePicker}
        value={new Date(2000, 0, 1, formHour, formMinute)}
        onConfirm={(date) => {
          setFormHour(date.getHours())
          setFormMinute(date.getMinutes())
          setShowTimePicker(false)
        }}
        onCancel={() => setShowTimePicker(false)}
      />

      {/* 編輯提醒 Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent={false}>
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.modalBack}>
              <Ionicons name="chevron-back" size={24} color="#333" />
              <Text style={styles.modalBackText}>返回</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>編輯提醒</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalBody}>
            {/* 提醒類型 */}
            <Text style={styles.sectionLabel}>提醒類型</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, editFormType === "single" && styles.typeBtnActive]}
                onPress={() => setEditFormType("single")}
              >
                <Ionicons name="time-outline" size={20} color={editFormType === "single" ? "#fff" : "#1890ff"} />
                <Text style={[styles.typeBtnText, editFormType === "single" && styles.typeBtnTextActive]}>單次</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, editFormType === "repeat" && styles.typeBtnActive]}
                onPress={() => setEditFormType("repeat")}
              >
                <Ionicons name="repeat-outline" size={20} color={editFormType === "repeat" ? "#fff" : "#389e0d"} />
                <Text style={[styles.typeBtnText, editFormType === "repeat" && styles.typeBtnTextActive]}>重複</Text>
              </TouchableOpacity>
            </View>

            {/* 提醒類別 */}
            <Text style={styles.sectionLabel}>1. 提醒類別</Text>
            <View style={styles.optionGrid}>
              {CATEGORY_OPTIONS.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.optionBtn, editFormCategory === cat && styles.optionBtnActive]}
                  onPress={() => {
                    setEditFormCategory(cat)
                    setEditFormDetail(DETAIL_PRESETS[cat]?.[0] || "")
                  }}
                >
                  <Text style={[styles.optionBtnText, editFormCategory === cat && styles.optionBtnTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 提醒內容 */}
            <Text style={styles.sectionLabel}>2. 提醒內容</Text>
            {DETAIL_PRESETS[editFormCategory]?.length > 0 ? (
              <View style={styles.optionGrid}>
                {DETAIL_PRESETS[editFormCategory].map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.optionBtn, editFormDetail === d && styles.optionBtnActive]}
                    onPress={() => setEditFormDetail(d)}
                  >
                    <Text style={[styles.optionBtnText, editFormDetail === d && styles.optionBtnTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.optionBtn, editFormDetail === "其他" && styles.optionBtnActive]}
                  onPress={() => setEditFormDetail("其他")}
                >
                  <Text style={[styles.optionBtnText, editFormDetail === "其他" && styles.optionBtnTextActive]}>其他</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {editFormDetail === "其他" || !DETAIL_PRESETS[editFormCategory]?.length ? (
              <TextInput
                style={styles.customInput}
                placeholder="請輸入自訂內容..."
                value={editFormCustomDetail}
                onChangeText={setEditFormCustomDetail}
              />
            ) : null}

            {/* 重複日 */}
            {editFormType === "repeat" && (
              <>
                <Text style={styles.sectionLabel}>3. 選擇重複日</Text>
                <View style={styles.weekdayGrid}>
                  {DAY_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.weekdayBtn, editFormWeekdays.includes(opt.value) && styles.weekdayBtnActive]}
                      onPress={() => {
                        setEditFormWeekdays(prev =>
                          prev.includes(opt.value) ? prev.filter(x => x !== opt.value) : [...prev, opt.value]
                        )
                      }}
                    >
                      <Text style={[styles.weekdayBtnText, editFormWeekdays.includes(opt.value) && styles.weekdayBtnTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* 日期時間 */}
            <Text style={styles.sectionLabel}>{editFormType === "single" ? "3. 提醒日期與時間" : "3. 提醒時間"}</Text>

            <View style={styles.dateTimeRow}>
              {editFormType === "single" && (
                <TouchableOpacity style={styles.dateTimeBtn} onPress={() => setShowEditDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={20} color="#1890ff" />
                  <Text style={styles.dateTimeBtnText}>
                    {`${editFormSelectedDate.getFullYear()}/${String(editFormSelectedDate.getMonth() + 1).padStart(2, "0")}/${String(editFormSelectedDate.getDate()).padStart(2, "0")}`}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.dateTimeBtn, editFormType === "repeat" && styles.dateTimeBtnFull]} onPress={() => setShowEditTimePicker(true)}>
                <Ionicons name="time-outline" size={20} color="#1890ff" />
                <Text style={styles.dateTimeBtnText}>{`${String(editFormHour).padStart(2, "0")}:${String(editFormMinute).padStart(2, "0")}`}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleEditReminder}>
              <Text style={styles.submitBtnText}>確認更新</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* 編輯日曆選擇器 */}
      <CalendarPicker
        visible={showEditDatePicker}
        value={editFormSelectedDate}
        onConfirm={(date) => {
          setEditFormSelectedDate(date)
          setShowEditDatePicker(false)
        }}
        onCancel={() => setShowEditDatePicker(false)}
      />

      {/* 編輯時間選擇器 */}
      <TimePicker
        visible={showEditTimePicker}
        value={new Date(2000, 0, 1, editFormHour, editFormMinute)}
        onConfirm={(date) => {
          setEditFormHour(date.getHours())
          setEditFormMinute(date.getMinutes())
          setShowEditTimePicker(false)
        }}
        onCancel={() => setShowEditTimePicker(false)}
      />

      {/* 通用選擇器 Modal */}
      {pickerVisible && (
        <TouchableOpacity
          style={pickerStyles.overlay}
          activeOpacity={1}
          onPress={() => setPickerVisible(false)}
        >
          <View style={pickerStyles.sheet}>
            <View style={pickerStyles.handle} />
            <View style={pickerStyles.header}>
              <Text style={pickerStyles.title}>{pickerTitle}</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}>
                <Text style={pickerStyles.done}>完成</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={pickerStyles.list}>
              {pickerOptions.map(opt => {
                const val = typeof opt === "object" ? opt.value : opt
                const label = typeof opt === "object" ? opt.label : String(opt).padStart(2, "0")
                return (
                  <TouchableOpacity
                    key={val}
                    style={pickerStyles.item}
                    onPress={() => {
                      setPickerSelected(val)
                      setPickerVisible(false)
                      if (pickerOnSelect) pickerOnSelect(val)
                    }}
                  >
                    <Text style={[pickerStyles.itemText, pickerSelected === val && pickerStyles.itemTextActive]}>
                      {label}
                    </Text>
                    {pickerSelected === val && <Ionicons name="checkmark" size={22} color="#1890ff" />}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      )}
    </View>
  )
}

const pickerStyles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 },
  handle: { width: 36, height: 5, backgroundColor: "#ddd", borderRadius: 3, alignSelf: "center", marginTop: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  cancel: { color: "#666", fontSize: 16, padding: 8 },
  title: { fontSize: 17, fontWeight: "bold", color: "#333" },
  done: { color: "#1890ff", fontSize: 16, fontWeight: "bold", padding: 8 },
  list: { maxHeight: 350 },
  item: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: "#f5f5f5" },
  itemText: { fontSize: 17, color: "#333" },
  itemTextActive: { color: "#1890ff", fontWeight: "600" },
})

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f0f2f5" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#d8e6ff" },
  backText: { color: "#1f74d1", fontWeight: "900", fontSize: 16 },
  title: { fontSize: 18, fontWeight: "900", color: "#11355c" },

  caregiverListContainer: { padding: 16, paddingBottom: 100 },
  caregiverDateBar: { flexDirection: "row", alignItems: "center", marginBottom: 16, backgroundColor: "#fff", padding: 14, borderRadius: 10, gap: 12 },
  caregiverDateLabel: { fontSize: 14, color: "#666" },
  caregiverDateValue: { fontSize: 16, fontWeight: "bold", color: "#1f74d1", flex: 1 },
  caregiverProgress: { fontSize: 14, color: "#389e0d", fontWeight: "bold" },
  caregiverTaskCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", padding: 14, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: "#e8f0fe" },
  caregiverTaskLeft: { flex: 1 },
  caregiverBadge: { backgroundColor: "#e6f4ff", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, alignSelf: "flex-start", marginBottom: 6 },
  caregiverBadgeDone: { backgroundColor: "#d9f7be" },
  caregiverBadgeText: { color: "#1890ff", fontSize: 12, fontWeight: "bold" },
  caregiverBadgeTextDone: { color: "#389e0d" },
  caregiverTaskContent: { fontSize: 16, fontWeight: "bold", color: "#333", marginBottom: 4 },
  caregiverTaskContentDone: { textDecorationLine: "line-through", color: "#999" },
  caregiverTaskTime: { fontSize: 13, color: "#888" },
  caregiverTaskActions: { flexDirection: "row", gap: 8 },
  caregiverActionBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: "#ccc", alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  caregiverActionBtnActive: { borderColor: "#389e0d", backgroundColor: "#389e0d" },
  caregiverActionBtnSkip: { borderColor: "#ff4d4f", backgroundColor: "#ff4d4f" },
  caregiverActionText: { fontSize: 20, color: "#555", fontWeight: "bold" },
  caregiverActionTextActive: { color: "#fff" },
  caregiverActionTextSkip: { color: "#fff" },

  tabBar: { flexDirection: "row", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e8e8e8" },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, gap: 6 },
  tabActive: { borderBottomWidth: 3, borderBottomColor: "#1890ff" },
  tabText: { fontSize: 15, color: "#999", fontWeight: "600" },
  tabTextActive: { color: "#1890ff" },
  tabCount: { backgroundColor: "#f0f0f0", color: "#999", fontSize: 12, fontWeight: "bold", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  tabCountActive: { backgroundColor: "#e6f4ff", color: "#1890ff" },

  listContainer: { padding: 15, paddingBottom: 30 },
  emptyContainer: { alignItems: "center", marginTop: 50 },
  emptyText: { color: "#999", fontSize: 16 },
  emptySubText: { color: "#ccc", fontSize: 14, marginTop: 5, textAlign: "center" },

  card: { backgroundColor: "#fff", marginBottom: 12, padding: 15, paddingRight: 70, borderRadius: 12, borderLeftWidth: 5, borderLeftColor: "#1890ff", elevation: 2, position: "relative" },
  cardTopRight: { position: "absolute", top: 15, right: 15, flexDirection: "row", gap: 4 },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 },
  badge: { backgroundColor: "#e6f7ff", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { color: "#1890ff", fontWeight: "bold", fontSize: 12 },
  statusBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  statusPending: { backgroundColor: "#fffbe6", borderColor: "#ffe58f" },
  statusDone: { backgroundColor: "#f6ffed", borderColor: "#b7eb8f" },
  statusText: { fontSize: 12, color: "#555", marginLeft: 4 },
  content: { fontSize: 18, fontWeight: "bold", color: "#222", marginBottom: 12, paddingRight: 50 },
  timeRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "#f0f0f0", paddingTop: 10, paddingRight: 50 },
  timeLabel: { color: "#666", fontSize: 14 },
  timeText: { color: "#222", fontSize: 16, fontWeight: "bold" },
  weekdayRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  weekdayLabel: { color: "#389e0d", fontSize: 14 },
  weekdayText: { color: "#389e0d", fontSize: 16, fontWeight: "bold" },
  cardTopRight: { position: "absolute", top: 15, right: 15, flexDirection: "row", gap: 4 },
  editBtn: { padding: 4 },
  deleteBtn: { padding: 4 },

  modalScreen: { flex: 1, backgroundColor: "#fcfcfc" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 15, paddingTop: Platform.OS === "ios" ? 50 : 20, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee" },
  modalBack: { flexDirection: "row", alignItems: "center", width: 100 },
  modalBackText: { fontSize: 16, color: "#333" },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  modalBody: { padding: 20, paddingBottom: 50 },
  sectionLabel: { fontSize: 16, fontWeight: "bold", color: "#333", marginBottom: 12, marginTop: 15 },
  typeRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  typeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 14, borderRadius: 10, borderWidth: 2, borderColor: "#1890ff", backgroundColor: "#fff", gap: 6 },
  typeBtnActive: { backgroundColor: "#1890ff", borderColor: "#1890ff" },
  typeBtnText: { color: "#1890ff", fontSize: 16, fontWeight: "bold" },
  typeBtnTextActive: { color: "#fff" },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10 },
  optionBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: "#ddd", backgroundColor: "#fff" },
  optionBtnActive: { backgroundColor: "#1890ff", borderColor: "#1890ff" },
  optionBtnText: { color: "#555", fontSize: 14 },
  optionBtnTextActive: { color: "#fff", fontWeight: "bold" },
  customInput: { borderWidth: 1, borderColor: "#1890ff", padding: 12, borderRadius: 8, marginTop: 10, backgroundColor: "#e6f4ff", fontSize: 16 },
  weekdayGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  weekdayBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: "#ddd", alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  weekdayBtnActive: { backgroundColor: "#389e0d", borderColor: "#389e0d" },
  weekdayBtnText: { fontSize: 16, fontWeight: "bold", color: "#555" },
  weekdayBtnTextActive: { color: "#fff" },
  dateRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  dateBtn: { flex: 1, height: 50, borderWidth: 1, borderColor: "#ccc", borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  dateBtnText: { fontSize: 16, color: "#333" },
  timeRow2: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 30 },
  timeBtn: { alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd", borderRadius: 12, paddingHorizontal: 30, paddingVertical: 15 },
  timeBtnText: { fontSize: 28, fontWeight: "bold", color: "#333" },
  timeBtnLabel: { fontSize: 12, color: "#999", marginTop: 2 },
  timeSeparator: { fontSize: 32, fontWeight: "bold", color: "#333" },
  dateTimeRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  dateTimeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 14, borderRadius: 10, borderWidth: 1, borderColor: "#1890ff", backgroundColor: "#e6f4ff", gap: 8 },
  dateTimeBtnFull: { flex: 1 },
  dateTimeBtnText: { fontSize: 16, color: "#1890ff", fontWeight: "600" },
  submitBtn: { backgroundColor: "#1890ff", padding: 16, borderRadius: 10, alignItems: "center", marginTop: 10 },
  submitBtnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
})
