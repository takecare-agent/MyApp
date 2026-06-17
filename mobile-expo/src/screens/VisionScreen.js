import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native"
import { WebView } from "react-native-webview"
import { apiRequest } from "../lib/api"

const HEALTH_POLL_MS = 2000   // 每 2 秒問一次影像服務目前狀態
const HISTORY_POLL_MS = 8000  // 每 8 秒自動刷新歷史紀錄

// 由 apiBaseUrl 推導影像服務網址（把後端 port 換成影像服務的 8000）
function toServiceUrl(apiBaseUrl, path) {
  const base = String(apiBaseUrl || "").replace(/\/+$/, "")
  if (!base) return ""
  const withPort = /:\d+$/.test(base) ? base.replace(/:\d+$/, ":8000") : `${base}:8000`
  return `${withPort}${path}`
}

const UI_TEXT = {
  zh: { back: "返回", caregiverTitle: "看護視覺偵測", patientTitle: "長輩視覺偵測", refresh: "重新整理", history: "歷史紀錄", noRecords: "尚無紀錄。", live: "即時影像監控", liveHint: "畫面來自影像偵測服務（鏡頭端）。", severityFilter: "嚴重度篩選", sevAll: "全部", sevHigh: "高", sevMedium: "中", sevLow: "低", liveStatus: "目前狀態", fallProb: "跌倒機率", statusNormal: "正常監測中", statusSuspected: "偵測到疑似異常，觀察中…", statusFall: "⚠️ 偵測到跌倒！已自動通知", statusOffline: "影像服務未連線", autoNote: "系統自動即時監測，偵測到跌倒會自動記錄並通知家屬，無需手動操作。" },
  en: { back: "Back", caregiverTitle: "Caregiver Vision Detection", patientTitle: "Patient Vision Detection", refresh: "Refresh", history: "History", noRecords: "No records yet.", live: "Live Camera", liveHint: "Stream from the vision detection service.", severityFilter: "Severity Filter", sevAll: "All", sevHigh: "High", sevMedium: "Medium", sevLow: "Low", liveStatus: "Status", fallProb: "Fall probability", statusNormal: "Monitoring (normal)", statusSuspected: "Possible anomaly, observing…", statusFall: "⚠️ Fall detected! Family notified", statusOffline: "Vision service offline", autoNote: "Automatic real-time monitoring. Falls are logged and family is notified automatically." },
  id: { back: "Kembali", caregiverTitle: "Deteksi Visual Pengasuh", patientTitle: "Deteksi Visual Pasien", refresh: "Segarkan", history: "Riwayat", noRecords: "Belum ada catatan." },
  vi: { back: "Quay Lại", caregiverTitle: "Phát Hiện Hình Ảnh (Người Chăm)", patientTitle: "Phát Hiện Hình Ảnh", refresh: "Làm Mới", history: "Lịch Sử", noRecords: "Chưa có bản ghi." },
  tl: { back: "Bumalik", caregiverTitle: "Pagtuklas ng Bisyon (Tagapag-alaga)", patientTitle: "Pagtuklas ng Bisyon", refresh: "I-refresh", history: "Kasaysayan", noRecords: "Wala pang talaan." },
  th: { back: "กลับ", caregiverTitle: "การตรวจจับภาพ (ผู้ดูแล)", patientTitle: "การตรวจจับภาพ", refresh: "รีเฟรช", history: "ประวัติ", noRecords: "ยังไม่มีบันทึก" },
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
  // 以中文為後備，缺的鍵自動回填，避免半中半英
  const langKey = role === "caregiver" ? (uiLang || "zh") : "zh"
  const t = { ...UI_TEXT.zh, ...(UI_TEXT[langKey] || {}) }
  const apiPrefix = role === "caregiver" ? "/caregiver" : "/patient"
  const streamUrl = toServiceUrl(apiBaseUrl, "/stream")
  const healthUrl = toServiceUrl(apiBaseUrl, "/health")

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [severity, setSeverity] = useState("all")
  const [live, setLive] = useState({ online: false, state: "IDLE", prob: 0 })

  // 用 ref 在輪詢 callback 裡讀到最新值，避免閉包過期
  const severityRef = useRef(severity)
  severityRef.current = severity
  const confirmedLatch = useRef(false)  // 同一次跌倒只記錄一筆
  const loggingRef = useRef(false)

  const severityOptions = [
    { label: t.sevAll, value: "all" },
    { label: t.sevHigh, value: "High" },
    { label: t.sevMedium, value: "Medium" },
    { label: t.sevLow, value: "Low" }
  ]

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ limit: "30" })
      if (severityRef.current !== "all") params.set("severity", severityRef.current)
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
  }, [apiBaseUrl, apiPrefix, token])

  // 偵測到跌倒時自動寫入一筆紀錄（透過後端，會一併建立家屬警報）
  const autoLogFall = useCallback(async () => {
    if (loggingRef.current) return
    loggingRef.current = true
    try {
      await apiRequest({
        apiBaseUrl,
        path: `${apiPrefix}/vision/detect`,
        method: "POST",
        token,
        body: { frameTag: "", location: "", description: "" }
      })
      await loadHistory()
    } catch {
      // 後端暫時不可用就忽略，下一輪輪詢會再試
    } finally {
      loggingRef.current = false
    }
  }, [apiBaseUrl, apiPrefix, token, loadHistory])

  // 即時輪詢影像服務狀態（更新橫幅 + 跌倒自動記錄）
  useEffect(() => {
    if (!healthUrl) return undefined
    let alive = true
    const tick = async () => {
      try {
        const res = await fetch(healthUrl)
        const data = await res.json()
        if (!alive) return
        const st = data.state || "IDLE"
        setLive({ online: true, state: st, prob: Number(data.prob) || 0 })
        if (st === "CONFIRMED" && !confirmedLatch.current) {
          confirmedLatch.current = true
          autoLogFall()
        } else if (st === "IDLE" || st === "DISMISSED") {
          confirmedLatch.current = false
        }
      } catch {
        if (alive) setLive(prev => ({ ...prev, online: false }))
      }
    }
    tick()
    const id = setInterval(tick, HEALTH_POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [healthUrl, autoLogFall])

  // 初次載入、切換篩選、定時自動刷新歷史
  useEffect(() => {
    loadHistory()
  }, [loadHistory, severity])

  useEffect(() => {
    const id = setInterval(() => loadHistory(), HISTORY_POLL_MS)
    return () => clearInterval(id)
  }, [loadHistory])

  const banner = !live.online
    ? { text: t.statusOffline, bg: "#6b7280" }
    : live.state === "CONFIRMED"
      ? { text: t.statusFall, bg: "#e5484d" }
      : live.state === "SUSPECTED"
        ? { text: t.statusSuspected, bg: "#f59e0b" }
        : { text: t.statusNormal, bg: "#12b76a" }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerCard}>
        <Pressable onPress={onBack}>
          <Text style={styles.backText}>{t.back}</Text>
        </Pressable>
        <Text style={styles.title}>
          {role === "caregiver" ? t.caregiverTitle : t.patientTitle}
        </Text>
        <Text style={styles.sub}>{t.autoNote}</Text>
      </View>

      <View style={[styles.banner, { backgroundColor: banner.bg }]}>
        <Text style={styles.bannerLabel}>{t.liveStatus}</Text>
        <Text style={styles.bannerText}>{banner.text}</Text>
        {live.online ? (
          <Text style={styles.bannerProb}>
            {t.fallProb}: {(live.prob * 100).toFixed(0)}%
          </Text>
        ) : null}
      </View>

      {streamUrl ? (
        <View style={styles.liveCard}>
          <View style={styles.liveHeaderRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTitle}>{t.live}</Text>
          </View>
          <View style={styles.liveBox}>
            <WebView
              source={{ uri: streamUrl }}
              style={styles.webview}
              scrollEnabled={false}
              javaScriptEnabled={false}
              originWhitelist={["*"]}
              mixedContentMode="always"
              androidLayerType="hardware"
            />
          </View>
          <Text style={styles.liveHint}>{t.liveHint}</Text>
        </View>
      ) : null}

      <View style={styles.historyCard}>
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>{t.history}</Text>
          <Pressable onPress={loadHistory} hitSlop={8}>
            {loading ? (
              <ActivityIndicator color="#1f74d1" />
            ) : (
              <Text style={styles.refreshLink}>{t.refresh}</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.chipRow}>
          {severityOptions.map(item => {
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

        {error ? <Text style={styles.error}>{error}</Text> : null}

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
    color: "#4e6482",
    lineHeight: 20
  },
  banner: {
    borderRadius: 16,
    padding: 18,
    alignItems: "center"
  },
  bannerLabel: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
    fontSize: 13
  },
  bannerText: {
    marginTop: 4,
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center"
  },
  bannerProb: {
    marginTop: 6,
    color: "rgba(255,255,255,0.95)",
    fontWeight: "700"
  },
  liveCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 14
  },
  liveHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#e5484d"
  },
  liveTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#11355c"
  },
  liveBox: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000"
  },
  webview: {
    flex: 1,
    backgroundColor: "#000"
  },
  liveHint: {
    marginTop: 8,
    color: "#70839d",
    fontSize: 12
  },
  historyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 14,
    marginBottom: 24
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#173e67"
  },
  refreshLink: {
    color: "#1f74d1",
    fontWeight: "700"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8
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
  error: {
    marginVertical: 8,
    color: "#b42318"
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
