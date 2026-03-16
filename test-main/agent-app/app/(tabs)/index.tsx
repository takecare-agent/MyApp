import React, { useState, useEffect } from 'react';
import { 
  NativeModules, NativeEventEmitter, PermissionsAndroid, Platform, 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  Alert, FlatList, Dimensions, ScrollView 
} from 'react-native';
import { NavigationContainer, NavigationIndependentTree } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import BleManager from 'react-native-ble-manager';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Tts from 'react-native-tts';
import { Picker } from '@react-native-picker/picker';

const API_BASE = 'http://192.168.0.107:5001'; // ⚠️ 請確認這是你電腦的真實 IP
const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

interface User { 
  username: string; name: string; role: string; lang: string; 
  bindCode?: string; boundTo?: string; boundToName?: string;
}
// ==========================================
// 📚 內建多國語言字典 (含泰文)
// ==========================================
const SYSTEM_PHRASES = [
  { key: 'eat', zh: '現在要吃飯了', en: 'It’s time to eat.', vi: 'Đến giờ ăn rồi.', id: 'Waktunya makan.', tl: 'Oras na para kumain.', th: 'ถึงเวลากินข้าวแล้ว' },
  { key: 'eat_slowly', zh: '請慢慢吃', en: 'Please eat slowly.', vi: 'Xin hãy ăn từ từ.', id: 'Tolong makan pelan-pelan.', tl: 'Dahan-dahan lang sa pagkain.', th: 'ค่อยๆ กินนะ' },
  { key: 'want_water', zh: '要不要喝水？', en: 'Do you want some water?', vi: 'Bạn có muốn uống nước không?', id: 'Apakah Anda ingin minum air?', tl: 'Gusto mo ba ng tubig?', th: 'อยากดื่มน้ำไหม?' },
  { key: 'get_water', zh: '我幫你拿水', en: 'I’ll get you some water.', vi: 'Tôi sẽ lấy nước cho bạn.', id: 'Saya akan mengambilkan air.', tl: 'Ikukuha kita ng tubig.', th: 'เดี๋ยวเอาน้ำมาให้' },
  { key: 'rest', zh: '現在要休息一下', en: 'It’s time to rest.', vi: 'Đến giờ nghỉ ngơi rồi.', id: 'Waktunya istirahat.', tl: 'Oras na para magpahinga.', th: 'ถึงเวลาพักผ่อนแล้ว' },
  { key: 'sleep', zh: '該睡覺了', en: 'It’s time to sleep.', vi: 'Đến giờ đi ngủ rồi.', id: 'Waktunya tidur.', tl: 'Oras na para matulog.', th: 'ถึงเวลานอนแล้ว' },
  { key: 'clothes', zh: '我要幫你換衣服', en: 'I’m going to help you change clothes.', vi: 'Tôi sẽ giúp bạn thay quần áo.', id: 'Saya akan membantu Anda ganti baju.', tl: 'Tutulungan kitang magpalit ng damit.', th: 'ฉันจะเปลี่ยนเสื้อผ้าให้คุณ' },
  { key: 'raise_hand', zh: '請把手抬起來', en: 'Please raise your hand.', vi: 'Xin hãy giơ tay lên.', id: 'Tolong angkat tangan Anda.', tl: 'Pakitaas ang iyong kamay.', th: 'กรุณายกมือขึ้น' },
  { key: 'comfortable', zh: '這樣會比較舒服', en: 'This will be more comfortable.', vi: 'Như vậy sẽ thoải mái hơn.', id: 'Ini akan lebih nyaman.', tl: 'Mas magiging komportable ito.', th: 'แบบนี้จะสบายขึ้น' },
  { key: 'im_here', zh: '我在你旁邊', en: 'I’m right here.', vi: 'Tôi ở ngay bên cạnh bạn.', id: 'Saya ada di sini.', tl: 'Nandito lang ako.', th: 'ฉันอยู่ตรงนี้' },
  { key: 'bathroom', zh: '要上廁所嗎？', en: 'Do you need to use the bathroom?', vi: 'Bạn có muốn đi vệ sinh không?', id: 'Apakah Anda ingin ke kamar mandi?', tl: 'Kailangan mo bang magbanyo?', th: 'อยากเข้าห้องน้ำไหม?' },
  { key: 'go_with_you', zh: '我陪你一起去', en: 'I’ll go with you.', vi: 'Tôi sẽ đi cùng bạn.', id: 'Saya akan pergi bersamamu.', tl: 'Sasamahan kita.', th: 'ฉันจะไปเป็นเพื่อน' },
  { key: 'sit_slowly', zh: '請慢慢坐下', en: 'Please sit down slowly.', vi: 'Xin hãy ngồi xuống từ từ.', id: 'Tolong duduk pelan-pelan.', tl: 'Dahan-dahang umupo.', th: 'ค่อยๆ นั่งลง' },
  { key: 'done', zh: '已經好了', en: 'It’s done.', vi: 'Đã xong rồi.', id: 'Sudah selesai.', tl: 'Tapos na.', th: 'เสร็จแล้ว' },
  { key: 'take_meds', zh: '現在要吃藥', en: 'It’s time to take your medicine.', vi: 'Đến giờ uống thuốc rồi.', id: 'Waktunya minum obat.', tl: 'Oras na para uminom ng gamot.', th: 'ถึงเวลากินยาแล้ว' },
  { key: 'doc_meds', zh: '這是醫生開的藥', en: 'This is prescribed by the doctor.', vi: 'Đây là thuốc bác sĩ kê.', id: 'Ini obat dari dokter.', tl: 'Reseta ito ng doktor.', th: 'นี่คือยาที่หมอสั่ง' },
  { key: 'water_after_meds', zh: '吃完藥要喝水', en: 'Drink water after taking the medicine.', vi: 'Uống nước sau khi uống thuốc.', id: 'Minum air setelah minum obat.', tl: 'Uminom ng tubig pagkatapos mag-gamot.', th: 'กินยาแล้วดื่มน้ำตาม' },
  { key: 'finished', zh: '吃完了嗎？', en: 'Are you finished?', vi: 'Bạn ăn xong chưa?', id: 'Sudah selesai?', tl: 'Tapos ka na ba?', th: 'กินเสร็จหรือยัง?' },
  { key: 'where_uncomfortable', zh: '你哪裡不舒服？', en: 'Where do you feel uncomfortable?', vi: 'Bạn thấy khó chịu ở đâu?', id: 'Di mana yang terasa tidak nyaman?', tl: 'Saan ang masakit sa iyo?', th: 'คุณไม่สบายตรงไหน?' },
  { key: 'dizzy', zh: '會不會頭暈？', en: 'Do you feel dizzy?', vi: 'Bạn có thấy chóng mặt không?', id: 'Apakah Anda merasa pusing?', tl: 'Nahihilo ka ba?', th: 'เวียนหัวไหม?' },
  { key: 'nauseous', zh: '會不會想吐？', en: 'Do you feel nauseous?', vi: 'Bạn có muốn nôn không?', id: 'Apakah Anda merasa mual?', tl: 'Nasusuka ka ba?', th: 'อยากอาเจียนไหม?' },
  { key: 'pain', zh: '有沒有覺得痛？', en: 'Do you feel pain?', vi: 'Bạn có thấy đau không?', id: 'Apakah terasa sakit?', tl: 'Nasasaktan ka ba?', th: 'เจ็บไหม?' },
  { key: 'hurt_here', zh: '是這裡痛嗎？', en: 'Does it hurt here?', vi: 'Đau ở đây phải không?', id: 'Apakah sakit di sini?', tl: 'Dito ba ang masakit?', th: 'เจ็บตรงนี้ไหม?' },
  { key: 'cold', zh: '你覺得冷嗎？', en: 'Do you feel cold?', vi: 'Bạn có thấy lạnh không?', id: 'Apakah Anda merasa dingin?', tl: 'Nalalamigan ka ba?', th: 'รู้สึกหนาวไหม?' },
  { key: 'hot', zh: '你覺得熱嗎？', en: 'Do you feel hot?', vi: 'Bạn có thấy nóng không?', id: 'Apakah Anda merasa panas?', tl: 'Naiinitan ka ba?', th: 'รู้สึกร้อนไหม?' },
  { key: 'breathing', zh: '呼吸還順嗎？', en: 'Is your breathing okay?', vi: 'Bạn thở có bình thường không?', id: 'Apakah pernapasan Anda lancar?', tl: 'Okay ba ang paghinga mo?', th: 'หายใจสะดวกไหม?' },
  { key: 'heartbeat', zh: '心跳會不會很快？', en: 'Is your heartbeat fast?', vi: 'Tim bạn đập có nhanh không?', id: 'Apakah detak jantung Anda cepat?', tl: 'Mabilis ba ang tibok ng puso mo?', th: 'หัวใจเต้นเร็วไหม?' },
  { key: 'hear_me', zh: '你聽得到我說話嗎？', en: 'Can you hear me?', vi: 'Bạn có nghe tôi nói không?', id: 'Bisa dengar suara saya?', tl: 'Naririnig mo ba ako?', th: 'ได้ยินฉันไหม?' },
  { key: 'look_me', zh: '看著我', en: 'Look at me.', vi: 'Nhìn tôi này.', id: 'Lihat saya.', tl: 'Tumingin ka sa akin.', th: 'มองมาที่ฉัน' },
  { key: 'dont_worry', zh: '不用擔心', en: 'Don’t worry.', vi: 'Đừng lo lắng.', id: 'Jangan khawatir.', tl: 'Huwag kang mag-alala.', th: 'ไม่ต้องกังวล' },
  { key: 'relax', zh: '放輕鬆', en: 'Relax.', vi: 'Thư giãn nào.', id: 'Santai saja.', tl: 'Relax lang.', th: 'ผ่อนคลาย' },
  { key: 'take_time', zh: '慢慢來', en: 'Take your time.', vi: 'Cứ từ từ.', id: 'Pelan-pelan saja.', tl: 'Dahan-dahan lang.', th: 'ช้าๆ ไม่ต้องรีบ' },
  { key: 'help_you', zh: '我會幫你', en: 'I will help you.', vi: 'Tôi sẽ giúp bạn.', id: 'Saya akan membantu Anda.', tl: 'Tutulungan kita.', th: 'ฉันจะช่วยคุณ' },
  { key: 'here_with_you', zh: '我在這裡陪你', en: 'I’m here with you.', vi: 'Tôi ở đây với bạn.', id: 'Saya di sini bersamamu.', tl: 'Nandito ako para sa iyo.', th: 'ฉันอยู่เป็นเพื่อนคุณที่นี่' },
  { key: 'dont_move', zh: '不要動', en: 'Don’t move.', vi: 'Đừng cử động.', id: 'Jangan bergerak.', tl: 'Huwag gumalaw.', th: 'อย่าขยับ' },
  { key: 'sit_down', zh: '坐下', en: 'Sit down.', vi: 'Ngồi xuống.', id: 'Duduk.', tl: 'Umupo.', th: 'นั่งลง' },
  { key: 'lie_down', zh: '躺好', en: 'Lie down.', vi: 'Nằm xuống.', id: 'Berbaring.', tl: 'Humiga.', th: 'นอนลง' },
  { key: 'breathe_slowly', zh: '慢慢呼吸', en: 'Breathe slowly.', vi: 'Hít thở từ từ.', id: 'Bernapas pelan-pelan.', tl: 'Huminga ng malalim at dahan-dahan.', th: 'หายใจช้าๆ' },
  { key: 'bleeding', zh: '有流血', en: 'There is bleeding.', vi: 'Đang chảy máu.', id: 'Ada pendarahan.', tl: 'May pagdurugo.', th: 'มีเลือดออก' },
  { key: 'stop_bleeding', zh: '我幫你止血', en: 'I’m helping stop the bleeding.', vi: 'Tôi sẽ giúp bạn cầm máu.', id: 'Saya bantu menghentikan pendarahan.', tl: 'Tutulungan kitang pigilan ang pagdurugo.', th: 'ฉันจะช่วยห้ามเลือดให้' },
  { key: 'dont_be_afraid', zh: '不要怕', en: 'Don’t be afraid.', vi: 'Đừng sợ.', id: 'Jangan takut.', tl: 'Huwag matakot.', th: 'ไม่ต้องกลัว' },
  { key: 'called_amb', zh: '我已經叫救護車', en: 'I’ve called an ambulance.', vi: 'Tôi đã gọi xe cấp cứu.', id: 'Saya sudah menelepon ambulans.', tl: 'Tumawag na ako ng ambulansya.', th: 'ฉันเรียกไปรถพยาบาลแล้ว' },
  { key: 'amb_coming', zh: '救護車快到了', en: 'The ambulance is coming.', vi: 'Xe cấp cứu sắp đến rồi.', id: 'Ambulans segera datang.', tl: 'Parating na ang ambulansya.', th: 'รถพยาบาลกำลังมา' },
  { key: 'better_soon', zh: '很快就會好一點', en: 'You will feel better soon.', vi: 'Bạn sẽ sớm thấy tốt hơn thôi.', id: 'Anda akan segera merasa lebih baik.', tl: 'Gagaan din ang pakiramdam mo.', th: 'เดี๋ยวก็จะดีขึ้น' },
  { key: 'stay_awake', zh: '請保持清醒', en: 'Please stay awake.', vi: 'Xin hãy giữ tỉnh táo.', id: 'Tolong tetap sadar.', tl: 'Manatiling gising, pakiusap.', th: 'กรุณามีสติไว้' },
  { key: 'listen_voice', zh: '聽我說話', en: 'Listen to my voice.', vi: 'Hãy nghe tôi nói.', id: 'Dengarkan suara saya.', tl: 'Makinig ka sa boses ko.', th: 'ฟังเสียงฉันนะ' },
  { key: 'safe', zh: '你是安全的', en: 'You are safe.', vi: 'Bạn an toàn rồi.', id: 'Anda aman.', tl: 'Ligtas ka na.', th: 'คุณปลอดภัยแล้ว' }
];

