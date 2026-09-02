/**
 * @deprecated 2026-08-20 — 未被 App／MainTabShell 引用。主殼已改走 MainTabShell。
 * 保留檔案僅供對照舊 hub IA；勿再接線。刪除前確認無深連依賴。
 */
import { useState } from "react"
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { apiRequest } from "../lib/api"

const LANG_OPTIONS = [
  { code: "zh", label: "中文" },
  { code: "en", label: "English" },
  { code: "id", label: "Bahasa" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "tl", label: "Filipino" },
  { code: "th", label: "ภาษาไทย" },
]

const LANG_SHORT = { zh: "中文", en: "EN", id: "ID", vi: "VI", tl: "TL", th: "TH" }

/** 首屏分區：primary 先顯示；其餘進「更多」 */
const HOME_LAYOUT = {
  caregiver: {
    primaryIds: ["alerts", "reminders", "sos"],
    sectionPrimary: { zh: "今日待辦", en: "Today", id: "Tugas hari ini", vi: "Việc hôm nay", tl: "Ngayon", th: "งานวันนี้" },
    sectionMore: { zh: "更多功能", en: "More", id: "Lainnya", vi: "Thêm", tl: "Higit pa", th: "เพิ่มเติม" },
    heroHint: {
      zh: "先處理異常與提醒；家屬端僅監看。",
      en: "Handle alerts & reminders first. Family only monitors.",
      id: "Utamakan alert & pengingat. Keluarga hanya pantau.",
      vi: "Ưu tiên cảnh báo & nhắc. Gia đình chỉ theo dõi.",
      tl: "Una ang mga alerto at paalala. Family ay monitor lang.",
      th: "จัดการแจ้งเตือนและเตือนก่อน ครอบครัวดูอย่างเดียว"
    }
  },
  family: {
    primaryIds: ["alerts", "sos", "blood-pressure"],
    sectionPrimary: { zh: "監看長輩", en: "Monitor", id: "Pantau", vi: "Theo dõi", tl: "Subaybayan", th: "ติดตาม" },
    sectionMore: { zh: "更多功能", en: "More", id: "Lainnya", vi: "Thêm", tl: "Higit pa", th: "เพิ่มเติม" },
    heroHint: {
      zh: "異常與 SOS 以監看為主；處理由看護負責。",
      en: "Watch alerts & SOS; caregiver handles them.",
      id: "Pantau alert & SOS; perawat yang menangani.",
      vi: "Theo dõi cảnh báo & SOS; y tá xử lý.",
      tl: "Subaybayan ang alerto & SOS; caregiver ang bahala.",
      th: "ดูแจ้งเตือนและ SOS ผู้ดูแลเป็นคนจัดการ"
    }
  },
  patient: {
    primaryIds: ["sos"],
    sectionPrimary: { zh: "緊急求救", en: "Emergency", id: "Darurat", vi: "Khẩn cấp", tl: "Emergency", th: "ฉุกเฉิน" },
    sectionMore: { zh: "更多功能", en: "More", id: "Lainnya", vi: "Thêm", tl: "Higit pa", th: "เพิ่มเติม" },
    heroHint: {
      zh: "需要幫忙時按下方大红鈕；其餘功能在下方。",
      en: "Tap the big SOS below when you need help.",
      id: "Tekan tombol SOS besar jika butuh bantuan.",
      vi: "Nhấn nút SOS lớn khi cần trợ giúp.",
      tl: "Pindutin ang malaking SOS kung kailangan ng tulong.",
      th: "กดปุ่ม SOS ใหญ่เมื่อต้องการความช่วยเหลือ"
    }
  }
}

