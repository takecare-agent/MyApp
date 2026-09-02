import { View, Text, Pressable, RefreshControl, ScrollView, StyleSheet, Linking } from "react-native"
import { colors, radius, spacing, font } from "./tokens"

export default function NewCaregiverHome({
  elderName,
  greeting,
  statusText,
  pendingCount,
  todos,
  bpText,
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
  const list = Array.isArray(todos) ? todos : []
  const completedCount = list.filter((t) => t.done).length
  const totalCount = list.length

  let summary = null
  if (typeof pendingCount === "number") {
    summary = pendingCount > 0
      ? `狀態注意・${pendingCount} 項待處理異常`
      : "狀態良好・無待處理異常"
  } else if (statusText) {
    summary = statusText
  }

  const StatusWrap = onPressStatus ? Pressable : View

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.pine} />
        ) : undefined
      }
    >
      <View style={styles.headerRow}>
        <View style={styles.avatar}>
          <View style={styles.avatarInner} />
        </View>
        <View style={styles.headerText}>
          {elderName ? <Text style={styles.elderName}>{elderName}</Text> : null}
          {greeting ? <Text style={styles.greeting}>{greeting}</Text> : null}
          {summary ? (
            <StatusWrap
              style={styles.statusPill}
              onPress={onPressStatus}
              {...(onPressStatus ? { accessibilityRole: "button" } : {})}
            >
              <View style={[styles.statusDot, pendingCount > 0 ? styles.statusDotWarn : null]} />
              <Text style={styles.statusText}>{summary}</Text>
            </StatusWrap>
          ) : null}
        </View>
      </View>

      {showEmergency ? (
      <View style={styles.topGrid}>
        <Pressable
          style={[styles.card, styles.sosCard]}
          onPress={() => (onCall119 ? onCall119() : Linking.openURL("tel:119"))}
        >
          <Text style={styles.sosTitle}>119</Text>
          <Text style={styles.sosSubtitle}>緊急通報</Text>
          <View style={styles.sosIconWrap}>
            <View style={styles.sosIconRing}>
              <View style={styles.sosIconInner} />
            </View>
          </View>
        </Pressable>

        <View style={styles.rightColumn}>
          <Pressable style={[styles.card, styles.guideCard]} onPress={onOpenFirstAid}>
            <Text style={styles.guideTitle}>緊急指引</Text>
            <Text style={styles.guideSubtitle}>(圖解救援)</Text>
            <View style={styles.guideIcon} />
          </Pressable>

          <Pressable style={[styles.card, styles.healthCard]} onPress={onOpenHealthCard}>
            <Text style={styles.healthTitle}>長輩健康資訊卡</Text>
            {healthCardHint ? (
              <Text style={styles.healthSubtitle}>{healthCardHint}</Text>
            ) : null}
          </Pressable>
        </View>
      </View>
      ) : null}

      <View style={[styles.card, styles.todoCard]}>
        <View style={styles.todoLeft}>
          <Text style={styles.todoTitle}>今日的照護錄</Text>
          {list.length === 0 ? (
            <Text style={styles.emptyText}>今日無待辦</Text>
          ) : (
            <View style={styles.todoList}>
              {list.slice(0, 3).map((t, i) => (
                <View key={t.id ?? i} style={styles.todoRow}>
                  <View style={[styles.checkDot, t.done ? styles.checkDotDone : null]}>
                    {t.done ? <View style={styles.checkDotInner} /> : null}
                  </View>
                  <Text style={[styles.todoText, t.done ? styles.todoTextDone : null]}>
                    {t.title}
                  </Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.todoActions}>
            <Pressable style={styles.pillBtn} onPress={onOpenTodo}>
              <Text style={styles.pillBtnText}>全部</Text>
            </Pressable>
            <Pressable style={styles.pillBtnPrimary} onPress={onWriteDaily || onOpenTodo}>
              <Text style={styles.pillBtnPrimaryText}>填寫今日照護紀錄</Text>
            </Pressable>
          </View>
        </View>
        {totalCount > 0 ? (
          <View style={styles.todoRight}>
            <ProgressRing done={completedCount} total={totalCount} />
          </View>
        ) : null}
      </View>

      <Pressable style={[styles.card, styles.bpCard]} onPress={onOpenBp}>
        <View style={styles.bpHeader}>
          <Text style={styles.bpTitle}>血壓線卡</Text>
          <Text style={styles.bpUnit}> (mmHg)</Text>
          {bpStage ? (
            <View style={styles.bpStagePill}>
              <Text style={styles.bpStageText}>{bpStage}</Text>
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
            <View style={styles.refreshIcon} />
          </Pressable>
        </View>
        {bpText ? (
          <Text style={styles.bpValue}>{bpText}</Text>
        ) : (
          <Text style={styles.bpEmptyText}>尚無血壓資料</Text>
        )}
        <View style={styles.bpChart}>
          <View style={styles.bpChartLine} />
          <View style={[styles.bpChartLine, { top: 30 }]} />
          <View style={[styles.bpChartLine, { top: 60 }]} />
          <View style={[styles.bpChartLine, { top: 90 }]} />
          {bpText ? <View style={styles.bpChartWave} /> : null}
        </View>
      </Pressable>

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  )
}

function ProgressRing({ done, total }) {
  const pct = total > 0 ? Math.min(1, done / total) : 0
  return (
    <View style={styles.ringWrap}>
      <View style={styles.ringBg} />
      <View
        style={[
          styles.ringFg,
          { transform: [{ rotate: `${-90 + pct * 360}deg` }] }
        ]}
      />
      <View style={styles.ringCenter}>
        <Text style={styles.ringLabel}>完成</Text>
        <Text style={styles.ringValue}>
          {done}/{total}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },

  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md
  },
  avatarInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.pine
  },
  headerText: { flex: 1 },
  elderName: { fontSize: font.h1, fontWeight: "700", color: colors.text },
  greeting: { fontSize: font.body, color: colors.textMuted, marginTop: 2 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.mintSoft,
    borderRadius: radius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: 6,
    alignSelf: "flex-start"
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.mint,
    marginRight: 6
  },
  statusText: { fontSize: font.small, color: colors.pine, fontWeight: "600" },

  topGrid: { flexDirection: "row", marginBottom: spacing.md },
  statusDotWarn: { backgroundColor: colors.clay },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  sosCard: {
    flex: 1,
    backgroundColor: colors.clay,
    marginRight: spacing.md,
    minHeight: 200,
    justifyContent: "space-between"
  },
  sosTitle: { fontSize: 42, fontWeight: "800", color: "#FFF", lineHeight: 46 },
  sosSubtitle: { fontSize: font.h2, color: "#FFF", fontWeight: "700", marginTop: 4 },
  sosIconWrap: { alignItems: "flex-end" },
  sosIconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "#FFF",
    alignItems: "center",
    justifyContent: "center"
  },
  sosIconInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFF"
  },
  rightColumn: { flex: 1, justifyContent: "space-between" },
  guideCard: {
    backgroundColor: colors.butter,
    marginBottom: spacing.md,
    minHeight: 92,
    justifyContent: "center"
  },
  guideTitle: { fontSize: font.h2, fontWeight: "700", color: colors.text },
  guideSubtitle: { fontSize: font.small, color: colors.textMuted, marginTop: 2 },
  guideIcon: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 28,
    height: 32,
    borderWidth: 2,
    borderColor: colors.text,
    borderRadius: 4
  },
  healthCard: {
    backgroundColor: colors.pine,
    minHeight: 92,
    justifyContent: "center"
  },
  healthTitle: { fontSize: font.h2, fontWeight: "700", color: "#FFF" },
  healthSubtitle: { fontSize: font.small, color: "#FFF", opacity: 0.85, marginTop: 2 },

  todoCard: { flexDirection: "row", marginBottom: spacing.md, minHeight: 190 },
  todoLeft: { flex: 1 },
  todoTitle: { fontSize: font.h2, fontWeight: "700", color: colors.text, marginBottom: spacing.md },
  todoList: { marginBottom: spacing.md },
  todoRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.pine,
    marginRight: spacing.sm,
    alignItems: "center",
    justifyContent: "center"
  },
  checkDotDone: { backgroundColor: colors.pine },
  checkDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFF"
  },
  todoText: { fontSize: font.body, color: colors.text },
  todoTextDone: { color: colors.textMuted },
  emptyText: { fontSize: font.body, color: colors.textMuted, marginBottom: spacing.md },
  todoActions: { flexDirection: "row", marginTop: "auto" },
  pillBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.chip,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginRight: spacing.sm
  },
  pillBtnText: { fontSize: font.small, color: colors.text },
  pillBtnPrimary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.chip,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    flex: 1,
    alignItems: "center"
  },
  pillBtnPrimaryText: { fontSize: font.small, color: colors.text, fontWeight: "600" },
  todoRight: { width: 110, alignItems: "center", justifyContent: "center" },

  ringWrap: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center"
  },
  ringBg: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 8,
    borderColor: colors.clay,
    opacity: 0.35
  },
  ringFg: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 8,
    borderColor: "transparent",
    borderTopColor: colors.mint,
    borderRightColor: colors.mint
  },
  ringCenter: { alignItems: "center" },
  ringLabel: { fontSize: font.small, color: colors.textMuted },
  ringValue: { fontSize: font.h2, fontWeight: "700", color: colors.text },

  bpCard: { backgroundColor: colors.pine, minHeight: 180 },
  bpHeader: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  bpTitle: { fontSize: font.h2, fontWeight: "700", color: "#FFF" },
  bpUnit: { fontSize: font.small, color: "#FFF", opacity: 0.7 },
  bpStagePill: {
    marginLeft: "auto",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: radius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginRight: spacing.sm
  },
  bpStageText: { fontSize: font.small, color: "#FFF" },
  refreshBtn: { padding: 4, marginLeft: "auto" },
  refreshIcon: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderColor: "#FFF",
    borderRadius: 9,
    borderRightColor: "transparent"
  },
  bpValue: { fontSize: 40, fontWeight: "800", color: "#FFF", marginBottom: spacing.md },
  bpEmptyText: { fontSize: font.body, color: "rgba(255,255,255,0.85)", marginBottom: spacing.md },
  bpChart: { height: 110, position: "relative" },
  bpChartLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  bpChartWave: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 40,
    height: 2,
    backgroundColor: colors.mint,
    borderRadius: 2,
    shadowColor: colors.mint,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 }
  }
})
