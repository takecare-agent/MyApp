import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import ComboboxField from "../components/ComboboxField"
import DropdownField from "../components/DropdownField"
import TranslatedUgcText from "../components/TranslatedUgcText"
import CareCircleSearch from "../components/CareCircleSearch"
import { apiRequest } from "../lib/api"
import { formatCareDailyAt } from "../lib/careDailyPresets"
import {
  careDailyCatLabel,
  careDailyCategoryOptions,
  careDailyContentPresetOptions,
  toCareDailyCatCode
} from "../lib/contentLabels"
import { resolveCarePresetKey } from "../lib/presetResolve"
import { usePollingRefresh } from "../lib/usePollingRefresh"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "./new_ui/tokens"

function listPath(role) {
  if (role === "caregiver") return "/caregiver/care-daily-records"
  if (role === "family") return "/family/care-daily-records"
  return "/patient/care-daily-records"
}

function writeBase(role) {
  return role === "patient" ? "/patient/care-daily-records" : "/caregiver/care-daily-records"
}

function emptyObs() {
  return { sleep: "", bloodPressure: "", heartRate: "", temperature: "" }
}

function hasObs(item) {
  return Boolean(item?.sleep || item?.bloodPressure || item?.heartRate || item?.temperature)
}

/**
 * 日常照護紀錄
 * - caregiver／patient：可新增／編輯／列表（長輩只能改自己寫的）
 * - family：唯讀列表
 */
