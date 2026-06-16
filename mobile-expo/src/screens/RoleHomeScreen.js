import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

const CAREGIVER_TEXT = {
  zh: {
    kicker: "TakeCare 原生 App",
    dashboardLabel: "看護",
    logout: "登出",
    features: [
      { id: "blood-pressure", title: "看護血壓照護", desc: "同步、代輸入與追蹤異常血壓。", special: "blood-pressure" },
      { id: "vision", title: "影像偵測", desc: "查看與新增看護端影像事件。", special: "vision" },
      { id: "alerts", title: "異常處理", desc: "新增與追蹤看護端異常事件。", historyPath: "/caregiver/alerts/history", syncPath: "/caregiver/alerts/sync" },
      { id: "sos", title: "SOS 事件", desc: "查看長輩求助事件。", historyPath: "/caregiver/sos/history" },
      { id: "care-logs", title: "照護日誌", desc: "查看每日照護工作紀錄。", historyPath: "/caregiver/care-logs/history", syncPath: "/caregiver/care-logs/sync" },
      { id: "language", title: "多語支援", desc: "語言設定、語句翻譯與危險語句警示。", special: "language" },
      { id: "chat", title: "聊天室", desc: "與家屬即時聊天，自動翻譯語言。", special: "chat" },
      { id: "system", title: "系統中心", desc: "查看系統健康與備援紀錄。", historyPath: "/caregiver/system/history", syncPath: "/caregiver/system/sync" },
      { id: "reminders", title: "提醒事項", desc: "查看家屬交辦的提醒。", historyPath: "/caregiver/reminders" },
      { id: "profile", title: "看護資料", desc: "查看看護基本資料。", historyPath: "/caregiver/profile", singleRecord: true }
    ]
  },
  en: {
    kicker: "TakeCare Native App",
    dashboardLabel: "Caregiver",
    logout: "Logout",
    features: [
      { id: "blood-pressure", title: "Blood Pressure Care", desc: "Sync, input & track abnormal blood pressure.", special: "blood-pressure" },
      { id: "vision", title: "Vision Detection", desc: "View & add caregiver vision events.", special: "vision" },
      { id: "alerts", title: "Alert Handling", desc: "Add & track caregiver abnormal events.", historyPath: "/caregiver/alerts/history", syncPath: "/caregiver/alerts/sync" },
      { id: "sos", title: "SOS Events", desc: "View patient SOS events.", historyPath: "/caregiver/sos/history" },
      { id: "care-logs", title: "Care Log", desc: "View daily care work records.", historyPath: "/caregiver/care-logs/history", syncPath: "/caregiver/care-logs/sync" },
      { id: "language", title: "Multilingual Support", desc: "Language settings, translation & danger phrase alerts.", special: "language" },
      { id: "chat", title: "Chat Room", desc: "Real-time chat with family, auto-translated.", special: "chat" },
      { id: "system", title: "System Center", desc: "View system health & backup records.", historyPath: "/caregiver/system/history", syncPath: "/caregiver/system/sync" },
      { id: "reminders", title: "Reminders", desc: "View reminders from family.", historyPath: "/caregiver/reminders" },
      { id: "profile", title: "Caregiver Profile", desc: "View caregiver basic info.", historyPath: "/caregiver/profile", singleRecord: true }
    ]
  },
  id: {
    kicker: "TakeCare Native App",
    dashboardLabel: "Perawat",
    logout: "Keluar",
    features: [
      { id: "blood-pressure", title: "Perawatan Tekanan Darah", desc: "Sinkronkan, input & lacak tekanan darah abnormal.", special: "blood-pressure" },
      { id: "vision", title: "Deteksi Visual", desc: "Lihat & tambah acara visual perawat.", special: "vision" },
      { id: "alerts", title: "Penanganan Anomali", desc: "Tambah & lacak acara anomali perawat.", historyPath: "/caregiver/alerts/history", syncPath: "/caregiver/alerts/sync" },
      { id: "sos", title: "Acara SOS", desc: "Lihat acara SOS pasien.", historyPath: "/caregiver/sos/history" },
      { id: "care-logs", title: "Jurnal Perawatan", desc: "Lihat catatan pekerjaan perawatan harian.", historyPath: "/caregiver/care-logs/history", syncPath: "/caregiver/care-logs/sync" },
      { id: "language", title: "Dukungan Multibahasa", desc: "Pengaturan bahasa, terjemahan & peringatan frasa bahaya.", special: "language" },
      { id: "chat", title: "Ruang Obrolan", desc: "Obrolan real-time dengan keluarga, terjemahan otomatis.", special: "chat" },
      { id: "system", title: "Pusat Sistem", desc: "Lihat kesehatan sistem & catatan cadangan.", historyPath: "/caregiver/system/history", syncPath: "/caregiver/system/sync" },
      { id: "reminders", title: "Pengingat", desc: "Lihat pengingat dari keluarga.", historyPath: "/caregiver/reminders" },
      { id: "profile", title: "Profil Perawat", desc: "Lihat info dasar perawat.", historyPath: "/caregiver/profile", singleRecord: true }
    ]
  },
  vi: {
    kicker: "TakeCare Native App",
    dashboardLabel: "Y Tá",
    logout: "Đăng Xuất",
    features: [
      { id: "blood-pressure", title: "Chăm Sóc Huyết Áp", desc: "Đồng bộ, nhập & theo dõi huyết áp bất thường.", special: "blood-pressure" },
      { id: "vision", title: "Phát Hiện Hình Ảnh", desc: "Xem & thêm sự kiện hình ảnh y tá.", special: "vision" },
      { id: "alerts", title: "Xử Lý Bất Thường", desc: "Thêm & theo dõi sự kiện bất thường của y tá.", historyPath: "/caregiver/alerts/history", syncPath: "/caregiver/alerts/sync" },
      { id: "sos", title: "Sự Kiện SOS", desc: "Xem sự kiện SOS của bệnh nhân.", historyPath: "/caregiver/sos/history" },
      { id: "care-logs", title: "Nhật Ký Chăm Sóc", desc: "Xem hồ sơ công việc chăm sóc hàng ngày.", historyPath: "/caregiver/care-logs/history", syncPath: "/caregiver/care-logs/sync" },
      { id: "language", title: "Hỗ Trợ Đa Ngôn Ngữ", desc: "Cài đặt ngôn ngữ, dịch thuật & cảnh báo nguy hiểm.", special: "language" },
      { id: "chat", title: "Phòng Chat", desc: "Chat thời gian thực với gia đình, tự động dịch.", special: "chat" },
      { id: "system", title: "Trung Tâm Hệ Thống", desc: "Xem sức khỏe hệ thống & hồ sơ sao lưu.", historyPath: "/caregiver/system/history", syncPath: "/caregiver/system/sync" },
      { id: "reminders", title: "Nhắc Nhở", desc: "Xem nhắc nhở từ gia đình.", historyPath: "/caregiver/reminders" },
      { id: "profile", title: "Hồ Sơ Y Tá", desc: "Xem thông tin cơ bản của y tá.", historyPath: "/caregiver/profile", singleRecord: true }
    ]
  },
  tl: {
    kicker: "TakeCare Native App",
    dashboardLabel: "Tagapag-alaga",
    logout: "Mag-logout",
    features: [
      { id: "blood-pressure", title: "Pag-aalaga ng Presyon ng Dugo", desc: "I-sync, mag-input & subaybayan ang abnormal na presyon.", special: "blood-pressure" },
      { id: "vision", title: "Pagtuklas ng Larawan", desc: "Tingnan & magdagdag ng mga visual event ng tagapag-alaga.", special: "vision" },
      { id: "alerts", title: "Paghawak ng Abnormal", desc: "Magdagdag & subaybayan ang mga abnormal na event.", historyPath: "/caregiver/alerts/history", syncPath: "/caregiver/alerts/sync" },
      { id: "sos", title: "Mga Kaganapan ng SOS", desc: "Tingnan ang mga SOS event ng pasyente.", historyPath: "/caregiver/sos/history" },
      { id: "care-logs", title: "Talaarawan ng Pag-aalaga", desc: "Tingnan ang pang-araw-araw na talaan ng trabaho.", historyPath: "/caregiver/care-logs/history", syncPath: "/caregiver/care-logs/sync" },
      { id: "language", title: "Suportang Maraming Wika", desc: "Mga setting ng wika, pagsasalin & alerto sa mapanganib na parirala.", special: "language" },
      { id: "chat", title: "Chat Room", desc: "Real-time chat sa pamilya, awtomatikong isinalin.", special: "chat" },
      { id: "system", title: "Sentro ng Sistema", desc: "Tingnan ang kalusugan ng sistema & mga backup record.", historyPath: "/caregiver/system/history", syncPath: "/caregiver/system/sync" },
      { id: "reminders", title: "Mga Paalala", desc: "Tingnan ang mga paalala mula sa pamilya.", historyPath: "/caregiver/reminders" },
      { id: "profile", title: "Profile ng Tagapag-alaga", desc: "Tingnan ang pangunahing impormasyon.", historyPath: "/caregiver/profile", singleRecord: true }
    ]
  },
  th: {
    kicker: "TakeCare Native App",
    dashboardLabel: "ผู้ดูแล",
    logout: "ออกจากระบบ",
    features: [
      { id: "blood-pressure", title: "การดูแลความดันโลหิต", desc: "ซิงค์ ป้อนข้อมูล & ติดตามความดันผิดปกติ", special: "blood-pressure" },
      { id: "vision", title: "การตรวจจับภาพ", desc: "ดู & เพิ่มเหตุการณ์ภาพของผู้ดูแล", special: "vision" },
      { id: "alerts", title: "การจัดการผิดปกติ", desc: "เพิ่ม & ติดตามเหตุการณ์ผิดปกติของผู้ดูแล", historyPath: "/caregiver/alerts/history", syncPath: "/caregiver/alerts/sync" },
      { id: "sos", title: "เหตุการณ์ SOS", desc: "ดูเหตุการณ์ SOS ของผู้ป่วย", historyPath: "/caregiver/sos/history" },
      { id: "care-logs", title: "บันทึกการดูแล", desc: "ดูบันทึกงานดูแลรายวัน", historyPath: "/caregiver/care-logs/history", syncPath: "/caregiver/care-logs/sync" },
      { id: "language", title: "การสนับสนุนหลายภาษา", desc: "การตั้งค่าภาษา การแปล & การแจ้งเตือนคำอันตราย", special: "language" },
      { id: "chat", title: "ห้องแชท", desc: "แชทแบบเรียลไทม์กับครอบครัว แปลอัตโนมัติ", special: "chat" },
      { id: "system", title: "ศูนย์ระบบ", desc: "ดูสุขภาพระบบ & บันทึกสำรอง", historyPath: "/caregiver/system/history", syncPath: "/caregiver/system/sync" },
      { id: "reminders", title: "การแจ้งเตือน", desc: "ดูการแจ้งเตือนจากครอบครัว", historyPath: "/caregiver/reminders" },
      { id: "profile", title: "โปรไฟล์ผู้ดูแล", desc: "ดูข้อมูลพื้นฐานของผู้ดูแล", historyPath: "/caregiver/profile", singleRecord: true }
    ]
  }
}

