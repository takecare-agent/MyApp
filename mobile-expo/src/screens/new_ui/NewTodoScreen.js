import { View, Text, Pressable, RefreshControl, ScrollView, StyleSheet } from "react-native"
import { colors, radius, spacing, font } from "./tokens"
import { IconList, IconCheck, IconChevronRight, IconCalendar } from "./NeoIcons"

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
            <IconCalendar size={15} color={isToday ? "#FFFFFF" : colors.textMuted} />
            <Text style={[styles.tabText, isToday ? styles.tabTextActive : null]} numberOfLines={1}>
              今日待辦
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, !isToday ? styles.tabActive : null]}
            onPress={() => onChangeTab && onChangeTab("diary")}
          >
            <IconList size={15} color={!isToday ? "#FFFFFF" : colors.textMuted} />
            <Text style={[styles.tabText, !isToday ? styles.tabTextActive : null]} numberOfLines={1}>
              日常紀錄
            </Text>
          </Pressable>
        </View>
      )}

      {tabsOnly || !isToday ? null : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.mint} />
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
  return (
    <View style={[styles.timelineRow, isLast ? null : styles.timelineRowBorder]}>
      <View style={styles.timelineLeft}>
        {item.done ? (
          <View style={styles.doneCircle}>
            <IconCheck size={13} />
          </View>
        ) : (
          <View style={styles.pendingCircle}>
            <View style={styles.pendingSquare} />
          </View>
        )}
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
                <IconCheck size={14} />
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
                <IconCheck size={14} />
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnCancel]}
                onPress={onPending}
                hitSlop={6}
              >
                <IconChevronRight size={16} />
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.bg, paddingTop: spacing.md },
  flex: { flex: 1 },
  tabsOnly: { flexGrow: 0, paddingTop: spacing.sm, paddingBottom: 0 },
  containerFlush: { paddingTop: 0 },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: spacing.md,
    gap: 4
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.chip,
    gap: 6,
    minWidth: 0
  },
  tabActive: { backgroundColor: "#10B981" },
  tabText: { fontSize: 14, color: colors.textMuted, fontWeight: "600" },
  tabTextActive: { color: "#FFFFFF", fontWeight: "700" },
  scrollContent: { paddingHorizontal: 16, paddingBottom: spacing.xl },
  timelineCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  emptyText: {
    fontSize: font.body,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.xl
  },
  timelineRow: {
    flexDirection: "row",
    paddingVertical: 14,
    gap: 12
  },
  timelineRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  timelineLeft: { width: 28, alignItems: "center", paddingTop: 2 },
  doneCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center"
  },
  pendingCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.mint,
    alignItems: "center",
    justifyContent: "center"
  },
  pendingSquare: {
    width: 9,
    height: 9,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: colors.mint
  },
  timelineBody: { flex: 1 },
  timelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6
  },
  timelineTitle: { flex: 1, fontSize: font.body, color: colors.text, fontWeight: "600" },
  timelineTime: { fontSize: font.small, color: colors.textMuted, marginLeft: spacing.sm },
  timelineActionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pendingLabel: { fontSize: font.small, color: colors.textMuted },
  actionBtn: {
    width: 32,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  actionBtnDone: { backgroundColor: "#10B981" },
  actionBtnCancel: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border
  },
  stateBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.chip
  },
  stateBadgeDone: { backgroundColor: colors.mintSoft },
  stateBadgeDoneText: { fontSize: font.small, color: colors.mint, fontWeight: "600" },
  stateBadgeSkip: { backgroundColor: "rgba(255,255,255,0.06)", marginRight: 4 },
  stateBadgeSkipText: { fontSize: font.small, color: colors.textMuted, fontWeight: "600" }
})
