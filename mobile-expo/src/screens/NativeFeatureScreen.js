import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { apiRequest } from "../lib/api"

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
  if (feature.singleRecord) return [data].filter(Boolean)
  if (Array.isArray(data?.records)) return data.records
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data)) return data
  if (data?.record) return [data.record]
  return []
}

function getRecordTitle(record, index, t) {
  return (
    record.title ||
    record.eventId ||
    record.alertId ||
    record.logId ||
    record.sessionId ||
    record.systemId ||
    record.reminderId ||
    record.type ||
    record.category ||
    (t ? t.recordFallbackFn(index) : `Record ${index + 1}`)
  )
}

function getRecordTime(record) {
  return (
    record.happenedAt ||
    record.triggeredAt ||
    record.recordDate ||
    record.detectedAt ||
    record.time ||
    record.createdAt ||
    record.updatedAt
  )
}

const UI_TEXT = {
  zh: { back: "返回", refresh: "重新整理", sync: "同步資料", syncing: "同步中...", save: "儲存", saving: "儲存中...", noData: "目前沒有資料。", addSOS: "新增求助", addReminder: "新增提醒", msg: "訊息", loc: "位置", cat: "分類", content: "內容", timeIso: "時間 ISO", note: "備註", basicInfo: "基本資料", feature: "原生功能", sosMsg: "需要協助", sosLoc: "目前位置", reminderCat: "照護提醒", reminderContent: "請協助確認長輩狀況", recordFallbackFn: (i) => `紀錄 ${i + 1}`, recordCount: (n) => `${n} 筆紀錄`, syncDone: "已同步", createDone: "已新增" },
  en: { back: "Back", refresh: "Refresh", sync: "Sync Data", syncing: "Syncing...", save: "Save", saving: "Saving...", noData: "No data yet.", addSOS: "New SOS", addReminder: "New Reminder", msg: "Message", loc: "Location", cat: "Category", content: "Content", timeIso: "Time (ISO)", note: "Note", basicInfo: "Basic Info", feature: "Feature", sosMsg: "Need assistance", sosLoc: "Current location", reminderCat: "Care reminder", reminderContent: "Please check on the patient", recordFallbackFn: (i) => `Record ${i + 1}`, recordCount: (n) => `${n} records`, syncDone: "Synced", createDone: "Added" },
  id: { back: "Kembali", refresh: "Segarkan", sync: "Sinkronkan", syncing: "Menyinkronkan...", save: "Simpan", saving: "Menyimpan...", noData: "Belum ada data.", addSOS: "SOS Baru", addReminder: "Pengingat Baru", msg: "Pesan", loc: "Lokasi", cat: "Kategori", content: "Isi", timeIso: "Waktu (ISO)", note: "Catatan", basicInfo: "Info Dasar", feature: "Fitur", sosMsg: "Butuh bantuan", sosLoc: "Lokasi saat ini", reminderCat: "Pengingat perawatan", reminderContent: "Mohon periksa kondisi pasien", recordFallbackFn: (i) => `Catatan ${i + 1}`, recordCount: (n) => `${n} catatan`, syncDone: "Disinkronkan", createDone: "Ditambahkan" },
  vi: { back: "Quay Lại", refresh: "Làm Mới", sync: "Đồng Bộ", syncing: "Đang đồng bộ...", save: "Lưu", saving: "Đang lưu...", noData: "Chưa có dữ liệu.", addSOS: "SOS Mới", addReminder: "Nhắc Nhở Mới", msg: "Tin nhắn", loc: "Vị trí", cat: "Danh mục", content: "Nội dung", timeIso: "Thời gian (ISO)", note: "Ghi chú", basicInfo: "Thông Tin Cơ Bản", feature: "Tính Năng", sosMsg: "Cần hỗ trợ", sosLoc: "Vị trí hiện tại", reminderCat: "Nhắc nhở chăm sóc", reminderContent: "Vui lòng kiểm tra tình trạng bệnh nhân", recordFallbackFn: (i) => `Bản ghi ${i + 1}`, recordCount: (n) => `${n} bản ghi`, syncDone: "Đã đồng bộ", createDone: "Đã thêm" },
  tl: { back: "Bumalik", refresh: "I-refresh", sync: "I-sync", syncing: "Nagsi-sync...", save: "I-save", saving: "Sine-save...", noData: "Wala pang data.", addSOS: "Bagong SOS", addReminder: "Bagong Paalala", msg: "Mensahe", loc: "Lokasyon", cat: "Kategorya", content: "Nilalaman", timeIso: "Oras (ISO)", note: "Tala", basicInfo: "Pangunahing Impormasyon", feature: "Tampok", sosMsg: "Kailangan ng tulong", sosLoc: "Kasalukuyang lokasyon", reminderCat: "Paalala sa pag-aalaga", reminderContent: "Pakisuri ang kalagayan ng pasyente", recordFallbackFn: (i) => `Talaan ${i + 1}`, recordCount: (n) => `${n} talaan`, syncDone: "Na-sync", createDone: "Naidagdag" },
  th: { back: "กลับ", refresh: "รีเฟรช", sync: "ซิงค์ข้อมูล", syncing: "กำลังซิงค์...", save: "บันทึก", saving: "กำลังบันทึก...", noData: "ยังไม่มีข้อมูล", addSOS: "SOS ใหม่", addReminder: "การแจ้งเตือนใหม่", msg: "ข้อความ", loc: "ตำแหน่ง", cat: "หมวดหมู่", content: "เนื้อหา", timeIso: "เวลา (ISO)", note: "หมายเหตุ", basicInfo: "ข้อมูลพื้นฐาน", feature: "คุณสมบัติ", sosMsg: "ต้องการความช่วยเหลือ", sosLoc: "ตำแหน่งปัจจุบัน", reminderCat: "การแจ้งเตือนการดูแล", reminderContent: "กรุณาตรวจสอบสภาพผู้ป่วย", recordFallbackFn: (i) => `บันทึก ${i + 1}`, recordCount: (n) => `${n} รายการ`, syncDone: "ซิงค์แล้ว", createDone: "เพิ่มแล้ว" },
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
    </View>
  )
}