const ROLE_LABELS = {
  patient: "受顧者",
  family: "家屬",
  caregiver: "看護"
}

const FEATURE_GROUPS = {
  patient: [
    { id: "blood-pressure", title: "血壓照護", desc: "Health Connect 同步、手動紀錄與趨勢追蹤。", special: "blood-pressure" },
    { id: "vision", title: "影像偵測", desc: "查看與新增影像模型事件。", special: "vision" },
    { id: "sos", title: "SOS 求助", desc: "觸發求助並查看歷史事件。", historyPath: "/patient/sos/history", createPath: "/patient/sos/trigger", createType: "sos" },
    { id: "wearable", title: "穿戴裝置", desc: "查看健康裝置紀錄。", historyPath: "/patient/wearable/history", syncPath: "/patient/wearable/sync" },
    { id: "profile", title: "個人資料", desc: "查看受顧者基本資料。", historyPath: "/patient/profile", singleRecord: true }
  ],
  family: [
    { id: "blood-pressure", title: "長輩血壓監控", desc: "查看已綁定長輩的 Health Connect 血壓資料。", special: "blood-pressure" },
    { id: "alerts", title: "異常事件", desc: "查看跌倒、離床與其他異常提醒。", historyPath: "/family/alerts/history", syncPath: "/family/alerts/sync" },
    { id: "sos", title: "SOS 事件", desc: "查看長輩求助事件。", historyPath: "/family/sos/history" },
    { id: "care-records", title: "照護紀錄", desc: "查看家屬端照護紀錄。", historyPath: "/family/care-records/history", syncPath: "/family/care-records/sync" },
    { id: "events", title: "事件歷程", desc: "查看危險事件與處理狀態。", historyPath: "/family/events/history", syncPath: "/family/events/sync" },
    { id: "reminders", title: "提醒事項", desc: "新增與查看交辦看護的提醒。", historyPath: "/family/reminders", createPath: "/family/reminders", createType: "reminder" },
    { id: "phrase-library", title: "語句庫", desc: "自訂關懷語句、翻譯工具與危險語句警示。", special: "phrase-library" },
    { id: "chat", title: "聊天室", desc: "與看護即時聊天，訊息自動翻譯。", special: "chat" },
    { id: "profile", title: "家屬資料", desc: "查看家屬資料與綁定長輩帳號。", historyPath: "/family/profile", singleRecord: true }
  ]
}

