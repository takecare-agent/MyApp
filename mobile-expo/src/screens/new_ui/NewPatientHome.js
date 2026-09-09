import { View, Text, Pressable, RefreshControl, ScrollView, StyleSheet } from "react-native"
import { colors, radius, spacing, font } from "./tokens"
import { IconPhone, IconCalendar, IconActivity, IconRefresh } from "./NeoIcons"

export default function NewPatientHome({
  helloLine,
  todos,
  bpText,
  sosHint,
  refreshing = false,
  onRefresh,
  onOpenSos,
  onOpenTodo,
  onOpenBp,
  onRefreshBp
}) {
  const list = Array.isArray(todos) ? todos : []

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.mint} />
        ) : undefined
      }
    >
      <View style={[styles.card, styles.headerCard]}>
        {helloLine ? <Text style={styles.hello}>{helloLine}</Text> : null}
        <Text style={styles.kicker}>TakeCare 受顧者端</Text>
      </View>

      <Pressable
        style={styles.sosCard}
        onPress={onOpenSos}
        accessibilityRole="button"
        accessibilityLabel="呼叫"
      >
        <IconPhone size={28} color="#FFFFFF" />
        <Text style={styles.sosTitle}>呼叫</Text>
        {sosHint ? <Text style={styles.sosHint}>{sosHint}</Text> : null}
      </Pressable>

      <Pressable style={styles.card} onPress={onOpenTodo}>
        <View style={styles.cardTitleRow}>
          <IconCalendar size={18} />
          <Text style={styles.cardTitle}>今日待辦</Text>
        </View>
        {list.length === 0 ? (
          <Text style={styles.empty}>今日無待辦</Text>
        ) : (
          list.slice(0, 3).map((item, i) => (
            <Text key={item.id ?? i} style={styles.todoLine} numberOfLines={1}>
              {item.title}
            </Text>
          ))
        )}
      </Pressable>

      <Pressable style={styles.card} onPress={onOpenBp}>
        <View style={styles.bpHeader}>
          <IconActivity size={18} />
          <Text style={styles.bpTitle}>最新血壓</Text>
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.()
              if (onRefreshBp) onRefreshBp()
            }}
            hitSlop={12}
          >
            <IconRefresh size={18} />
          </Pressable>
        </View>
        <Text style={styles.bpValue}>{bpText ? bpText.replace(" mmHg", "") : "- / -"} mmHg</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16
  },
  headerCard: { gap: 4 },
  hello: { fontSize: font.h1, fontWeight: "800", color: colors.text },
  kicker: { fontSize: font.small, color: colors.textMuted, fontWeight: "600" },
  sosCard: {
    backgroundColor: "#E05A47",
    borderRadius: radius.card,
    borderCurve: "continuous",
    minHeight: 148,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: 8
  },
  sosTitle: { color: "#FFF", fontSize: 42, fontWeight: "800" },
  sosHint: { color: "rgba(255,255,255,0.92)", fontSize: font.body, fontWeight: "600" },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm },
  cardTitle: { fontSize: font.h2, fontWeight: "700", color: colors.text },
  todoLine: { fontSize: font.body, color: colors.text, marginTop: 6 },
  empty: { fontSize: font.body, color: colors.textMuted },
  bpHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  bpTitle: { flex: 1, fontSize: font.h2, fontWeight: "700", color: colors.text },
  bpValue: { marginTop: spacing.md, fontSize: 32, fontWeight: "800", color: colors.mint }
})
