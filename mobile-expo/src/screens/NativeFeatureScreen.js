import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View
} from "react-native"
import { apiRequest } from "../lib/api"
import {
  loadLastSeenSosEvent,
  loadSosPhone,
  saveLastSeenSosEvent,
  saveSosPhone
} from "../lib/storage"

const FIRST_AID_STEPS = [
  {
    title: "步驟 1：確認安全並呼叫患者",
    desc: "先確認現場安全，輕拍肩膀並大聲呼叫。若沒有反應，請立刻請旁人協助並準備撥打 119。",
    image: require("../assets/first-aid-step1.png")
  },
  {
    title: "步驟 2：撥打 119 並依指示急救",
    desc: "清楚告知位置、患者狀況與聯絡電話。依 119 指示進行 CPR、尋找 AED，直到救護人員抵達。",
    image: require("../assets/first-aid-step2.png")
  }
]

const EMERGENCY_VIBRATION = [0, 900, 250, 900, 250, 1400]

function formatValue(value) {
  if (value == null || value === "") return "-"
  if (value instanceof Date) return value.toLocaleString("zh-TW", { hour12: false })
  if (Array.isArray(value)) return value.map(formatValue).join(" / ")
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !["_id", "__v", "userId", "patientUserId", "reporterUserId"].includes(key))
      .map(([key, entryValue]) => `${key}: ${formatValue(entryValue)}`)
      .join("\n")
  }
  if (typeof value === "string" && /\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toLocaleString("zh-TW", { hour12: false })
  }
  return String(value)
}

function normalizeRecords(data, feature) {
  if (feature?.singleRecord) return [data].filter(Boolean)
  if (Array.isArray(data?.records)) return data.records
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data)) return data
  if (data?.record) return [data.record]
  return []
}

function getRecordTitle(record, index, t) {
  return (
    record?.title ||
    record?.eventId ||
    record?.alertId ||
    record?.logId ||
    record?.sessionId ||
    record?.systemId ||
    record?.reminderId ||
    record?.type ||
    record?.category ||
    (t ? t.recordFallbackFn(index) : `Record ${index + 1}`)
  )
}

function getRecordTime(record) {
  return (
    record?.happenedAt ||
    record?.triggeredAt ||
    record?.recordDate ||
    record?.detectedAt ||
    record?.time ||
    record?.createdAt ||
    record?.updatedAt
  )
}

function getRecordId(record) {
  return String(record?._id || record?.eventId || "")
}

function isSosRecord(record) {
  return Boolean(record?.eventId || record?.source?.includes?.("sos"))
}

function getFeatureScope(role, feature) {
  const path = feature?.createPath || feature?.historyPath || ""
  const pathRole = path.split("/").filter(Boolean)[0]
  return role || pathRole || "default"
}

function startEmergencyVibration() {
  try {
    Vibration.vibrate(EMERGENCY_VIBRATION, true)
  } catch {
    // Missing Android VIBRATE permission should not crash the app.
  }
}

function stopEmergencyVibration() {
  try {
    Vibration.cancel()
  } catch {
    // Some Android versions throw if the installed APK lacks VIBRATE.
  }
}

function openPhone(phone) {
  const normalized = String(phone || "").trim()
  if (!normalized) return
  Linking.openURL(`tel:${normalized}`)
}

