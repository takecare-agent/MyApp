import { useMemo, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { mobileDevLogin } from "../lib/api"

const ROLE_OPTIONS = [
  {
    key: "patient",
    title: "受顧者端",
    badge: "長輩使用",
    desc: "量測、同步 Health Connect 血壓資料，並管理自己的心情日記。",
    accent: "#1f74d1",
    soft: "#e8f2ff"
  },
  {
    key: "family",
    title: "家屬端",
    badge: "追蹤查看",
    desc: "固定查看已連接長輩的血壓紀錄、趨勢與異常提醒。",
    accent: "#b54708",
    soft: "#fff7e6"
  },
  {
    key: "caregiver",
    title: "看護端",
    badge: "照護紀錄",
    desc: "協助長輩新增血壓資料，並查看照護所需的趨勢分析。",
    accent: "#067647",
    soft: "#ecfdf3"
  }
]

export default function RoleSelectScreen({ loginDraft, onBack, onLoginSuccess }) {
  const [loadingRole, setLoadingRole] = useState("")
  const [error, setError] = useState("")
  const [linkedPatientEmail, setLinkedPatientEmail] = useState("")

  const isReady = useMemo(
    () => Boolean(loginDraft?.apiBaseUrl && loginDraft?.email),
    [loginDraft]
  )
  const busy = Boolean(loadingRole)

  const handleSelectRole = async role => {
    if (!isReady) {
      setError("登入資料不完整，請回上一頁重新輸入。")
      return
    }

    const normalizedLinkedPatientEmail = linkedPatientEmail.trim().toLowerCase()
    if ((role === "family" || role === "caregiver") && !normalizedLinkedPatientEmail) {
      setError("家屬端與看護端需要輸入要連接的長輩 Email。")
      return
    }

    setLoadingRole(role)
    setError("")

    try {
      const data = await mobileDevLogin({
        apiBaseUrl: loginDraft.apiBaseUrl,
        email: loginDraft.email,
        name: loginDraft.name || "",
        role,
        linkedPatientEmail: normalizedLinkedPatientEmail
      })

      await onLoginSuccess({
        token: data.token,
        role: data.role || role,
        user: data.user || {
          email: loginDraft.email,
          name: loginDraft.name || "",
          role,
          linkedPatientEmail: normalizedLinkedPatientEmail
        },
        apiBaseUrl: loginDraft.apiBaseUrl
      })
    } catch (loginError) {
      setError(loginError.message || "身分設定失敗，請確認後再試一次。")
      setLoadingRole("")
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.backText}>返回</Text>
        </Pressable>
        <Text style={styles.title}>選擇使用身分</Text>
        <Text style={styles.subtitle}>
          受顧者端會建立長輩資料；家屬端與看護端會在這一步直接連接到長輩 Email。
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>長輩端 Email</Text>
        <TextInput
          style={styles.input}
          value={linkedPatientEmail}
          onChangeText={setLinkedPatientEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="家屬/看護選擇身分時必填"
          placeholderTextColor="#8aa0b8"
        />
        <Text style={styles.hint}>選受顧者端可以留空；選家屬端或看護端時，請輸入已建立受顧者端的 Email。</Text>
      </View>

      {ROLE_OPTIONS.map(roleItem => {
        const loading = loadingRole === roleItem.key
        return (
          <Pressable
            key={roleItem.key}
            style={[
              styles.roleCard,
              { borderColor: roleItem.soft },
              busy && !loading ? styles.roleCardDisabled : null
            ]}
            onPress={() => handleSelectRole(roleItem.key)}
            disabled={busy}
          >
            <View style={[styles.roleIcon, { backgroundColor: roleItem.soft }]}>
              <Text style={[styles.roleInitial, { color: roleItem.accent }]}>
                {roleItem.title.slice(0, 1)}
              </Text>
            </View>
            <View style={styles.roleContent}>
              <View style={styles.roleTitleRow}>
                <Text style={styles.roleTitle}>{roleItem.title}</Text>
                <Text style={[styles.roleBadge, { color: roleItem.accent }]}>
                  {roleItem.badge}
                </Text>
              </View>
              <Text style={styles.roleDesc}>{roleItem.desc}</Text>
            </View>
            {loading ? <ActivityIndicator color={roleItem.accent} /> : null}
          </Pressable>
        )
      })}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#f2f7ff",
    padding: 16,
    gap: 12
  },
  header: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8e6ff",
    borderRadius: 12,
    padding: 14
  },
  backText: {
    color: "#1f74d1",
    fontWeight: "900"
  },
  title: {
    marginTop: 8,
    color: "#11355c",
    fontSize: 22,
    fontWeight: "900"
  },
  subtitle: {
    marginTop: 6,
    color: "#526b88",
    lineHeight: 20
  },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8e6ff",
    borderRadius: 12,
    padding: 14
  },
  label: {
    color: "#244569",
    fontWeight: "800",
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderColor: "#c8d8ee",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#1b2a3d",
    backgroundColor: "#fbfdff"
  },
  hint: {
    marginTop: 6,
    color: "#667d97",
    fontSize: 12,
    lineHeight: 18
  },
  roleCard: {
    minHeight: 104,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  roleCardDisabled: {
    opacity: 0.5
  },
  roleIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  roleInitial: {
    fontSize: 22,
    fontWeight: "900"
  },
  roleContent: {
    flex: 1
  },
  roleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  roleTitle: {
    color: "#173e67",
    fontSize: 18,
    fontWeight: "900"
  },
  roleBadge: {
    fontSize: 12,
    fontWeight: "900"
  },
  roleDesc: {
    marginTop: 5,
    color: "#526b88",
    lineHeight: 20
  },
  error: {
    color: "#b42318",
    fontWeight: "800"
  }
})
