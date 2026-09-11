import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native"
import { useI18n } from "../../i18n/I18nContext"
import { extraSummary, firstOpenSlotIndex, groupTodayTasks, iconForTask } from "../../lib/marGroups"
import { carePresetLabel } from "../../lib/presetResolve"
import { NeoIcon } from "./NeoIcons"
import { colors, font, radius, spacing } from "./tokens"

export default function NewTodoScreen({
  tab,
  onChangeTab,
  todos,
  onOpenSlot,
  onOpenSingle,
  hideTabs = false,
  tabsOnly = false,
  refreshing = false,
  onRefresh
}) {
  const { t } = useI18n()
  const list = Array.isArray(todos) ? todos : []
  const groups = groupTodayTasks(list)
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
            <NeoIcon name="check" size={15} color={isToday ? "#FFFFFF" : colors.textMuted} />
            <Text style={[styles.tabText, isToday ? styles.tabTextActive : null]} numberOfLines={1}>
              {t("reminders.todayTodos")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, !isToday ? styles.tabActive : null]}
            onPress={() => onChangeTab && onChangeTab("diary")}
          >
            <NeoIcon name="list" size={15} color={!isToday ? "#FFFFFF" : colors.textMuted} />
            <Text style={[styles.tabText, !isToday ? styles.tabTextActive : null]} numberOfLines={1}>
              {t("reminders.careDaily")}
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
          {groups.length === 0 ? (
            <Text style={styles.emptyText}>{t("home.noTodoToday")}</Text>
          ) : (
            groups.map((g) => (
              g.type === "multi" ? (
                <MultiCard
                  key={`m-${g.id}`}
                  group={g}
                  t={t}
                  onOpenSlot={onOpenSlot}
                />
              ) : (
                <SingleCard
                  key={`s-${g.id}`}
                  task={g.task}
                  t={t}
                  onOpen={onOpenSingle}
                />
              )
            ))
          )}
        </ScrollView>
      )}
    </View>
  )
}

function slotStateText(slot, t) {
  if (slot.done) {
    return t("mar.doneAt", { time: slot.completedClock || slot.time })
  }
  return t("mar.pendingAt", { time: slot.time })
}

