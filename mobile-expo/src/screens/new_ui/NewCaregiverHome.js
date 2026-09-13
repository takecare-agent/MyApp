import { View, Text, Pressable, RefreshControl, ScrollView, StyleSheet, Linking } from "react-native"
import { colors, radius, spacing, font } from "./tokens"
import {
  IconPhone,
  IconBook,
  IconUserPlus,
  IconCalendar,
  IconActivity,
  IconRefresh,
  IconCheck,
  IconArrowRight
} from "./NeoIcons"
import { AvatarMark } from "../../components/AvatarMark"
import TranslatedUgcText from "../../components/TranslatedUgcText"
import { useI18n } from "../../i18n/I18nContext"
import BpSparkline from "./BpSparkline"

export default function NewCaregiverHome({
  elderName,
  avatarEmail,
  apiBaseUrl,
  token,
  greeting,
  statusText,
  pendingCount,
  todos,
  bpText,
  bpPoints,
  bpStage,
  healthCardHint,
  showEmergency = true,
  refreshing = false,
  onRefresh,
  onCall119,
  onOpenFirstAid,
  onOpenHealthCard,
  onOpenTodo,
  onWriteDaily,
  onOpenBp,
  onRefreshBp,
  onPressStatus
}) {
  const { t } = useI18n()
  const list = Array.isArray(todos) ? todos : []
  const completedCount = list.filter((item) => item.done).length
  const totalCount = list.length

  let summary = statusText || null
  if (!summary && typeof pendingCount === "number") {
    summary = pendingCount > 0
      ? t("home.statusTodoOpen.caregiver", { n: pendingCount })
      : t("home.statusTodoDone.caregiver")
  }

  const StatusWrap = onPressStatus ? Pressable : View
  const call119 = () => (onCall119 ? onCall119() : Linking.openURL("tel:119"))

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.mint} />
        ) : undefined
      }
    >
      <View style={[styles.card, styles.headerCard]}>
        <View style={styles.headerRow}>
          <AvatarMark email={avatarEmail} size={52} apiBaseUrl={apiBaseUrl} token={token} />
          <View style={styles.headerText}>
            {elderName ? (
              <Text style={styles.elderName} numberOfLines={1}>
                {elderName}
              </Text>
            ) : null}
            {greeting ? (
              <Text style={styles.greeting} numberOfLines={1}>
                {greeting}
              </Text>
            ) : null}
            {summary ? (
              <StatusWrap
                style={styles.statusPill}
                onPress={onPressStatus}
                {...(onPressStatus ? { accessibilityRole: "button" } : {})}
              >
                <View style={[styles.statusDot, pendingCount > 0 ? styles.statusDotWarn : null]} />
                <Text style={styles.statusText}>
                  {summary}
                </Text>
              </StatusWrap>
            ) : null}
          </View>
        </View>
      </View>

      {showEmergency ? (
      <View style={styles.topGrid}>
        <Pressable style={styles.sosCard} onPress={call119} accessibilityRole="button" accessibilityLabel="119">
          <View style={styles.sosTop}>
            <Text style={styles.sosTitle}>119</Text>
            <View style={styles.sosBadge}>
              <Text style={styles.sosBadgeText}>SOS</Text>
            </View>
          </View>
          <Text style={styles.sosSubtitle}>{t("home.emergencyReport")}</Text>
          <Text style={styles.sosHint}>{t("home.emergencyNow")}</Text>
          <View style={styles.sosBottom}>
            <IconArrowRight size={16} />
            <View style={styles.phoneBtn}>
              <IconPhone size={18} color="#FF4D4D" />
            </View>
          </View>
        </Pressable>

        <View style={styles.rightColumn}>
          <Pressable style={[styles.card, styles.sideCard]} onPress={onOpenFirstAid}>
            <View style={styles.sideTop}>
              <View style={styles.sideCopy}>
                <Text style={styles.sideTitle}>
                  {t("home.emergencyGuide")}
                </Text>
                <Text style={styles.sideSub}>
                  {t("home.guideRescue")}
                </Text>
              </View>
              <IconBook size={20} />
            </View>
            <IconArrowRight size={16} />
          </Pressable>

          <Pressable style={[styles.card, styles.sideCard]} onPress={onOpenHealthCard}>
            <View style={styles.sideTop}>
              <Text style={styles.sideTitleOne}>
                {t("home.healthCardElder")}
              </Text>
              <IconUserPlus size={20} />
            </View>
            <IconArrowRight size={16} />
          </Pressable>
        </View>
      </View>
      ) : null}

      <View style={[styles.card, styles.todoCard]}>
        <View style={styles.todoLeft}>
          <View style={styles.todoTitleRow}>
            <IconCalendar size={18} />
            <Text style={styles.todoTitle}>
              {t("home.todayCareLog")}
            </Text>
          </View>
          {list.length === 0 ? (
            <Text style={styles.emptyText}>{t("home.noTodoToday")}</Text>
          ) : (
            <View style={styles.todoList}>
              {list.slice(0, 3).map((item, i) => (
                <View key={item.id ?? i} style={styles.todoRow}>
                  <View style={[styles.checkDot, item.done ? styles.checkDotDone : null]}>
                    {item.done ? <IconCheck size={12} /> : null}
                  </View>
                  <TranslatedUgcText
                    text={item.title}
                    sourceLang={item.sourceLang}
                    contentKey={item.contentKey}
                    apiBaseUrl={apiBaseUrl}
                    token={token}
                    compact
                    numberOfLines={1}
                    style={[styles.todoText, item.done ? styles.todoTextDone : null]}
                  />
                </View>
              ))}
            </View>
          )}
          <View style={styles.todoActions}>
            <Pressable style={styles.pillBtn} onPress={onOpenTodo}>
              <Text style={styles.pillBtnText}>
                {t("common.all")}
              </Text>
            </Pressable>
            <Pressable style={styles.pillBtnFill} onPress={onWriteDaily || onOpenTodo}>
              <Text style={styles.pillBtnText}>
                {t("home.writeDailyArrow")}
              </Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.todoRight}>
        <ProgressRing done={completedCount} total={totalCount} label={t("home.completeRing")} />
        </View>
      </View>

      <Pressable style={[styles.card, styles.bpCard]} onPress={onOpenBp}>
        <View style={styles.bpHeader}>
          <IconActivity size={18} />
          <Text
            style={styles.bpTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {t("home.bpLineCard")}
          </Text>
          {bpStage ? (
            <View style={styles.bpStagePill}>
              <Text style={styles.bpStageText} numberOfLines={1}>
                {bpStage}
              </Text>
            </View>
          ) : null}
          <Pressable
            style={styles.refreshBtn}
            onPress={(e) => {
              e?.stopPropagation?.()
              if (onRefreshBp) onRefreshBp()
            }}
            hitSlop={12}
          >
            <IconRefresh size={18} />
          </Pressable>
        </View>
        <Text style={styles.bpValue} numberOfLines={1}>
          {bpText ? bpText.replace(" mmHg", "") : "- / -"} mmHg
        </Text>
        <BpSparkline points={bpPoints} />
      </Pressable>

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  )
}

