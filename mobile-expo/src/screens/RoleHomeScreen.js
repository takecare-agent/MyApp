import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

const ROLE_LABELS = {
  patient: "受顧者",
  family: "家屬",
  caregiver: "看護"
}

const FEATURE_GROUPS = {
  patient: [
    {
      id: "blood-pressure",
      title: "血壓照護",
      desc: "Health Connect 同步、手動紀錄與趨勢追蹤。",
      special: "blood-pressure"
    },
    {
      id: "vision",
      title: "影像偵測",
      desc: "查看與新增影像模型事件。",
      special: "vision"
    },
    {
      id: "sos",
      title: "SOS 求助",
      desc: "觸發求助並查看歷史事件。",
      historyPath: "/patient/sos/history",
      createPath: "/patient/sos/trigger",
      createType: "sos"
    },
    {
      id: "wearable",
      title: "穿戴裝置",
      desc: "查看健康裝置紀錄。",
      historyPath: "/patient/wearable/history",
      syncPath: "/patient/wearable/sync"
    },
    {
      id: "profile",
      title: "個人資料",
      desc: "查看受顧者基本資料。",
      historyPath: "/patient/profile",
      singleRecord: true
    }
  ],
  family: [
    {
      id: "blood-pressure",
      title: "長輩血壓監控",
      desc: "查看已綁定長輩的 Health Connect 血壓資料。",
      special: "blood-pressure"
    },
    {
      id: "alerts",
      title: "異常事件",
      desc: "查看跌倒、離床與其他異常提醒。",
      historyPath: "/family/alerts/history",
      syncPath: "/family/alerts/sync"
    },
    {
      id: "sos",
      title: "SOS 事件",
      desc: "查看長輩求助事件。",
      historyPath: "/family/sos/history"
    },
    {
      id: "care-records",
      title: "照護紀錄",
      desc: "查看家屬端照護紀錄。",
      historyPath: "/family/care-records/history",
      syncPath: "/family/care-records/sync"
    },
    {
      id: "events",
      title: "事件歷程",
      desc: "查看危險事件與處理狀態。",
      historyPath: "/family/events/history",
      syncPath: "/family/events/sync"
    },
    {
      id: "reminders",
      title: "提醒事項",
      desc: "新增與查看交辦看護的提醒。",
      historyPath: "/family/reminders",
      createPath: "/family/reminders",
      createType: "reminder"
    },
    {
      id: "profile",
      title: "家屬資料",
      desc: "查看家屬資料與綁定長輩帳號。",
      historyPath: "/family/profile",
      singleRecord: true
    }
  ],
  caregiver: [
    {
      id: "blood-pressure",
      title: "看護血壓照護",
      desc: "同步、代輸入與追蹤異常血壓。",
      special: "blood-pressure"
    },
    {
      id: "vision",
      title: "影像偵測",
      desc: "查看與新增看護端影像事件。",
      special: "vision"
    },
    {
      id: "alerts",
      title: "異常處理",
      desc: "新增與追蹤看護端異常事件。",
      historyPath: "/caregiver/alerts/history",
      syncPath: "/caregiver/alerts/sync"
    },
    {
      id: "sos",
      title: "SOS 事件",
      desc: "查看長輩求助事件。",
      historyPath: "/caregiver/sos/history"
    },
    {
      id: "care-logs",
      title: "照護日誌",
      desc: "查看每日照護工作紀錄。",
      historyPath: "/caregiver/care-logs/history",
      syncPath: "/caregiver/care-logs/sync"
    },
    {
      id: "language",
      title: "多語支援",
      desc: "查看跨語言提醒與常用語。",
      historyPath: "/caregiver/language/history",
      syncPath: "/caregiver/language/sync"
    },
    {
      id: "system",
      title: "系統中心",
      desc: "查看系統健康與備援紀錄。",
      historyPath: "/caregiver/system/history",
      syncPath: "/caregiver/system/sync"
    },
    {
      id: "reminders",
      title: "提醒事項",
      desc: "查看家屬交辦的提醒。",
      historyPath: "/caregiver/reminders"
    },
    {
      id: "profile",
      title: "看護資料",
      desc: "查看看護基本資料。",
      historyPath: "/caregiver/profile",
      singleRecord: true
    }
  ]
}

export default function RoleHomeScreen({
  role,
  user,
  apiBaseUrl,
  onOpenBloodPressure,
  onOpenVision,
  onOpenFeature,
  onLogout
}) {
  const features = FEATURE_GROUPS[role] || []

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>TakeCare 原生 App</Text>
        <Text style={styles.title}>{ROLE_LABELS[role] || "未選擇身份"}工作台</Text>
        <Text style={styles.subtitle}>{user?.email || "-"} · API {apiBaseUrl}</Text>
      </View>

      <View style={styles.grid}>
        {features.map(feature => (
          <Pressable
            key={feature.id}
            style={styles.card}
            onPress={() => {
              if (feature.special === "blood-pressure") onOpenBloodPressure()
              else if (feature.special === "vision") onOpenVision()
              else onOpenFeature(feature)
            }}
          >
            <Text style={styles.cardTitle}>{feature.title}</Text>
            <Text style={styles.cardDesc}>{feature.desc}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.logoutBtn} onPress={onLogout}>
        <Text style={styles.logoutText}>登出</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#f2f7ff",
    padding: 16,
    gap: 14
  },
  header: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8e6ff",
    borderRadius: 12,
    padding: 16
  },
  kicker: {
    color: "#1f74d1",
    fontWeight: "800"
  },
  title: {
    marginTop: 6,
    fontSize: 24,
    fontWeight: "900",
    color: "#11355c"
  },
  subtitle: {
    marginTop: 6,
    color: "#526b88",
    lineHeight: 20
  },
  grid: {
    gap: 10
  },
  card: {
    minHeight: 92,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8e6ff",
    borderRadius: 12,
    padding: 14,
    justifyContent: "center"
  },
  cardTitle: {
    color: "#173e67",
    fontSize: 18,
    fontWeight: "900"
  },
  cardDesc: {
    marginTop: 6,
    color: "#4f6682",
    lineHeight: 20
  },
  logoutBtn: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c7d8ed",
    backgroundColor: "#fff",
    paddingVertical: 12,
    alignItems: "center"
  },
  logoutText: {
    color: "#1f507f",
    fontWeight: "900"
  }
})
