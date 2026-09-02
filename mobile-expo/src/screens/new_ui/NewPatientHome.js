import { View, Text, Pressable, RefreshControl, ScrollView, StyleSheet } from "react-native"
import { colors, radius, spacing, font } from "./tokens"

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
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.pine} />
        ) : undefined
      }
    >
      <View style={styles.header}>
        {helloLine ? <Text style={styles.hello}>{helloLine}</Text> : null}
        <Text style={styles.kicker}>TakeCare 受顧者端</Text>
      </View>

      <Pressable
        style={styles.sosCard}
        onPress={onOpenSos}
        accessibilityRole="button"
        accessibilityLabel="呼叫"
      >
        <Text style={styles.sosTitle}>呼叫</Text>
        {sosHint ? <Text style={styles.sosHint}>{sosHint}</Text> : null}
      </Pressable>

      <Pressable style={styles.card} onPress={onOpenTodo}>
        <Text style={styles.cardTitle}>今日待辦</Text>
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

      <Pressable style={styles.bpCard} onPress={onOpenBp}>
        <View style={styles.bpHeader}>
          <Text style={styles.bpTitle}>最新血壓</Text>
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.()
              if (onRefreshBp) onRefreshBp()
            }}
            hitSlop={12}
          >
            <Text style={styles.bpRefresh}>重新整理</Text>
          </Pressable>
        </View>
        {bpText ? (
          <Text style={styles.bpValue}>{bpText}</Text>
        ) : (
          <Text style={styles.bpEmpty}>尚無血壓資料</Text>
        )}
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xl, gap: spacing.md },
  header: { marginBottom: spacing.sm },
  hello: { fontSize: font.h1, fontWeight: "800", color: colors.text },
  kicker: { marginTop: 4, fontSize: font.small, color: colors.textMuted, fontWeight: "600" },
  sosCard: {
    backgroundColor: colors.clay,
    borderRadius: radius.card,
    minHeight: 148,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  sosTitle: { color: "#FFF", fontSize: 42, fontWeight: "800" },
  sosHint: { marginTop: 8, color: "rgba(255,255,255,0.92)", fontSize: font.body, fontWeight: "600" },
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
  cardTitle: { fontSize: font.h2, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  todoLine: { fontSize: font.body, color: colors.text, marginTop: 6 },
  empty: { fontSize: font.body, color: colors.textMuted },
  bpCard: {
    backgroundColor: colors.pine,
    borderRadius: radius.card,
    padding: spacing.lg,
    minHeight: 140
  },
  bpHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bpTitle: { fontSize: font.h2, fontWeight: "700", color: "#FFF" },
  bpRefresh: { fontSize: font.small, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  bpValue: { marginTop: spacing.md, fontSize: 36, fontWeight: "800", color: "#FFF" },
  bpEmpty: { marginTop: spacing.md, fontSize: font.body, color: "rgba(255,255,255,0.85)" }
})
