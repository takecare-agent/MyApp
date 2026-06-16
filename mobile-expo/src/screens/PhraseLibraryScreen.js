import { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { apiRequest } from "../lib/api"

const LANG_OPTIONS = [
  { code: "zh", label: "中文" },
  { code: "en", label: "English" },
  { code: "id", label: "印尼文 (Bahasa)" },
  { code: "vi", label: "越南文 (Tiếng Việt)" },
  { code: "tl", label: "菲律賓文 (Filipino)" },
  { code: "th", label: "泰文 (ภาษาไทย)" }
]

const SYSTEM_PHRASES = [
  { text: "你還好嗎？" },
  { text: "需要幫忙嗎？" },
  { text: "該吃藥了。" },
  { text: "慢慢來，不急。" },
  { text: "我在這裡陪你。" },
  { text: "哪裡不舒服？" },
  { text: "請做深呼吸。" },
  { text: "放輕鬆，我幫你。" }
]

export default function PhraseLibraryScreen({ apiBaseUrl, token, onBack }) {
  const [myLang, setMyLang] = useState("zh")
  const [savingLang, setSavingLang] = useState(false)
  const [langMsg, setLangMsg] = useState("")

  const [phrases, setPhrases] = useState([])
  const [loadingPhrases, setLoadingPhrases] = useState(false)
  const [newPhraseText, setNewPhraseText] = useState("")
  const [saving, setSaving] = useState(false)
  const [phraseMsg, setPhraseMsg] = useState("")

  const [translateInput, setTranslateInput] = useState("")
  const [translateTarget, setTranslateTarget] = useState("id")
  const [translatedResult, setTranslatedResult] = useState("")
  const [translating, setTranslating] = useState(false)

  const [dangerLogs, setDangerLogs] = useState([])
  const [loadingDanger, setLoadingDanger] = useState(false)

  // ── 載入自訂語句 ──
  const loadPhrases = useCallback(async () => {
    setLoadingPhrases(true)
    try {
      const data = await apiRequest({ apiBaseUrl, path: "/custom-phrases", token })
      setPhrases(Array.isArray(data) ? data : [])
    } catch { /* 靜默失敗 */ }
    finally { setLoadingPhrases(false) }
  }, [apiBaseUrl, token])

  // ── 載入危險語句記錄 ──
  const loadDangerLogs = useCallback(async () => {
    setLoadingDanger(true)
    try {
      const data = await apiRequest({ apiBaseUrl, path: "/danger-logs", token })
      setDangerLogs(Array.isArray(data) ? data : [])
    } catch { /* 靜默失敗 */ }
    finally { setLoadingDanger(false) }
  }, [apiBaseUrl, token])

  useEffect(() => {
    loadPhrases()
    loadDangerLogs()
  }, [loadPhrases, loadDangerLogs])

  // ── 儲存語言設定 ──
  const handleSaveLang = async () => {
    setSavingLang(true); setLangMsg("")
    try {
      const data = await apiRequest({
        apiBaseUrl, path: "/update-lang", method: "PATCH", token, body: { lang: myLang }
      })
      setLangMsg(data.success ? "語言設定已儲存 ✓" : "儲存失敗")
    } catch { setLangMsg("儲存失敗") }
    finally { setSavingLang(false) }
  }

  // ── 新增語句 ──
  const handleAddPhrase = async () => {
    if (!newPhraseText.trim()) return
    setSaving(true); setPhraseMsg("")
    try {
      const data = await apiRequest({
        apiBaseUrl, path: "/custom-phrases", method: "POST", token,
        body: { text: newPhraseText.trim() }
      })
      if (data.success) {
        setNewPhraseText("")
        setPhraseMsg("語句已新增 ✓")
        await loadPhrases()
      } else {
        setPhraseMsg("新增失敗")
      }
    } catch { setPhraseMsg("新增失敗") }
    finally { setSaving(false) }
  }

  // ── 刪除語句 ──
  const handleDeletePhrase = async (id) => {
    try {
      await apiRequest({ apiBaseUrl, path: `/custom-phrases/${id}`, method: "DELETE", token })
      await loadPhrases()
    } catch { /* 靜默失敗 */ }
  }

  // ── 翻譯語句 ──
  const handleTranslate = async () => {
    if (!translateInput.trim()) return
    setTranslating(true); setTranslatedResult("")
    try {
      const data = await apiRequest({
        apiBaseUrl, path: "/translate", method: "POST", token,
        body: { text: translateInput.trim(), targetLang: translateTarget }
      })
      setTranslatedResult(data.translatedText || "")
    } catch { setTranslatedResult("翻譯失敗") }
    finally { setTranslating(false) }
  }

  // ── 追蹤危險語句 ──
  const trackPhrase = async (text) => {
    try {
      const data = await apiRequest({
        apiBaseUrl, path: "/track-phrase", method: "POST", token, body: { phrase: text }
      })
      if (data.isDangerous) loadDangerLogs()
    } catch { /* 靜默失敗 */ }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.backText}>返回</Text>
        </Pressable>
        <Text style={styles.title}>關懷語句庫</Text>
        <Text style={styles.subtitle}>自訂語句、翻譯工具與危險警示</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>

        {/* ── 語言設定 ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>我的語言</Text>
          <View style={styles.langRow}>
            {LANG_OPTIONS.map(l => (
              <Pressable
                key={l.code}
                style={[styles.langChip, myLang === l.code && styles.langChipActive]}
                onPress={() => setMyLang(l.code)}
              >
                <Text style={[styles.langChipText, myLang === l.code && styles.langChipTextActive]}>
                  {l.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.primaryBtn} onPress={handleSaveLang} disabled={savingLang}>
            <Text style={styles.primaryBtnText}>{savingLang ? "儲存中..." : "儲存語言設定"}</Text>
          </Pressable>
          {langMsg ? <Text style={styles.successText}>{langMsg}</Text> : null}
        </View>

        {/* ── 自訂語句庫 ── */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>我的自訂語句</Text>
            <Pressable style={styles.refreshBtn} onPress={loadPhrases} disabled={loadingPhrases}>
              <Text style={styles.refreshBtnText}>{loadingPhrases ? "載入中" : "重新整理"}</Text>
            </Pressable>
          </View>

          {loadingPhrases
            ? <ActivityIndicator color="#1f74d1" />
            : phrases.length === 0
              ? <Text style={styles.emptyText}>尚未新增自訂語句</Text>
              : phrases.map(p => (
                <View key={p.id} style={styles.phraseRow}>
                  <Pressable
                    style={styles.phraseContent}
                    onPress={() => { setTranslateInput(p.text); trackPhrase(p.text) }}
                  >
                    <Text style={styles.phrasePrimary}>{p.text}</Text>
                    <Text style={styles.phraseHint}>點擊填入翻譯工具</Text>
                  </Pressable>
                  <Pressable style={styles.deleteBtn} onPress={() => handleDeletePhrase(p.id)}>
                    <Text style={styles.deleteBtnText}>刪除</Text>
                  </Pressable>
                </View>
              ))
          }

          <Text style={styles.label}>新增語句</Text>
          <TextInput
            style={styles.textArea}
            value={newPhraseText}
            onChangeText={setNewPhraseText}
            placeholder="輸入希望新增的關懷語句..."
            multiline
            numberOfLines={3}
          />
          <View style={styles.actions}>
            <Pressable
              style={[styles.primaryBtn, { flex: 1 }]}
              onPress={handleAddPhrase}
              disabled={saving || !newPhraseText.trim()}
            >
              <Text style={styles.primaryBtnText}>{saving ? "儲存中..." : "儲存語句"}</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, { flex: 1 }]}
              onPress={() => setNewPhraseText("")}
            >
              <Text style={styles.secondaryBtnText}>清除</Text>
            </Pressable>
          </View>
          {phraseMsg ? <Text style={styles.successText}>{phraseMsg}</Text> : null}
        </View>

        {/* ── 系統預設語句 ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>預設照護語句</Text>
          <Text style={styles.hint}>點擊填入翻譯工具，或直接追蹤</Text>
          {SYSTEM_PHRASES.map((p, i) => (
            <Pressable
              key={i}
              style={styles.phraseCard}
              onPress={() => { setTranslateInput(p.text); trackPhrase(p.text) }}
            >
              <Text style={styles.phrasePrimary}>{p.text}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── 翻譯工具 ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>翻譯工具</Text>
          <Text style={styles.hint}>語氣柔化 + 多語翻譯（Gemini AI）</Text>
          <Text style={styles.label}>語句內容</Text>
          <TextInput
            style={styles.textArea}
            value={translateInput}
            onChangeText={setTranslateInput}
            placeholder="輸入要翻譯的語句..."
            multiline
            numberOfLines={3}
          />
          <Text style={styles.label}>翻譯目標語言</Text>
          <View style={styles.langRow}>
            {LANG_OPTIONS.map(l => (
              <Pressable
                key={l.code}
                style={[styles.langChip, translateTarget === l.code && styles.langChipActive]}
                onPress={() => setTranslateTarget(l.code)}
              >
                <Text style={[styles.langChipText, translateTarget === l.code && styles.langChipTextActive]}>
                  {l.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={styles.primaryBtn}
            onPress={handleTranslate}
            disabled={translating || !translateInput.trim()}
          >
            <Text style={styles.primaryBtnText}>{translating ? "翻譯中..." : "翻譯語句"}</Text>
          </Pressable>
          {translatedResult ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultText}>{translatedResult}</Text>
            </View>
          ) : null}
        </View>

        {/* ── 危險語句記錄 ── */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>危險語句警示</Text>
            <Pressable style={styles.refreshBtn} onPress={loadDangerLogs} disabled={loadingDanger}>
              <Text style={styles.refreshBtnText}>{loadingDanger ? "載入中" : "重新整理"}</Text>
            </Pressable>
          </View>
          {dangerLogs.length === 0
            ? <Text style={styles.emptyText}>近期無危險語句</Text>
            : dangerLogs.map((log, i) => (
              <View key={i} style={styles.dangerCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.dangerText}>{log.phrase}</Text>
                  <View style={styles.dangerBadge}><Text style={styles.dangerBadgeText}>危險</Text></View>
                </View>
                <Text style={styles.hint}>{log.senderName || log.senderEmail} · {log.time}</Text>
              </View>
            ))
          }
        </View>

      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f2f7ff" },
  header: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#d8e6ff",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14
  },
  backText: { color: "#8b5cf6", fontWeight: "900" },
  title: { marginTop: 8, color: "#11355c", fontSize: 22, fontWeight: "900" },
  subtitle: { marginTop: 4, color: "#526b88", lineHeight: 20 },
  container: { padding: 16, gap: 12, paddingBottom: 28 },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8e6ff",
    borderRadius: 12,
    padding: 14,
    gap: 8
  },
  sectionTitle: { color: "#173e67", fontSize: 17, fontWeight: "900" },
  hint: { color: "#6a7e99", fontSize: 12 },
  label: { color: "#244569", fontWeight: "800", marginTop: 4 },
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  langChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#c7d8ed",
    backgroundColor: "#fff"
  },
  langChipActive: { backgroundColor: "#8b5cf6", borderColor: "#8b5cf6" },
  langChipText: { color: "#1f507f", fontSize: 12, fontWeight: "700" },
  langChipTextActive: { color: "#fff" },
  textArea: {
    borderWidth: 1,
    borderColor: "#c8d8ee",
    borderRadius: 10,
    backgroundColor: "#fbfdff",
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: "#173e67",
    minHeight: 72,
    textAlignVertical: "top"
  },
  phraseRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#e5eef9",
    borderRadius: 8,
    overflow: "hidden"
  },
  phraseContent: { flex: 1, padding: 10, backgroundColor: "#f8faff" },
  phraseCard: {
    borderWidth: 1,
    borderColor: "#e5eef9",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f8faff"
  },
  phrasePrimary: { color: "#173e67", fontWeight: "800", fontSize: 14 },
  phraseHint: { color: "#6a7e99", fontSize: 11, marginTop: 2 },
  deleteBtn: {
    backgroundColor: "#fee2e2",
    paddingHorizontal: 12,
    justifyContent: "center"
  },
  deleteBtnText: { color: "#dc2626", fontWeight: "900", fontSize: 13 },
  resultBox: {
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 8,
    padding: 12
  },
  resultText: { color: "#065f46", fontSize: 15, lineHeight: 22 },
  dangerCard: {
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fff5f5",
    gap: 4
  },
  dangerText: { color: "#7f1d1d", fontWeight: "800", fontSize: 14, flex: 1 },
  dangerBadge: {
    backgroundColor: "#fee2e2",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  dangerBadgeText: { color: "#dc2626", fontSize: 11, fontWeight: "800" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  primaryBtn: {
    backgroundColor: "#8b5cf6",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
  secondaryBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#c7d8ed",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center"
  },
  secondaryBtnText: { color: "#8b5cf6", fontWeight: "900" },
  refreshBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#c7d8ed",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  refreshBtnText: { color: "#1f507f", fontSize: 12, fontWeight: "800" },
  successText: { color: "#067647", fontWeight: "800" },
  emptyText: { color: "#6a7e99", fontSize: 13, paddingVertical: 6 }
})