export default function NativeFeatureScreen({
  feature,
  apiBaseUrl,
  token,
  uiLang,
  onBack
}) {
  const t = UI_TEXT[uiLang || "zh"] || UI_TEXT.zh
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [draft, setDraft] = useState({
    message: t.sosMsg,
    locationLabel: t.sosLoc,
    category: t.reminderCat,
    content: t.reminderContent,
    time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    note: ""
  })

  const canCreate = Boolean(feature?.createPath)
  const canSync = Boolean(feature?.syncPath)

  const loadHistory = useCallback(async () => {
    if (!feature?.historyPath) return
    setLoading(true)
    setError("")
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: feature.historyPath,
        token
      })
      setRecords(normalizeRecords(data, feature))
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl, feature, token])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const summary = useMemo(() => {
    if (feature?.singleRecord) return t.basicInfo
    return t.recordCount(records.length)
  }, [feature?.singleRecord, records.length, t])

  const updateDraft = (key, value) => {
    setDraft(prev => ({ ...prev, [key]: value }))
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
    setSaving(true)
    setMessage("")
    setError("")
    try {
      const body =
        feature.createType === "sos"
          ? {
              message: draft.message,
              locationLabel: draft.locationLabel
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
      await loadHistory()
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

        <View style={styles.actions}>
          <Pressable style={styles.secondaryBtn} onPress={loadHistory} disabled={loading}>
            <Text style={styles.secondaryBtnText}>{t.refresh}</Text>
          </Pressable>
          {canSync ? (
            <Pressable style={styles.secondaryBtn} onPress={handleSync} disabled={syncing}>
              <Text style={styles.secondaryBtnText}>{syncing ? t.syncing : t.sync}</Text>
            </Pressable>
          ) : null}
        </View>

        {canCreate ? (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>{feature.createType === "sos" ? t.addSOS : t.addReminder}</Text>
            {feature.createType === "sos" ? (
              <>
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
              </>
            )}
            <Pressable style={styles.primaryBtn} onPress={handleCreate} disabled={saving}>
              <Text style={styles.primaryBtnText}>{saving ? t.saving : t.save}</Text>
            </Pressable>
          </View>
        ) : null}

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
          <Text style={styles.emptyText}>{t.noData}</Text>
        )}
      </ScrollView>
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
  primaryBtn: {
    marginTop: 14,
    backgroundColor: "#1f74d1",
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
  }
})
