import { useCallback, useEffect, useMemo, useState } from "react"
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

function getRecordTitle(record, index) {
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
    `紀錄 ${index + 1}`
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
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 30000
      }
    )
  })
}

function NativeRecordCard({ record, index }) {
  const entries = Object.entries(record || {})
    .filter(([key]) => !["_id", "__v", "userId", "patientUserId", "reporterUserId", "createdAt", "updatedAt"].includes(key))
    .slice(0, 8)
  const time = getRecordTime(record)

  return (
    <View style={styles.recordCard}>
      <Text style={styles.recordTitle}>{getRecordTitle(record, index)}</Text>
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
            <Text style={styles.recordActionText}>查看位置</Text>
          </Pressable>
          <Pressable style={styles.recordActionBtn} onPress={() => openPhone(record.patientPhone || "119")}>
            <Text style={styles.recordActionText}>撥打電話</Text>
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
  onBack
}) {
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
  const [draft, setDraft] = useState({
    message: "我需要緊急協助",
    locationLabel: "目前位置",
    patientPhone: "",
    category: "用藥提醒",
    content: "請記得按時服藥。",
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
        return
      }
      setPhoneDraft("")
      setPhoneModalVisible(true)
    })

    return () => {
      mounted = false
    }
  }, [featureScope, isSosFeature])

  useEffect(() => {
    let mounted = true
    if (!isFamilySosReceiver) return undefined

    loadLastSeenSosEvent(featureScope).then(eventId => {
      if (mounted) setLastSeenSosId(eventId)
    })

    return () => {
      mounted = false
    }
  }, [featureScope, isFamilySosReceiver])

  useEffect(() => {
    if (!isFamilySosReceiver) return undefined
    const timer = setInterval(() => {
      loadHistory(true)
    }, 5000)
    return () => {
      clearInterval(timer)
      stopEmergencyVibration()
    }
  }, [isFamilySosReceiver, loadHistory])

  useEffect(() => {
    if (!isFamilySosReceiver || !records.length) return
    const latestActive = records.find(record => record.status === "active") || null
    const eventId = getRecordId(latestActive)
    if (!latestActive || !eventId || eventId === lastSeenSosId) return

    setEmergencyEvent(latestActive)
    setLastSeenSosId(eventId)
    saveLastSeenSosEvent(featureScope, eventId)
    startEmergencyVibration()
  }, [featureScope, isFamilySosReceiver, lastSeenSosId, records])

  const summary = useMemo(() => {
    if (feature?.singleRecord) return "個人資料"
    return `${records.length} 筆紀錄`
  }, [feature?.singleRecord, records.length])

  const updateDraft = (key, value) => {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  const handleSavePhone = async () => {
    const normalizedPhone = phoneDraft.trim()
    if (!normalizedPhone) {
      setError("請先輸入手機號碼")
      return false
    }
    await saveSosPhone(featureScope, normalizedPhone)
    updateDraft("patientPhone", normalizedPhone)
    setPhoneModalVisible(false)
    setMessage("已儲存 SOS 聯絡手機")
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
      setMessage(data.message || "同步完成")
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
      setError("請先輸入並儲存手機號碼後再送出 SOS。")
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
      setMessage(data.message || "已送出")
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
          <Text style={styles.backText}>返回</Text>
        </Pressable>
        <Text style={styles.title}>{feature?.title || "功能"}</Text>
        <Text style={styles.subtitle}>{feature?.desc || summary}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {loading ? <ActivityIndicator color="#1f74d1" /> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {canSync ? (
          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={handleSync} disabled={syncing}>
              <Text style={styles.secondaryBtnText}>{syncing ? "同步中..." : "同步資料"}</Text>
            </Pressable>
          </View>
        ) : null}

        {canCreate ? (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>{isSosFeature ? "緊急求救" : "新增紀錄"}</Text>
            {isSosFeature ? (
              <>
                <Pressable style={styles.sosButton} onPress={handleCreate} disabled={saving}>
                  <Text style={styles.sosButtonText}>{saving ? "求救送出中..." : "SOS"}</Text>
                </Pressable>
                <Text style={styles.sosHint}>
                  按下後會送出 SOS 紀錄、嘗試附上定位，並自動撥打 119。家屬端登入後會收到即時警報彈窗與震動。
                </Text>
                <Text style={styles.label}>求救訊息</Text>
                <TextInput
                  style={styles.input}
                  value={draft.message}
                  onChangeText={value => updateDraft("message", value)}
                />
                <Text style={styles.label}>位置</Text>
                <TextInput
                  style={styles.input}
                  value={draft.locationLabel}
                  onChangeText={value => updateDraft("locationLabel", value)}
                />
                <Text style={styles.label}>手機號碼</Text>
                <TextInput
                  style={styles.input}
                  value={draft.patientPhone}
                  onChangeText={value => {
                    updateDraft("patientPhone", value)
                    setPhoneDraft(value)
                  }}
                  keyboardType="phone-pad"
                  placeholder="例如 0912345678"
                />
                <Pressable style={styles.secondaryBtnCompact} onPress={handleSavePhone}>
                  <Text style={styles.secondaryBtnText}>儲存手機號碼</Text>
                </Pressable>
                {showsFirstAidSteps ? (
                  <View style={styles.firstAidBox}>
                    <Text style={styles.firstAidTitle}>急救步驟</Text>
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
                <Text style={styles.label}>類別</Text>
                <TextInput
                  style={styles.input}
                  value={draft.category}
                  onChangeText={value => updateDraft("category", value)}
                />
                <Text style={styles.label}>內容</Text>
                <TextInput
                  style={styles.input}
                  value={draft.content}
                  onChangeText={value => updateDraft("content", value)}
                />
                <Text style={styles.label}>時間 ISO</Text>
                <TextInput
                  style={styles.input}
                  value={draft.time}
                  onChangeText={value => updateDraft("time", value)}
                />
                <Text style={styles.label}>備註</Text>
                <TextInput
                  style={styles.input}
                  value={draft.note}
                  onChangeText={value => updateDraft("note", value)}
                />
                <Pressable style={styles.primaryBtn} onPress={handleCreate} disabled={saving}>
                  <Text style={styles.primaryBtnText}>{saving ? "送出中..." : "送出"}</Text>
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
                />
              ))
            ) : (
              <Text style={styles.emptyText}>目前沒有紀錄</Text>
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
            <Text style={styles.modalTitle}>輸入 SOS 手機號碼</Text>
            <Text style={styles.modalText}>
              第一次使用 SOS 前需要留下手機號碼，之後會自動帶入並同步到求救紀錄。
            </Text>
            <TextInput
              style={styles.input}
              value={phoneDraft}
              onChangeText={setPhoneDraft}
              keyboardType="phone-pad"
              placeholder="例如 0912345678"
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryBtn} onPress={() => setPhoneModalVisible(false)}>
                <Text style={styles.secondaryBtnText}>稍後</Text>
              </Pressable>
              <Pressable style={styles.primaryBtnInline} onPress={handleSavePhone}>
                <Text style={styles.primaryBtnText}>儲存</Text>
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
            <Text style={styles.emergencyTitle}>緊急 SOS</Text>
            <Text style={styles.emergencyText}>收到新的求救事件，手機已啟動連續震動提醒。</Text>
            <View style={styles.emergencyInfo}>
              <Text style={styles.emergencyLine}>事件：{emergencyEvent?.eventId || "-"}</Text>
              <Text style={styles.emergencyLine}>姓名：{emergencyEvent?.patientName || "-"}</Text>
              <Text style={styles.emergencyLine}>時間：{formatValue(emergencyEvent?.triggeredAt)}</Text>
              <Text style={styles.emergencyLine}>位置：{emergencyEvent?.locationLabel || "-"}</Text>
              <Text style={styles.emergencyLine}>電話：{emergencyEvent?.patientPhone || "-"}</Text>
              <Text style={styles.emergencyLine}>訊息：{emergencyEvent?.message || "-"}</Text>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryBtn} onPress={() => openRecordMap(emergencyEvent)}>
                <Text style={styles.secondaryBtnText}>查看位置</Text>
              </Pressable>
              <Pressable style={styles.primaryBtnInline} onPress={() => openPhone(emergencyEvent?.patientPhone || "119")}>
                <Text style={styles.primaryBtnText}>撥打電話</Text>
              </Pressable>
            </View>
            <Pressable style={styles.dismissEmergencyBtn} onPress={closeEmergency}>
              <Text style={styles.dismissEmergencyText}>我知道了</Text>
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
