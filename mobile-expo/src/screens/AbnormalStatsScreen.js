/**
 * @deprecated 2026-09-02 IA-04 — 無 App 入口。帳本在監看→活動。
 * 保留檔案避免誤接；不要再 import。
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native"
import { apiRequest } from "../lib/api"
import { classifyAlertType, severityTone } from "../lib/abnormalReport"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "./new_ui/tokens"

function alertsPath(role) {
  return role === "family" ? "/family/alerts/history" : "/caregiver/alerts/history"
}

export default function AbnormalStatsScreen({ apiBaseUrl, token, role, onBack }) {
  const { t } = useI18n()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [chart, setChart] = useState("bar")

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: `${alertsPath(role)}?limit=100`,
        token
      })
      setRecords(Array.isArray(data?.records) ? data.records : [])
    } catch {
      if (!silent) setRecords([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [apiBaseUrl, role, token])

  useEffect(() => { load() }, [load])

  const stats = useMemo(() => {
    const total = records.length
    const done = records.filter((r) => r.status === "Done").length
    const open = total - done
    const urgent = records.filter((r) => severityTone(r.severity) === "urgent").length
    const watch = records.filter((r) => severityTone(r.severity) === "watch").length
    const mild = records.filter((r) => severityTone(r.severity) === "mild").length
    const months = {}
    records.forEach((r) => {
      const d = new Date(r.happenedAt || r.createdAt)
      if (Number.isNaN(d.getTime())) return
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`
      if (!months[key]) {
        months[key] = { key, label: t("stats.monthN", { n: d.getMonth() + 1 }), fall: 0, health: 0, emotion: 0, diet: 0, other: 0, total: 0 }
      }
      const cat = classifyAlertType(r.type)
      months[key][cat] = (months[key][cat] || 0) + 1
      months[key].total += 1
    })
    const monthly = Object.values(months).sort((a, b) => a.key.localeCompare(b.key))
    const max = Math.max(1, ...monthly.map((m) => m.total))
    return { total, done, open, urgent, watch, mild, rate: total ? Math.round((done / total) * 100) : 0, monthly, max }
  }, [records, t])

  return (
    <View style={styles.root}>
      <View style={styles.nav}>
        <Pressable onPress={onBack}><Text style={styles.back}>‹ {t("common.back")}</Text></Pressable>
        <Text style={styles.navTitle}>{t("stats.title")}</Text>
        <View style={{ width: 48 }} />
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.pine} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.pad}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load({ silent: true }) }} />}
        >
          <Text style={styles.h1}>{t("stats.analysis")}</Text>
          <View style={styles.row}>
            <View style={[styles.kpi, { backgroundColor: "#fff1f0" }]}>
              <Text style={styles.kpiN}>{stats.total}</Text>
              <Text style={styles.kpiL}>{t("stats.total")}</Text>
            </View>
            <View style={[styles.kpi, { backgroundColor: "#f6ffed" }]}>
              <Text style={styles.kpiN}>{stats.done}</Text>
              <Text style={styles.kpiL}>{t("stats.done")}</Text>
            </View>
            <View style={[styles.kpi, { backgroundColor: "#fff7e6" }]}>
              <Text style={styles.kpiN}>{stats.open}</Text>
              <Text style={styles.kpiL}>{t("stats.open")}</Text>
            </View>
          </View>
          <Text style={styles.section}>{t("stats.severity")}</Text>
          <View style={styles.row}>
            <View style={styles.sev}><Text style={[styles.sevN, { color: "#f5222d" }]}>{stats.urgent}</Text><Text style={styles.kpiL}>{t("stats.urgent")}</Text></View>
            <View style={styles.sev}><Text style={[styles.sevN, { color: "#fa8c16" }]}>{stats.watch}</Text><Text style={styles.kpiL}>{t("stats.watch")}</Text></View>
            <View style={styles.sev}><Text style={[styles.sevN, { color: colors.mint }]}>{stats.mild}</Text><Text style={styles.kpiL}>{t("stats.mild")}</Text></View>
          </View>
          <Text style={styles.section}>{t("stats.rate")}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${stats.rate}%` }]} />
          </View>
          <Text style={styles.rateTxt}>{stats.rate}% · {t("stats.rateN", { done: stats.done, total: stats.total })}</Text>
          <View style={styles.chartRow}>
            <Text style={styles.section}>{t("stats.trend")}</Text>
            <View style={styles.chips}>
              {["bar", "line", "pie"].map((id) => (
                <Pressable key={id} onPress={() => setChart(id)} style={[styles.chip, chart === id ? styles.chipOn : null]}>
                  <Text style={[styles.chipT, chart === id ? styles.chipTOn : null]}>{t(`stats.${id}`)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {stats.monthly.length === 0 ? (
            <Text style={styles.empty}>{t("stats.empty")}</Text>
          ) : chart === "pie" ? (
            stats.monthly.map((m) => (
              <Text key={m.key} style={styles.pieLine}>{m.label} · {t("stats.total")} {m.total}</Text>
            ))
          ) : (
            stats.monthly.map((m) => (
              <View key={m.key} style={styles.monthRow}>
                <Text style={styles.monthL}>{m.label}</Text>
                <View style={styles.monthTrack}>
                  <View style={[styles.monthFill, { width: `${(m.total / stats.max) * 100}%` }]} />
                </View>
                <Text style={styles.monthN}>{m.total}</Text>
              </View>
            ))
          )}
          <View style={styles.legend}>
            <Text style={styles.leg}>{t("stats.cat.fall")}</Text>
            <Text style={styles.leg}>{t("stats.cat.health")}</Text>
            <Text style={styles.leg}>{t("stats.cat.other")}</Text>
          </View>
        </ScrollView>
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
  pad: { padding: 16, paddingBottom: 40 },
  h1: { fontSize: 22, fontWeight: "800", marginBottom: 12 },
  row: { flexDirection: "row", gap: 8 },
  kpi: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  kpiN: { fontSize: 22, fontWeight: "800", color: "#111827" },
  kpiL: { marginTop: 4, fontSize: 12, color: "#6b7280", fontWeight: "700" },
  section: { marginTop: 18, marginBottom: 8, fontSize: 15, fontWeight: "800" },
  sev: { flex: 1, backgroundColor: "#fff", borderRadius: 12, padding: 12, alignItems: "center" },
  sevN: { fontSize: 22, fontWeight: "800" },
  barTrack: { height: 10, backgroundColor: "#e5e7eb", borderRadius: 6, overflow: "hidden" },
  barFill: { height: 10, backgroundColor: colors.mint },
  rateTxt: { marginTop: 6, color: colors.pine, fontWeight: "700" },
  chartRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chips: { flexDirection: "row", gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.mintSoft },
  chipT: { fontSize: 12, color: "#6b7280", fontWeight: "700" },
  chipTOn: { color: colors.pine },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 20 },
  monthRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  monthL: { width: 36, fontWeight: "700", color: "#374151" },
  monthTrack: { flex: 1, height: 14, backgroundColor: "#e5e7eb", borderRadius: 8, overflow: "hidden" },
  monthFill: { height: 14, backgroundColor: "#8c8c8c" },
  monthN: { width: 28, textAlign: "right", fontWeight: "700" },
  pieLine: { marginBottom: 6, fontWeight: "600", color: "#374151" },
  legend: { marginTop: 12, gap: 4 },
  leg: { fontSize: 12, color: "#6b7280" }
})