// 🌐 全域 UI 多國語言字典
const UI_TEXT = {
  en: { 
    cgTitle: '⚠️ Care Assistant', select: '--- Tap to select ---', result: 'Chinese Translation', replay: '🔊 Replay Audio', familyNote: '--- Family Notes ---',
    fmTitle: '👨‍👩‍👧 Family Portal', addPhrase: '➕ Add Custom Phrase', inputPh: 'Enter new phrase...', addBtn: 'Add', logsTitle: '⚠️ Danger Logs (7 Days)', refresh: 'Refresh',
    setMenu: '⚙️ Settings', accInfo: '👤 Account Info', myCode: 'My Bind Code: ', boundTo: 'Bound to: ',
    bindSec: '🔗 Bind Account', bindPh: 'Enter 6-digit code...', bindBtn: 'Confirm Bind', unbindBtn: '❌ Unbind',
    langSec: '🌐 App Language', logout: '🚪 Logout'
  },
  zh: { 
    cgTitle: '⚠️ 照護助手', select: '--- 請點擊選擇 ---', result: '中文翻譯', replay: '🔊 重新朗讀', familyNote: '--- 家屬自訂語句 ---',
    fmTitle: '👨‍👩‍👧 家屬管理端', addPhrase: '➕ 自訂新增語句', inputPh: '輸入新語句...', addBtn: '新增', logsTitle: '⚠️ 危險語句紀錄 (保留7天)', refresh: '重新整理',
    setMenu: '⚙️ 系統設定', accInfo: '👤 帳號資訊', myCode: '我的綁定碼：', boundTo: '目前綁定對象：',
    bindSec: '🔗 綁定家屬/看護帳號', bindPh: '請輸入對方 6 位數綁定碼...', bindBtn: '確認綁定', unbindBtn: '❌ 解除綁定',
    langSec: '🌐 介面語言 (App Language)', logout: '🚪 登出帳號'
  },
  id: { 
    cgTitle: '⚠️ Asisten Perawat', select: '--- Ketuk untuk memilih ---', result: 'Terjemahan Mandarin', replay: '🔊 Putar Ulang', familyNote: '--- Catatan Keluarga ---',
    fmTitle: '👨‍👩‍👧 Portal Keluarga', addPhrase: '➕ Tambah Kalimat', inputPh: 'Masukkan kalimat...', addBtn: 'Tambah', logsTitle: '⚠️ Log Bahaya (7 Hari)', refresh: 'Segarkan',
    setMenu: '⚙️ Pengaturan', accInfo: '👤 Info Akun', myCode: 'Kode Saya: ', boundTo: 'Terikat dengan: ',
    bindSec: '🔗 Ikat Akun', bindPh: 'Masukkan 6 digit kode...', bindBtn: 'Konfirmasi', unbindBtn: '❌ Lepaskan Ikatan',
    langSec: '🌐 Bahasa Aplikasi', logout: '🚪 Keluar'
  },
  vi: { 
    cgTitle: '⚠️ Trợ lý Chăm sóc', select: '--- Nhấn để chọn ---', result: 'Bản dịch tiếng Trung', replay: '🔊 Phát lại', familyNote: '--- Ghi chú Gia đình ---',
    fmTitle: '👨‍👩‍👧 Cổng Gia đình', addPhrase: '➕ Thêm câu', inputPh: 'Nhập câu mới...', addBtn: 'Thêm', logsTitle: '⚠️ Nhật ký Nguy hiểm (7 ngày)', refresh: 'Làm mới',
    setMenu: '⚙️ Cài đặt', accInfo: '👤 Thông tin tài khoản', myCode: 'Mã của tôi: ', boundTo: 'Liên kết với: ',
    bindSec: '🔗 Liên kết Tài khoản', bindPh: 'Nhập mã 6 chữ số...', bindBtn: 'Xác nhận', unbindBtn: '❌ Hủy liên kết',
    langSec: '🌐 Ngôn ngữ Ứng dụng', logout: '🚪 Đăng xuất'
  },
  tl: { 
    cgTitle: '⚠️ Katulong sa Pag-aalaga', select: '--- I-tap para pumili ---', result: 'Salin sa Tsino', replay: '🔊 I-replay', familyNote: '--- Mga Tala ng Pamilya ---',
    fmTitle: '👨‍👩‍👧 Portal ng Pamilya', addPhrase: '➕ Magdagdag ng Parirala', inputPh: 'Ipasok ang parirala...', addBtn: 'Idagdag', logsTitle: '⚠️ Mga Log ng Panganib (7 Araw)', refresh: 'I-refresh',
    setMenu: '⚙️ Mga Setting', accInfo: '👤 Impormasyon ng Account', myCode: 'Aking Code: ', boundTo: 'Nakakabit sa: ',
    bindSec: '🔗 I-bind ang Account', bindPh: 'Ilagay ang 6-digit na code...', bindBtn: 'Kumpirmahin', unbindBtn: '❌ I-unbind',
    langSec: '🌐 Wika ng App', logout: '🚪 Mag-logout'
  },
  th: { 
    cgTitle: '⚠️ ผู้ช่วยดูแล', select: '--- แตะเพื่อเลือก ---', result: 'แปลภาษาจีน', replay: '🔊 เล่นเสียงซ้ำ', familyNote: '--- บันทึกจากครอบครัว ---',
    fmTitle: '👨‍👩‍👧 พอร์ทัลครอบครัว', addPhrase: '➕ เพิ่มวลีที่กำหนดเอง', inputPh: 'ป้อนวลีใหม่...', addBtn: 'เพิ่ม', logsTitle: '⚠️ บันทึกอันตราย (7 วัน)', refresh: 'รีเฟรช',
    setMenu: '⚙️ การตั้งค่า', accInfo: '👤 ข้อมูลบัญชี', myCode: 'รหัสของฉัน: ', boundTo: 'ผูกกับ: ',
    bindSec: '🔗 ผูกบัญชี', bindPh: 'ป้อนรหัส 6 หลัก...', bindBtn: 'ยืนยันการผูก', unbindBtn: '❌ ยกเลิกการผูก',
    langSec: '🌐 ภาษาของแอป', logout: '🚪 ออกจากระบบ'
  }
};