export default function CareDailyRecordsScreen({
  apiBaseUrl,
  token,
  role = "caregiver",
  showSearch = false
}) {
  const { t, lang } = useI18n()
  const canWrite = role === "caregiver" || role === "patient"
  const [tab, setTab] = useState(canWrite ? "add" : "list")
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [category, setCategory] = useState(role === "patient" ? "mood" : "meal")
  const [content, setContent] = useState("")
  const [note, setNote] = useState("")
  const [obs, setObs] = useState(emptyObs)
  const [editingId, setEditingId] = useState("")

  const contentOptions = useMemo(
    () => careDailyContentPresetOptions(category, t).map((p) => p.value),
    [category, t]
  )

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setError("")
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: `${listPath(role)}?limit=80`,
        token
      })
      setRecords(Array.isArray(data?.records) ? data.records : [])
    } catch (err) {
      if (!silent) setError(err.message || t("common.loadFailed"))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [apiBaseUrl, role, token, t])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  usePollingRefresh(load, { intervalMs: 8000 })

  const onRefresh = async () => {
    setRefreshing(true)
    await load({ silent: true })
  }

  const resetForm = () => {
    setContent("")
    setNote("")
    setObs(emptyObs())
    setEditingId("")
  }

  const startEdit = (item) => {
    setCategory(toCareDailyCatCode(item.category || "meal"))
    setContent(item.content || "")
    setNote(item.note || "")
    setObs({
      sleep: item.sleep || "",
      bloodPressure: item.bloodPressure || "",
      heartRate: item.heartRate || "",
      temperature: item.temperature || ""
    })
    setEditingId(String(item._id))
    setTab("add")
  }

  const handleSave = async () => {
    const text = String(content || "").trim()
    if (!text) {
      Alert.alert(t("common.hint"), t("daily.needContent"))
      return
    }
    setSaving(true)
    try {
      const body = {
        category: toCareDailyCatCode(category),
        content: text,
        contentKey: resolveCarePresetKey({ text }) || "",
        note: String(note || "").trim(),
        sourceLang: lang,
        sleep: String(obs.sleep || "").trim(),
        bloodPressure: String(obs.bloodPressure || "").trim(),
        heartRate: String(obs.heartRate || "").trim(),
        temperature: String(obs.temperature || "").trim()
      }
      const wasEditing = Boolean(editingId)
      if (wasEditing) {
        await apiRequest({
          apiBaseUrl,
          path: `${writeBase(role)}/${editingId}`,
          method: "PATCH",
          token,
          body
        })
      } else {
        await apiRequest({
          apiBaseUrl,
          path: writeBase(role),
          method: "POST",
          token,
          body
        })
      }
      resetForm()
      setTab("list")
      await load({ silent: true })
      Alert.alert(t("daily.savedTitle"), wasEditing ? t("daily.updatedMsg") : t("daily.savedMsg"))
    } catch (err) {
      Alert.alert(t("common.error"), err.message || t("common.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (item) => {
    Alert.alert(t("daily.deleteTitle"), t("daily.deleteMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await apiRequest({
              apiBaseUrl,
              path: `${writeBase(role)}/${item._id}`,
              method: "DELETE",
              token
            })
            if (editingId === String(item._id)) resetForm()
            await load({ silent: true })
          } catch (err) {
            Alert.alert(t("common.error"), err.message || t("common.deleteFailed"))
          }
        }
      }
    ])
  }

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{formatCareDailyAt(item.recordedAt || item.createdAt)}</Text>
        </View>
        {item.caregiverName ? (
          <Text style={styles.caregiver}>{item.caregiverName}</Text>
        ) : null}
      </View>
      <Text style={styles.cat}>{careDailyCatLabel(item.category, t)}</Text>
      <TranslatedUgcText
        text={item.content}
        sourceLang={item.sourceLang}
        contentKey={item.contentKey}
        apiBaseUrl={apiBaseUrl}
        token={token}
        style={styles.content}
      />
      {item.note ? (
        <TranslatedUgcText
          text={item.note}
          sourceLang={item.sourceLang}
          apiBaseUrl={apiBaseUrl}
          token={token}
          style={styles.note}
          notePrefix={`${t("common.note")}：`}
        />
      ) : null}
      {hasObs(item) ? (
        <View style={styles.obsBox}>
          {item.sleep ? (
            <TranslatedUgcText
              text={item.sleep}
              sourceLang={item.sourceLang}
              apiBaseUrl={apiBaseUrl}
              token={token}
              style={styles.obsLine}
              notePrefix={`${t("daily.sleep")}：`}
            />
          ) : null}
          {item.bloodPressure ? (
            <Text style={styles.obsLine}>{`${t("daily.bp")}：${item.bloodPressure}`}</Text>
          ) : null}
          {item.heartRate ? (
            <Text style={styles.obsLine}>{`${t("daily.hr")}：${item.heartRate}`}</Text>
          ) : null}
          {item.temperature ? (
            <Text style={styles.obsLine}>{`${t("daily.temp")}：${item.temperature}`}</Text>
          ) : null}
        </View>
      ) : null}
      {role === "caregiver" || (role === "patient" && item.createdByRole === "patient") ? (
        <View style={styles.cardActions}>
          <Pressable style={styles.editBtn} onPress={() => startEdit(item)}>
            <Text style={styles.editText}>{t("daily.editNote")}</Text>
          </Pressable>
          <Pressable style={styles.delBtn} onPress={() => handleDelete(item)}>
            <Text style={styles.delText}>{t("common.delete")}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )

  return (
    <View style={styles.container}>
      {showSearch ? (
        <CareCircleSearch apiBaseUrl={apiBaseUrl} token={token} role={role} />
      ) : null}
      {canWrite ? (
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tab, tab === "add" ? styles.tabOn : null]}
            onPress={() => setTab("add")}
          >
            <Text style={[styles.tabText, tab === "add" ? styles.tabTextOn : null]}>
              {editingId ? t("daily.edit") : t("daily.tabAdd")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, tab === "list" ? styles.tabOn : null]}
            onPress={() => setTab("list")}
          >
            <Text style={[styles.tabText, tab === "list" ? styles.tabTextOn : null]}>{t("daily.tabList")}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.readonlyHead}>
          <Text style={styles.readonlyTitle}>{t("daily.title")}</Text>
          <Text style={styles.readonlySub}>{t("daily.subtitle")}</Text>
        </View>
      )}

      {tab === "add" && canWrite ? (
        <ScrollView contentContainerStyle={styles.formPad} keyboardShouldPersistTaps="handled">
          {editingId ? (
            <Pressable style={styles.cancelEdit} onPress={resetForm}>
              <Text style={styles.cancelEditText}>{t("daily.cancelEdit")}</Text>
            </Pressable>
          ) : null}
          <DropdownField
            label={t("reminders.category")}
            value={toCareDailyCatCode(category)}
            options={careDailyCategoryOptions(t)}
            onSelect={(c) => {
              setCategory(c)
              setContent("")
            }}
          />
          <ComboboxField
            label={t("reminders.content")}
            value={content}
            onChangeText={setContent}
            options={contentOptions}
            placeholder={t("reminders.contentPlaceholder")}
            emptyText={t("reminders.emptyPreset")}
          />
          <Text style={styles.label}>{t("reminders.noteOptional")}</Text>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder={t("daily.notePlaceholder")}
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
          />
          {role === "caregiver" ? (
          <View style={styles.obsCard}>
          <Text style={styles.section}>{t("daily.obsSection")}</Text>
          <Text style={styles.label}>{t("daily.sleep")}</Text>
          <TextInput
            style={styles.lineInput}
            value={obs.sleep}
            onChangeText={(v) => setObs((prev) => ({ ...prev, sleep: v }))}
            placeholder={t("daily.sleepPh")}
            placeholderTextColor="#9ca3af"
          />
          <Text style={styles.label}>{t("daily.bp")}</Text>
          <TextInput
            style={styles.lineInput}
            value={obs.bloodPressure}
            onChangeText={(v) => setObs((prev) => ({ ...prev, bloodPressure: v }))}
            placeholder={t("daily.bpPh")}
            placeholderTextColor="#9ca3af"
          />
          <Text style={styles.label}>{t("daily.hr")}</Text>
          <TextInput
            style={styles.lineInput}
            value={obs.heartRate}
            onChangeText={(v) => setObs((prev) => ({ ...prev, heartRate: v }))}
            placeholder={t("daily.hrPh")}
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
          />
          <Text style={styles.label}>{t("daily.temp")}</Text>
          <TextInput
            style={styles.lineInput}
            value={obs.temperature}
            onChangeText={(v) => setObs((prev) => ({ ...prev, temperature: v }))}
            placeholder={t("daily.tempPh")}
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
          />
          </View>
          ) : null}
          <Pressable
            style={[styles.saveBtn, saving ? styles.saveDisabled : null]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>{editingId ? t("daily.saveEdit") : t("daily.saveBtn")}</Text>
            )}
          </Pressable>
        </ScrollView>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.pine} />
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listPad}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            error ? <Text style={styles.error}>{error}</Text> : (
              <Text style={styles.count}>{t("daily.count", { n: records.length })}</Text>
            )
          }
          ListEmptyComponent={<Text style={styles.empty}>{t("daily.empty")}</Text>}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb"
  },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabOn: { borderBottomWidth: 2, borderBottomColor: colors.mint },
  tabText: { fontSize: 15, color: "#6b7280", fontWeight: "600" },
  tabTextOn: { color: colors.pine },
  readonlyHead: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb"
  },
  readonlyTitle: { fontSize: 17, fontWeight: "800", color: "#111827" },
  readonlySub: { marginTop: 4, fontSize: 13, color: "#6b7280" },
  formPad: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: "700", color: "#374151", marginTop: 12, marginBottom: 8 },
  section: { fontSize: 15, fontWeight: "800", color: "#111827", marginTop: 4 },
  obsCard: {
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#f6ffed",
    borderWidth: 1,
    borderColor: "#b7eb8f"
  },
  noteInput: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "600",
    color: "#111827"
  },
  lineInput: {
    height: 44,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "600",
    color: "#111827"
  },
  cancelEdit: { alignSelf: "flex-start", marginBottom: 8, paddingVertical: 4 },
  cancelEditText: { color: colors.pine, fontWeight: "700" },
  saveBtn: {
    marginTop: 20,
    backgroundColor: colors.mint,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  saveDisabled: { opacity: 0.6 },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  listPad: { padding: 16, paddingBottom: 40 },
  count: { marginBottom: 10, color: "#6b7280", fontWeight: "600" },
  error: { color: "#dc2626", marginBottom: 10 },
  empty: { textAlign: "center", marginTop: 48, color: "#9ca3af", fontSize: 15 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  badge: {
    backgroundColor: "#f6ffed",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  badgeText: {
    color: colors.pine,
    fontSize: 12,
    fontWeight: "700"
  },
  caregiver: { fontSize: 12, color: "#6b7280", fontWeight: "600" },
  cat: { fontSize: 13, fontWeight: "700", color: "#6b7280", marginBottom: 4 },
  content: { fontSize: 16, fontWeight: "700", color: "#111827" },
  note: { marginTop: 6, fontSize: 13, color: "#6b7280", fontWeight: "600", lineHeight: 18 },
  obsBox: { marginTop: 8, gap: 4 },
  obsLine: { fontSize: 13, color: "#4b5563", fontWeight: "600" },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 8,
    gap: 12
  },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.mintSoft,
    borderRadius: 8
  },
  editText: { color: colors.pine, fontWeight: "800", fontSize: 14 },
  delBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  delText: { color: "#ef4444", fontWeight: "700", fontSize: 13 }
})
