import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native"
import { io } from "socket.io-client"
import { apiRequest, mobileGetHealthCard, socketOriginFromApiBase } from "../lib/api"
import { loadActivitySeenAt, saveActivitySeenAt } from "../lib/storage"
import {
  ROLE_LABELS,
  getAlertsFeature,
  getMainTabs,
  getSettingsExtras
} from "../navigation/featureCatalog"
import HealthCardReadonly from "../components/HealthCardReadonly"
import BloodPressureScreen from "./BloodPressureScreen"
import CaregiverFirstAidScreen from "./CaregiverFirstAidScreen"
import ChatScreen from "./ChatScreen"
import NativeFeatureScreen from "./NativeFeatureScreen"
import VisionScreen from "./VisionScreen"
import CareCircleScreen from "./CareCircleScreen"
import HealthCardScreen from "./HealthCardScreen"
import ProfileScreen from "./ProfileScreen"
import CareHubScreen from "./CareHubScreen"
import CareDailyRecordsScreen from "./CareDailyRecordsScreen"
import PatientRemindersScreen from "./PatientRemindersScreen"
import PatientSosModal from "../components/PatientSosModal"
import { isSameLocalDay, isTemplateReminderSource } from "../lib/reminderPresets"
import TranslatedUgcText from "../components/TranslatedUgcText"
import { usePollingRefresh } from "../lib/usePollingRefresh"
import { useI18n } from "../i18n/I18nContext"
import { USE_MORANDI_UI, USE_NIGHT_WATCH, USE_SCREENSHOT_FILL } from "./new_ui/flag"
import { colors as morandi, night } from "./new_ui/tokens"
import NewCaregiverHome from "./new_ui/NewCaregiverHome"
import NewPatientHome from "./new_ui/NewPatientHome"
import { NightPills } from "./new_ui/NightPills"
import { GlassCircle, IconLive, IconReload } from "./new_ui/GlassCircle"
import { NeoIcon } from "./new_ui/NeoIcons"
import { AvatarMark, AvatarPickModal } from "../components/AvatarMark"
import { saveAvatarUri } from "../lib/avatarStore"
import PatientMoodDiary from "./PatientMoodDiary"
import { fillValue, screenshotBpLatest } from "./new_ui/screenshotFill"
import { toBpSparkPoints } from "./new_ui/BpSparkline"
function greetingByHour(t) {
  const h = new Date().getHours()
  if (h < 11) return t("greet.morning")
  if (h < 17) return t("greet.afternoon")
  return t("greet.evening")
}

function elderLabel(user, linked) {
  const name = user?.linkedPatientName || user?.activePatientName || user?.patientName
  if (name) return String(name)
  if (linked) return String(linked).split("@")[0]
  return ""
}

function apiPrefixForRole(role) {
  if (role === "caregiver") return "/caregiver"
  if (role === "family") return "/family"
  return "/patient"
}

function isPendingAlert(record) {
  if (!record) return false
  if (record.recordKind === "vision-event" || record.alertBuilt === false) return false
  if (record.resolveKind === "superseded") return false
  return record.status !== "Done"
}

function homeTodoStatus(role, openCount, t) {
  const n = Number(openCount) || 0
  const who = role === "family" || role === "patient" ? role : "caregiver"
  return n > 0
    ? t(`home.statusTodoOpen.${who}`, { n })
    : t(`home.statusTodoDone.${who}`)
}