function MultiCard({ group, t, onOpenSlot }) {
  const openIdx = firstOpenSlotIndex(group.slots)
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.iconWell}>
          <NeoIcon name={iconForTask({ category: group.category, title: group.title })} size={20} color="#10B981" />
        </View>
        <View style={styles.cardMid}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {carePresetLabel({ text: group.title, contentKey: group.contentKey, t })}
            {group.slots.some((s) => s.done) ? (
              <Text style={styles.progress}> {t("mar.progress", { done: group.progressDone, total: group.progressTotal })}</Text>
            ) : null}
          </Text>
        </View>
      </View>
      <View style={styles.slotRow}>
        {group.slots.map((slot, idx) => {
          const current = !slot.done && idx === openIdx
          const future = !slot.done && idx !== openIdx
          return (
            <Pressable
              key={slot.id}
              style={[
                styles.slot,
                slot.done ? styles.slotDone : null,
                current ? styles.slotCurrent : null,
                future ? styles.slotFuture : null
              ]}
              onPress={() => onOpenSlot && onOpenSlot(slot, group)}
            >
              <View style={styles.slotHead}>
                <Text style={[styles.slotName, future ? styles.slotNameOff : null]} numberOfLines={1}>
                  {t(`mar.${slot.slotKey}`)}
                </Text>
                {slot.done ? (
                  <View style={styles.slotCheckOn}>
                    <NeoIcon name="check" size={11} color="#0B0D0E" />
                  </View>
                ) : (
                  <NeoIcon name="chevron-right" size={14} color={current ? "#10B981" : "#6C727A"} />
                )}
              </View>
              <Text
                style={[
                  styles.slotMeta,
                  slot.done ? styles.slotMetaDone : null,
                  future ? styles.slotNameOff : null
                ]}
                numberOfLines={1}
              >
                {future ? t("mar.scheduledAt", { time: slot.time }) : slotStateText(slot, t)}
              </Text>
              {extraSummary(slot) ? (
                <Text style={styles.slotExtra} numberOfLines={1}>{extraSummary(slot)}</Text>
              ) : null}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function SingleCard({ task, t, onOpen }) {
  const icon = iconForTask(task)
  const done = !!task.done
  return (
    <Pressable
      style={styles.card}
      onPress={() => onOpen && onOpen(task)}
    >
      <View style={styles.singleRow}>
        <View style={styles.iconWell}>
          <NeoIcon name={icon} size={20} color="#10B981" />
        </View>
        <View style={styles.cardMid}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {carePresetLabel({ text: task.title || task.content, contentKey: task.contentKey, t })}
          </Text>
          {extraSummary(task) ? (
            <Text style={styles.extraLine} numberOfLines={1}>{extraSummary(task)}</Text>
          ) : null}
          <View style={styles.singleMetaRow}>
            <View style={[styles.stateDotWrap, done ? styles.stateDotDone : null]}>
              <View style={[styles.stateDot, done ? styles.stateDotOn : styles.stateDotWait]} />
              <Text style={[styles.stateDotText, done ? styles.stateDotTextOn : null]}>
                {done ? t("mar.statusDone") : t("mar.statusNotDone")}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.chevBtn}>
          <NeoIcon name="chevron-right" size={18} color="#6C727A" />
        </View>
      </View>
    </Pressable>
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
    backgroundColor: "#16181D",
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
  tabTextActive: { color: "#FFFFFF", fontWeight: "800" },
  scrollContent: { paddingHorizontal: 16, paddingBottom: spacing.xl, gap: 12 },
  emptyText: {
    fontSize: font.body,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.xl
  },
  card: {
    backgroundColor: "#16181D",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 14,
    gap: 12,
    borderCurve: "continuous"
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(16,185,129,0.15)",
    alignItems: "center",
    justifyContent: "center"
  },
  cardMid: { flex: 1, minWidth: 0 },
  cardTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  progress: { color: "#10B981", fontWeight: "800" },
  slotRow: { flexDirection: "row", gap: 8 },
  slot: {
    flex: 1,
    minHeight: 72,
    borderRadius: 14,
    padding: 10,
    gap: 6,
    borderWidth: 1
  },
  slotDone: {
    backgroundColor: "#162920",
    borderColor: "rgba(16,185,129,0.4)"
  },
  slotCurrent: {
    backgroundColor: "#16181D",
    borderColor: "#10B981",
    shadowColor: "#10B981",
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8
  },
  slotFuture: {
    backgroundColor: "#121418",
    borderColor: "rgba(255,255,255,0.05)"
  },
  slotHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  slotName: { color: "#FFFFFF", fontSize: 13, fontWeight: "800", flex: 1 },
  slotNameOff: { color: "#6C727A" },
  slotCheckOn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center"
  },
  slotMeta: { color: "#FFFFFF", fontSize: 11, fontWeight: "600" },
  slotMetaDone: { color: "#10B981" },
  slotExtra: { color: "#10B981", fontSize: 11, fontWeight: "700" },
  singleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  extraLine: { color: "#10B981", fontSize: 13, fontWeight: "700", marginTop: 4 },
  singleMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" },
  stateDotWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(245,158,11,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999
  },
  stateDotDone: { backgroundColor: "rgba(16,185,129,0.12)" },
  stateDot: { width: 6, height: 6, borderRadius: 3 },
  stateDotWait: { backgroundColor: "#F59E0B" },
  stateDotOn: { backgroundColor: "#10B981" },
  stateDotText: { color: "#F59E0B", fontSize: 11, fontWeight: "700" },
  stateDotTextOn: { color: "#10B981" },
  chevBtn: { width: 22, height: 36, alignItems: "center", justifyContent: "center" }
})
