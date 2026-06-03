import { useCallback, useEffect, useMemo, useState } from "react"
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

function levelColor(level) {
  const text = String(level || "").toLowerCase()
  if (text.includes("high") || text.includes("risk") || text.includes("critical")) {
    return "#b42318"
  }
  if (text.includes("medium") || text.includes("warning") || text.includes("elevated")) {
    return "#b54708"
  }
  return "#067647"
}

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString()
}

export default function BloodPressureScreen({
  role,
  apiBaseUrl,
  token,
  onBack
}) {
  const apiPrefix = role === "caregiver" ? "/caregiver" : "/patient"
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [form, setForm] = useState({ sys: "", dia: "", pulse: "" })

  const latest = useMemo(() => records[0] || null, [records])

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: `${apiPrefix}/blood-pressure/history?limit=30`,
        token
      })
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl, apiPrefix, token])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleRecord = async () => {
    if (!form.sys || !form.dia) {
      setError("SYS and DIA are required")
      return
    }

    setSaving(true)
    setMessage("")
    setError("")
    try {
      const payload = {
        sys: Number(form.sys),
        dia: Number(form.dia),
        pulse: form.pulse ? Number(form.pulse) : ""
      }
      const data = await apiRequest({
        apiBaseUrl,
        path: `${apiPrefix}/blood-pressure/record`,
        method: "POST",
        token,
        body: payload
      })
      setMessage(`Saved: ${data.record?.sys}/${data.record?.dia}`)
      setForm({ sys: "", dia: "", pulse: "" })
      await loadHistory()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setMessage("")
    setError("")
    try {
      const data = await apiRequest({
        apiBaseUrl,
        path: `${apiPrefix}/blood-pressure/sync`,
        method: "POST",
        token
      })
      setMessage(data.message || "Mock synced")
      await loadHistory()
    } catch (syncError) {
      setError(syncError.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerCard}>
        <Pressable onPress={onBack}>
          <Text style={styles.backText}>{"< Back"}</Text>
        </Pressable>
        <Text style={styles.title}>
          {role === "caregiver" ? "Caregiver" : "Patient"} Blood Pressure
        </Text>
        <Text style={styles.sub}>Record, sync mock data, and inspect history.</Text>
      </View>

      {latest ? (
        <View style={styles.latestCard}>
          <Text style={styles.latestTitle}>Latest</Text>
          <Text style={styles.latestValue}>
            {latest.sys}/{latest.dia} mmHg
          </Text>
          <Text style={[styles.level, { color: levelColor(latest.level) }]}>
            {latest.level || "-"}
          </Text>
        </View>
      ) : null}

      <View style={styles.formCard}>
        <Text style={styles.label}>SYS</Text>
        <TextInput
          style={styles.input}
          value={form.sys}
          onChangeText={value => setForm(prev => ({ ...prev, sys: value }))}
          keyboardType="numeric"
          placeholder="128"
        />

        <Text style={styles.label}>DIA</Text>
        <TextInput
          style={styles.input}
          value={form.dia}
          onChangeText={value => setForm(prev => ({ ...prev, dia: value }))}
          keyboardType="numeric"
          placeholder="82"
        />

        <Text style={styles.label}>Pulse (optional)</Text>
        <TextInput
          style={styles.input}
          value={form.pulse}
          onChangeText={value => setForm(prev => ({ ...prev, pulse: value }))}
          keyboardType="numeric"
          placeholder="76"
        />

        <View style={styles.buttonRow}>
          <Pressable style={styles.buttonPrimary} onPress={handleRecord} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonPrimaryText}>Save</Text>
            )}
          </Pressable>
          <Pressable style={styles.buttonSecondary} onPress={handleSync} disabled={syncing}>
            {syncing ? (
              <ActivityIndicator color="#1f74d1" />
            ) : (
              <Text style={styles.buttonSecondaryText}>Sync Mock</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.buttonSecondary}
            onPress={loadHistory}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#1f74d1" />
            ) : (
              <Text style={styles.buttonSecondaryText}>Refresh</Text>
            )}
          </Pressable>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.historyCard}>
        <Text style={styles.historyTitle}>History</Text>
        {records.length === 0 ? (
          <Text style={styles.empty}>No records yet.</Text>
        ) : (
          records.map(item => (
            <View key={item._id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowMain}>
                  {item.sys}/{item.dia} mmHg
                </Text>
                <Text style={styles.rowSub}>{formatDateTime(item.measuredAt)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.level, { color: levelColor(item.level) }]}>
                  {item.level || "-"}
                </Text>
                <Text style={styles.rowSub}>Pulse: {item.pulse ?? "-"}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f2f7ff",
    padding: 16,
    gap: 12
  },
  headerCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 14
  },
  backText: {
    color: "#1f74d1",
    fontWeight: "700"
  },
  title: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: "700",
    color: "#11355c"
  },
  sub: {
    marginTop: 4,
    color: "#4e6482"
  },
  latestCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 14
  },
  latestTitle: {
    color: "#4f6582"
  },
  latestValue: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: "800",
    color: "#11355c"
  },
  level: {
    marginTop: 2,
    fontWeight: "700"
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 14
  },
  label: {
    marginTop: 8,
    marginBottom: 6,
    color: "#244569",
    fontWeight: "600"
  },
  input: {
    borderWidth: 1,
    borderColor: "#c8d8ee",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fbfdff"
  },
  buttonRow: {
    marginTop: 12,
    gap: 8
  },
  buttonPrimary: {
    backgroundColor: "#1f74d1",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  buttonPrimaryText: {
    color: "#fff",
    fontWeight: "700"
  },
  buttonSecondary: {
    backgroundColor: "#fff",
    borderColor: "#c7d8ed",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  buttonSecondaryText: {
    color: "#1f74d1",
    fontWeight: "700"
  },
  message: {
    marginTop: 10,
    color: "#067647"
  },
  error: {
    marginTop: 10,
    color: "#b42318"
  },
  historyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d8e6ff",
    padding: 14,
    marginBottom: 24
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#173e67",
    marginBottom: 6
  },
  empty: {
    color: "#6a7e99"
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#edf3fd"
  },
  rowMain: {
    fontWeight: "700",
    color: "#173e67"
  },
  rowSub: {
    marginTop: 2,
    color: "#70839d",
    fontSize: 12
  }
})