function TabBar({ tabs, active, onChange, badges = {}, nightSkin = false }) {
  const { t } = useI18n()
    return (
    <View style={[styles.tabBar, styles.tabBarNeo]}>
      {tabs.map(tab => {
        const selected = tab.id === active
        const label = t(tab.labelKey || tab.label || tab.id)
        const count = Number(badges[tab.id] || 0)
        return (
          <Pressable
            key={tab.id}
            style={[
              styles.tabItem
            ]}
            onPress={() => onChange(tab.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
          >
            <View>
              <View style={selected ? styles.tabIconWrapActive : styles.tabIconWrap}>
                <NeoIcon
                  name={tab.icon || "circle"}
                  size={20}
                  color={selected ? "#10B981" : "#8E95A3"}
                />
              </View>
              {count > 0 ? <View style={styles.tabDot} /> : null}
            </View>
            <Text
              style={[
                styles.tabLabel,
                styles.tabLabelNeo,
                selected ? styles.tabLabelActiveNeo : null
              ]}
              numberOfLines={2}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function SegmentChips({ options, value, onChange }) {
  return (
    <View style={styles.segRow}>
      {options.map(opt => {
        const active = opt.id === value
        return (
          <Pressable
            key={opt.id}
            style={[styles.segChip, active ? styles.segChipActive : null]}
            onPress={() => onChange(opt.id)}
          >
            <Text style={[styles.segChipText, active ? styles.segChipTextActive : null]}>{opt.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** 看護／家屬：activePatientEmail 僅作資料預設範圍；切換在照護圈頁，不在每 Tab 強迫切圈 */
function SettingsRow({ title, value, onPress, icon, iconBg }) {
  return (
    <Pressable style={styles.settingsRow} onPress={onPress}>
      {icon ? (
        <View style={[styles.settingsIconBox, { backgroundColor: iconBg || "rgba(16,185,129,0.22)" }]}>
          <NeoIcon name={icon} size={18} color="#FFFFFF" />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.settingsRowTitle}>{title}</Text>
        {value ? <Text style={styles.settingsRowValue}>{value}</Text> : null}
      </View>
      <NeoIcon name="chevron-right" size={18} color="#8E95A3" />
    </Pressable>
  )
}

function HomePanel({
  role,
  user,
  apiBaseUrl,
  token,
  uiLang,
  onOpenTab,
  onOpenSos,
  onOpenBp,
  onOpenFirstAid,
  onWriteDaily
}) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [reminders, setReminders] = useState([])
  const [bpLatest, setBpLatest] = useState(null)
  const [bpPoints, setBpPoints] = useState([])
  const [loadError, setLoadError] = useState("")
  const [healthOpen, setHealthOpen] = useState(false)
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthError, setHealthError] = useState("")
  const [healthCard, setHealthCard] = useState(null)
  const [showAidStub, setShowAidStub] = useState(false)

  const loadHome = useCallback(async ({ silent = false } = {}) => {
    if (!apiBaseUrl || !token) return
    if (!silent) {
      setLoading(true)
      setLoadError("")
    }
    const prefix = apiPrefixForRole(role)
    try {
      const tasks = [
        apiRequest({ apiBaseUrl, path: `${prefix}/blood-pressure/history?limit=21`, token }),
        apiRequest({ apiBaseUrl, path: `${prefix}/reminders?limit=100`, token })
      ]
      if (role === "caregiver" || role === "patient") {
        tasks.push(apiRequest({
          apiBaseUrl,
          path: `${prefix}/task-templates/today`,
          token
        }).catch(() => ({ records: [] })))
      } else if (role === "family") {
        tasks.push(apiRequest({
          apiBaseUrl,
          path: "/family/task-templates/today",
          token
        }).catch(() => ({ records: [] })))
      } else {
        tasks.push(Promise.resolve({ records: [] }))
      }
      if (role === "caregiver" || role === "family") {
        tasks.push(apiRequest({
          apiBaseUrl,
          path: `${prefix}/alerts/history?limit=50`,
          token
        }))
      }
      const results = await Promise.allSettled(tasks)
      const bpData = results[0].status === "fulfilled" ? results[0].value : null
      const remData = results[1].status === "fulfilled" ? results[1].value : null
      const tplData = results[2].status === "fulfilled" ? results[2].value : null
      const alertData = results[3] && results[3].status === "fulfilled" ? results[3].value : null

      const bpRecords = Array.isArray(bpData?.records) ? bpData.records : []
      setBpLatest(fillValue(bpData?.latest || bpRecords[0] || null, screenshotBpLatest))
      setBpPoints(toBpSparkPoints(bpRecords))

      const remList = Array.isArray(remData?.records)
        ? remData.records
        : (Array.isArray(remData?.reminders) ? remData.reminders : (Array.isArray(remData) ? remData : []))
      const todayOnce = remList.filter((r) =>
        !isTemplateReminderSource(r?.source) &&
        isSameLocalDay(r?.time)
      )
      const tplRaw = Array.isArray(tplData?.records) ? tplData.records : []
      const todayTpl = tplRaw.map((t) => ({
        _id: t.slot ? `tpl-${t._id}::${t.slot}` : `tpl-${t._id}`,
        category: t.category,
        content: t.content,
        contentKey: t.contentKey,
        sourceLang: t.sourceLang,
        time: t.time,
        isCompleted: Boolean(t.isCompleted)
      }))
      const allToday = [...todayOnce, ...todayTpl].sort(
        (a, b) => Number(Boolean(a.isCompleted)) - Number(Boolean(b.isCompleted))
      )
      setReminders(allToday)

      const alertList = Array.isArray(alertData?.records) ? alertData.records : []
      setPendingCount(alertList.filter(isPendingAlert).length)
      if (!silent) setLoadError("")
    } catch (e) {
      if (!silent) setLoadError(e.message || t("common.loadFailed"))
      setReminders([])
      setBpLatest(fillValue(null, screenshotBpLatest))
      setBpPoints([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [apiBaseUrl, role, token, t])

  useEffect(() => { loadHome() }, [loadHome])
  usePollingRefresh(loadHome, { intervalMs: 5000 })

  const linked = user?.linkedPatientEmail || user?.activePatientEmail || ""
  const bpText = bpLatest
    ? `${bpLatest.systolic ?? "-"} / ${bpLatest.diastolic ?? "-"} mmHg`
    : t("home.noBp")
  const bpTextOrEmpty = bpLatest
    ? `${bpLatest.sys ?? bpLatest.systolic ?? "-"} / ${bpLatest.dia ?? bpLatest.diastolic ?? "-"} mmHg`
    : ""
  const homeTodos = reminders.map((item, index) => ({
    id: item._id || item.id || `r-${index}`,
    title: item.content || item.title || t("reminders.item"),
    contentKey: item.contentKey || "",
    sourceLang: item.sourceLang || "",
    done: Boolean(item.isCompleted)
  }))
  const statusLine = homeTodoStatus(role, homeTodos.filter((item) => !item.done).length, t)

  const openHealthCard = async () => {
    if (!linked || !apiBaseUrl || !token) {
      setHealthError(t("settings.notBoundElder"))
      setHealthOpen(true)
      return
    }
    setHealthOpen(true)
    setHealthLoading(true)
    setHealthError("")
    setShowAidStub(false)
    try {
      const data = await mobileGetHealthCard({ apiBaseUrl, token, patientEmail: linked })
      setHealthCard(data?.healthCard || data || null)
    } catch (e) {
      setHealthError(e.message || t("settings.healthLoadFail"))
      setHealthCard(null)
    } finally {
      setHealthLoading(false)
    }
  }

  const healthModal = (
      <Modal visible={healthOpen} transparent animationType="fade" onRequestClose={() => setHealthOpen(false)}>
        <View style={styles.healthBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setHealthOpen(false)} />
          <View style={styles.healthSheet}>
            <HealthCardReadonly
              card={healthCard}
              patientName={linked || t("common.elder")}
              loading={healthLoading}
              error={healthError}
              showFirstAidToggle
              showFirstAid={showAidStub}
              onToggleFirstAid={() => setShowAidStub(prev => !prev)}
              onClose={() => setHealthOpen(false)}
              onOpenFullGuide={() => {
                setHealthOpen(false)
                onOpenFirstAid?.()
              }}
            />
          </View>
        </View>
      </Modal>
  )

  if (USE_MORANDI_UI && role === "patient") {
    const helloLine = `${greetingByHour(t)} ${user?.name || t("roles.patient")}`
    const patientTodoOpen = homeTodos.filter((item) => !item.done).length
    return (
      <View style={{ flex: 1, backgroundColor: morandi.bg }}>
        {loadError ? <Text style={[styles.homeError, { paddingHorizontal: 20, paddingTop: 8 }]}>{loadError}</Text> : null}
        <NewPatientHome
          helloLine={helloLine}
          statusText={homeTodoStatus("patient", patientTodoOpen, t)}
          avatarEmail={user?.email}
          apiBaseUrl={apiBaseUrl}
          token={token}
          bpText={bpTextOrEmpty}
          sosHint={t("home.sosHint")}
          refreshing={loading}
          onRefresh={loadHome}
          onOpenSos={onOpenSos}
          onOpenTodo={() => onOpenTab("schedule")}
          onOpenBp={onOpenBp}
          onRefreshBp={loadHome}
        />
      </View>
    )
  }

  if (USE_MORANDI_UI && role !== "patient") {
    return (
      <View style={{ flex: 1, backgroundColor: morandi.bg }}>
        {loadError ? <Text style={[styles.homeError, { paddingHorizontal: 20, paddingTop: 8 }]}>{loadError}</Text> : null}
        <NewCaregiverHome
          elderName={user?.name || t(`roles.${role}`) || t("home.careElder")}
          avatarEmail={user?.email}
          apiBaseUrl={apiBaseUrl}
          token={token}
          greeting={greetingByHour(t)}
          statusText={homeTodoStatus(role, homeTodos.filter((item) => !item.done).length, t)}
          pendingCount={homeTodos.filter((item) => !item.done).length}
          todos={homeTodos}
          bpText={bpTextOrEmpty}
          bpPoints={bpPoints}
          showEmergency={role === "caregiver"}
          refreshing={loading}
          onRefresh={loadHome}
          onCall119={() => Linking.openURL("tel:119")}
          onOpenFirstAid={onOpenFirstAid}
          onOpenHealthCard={openHealthCard}
          onOpenTodo={() => onOpenTab("schedule")}
          onWriteDaily={role === "caregiver" ? onWriteDaily : undefined}
          onOpenBp={onOpenBp}
          onRefreshBp={loadHome}
          onPressStatus={() => onOpenTab("schedule")}
        />
        {healthModal}
      </View>
    )
  }

  return (
    <ScrollView
      contentContainerStyle={styles.panelPad}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadHome} tintColor="#1f74d1" />}
    >
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>TakeCare</Text>
            <Text style={styles.title}>{t(`roles.${role}`) || ROLE_LABELS[role] || ""}</Text>
            {statusLine ? <Text style={styles.statusLine}>{statusLine}</Text> : null}
          </View>
        </View>
        <Text style={styles.meta}>{user?.email || "-"}</Text>
        {linked ? <Text style={styles.meta}>{t("home.careElder")}：{linked}</Text> : null}
      </View>

      {role === "patient" ? (
        <Pressable style={styles.sosHero} onPress={onOpenSos} accessibilityRole="button" accessibilityLabel={t("home.callButton")}>
          <Text style={styles.sosHeroTitle}>{t("home.callButton")}</Text>
        </Pressable>
      ) : null}

      {role === "caregiver" ? (
        <View style={styles.careQuickCard}>
          <Text style={styles.sectionTitle}>{t("home.emergencyQuick")}</Text>
          <View style={styles.careQuickRow}>
            <Pressable style={styles.careQuick119} onPress={() => Linking.openURL("tel:119")}>
              <Text style={styles.careQuick119Text}>119</Text>
            </Pressable>
            <Pressable style={styles.careQuickBtn} onPress={onOpenFirstAid}>
              <Text style={styles.careQuickBtnText}>{t("home.emergencyGuide")}</Text>
            </Pressable>
            <Pressable style={styles.careQuickBtn} onPress={openHealthCard}>
              <Text style={styles.careQuickBtnText}>{t("home.elderInfo")}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {healthModal}

      {loading ? <ActivityIndicator color="#1f74d1" style={{ marginVertical: 16 }} /> : null}
      {loadError ? <Text style={styles.homeError}>{loadError}</Text> : null}

      {role !== "patient" && pendingCount > 0 ? (
        <Pressable style={styles.attentionCard} onPress={() => onOpenTab("watch", "activity")}>
          <Text style={styles.attentionTitle}>{t("home.pendingTitle")}</Text>
          <Text style={styles.attentionValue}>{pendingCount}</Text>
          <Text style={styles.attentionHint}>{t("home.pendingHint")}</Text>
        </Pressable>
      ) : null}

      <View style={styles.contentCard}>
        <View style={styles.contentCardHeader}>
          <Text style={styles.sectionTitle}>{t("home.todaySchedule")}</Text>
          <Pressable onPress={() => onOpenTab("schedule")}>
            <Text style={styles.linkText}>{t("common.all")}</Text>
          </Pressable>
        </View>
        {reminders.length ? (
          reminders.map((item, index) => (
            <View key={item._id || item.id || index} style={styles.reminderLine}>
              {item.content || item.title ? (
                <TranslatedUgcText
                  text={item.content || item.title}
                  sourceLang={item.sourceLang}
                  contentKey={item.contentKey}
                  apiBaseUrl={apiBaseUrl}
                  token={token}
                  compact
                  numberOfLines={1}
                  style={styles.reminderLineText}
                />
              ) : (
                <Text style={styles.reminderLineText} numberOfLines={1}>{t("reminders.item")}</Text>
              )}
            </View>
          ))
        ) : (
          <Text style={styles.emptyHint}>{t("home.noReminders")}</Text>
        )}
      </View>

      <Pressable style={styles.contentCard} onPress={onOpenBp}>
        <Text style={styles.sectionTitle}>{t("home.latestBp")}</Text>
        <Text style={styles.bpValue}>{bpText}</Text>
        <Text style={styles.attentionHint}>{t("home.tapDetails")}</Text>
      </Pressable>

      <Pressable onPress={loadHome} style={styles.refreshHome}>
        <Text style={styles.linkText}>{t("home.refresh")}</Text>
      </Pressable>
    </ScrollView>
  )
}

function LangModal({ visible, onClose, uiLang, onPick }) {
  const { t, langOptions } = useI18n()
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View style={styles.langPicker}>
          <Text style={styles.langPickerTitle}>{t("lang.pickerTitle")}</Text>
          {langOptions.map(l => (
            <Pressable
              key={l.code}
              style={[styles.langOption, uiLang === l.code && styles.langOptionActive]}
              onPress={() => onPick(l.code)}
            >
              <Text style={[styles.langOptionText, uiLang === l.code && styles.langOptionTextActive]}>
                {l.label}
              </Text>
              {uiLang === l.code ? <Text style={styles.langOptionCheck}>✓</Text> : null}
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  )
}

function WatchPanel({ role, watchSeg, setWatchSeg, ...screenProps }) {
  const { t } = useI18n()
  const seekRef = useRef(null)
  const reloadRef = useRef(null)
  const goLiveRef = useRef(null)
  const fullscreenRef = useRef(null)
  const alerts = useMemo(() => {
    const real = getAlertsFeature(role)
    if (real) return real
    if (!USE_SCREENSHOT_FILL) return null
    return {
      id: "alerts",
      historyPath: role === "family" ? "/family/alerts/history" : "/caregiver/alerts/history"
    }
  }, [role])
  // 長輩沒有「活動」帳本（IA-08），但即時下方仍要近 14 日辨識（R110）
  const liveFeedFeature = useMemo(() => {
    if (alerts) return alerts
    if (role === "patient") {
      return { id: "alerts", historyPath: "/patient/alerts/history" }
    }
    return null
  }, [alerts, role])
  const [activityCount, setActivityCount] = useState(0)
  const seenAtRef = useRef(0)
  const rowsRef = useRef([])
  const segRef = useRef(watchSeg)
  segRef.current = watchSeg === "sos" ? "activity" : watchSeg
  useEffect(() => {
    let live = true
    loadActivitySeenAt().then((at) => {
      if (!live) return
      seenAtRef.current = at
      const list = rowsRef.current
      if (segRef.current === "activity") return
      const n = list.filter((row) => {
        const atMs = new Date(row?.happenedAt || row?.triggeredAt || row?.detectedAt || row?.createdAt || 0).getTime()
        return Number.isFinite(atMs) && atMs > at
      }).length
      setActivityCount(n)
    })
    return () => { live = false }
  }, [])
  const markActivitySeen = useCallback(() => {
    const now = Date.now()
    seenAtRef.current = now
    saveActivitySeenAt(now)
    setActivityCount(0)
  }, [])
  const applyLedgerRows = useCallback((rows) => {
    const list = Array.isArray(rows) ? rows : []
    rowsRef.current = list
    if (segRef.current === "activity") {
      markActivitySeen()
      return
    }
    const seen = seenAtRef.current
    const n = list.filter((row) => {
      const t = new Date(row?.happenedAt || row?.triggeredAt || row?.detectedAt || row?.createdAt || 0).getTime()
      return Number.isFinite(t) && t > seen
    }).length
    setActivityCount(n)
  }, [markActivitySeen])
  const segments = [
    { id: "live", label: t("watch.live") },
    ...(alerts ? [{ id: "activity", label: t("watch.activity"), badge: activityCount }] : [])
  ]
  const seg = watchSeg === "sos" ? "activity" : watchSeg
  useEffect(() => {
    if (seg === "activity") markActivitySeen()
  }, [seg, markActivitySeen])
  const nightSkin = USE_NIGHT_WATCH

  const pills = nightSkin ? (
    <NightPills options={segments} value={seg} onChange={setWatchSeg} />
  ) : (
    <View style={styles.watchHeader}>
      <SegmentChips options={segments} value={seg} onChange={setWatchSeg} />
    </View>
  )

  const jumpLive = (ts) => {
    setWatchSeg("live")
    if (typeof seekRef.current === "function") seekRef.current(ts)
  }

  const camera = (
    <VisionScreen
      {...screenProps}
      embedded
      onBack={undefined}
      seekRef={seekRef}
      reloadRef={reloadRef}
      goLiveRef={goLiveRef}
      fullscreenRef={fullscreenRef}
      nightSkin={nightSkin}
    />
  )

  const liveFeed = liveFeedFeature ? (
    <NativeFeatureScreen
      feature={liveFeedFeature}
      role={role}
      apiBaseUrl={screenProps.apiBaseUrl}
      token={screenProps.token}
      uiLang={screenProps.uiLang}
      embedded
      layout="liveFeed"
      skin={nightSkin ? "night" : undefined}
      onRecordsChange={applyLedgerRows}
      onJumpToTime={(ts) => {
        if (typeof seekRef.current === "function") seekRef.current(ts)
      }}
    />
  ) : null

  const livePane = (
    <>
      {nightSkin ? null : pills}
      {camera}
      {liveFeed}
    </>
  )

  const historyPane = alerts ? (
    <NativeFeatureScreen
      feature={alerts}
      role={role}
      apiBaseUrl={screenProps.apiBaseUrl}
      token={screenProps.token}
      uiLang={screenProps.uiLang}
      embedded
      layout="history"
      skin={nightSkin ? "night" : undefined}
      onRecordsChange={applyLedgerRows}
      onJumpToTime={jumpLive}
    />
  ) : null

  return (
    <View style={[styles.flex, nightSkin ? styles.watchScreenNight : null]}>
      {nightSkin ? <StatusBar barStyle="light-content" backgroundColor={night.bg} /> : null}
      {nightSkin ? (
        <View style={styles.watchTitleRow}>
          <GlassCircle
            size={40}
            onPress={() => {
              if (typeof reloadRef.current === "function") reloadRef.current()
            }}
            accessibilityLabel={t("watch.reload") || "重新整理鏡頭"}
          >
            <IconReload color="#FFFFFF" />
          </GlassCircle>
          <Text style={styles.watchTitle}>{t("watch.title")}</Text>
          <Pressable
            onPress={() => {
              setWatchSeg("live")
              if (typeof goLiveRef.current === "function") goLiveRef.current()
            }}
            accessibilityRole="button"
            accessibilityLabel={t("watch.goLive") || "回到即時"}
          >
            <IconLive />
          </Pressable>
        </View>
      ) : null}
      {nightSkin ? (
        <>
          <View style={seg === "live" ? null : styles.watchOffstage}>{camera}</View>
          {pills}
          <View style={styles.flex}>
            {seg === "live" ? liveFeed : historyPane}
          </View>
        </>
      ) : seg === "live" ? (
        <View style={styles.flex}>{livePane}</View>
      ) : (
        <>
          {pills}
          {seg === "activity" ? <View style={styles.flex}>{historyPane}</View> : null}
        </>
      )}
    </View>
  )
}

function CarePanelPatient({ carePage, setCarePage, ...screenProps }) {
  const { t } = useI18n()
  const seg = carePage === "careDaily" || carePage === "diary" ? "diary" : "today"
  return (
    <View style={[styles.flex, USE_MORANDI_UI ? { backgroundColor: morandi.bg } : null]}>
      <SegmentChips
        options={[
          { id: "today", label: t("reminders.todayTodos") },
          { id: "diary", label: t("reminders.diary") }
        ]}
        value={seg}
        onChange={setCarePage}
      />
      {seg === "diary" ? (
        <PatientMoodDiary
          apiBaseUrl={screenProps.apiBaseUrl}
          token={screenProps.token}
        />
      ) : (
        <PatientRemindersScreen
          apiBaseUrl={screenProps.apiBaseUrl}
          token={screenProps.token}
        />
      )}
    </View>
  )
}

function SettingsPanel({
  role,
  user,
  uiLang,
  onLogout,
  onSessionUpdate,
  settingsPage,
  setSettingsPage,
  setLangModalVisible,
  ...screenProps
}) {
  const { t, langShort } = useI18n()
  const extras = getSettingsExtras(role)
  const [avatarOpen, setAvatarOpen] = useState(false)

  if (settingsPage === "health-card") {
    return (
      <View style={styles.flex}>
        <View style={styles.subNav}>
          <Pressable onPress={() => setSettingsPage(null)}>
            <Text style={styles.subNavBack}>‹ {t("settings.title")}</Text>
          </Pressable>
          <Text style={styles.subNavTitle}>{t("settings.healthCard")}</Text>
        </View>
        <HealthCardScreen
          apiBaseUrl={screenProps.apiBaseUrl}
          token={screenProps.token}
        />
      </View>
    )
  }

  if (settingsPage === "care-circle") {
    return (
      <View style={styles.flex}>
        <View style={styles.subNav}>
          <Pressable onPress={() => setSettingsPage(null)}>
            <Text style={styles.subNavBack}>‹ {t("settings.title")}</Text>
          </Pressable>
          <Text style={styles.subNavTitle}>{t("settings.careCircle")}</Text>
        </View>
        <CareCircleScreen
          apiBaseUrl={screenProps.apiBaseUrl}
          token={screenProps.token}
          role={role}
          user={user}
          onSessionUpdate={onSessionUpdate}
        />
      </View>
    )
  }

  if (settingsPage && settingsPage !== "profile") {
    const feature = extras.find(f => f.id === settingsPage)
    if (feature && !feature.special) {
      return (
        <View style={styles.flex}>
          <View style={styles.subNav}>
            <Pressable onPress={() => setSettingsPage(null)}>
              <Text style={styles.subNavBack}>‹ {t("settings.title")}</Text>
            </Pressable>
            <Text style={styles.subNavTitle} numberOfLines={1}>{t(feature.titleKey || feature.title)}</Text>
          </View>
          <NativeFeatureScreen
            feature={feature}
            role={role}
            apiBaseUrl={screenProps.apiBaseUrl}
            token={screenProps.token}
            uiLang={uiLang}
            embedded
          />
        </View>
      )
    }
  }

  if (settingsPage === "profile") {
    return (
      <View style={styles.flex}>
        <View style={styles.subNav}>
          <Pressable onPress={() => setSettingsPage(null)}>
            <Text style={styles.subNavBack}>‹ {t("settings.title")}</Text>
          </Pressable>
          <Text style={styles.subNavTitle}>{t("settings.profile")}</Text>
        </View>
        <ProfileScreen
          apiBaseUrl={screenProps.apiBaseUrl}
          token={screenProps.token}
          role={role}
          user={user}
          onSaved={(next) => {
            if (!next?.name || !onSessionUpdate) return
            onSessionUpdate({
              user: { ...user, name: next.name }
            })
          }}
        />
      </View>
    )
  }

  return (
      <ScrollView
        contentContainerStyle={styles.panelPad}
        style={USE_MORANDI_UI ? { backgroundColor: morandi.bg } : null}
      >
      <View style={styles.settingsHero}>
        <View style={styles.settingsAvatarRing}>
          <AvatarMark email={user?.email} size={72} onPress={() => setAvatarOpen(true)} apiBaseUrl={screenProps.apiBaseUrl} token={screenProps.token} />
        </View>
        <Text style={styles.settingsRole}>{t(`roles.${role}`)}</Text>
        <Text style={styles.settingsName}>{user?.name || t(`roles.${role}`)}</Text>
      </View>
      <AvatarPickModal
        visible={avatarOpen}
        email={user?.email}
        apiBaseUrl={screenProps.apiBaseUrl}
        token={screenProps.token}
        onClose={() => setAvatarOpen(false)}
      />
      <Text style={styles.settingsGroupLabel}>{t("settings.profile")}</Text>
      <View style={styles.settingsCard}>
        <SettingsRow
          title={t("settings.profile")}
          value={user?.name || t(`roles.${role}`) || t("settings.unset")}
          onPress={() => setSettingsPage("profile")}
          icon="user"
          iconBg="rgba(16,185,129,0.28)"
        />
        {role === "patient" ? (
          <SettingsRow
            title={t("settings.healthCard")}
            value={t("settings.healthCardHint")}
            onPress={() => setSettingsPage("health-card")}
            icon="heart"
            iconBg="rgba(16,185,129,0.28)"
          />
        ) : null}
        <SettingsRow
          title={t("settings.careCircle")}
          value={role === "patient" ? t("settings.careCircleHintPatient") : t("settings.careCircleHintOther")}
          onPress={() => setSettingsPage("care-circle")}
          icon="users"
          iconBg="rgba(59,130,246,0.28)"
        />
        <SettingsRow
          title={t("settings.uiLanguage")}
          value={langShort[uiLang] || "ZH"}
          onPress={() => setLangModalVisible(true)}
          icon="globe"
          iconBg="rgba(139,92,246,0.28)"
        />
      </View>

      {extras.length ? (
        <>
          <Text style={styles.settingsGroupLabel}>{t("settings.more")}</Text>
          <View style={styles.settingsCard}>
            {extras.map(item => (
              <SettingsRow
                key={item.id}
                title={item.titleKey ? t(item.titleKey) : (item.title || "")}
                value={item.descKey ? t(item.descKey) : (item.desc || "")}
                onPress={() => setSettingsPage(item.id)}
                icon={item.id === "care-log" ? "calendar" : "settings"}
                iconBg={item.id === "care-log" ? "rgba(100,116,139,0.35)" : "rgba(139,92,246,0.28)"}
              />
            ))}
          </View>
        </>
      ) : null}

      <Pressable style={styles.logoutBtn} onPress={onLogout}>
        <NeoIcon name="log-out" size={16} color="#FF5C5C" />
        <Text style={styles.logoutText}>{t("common.logout")}</Text>
      </Pressable>
    </ScrollView>
  )
}

export default function MainTabShell({
  role,
  user,
  apiBaseUrl,
  token,
  uiLang,
  onUiLangChange,
  onLogout,
  onSessionUpdate,
  openChatWithEmail,
  onOpenChatConsumed
}) {
  const tabs = useMemo(() => getMainTabs(role), [role])
  const [tab, setTab] = useState("home")
  const [watchSeg, setWatchSeg] = useState("live")
  const [carePage, setCarePage] = useState(null)
  const [settingsPage, setSettingsPage] = useState(null)
  const [chatUnread, setChatUnread] = useState(0)
  const [bpOpen, setBpOpen] = useState(false)
  const [firstAidOpen, setFirstAidOpen] = useState(false)
  const [patientSosModalVisible, setPatientSosModalVisible] = useState(false)
  const [langModalVisible, setLangModalVisible] = useState(false)
  const [chatThreadOpen, setChatThreadOpen] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    if (user?.email && user?.avatarData) {
      saveAvatarUri(user.email, user.avatarData)
    }
  }, [user?.email, user?.avatarData])

  const screenProps = { role, user, apiBaseUrl, token, uiLang }

  useEffect(() => {
    if (!apiBaseUrl || !token) return undefined
    let cancelled = false
    const load = async () => {
      try {
        const data = await apiRequest({ apiBaseUrl, path: "/chat-inbox", token })
        if (!cancelled) setChatUnread(Number(data?.unreadTotal || 0))
      } catch {
        // keep last count
      }
    }
    load()
    const id = setInterval(load, 8000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [apiBaseUrl, token])

  useEffect(() => {
    if (!openChatWithEmail) return
    setFirstAidOpen(false)
    setBpOpen(false)
    setSettingsPage(null)
    setCarePage(null)
    setTab("message")
  }, [openChatWithEmail])

  useEffect(() => {
    if (!apiBaseUrl || !token || !user?.email) return undefined
    const me = String(user.email || "").trim().toLowerCase()
    const socket = io(socketOriginFromApiBase(apiBaseUrl) || apiBaseUrl, { transports: ["polling", "websocket"], timeout: 10000, reconnection: true })
    socket.on("connect", () => {
      socket.emit("join_room", { email: me })
    })
    socket.on("new_message", (msg) => {
      const to = String(msg?.targetEmail || "").trim().toLowerCase()
      const from = String(msg?.senderEmail || "").trim().toLowerCase()
      if (to !== me || from === me) return
      apiRequest({ apiBaseUrl, path: "/chat-inbox", token })
        .then((data) => setChatUnread(Number(data?.unreadTotal || 0)))
        .catch(() => {})
    })
    return () => {
      socket.off("new_message")
      socket.disconnect()
    }
  }, [apiBaseUrl, token, user?.email])

  const handleLangChange = async (code) => {
    setLangModalVisible(false)
    if (onUiLangChange) onUiLangChange(code)
    try {
      await apiRequest({ apiBaseUrl, path: "/update-lang", method: "PATCH", token, body: { lang: code } })
    } catch { /* silent */ }
  }

  const openTab = (nextTab, watchSub) => {
    setFirstAidOpen(false)
    setBpOpen(false)
    setSettingsPage(null)
    setCarePage(null)
    setTab(nextTab)
    if (nextTab !== "message") setChatThreadOpen(false)
    if (nextTab === "watch" && watchSub) setWatchSeg(watchSub)
    if (nextTab === "watch" && !watchSub) setWatchSeg("live")
  }

  const openSos = () => {
    if (role === "patient") {
      // 首頁第一次按 SOS＝本頁字卡，不另開獨立 SOS 頁再確認
      if (!patientSosModalVisible) setPatientSosModalVisible(true)
      return
    }
    openTab("watch", "sos")
  }

  let body = null

  if (bpOpen) {
    body = (
      <View style={styles.flex}>
        <View style={styles.subNav}>
          <Pressable onPress={() => setBpOpen(false)}>
            <Text style={styles.subNavBack}>‹ {t("common.back")}</Text>
          </Pressable>
          <Text style={styles.subNavTitle}>{t("bp.title")}</Text>
        </View>
        <BloodPressureScreen {...screenProps} embedded onBack={() => setBpOpen(false)} />
      </View>
    )
  } else if (firstAidOpen) {
    body = (
      <CaregiverFirstAidScreen onBack={() => setFirstAidOpen(false)} apiBaseUrl={apiBaseUrl} token={token} />
    )
  } else if (tab === "home") {
    body = (
      <HomePanel
        role={role}
        user={user}
        apiBaseUrl={apiBaseUrl}
        token={token}
        uiLang={uiLang}
        onOpenTab={openTab}
        onOpenSos={openSos}
        onOpenBp={() => setBpOpen(true)}
        onOpenFirstAid={() => setFirstAidOpen(true)}
        onWriteDaily={() => {
          setFirstAidOpen(false)
          setBpOpen(false)
          setSettingsPage(null)
          setCarePage("diary")
          setTab("schedule")
        }}
      />
    )
  } else if (tab === "schedule") {
    if (role === "patient") {
      body = (
        <CarePanelPatient
          {...screenProps}
          carePage={carePage}
          setCarePage={setCarePage}
        />
      )
    } else {
      body = (
        <CareHubScreen
          apiBaseUrl={apiBaseUrl}
          token={token}
          role={role === "family" ? "family" : "caregiver"}
          user={user}
          initialSeg={carePage === "diary" ? "diary" : "today"}
        />
      )
    }
  } else if (tab === "watch") {
    body = (
      <WatchPanel
        {...screenProps}
        watchSeg={watchSeg}
        setWatchSeg={setWatchSeg}
      />
    )
  } else if (tab === "message") {
    body = (
      <ChatScreen
        apiBaseUrl={apiBaseUrl}
        token={token}
        myEmail={user?.email}
        role={role}
        uiLang={uiLang}
        embedded
        onUnreadChange={setChatUnread}
        pendingPartnerEmail={openChatWithEmail}
        onPendingPartnerConsumed={onOpenChatConsumed}
        onThreadChange={setChatThreadOpen}
        onOpenCareCircle={() => {
          setTab("settings")
          setSettingsPage("care-circle")
        }}
      />
    )
  } else if (tab === "settings") {
    body = (
      <SettingsPanel
        {...screenProps}
        role={role}
        user={user}
        uiLang={uiLang}
        onLogout={onLogout}
        onSessionUpdate={onSessionUpdate}
        settingsPage={settingsPage}
        setSettingsPage={setSettingsPage}
        setLangModalVisible={setLangModalVisible}
      />
    )
  }

  const hideTabBar = bpOpen || firstAidOpen || chatThreadOpen

  return (
    <View style={[styles.shell, USE_NIGHT_WATCH && tab === "watch" ? styles.shellNight : null]}>
      {USE_MORANDI_UI ? <StatusBar barStyle="light-content" backgroundColor="#0B0D0E" /> : null}
      <View style={styles.body}>{body}</View>
      {hideTabBar ? null : (
        <TabBar
          tabs={tabs}
          active={tab}
          onChange={(id) => openTab(id)}
          badges={{ message: chatUnread }}
          nightSkin={USE_NIGHT_WATCH && tab === "watch"}
        />
      )}

      {tab === "settings" ? (
        <LangModal
          visible={langModalVisible}
          onClose={() => setLangModalVisible(false)}
          uiLang={uiLang}
          onPick={handleLangChange}
        />
      ) : null}

      {role === "patient" ? (
        <PatientSosModal
          visible={patientSosModalVisible}
          apiBaseUrl={apiBaseUrl}
          token={token}
          onClose={() => setPatientSosModalVisible(false)}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: morandi.bg },
  shellNight: { backgroundColor: night.bg },
  body: { flex: 1 },
  flex: { flex: 1 },
  panelPad: { padding: 16, gap: 12, paddingBottom: 28 },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#0B0D0E",
    paddingBottom: 10,
    paddingTop: 8,
    minHeight: 60
  },
  tabBarNeo: {
    backgroundColor: "#0B0D0E"
  },
  tabItemActiveNeo: {
    backgroundColor: "transparent"
  },
  tabIconWrap: {
    width: 44,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  tabIconWrapActive: {
    width: 44,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#1F4A38",
    alignItems: "center",
    justifyContent: "center"
  },
  tabIconNeo: { color: "#8E95A3" },
  tabIconActiveNeo: { color: "#A8E6CF" },
  tabLabelNeo: { color: "#8E95A3" },
  tabLabelActiveNeo: { color: "#10B981" },
  tabBarNight: {
    backgroundColor: "#0B0D12",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
    paddingTop: 8,
    paddingBottom: 10,
    minHeight: 60
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    paddingVertical: 6,
    marginHorizontal: 2,
    borderRadius: 14,
    gap: 2
  },
  tabItemActive: { backgroundColor: USE_MORANDI_UI ? morandi.mintSoft : "#e8f2ff" },
  tabItemActiveNight: { backgroundColor: "rgba(16,185,129,0.12)" },
  tabIcon: { color: "#64748b", fontSize: 16, fontWeight: "700" },
  tabIconNight: { color: night.textMuted },
  tabIconActive: { color: USE_MORANDI_UI ? morandi.pine : "#1f74d1" },
  tabIconActiveNight: { color: night.live },
  tabDot: {
    position: "absolute",
    top: -2,
    right: -8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#dc2626"
  },
  tabLabel: { color: "#4b5563", fontSize: 11, fontWeight: "700", textAlign: "center", paddingHorizontal: 2 },
  tabLabelNight: { color: night.textMuted },
  tabLabelActive: { color: USE_MORANDI_UI ? morandi.pine : "#1f74d1" },
  tabLabelActiveNight: { color: night.live },
  headerCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8e6ff",
    borderRadius: 14,
    padding: 16
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start" },
  kicker: { color: USE_MORANDI_UI ? morandi.pine : "#1f74d1", fontWeight: "800" },
  title: { marginTop: 4, fontSize: 26, fontWeight: "900", color: "#11355c" },
  statusLine: { marginTop: 8, color: "#3d5a78", lineHeight: 20, fontWeight: "600" },
  meta: { marginTop: 8, color: "#7a90a8", fontSize: 12 },
  sectionTitle: { color: "#11355c", fontSize: 15, fontWeight: "900", marginTop: 4 },
  attentionCard: {
    backgroundColor: "#fff7f6",
    borderWidth: 1.5,
    borderColor: "#f97066",
    borderRadius: 14,
    padding: 16
  },
  attentionTitle: { color: "#b42318", fontWeight: "800", fontSize: 13 },
  attentionValue: { marginTop: 4, color: "#b42318", fontSize: 28, fontWeight: "900" },
  attentionHint: { marginTop: 6, color: "#667085", fontWeight: "600", fontSize: 12 },
  contentCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e7ec",
    borderRadius: 14,
    padding: 16,
    gap: 8
  },
  contentCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  linkText: { color: USE_MORANDI_UI ? morandi.pine : "#1f74d1", fontWeight: "800", fontSize: 13 },
  reminderLine: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eef2f6"
  },
  reminderLineText: { color: "#173e67", fontWeight: "700", fontSize: 15 },
  emptyHint: { color: "#98a2b3", fontWeight: "600" },
  bpValue: { color: "#11355c", fontSize: 22, fontWeight: "900", marginTop: 4 },
  homeError: { color: "#b42318", fontWeight: "700" },
  refreshHome: { alignItems: "center", paddingVertical: 8 },
  sosHero: {
    backgroundColor: USE_MORANDI_UI ? morandi.clay : "#b42318",
    borderRadius: USE_MORANDI_UI ? 26 : 18,
    paddingVertical: 36,
    alignItems: "center",
    minHeight: 160,
    justifyContent: "center"
  },
  sosHeroTitle: { color: "#fff", fontSize: 48, fontWeight: "900" },
  sosHeroHint: { marginTop: 8, color: "rgba(255,255,255,0.9)", fontWeight: "700" },
  careQuickCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ffd0d0",
    padding: 14,
    gap: 10
  },
  careQuickRow: { flexDirection: "row", gap: 8 },
  careQuick119: {
    flex: 1,
    backgroundColor: "#c62828",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  careQuick119Text: { color: "#fff", fontSize: 18, fontWeight: "900" },
  careQuickBtn: {
    flex: 1,
    backgroundColor: "#eef5ff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  careQuickBtnText: { color: "#1f74d1", fontSize: 14, fontWeight: "800" },
  healthBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    paddingHorizontal: 24
  },
  healthSheet: {
    backgroundColor: "#16181D",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 18,
    gap: 8
  },
  healthSheetTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", marginBottom: 4 },
  healthLine: { color: "#8E95A3", fontSize: 14, fontWeight: "700", lineHeight: 22 },
  hubTitle: { fontSize: 22, fontWeight: "900", color: "#11355c", paddingHorizontal: 16, paddingTop: 12 },
  hubBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8e6ff",
    borderRadius: 14,
    padding: 18,
    minHeight: 88,
    justifyContent: "center"
  },
  hubBtnTitle: { color: "#173e67", fontSize: 18, fontWeight: "900" },
  hubBtnDesc: { marginTop: 6, color: "#667085", fontWeight: "600" },
  watchHeader: {
    backgroundColor: USE_MORANDI_UI ? morandi.bg : "#fff",
    borderBottomWidth: 0,
    paddingBottom: 4
  },
  watchScreenNight: {
    backgroundColor: night.bg,
    experimental_backgroundImage: "radial-gradient(ellipse 120% 70% at 50% 0%, rgba(95,143,78,0.22), transparent 58%)"
  },
  watchListHidden: {
    height: 0,
    overflow: "hidden"
  },
  watchOffstage: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -480,
    opacity: 0
  },
  watchLiveScroll: {
    paddingBottom: 28,
    flexGrow: 1
  },
  watchHeaderNight: {
    backgroundColor: night.bg,
    paddingTop: 8,
    paddingBottom: 2
  },
  watchTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    minHeight: 44
  },
  watchTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600"
  },
  segRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 0,
    marginHorizontal: 12,
    marginVertical: 8,
    padding: 4,
    borderRadius: 999,
    backgroundColor: "#16181D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  segChip: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "transparent",
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center"
  },
  segChipActive: { backgroundColor: "#859F78" },
  segChipText: { color: "#8E95A3", fontWeight: "700", fontSize: 13 },
  segChipTextActive: { color: "#0D0F11" },
  subNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#0B0D0E",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)"
  },
  subNavBack: { color: "#10B981", fontWeight: "800", fontSize: 15 },
  subNavTitle: { color: "#FFFFFF", fontWeight: "900", fontSize: 16 },
  settingsHero: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 16,
    gap: 6
  },
  settingsAvatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 16px rgba(16,185,129,0.45)"
  },
  settingsAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#0B0D0E",
    alignItems: "center",
    justifyContent: "center"
  },
  settingsIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12
  },
  settingsAvatarInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: morandi.pine
  },
  settingsRole: { fontSize: 13, color: morandi.textMuted, fontWeight: "600" },
  settingsName: { fontSize: 26, fontWeight: "800", color: morandi.text },
  settingsEdit: {
    position: "absolute",
    right: 8,
    top: 8,
    padding: 8
  },
  settingsEditText: { color: morandi.pine, fontWeight: "700", fontSize: 13 },
  watchLiveChips: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 8,
    paddingHorizontal: 8
  },
  watchLiveChipsBelow: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4
  },
  settingsCard: {
    backgroundColor: "#16181D",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden"
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)"
  },
  settingsRowTitle: { color: USE_MORANDI_UI ? morandi.text : "#173e67", fontSize: 16, fontWeight: "800" },
  settingsRowValue: { marginTop: 2, color: USE_MORANDI_UI ? morandi.textMuted : "#667085", fontSize: 13 },
  settingsChevron: { color: "#8E95A3", fontSize: 22, fontWeight: "600" },
  settingsHint: { color: "#8E95A3", marginTop: -4, marginBottom: 4 },
  settingsGroupLabel: {
    color: "#8E95A3",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 2
  },
  logoutBtn: {
    marginTop: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#FF5C5C",
    backgroundColor: "transparent",
    paddingVertical: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8
  },
  logoutText: { color: "#FF5C5C", fontWeight: "900", fontSize: 16 },
  langBtn: {
    backgroundColor: "rgba(133, 159, 120, 0.22)",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  langBtnText: { color: "#A8E6CF", fontWeight: "900", fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 80,
    paddingRight: 16
  },
  langPicker: {
    backgroundColor: "#16181D",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    minWidth: 160,
    overflow: "hidden"
  },
  langPickerTitle: {
    color: "#8E95A3",
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6
  },
  langOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)"
  },
  langOptionActive: { backgroundColor: "rgba(133, 159, 120, 0.22)" },
  langOptionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  langOptionTextActive: { color: "#A8E6CF", fontWeight: "900" },
  langOptionCheck: { color: "#A8E6CF", fontWeight: "900", fontSize: 14 }
})