function openRecordMap(record) {
  const lat = Number(record?.latitude)
  const lng = Number(record?.longitude)
  const query = Number.isFinite(lat) && Number.isFinite(lng)
    ? `${lat},${lng}`
    : String(record?.locationLabel || "").trim()
  if (!query) return
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`)
}

function getGeolocationModule() {
  if (!NativeModules.RNCGeolocation) return null
  try {
    return require("@react-native-community/geolocation").default
  } catch {
    return null
  }
}

async function requestLocationPermission() {
  if (Platform.OS !== "android") return true
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: "允許定位",
      message: "SOS 求救會嘗試取得目前位置，讓家屬與救護人員更快找到你。",
      buttonPositive: "允許",
      buttonNegative: "取消"
    }
  )
  return result === PermissionsAndroid.RESULTS.GRANTED
}

async function getCurrentPosition() {
  const granted = await requestLocationPermission()
  if (!granted) return null
  const geolocation = getGeolocationModule()
  if (!geolocation) return null

  return new Promise(resolve => {
    geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords || {}
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          resolve(null)
          return
        }
        resolve({
          latitude,
          longitude,
          locationLabel: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
        })
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    )
  })
}

const UI_TEXT = {
  zh: {
    back: "返回", refresh: "重新整理", sync: "同步資料", syncing: "同步中...",
    save: "儲存", saving: "儲存中...", noData: "目前沒有資料。",
    addSOS: "緊急求救", addReminder: "新增提醒",
    msg: "求救訊息", loc: "位置", cat: "類別", content: "內容", timeIso: "時間 ISO", note: "備註",
    basicInfo: "基本資料", feature: "功能",
    sosMsg: "我需要緊急協助", sosLoc: "目前位置",
    reminderCat: "用藥提醒", reminderContent: "請記得按時服藥。",
    recordFallbackFn: (i) => `紀錄 ${i + 1}`,
    recordCount: (n) => `${n} 筆紀錄`,
    syncDone: "已同步", createDone: "已送出",
    sosButton: "SOS", sosSending: "求救送出中...",
    sosHint: "按下後會送出 SOS 紀錄、嘗試附上定位，並自動撥打 119。家屬端登入後會收到即時警報彈窗與震動。",
    sosPhone: "手機號碼", sosPhonePlaceholder: "例如 0912345678",
    savePhone: "儲存手機號碼", savePhoneDone: "已儲存 SOS 聯絡手機",
    phoneModalTitle: "輸入 SOS 手機號碼",
    phoneModalText: "第一次使用 SOS 前需要留下手機號碼，之後會自動帶入並同步到求救紀錄。",
    phoneRequired: "請先輸入手機號碼",
    phoneRequiredSos: "請先輸入並儲存手機號碼後再送出 SOS。",
    later: "稍後",
    firstAidTitle: "急救步驟",
    viewMap: "查看位置", callPhone: "撥打電話", dismiss: "我知道了",
    emergencyTitle: "緊急 SOS",
    emergencyText: "收到新的求救事件，手機已啟動連續震動提醒。",
    emergencyEventId: "事件：", emergencyName: "姓名：", emergencyTime: "時間：",
    emergencyLoc: "位置：", emergencyPhone: "電話：", emergencyMsg: "訊息：",
    submit: "送出", submitting: "送出中...",
    noRecord: "目前沒有紀錄",
  },
  en: {
    back: "Back", refresh: "Refresh", sync: "Sync Data", syncing: "Syncing...",
    save: "Save", saving: "Saving...", noData: "No data yet.",
    addSOS: "Emergency SOS", addReminder: "New Reminder",
    msg: "Message", loc: "Location", cat: "Category", content: "Content", timeIso: "Time (ISO)", note: "Note",
    basicInfo: "Basic Info", feature: "Feature",
    sosMsg: "I need emergency help", sosLoc: "Current location",
    reminderCat: "Medication reminder", reminderContent: "Please take your medicine on time.",
    recordFallbackFn: (i) => `Record ${i + 1}`,
    recordCount: (n) => `${n} records`,
    syncDone: "Synced", createDone: "Sent",
    sosButton: "SOS", sosSending: "Sending SOS...",
    sosHint: "Pressing this sends an SOS record, attempts to attach location, and auto-dials 119. Family members will receive an alert popup with vibration.",
    sosPhone: "Phone number", sosPhonePlaceholder: "e.g. 0912345678",
    savePhone: "Save phone number", savePhoneDone: "SOS contact phone saved",
    phoneModalTitle: "Enter SOS Phone Number",
    phoneModalText: "You need to provide a phone number before using SOS. It will be saved and auto-filled next time.",
    phoneRequired: "Please enter a phone number first",
    phoneRequiredSos: "Please enter and save your phone number before sending SOS.",
    later: "Later",
    firstAidTitle: "First Aid Steps",
    viewMap: "View Location", callPhone: "Call", dismiss: "Got it",
    emergencyTitle: "Emergency SOS",
    emergencyText: "New SOS event received. Continuous vibration alert started.",
    emergencyEventId: "Event: ", emergencyName: "Name: ", emergencyTime: "Time: ",
    emergencyLoc: "Location: ", emergencyPhone: "Phone: ", emergencyMsg: "Message: ",
    submit: "Submit", submitting: "Submitting...",
    noRecord: "No records yet",
  },
  id: {
    back: "Kembali", refresh: "Segarkan", sync: "Sinkronkan", syncing: "Menyinkronkan...",
    save: "Simpan", saving: "Menyimpan...", noData: "Belum ada data.",
    addSOS: "SOS Darurat", addReminder: "Pengingat Baru",
    msg: "Pesan darurat", loc: "Lokasi", cat: "Kategori", content: "Isi", timeIso: "Waktu (ISO)", note: "Catatan",
    basicInfo: "Info Dasar", feature: "Fitur",
    sosMsg: "Saya butuh bantuan darurat", sosLoc: "Lokasi saat ini",
    reminderCat: "Pengingat obat", reminderContent: "Harap minum obat tepat waktu.",
    recordFallbackFn: (i) => `Catatan ${i + 1}`,
    recordCount: (n) => `${n} catatan`,
    syncDone: "Disinkronkan", createDone: "Terkirim",
    sosButton: "SOS", sosSending: "Mengirim SOS...",
    sosHint: "Menekan ini akan mengirim catatan SOS, mencoba melampirkan lokasi, dan otomatis menghubungi 119.",
    sosPhone: "Nomor telepon", sosPhonePlaceholder: "mis. 0912345678",
    savePhone: "Simpan nomor telepon", savePhoneDone: "Nomor telepon SOS tersimpan",
    phoneModalTitle: "Masukkan Nomor Telepon SOS",
    phoneModalText: "Anda perlu memberikan nomor telepon sebelum menggunakan SOS.",
    phoneRequired: "Harap masukkan nomor telepon terlebih dahulu",
    phoneRequiredSos: "Harap masukkan dan simpan nomor telepon sebelum mengirim SOS.",
    later: "Nanti",
    firstAidTitle: "Langkah Pertolongan Pertama",
    viewMap: "Lihat Lokasi", callPhone: "Telepon", dismiss: "Mengerti",
    emergencyTitle: "SOS Darurat",
    emergencyText: "Acara SOS baru diterima. Getaran peringatan dimulai.",
    emergencyEventId: "Acara: ", emergencyName: "Nama: ", emergencyTime: "Waktu: ",
    emergencyLoc: "Lokasi: ", emergencyPhone: "Telepon: ", emergencyMsg: "Pesan: ",
    submit: "Kirim", submitting: "Mengirim...",
    noRecord: "Belum ada catatan",
  },
  vi: {
    back: "Quay Lại", refresh: "Làm Mới", sync: "Đồng Bộ", syncing: "Đang đồng bộ...",
    save: "Lưu", saving: "Đang lưu...", noData: "Chưa có dữ liệu.",
    addSOS: "SOS Khẩn Cấp", addReminder: "Nhắc Nhở Mới",
    msg: "Tin nhắn khẩn cấp", loc: "Vị trí", cat: "Danh mục", content: "Nội dung", timeIso: "Thời gian (ISO)", note: "Ghi chú",
    basicInfo: "Thông Tin Cơ Bản", feature: "Tính Năng",
    sosMsg: "Tôi cần trợ giúp khẩn cấp", sosLoc: "Vị trí hiện tại",
    reminderCat: "Nhắc uống thuốc", reminderContent: "Vui lòng uống thuốc đúng giờ.",
    recordFallbackFn: (i) => `Bản ghi ${i + 1}`,
    recordCount: (n) => `${n} bản ghi`,
    syncDone: "Đã đồng bộ", createDone: "Đã gửi",
    sosButton: "SOS", sosSending: "Đang gửi SOS...",
    sosHint: "Nhấn để gửi hồ sơ SOS, cố gắng đính kèm vị trí và tự động gọi 119.",
    sosPhone: "Số điện thoại", sosPhonePlaceholder: "vd. 0912345678",
    savePhone: "Lưu số điện thoại", savePhoneDone: "Đã lưu số điện thoại SOS",
    phoneModalTitle: "Nhập Số Điện Thoại SOS",
    phoneModalText: "Bạn cần cung cấp số điện thoại trước khi sử dụng SOS.",
    phoneRequired: "Vui lòng nhập số điện thoại trước",
    phoneRequiredSos: "Vui lòng nhập và lưu số điện thoại trước khi gửi SOS.",
    later: "Để sau",
    firstAidTitle: "Các Bước Sơ Cứu",
    viewMap: "Xem Vị Trí", callPhone: "Gọi Điện", dismiss: "Đã hiểu",
    emergencyTitle: "SOS Khẩn Cấp",
    emergencyText: "Nhận được sự kiện SOS mới. Đã bắt đầu rung liên tục.",
    emergencyEventId: "Sự kiện: ", emergencyName: "Tên: ", emergencyTime: "Thời gian: ",
    emergencyLoc: "Vị trí: ", emergencyPhone: "Điện thoại: ", emergencyMsg: "Tin nhắn: ",
    submit: "Gửi", submitting: "Đang gửi...",
    noRecord: "Chưa có bản ghi",
  },
  tl: {
    back: "Bumalik", refresh: "I-refresh", sync: "I-sync", syncing: "Nagsi-sync...",
    save: "I-save", saving: "Sine-save...", noData: "Wala pang data.",
    addSOS: "Emergency SOS", addReminder: "Bagong Paalala",
    msg: "Mensaheng pang-emergency", loc: "Lokasyon", cat: "Kategorya", content: "Nilalaman", timeIso: "Oras (ISO)", note: "Tala",
    basicInfo: "Pangunahing Impormasyon", feature: "Tampok",
    sosMsg: "Kailangan ko ng tulong", sosLoc: "Kasalukuyang lokasyon",
    reminderCat: "Paalala sa gamot", reminderContent: "Mangyaring uminom ng gamot sa tamang oras.",
    recordFallbackFn: (i) => `Talaan ${i + 1}`,
    recordCount: (n) => `${n} talaan`,
    syncDone: "Na-sync", createDone: "Naipadala",
    sosButton: "SOS", sosSending: "Nagpapadala ng SOS...",
    sosHint: "Ang pagpindot nito ay nagpapadala ng SOS record, sumusubok na mag-attach ng lokasyon, at awtomatikong tumatawag sa 119.",
    sosPhone: "Numero ng telepono", sosPhonePlaceholder: "hal. 0912345678",
    savePhone: "I-save ang numero", savePhoneDone: "Na-save ang SOS na numero ng telepono",
    phoneModalTitle: "Ilagay ang SOS Phone Number",
    phoneModalText: "Kailangan mong magbigay ng numero ng telepono bago gamitin ang SOS.",
    phoneRequired: "Mangyaring maglagay muna ng numero ng telepono",
    phoneRequiredSos: "Mangyaring ilagay at i-save ang numero ng telepono bago magpadala ng SOS.",
    later: "Mamaya",
    firstAidTitle: "Mga Hakbang sa First Aid",
    viewMap: "Tingnan ang Lokasyon", callPhone: "Tumawag", dismiss: "Naintindihan ko",
    emergencyTitle: "Emergency SOS",
    emergencyText: "Natanggap ang bagong SOS event. Nagsimula ang patuloy na pag-vibrate.",
    emergencyEventId: "Event: ", emergencyName: "Pangalan: ", emergencyTime: "Oras: ",
    emergencyLoc: "Lokasyon: ", emergencyPhone: "Telepono: ", emergencyMsg: "Mensahe: ",
    submit: "Isumite", submitting: "Isinusumite...",
    noRecord: "Wala pang talaan",
  },
  th: {
    back: "กลับ", refresh: "รีเฟรช", sync: "ซิงค์ข้อมูล", syncing: "กำลังซิงค์...",
    save: "บันทึก", saving: "กำลังบันทึก...", noData: "ยังไม่มีข้อมูล",
    addSOS: "SOS ฉุกเฉิน", addReminder: "การแจ้งเตือนใหม่",
    msg: "ข้อความฉุกเฉิน", loc: "ตำแหน่ง", cat: "หมวดหมู่", content: "เนื้อหา", timeIso: "เวลา (ISO)", note: "หมายเหตุ",
    basicInfo: "ข้อมูลพื้นฐาน", feature: "คุณสมบัติ",
    sosMsg: "ฉันต้องการความช่วยเหลือด่วน", sosLoc: "ตำแหน่งปัจจุบัน",
    reminderCat: "เตือนทานยา", reminderContent: "กรุณาทานยาตามเวลา",
    recordFallbackFn: (i) => `บันทึก ${i + 1}`,
    recordCount: (n) => `${n} รายการ`,
    syncDone: "ซิงค์แล้ว", createDone: "ส่งแล้ว",
    sosButton: "SOS", sosSending: "กำลังส่ง SOS...",
    sosHint: "การกดจะส่งบันทึก SOS พยายามแนบตำแหน่ง และโทรหา 119 อัตโนมัติ",
    sosPhone: "หมายเลขโทรศัพท์", sosPhonePlaceholder: "เช่น 0912345678",
    savePhone: "บันทึกหมายเลขโทรศัพท์", savePhoneDone: "บันทึกหมายเลข SOS แล้ว",
    phoneModalTitle: "ใส่หมายเลขโทรศัพท์ SOS",
    phoneModalText: "คุณต้องระบุหมายเลขโทรศัพท์ก่อนใช้ SOS",
    phoneRequired: "กรุณาใส่หมายเลขโทรศัพท์ก่อน",
    phoneRequiredSos: "กรุณาใส่และบันทึกหมายเลขโทรศัพท์ก่อนส่ง SOS",
    later: "ภายหลัง",
    firstAidTitle: "ขั้นตอนการปฐมพยาบาล",
    viewMap: "ดูตำแหน่ง", callPhone: "โทรออก", dismiss: "รับทราบ",
    emergencyTitle: "SOS ฉุกเฉิน",
    emergencyText: "ได้รับเหตุการณ์ SOS ใหม่ เริ่มการสั่นสะเทือนต่อเนื่องแล้ว",
    emergencyEventId: "เหตุการณ์: ", emergencyName: "ชื่อ: ", emergencyTime: "เวลา: ",
    emergencyLoc: "ตำแหน่ง: ", emergencyPhone: "โทรศัพท์: ", emergencyMsg: "ข้อความ: ",
    submit: "ส่ง", submitting: "กำลังส่ง...",
    noRecord: "ยังไม่มีบันทึก",
  },
}

function NativeRecordCard({ record, index, t }) {
  const entries = Object.entries(record || {})
    .filter(([key]) => !["_id", "__v", "userId", "patientUserId", "reporterUserId", "createdAt", "updatedAt"].includes(key))
    .slice(0, 8)
  const time = getRecordTime(record)

  return (
    <View style={styles.recordCard}>
      <Text style={styles.recordTitle}>{getRecordTitle(record, index, t)}</Text>
      {time ? <Text style={styles.recordTime}>{formatValue(time)}</Text> : null}
      {entries.map(([key, value]) => (
        <View key={key} style={styles.fieldRow}>
          <Text style={styles.fieldKey}>{key}</Text>
          <Text style={styles.fieldValue}>{formatValue(value)}</Text>
        </View>
      ))}
      {isSosRecord(record) ? (
        <View style={styles.recordActions}>
          <Pressable style={styles.recordActionBtn} onPress={() => openRecordMap(record)}>
            <Text style={styles.recordActionText}>{t ? t.viewMap : "查看位置"}</Text>
          </Pressable>
          <Pressable style={styles.recordActionBtn} onPress={() => openPhone(record.patientPhone || "119")}>
            <Text style={styles.recordActionText}>{t ? t.callPhone : "撥打電話"}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

export default function NativeFeatureScreen({
  feature,
  role,
  apiBaseUrl,
  token,
  uiLang,
  onBack
}) {
  const t = UI_TEXT[role === "caregiver" ? (uiLang || "zh") : "zh"] || UI_TEXT.zh
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [phoneModalVisible, setPhoneModalVisible] = useState(false)
  const [phoneDraft, setPhoneDraft] = useState("")
  const [lastSeenSosId, setLastSeenSosId] = useState("")
  const [emergencyEvent, setEmergencyEvent] = useState(null)
  const sosBaselined = useRef(false)
  const [draft, setDraft] = useState({
    message: t.sosMsg,
    locationLabel: t.sosLoc,
    patientPhone: "",
    category: t.reminderCat,
    content: t.reminderContent,
    time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    note: ""
  })

  const canCreate = Boolean(feature?.createPath)
  const canSync = Boolean(feature?.syncPath)
  const isSosFeature = feature?.createType === "sos"
  const isFamilySosReceiver = feature?.historyPath === "/family/sos/history"
  const featureScope = useMemo(() => getFeatureScope(role, feature), [role, feature])
  const showsFirstAidSteps = isSosFeature && role === "caregiver"
  const hidesHistoryList = isSosFeature && role === "patient"

  const loadHistory = useCallback(async (silent = false) => {
    if (!feature?.historyPath) return
    if (!silent) {
      setLoading(true)
      setError("")
    }
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: feature.historyPath,
        token
      })
      setRecords(normalizeRecords(data, feature))
    } catch (loadError) {
      if (!silent) setError(loadError.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [apiBaseUrl, feature, token])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    let mounted = true
    if (!isSosFeature) return undefined

    loadSosPhone(featureScope).then(savedPhone => {
      if (!mounted) return
      if (savedPhone) {
        setPhoneDraft(savedPhone)
        setDraft(prev => ({ ...prev, patientPhone: savedPhone }))
      } else {
        setPhoneDraft("")
      }
    })

    loadLastSeenSosEvent(featureScope).then(eventId => {
      if (!mounted) return
      setLastSeenSosId(eventId)
    })

    return () => { mounted = false }
  }, [featureScope, isSosFeature])

  useEffect(() => {
    if (!isFamilySosReceiver || !records.length) return

    const latestActive = records.find(r => r.status === "active")
    const eventId = getRecordId(latestActive)

    if (!sosBaselined.current) {
      sosBaselined.current = true
      if (!lastSeenSosId && eventId) {
        setLastSeenSosId(eventId)
        saveLastSeenSosEvent(featureScope, eventId)
        return
      }
    }

    if (!latestActive || !eventId || eventId === lastSeenSosId) return

    setEmergencyEvent(latestActive)
    setLastSeenSosId(eventId)
    saveLastSeenSosEvent(featureScope, eventId)
    startEmergencyVibration()
  }, [featureScope, isFamilySosReceiver, lastSeenSosId, records])

  const summary = useMemo(() => {
    if (feature?.singleRecord) return t.basicInfo
    return t.recordCount(records.length)
  }, [feature?.singleRecord, records.length, t])

  const updateDraft = (key, value) => {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  const handleSavePhone = async () => {
    const normalizedPhone = phoneDraft.trim()
    if (!normalizedPhone) {
      setError(t.phoneRequired)
      return false
    }
    await saveSosPhone(featureScope, normalizedPhone)
    updateDraft("patientPhone", normalizedPhone)
    setPhoneModalVisible(false)
    setMessage(t.savePhoneDone)
    return true
  }

  const closeEmergency = () => {
    stopEmergencyVibration()
    setEmergencyEvent(null)
  }

  const handleSync = async () => {
    if (!feature?.syncPath) return
    setSyncing(true)
    setMessage("")
    setError("")
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: feature.syncPath,
        method: "POST",
        token
      })
      setMessage(data.message || t.syncDone)
      await loadHistory()
    } catch (syncError) {
      setError(syncError.message)
    } finally {
      setSyncing(false)
    }
  }

  const handleCreate = async () => {
    if (!feature?.createPath) return

    if (isSosFeature && !draft.patientPhone.trim()) {
      setPhoneDraft(draft.patientPhone)
      setPhoneModalVisible(true)
      setError(t.phoneRequiredSos)
      return
    }

    setSaving(true)
    setMessage("")
    setError("")
    try {
      if (isSosFeature) {
        await saveSosPhone(featureScope, draft.patientPhone.trim())
      }

      const location = isSosFeature ? await getCurrentPosition() : null
      const body =
        isSosFeature
          ? {
              message: draft.message,
              locationLabel: location?.locationLabel || draft.locationLabel,
              latitude: location?.latitude,
              longitude: location?.longitude,
              patientPhone: draft.patientPhone
            }
          : feature.createType === "reminder"
            ? {
                category: draft.category,
                content: draft.content,
                time: draft.time,
                note: draft.note
              }
            : draft

      const data = await apiRequest({
        apiBaseUrl,
        path: feature.createPath,
        method: "POST",
        token,
        body
      })
      setMessage(data.message || t.createDone)
      if (isSosFeature && location?.locationLabel) {
        updateDraft("locationLabel", location.locationLabel)
      }
      await loadHistory()
      if (isSosFeature) openPhone("119")
    } catch (createError) {
      setError(createError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.backText}>{t.back}</Text>
        </Pressable>
        <Text style={styles.title}>{feature?.title || t.feature}</Text>
        <Text style={styles.subtitle}>{feature?.desc || summary}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {loading ? <ActivityIndicator color="#1f74d1" /> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {canSync ? (
          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={handleSync} disabled={syncing}>
              <Text style={styles.secondaryBtnText}>{syncing ? t.syncing : t.sync}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={loadHistory} disabled={loading}>
              <Text style={styles.secondaryBtnText}>{t.refresh}</Text>
            </Pressable>
          </View>
        )}

        {canCreate ? (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>{isSosFeature ? t.addSOS : t.addReminder}</Text>
            {isSosFeature ? (
              <>
                <Pressable style={styles.sosButton} onPress={handleCreate} disabled={saving}>
                  <Text style={styles.sosButtonText}>{saving ? t.sosSending : t.sosButton}</Text>
                </Pressable>
                <Text style={styles.sosHint}>{t.sosHint}</Text>
                <Text style={styles.label}>{t.msg}</Text>
                <TextInput
                  style={styles.input}
                  value={draft.message}
                  onChangeText={value => updateDraft("message", value)}
                />
                <Text style={styles.label}>{t.loc}</Text>
                <TextInput
                  style={styles.input}
                  value={draft.locationLabel}
                  onChangeText={value => updateDraft("locationLabel", value)}
                />
                <Text style={styles.label}>{t.sosPhone}</Text>
                <TextInput
                  style={styles.input}
                  value={draft.patientPhone}
                  onChangeText={value => {
                    updateDraft("patientPhone", value)
                    setPhoneDraft(value)
                  }}
                  keyboardType="phone-pad"
                  placeholder={t.sosPhonePlaceholder}
                />
                <Pressable style={styles.secondaryBtnCompact} onPress={handleSavePhone}>
                  <Text style={styles.secondaryBtnText}>{t.savePhone}</Text>
                </Pressable>
                {showsFirstAidSteps ? (
                  <View style={styles.firstAidBox}>
                    <Text style={styles.firstAidTitle}>{t.firstAidTitle}</Text>
                    {FIRST_AID_STEPS.map(step => (
                      <View key={step.title} style={styles.firstAidStep}>
                        <Image source={step.image} style={styles.firstAidImage} resizeMode="cover" />
                        <View style={styles.firstAidTextBox}>
                          <Text style={styles.firstAidStepTitle}>{step.title}</Text>
                          <Text style={styles.firstAidStepDesc}>{step.desc}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.label}>{t.cat}</Text>
                <TextInput
                  style={styles.input}
                  value={draft.category}
                  onChangeText={value => updateDraft("category", value)}
                />
                <Text style={styles.label}>{t.content}</Text>
                <TextInput
                  style={styles.input}
                  value={draft.content}
                  onChangeText={value => updateDraft("content", value)}
                />
                <Text style={styles.label}>{t.timeIso}</Text>
                <TextInput
                  style={styles.input}
                  value={draft.time}
                  onChangeText={value => updateDraft("time", value)}
                />
                <Text style={styles.label}>{t.note}</Text>
                <TextInput
                  style={styles.input}
                  value={draft.note}
                  onChangeText={value => updateDraft("note", value)}
                />
                <Pressable style={styles.primaryBtn} onPress={handleCreate} disabled={saving}>
                  <Text style={styles.primaryBtnText}>{saving ? t.submitting : t.submit}</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}

        {hidesHistoryList ? null : (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.sectionTitle}>{summary}</Text>
            </View>

            {records.length ? (
              records.map((record, index) => (
                <NativeRecordCard
                  key={record._id || record.eventId || record.alertId || record.reminderId || index}
                  record={record}
                  index={index}
                  t={t}
                />
              ))
            ) : (
              <Text style={styles.emptyText}>{t.noRecord}</Text>
            )}
          </>
        )}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={phoneModalVisible}
        onRequestClose={() => setPhoneModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalPanel}>
            <Text style={styles.modalTitle}>{t.phoneModalTitle}</Text>
            <Text style={styles.modalText}>{t.phoneModalText}</Text>
            <TextInput
              style={styles.input}
              value={phoneDraft}
              onChangeText={setPhoneDraft}
              keyboardType="phone-pad"
              placeholder={t.sosPhonePlaceholder}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryBtn} onPress={() => setPhoneModalVisible(false)}>
                <Text style={styles.secondaryBtnText}>{t.later}</Text>
              </Pressable>
              <Pressable style={styles.primaryBtnInline} onPress={handleSavePhone}>
                <Text style={styles.primaryBtnText}>{t.save}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={Boolean(emergencyEvent)}
        onRequestClose={closeEmergency}
      >
        <View style={styles.emergencyBackdrop}>
          <View style={styles.emergencyPanel}>
            <Text style={styles.emergencyTitle}>{t.emergencyTitle}</Text>
            <Text style={styles.emergencyText}>{t.emergencyText}</Text>
            <View style={styles.emergencyInfo}>
              <Text style={styles.emergencyLine}>{t.emergencyEventId}{emergencyEvent?.eventId || "-"}</Text>
              <Text style={styles.emergencyLine}>{t.emergencyName}{emergencyEvent?.patientName || "-"}</Text>
              <Text style={styles.emergencyLine}>{t.emergencyTime}{formatValue(emergencyEvent?.triggeredAt)}</Text>
              <Text style={styles.emergencyLine}>{t.emergencyLoc}{emergencyEvent?.locationLabel || "-"}</Text>
              <Text style={styles.emergencyLine}>{t.emergencyPhone}{emergencyEvent?.patientPhone || "-"}</Text>
              <Text style={styles.emergencyLine}>{t.emergencyMsg}{emergencyEvent?.message || "-"}</Text>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryBtn} onPress={() => openRecordMap(emergencyEvent)}>
                <Text style={styles.secondaryBtnText}>{t.viewMap}</Text>
              </Pressable>
              <Pressable style={styles.primaryBtnInline} onPress={() => openPhone(emergencyEvent?.patientPhone || "119")}>
                <Text style={styles.primaryBtnText}>{t.callPhone}</Text>
              </Pressable>
            </View>
            <Pressable style={styles.dismissEmergencyBtn} onPress={closeEmergency}>
              <Text style={styles.dismissEmergencyText}>{t.dismiss}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f2f7ff"
  },
  header: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#d8e6ff",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14
  },
  backText: {
    color: "#1f74d1",
    fontWeight: "900"
  },
  title: {
    marginTop: 8,
    color: "#11355c",
    fontSize: 22,
    fontWeight: "900"
  },
  subtitle: {
    marginTop: 4,
    color: "#526b88",
    lineHeight: 20
  },
  container: {
    padding: 16,
    gap: 12,
    paddingBottom: 28
  },
  actions: {
    flexDirection: "row",
    gap: 10
  },
  summaryCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8e6ff",
    borderRadius: 12,
    padding: 14
  },
  formCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8e6ff",
    borderRadius: 12,
    padding: 14
  },
  sectionTitle: {
    color: "#173e67",
    fontSize: 18,
    fontWeight: "900"
  },
  label: {
    marginTop: 10,
    marginBottom: 5,
    color: "#244569",
    fontWeight: "800"
  },
  input: {
    borderWidth: 1,
    borderColor: "#c8d8ee",
    borderRadius: 10,
    backgroundColor: "#fbfdff",
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: "#173e67"
  },
  sosButton: {
    minHeight: 116,
    borderRadius: 18,
    backgroundColor: "#b42318",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    marginBottom: 8,
    shadowColor: "#7a271a",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4
  },
  sosButtonText: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900"
  },
  sosHint: {
    color: "#b42318",
    lineHeight: 20,
    fontWeight: "800",
    marginBottom: 4
  },
  firstAidBox: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#edf3fd",
    paddingTop: 14,
    gap: 12
  },
  firstAidTitle: {
    color: "#173e67",
    fontSize: 17,
    fontWeight: "900"
  },
  firstAidStep: {
    borderWidth: 1,
    borderColor: "#d8e6ff",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#f8fbff"
  },
  firstAidImage: {
    width: "100%",
    height: 150,
    backgroundColor: "#eef6ff"
  },
  firstAidTextBox: {
    padding: 12
  },
  firstAidStepTitle: {
    color: "#173e67",
    fontWeight: "900"
  },
  firstAidStepDesc: {
    marginTop: 5,
    color: "#4f6682",
    lineHeight: 20,
    fontWeight: "700"
  },
  recordCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8e6ff",
    borderRadius: 12,
    padding: 14
  },
  recordTitle: {
    color: "#173e67",
    fontSize: 17,
    fontWeight: "900"
  },
  recordTime: {
    marginTop: 4,
    color: "#70839d",
    fontSize: 12
  },
  fieldRow: {
    borderTopWidth: 1,
    borderTopColor: "#edf3fd",
    paddingTop: 8,
    marginTop: 8
  },
  fieldKey: {
    color: "#607990",
    fontSize: 12,
    fontWeight: "800"
  },
  fieldValue: {
    marginTop: 3,
    color: "#173e67",
    lineHeight: 20
  },
  recordActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12
  },
  recordActionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#c7d8ed",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#f8fbff"
  },
  recordActionText: {
    color: "#1f74d1",
    fontWeight: "900"
  },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: "#1f74d1",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  primaryBtnInline: {
    flex: 1,
    backgroundColor: "#b42318",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "900"
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#c7d8ed",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center"
  },
  secondaryBtnCompact: {
    marginTop: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#c7d8ed",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center"
  },
  secondaryBtnText: {
    color: "#1f74d1",
    fontWeight: "900"
  },
  message: {
    color: "#067647",
    fontWeight: "800"
  },
  error: {
    color: "#b42318",
    fontWeight: "800"
  },
  emptyText: {
    color: "#6a7e99",
    paddingVertical: 12
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(15, 23, 42, 0.45)"
  },
  modalPanel: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18
  },
  modalTitle: {
    color: "#11355c",
    fontSize: 20,
    fontWeight: "900"
  },
  modalText: {
    marginTop: 8,
    marginBottom: 14,
    color: "#526b88",
    lineHeight: 20,
    fontWeight: "700"
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14
  },
  emergencyBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(127, 29, 29, 0.52)"
  },
  emergencyPanel: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18
  },
  emergencyTitle: {
    color: "#b42318",
    fontSize: 26,
    fontWeight: "900"
  },
  emergencyText: {
    marginTop: 6,
    color: "#7a271a",
    lineHeight: 20,
    fontWeight: "800"
  },
  emergencyInfo: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#fecdca",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff7f5",
    gap: 6
  },
  emergencyLine: {
    color: "#173e67",
    lineHeight: 20,
    fontWeight: "800"
  },
  dismissEmergencyBtn: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 10
  },
  dismissEmergencyText: {
    color: "#667085",
    fontWeight: "900"
  }
})
