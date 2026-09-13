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
import TranslatedUgcText from "../components/TranslatedUgcText"
import CareCircleSearch from "../components/CareCircleSearch"
import { apiRequest } from "../lib/api"
import { formatCareDailyAt } from "../lib/careDailyPresets"
import {
  CARE_DAILY_CAT_DEFS,
  careDailyCatLabel,
  careDailyContentPresetOptions,
  toCareDailyCatCode
} from "../lib/contentLabels"
import { resolveCarePresetKey } from "../lib/presetResolve"
import { usePollingRefresh } from "../lib/usePollingRefresh"
import { useI18n } from "../i18n/I18nContext"
import { colors } from "./new_ui/tokens"
import { NeoIcon } from "./new_ui/NeoIcons"
import { ensureFilled, screenshotDailyRecords } from "./new_ui/screenshotFill"

function listPath(role) {
  if (role === "caregiver") return "/caregiver/care-daily-records"
  if (role === "family") return "/family/care-daily-records"
  return "/patient/care-daily-records"
}

function writeBase(role) {
  return role === "patient" ? "/patient/care-daily-records" : "/caregiver/care-daily-records"
}

function presetBase(role) {
  return role === "patient" ? "/patient/care-daily-presets" : "/caregiver/care-daily-presets"
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
  const [presets, setPresets] = useState([])
  const [addingPreset, setAddingPreset] = useState(false)
  const [removingPreset, setRemovingPreset] = useState(false)

  const catFieldValue = careDailyCatLabel(category, t)

  const catOptions = useMemo(() => {
    const hidden = new Set(
      presets.filter((p) => p.source === "care-daily-cat-hidden").map((p) => p.content)
    )
    const customRows = presets.filter((p) => p.source === "care-daily-cat")
    const customValues = new Set(customRows.map((p) => p.content))
    const builtin = CARE_DAILY_CAT_DEFS
      .map((d) => ({
        value: careDailyCatLabel(d.code, t),
        kind: "builtin",
        deletable: true,
        scope: "cat"
      }))
      .filter((o) => !hidden.has(o.value) && !customValues.has(o.value))
    const customs = customRows.map((p) => ({
      value: p.content,
      id: p._id,
      kind: "custom",
      deletable: true,
      scope: "cat"
    }))
    return [...builtin, ...customs]
  }, [presets, t])

  const contentOptions = useMemo(() => {
    const key = `daily:${toCareDailyCatCode(category)}`
    const hidden = new Set(
      presets
        .filter((p) => p.source === "care-daily-hidden" && p.category === key)
        .map((p) => p.content)
    )
    const customRows = presets.filter(
      (p) => p.source === "care-daily-custom" && p.category === key
    )
    const customValues = new Set(customRows.map((p) => p.content))
    const builtIn = careDailyContentPresetOptions(category, t)
      .map((p) => p.value)
      .filter((c) => !hidden.has(c) && !customValues.has(c))
      .map((c) => ({ value: c, kind: "builtin", deletable: true, scope: "content" }))
    const customs = customRows.map((p) => ({
      value: p.content,
      id: p._id,
      kind: "custom",
      deletable: true,
      scope: "content"
    }))
    return [...builtIn, ...customs]
  }, [category, presets, t])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setError("")
    try {
      const reqs = [
        apiRequest({
          apiBaseUrl,
          path: `${listPath(role)}?limit=80`,
          token
        })
      ]
      if (role === "caregiver" || role === "patient") {
        reqs.push(apiRequest({ apiBaseUrl, path: presetBase(role), token }))
      }
      const [data, presetData] = await Promise.all(reqs)
      setRecords(ensureFilled(Array.isArray(data?.records) ? data.records : [], screenshotDailyRecords, 2))
      setPresets(Array.isArray(presetData?.records) ? presetData.records : [])
      if (!silent) setError("")
    } catch (err) {
      if (!silent) setError(err.message || t("common.loadFailed"))
      setRecords(ensureFilled([], screenshotDailyRecords, 2))
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

  const applyCategoryText = (text) => {
    const v = String(text || "").trim()
    const hit = CARE_DAILY_CAT_DEFS.find(
      (d) => careDailyCatLabel(d.code, t) === v || d.code === v || d.zh === v
    )
    const next = hit ? hit.code : v
    if (next !== category) setContent("")
    setCategory(next || (role === "patient" ? "mood" : "meal"))
  }

  const handleAddPreset = async (scope) => {
    const text = String(scope === "cat" ? catFieldValue : content).trim()
    if (!text) {
      Alert.alert(t("common.hint"), t("reminders.needContentField"))
      return
    }
    setAddingPreset(true)
    try {
      await apiRequest({
        apiBaseUrl,
        path: presetBase(role),
        method: "POST",
        token,
        body: {
          scope,
          category,
          content: text
        }
      })
      await load({ silent: true })
    } catch (err) {
      Alert.alert(t("common.error"), err.message || t("reminders.addPresetFail"))
    } finally {
      setAddingPreset(false)
    }
  }

  const handleRemovePreset = async (opt) => {
    const scope = opt.scope === "cat" ? "cat" : "content"
    setRemovingPreset(true)
    try {
      if (opt.kind === "custom" && opt.id) {
        await apiRequest({
          apiBaseUrl,
          path: `${presetBase(role)}/${encodeURIComponent(opt.id)}`,
          method: "DELETE",
          token
        })
      } else {
        await apiRequest({
          apiBaseUrl,
          path: presetBase(role),
          method: "POST",
          token,
          body: {
            scope,
            category,
            content: opt.value,
            hidden: true
          }
        })
      }
      if (scope === "cat" && catFieldValue === opt.value) {
        applyCategoryText(role === "patient" ? "mood" : "meal")
      }
      if (scope === "content" && content === opt.value) setContent("")
      await load({ silent: true })
    } catch (err) {
      Alert.alert(t("common.error"), err.message || t("reminders.removePresetFail"))
    } finally {
      setRemovingPreset(false)
    }
  }

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.badge}>
          <NeoIcon name="clock" size={12} color={colors.mint} />
          <Text style={styles.badgeText}>{formatCareDailyAt(item.recordedAt || item.createdAt)}</Text>
        </View>
        {item.caregiverName ? (
          <View style={styles.caregiverPill}>
            <NeoIcon name="user" size={12} color="#FFFFFF" />
            <Text style={styles.caregiver} numberOfLines={1}>{item.caregiverName}</Text>
          </View>
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
        numberOfLines={1}
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
            <View style={styles.obsIconRow}>
              <NeoIcon name="moon" size={14} color={colors.mint} />
              <TranslatedUgcText
                text={item.sleep}
                sourceLang={item.sourceLang}
                apiBaseUrl={apiBaseUrl}
                token={token}
                style={styles.obsLine}
                notePrefix={`${t("daily.sleep")}：`}
              />
            </View>
          ) : null}
          {item.bloodPressure ? (
            <View style={styles.obsIconRow}>
              <NeoIcon name="activity" size={14} color={colors.mint} />
              <Text style={styles.obsLine}>{`${t("daily.bp")}：${item.bloodPressure}`}</Text>
            </View>
          ) : null}
          {item.heartRate ? (
            <View style={styles.obsIconRow}>
              <NeoIcon name="heart" size={14} color={colors.mint} />
              <Text style={styles.obsLine}>{`${t("daily.hr")}：${item.heartRate}`}</Text>
            </View>
          ) : null}
          {item.temperature ? (
            <View style={styles.obsIconRow}>
              <NeoIcon name="thermometer" size={14} color={colors.mint} />
              <Text style={styles.obsLine}>{`${t("daily.temp")}：${item.temperature}`}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {role === "caregiver" || (role === "patient" && item.createdByRole === "patient") ? (
        <View style={styles.cardActions}>
          <Pressable style={styles.editBtn} onPress={() => startEdit(item)}>
            <NeoIcon name="edit-3" size={13} color="#10B981" />
            <Text style={styles.editText}>{t("daily.editNote")}</Text>
          </Pressable>
          <Pressable style={styles.delBtn} onPress={() => handleDelete(item)}>
            <NeoIcon name="trash-2" size={13} color="#FF4D4D" />
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
            <Text style={[styles.tabText, tab === "list" ? styles.tabTextOn : null]}>
              {t("daily.tabList")}
            </Text>
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
          <View style={styles.formCard}>
          <ComboboxField
            label={t("reminders.category")}
            leftIcon="tag"
            value={catFieldValue}
            onChangeText={applyCategoryText}
            options={catOptions}
            placeholder=""
            emptyText={t("reminders.emptyPreset")}
            onAddCurrent={canWrite ? () => handleAddPreset("cat") : undefined}
            onRemoveOption={canWrite ? handleRemovePreset : undefined}
            adding={addingPreset}
            removing={removingPreset}
          />
          <ComboboxField
            label={t("reminders.content")}
            leftIcon="file-text"
            value={content}
            onChangeText={setContent}
            options={contentOptions}
            placeholder=""
            emptyText={t("reminders.emptyPreset")}
            onAddCurrent={canWrite ? () => handleAddPreset("content") : undefined}
            onRemoveOption={canWrite ? handleRemovePreset : undefined}
            adding={addingPreset}
            removing={removingPreset}
          />
          <Text style={styles.label}>{t("reminders.noteOptional")}</Text>
          <View style={styles.noteRow}>
            <NeoIcon name="edit-3" size={18} glow style={styles.noteIcon} />
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              multiline
              textAlignVertical="top"
            />
          </View>
          </View>
          {role === "caregiver" ? (
          <View style={styles.obsCard}>
          <View style={styles.obsHead}>
            <NeoIcon name="eye" size={18} glow />
            <Text style={styles.section} numberOfLines={1}>
              {t("daily.obsSection")}
            </Text>
          </View>
          <View style={styles.obsLabelRow}>
            <NeoIcon name="moon" size={16} glow />
            <Text style={styles.obsLabel} numberOfLines={1}>{t("daily.sleep")}</Text>
          </View>
          <TextInput
            style={styles.obsInput}
            value={obs.sleep}
            onChangeText={(v) => setObs((prev) => ({ ...prev, sleep: v }))}
          />
          <View style={styles.obsLabelRow}>
            <NeoIcon name="activity" size={16} glow />
            <Text style={styles.obsLabel} numberOfLines={1}>{t("daily.bp")}</Text>
          </View>
          <TextInput
            style={styles.obsInput}
            value={obs.bloodPressure}
            onChangeText={(v) => setObs((prev) => ({ ...prev, bloodPressure: v }))}
          />
          <View style={styles.obsLabelRow}>
            <NeoIcon name="heart" size={16} glow />
            <Text style={styles.obsLabel} numberOfLines={1}>{t("daily.hr")}</Text>
          </View>
          <TextInput
            style={styles.obsInput}
            value={obs.heartRate}
            onChangeText={(v) => setObs((prev) => ({ ...prev, heartRate: v }))}
            keyboardType="numeric"
          />
          <View style={styles.obsLabelRow}>
            <NeoIcon name="thermometer" size={16} glow />
            <Text style={styles.obsLabel} numberOfLines={1}>{t("daily.temp")}</Text>
          </View>
          <TextInput
            style={styles.obsInput}
            value={obs.temperature}
            onChangeText={(v) => setObs((prev) => ({ ...prev, temperature: v }))}
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
              <ActivityIndicator color="#0D0F11" />
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mint} />}
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
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabOn: { borderBottomWidth: 2, borderBottomColor: "#10B981" },
  tabText: { fontSize: 15, color: colors.textMuted, fontWeight: "600" },
  tabTextOn: { color: "#10B981" },
  readonlyHead: {
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  readonlyTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  readonlySub: { marginTop: 4, fontSize: 13, color: colors.textMuted },
  formPad: { padding: 16, paddingBottom: 40 },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14
  },
  label: { fontSize: 14, fontWeight: "700", color: colors.textMuted, marginTop: 12, marginBottom: 8 },
  section: { flex: 1, fontSize: 15, fontWeight: "800", color: colors.mint },
  obsHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, marginBottom: 8 },
  obsCard: {
    marginTop: 20,
    padding: 14,
    borderRadius: 24,
    borderCurve: "continuous",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "#10B981"
  },
  obsLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    marginBottom: 8
  },
  obsLabel: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.text },
  obsInput: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  noteIcon: { marginTop: 2 },
  noteInput: {
    flex: 1,
    minHeight: 64,
    padding: 0,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.bg,
    paddingHorizontal: 12
  },
  lineInput: {
    flex: 1,
    height: 44,
    padding: 0,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text
  },
  cancelEdit: { alignSelf: "flex-start", marginBottom: 8, paddingVertical: 4 },
  cancelEditText: { color: colors.mint, fontWeight: "700" },
  saveBtn: {
    marginTop: 20,
    backgroundColor: colors.pine,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center"
  },
  saveDisabled: { opacity: 0.6 },
  saveText: { color: "#0D0F11", fontWeight: "800", fontSize: 16 },
  listPad: { padding: 16, paddingBottom: 40 },
  count: { marginBottom: 10, color: "#10B981", fontWeight: "600" },
  error: { color: "#E05A47", marginBottom: 10 },
  empty: { textAlign: "center", marginTop: 48, color: colors.textMuted, fontSize: 15 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderCurve: "continuous",
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.mintSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  badgeText: {
    color: colors.mint,
    fontSize: 12,
    fontWeight: "700"
  },
  caregiverPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#2A2D32",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: "48%"
  },
  caregiver: { fontSize: 12, color: "#FFFFFF", fontWeight: "600" },
  obsIconRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cat: { fontSize: 13, fontWeight: "700", color: colors.textMuted, marginBottom: 4 },
  content: { fontSize: 16, fontWeight: "700", color: colors.text },
  note: { marginTop: 6, fontSize: 13, color: colors.textMuted, fontWeight: "600", lineHeight: 18 },
  obsBox: { marginTop: 8, gap: 4 },
  obsLine: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 8,
    gap: 12
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(16,185,129,0.12)",
    borderWidth: 1,
    borderColor: "#10B981",
    borderRadius: 999
  },
  editText: { color: "#10B981", fontWeight: "800", fontSize: 14 },
  delBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,77,77,0.12)",
    borderWidth: 1,
    borderColor: "#FF4D4D",
    borderRadius: 999
  },
  delText: { color: "#FF4D4D", fontWeight: "700", fontSize: 13 }
})