const CAREGIVER_TEXT = {
  zh: {
    kicker: "TakeCare 原生 App",
    dashboardLabel: "看護",
    logout: "登出",
    langSetting: "語言設定",
    features: [
      { id: "blood-pressure", title: "看護血壓照護", desc: "同步、代輸入與追蹤異常血壓。", special: "blood-pressure" },
      { id: "vision", title: "影像偵測", desc: "查看與新增看護端影像事件。", special: "vision" },
      { id: "alerts", title: "異常處理", desc: "待處理一鍵已查看；說明可選。", historyPath: "/caregiver/alerts/history" },
      { id: "sos", title: "SOS 求救", desc: "可代受顧者發出緊急求救。", historyPath: "/caregiver/sos/history", createPath: "/caregiver/sos/trigger", createType: "sos" },
      { id: "care-logs", title: "照護日誌（規劃中）", desc: "每日照護工作紀錄。", historyPath: "/caregiver/care-logs/history", planned: true },
      { id: "language", title: "多語支援", desc: "語言設定、語句翻譯與危險語句警示。", special: "language" },
      { id: "chat", title: "聊天室", desc: "與家屬即時聊天，自動翻譯語言。", special: "chat" },
      { id: "system", title: "系統中心（規劃中）", desc: "系統健康與備援紀錄。", historyPath: "/caregiver/system/history", planned: true },
      { id: "reminders", title: "提醒事項", desc: "家屬交辦；可標記完成。", historyPath: "/caregiver/reminders" },
      { id: "profile", title: "看護資料", desc: "查看看護基本資料。", historyPath: "/caregiver/profile", singleRecord: true }
    ]
  },
  en: {
    kicker: "TakeCare Native App",
    dashboardLabel: "Caregiver",
    logout: "Logout",
    langSetting: "Language",
    features: [
      { id: "blood-pressure", title: "Blood Pressure Care", desc: "Sync, input & track abnormal blood pressure.", special: "blood-pressure" },
      { id: "vision", title: "Vision Detection", desc: "View & add caregiver vision events.", special: "vision" },
      { id: "alerts", title: "Alert Handling", desc: "Pending first; start → resolve.", historyPath: "/caregiver/alerts/history" },
      { id: "sos", title: "Emergency SOS", desc: "Trigger urgent help for the patient.", historyPath: "/caregiver/sos/history", createPath: "/caregiver/sos/trigger", createType: "sos" },
      { id: "care-logs", title: "Care Log (Planned)", desc: "Daily care work records.", historyPath: "/caregiver/care-logs/history", planned: true },
      { id: "language", title: "Multilingual Support", desc: "Language settings, translation & danger phrase alerts.", special: "language" },
      { id: "chat", title: "Chat Room", desc: "Real-time chat with family, auto-translated.", special: "chat" },
      { id: "system", title: "System Center (Planned)", desc: "System health & backup records.", historyPath: "/caregiver/system/history", planned: true },
      { id: "reminders", title: "Reminders", desc: "View reminders; mark complete.", historyPath: "/caregiver/reminders" },
      { id: "profile", title: "Caregiver Profile", desc: "View caregiver basic info.", historyPath: "/caregiver/profile", singleRecord: true }
    ]
  },
  id: {
    kicker: "TakeCare Native App",
    dashboardLabel: "Perawat",
    logout: "Keluar",
    langSetting: "Bahasa",
    features: [
      { id: "blood-pressure", title: "Perawatan Tekanan Darah", desc: "Sinkronkan, input & lacak tekanan darah abnormal.", special: "blood-pressure" },
      { id: "vision", title: "Deteksi Visual", desc: "Lihat & tambah acara visual perawat.", special: "vision" },
      { id: "alerts", title: "Penanganan Anomali", desc: "Prioritas pending; mulai → selesai.", historyPath: "/caregiver/alerts/history" },
      { id: "sos", title: "SOS Darurat", desc: "Kirim bantuan darurat untuk pasien.", historyPath: "/caregiver/sos/history", createPath: "/caregiver/sos/trigger", createType: "sos" },
      { id: "care-logs", title: "Jurnal Perawatan (Rencana)", desc: "Catatan pekerjaan perawatan harian.", historyPath: "/caregiver/care-logs/history", planned: true },
      { id: "language", title: "Dukungan Multibahasa", desc: "Pengaturan bahasa, terjemahan & peringatan frasa bahaya.", special: "language" },
      { id: "chat", title: "Ruang Obrolan", desc: "Obrolan real-time dengan keluarga, terjemahan otomatis.", special: "chat" },
      { id: "system", title: "Pusat Sistem (Rencana)", desc: "Kesehatan sistem & catatan cadangan.", historyPath: "/caregiver/system/history", planned: true },
      { id: "reminders", title: "Pengingat", desc: "Lihat pengingat; tandai selesai.", historyPath: "/caregiver/reminders" },
      { id: "profile", title: "Profil Perawat", desc: "Lihat info dasar perawat.", historyPath: "/caregiver/profile", singleRecord: true }
    ]
  },
  vi: {
    kicker: "TakeCare Native App",
    dashboardLabel: "Y Tá",
    logout: "Đăng Xuất",
    langSetting: "Ngôn Ngữ",
    features: [
      { id: "blood-pressure", title: "Chăm Sóc Huyết Áp", desc: "Đồng bộ, nhập & theo dõi huyết áp bất thường.", special: "blood-pressure" },
      { id: "vision", title: "Phát Hiện Hình Ảnh", desc: "Xem & thêm sự kiện hình ảnh y tá.", special: "vision" },
      { id: "alerts", title: "Xử Lý Bất Thường", desc: "Ưu tiên chờ xử lý; bắt đầu → hoàn tất.", historyPath: "/caregiver/alerts/history" },
      { id: "sos", title: "SOS Khẩn Cấp", desc: "Gửi yêu cầu khẩn cấp cho bệnh nhân.", historyPath: "/caregiver/sos/history", createPath: "/caregiver/sos/trigger", createType: "sos" },
      { id: "care-logs", title: "Nhật Ký Chăm Sóc (Dự kiến)", desc: "Hồ sơ công việc chăm sóc hàng ngày.", historyPath: "/caregiver/care-logs/history", planned: true },
      { id: "language", title: "Hỗ Trợ Đa Ngôn Ngữ", desc: "Cài đặt ngôn ngữ, dịch thuật & cảnh báo nguy hiểm.", special: "language" },
      { id: "chat", title: "Phòng Chat", desc: "Chat thời gian thực với gia đình, tự động dịch.", special: "chat" },
      { id: "system", title: "Trung Tâm Hệ Thống (Dự kiến)", desc: "Sức khỏe hệ thống & hồ sơ sao lưu.", historyPath: "/caregiver/system/history", planned: true },
      { id: "reminders", title: "Nhắc Nhở", desc: "Xem nhắc nhở; đánh dấu hoàn tất.", historyPath: "/caregiver/reminders" },
      { id: "profile", title: "Hồ Sơ Y Tá", desc: "Xem thông tin cơ bản của y tá.", historyPath: "/caregiver/profile", singleRecord: true }
    ]
  },
  tl: {
    kicker: "TakeCare Native App",
    dashboardLabel: "Tagapag-alaga",
    logout: "Mag-logout",
    langSetting: "Wika",
    features: [
      { id: "blood-pressure", title: "Pag-aalaga ng Presyon ng Dugo", desc: "I-sync, mag-input & subaybayan ang abnormal na presyon.", special: "blood-pressure" },
      { id: "vision", title: "Pagtuklas ng Larawan", desc: "Tingnan & magdagdag ng mga visual event ng tagapag-alaga.", special: "vision" },
      { id: "alerts", title: "Paghawak ng Abnormal", desc: "Una ang pending; simulan → tapusin.", historyPath: "/caregiver/alerts/history" },
      { id: "sos", title: "Emergency SOS", desc: "Magpadala ng agarang tulong para sa pasyente.", historyPath: "/caregiver/sos/history", createPath: "/caregiver/sos/trigger", createType: "sos" },
      { id: "care-logs", title: "Talaarawan (Planned)", desc: "Pang-araw-araw na talaan ng trabaho.", historyPath: "/caregiver/care-logs/history", planned: true },
      { id: "language", title: "Suportang Maraming Wika", desc: "Mga setting ng wika, pagsasalin & alerto sa mapanganib na parirala.", special: "language" },
      { id: "chat", title: "Chat Room", desc: "Real-time chat sa pamilya, awtomatikong isinalin.", special: "chat" },
      { id: "system", title: "Sentro ng Sistema (Planned)", desc: "Kalusugan ng sistema & backup.", historyPath: "/caregiver/system/history", planned: true },
      { id: "reminders", title: "Mga Paalala", desc: "Tingnan; markahan bilang tapos.", historyPath: "/caregiver/reminders" },
      { id: "profile", title: "Profile ng Tagapag-alaga", desc: "Tingnan ang pangunahing impormasyon.", historyPath: "/caregiver/profile", singleRecord: true }
    ]
  },
  th: {
    kicker: "TakeCare Native App",
    dashboardLabel: "ผู้ดูแล",
    logout: "ออกจากระบบ",
    langSetting: "ภาษา",
    features: [
      { id: "blood-pressure", title: "การดูแลความดันโลหิต", desc: "ซิงค์ ป้อนข้อมูล & ติดตามความดันผิดปกติ", special: "blood-pressure" },
      { id: "vision", title: "การตรวจจับภาพ", desc: "ดู & เพิ่มเหตุการณ์ภาพของผู้ดูแล", special: "vision" },
      { id: "alerts", title: "การจัดการผิดปกติ", desc: "รอจัดการก่อน; เริ่ม → เสร็จ", historyPath: "/caregiver/alerts/history" },
      { id: "sos", title: "SOS ฉุกเฉิน", desc: "ส่งคำขอฉุกเฉินแทนผู้ป่วย", historyPath: "/caregiver/sos/history", createPath: "/caregiver/sos/trigger", createType: "sos" },
      { id: "care-logs", title: "บันทึกการดูแล (วางแผน)", desc: "บันทึกงานดูแลรายวัน", historyPath: "/caregiver/care-logs/history", planned: true },
      { id: "language", title: "การสนับสนุนหลายภาษา", desc: "การตั้งค่าภาษา การแปล & การแจ้งเตือนคำอันตราย", special: "language" },
      { id: "chat", title: "ห้องแชท", desc: "แชทแบบเรียลไทม์กับครอบครัว แปลอัตโนมัติ", special: "chat" },
      { id: "system", title: "ศูนย์ระบบ (วางแผน)", desc: "สุขภาพระบบ & สำรอง", historyPath: "/caregiver/system/history", planned: true },
      { id: "reminders", title: "การแจ้งเตือน", desc: "ดูและทำเครื่องหมายเสร็จ", historyPath: "/caregiver/reminders" },
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
    { id: "reminders", title: "提醒事項", desc: "查看家屬交辦給看護的提醒（唯讀）。", historyPath: "/patient/reminders" },
    { id: "chat", title: "聊天室", desc: "與家屬或看護即時聊天，訊息自動翻譯。", special: "chat" },
    { id: "wearable", title: "穿戴裝置（規劃中）", desc: "健康裝置紀錄。", historyPath: "/patient/wearable/history", planned: true },
    { id: "profile", title: "個人資料", desc: "查看受顧者基本資料。", historyPath: "/patient/profile", singleRecord: true }
  ],
  family: [
    { id: "blood-pressure", title: "長輩血壓監控", desc: "查看已綁定長輩的 Health Connect 血壓資料。", special: "blood-pressure" },
    { id: "alerts", title: "異常事件", desc: "監看跌倒／異常（唯讀，看護處理）。", historyPath: "/family/alerts/history" },
    { id: "sos", title: "SOS 事件", desc: "查看長輩求助事件。", historyPath: "/family/sos/history" },
    { id: "care-records", title: "照護紀錄（規劃中）", desc: "家屬端照護紀錄。", historyPath: "/family/care-records/history", planned: true },
    { id: "events", title: "事件歷程（規劃中）", desc: "危險事件與處理狀態。", historyPath: "/family/events/history", planned: true },
    { id: "reminders", title: "提醒事項", desc: "新增與查看交辦看護的提醒。", historyPath: "/family/reminders", createPath: "/family/reminders", createType: "reminder" },
    { id: "phrase-library", title: "語句庫", desc: "自訂關懷語句、翻譯工具與危險語句警示。", special: "phrase-library" },
    { id: "chat", title: "聊天室", desc: "與看護即時聊天，訊息自動翻譯。", special: "chat" },
    { id: "profile", title: "家屬資料", desc: "查看家屬資料與綁定長輩帳號。", historyPath: "/family/profile", singleRecord: true }
  ]
}

function pickLangText(map, lang) {
  if (!map) return ""
  return map[lang] || map.zh || ""
}

function splitHomeFeatures(features, role) {
  const layout = HOME_LAYOUT[role] || HOME_LAYOUT.patient
  const primarySet = new Set(layout.primaryIds)
  const byId = new Map(features.map(f => [f.id, f]))
  const primary = layout.primaryIds.map(id => byId.get(id)).filter(Boolean)
  const more = features.filter(f => !primarySet.has(f.id))
  return { layout, primary, more }
}

function openFeature(feature, handlers) {
  if (feature.special === "blood-pressure") handlers.onOpenBloodPressure()
  else if (feature.special === "vision") handlers.onOpenVision()
  else handlers.onOpenFeature(feature)
}

function FeatureCard({ feature, onPress, emphasize }) {
  return (
    <Pressable
      style={[styles.card, emphasize ? styles.cardEmphasize : null]}
      onPress={onPress}
    >
      <Text style={[styles.cardTitle, emphasize ? styles.cardTitleEmphasize : null]}>{feature.title}</Text>
      {feature.planned ? <Text style={styles.plannedTag}>規劃中</Text> : null}
      <Text style={styles.cardDesc}>{feature.desc}</Text>
    </Pressable>
  )
}

function SosHeroCard({ feature, onPress, subtitle }) {
  return (
    <Pressable style={styles.sosHero} onPress={onPress} accessibilityRole="button" accessibilityLabel="呼叫">
      <Text style={styles.sosHeroKicker}>{subtitle}</Text>
      <Text style={styles.sosHeroTitle}>呼叫</Text>
      <Text style={styles.sosHeroDesc}>{feature?.title || "呼叫"}</Text>
      <Text style={styles.sosHeroHint}>{feature?.desc}</Text>
    </Pressable>
  )
}

export default function RoleHomeScreen({
  role,
  user,
  apiBaseUrl,
  token,
  uiLang,
  onUiLangChange,
  onOpenBloodPressure,
  onOpenVision,
  onOpenFeature,
  onLogout
}) {
  const [langModalVisible, setLangModalVisible] = useState(false)

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

  const { layout, primary, more } = splitHomeFeatures(features, role)
  const sectionPrimary = pickLangText(layout.sectionPrimary, lang)
  const sectionMore = pickLangText(layout.sectionMore, lang)
  const heroHint = pickLangText(layout.heroHint, lang)

  const handlers = { onOpenBloodPressure, onOpenVision, onOpenFeature }

  const handleLangChange = async (code) => {
    setLangModalVisible(false)
    if (onUiLangChange) onUiLangChange(code)
    try {
      await apiRequest({ apiBaseUrl, path: "/update-lang", method: "PATCH", token, body: { lang: code } })
    } catch { /* silent */ }
  }

  const renderPrimary = () => {
    if (role === "patient") {
      const sos = primary.find(f => f.id === "sos")
      if (!sos) return null
      return (
        <SosHeroCard
          feature={sos}
          subtitle={sectionPrimary}
          onPress={() => openFeature(sos, handlers)}
        />
      )
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionPrimary}</Text>
        <View style={styles.primaryRow}>
          {primary.map(feature => (
            <FeatureCard
              key={feature.id}
              feature={feature}
              emphasize={feature.id === "alerts" || feature.id === "sos"}
              onPress={() => openFeature(feature, handlers)}
            />
          ))}
        </View>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>{kicker}</Text>
            <Text style={styles.title}>{dashboardLabel}</Text>
            <Text style={styles.heroHint}>{heroHint}</Text>
          </View>
          <Pressable style={styles.langBtn} onPress={() => setLangModalVisible(true)}>
            <Text style={styles.langBtnText}>{LANG_SHORT[uiLang] || "中文"}</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>{user?.email || "-"} · API {apiBaseUrl}</Text>
      </View>

      <Modal
        visible={langModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setLangModalVisible(false)}>
          <View style={styles.langPicker}>
            <Text style={styles.langPickerTitle}>語言 / Language</Text>
            {LANG_OPTIONS.map(l => (
              <Pressable
                key={l.code}
                style={[styles.langOption, uiLang === l.code && styles.langOptionActive]}
                onPress={() => handleLangChange(l.code)}
              >
                <Text style={[styles.langOptionText, uiLang === l.code && styles.langOptionTextActive]}>
                  {l.label}
                </Text>
                {uiLang === l.code ? <Text style={styles.langOptionCheck}>✓</Text> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {renderPrimary()}

      {more.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{sectionMore}</Text>
          <View style={styles.grid}>
            {more.map(feature => (
              <FeatureCard
                key={feature.id}
                feature={feature}
                onPress={() => openFeature(feature, handlers)}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.bottomSection}>
        <Pressable style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutText}>{logoutLabel}</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#eef4fb", padding: 16, gap: 14 },
  header: {
    backgroundColor: "#fff", borderWidth: 1,
    borderColor: "#d8e6ff", borderRadius: 14, padding: 16
  },
  headerRow: {
    flexDirection: "row", alignItems: "flex-start"
  },
  langBtn: {
    backgroundColor: "#e8f2ff", borderRadius: 16,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: "#c0d8f5", marginTop: 2
  },
  langBtnText: { color: "#1f74d1", fontWeight: "900", fontSize: 12 },
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-start", alignItems: "flex-end",
    paddingTop: 80, paddingRight: 16
  },
  langPicker: {
    backgroundColor: "#fff", borderRadius: 14,
    borderWidth: 1, borderColor: "#d8e6ff",
    minWidth: 160, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.12,
    shadowRadius: 8, elevation: 6
  },
  langPickerTitle: {
    color: "#526b88", fontSize: 11, fontWeight: "800",
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6
  },
  langOption: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: "#f0f5ff"
  },
  langOptionActive: { backgroundColor: "#e8f2ff" },
  langOptionText: { color: "#173e67", fontSize: 14, fontWeight: "700" },
  langOptionTextActive: { color: "#1f74d1", fontWeight: "900" },
  langOptionCheck: { color: "#1f74d1", fontWeight: "900", fontSize: 14 },
  kicker: { color: "#1f74d1", fontWeight: "800" },
  title: { marginTop: 6, fontSize: 26, fontWeight: "900", color: "#11355c" },
  heroHint: { marginTop: 8, color: "#3d5a78", lineHeight: 20, fontWeight: "600" },
  subtitle: { marginTop: 8, color: "#7a90a8", lineHeight: 18, fontSize: 12 },
  section: { gap: 10 },
  sectionTitle: {
    color: "#11355c", fontSize: 15, fontWeight: "900",
    letterSpacing: 0.2, paddingHorizontal: 2
  },
  primaryRow: { gap: 10 },
  grid: { gap: 10 },
  card: {
    minHeight: 84, backgroundColor: "#fff", borderWidth: 1,
    borderColor: "#d8e6ff", borderRadius: 12, padding: 14, justifyContent: "center"
  },
  cardEmphasize: {
    borderColor: "#9bb8d9",
    backgroundColor: "#f7fbff",
    minHeight: 96
  },
  cardTitle: { color: "#173e67", fontSize: 17, fontWeight: "900" },
  cardTitleEmphasize: { fontSize: 19 },
  plannedTag: {
    marginTop: 6, alignSelf: "flex-start",
    backgroundColor: "#f79009", color: "#fff",
    overflow: "hidden", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2,
    fontSize: 11, fontWeight: "900"
  },
  cardDesc: { marginTop: 6, color: "#4f6682", lineHeight: 20 },
  sosHero: {
    backgroundColor: "#b42318",
    borderRadius: 18,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    minHeight: 180,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#912018"
  },
  sosHeroKicker: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 1
  },
  sosHeroTitle: {
    marginTop: 8,
    color: "#fff",
    fontSize: 56,
    fontWeight: "900",
    letterSpacing: 2
  },
  sosHeroDesc: {
    marginTop: 4,
    color: "#fff",
    fontSize: 18,
    fontWeight: "800"
  },
  sosHeroHint: {
    marginTop: 10,
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8
  },
  bottomSection: { gap: 10, marginTop: 4 },
  logoutBtn: {
    borderRadius: 10, borderWidth: 1,
    borderColor: "#c7d8ed", backgroundColor: "#fff",
    paddingVertical: 12, alignItems: "center"
  },
  logoutText: { color: "#1f507f", fontWeight: "900" }
})
