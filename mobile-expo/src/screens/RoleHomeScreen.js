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
      title: "血壓監控",
      desc: "同步 Health Connect，查看血壓紀錄、趨勢與警戒提醒。",
      special: "blood-pressure"
    },
    {
      id: "vision",
      title: "影像偵測",
      desc: "使用鏡頭偵測跌倒、揮手求救與異常事件。",
      special: "vision"
    },
    {
      id: "sos",
      title: "SOS 求救",
      desc: "一鍵發出緊急求救，送出位置與手機號碼並撥打 119。",
      historyPath: "/patient/sos/history",
      createPath: "/patient/sos/trigger",
      createType: "sos"
    },
    {
      id: "wearable",
      title: "穿戴資料",
      desc: "查看穿戴裝置同步的健康與活動資料。",
      historyPath: "/patient/wearable/history",
      syncPath: "/patient/wearable/sync"
    },
    {
      id: "profile",
      title: "個人資料",
      desc: "查看受顧者基本資料與照護設定。",
      historyPath: "/patient/profile",
      singleRecord: true
    }
  ],
  family: [
    {
      id: "blood-pressure",
      title: "血壓監控",
      desc: "查看受顧者血壓紀錄、近七次趨勢與異常提醒。",
      special: "blood-pressure"
    },
    {
      id: "alerts",
      title: "異常警報",
      desc: "查看系統偵測到的跌倒、久未活動與高風險事件。",
      historyPath: "/family/alerts/history",
      syncPath: "/family/alerts/sync"
    },
    {
      id: "sos",
      title: "SOS 警報",
      desc: "接收受顧者或看護端送出的 SOS 求救通知。",
      historyPath: "/family/sos/history"
    },
    {
      id: "care-records",
      title: "照護紀錄",
      desc: "查看看護回報的照護紀錄與日常狀態。",
      historyPath: "/family/care-records/history",
      syncPath: "/family/care-records/sync"
    },
    {
      id: "events",
      title: "事件紀錄",
      desc: "查看照護與系統事件的完整歷程。",
      historyPath: "/family/events/history",
      syncPath: "/family/events/sync"
    },
    {
      id: "reminders",
      title: "提醒設定",
      desc: "建立用藥或照護提醒，協助日常追蹤。",
      historyPath: "/family/reminders",
      createPath: "/family/reminders",
      createType: "reminder"
    },
    {
      id: "profile",
      title: "家屬資料",
      desc: "查看家屬聯絡電話與綁定的受顧者。",
      historyPath: "/family/profile",
      singleRecord: true
    }
  ],
  caregiver: [
    {
      id: "blood-pressure",
      title: "血壓監控",
      desc: "協助受顧者記錄血壓，查看每日任務與趨勢。",
      special: "blood-pressure"
    },
    {
      id: "vision",
      title: "影像偵測",
      desc: "協助監看跌倒、揮手求救與其他異常事件。",
      special: "vision"
    },
    {
      id: "alerts",
      title: "異常警報",
      desc: "同步並查看看護端收到的異常警報。",
      historyPath: "/caregiver/alerts/history",
      syncPath: "/caregiver/alerts/sync"
    },
    {
      id: "sos",
      title: "SOS 求救",
      desc: "看護可代受顧者發出緊急求救，送出位置與聯絡電話。",
      historyPath: "/caregiver/sos/history",
      createPath: "/caregiver/sos/trigger",
      createType: "sos"
    },
    {
      id: "care-logs",
      title: "照護紀錄",
      desc: "同步看護照護紀錄，方便家屬追蹤。",
      historyPath: "/caregiver/care-logs/history",
      syncPath: "/caregiver/care-logs/sync"
    },
    {
      id: "language",
      title: "語言協助",
      desc: "查看翻譯、常用語與溝通輔助紀錄。",
      historyPath: "/caregiver/language/history",
      syncPath: "/caregiver/language/sync"
    },
    {
      id: "system",
      title: "系統通知",
      desc: "查看看護端系統訊息與設備狀態。",
      historyPath: "/caregiver/system/history",
      syncPath: "/caregiver/system/sync"
    },
    {
      id: "reminders",
      title: "提醒清單",
      desc: "查看受顧者目前的用藥與照護提醒。",
      historyPath: "/caregiver/reminders"
    },
    {
      id: "profile",
      title: "看護資料",
      desc: "查看看護基本資料與綁定狀態。",
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
        <Text style={styles.kicker}>TakeCare App</Text>
        <Text style={styles.title}>{ROLE_LABELS[role] || "使用者"}端首頁</Text>
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
    color: "#b42318",
    fontWeight: "900"
  }
})
