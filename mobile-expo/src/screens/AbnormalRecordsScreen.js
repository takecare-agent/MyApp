/**
 * @deprecated 2026-09-02 IA-04 — 無 App 入口。帳本在監看→活動。
 * 保留檔案避免誤接；不要再 import。
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native"
import { apiRequest } from "../lib/api"
import { isSosAlert, severityTone } from "../lib/abnormalReport"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "./new_ui/tokens"

function alertsPath(role) {
  return role === "family" ? "/family/alerts/history" : "/caregiver/alerts/history"
}

function typeLabel(record, t) {
  if (isSosAlert(record)) return t("alert.type.sos")
  return record?.type || t("alerts.item")
}

export default function AbnormalRecordsScreen({ apiBaseUrl, token, role, onBack }) {
  const { t } = useI18n()
  const canHandle = role === "caregiver"
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [kind, setKind] = useState("all")
  const [status, setStatus] = useState("all")

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: `${alertsPath(role)}?limit=80`,
        token
      })
      setRecords(Array.isArray(data?.records) ? data.records : [])
    } catch (err) {
      if (!silent) Alert.alert(t("common.error"), err.message || t("common.loadFailed"))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [apiBaseUrl, role, token, t])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (kind === "sos" && !isSosAlert(r)) return false
      if (status === "open" && r.status === "Done") return false
      if (status === "done" && r.status !== "Done") return false
      return true
    })
  }, [kind, records, status])

  const markDone = (item) => {
    if (!canHandle) return
    Alert.alert(t("alerts.markTitle"), t("alerts.markMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("alerts.markDone"),
        onPress: async () => {
          try {
            if (item.status === "Pending") {
              await apiRequest({
                apiBaseUrl,
                path: `/caregiver/alerts/${item._id}/claim`,
                method: "POST",
                token,
                body: {}
              }).catch(() => {})
            }
            await apiRequest({
              apiBaseUrl,
              path: `/caregiver/alerts/${item._id}/resolve`,
              method: "POST",
              token,
              body: { note: t("alerts.startHandle") }
            })
            await load({ silent: true })
          } catch (err) {
            Alert.alert(t("common.error"), err.message || t("common.saveFailed"))
          }
        }
      }
    ])
  }

  const renderItem = ({ item }) => {
    const tone = severityTone(item.severity)
    const done = item.status === "Done"
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.badge, tone === "urgent" ? styles.bUrgent : tone === "mild" ? styles.bMild : styles.bWatch]}>
            <Text style={styles.badgeT}>{t(`stats.${tone === "urgent" ? "urgent" : tone === "mild" ? "mild" : "watch"}`)}</Text>
          </View>
          <Text style={styles.time}>
            {item.happenedAt || item.createdAt
              ? new Date(item.happenedAt || item.createdAt).toLocaleString()
              : ""}
          </Text>
        </View>
        <Text style={styles.type}>{typeLabel(item, t)}</Text>
        {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
        <Text style={styles.meta}>{t("alerts.reporter")}：{item.reporterRole === "system" ? t("alerts.ai") : (item.reporterRole || "—")}</Text>
        {canHandle && !done ? (
          <Pressable style={styles.markBtn} onPress={() => markDone(item)}>
            <Text style={styles.markTxt}>{t("alerts.startHandle")}</Text>
          </Pressable>
        ) : null}
        {done ? <Text style={styles.done}>{t("alerts.done")}</Text> : null}
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.nav}>
        <Pressable onPress={onBack}><Text style={styles.back}>‹ {t("common.back")}</Text></Pressable>
        <Text style={styles.navTitle}>{t("alerts.title")}</Text>
        <View style={{ width: 48 }} />
      </View>
      <View style={styles.filters}>
        <Text style={styles.fl}>{t("alerts.type")}</Text>
        <View style={styles.row}>
          {["all", "sos"].map((id) => (
            <Pressable key={id} onPress={() => setKind(id)} style={[styles.chip, kind === id ? styles.chipRed : null]}>
              <Text style={[styles.chipT, kind === id ? styles.chipTOn : null]}>{id === "all" ? t("alerts.all") : t("alert.type.sos")}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.fl}>{t("alerts.status")}</Text>
        <View style={styles.row}>
          {[
            { id: "all", label: t("alerts.all") },
            { id: "open", label: t("alerts.open") },
            { id: "done", label: t("alerts.done") }
          ].map((c) => (
            <Pressable key={c.id} onPress={() => setStatus(c.id)} style={[styles.chip, status === c.id ? styles.chipRed : null]}>
              <Text style={[styles.chipT, status === c.id ? styles.chipTOn : null]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.pine} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item._id || item.eventId)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load({ silent: true }) }} />}
          ListEmptyComponent={<Text style={styles.empty}>{t("alerts.empty")}</Text>}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  nav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 12, backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb"
  },
  back: { color: colors.pine, fontWeight: "700", fontSize: 16 },
  navTitle: { fontSize: 16, fontWeight: "800" },
  filters: { backgroundColor: "#fff", paddingHorizontal: 16, paddingBottom: 12 },
  fl: { marginTop: 10, marginBottom: 6, fontSize: 13, fontWeight: "700", color: "#6b7280" },
  row: { flexDirection: "row", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.bg },
  chipRed: { backgroundColor: "#fff1f0" },
  chipT: { fontWeight: "700", color: "#6b7280" },
  chipTOn: { color: "#cf1322" },
  list: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  bUrgent: { backgroundColor: "#fff1f0" },
  bWatch: { backgroundColor: "#fff7e6" },
  bMild: { backgroundColor: "#f6ffed" },
  badgeT: { fontSize: 12, fontWeight: "800", color: "#cf1322" },
  time: { fontSize: 11, color: "#9ca3af" },
  type: { marginTop: 8, fontSize: 16, fontWeight: "800", color: "#111827" },
  desc: { marginTop: 4, fontSize: 13, color: "#4b5563" },
  meta: { marginTop: 8, fontSize: 12, color: "#9ca3af" },
  markBtn: {
    marginTop: 10, alignSelf: "flex-start", borderWidth: 1, borderColor: "#91d5ff",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6
  },
  markTxt: { color: colors.pine, fontWeight: "700" },
  done: { marginTop: 8, color: colors.pine, fontWeight: "700" },
  empty: { textAlign: "center", marginTop: 40, color: "#9ca3af" }
})