function ProgressRing({ done, total, label }) {
  const safeTotal = Number(total) || 0
  const safeDone = Number(done) || 0
  const pct = safeTotal > 0 ? Math.min(1, safeDone / safeTotal) : 0
  const spin = -90 + pct * 360
  return (
    <View style={styles.ringWrap}>
      <View style={styles.ringHalo} />
      <View style={styles.ringOuter} />
      <View style={styles.ringTrack} />
      <View
        style={[
          styles.ringGlow,
          { transform: [{ rotate: `${spin}deg` }] }
        ]}
      />
      <View style={styles.ringInner} />
      <View style={styles.ringCore} />
      <View style={styles.ringCenter}>
        <Text style={styles.ringLabel}>{label}</Text>
        <Text style={styles.ringValue}>
          {safeDone}/{safeTotal}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14
  },
  headerCard: { marginBottom: 0, paddingVertical: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  headerText: { flex: 1, gap: 4 },
  elderName: { fontSize: 22, fontWeight: "700", color: colors.text },
  greeting: { fontSize: 14, color: colors.textMuted },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0B0D0E",
    borderWidth: 1,
    borderColor: "#10B981",
    borderRadius: radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    gap: 6,
    maxWidth: "100%"
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.mint
  },
  statusDotWarn: { backgroundColor: colors.clay },
  statusText: { fontSize: 12, color: colors.mint, fontWeight: "600", flexShrink: 1 },
  topGrid: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  sosCard: {
    flex: 1.08,
    backgroundColor: "#FF4D4D",
    borderRadius: radius.card,
    borderCurve: "continuous",
    padding: 14,
    minHeight: 196,
    justifyContent: "space-between",
    overflow: "visible"
  },
  sosTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  sosTitle: { fontSize: 48, fontWeight: "800", color: "#FFF", lineHeight: 52 },
  sosBadge: {
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  sosBadgeText: { color: "#FF4D4D", fontSize: 11, fontWeight: "800" },
  sosSubtitle: { fontSize: 17, color: "#FFF", fontWeight: "700", flexShrink: 1 },
  sosHint: { fontSize: 12, color: "rgba(255,255,255,0.86)", fontWeight: "600", flexShrink: 1 },
  sosBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  phoneBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center"
  },
  rightColumn: { flex: 1, gap: 10 },
  sideCard: {
    flex: 1,
    minHeight: 92,
    padding: 12,
    justifyContent: "space-between",
    overflow: "visible"
  },
  sideTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6
  },
  sideCopy: { flex: 1, paddingRight: 4 },
  sideTitle: { fontSize: 14, fontWeight: "700", color: colors.text, flexShrink: 1 },
  sideSub: { fontSize: 12, fontWeight: "600", color: colors.textMuted, marginTop: 2, flexShrink: 1 },
  sideTitleOne: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    paddingRight: 4,
    flexShrink: 1
  },
  todoCard: { flexDirection: "row", minHeight: 186, gap: 6, padding: 14, alignItems: "stretch" },
  todoLeft: { flex: 1, minWidth: 0 },
  todoTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 12 },
  todoTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: colors.text, flexShrink: 1 },
  todoList: { marginBottom: 12, gap: 10 },
  todoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.mint,
    alignItems: "center",
    justifyContent: "center"
  },
  checkDotDone: { backgroundColor: colors.pine, borderColor: colors.pine },
  todoText: { flex: 1, fontSize: 13, color: colors.text },
  todoTextDone: { color: colors.textMuted },
  emptyText: { fontSize: font.body, color: colors.textMuted, marginBottom: spacing.md },
  todoActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: "auto", alignItems: "center" },
  pillBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.chip,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  pillBtnFill: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 0
  },
  pillBtnText: { fontSize: 12, color: colors.text, fontWeight: "600", flexShrink: 1, textAlign: "center" },
  todoRight: { width: 108, alignItems: "center", justifyContent: "center" },
  ringWrap: {
    width: 108,
    height: 108,
    alignItems: "center",
    justifyContent: "center"
  },
  ringHalo: {
    position: "absolute",
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: "rgba(168, 230, 207, 0.06)"
  },
  ringOuter: {
    position: "absolute",
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.08)"
  },
  ringTrack: {
    position: "absolute",
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 8,
    borderColor: "#2A2D32"
  },
  ringGlow: {
    position: "absolute",
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 8,
    borderColor: "transparent",
    borderTopColor: colors.mint,
    borderRightColor: "rgba(168, 230, 207, 0.45)",
    boxShadow: "0 0 16px rgba(168, 230, 207, 0.65)"
  },
  ringInner: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.08)"
  },
  ringCore: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.card
  },
  ringCenter: { alignItems: "center" },
  ringLabel: { fontSize: font.small, color: colors.textMuted },
  ringValue: { fontSize: font.h2, fontWeight: "700", color: colors.text },
  bpCard: { minHeight: 168, padding: 14 },
  bpHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 6 },
  bpTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.text },
  bpStagePill: {
    backgroundColor: colors.mintSoft,
    borderRadius: radius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    maxWidth: 88
  },
  bpStageText: { fontSize: font.small, color: colors.mint },
  refreshBtn: { padding: 4 },
  bpValue: { fontSize: 30, fontWeight: "800", color: "#10B981", marginTop: 6 }
})
