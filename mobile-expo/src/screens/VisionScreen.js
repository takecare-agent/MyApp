import { useCallback, useEffect, useState } from "react"
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

const SEVERITY_OPTIONS = [
  { label: "All", value: "all" },
  { label: "High", value: "High" },
  { label: "Medium", value: "Medium" },
  { label: "Low", value: "Low" }
]

const UI_TEXT = {
  zh: { back: "返回", caregiverTitle: "看護視覺偵測", patientTitle: "長輩視覺偵測", detect: "偵測", sync: "同步", refresh: "重新整理", history: "歷史紀錄", noRecords: "尚無紀錄。", sub: "偵測事件、同步並查看歷史資料。", syncDone: "同步完成" },
  en: { back: "Back", caregiverTitle: "Caregiver Vision Detection", patientTitle: "Patient Vision Detection", detect: "Detect", sync: "Sync", refresh: "Refresh", history: "History", noRecords: "No records yet.", sub: "Detect events, sync and view history.", syncDone: "Sync complete" },
  id: { back: "Kembali", caregiverTitle: "Deteksi Visual Pengasuh", patientTitle: "Deteksi Visual Pasien", detect: "Deteksi", sync: "Sinkronkan", refresh: "Segarkan", history: "Riwayat", noRecords: "Belum ada catatan.", sub: "Deteksi acara, sinkronkan dan lihat riwayat.", syncDone: "Sinkronisasi selesai" },
  vi: { back: "Quay Lại", caregiverTitle: "Phát Hiện Hình Ảnh (Người Chăm)", patientTitle: "Phát Hiện Hình Ảnh", detect: "Phát Hiện", sync: "Đồng Bộ", refresh: "Làm Mới", history: "Lịch Sử", noRecords: "Chưa có bản ghi.", sub: "Phát hiện sự kiện, đồng bộ và xem lịch sử.", syncDone: "Đồng bộ hoàn tất" },
  tl: { back: "Bumalik", caregiverTitle: "Pagtuklas ng Bisyon (Tagapag-alaga)", patientTitle: "Pagtuklas ng Bisyon", detect: "Tuklasin", sync: "I-sync", refresh: "I-refresh", history: "Kasaysayan", noRecords: "Wala pang talaan.", sub: "Tuklasin ang mga kaganapan, i-sync at tingnan ang kasaysayan.", syncDone: "Natapos ang pag-sync" },
  th: { back: "กลับ", caregiverTitle: "การตรวจจับภาพ (ผู้ดูแล)", patientTitle: "การตรวจจับภาพ", detect: "ตรวจจับ", sync: "ซิงค์", refresh: "รีเฟรช", history: "ประวัติ", noRecords: "ยังไม่มีบันทึก", sub: "ตรวจจับเหตุการณ์ ซิงค์และดูประวัติ", syncDone: "ซิงค์สำเร็จ" },
}

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString()
}

function formatConfidence(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return "-"
  return `${(n * 100).toFixed(1)}%`
}

function severityColor(value) {
  const text = String(value || "").toLowerCase()
  if (text.includes("high") || text.includes("critical") || text.includes("danger")) {
    return "#b42318"
  }
  if (text.includes("medium") || text.includes("warning")) {
    return "#b54708"
  }
  return "#067647"
}

