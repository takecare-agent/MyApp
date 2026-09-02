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
import { apiRequest, mobileGetHealthCard } from "../lib/api"
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
import { USE_MORANDI_UI, USE_NIGHT_WATCH } from "./new_ui/flag"
import { colors as morandi, night } from "./new_ui/tokens"
import NewCaregiverHome from "./new_ui/NewCaregiverHome"
import NewPatientHome from "./new_ui/NewPatientHome"
import { NightPills } from "./new_ui/NightPills"
import { GlassCircle, IconExpand, IconReload } from "./new_ui/GlassCircle"

function greetingByHour() {
  const h = new Date().getHours()
  if (h < 11) return "早安，祝您愉快！"
  if (h < 17) return "午安，祝您愉快！"
  return "晚安，祝您愉快！"
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

function reminderTitle(record, fallback) {
  return record?.title || record?.content || record?.text || fallback
}

function TabBar({ tabs, active, onChange, badges = {}, nightSkin = false }) {
  const { t } = useI18n()
  return (
    <View style={[styles.tabBar, nightSkin ? styles.tabBarNight : null]}>
      {tabs.map(tab => {
        const selected = tab.id === active
        const label = t(tab.labelKey || tab.label || tab.id)
        const count = Number(badges[tab.id] || 0)
        return (
          <Pressable
            key={tab.id}
            style={[
              styles.tabItem,
              selected ? (nightSkin ? styles.tabItemActiveNight : styles.tabItemActive) : null
            ]}
            onPress={() => onChange(tab.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
          >
            <View>
              <Text
                style={[
                  styles.tabIcon,
                  nightSkin ? styles.tabIconNight : null,
                  selected ? (nightSkin ? styles.tabIconActiveNight : styles.tabIconActive) : null
                ]}
              >
                {tab.icon || "·"}
              </Text>
              {count > 0 ? <View style={styles.tabDot} /> : null}
            </View>
            <Text
              style={[
                styles.tabLabel,
                nightSkin ? styles.tabLabelNight : null,
                selected ? (nightSkin ? styles.tabLabelActiveNight : styles.tabLabelActive) : null
              ]}
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
function SettingsRow({ title, value, onPress }) {
  return (
    <Pressable style={styles.settingsRow} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingsRowTitle}>{title}</Text>
        {value ? <Text style={styles.settingsRowValue}>{value}</Text> : null}
      </View>
      <Text style={styles.settingsChevron}>›</Text>
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
        apiRequest({ apiBaseUrl, path: `${prefix}/blood-pressure/history?limit=1`, token }),
        apiRequest({ apiBaseUrl, path: `${prefix}/reminders`, token })
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
      setBpLatest(bpData?.latest || bpRecords[0] || null)

      const remList = Array.isArray(remData?.records)
        ? remData.records
        : (Array.isArray(remData?.reminders) ? remData.reminders : (Array.isArray(remData) ? remData : []))
      const openOnce = remList.filter((r) =>
        !r?.isCompleted &&
        !isTemplateReminderSource(r?.source) &&
        isSameLocalDay(r?.time)
      )
      const tplRaw = Array.isArray(tplData?.records) ? tplData.records : []
      const openTpl = tplRaw
        .filter((t) => !t?.isCompleted)
        .map((t) => ({
          _id: `tpl-${t._id}`,
          category: t.category,
          content: t.content,
          contentKey: t.contentKey,
          sourceLang: t.sourceLang,
          time: t.time,
          isCompleted: false
        }))
      setReminders([...openOnce, ...openTpl].slice(0, 5))

      const alertList = Array.isArray(alertData?.records) ? alertData.records : []
      setPendingCount(alertList.filter(isPendingAlert).length)
      if (!silent) setLoadError("")
    } catch (e) {
      if (!silent) setLoadError(e.message || t("common.loadFailed"))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [apiBaseUrl, role, token, t])

  useEffect(() => { loadHome() }, [loadHome])
  usePollingRefresh(loadHome, { intervalMs: 5000 })

  const statusLine = role === "patient"
    ? ""
    : (pendingCount > 0 ? "" : t("home.noPending"))

  const linked = user?.linkedPatientEmail || user?.activePatientEmail || ""
  const bpText = bpLatest
    ? `${bpLatest.systolic ?? "-"} / ${bpLatest.diastolic ?? "-"} mmHg`
    : t("home.noBp")
  const bpTextOrEmpty = bpLatest
    ? `${bpLatest.systolic ?? "-"} / ${bpLatest.diastolic ?? "-"} mmHg`
    : ""
  const homeTodos = reminders.map((item, index) => ({
    id: item._id || item.id || `r-${index}`,
    title: reminderTitle(item, t("reminders.item")),
    done: false
  }))

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
    const hourWord = greetingByHour().split("，")[0]
    const helloLine = `${hourWord}，${user?.name || t("roles.patient")}`
    return (
      <View style={{ flex: 1, backgroundColor: morandi.bg }}>
        {loadError ? <Text style={[styles.homeError, { paddingHorizontal: 20, paddingTop: 8 }]}>{loadError}</Text> : null}
        <NewPatientHome
          helloLine={helloLine}
          todos={homeTodos}
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
          elderName={elderLabel(user, linked) || t("home.careElder")}
          greeting={greetingByHour()}
          pendingCount={pendingCount}
          todos={homeTodos}
          bpText={bpTextOrEmpty}
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
          onPressStatus={pendingCount > 0 ? () => onOpenTab("watch", "activity") : undefined}
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
              {reminderTitle(item, "") ? (
                <TranslatedUgcText
                  text={reminderTitle(item, "")}
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
  const alerts = useMemo(() => getAlertsFeature(role), [role])
  const [activityCount, setActivityCount] = useState(0)
  const segments = [
    { id: "live", label: t("watch.live") },
    ...(alerts ? [{ id: "activity", label: t("watch.activity"), badge: activityCount }] : [])
  ]
  const seg = watchSeg === "sos" ? "activity" : watchSeg
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

  const livePane = (
    <>
      {nightSkin ? null : pills}
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
      {alerts ? (
        <NativeFeatureScreen
          feature={alerts}
          role={role}
          apiBaseUrl={screenProps.apiBaseUrl}
          token={screenProps.token}
          uiLang={screenProps.uiLang}
          embedded
          layout="liveFeed"
          skin={nightSkin ? "night" : undefined}
          onCountChange={setActivityCount}
          onJumpToTime={(ts) => {
            if (typeof seekRef.current === "function") seekRef.current(ts)
          }}
        />
      ) : null}
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
      onJumpToTime={jumpLive}
    />
  ) : null

  return (
    <View style={[styles.flex, nightSkin ? styles.watchScreenNight : null]}>
      {nightSkin ? <StatusBar barStyle="light-content" backgroundColor={night.bg} /> : null}
      {nightSkin ? (
        <View style={styles.watchTitleRow}>
          <GlassCircle
            onPress={() => {
              if (typeof reloadRef.current === "function") reloadRef.current()
            }}
            accessibilityLabel={t("watch.reload") || "重新整理鏡頭"}
          >
            <IconReload color="#FFFFFF" />
          </GlassCircle>
          <Text style={styles.watchTitle}>{t("watch.title")}</Text>
          <GlassCircle
            onPress={() => {
              if (typeof fullscreenRef.current === "function") fullscreenRef.current()
            }}
            accessibilityLabel={t("watch.fullscreen") || "打橫觀看"}
          >
            <IconExpand color="#FFFFFF" />
          </GlassCircle>
        </View>
      ) : null}
      {nightSkin ? pills : null}
      {nightSkin ? (
        <>
          <View
            pointerEvents={seg === "live" ? "auto" : "none"}
            style={seg === "live" ? styles.flex : styles.watchOffstage}
          >
            {livePane}
          </View>
          {seg === "activity" ? <View style={styles.flex}>{historyPane}</View> : null}
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
  const seg =
    carePage === "careDaily" ? "diary"
      : carePage === "reminders" || !carePage ? "today"
        : carePage
  return (
    <View style={[styles.flex, USE_MORANDI_UI ? { backgroundColor: morandi.bg } : null]}>
      <SegmentChips
        options={[
          { id: "today", label: t("reminders.todayTodos") },
          { id: "diary", label: t("reminders.diary") },
          { id: "bp", label: t("bp.title") }
        ]}
        value={seg}
        onChange={setCarePage}
      />
      {seg === "bp" ? (
        <BloodPressureScreen {...screenProps} embedded onBack={() => setCarePage("today")} />
      ) : seg === "diary" ? (
        <CareDailyRecordsScreen
          apiBaseUrl={screenProps.apiBaseUrl}
          token={screenProps.token}
          role="patient"
          showSearch
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
        <View style={styles.settingsAvatar}>
          <View style={styles.settingsAvatarInner} />
        </View>
        <Text style={styles.settingsRole}>{t(`roles.${role}`)}</Text>
        <Text style={styles.settingsName}>{user?.name || t(`roles.${role}`)}</Text>
        <Pressable style={styles.settingsEdit} onPress={() => setSettingsPage("profile")} hitSlop={8}>
          <Text style={styles.settingsEditText}>{t("settings.profile")}</Text>
        </Pressable>
      </View>
      <Text style={styles.settingsGroupLabel}>{t("settings.profile")}</Text>
      <View style={styles.settingsCard}>
        <SettingsRow
          title={t("settings.profile")}
          value={user?.name || t(`roles.${role}`) || t("settings.unset")}
          onPress={() => setSettingsPage("profile")}
        />
        {role === "patient" ? (
          <SettingsRow
            title={t("settings.healthCard")}
            value={t("settings.healthCardHint")}
            onPress={() => setSettingsPage("health-card")}
          />
        ) : null}
        <SettingsRow
          title={t("settings.careCircle")}
          value={role === "patient" ? t("settings.careCircleHintPatient") : t("settings.careCircleHintOther")}
          onPress={() => setSettingsPage("care-circle")}
        />
        <SettingsRow
          title={t("settings.uiLanguage")}
          value={langShort[uiLang] || "ZH"}
          onPress={() => setLangModalVisible(true)}
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
              />
            ))}
          </View>
        </>
      ) : null}

      <Pressable style={styles.logoutBtn} onPress={onLogout}>
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
  const { t } = useI18n()

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
    const socket = io(apiBaseUrl, { transports: ["websocket", "polling"], timeout: 10000, reconnection: true })
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
    if (nextTab === "watch" && watchSub) setWatchSeg(watchSub)
    if (nextTab === "watch" && !watchSub) setWatchSeg("live")
  }

  const openSos = () => {
    if (role === "patient") {
      // R87：首頁第一次按 SOS＝本頁字卡，不 push 獨立 SOS 頁再二次確認
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

  const hideTabBar = bpOpen || firstAidOpen

  return (
    <View style={[styles.shell, USE_NIGHT_WATCH && tab === "watch" ? styles.shellNight : null]}>
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
  shell: { flex: 1, backgroundColor: USE_MORANDI_UI ? morandi.bg : "#eef4fb" },
  shellNight: { backgroundColor: night.bg },
  body: { flex: 1 },
  flex: { flex: 1 },
  panelPad: { padding: 16, gap: 12, paddingBottom: 28 },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: USE_MORANDI_UI ? morandi.border : "#d8e6ff",
    backgroundColor: "#fff",
    paddingBottom: 8,
    paddingTop: 6,
    minHeight: 58
  },
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
  tabLabel: { color: "#4b5563", fontSize: 11, fontWeight: "700" },
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
    backgroundColor: "#fff",
    borderRadius: USE_MORANDI_UI ? 26 : 16,
    padding: 18,
    gap: 8
  },
  healthSheetTitle: { color: "#11355c", fontSize: 18, fontWeight: "900", marginBottom: 4 },
  healthLine: { color: "#334155", fontSize: 14, fontWeight: "700", lineHeight: 22 },
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
    backgroundColor: night.bg
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
    backgroundColor: USE_MORANDI_UI ? "#fff" : undefined
  },
  segChip: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: USE_MORANDI_UI ? "transparent" : "#eef2f6",
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center"
  },
  segChipActive: { backgroundColor: USE_MORANDI_UI ? morandi.mintSoft : "#1f74d1" },
  segChipText: { color: USE_MORANDI_UI ? morandi.textMuted : "#111827", fontWeight: "700", fontSize: 13 },
  segChipTextActive: { color: USE_MORANDI_UI ? morandi.pine : "#fff" },
  subNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: USE_MORANDI_UI ? morandi.bg : "#fff",
    borderBottomWidth: USE_MORANDI_UI ? 0 : 1,
    borderBottomColor: "#eef2f6"
  },
  subNavBack: { color: USE_MORANDI_UI ? morandi.pine : "#1f74d1", fontWeight: "800", fontSize: 15 },
  subNavTitle: { color: USE_MORANDI_UI ? morandi.text : "#11355c", fontWeight: "900", fontSize: 16 },
  settingsHero: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 16,
    gap: 6
  },
  settingsAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: morandi.mintSoft,
    alignItems: "center",
    justifyContent: "center"
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
    backgroundColor: "#fff",
    borderRadius: USE_MORANDI_UI ? 26 : 14,
    borderWidth: USE_MORANDI_UI ? 0 : 1,
    borderColor: "#e4e7ec",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: USE_MORANDI_UI ? 0.06 : 0,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: USE_MORANDI_UI ? 2 : 0
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eef2f6"
  },
  settingsRowTitle: { color: USE_MORANDI_UI ? morandi.text : "#173e67", fontSize: 16, fontWeight: "800" },
  settingsRowValue: { marginTop: 2, color: USE_MORANDI_UI ? morandi.textMuted : "#667085", fontSize: 13 },
  settingsChevron: { color: "#98a2b3", fontSize: 22, fontWeight: "600" },
  settingsHint: { color: "#667085", marginTop: -4, marginBottom: 4 },
  settingsGroupLabel: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 2
  },
  logoutBtn: {
    marginTop: 8,
    borderRadius: USE_MORANDI_UI ? 20 : 12,
    borderWidth: 1.5,
    borderColor: USE_MORANDI_UI ? morandi.clay : "#1f74d1",
    backgroundColor: "#fff",
    paddingVertical: 14,
    alignItems: "center"
  },
  logoutText: { color: USE_MORANDI_UI ? morandi.clay : "#1f74d1", fontWeight: "900", fontSize: 16 },
  langBtn: {
    backgroundColor: "#e8f2ff",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#c0d8f5"
  },
  langBtnText: { color: USE_MORANDI_UI ? morandi.pine : "#1f74d1", fontWeight: "900", fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 80,
    paddingRight: 16
  },
  langPicker: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d8e6ff",
    minWidth: 160,
    overflow: "hidden"
  },
  langPickerTitle: {
    color: "#526b88",
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
    borderTopColor: "#f0f5ff"
  },
  langOptionActive: { backgroundColor: "#e8f2ff" },
  langOptionText: { color: "#173e67", fontSize: 14, fontWeight: "700" },
  langOptionTextActive: { color: USE_MORANDI_UI ? morandi.pine : "#1f74d1", fontWeight: "900" },
  langOptionCheck: { color: USE_MORANDI_UI ? morandi.pine : "#1f74d1", fontWeight: "900", fontSize: 14 }
})