// ==========================================
// 頁面 1：登入與註冊系統 (全暗黑，移除語言選擇)
// ==========================================
const AuthScreen = ({ onLogin }: { onLogin: (user: User) => void }) => {
  const [isLoginView, setIsLoginView] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('family');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!username || !password || (!isLoginView && !name)) return Alert.alert("錯誤", "請填寫完整資訊");
    setIsLoading(true);
    try {
      if (isLoginView) {
        const res = await axios.post(`${API_BASE}/login`, { username, password });
        if (res.data.success) onLogin(res.data.user);
        else Alert.alert("登入失敗", res.data.message || "帳號或密碼錯誤");
      } else {
        // 註冊時不再選擇語言，預設給 'en'，之後去設定頁面改
        const res = await axios.post(`${API_BASE}/register`, { username, password, name, role, lang: 'en' });
        if (res.data.success) {
          Alert.alert("註冊成功", "請直接登入");
          setIsLoginView(true);
        } else Alert.alert("註冊失敗", res.data.message);
      }
    } catch (e) {
      console.log("連線失敗:", e);
      Alert.alert("連線錯誤", "無法連線至伺服器，請確認電腦 IP 是否正確，且伺服器已啟動！");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ fontSize: 32, fontWeight: 'bold', marginBottom: 30, color: '#00c49f' }}>
        {isLoginView ? ' 歡迎登入' : ' 註冊帳號'}
      </Text>
      <View style={styles.card}>
        <TextInput style={styles.input} placeholderTextColor="#888" placeholder="帳號 (username)" value={username} onChangeText={setUsername} autoCapitalize="none" />
        <TextInput style={styles.input} placeholderTextColor="#888" placeholder="密碼 (password)" value={password} onChangeText={setPassword} secureTextEntry />
        {!isLoginView && (
          <>
            <TextInput style={styles.input} placeholderTextColor="#888" placeholder="姓名 / 稱呼" value={name} onChangeText={setName} />
            <Text style={styles.label}>選擇身分</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={role} onValueChange={setRole} style={{ color: 'white' }} dropdownIconColor="#00c49f">
                <Picker.Item label=" 家屬 (Family)" value="family" />
                <Picker.Item label=" 看護 (Caregiver)" value="caregiver" />
              </Picker>
            </View>
          </>
        )}
        <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit}>
          <Text style={styles.btnText}>{isLoading ? "處理中..." : (isLoginView ? "登入" : "註冊")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setIsLoginView(!isLoginView)} style={{ marginTop: 10 }}>
          <Text style={{ textAlign: 'center', color: '#00c49f', fontSize: 16 }}>
            {isLoginView ? "還沒有帳號？點此註冊" : "已有帳號？點此登入"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// ==========================================
// 頁面 2：家屬端 (套用全域語言)
// ==========================================
const FamilyScreen = ({ currentUser, customPhrases, setCustomPhrases, appLang }: any) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [newPhrase, setNewPhrase] = useState('');
  const ui = UI_TEXT[appLang as keyof typeof UI_TEXT] || UI_TEXT.zh; // 預設家屬用中文

  useEffect(() => { fetchLogs(); }, []);
  const fetchLogs = async () => {
    try {
      const res = await axios.get(`${API_BASE}/logs?username=${currentUser.username}`);
      setLogs(res.data || []);
    } catch (e) { }
  };

  const addPhrase = async () => {
    if (newPhrase.trim()) {
      try {
        await axios.post(`${API_BASE}/custom-phrases`, { username: currentUser.username, phrase: newPhrase.trim() });
        setCustomPhrases([...customPhrases, newPhrase.trim()]);
        setNewPhrase('');
      } catch (error) { Alert.alert("錯誤", "無法儲存"); }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.headerTitle}>{ui.fmTitle}</Text></View>
      <ScrollView style={{ padding: 15 }}>
        <Text style={styles.sectionTitle}>{ui.addPhrase}</Text>
        <View style={{ flexDirection: 'row', marginBottom: 15 }}>
          <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholderTextColor="#888" value={newPhrase} onChangeText={setNewPhrase} placeholder={ui.inputPh} />
          <TouchableOpacity style={[styles.primaryBtn, { paddingHorizontal: 20, marginLeft: 10, marginBottom: 0 }]} onPress={addPhrase}>
            <Text style={styles.btnText}>{ui.addBtn}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ marginBottom: 30 }}>
          {customPhrases.map((p: string, i: number) => (
            <View key={i} style={styles.phraseItem}><Text style={styles.textWhite}>• {p}</Text></View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={styles.sectionTitle}>{ui.logsTitle}</Text>
          <TouchableOpacity onPress={fetchLogs}><Text style={{ color: '#00c49f' }}>{ui.refresh}</Text></TouchableOpacity>
        </View>
        {logs.length === 0 ? <Text style={styles.textGray}>No recent logs.</Text> : null}
        {logs.map((log, i) => (
          <View key={i} style={styles.logCard}>
            <Text style={styles.textWhite}>⏱️ {log.time}</Text>
            <Text style={{ color: '#ff4d4f', marginTop: 5, fontSize: 16, fontWeight: 'bold' }}>{log.phrase}</Text>
            <Text style={{ color: '#aaa', marginTop: 5 }}>👤 {log.senderName}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

// ==========================================
// 頁面 3：看護端 (套用全域語言)
// ==========================================
const CaregiverScreen = ({ currentUser, customPhrases, appLang }: any) => {
  const [selectedKey, setSelectedKey] = useState('');
  const [translatedText, setTranslatedText] = useState('...');
  const [translatedCustomPhrases, setTranslatedCustomPhrases] = useState<{orig: string, trans: string}[]>([]);
  const ui = UI_TEXT[appLang as keyof typeof UI_TEXT] || UI_TEXT.en;

  // 翻譯家屬自訂語句
  useEffect(() => {
    const translateCustomPhrases = async () => {
      if (customPhrases.length === 0) return setTranslatedCustomPhrases([]);
      const results = await Promise.all(customPhrases.map(async (phrase: string) => {
        try {
          const res = await axios.post(`${API_BASE}/translate`, { text: phrase, targetLang: appLang });
          return { orig: phrase, trans: res.data.translatedText };
        } catch (e) { return { orig: phrase, trans: phrase }; }
      }));
      setTranslatedCustomPhrases(results);
    };
    translateCustomPhrases();
  }, [customPhrases, appLang]);

  const handleAutoTranslateAndSpeak = (val: string) => {
    if (!val) { setSelectedKey(''); return; }
    setSelectedKey(val);
    let textToSpeak = '';
    
    if (val.startsWith('custom_')) {
      textToSpeak = val.replace('custom_', '');
      setTranslatedText(textToSpeak);
    } else {
      const match = SYSTEM_PHRASES.find(p => p.key === val);
      if (match) { textToSpeak = match.zh; setTranslatedText(match.zh); }
    }

    if (textToSpeak) {
      Tts.setDefaultLanguage('zh-TW');
      Tts.speak(textToSpeak);
      axios.post(`${API_BASE}/track-phrase`, { username: currentUser.username, phrase: textToSpeak }).catch(()=>{});
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.headerTitle}>{ui.cgTitle}</Text></View>
      <ScrollView style={{ padding: 20 }}>
        <Text style={styles.label}>{ui.select}</Text>
        <View style={styles.pickerContainer}>
          <Picker selectedValue={selectedKey} dropdownIconColor="#00c49f" style={{ color: 'white' }} onValueChange={handleAutoTranslateAndSpeak}>
            <Picker.Item label={ui.select} value="" color="#888" />
            
            {/* 系統語句，依照 appLang 顯示 */}
            {SYSTEM_PHRASES.map((p) => (
              <Picker.Item key={p.key} label={p[appLang as keyof typeof p] || p.en} value={p.key} color="#fff" />
            ))}
            
            {/* 家屬自訂語句 */}
            {translatedCustomPhrases.length > 0 && <Picker.Item label={ui.familyNote} value="" color="#ffb300" />}
            {translatedCustomPhrases.map((item, i) => (
              <Picker.Item key={`custom-${i}`} label={item.trans} value={`custom_${item.orig}`} color="#00c49f" />
            ))}
          </Picker>
        </View>

        <Text style={[styles.label, {marginTop: 20}]}>{ui.result}</Text>
        <View style={[styles.card, { minHeight: 120, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={[styles.resultText, translatedText === '...' && { color: '#555' }]}>{translatedText}</Text>
        </View>
        
        <TouchableOpacity style={styles.primaryBtn} onPress={() => { Tts.setDefaultLanguage('zh-TW'); Tts.speak(translatedText); }}>
          <Text style={styles.btnText}>{ui.replay}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

// ==========================================
// 頁面 4：設定頁面 (含解除綁定功能)
// ==========================================
const SettingsScreen = ({ currentUser, onLogout, appLang, setAppLang, updateUserInfo }: any) => {
  const [bindCodeInput, setBindCodeInput] = useState('');
  const [isBinding, setIsBinding] = useState(false);
  const ui = UI_TEXT[appLang as keyof typeof UI_TEXT] || UI_TEXT.zh;

  // 綁定
  const handleBind = async () => {
    if (!bindCodeInput) return;
    setIsBinding(true);
    try {
      const res = await axios.post(`${API_BASE}/bind`, { myUsername: currentUser.username, targetBindCode: bindCodeInput });
      if (res.data.success) {
        Alert.alert("Success", `已綁定: ${res.data.targetName}`);
        // 更新前端狀態，隱藏輸入框
        updateUserInfo({ ...currentUser, boundTo: 'partner', boundToName: res.data.targetName });
        setBindCodeInput('');
      } else Alert.alert("Error", res.data.message);
    } catch (e) {} finally { setIsBinding(false); }
  };

  // 🚨 新增：解除綁定
  const handleUnbind = () => {
    Alert.alert("解除綁定", "確定要解除與對方的綁定嗎？", [
      { text: "取消", style: "cancel" },
      { 
        text: "確定解除", style: "destructive",
        onPress: async () => {
          try {
            const res = await axios.post(`${API_BASE}/unbind`, { username: currentUser.username });
            if (res.data.success) {
              Alert.alert("成功", "已解除綁定");
              // 更新前端狀態，恢復顯示輸入框
              updateUserInfo({ ...currentUser, boundTo: null, boundToName: null });
            }
          } catch (e) { Alert.alert("錯誤", "無法連線至伺服器"); }
        }
      }
    ]);
  };

  const handleLangChange = async (newLang: string) => {
    setAppLang(newLang);
    axios.post(`${API_BASE}/update-lang`, { username: currentUser.username, lang: newLang }).catch(()=>{});
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.headerTitle}>{ui.setMenu}</Text></View>
      <ScrollView style={{ padding: 20 }}>
        
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{ui.accInfo}</Text>
          <Text style={styles.textGray}>{currentUser.name} ({currentUser.role === 'family' ? 'Family' : 'Caregiver'})</Text>
          <Text style={[styles.textGray, {marginTop: 10}]}>{ui.myCode}<Text style={{ color: '#00c49f', fontWeight: 'bold', fontSize: 18 }}>{currentUser.bindCode || 'None'}</Text></Text>
          <Text style={styles.textGray}>{ui.boundTo}<Text style={styles.textWhite}>{currentUser.boundToName ? `✅ ${currentUser.boundToName}` : '❌ None'}</Text></Text>
        </View>

        {/* 🚨 條件渲染：如果已經綁定，顯示「解除綁定」；如果還沒綁定，才顯示「輸入框」 */}
        {currentUser.boundToName ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{ui.bindSec}</Text>
            <Text style={styles.textWhite}>目前已與【{currentUser.boundToName}】綁定</Text>
            <TouchableOpacity style={[styles.dangerBtn, { marginTop: 15 }]} onPress={handleUnbind}>
              <Text style={styles.btnText}>{ui.unbindBtn}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{ui.bindSec}</Text>
            <TextInput style={styles.input} placeholderTextColor="#888" placeholder={ui.bindPh} keyboardType="numeric" value={bindCodeInput} onChangeText={setBindCodeInput} />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleBind}>
              <Text style={styles.btnText}>{isBinding ? "..." : ui.bindBtn}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{ui.langSec}</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={appLang} onValueChange={handleLangChange} style={{ color: 'white' }} dropdownIconColor="#00c49f">
              <Picker.Item label="繁體中文" value="zh" />
              <Picker.Item label="English" value="en" />
              <Picker.Item label="Indonesian (印尼語)" value="id" />
              <Picker.Item label="Tiếng Việt (越南語)" value="vi" />
              <Picker.Item label="Filipino (菲律賓語)" value="tl" />
              <Picker.Item label="ภาษาไทย (泰語)" value="th" />
            </Picker>
          </View>
        </View>

        <TouchableOpacity style={styles.dangerBtn} onPress={onLogout}>
          <Text style={styles.btnText}>{ui.logout}</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
};
       

// ==========================================
// 頁面 5：血壓監測系統 (全暗黑模式)
// ==========================================
const BloodPressureScreen = ({ currentUser }: { currentUser: User }) => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.headerTitle}>🩸 血壓監測 ({currentUser.name})</Text></View>
      <Text style={{ textAlign: 'center', marginTop: 50, fontSize: 18, color: '#888' }}>血壓模組運作中...</Text>
    </SafeAreaView>
  );
};

// ==========================================
// App 主程式 (狀態管理)
// ==========================================
const Tab = createBottomTabNavigator();

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [customPhrases, setCustomPhrases] = useState<string[]>([]);
  const [appLang, setAppLang] = useState('zh'); // 全域唯一語言變數

  const handleLoginSuccess = async (user: User) => {
    setCurrentUser(user);
    // 登入時讀取該使用者的個人語言設定 (如果沒有則家屬預設中文，看護預設英文)
    if (user.lang) setAppLang(user.lang);
    else setAppLang(user.role === 'family' ? 'zh' : 'en');

    try {
      const res = await axios.get(`${API_BASE}/custom-phrases?username=${user.username}`);
      setCustomPhrases(res.data);
    } catch (error) {}
  };

  if (!currentUser) return <AuthScreen onLogin={handleLoginSuccess} />;
  const isCaregiver = currentUser.role === 'caregiver';

  return (
    <NavigationIndependentTree>
      <NavigationContainer>
        <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: '#00c49f', tabBarStyle: {backgroundColor: '#1a1a1a', borderTopColor: '#333'} }}>
          {isCaregiver ? (
            <Tab.Screen name="Care" children={() => <CaregiverScreen currentUser={currentUser} customPhrases={customPhrases} appLang={appLang} />} options={{ tabBarIcon: () => <Text style={{fontSize: 20}}>🗣️</Text> }} />
          ) : (
            <Tab.Screen name="Family" children={() => <FamilyScreen currentUser={currentUser} customPhrases={customPhrases} setCustomPhrases={setCustomPhrases} appLang={appLang} />} options={{ tabBarIcon: () => <Text style={{fontSize: 20}}>👨‍👩‍👧</Text> }} />
          )}
          {/* 血壓頁面省略... */}
          <Tab.Screen name="Settings" children={() => <SettingsScreen currentUser={currentUser} onLogout={() => setCurrentUser(null)} appLang={appLang} setAppLang={setAppLang} updateUserInfo={setCurrentUser} />} options={{ tabBarIcon: () => <Text style={{fontSize: 20}}>⚙️</Text> }} />
        </Tab.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}

// ==========================================
//  全局暗黑模式樣式表 (Unified Dark Mode)
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: { padding: 15, backgroundColor: '#1e1e1e', flexDirection: 'row', justifyContent: 'center', elevation: 5, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#00c49f' },
  card: { backgroundColor: '#2c2c2c', borderRadius: 8, padding: 20, marginBottom: 15, width: '100%' },
  input: { backgroundColor: '#1e1e1e', color: 'white', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#444', marginBottom: 15, fontSize: 16 },
  primaryBtn: { backgroundColor: '#00c49f', padding: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dangerBtn: { backgroundColor: '#cf1322', padding: 15, borderRadius: 8, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#00c49f', marginBottom: 15 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#aaa', marginBottom: 8 },
  textWhite: { color: 'white', fontSize: 16 },
  textGray: { color: '#aaa', fontSize: 16, marginBottom: 5 },
  pickerContainer: { backgroundColor: '#1e1e1e', borderRadius: 8, borderWidth: 1, borderColor: '#444', overflow: 'hidden', marginBottom: 10 },
  resultText: { color: '#00c49f', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  phraseItem: { backgroundColor: '#2c2c2c', padding: 15, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#444' },
  logCard: { backgroundColor: '#3a1c1c', padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#ff4d4f' }
});