export default function VisionScreen({ role, apiBaseUrl, token, uiLang, onBack }) {
  const t = UI_TEXT[uiLang || "zh"] || UI_TEXT.zh
  const apiPrefix = role === "caregiver" ? "/caregiver" : "/patient"
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [severity, setSeverity] = useState("all")
  const [form, setForm] = useState({
    frameTag: "",
    location: "",
    description: ""
  })

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ limit: "30" })
      if (severity !== "all") params.set("severity", severity)

      const data = await apiRequest({
        apiBaseUrl,
        path: `${apiPrefix}/vision/history?${params.toString()}`,
        token
      })

      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl, apiPrefix, severity, token])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleDetect = async () => {
    setDetecting(true)
    setMessage("")
    setError("")
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: `${apiPrefix}/vision/detect`,
        method: "POST",
        token,
        body: form
      })
      setMessage(data.message || "Detect success")
      await loadHistory()
    } catch (detectError) {
      setError(detectError.message)
    } finally {
      setDetecting(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setMessage("")
    setError("")
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: `${apiPrefix}/vision/sync`,
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerCard}>
        <Pressable onPress={onBack}>
          <Text style={styles.backText}>{t.back}</Text>
        </Pressable>
        <Text style={styles.title}>
          {role === "caregiver" ? t.caregiverTitle : t.patientTitle}
        </Text>
        <Text style={styles.sub}>{t.sub}</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Frame Tag (optional)</Text>
        <TextInput
          style={styles.input}
          value={form.frameTag}
          onChangeText={value => setForm(prev => ({ ...prev, frameTag: value }))}
          placeholder="camera-a-frame-001"
        />

        <Text style={styles.label}>Location (optional)</Text>
        <TextInput
          style={styles.input}
          value={form.location}
          onChangeText={value => setForm(prev => ({ ...prev, location: value }))}
          placeholder="Living room"
        />

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.multiInput]}
          value={form.description}
          onChangeText={value => setForm(prev => ({ ...prev, description: value }))}
          placeholder="Any additional notes..."
          multiline
        />

        <View style={styles.buttonRow}>
          <Pressable style={styles.buttonPrimary} onPress={handleDetect} disabled={detecting}>
            {detecting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonPrimaryText}>{t.detect}</Text>
            )}
          </Pressable>
          <Pressable style={styles.buttonSecondary} onPress={handleSync} disabled={syncing}>
            {syncing ? (
              <ActivityIndicator color="#1f74d1" />
            ) : (
              <Text style={styles.buttonSecondaryText}>{t.sync}</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.buttonSecondary}
            onPress={loadHistory}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#1f74d1" />
            ) : (
              <Text style={styles.buttonSecondaryText}>{t.refresh}</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.label}>Severity Filter</Text>
        <View style={styles.chipRow}>
          {SEVERITY_OPTIONS.map(item => {
            const active = item.value === severity
            return (
              <Pressable
                key={item.value}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSeverity(item.value)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.historyCard}>
        <Text style={styles.historyTitle}>{t.history}</Text>
        {records.length === 0 ? (
          <Text style={styles.empty}>{t.noRecords}</Text>
        ) : (
          records.map(item => (
            <View key={item._id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowMain}>{item.action || "-"}</Text>
                <Text style={styles.rowSub}>{formatDateTime(item.detectedAt)}</Text>
                <Text style={styles.rowSub}>{item.location || "-"}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.level, { color: severityColor(item.severity) }]}>
                  {item.severity || "-"}
                </Text>
                <Text style={styles.rowSub}>{formatConfidence(item.confidence)}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f2f7ff",
    padding: 16,
    gap: 12
  },
  headerCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 14
  },
  backText: {
    color: "#1f74d1",
    fontWeight: "700"
  },
  title: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: "700",
    color: "#11355c"
  },
  sub: {
    marginTop: 4,
    color: "#4e6482"
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 14
  },
  label: {
    marginTop: 8,
    marginBottom: 6,
    color: "#244569",
    fontWeight: "600"
  },
  input: {
    borderWidth: 1,
    borderColor: "#c8d8ee",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fbfdff"
  },
  multiInput: {
    minHeight: 70,
    textAlignVertical: "top"
  },
  buttonRow: {
    marginTop: 12,
    gap: 8
  },
  buttonPrimary: {
    backgroundColor: "#1f74d1",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  buttonPrimaryText: {
    color: "#fff",
    fontWeight: "700"
  },
  buttonSecondary: {
    backgroundColor: "#fff",
    borderColor: "#c7d8ed",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  buttonSecondaryText: {
    color: "#1f74d1",
    fontWeight: "700"
  },
  chipRow: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderWidth: 1,
    borderColor: "#c6d8ee",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff"
  },
  chipActive: {
    borderColor: "#1f74d1",
    backgroundColor: "#1f74d1"
  },
  chipText: {
    color: "#244569"
  },
  chipTextActive: {
    color: "#fff",
    fontWeight: "700"
  },
  message: {
    marginTop: 10,
    color: "#067647"
  },
  error: {
    marginTop: 10,
    color: "#b42318"
  },
  historyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 14,
    marginBottom: 24
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#173e67",
    marginBottom: 6
  },
  empty: {
    color: "#6a7e99"
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#edf3fd"
  },
  rowMain: {
    fontWeight: "700",
    color: "#173e67"
  },
  rowSub: {
    marginTop: 2,
    color: "#70839d",
    fontSize: 12
  },
  level: {
    marginTop: 2,
    fontWeight: "700"
  }
})
