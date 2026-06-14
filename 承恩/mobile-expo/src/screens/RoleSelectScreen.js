import { useMemo, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"
import { mobileDevLogin } from "../lib/api"

const ROLE_OPTIONS = [
  {
    key: "patient",
    title: "受顧者",
    subtitle: "日常健康自主使用",
    desc: "查看血壓、影像辨識、SOS 與個人照護功能。",
    badge: "常用",
    icon: "account-heart-outline",
    accent: "#1f74d1",
    soft: "#edf4ff"
  },
  {
    key: "family",
    title: "家屬",
    subtitle: "遠端守護與事件掌握",
    desc: "追蹤警示通知、照護紀錄與家人狀態。",
    badge: "守護",
    icon: "account-group-outline",
    accent: "#1f8a5b",
    soft: "#ebfbf3"
  },
  {
    key: "caregiver",
    title: "照顧者",
    subtitle: "專業照護工作流程",
    desc: "管理任務、回報資料並查看照護中心工具。",
    badge: "專業",
    icon: "hand-heart-outline",
    accent: "#b8711d",
    soft: "#fff6ea"
  }
]

export default function RoleSelectScreen({ loginDraft, onBack, onLoginSuccess }) {
  const [loadingRole, setLoadingRole] = useState("")
  const [error, setError] = useState("")

  const isReady = useMemo(() => {
    return Boolean(
      loginDraft?.apiBaseUrl &&
        loginDraft?.webBaseUrl &&
        loginDraft?.email
    )
  }, [loginDraft])

  const handleSelectRole = async role => {
    if (!isReady) {
      setError("Missing login information. Please go back and fill it again.")
      return
    }

    setLoadingRole(role)
    setError("")

    try {
      const data = await mobileDevLogin({
        apiBaseUrl: loginDraft.apiBaseUrl,
        email: loginDraft.email,
        name: loginDraft.name || "",
        role
      })

      await onLoginSuccess({
        token: data.token,
        role: data.role || role,
        user: data.user || {
          email: loginDraft.email,
          name: loginDraft.name || "",
          role
        },
        apiBaseUrl: loginDraft.apiBaseUrl,
        webBaseUrl: loginDraft.webBaseUrl
      })
    } catch (loginError) {
      setError(loginError.message || "Role login failed")
      setLoadingRole("")
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.bgShapeTop} />
      <View style={styles.bgShapeBottom} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.kicker}>TakeCare 行動版</Text>
          <Text style={styles.title}>請選擇使用角色</Text>
          <Text style={styles.subtitle}>
            選擇後將進入對應功能首頁，之後仍可登出重新切換。
          </Text>

          <View style={styles.accountBox}>
            <MaterialCommunityIcons
              name="account-circle-outline"
              size={22}
              color="#1f507f"
            />
            <View style={styles.accountTextWrap}>
              <Text style={styles.accountLabel}>目前登入帳號</Text>
              <Text style={styles.accountValue}>{loginDraft?.email || "-"}</Text>
            </View>
          </View>

          {ROLE_OPTIONS.map(roleItem => {
            const loading = loadingRole === roleItem.key
            const busy = Boolean(loadingRole)

            return (
              <Pressable
                key={roleItem.key}
                style={[
                  styles.roleCard,
                  { borderColor: roleItem.soft },
                  busy && !loading ? styles.roleCardDisabled : null
                ]}
                disabled={busy}
                onPress={() => handleSelectRole(roleItem.key)}
              >
                <View style={[styles.iconWrap, { backgroundColor: roleItem.soft }]}>
                  <MaterialCommunityIcons
                    name={roleItem.icon}
                    size={24}
                    color={roleItem.accent}
                  />
                </View>

                <View style={styles.roleContent}>
                  <View style={styles.roleTitleRow}>
                    <Text style={styles.roleTitle}>{roleItem.title}</Text>
                    <Text style={[styles.roleBadge, { color: roleItem.accent }]}>
                      {roleItem.badge}
                    </Text>
                  </View>
                  <Text style={styles.roleSubtitle}>{roleItem.subtitle}</Text>
                  <Text style={styles.roleDesc}>{roleItem.desc}</Text>
                </View>

                {loading ? (
                  <ActivityIndicator color={roleItem.accent} />
                ) : (
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={22}
                    color="#8ea4bf"
                  />
                )}
              </Pressable>
            )
          })}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={styles.backBtn}
            onPress={onBack}
            disabled={Boolean(loadingRole)}
          >
            <Text style={styles.backBtnText}>返回上一頁重新填寫</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f7ff"
  },
  bgShapeTop: {
    position: "absolute",
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "#d9e9ff"
  },
  bgShapeBottom: {
    position: "absolute",
    bottom: -100,
    left: -60,
    width: 250,
    height: 250,
    borderRadius: 999,
    backgroundColor: "#e8f2ff"
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 18
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#d6e4f8",
    shadowColor: "#1f4f80",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  kicker: {
    color: "#2e6aa4",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5
  },
  title: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: "800",
    color: "#103961"
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 12,
    color: "#53708f",
    lineHeight: 20
  },
  accountBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#dce9fa",
    borderRadius: 12,
    backgroundColor: "#f8fbff",
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 6
  },
  accountTextWrap: {
    flex: 1
  },
  accountLabel: {
    color: "#6a83a0",
    fontSize: 11
  },
  accountValue: {
    marginTop: 2,
    color: "#193f66",
    fontWeight: "700"
  },
  roleCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center"
  },
  roleCardDisabled: {
    opacity: 0.55
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10
  },
  roleContent: {
    flex: 1,
    paddingRight: 8
  },
  roleTitleRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  roleTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#173e67"
  },
  roleBadge: {
    marginLeft: 8,
    fontSize: 11,
    fontWeight: "700"
  },
  roleSubtitle: {
    marginTop: 2,
    color: "#355b83",
    fontWeight: "600",
    fontSize: 12
  },
  roleDesc: {
    marginTop: 4,
    color: "#5d7692",
    fontSize: 12,
    lineHeight: 18
  },
  error: {
    marginTop: 12,
    color: "#b42318",
    fontWeight: "600"
  },
  backBtn: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c7d8ed",
    backgroundColor: "#fff",
    paddingVertical: 11,
    alignItems: "center"
  },
  backBtnText: {
    color: "#1f507f",
    fontWeight: "700"
  }
})
