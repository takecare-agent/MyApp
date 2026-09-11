import { View, Text, Pressable, RefreshControl, ScrollView, StyleSheet } from "react-native"
import { colors, spacing } from "./tokens"
import { IconPhone, IconCalendar, IconActivity, IconRefresh } from "./NeoIcons"
import { AvatarMark } from "../../components/AvatarMark"
import { useI18n } from "../../i18n/I18nContext"

export default function NewPatientHome({
  helloLine,
  statusText,
  avatarEmail,
  apiBaseUrl,
  token,
  bpText,
  sosHint,
  refreshing = false,
  onRefresh,
  onOpenSos,
  onOpenTodo,
  onOpenBp,
  onRefreshBp
}) {
  const { t } = useI18n()
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
        <View style={styles.headerRow}>
          <AvatarMark email={avatarEmail} size={52} apiBaseUrl={apiBaseUrl} token={token} />
          <View style={styles.headerText}>
            {helloLine ? <Text style={styles.hello}>{helloLine}</Text> : null}
            {statusText ? <Text style={styles.kicker}>{statusText}</Text> : <Text style={styles.kicker}>{t("home.patientKicker")}</Text>}
          </View>
        </View>
      </View>

      <Pressable
        style={styles.sosCard}
        onPress={onOpenSos}
        accessibilityRole="button"
        accessibilityLabel={t("home.callButton")}
      >
        <IconPhone size={30} color="#FFFFFF" />
        <Text style={styles.sosTitle}>{t("home.callButton")}</Text>
        {sosHint ? <Text style={styles.sosHint}>{sosHint}</Text> : null}
      </Pressable>

      <Pressable style={styles.card} onPress={onOpenTodo}>
        <View style={styles.cardTitleRow}>
          <IconCalendar size={18} />
          <Text style={styles.cardTitle}>{t("home.todoLog")}</Text>
        </View>
        <Text style={styles.cardHint}>{t("home.todoHint")}</Text>
      </Pressable>

      <Pressable style={styles.card} onPress={onOpenBp}>
        <View style={styles.bpHeader}>
          <IconActivity size={18} />
          <Text style={styles.bpTitle}>{t("home.latestBp")}</Text>
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
  container: { flex: 1, backgroundColor: "#0B0D0E" },
  content: { paddingHorizontal: 16, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: 14 },
  card: {
    backgroundColor: "#16181D",
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 16
  },
  headerCard: { paddingVertical: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  headerText: { flex: 1, marginLeft: 0, gap: 4 },
  hello: { fontSize: 22, fontWeight: "700", color: "#FFFFFF" },
  kicker: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  sosCard: {
    backgroundColor: "#D95C48",
    borderRadius: 24,
    borderCurve: "continuous",
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg
  },
  sosTitle: { color: "#FFFFFF", fontSize: 30, fontWeight: "900", marginVertical: 4 },
  sosHint: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "700" },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  cardHint: { fontSize: 14, color: colors.textMuted, fontWeight: "600" },
  bpHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  bpTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  bpValue: { marginTop: spacing.md, fontSize: 30, fontWeight: "900", color: "#10B981", letterSpacing: -0.4 }
})
