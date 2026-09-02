import { View, Text, Pressable, RefreshControl, ScrollView, StyleSheet } from "react-native"
import { colors, radius, spacing, font } from "./tokens"

export default function NewTodoScreen({
  tab,
  onChangeTab,
  todos,
  onMarkDone,
  onMarkPending,
  hideTabs = false,
  tabsOnly = false,
  refreshing = false,
  onRefresh
}) {
  const list = Array.isArray(todos) ? todos : []
  const isToday = tab === "today"

  return (
    <View style={[
      styles.container,
      tabsOnly ? styles.tabsOnly : styles.flex,
      hideTabs ? styles.containerFlush : null
    ]}>
      {hideTabs ? null : (
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tab, isToday ? styles.tabActive : null]}
            onPress={() => onChangeTab && onChangeTab("today")}
          >
            <Text style={[styles.tabText, isToday ? styles.tabTextActive : null]}>
              今日待辦
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, !isToday ? styles.tabActive : null]}
            onPress={() => onChangeTab && onChangeTab("diary")}
          >
            <Text style={[styles.tabText, !isToday ? styles.tabTextActive : null]}>
              日常記錄
            </Text>
          </Pressable>
        </View>
      )}

      {tabsOnly || !isToday ? null : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.pine} />
            ) : undefined
          }
        >
          <View style={styles.timelineCard}>
            {list.length === 0 ? (
              <Text style={styles.emptyText}>今日無待辦</Text>
            ) : (
              list.map((item, idx) => (
                <TimelineRow
                  key={item.id ?? idx}
                  item={item}
                  isLast={idx === list.length - 1}
                  onDone={() => onMarkDone && onMarkDone(item)}
                  onPending={() => onMarkPending && onMarkPending(item)}
                />
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  )
}

function TimelineRow({ item, isLast, onDone, onPending }) {
  const iconBg =
    item.category === "bath"
      ? colors.mintSoft
      : item.category === "med"
        ? "#FDE7DE"
        : "#EEF3EF"
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineLeft}>
        <View style={[styles.timelineIcon, { backgroundColor: iconBg }]}>
          <View style={styles.timelineIconInner} />
        </View>
        {isLast ? null : <View style={styles.timelineConnector} />}
      </View>
      <View style={styles.timelineBody}>
        <View style={styles.timelineHeader}>
          <Text style={styles.timelineTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.time ? (
            <Text style={styles.timelineTime}>{item.time}</Text>
          ) : null}
        </View>
        <View style={styles.timelineActionRow}>
          {item.done ? (
            <View style={[styles.stateBadge, styles.stateBadgeDone]}>
              <Text style={styles.stateBadgeDoneText}>已完成</Text>
            </View>
          ) : item.skipped ? (
            <>
              <View style={[styles.stateBadge, styles.stateBadgeSkip]}>
                <Text style={styles.stateBadgeSkipText}>略過</Text>
              </View>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnDone]}
                onPress={onDone}
                hitSlop={6}
              >
                <View style={styles.checkMark} />
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.pendingLabel}>待處理</Text>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnDone]}
                onPress={onDone}
                hitSlop={6}
              >
                <View style={styles.checkMark} />
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnCancel]}
                onPress={onPending}
                hitSlop={6}
              >
                <View style={styles.crossMark} />
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.bg, paddingTop: spacing.xl },
  flex: { flex: 1 },
  tabsOnly: { flexGrow: 0, paddingTop: spacing.md, paddingBottom: 0 },
  containerFlush: { paddingTop: 0 },

  tabRow: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.chip,
    padding: 4,
    marginBottom: spacing.md
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: radius.chip
  },
  tabActive: { backgroundColor: colors.mintSoft },
  tabText: { fontSize: font.body, color: colors.textMuted },
  tabTextActive: { color: colors.pine, fontWeight: "700" },

  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  timelineCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg
  },
  emptyText: {
    fontSize: font.body,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.xl
  },

  timelineRow: { flexDirection: "row", marginBottom: spacing.md },
  timelineLeft: { width: 44, alignItems: "center" },
  timelineIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center"
  },
  timelineIconInner: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.pine
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: 4
  },
  timelineBody: { flex: 1, marginLeft: spacing.md, paddingTop: 2 },
  timelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6
  },
  timelineTitle: { flex: 1, fontSize: font.body, color: colors.text, fontWeight: "600" },
  timelineTime: { fontSize: font.small, color: colors.textMuted, marginLeft: spacing.sm },
  timelineActionRow: { flexDirection: "row", alignItems: "center" },
  pendingLabel: { fontSize: font.small, color: colors.textMuted, marginRight: spacing.sm },
  actionBtn: {
    width: 32,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4
  },
  actionBtnDone: { backgroundColor: colors.pine },
  actionBtnCancel: { backgroundColor: colors.border },
  checkMark: {
    width: 10,
    height: 6,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: "#FFF",
    transform: [{ rotate: "-45deg" }],
    marginTop: -2
  },
  crossMark: {
    width: 10,
    height: 10,
    borderRightWidth: 2,
    borderTopWidth: 2,
    borderColor: colors.textMuted,
    transform: [{ rotate: "45deg" }]
  },
  stateBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.chip
  },
  stateBadgeDone: { backgroundColor: colors.mintSoft },
  stateBadgeDoneText: { fontSize: font.small, color: colors.pine, fontWeight: "600" },
  stateBadgeSkip: { backgroundColor: "#F3F4F6", marginRight: spacing.sm },
  stateBadgeSkipText: { fontSize: font.small, color: colors.textMuted, fontWeight: "600" }
})
