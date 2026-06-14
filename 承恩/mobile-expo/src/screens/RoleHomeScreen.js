import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

function buildNativeModules(role) {
  if (role === "patient" || role === "caregiver") {
    return [
      {
        id: "blood-pressure",
        title: "Blood Pressure",
        desc: "Native quick screen for history and upload."
      },
      {
        id: "vision",
        title: "Vision Detection",
        desc: "Native quick screen for detect and history."
      }
    ]
  }

  return []
}

function buildWebModules(role) {
  if (role === "patient") {
    return [
      { id: "patient-home", title: "Patient Home", path: "/patient" },
      { id: "patient-sos", title: "Patient SOS", path: "/patient/sos" },
      { id: "patient-wearable", title: "Patient Wearable", path: "/patient/wearable" },
      {
        id: "patient-bp",
        title: "Patient Blood Pressure",
        path: "/patient/blood-pressure"
      },
      { id: "patient-vision", title: "Patient Vision", path: "/patient/vision" },
      { id: "patient-setup", title: "Patient Setup", path: "/patient/setup" }
    ]
  }

  if (role === "family") {
    return [
      { id: "family-home", title: "Family Home", path: "/family" },
      { id: "family-alerts", title: "Family Alerts", path: "/family/alerts" },
      { id: "family-sos", title: "Family SOS", path: "/family/sos" },
      {
        id: "family-care-records",
        title: "Family Care Records",
        path: "/family/care-records"
      },
      { id: "family-events", title: "Family Events", path: "/family/events" },
      { id: "family-phrases", title: "Family Phrases", path: "/family/phrases" },
      { id: "family-reminders", title: "Family Reminders", path: "/family/reminders" },
      { id: "family-setup", title: "Family Setup", path: "/family/setup" }
    ]
  }

  if (role === "caregiver") {
    return [
      { id: "caregiver-home", title: "Caregiver Home", path: "/caregiver" },
      { id: "caregiver-sos", title: "Caregiver SOS", path: "/caregiver/sos" },
      { id: "caregiver-alerts", title: "Caregiver Alerts", path: "/caregiver/alerts" },
      {
        id: "caregiver-care-logs",
        title: "Caregiver Care Logs",
        path: "/caregiver/care-logs"
      },
      {
        id: "caregiver-bp",
        title: "Caregiver Blood Pressure",
        path: "/caregiver/blood-pressure"
      },
      {
        id: "caregiver-vision",
        title: "Caregiver Vision",
        path: "/caregiver/vision"
      },
      {
        id: "caregiver-language",
        title: "Caregiver Language",
        path: "/caregiver/language"
      },
      {
        id: "caregiver-system",
        title: "Caregiver System",
        path: "/caregiver/system"
      },
      {
        id: "caregiver-reminders",
        title: "Caregiver Reminders",
        path: "/caregiver/reminders"
      },
      { id: "caregiver-setup", title: "Caregiver Setup", path: "/caregiver/setup" }
    ]
  }

  return []
}

function getRoleHomePath(role) {
  if (role === "patient") return "/patient"
  if (role === "family") return "/family"
  if (role === "caregiver") return "/caregiver"
  return "/role"
}

export default function RoleHomeScreen({
  role,
  user,
  apiBaseUrl,
  webBaseUrl,
  onOpenBloodPressure,
  onOpenVision,
  onOpenWebRoute,
  onLogout
}) {
  const nativeModules = buildNativeModules(role)
  const webModules = buildWebModules(role)
  const roleHomePath = getRoleHomePath(role)

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>TakeCare Mobile</Text>
        <Text style={styles.subtitle}>
          Role: {role} | {user?.email || "-"}
        </Text>
        <Text style={styles.api}>API: {apiBaseUrl}</Text>
        <Text style={styles.api}>WEB: {webBaseUrl}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>功能總覽</Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => onOpenWebRoute(roleHomePath, `${role} home`)}
        >
          <Text style={styles.primaryBtnText}>開啟角色首頁</Text>
        </Pressable>
      </View>

      {webModules.map(item => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => onOpenWebRoute(item.path, item.title)}
          >
            <Text style={styles.primaryBtnText}>開啟功能</Text>
          </Pressable>
        </View>
      ))}

      {nativeModules.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>快速功能</Text>
          {nativeModules.map(item =>
            item.id === "blood-pressure" ? (
              <Pressable
                key={item.id}
                style={styles.secondaryBtn}
                onPress={onOpenBloodPressure}
              >
                <Text style={styles.secondaryBtnText}>
                  {item.title}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                key={item.id}
                style={styles.secondaryBtn}
                onPress={onOpenVision}
              >
                <Text style={styles.secondaryBtnText}>{item.title}</Text>
              </Pressable>
            )
          )}
        </View>
      ) : null}

      {role !== "patient" && role !== "family" && role !== "caregiver" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>尚未選擇角色</Text>
          <Text style={styles.cardDesc}>
            請回到角色選擇頁，重新選擇使用身分。
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => onOpenWebRoute("/role")}>
            <Text style={styles.primaryBtnText}>前往角色選擇</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable style={styles.logoutBtn} onPress={onLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>
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
    borderRadius: 16,
    padding: 14
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#11355c"
  },
  subtitle: {
    marginTop: 4,
    color: "#44617f"
  },
  api: {
    marginTop: 4,
    color: "#6a7e99",
    fontSize: 12
  },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8e6ff",
    borderRadius: 16,
    padding: 14
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#173e67"
  },
  cardDesc: {
    marginTop: 4,
    color: "#4f6682"
  },
  primaryBtn: {
    marginTop: 10,
    backgroundColor: "#1f74d1",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700"
  },
  secondaryBtn: {
    marginTop: 10,
    backgroundColor: "#f8fbff",
    borderWidth: 1,
    borderColor: "#c7d8ed",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center"
  },
  secondaryBtnText: {
    color: "#1f507f",
    fontWeight: "700"
  },
  logoutBtn: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c7d8ed",
    backgroundColor: "#fff",
    paddingVertical: 10,
    alignItems: "center"
  },
  logoutText: {
    color: "#1f507f",
    fontWeight: "700"
  }
})