export default function RoleHomeScreen({
  role,
  user,
  apiBaseUrl,
  uiLang,
  onOpenBloodPressure,
  onOpenVision,
  onOpenFeature,
  onLogout
}) {
  const lang = (role === "caregiver" && uiLang) ? uiLang : "zh"
  const caregiverT = CAREGIVER_TEXT[lang] || CAREGIVER_TEXT.zh

  const features = role === "caregiver"
    ? caregiverT.features
    : (FEATURE_GROUPS[role] || [])

  const dashboardLabel = role === "caregiver"
    ? caregiverT.dashboardLabel
    : (ROLE_LABELS[role] || "未選擇身份")

  const logoutLabel = role === "caregiver" ? caregiverT.logout : "登出"
  const kicker = role === "caregiver" ? caregiverT.kicker : "TakeCare 原生 App"

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.title}>{dashboardLabel}工作台</Text>
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
        <Text style={styles.logoutText}>{logoutLabel}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#f2f7ff", padding: 16, gap: 14 },
  header: {
    backgroundColor: "#fff", borderWidth: 1,
    borderColor: "#d8e6ff", borderRadius: 12, padding: 16
  },
  kicker: { color: "#1f74d1", fontWeight: "800" },
  title: { marginTop: 6, fontSize: 24, fontWeight: "900", color: "#11355c" },
  subtitle: { marginTop: 6, color: "#526b88", lineHeight: 20 },
  grid: { gap: 10 },
  card: {
    minHeight: 92, backgroundColor: "#fff", borderWidth: 1,
    borderColor: "#d8e6ff", borderRadius: 12, padding: 14, justifyContent: "center"
  },
  cardTitle: { color: "#173e67", fontSize: 18, fontWeight: "900" },
  cardDesc: { marginTop: 6, color: "#4f6682", lineHeight: 20 },
  logoutBtn: {
    marginTop: 8, borderRadius: 10, borderWidth: 1,
    borderColor: "#c7d8ed", backgroundColor: "#fff",
    paddingVertical: 12, alignItems: "center"
  },
  logoutText: { color: "#1f507f", fontWeight: "900" }
})
