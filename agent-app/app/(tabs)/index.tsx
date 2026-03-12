import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Keyboard, ScrollView, Dimensions } from 'react-native';
import axios from 'axios';
import * as Speech from 'expo-speech';
import { Picker } from '@react-native-picker/picker';
import { LineChart } from 'react-native-chart-kit';

// ⚠️ 請務必將此處改為你電腦的真實 IP
const API_URL = 'http://192.168.0.89:5001'; 
const screenWidth = Dimensions.get("window").width;

// ================= 預設語句與多國語言字典 =================

const systemPhrasesTW = [
  "現在要吃飯了", "請慢慢吃", "要不要喝水？", "我幫你拿水", "現在要休息一下", "該睡覺了", "我要幫你換衣服", "請把手抬起來", "這樣會比較舒服", "我在你旁邊", "要上廁所嗎？", "我陪你一起去", "請慢慢坐下", "已經好了", "現在要吃藥", "這是醫生開的藥", "吃完藥要喝水", "吃完了嗎？", "你哪裡不舒服？", "會不會頭暈？", "會不會想吐？", "有沒有覺得痛？", "是這裡痛嗎？", "你覺得冷嗎？", "你覺得熱嗎？", "呼吸還順嗎？", "心跳會不會很快？", "你聽得到我說話嗎？", "看著我", "不用擔心", "放輕鬆", "慢慢來", "我會幫你", "我在這裡陪你", "不要動", "坐下", "躺好", "慢慢呼吸", "有流血", "我幫你止血", "不要怕", "我在這裡", "我已經叫救護車", "救護車快到了", "很快就會好一點", "請保持清醒", "聽我說話", "你是安全的"
];
const systemPhrasesEN = [
  "Time to eat", "Please eat slowly", "Do you want water?", "I'll get water", "Rest a bit now", "Time to sleep", "I'll help change clothes", "Raise your hand", "This is more comfortable", "I'm beside you", "Need toilet?", "I'll go with you", "Sit down slowly", "It's done", "Time for medicine", "Doctor prescribed this", "Drink water after meds", "Finished?", "Where is uncomfortable?", "Feeling dizzy?", "Feeling nauseous?", "In pain?", "Pain here?", "Feeling cold?", "Feeling hot?", "Breathing okay?", "Heart beating fast?", "Can you hear me?", "Look at me", "Don't worry", "Relax", "Take your time", "I will help you", "I'm here with you", "Don't move", "Sit down", "Lie down", "Breathe slowly", "Bleeding", "I'll stop bleeding", "Don't be afraid", "I am here", "Called ambulance", "Ambulance coming", "Will be better soon", "Stay awake", "Listen to me", "You are safe"
];
const systemPhrasesID = [
  "Waktunya makan", "Makan pelan-pelan", "Mau minum?", "Saya ambilkan air", "Istirahat sebentar", "Waktunya tidur", "Saya ganti bajunya", "Angkat tangan", "Ini lebih nyaman", "Saya di sampingmu", "Mau ke toilet?", "Saya temani", "Duduk pelan-pelan", "Sudah selesai", "Waktunya obat", "Ini obat dokter", "Minum air setelah obat", "Sudah habis?", "Sakit di mana?", "Pusing?", "Mual?", "Ada rasa sakit?", "Sakit di sini?", "Merasa dingin?", "Merasa panas?", "Napas lancar?", "Jantung berdebar?", "Bisa dengar saya?", "Lihat saya", "Jangan khawatir", "Santai saja", "Pelan-pelan", "Saya bantu", "Saya di sini", "Jangan bergerak", "Duduk", "Berbaring", "Napas pelan", "Ada pendarahan", "Saya hentikan darahnya", "Jangan takut", "Saya disini", "Sudah panggil ambulans", "Ambulans segera datang", "Segera membaik", "Tetap sadar", "Dengar saya", "Anda aman"
];
const systemPhrasesTH = [
  "ได้เวลากินข้าว", "ค่อยๆ กิน", "ดื่มน้ำไหม?", "ฉันไปเอาน้ำให้", "พักผ่อนหน่อย", "ได้เวลานอน", "ฉันจะเปลี่ยนเสื้อให้", "ยกมือขึ้น", "แบบนี้สบายกว่า", "ฉันอยู่ข้างๆ", "เข้าห้องน้ำไหม?", "ฉันไปเป็นเพื่อน", "ค่อยๆ นั่งลง", "เสร็จแล้ว", "ได้เวลากินยา", "นี่คือยาหมอสั่ง", "ดื่มน้ำตามเยอะๆ", "กินหมดหรือยัง?", "เจ็บตรงไหน?", "เวียนหัวไหม?", "อยากอาเจียนไหม?", "ปวดไหม?", "เจ็บตรงนี้ไหม?", "หนาวไหม?", "ร้อนไหม?", "หายใจสะดวกไหม?", "ใจสั่นไหม?", "ได้ยินฉันไหม?", "มองหน้าฉัน", "ไม่ต้องห่วง", "ผ่อนคลาย", "ไม่ต้องรีบ", "ฉันจะช่วย", "ฉันอยู่ตรงนี้", "ห้ามขยับ", "นั่งลง", "นอนลง", "หายใจช้าๆ", "มีเลือดออก", "ฉันจะห้ามเลือดให้", "ไม่ต้องกลัว", "ฉันอยู่นี่", "เรียกรถพยาบาลแล้ว", "รถพยาบาลใกล้ถึงแล้ว", "เดี๋ยวก็ดีขึ้น", "ตื่นไว้", "ฟังฉันนะ", "คุณปลอดภัย"
];
const systemPhrasesVI = [
  "Đến giờ ăn rồi", "Ăn từ từ thôi", "Uống nước không?", "Tôi lấy nước cho", "Nghỉ ngơi chút", "Đến giờ ngủ", "Tôi thay đồ cho", "Giơ tay lên", "Thế này dễ chịu hơn", "Tôi ở bên cạnh", "Đi vệ sinh không?", "Tôi đi cùng", "Ngồi xuống từ từ", "Xong rồi", "Đến giờ uống thuốc", "Thuốc bác sĩ kê", "Uống nước sau thuốc", "Xong chưa?", "Đau ở đâu?", "Chóng mặt không?", "Buồn nôn không?", "Có đau không?", "Đau ở đây hả?", "Thấy lạnh không?", "Thấy nóng không?", "Thở được không?", "Tim đập nhanh không?", "Nghe tôi nói không?", "Nhìn tôi này", "Đừng lo lắng", "Thả lỏng ra", "Từ từ thôi", "Tôi sẽ giúp", "Tôi ở đây", "Đừng cử động", "Ngồi xuống", "Nằm xuống", "Thở chậm lại", "Đang chảy máu", "Tôi cầm máu cho", "Đừng sợ", "Tôi ở đây", "Đã gọi cấp cứu", "Xe sắp đến rồi", "Sẽ ổn ngay thôi", "Hãy tỉnh táo", "Nghe tôi nói", "Bạn an toàn rồi"
];

const translations: any = {
  'zh-TW': { appName: '照護系統', loginBtn: '登入', regBtn: '註冊', account: '帳號', password: '密碼', navHome: '首頁', navProfile: '設定', transPlaceholder: '輸入文字 (自動翻成中文)...', transBtn: '翻譯並發音', bindSec: '綁定狀態', myCodeLabel: '我的綁定碼', bindInputLabel: '輸入綁定對象代碼', bindBtn: '確認綁定', unbindBtn: '解除綁定', boundStatus: '已連結：', noBound: '尚未綁定', logout: '登出', customCategory: '自訂語句', systemCategory: '系統預設語句', addBtn: '新增', customPlaceholder: '新增自訂語句...', historySection: '⚠️ 異常與求救紀錄', noHistory: '目前無危險紀錄', refreshBtn: '刷新', phrases: systemPhrasesTW },
  'en': { appName: 'Care System', loginBtn: 'Login', regBtn: 'Register', account: 'Account', password: 'Password', navHome: 'Home', navProfile: 'Settings', transPlaceholder: 'Type text...', transBtn: 'Translate & Speak', bindSec: 'Binding', myCodeLabel: 'My Code', bindInputLabel: 'Partner Code', bindBtn: 'Bind', unbindBtn: 'Unbind', boundStatus: 'Linked: ', noBound: 'Not Linked', logout: 'Logout', customCategory: 'Custom Phrases', systemCategory: 'System Phrases', addBtn: 'Add', customPlaceholder: 'Add phrase...', historySection: '⚠️ Alert History', noHistory: 'No alerts', refreshBtn: 'Refresh', phrases: systemPhrasesEN },
  'id': { appName: 'Sistem Perawatan', loginBtn: 'Masuk', regBtn: 'Daftar', account: 'Akun', password: 'Kata Sandi', navHome: 'Beranda', navProfile: 'Pengaturan', transPlaceholder: 'Ketik teks...', transBtn: 'Terjemahkan', bindSec: 'Tautan', myCodeLabel: 'Kode Saya', bindInputLabel: 'Kode Pasangan', bindBtn: 'Tautkan', unbindBtn: 'Lepas', boundStatus: 'Terkait: ', noBound: 'Belum Terikat', logout: 'Keluar', customCategory: 'Khusus', systemCategory: 'Sistem', addBtn: 'Tambah', customPlaceholder: 'Tambah kalimat...', historySection: '⚠️ Riwayat Bahaya', noHistory: 'Tidak ada riwayat', refreshBtn: 'Segarkan', phrases: systemPhrasesID },
  'th': { appName: 'ระบบดูแล', loginBtn: 'เข้าสู่ระบบ', regBtn: 'ลงทะเบียน', account: 'บัญชี', password: 'รหัสผ่าน', navHome: 'หน้าแรก', navProfile: 'การตั้งค่า', transPlaceholder: 'พิมพ์ข้อความ...', transBtn: 'แปลและพูด', bindSec: 'การเชื่อมต่อ', myCodeLabel: 'รหัสของฉัน', bindInputLabel: 'รหัสคู่หู', bindBtn: 'เชื่อมต่อ', unbindBtn: 'ยกเลิก', boundStatus: 'เชื่อมต่อแล้ว: ', noBound: 'ยังไม่เชื่อมต่อ', logout: 'ออกจากระบบ', customCategory: 'ประโยคกำหนดเอง', systemCategory: 'ประโยคระบบ', addBtn: 'เพิ่ม', customPlaceholder: 'เพิ่มประโยค...', historySection: '⚠️ ประวัติอันตราย', noHistory: 'ไม่มีประวัติ', refreshBtn: 'รีเฟรช', phrases: systemPhrasesTH },
  'vi': { appName: 'Hệ thống Chăm sóc', loginBtn: 'Đăng nhập', regBtn: 'Đăng ký', account: 'Tài khoản', password: 'Mật khẩu', navHome: 'Trang chủ', navProfile: 'Cài đặt', transPlaceholder: 'Nhập văn bản...', transBtn: 'Dịch', bindSec: 'Liên kết', myCodeLabel: 'Mã của tôi', bindInputLabel: 'Mã đối tác', bindBtn: 'Liên kết', unbindBtn: 'Hủy', boundStatus: 'Đã liên kết: ', noBound: 'Chưa liên kết', logout: 'Đăng xuất', customCategory: 'Tùy chỉnh', systemCategory: 'Hệ thống', addBtn: 'Thêm', customPlaceholder: 'Thêm câu...', historySection: '⚠️ Lịch sử Nguy hiểm', noHistory: 'Không có lịch sử', refreshBtn: 'Làm mới', phrases: systemPhrasesVI }
};

const langOptions = [
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'en', name: 'English' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'th', name: 'ไทย (Thai)' }
];

// ================= 主程式 Component =================

export default function App() {
  const [page, setPage] = useState('login'); 
  const [activeTab, setActiveTab] = useState('home'); 
  const [uiLang, setUiLang] = useState('zh-TW');
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regRole, setRegRole] = useState('family');
  const [regLang, setRegLang] = useState('zh-TW');

  const [targetBindCode, setTargetBindCode] = useState('');
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  
  const [customPhrases, setCustomPhrases] = useState<any[]>([]);
  const [newCustomPhrase, setNewCustomPhrase] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  
  const [selectedSysPhrase, setSelectedSysPhrase] = useState('');
  const [selectedCustomPhrase, setSelectedCustomPhrase] = useState('');

  const [sysBP, setSysBP] = useState('');
  const [diaBP, setDiaBP] = useState('');
  const [bpData, setBpData] = useState({ labels: ['無資料'], systolic: [0], diastolic: [0] });

  const t = translations[uiLang] || translations['zh-TW'];

  useEffect(() => {
    if (page === 'main' && currentUser) {
      fetchCustomPhrases();
      if (currentUser.role === 'family' || currentUser.role === 'caregiver') fetchLogs();
      if (currentUser.role === 'family' || currentUser.role === 'care_recipient') fetchBP();
    }
  }, [page, currentUser]);

  const fetchCustomPhrases = async () => {
    if(!currentUser) return;
    try {
      const res = await axios.get(`${API_URL}/custom-phrases`, { params: { username: currentUser.username } });
      setCustomPhrases(res.data);
    } catch (e) { console.error(e); }
  };

  const fetchLogs = async () => {
    try {
      const res = await axios.get(`${API_URL}/logs`, { params: { username: currentUser.username } });
      setLogs(res.data);
    } catch (e) { console.error(e); }
  };

  const fetchBP = async () => {
    const target = currentUser.role === 'care_recipient' ? currentUser.username : currentUser.patientBoundTo;
    if(!target) return;
    try {
      const res = await axios.get(`${API_URL}/bp?username=${target}`);
      if(res.data && res.data.length > 0) {
        const labels = res.data.map((d: any) => new Date(d.timestamp).getDate() + '日');
        const sys = res.data.map((d: any) => d.systolic);
        const dia = res.data.map((d: any) => d.diastolic);
        setBpData({ labels, systolic: sys, diastolic: dia });
      } else {
        setBpData({ labels: ['無資料'], systolic: [0], diastolic: [0] });
      }
    } catch(e) {}
  };

  // --- API 操作函式 ---

  const handleLogin = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/login`, { username, password });
      if (res.data.success) {
        setCurrentUser(res.data.user);
        setUiLang(res.data.user.lang || 'zh-TW');
        setPage('main'); setActiveTab('home');
      } else { Alert.alert('錯誤', '帳號或密碼錯誤'); }
    } catch (e) { Alert.alert('錯誤', '連線失敗'); } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!regUsername || !regPassword || !regName) return Alert.alert('提示', '請填寫所有欄位');
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/register`, {
        username: regUsername, password: regPassword, name: regName, role: regRole, lang: regLang
      });
      if (res.data.success) { 
        Alert.alert('成功', '註冊成功！請登入。'); 
        setPage('login'); 
      } else { Alert.alert('錯誤', res.data.message); }
    } catch (e) { Alert.alert('錯誤', '連線失敗'); } finally { setLoading(false); }
  };

  const executeTranslation = async (sourceText: string) => {
    if (!sourceText) return;
    Keyboard.dismiss(); setLoading(true); setTranslatedText('...');
    try {
      const res = await axios.post(`${API_URL}/translate`, { text: sourceText, targetLang: 'zh-TW' });
      const finalResult = res.data.translatedText;
      setTranslatedText(finalResult);
      Speech.speak(finalResult, { language: 'zh-TW' });
      await axios.post(`${API_URL}/track-phrase`, { username: currentUser.username, phrase: finalResult });
    } catch (e) { setTranslatedText('Error'); } finally { setLoading(false); }
  };

  const handleAddCustomPhrase = async () => {
    if (!newCustomPhrase) return;
    try {
      const res = await axios.post(`${API_URL}/custom-phrases`, { username: currentUser.username, phrase: newCustomPhrase });
      if (res.data.success) { setCustomPhrases(res.data.phrases); setNewCustomPhrase(''); }
    } catch (e) { Alert.alert('錯誤', '新增失敗'); }
  };

  const handleDeleteCustomPhrase = async (id: string) => {
    try {
      const res = await axios.delete(`${API_URL}/custom-phrases`, { data: { username: currentUser.username, phraseId: id } });
      if (res.data.success) { setCustomPhrases(res.data.phrases); }
    } catch (e) { Alert.alert('錯誤', '刪除失敗'); }
  };

  const handleBind = async (targetRoleType: string) => {
    try {
      const res = await axios.post(`${API_URL}/bind`, { myUsername: currentUser.username, targetBindCode });
      if (res.data.success) {
        Alert.alert('成功', '綁定成功');
        const userRes = await axios.post(`${API_URL}/login`, { username: currentUser.username, password: currentUser.password });
        if(userRes.data.success) {
          setCurrentUser(userRes.data.user);
          fetchCustomPhrases();
          if(userRes.data.user.role === 'family') { fetchLogs(); fetchBP(); }
        }
        setTargetBindCode('');
      } else { Alert.alert('錯誤', res.data.message); }
    } catch (e) { Alert.alert('錯誤', '綁定失敗'); }
  };

  const handleUnbind = async (type: string) => {
    try {
      const res = await axios.post(`${API_URL}/unbind`, { username: currentUser.username, type });
      if(res.data.success) {
        Alert.alert('成功', '已解除綁定');
        const userRes = await axios.post(`${API_URL}/login`, { username: currentUser.username, password: currentUser.password });
        if(userRes.data.success) setCurrentUser(userRes.data.user);
        setCustomPhrases([]); setLogs([]);
      }
    } catch(e) {}
  };

  const handleSOS = async () => {
    try {
      await axios.post(`${API_URL}/track-phrase`, { username: currentUser.username, phrase: "🆘 SOS 緊急求救！(系統觸發)" });
      Alert.alert("已通知", "已通知家屬與看護，請稍候");
    } catch(e) {}
  };

  const handleAddBP = async () => {
    if(!sysBP || !diaBP) return Alert.alert("錯誤", "請輸入完整血壓數據");
    try {
      await axios.post(`${API_URL}/bp`, { username: currentUser.username, systolic: sysBP, diastolic: diaBP });
      setSysBP(''); setDiaBP('');
      Alert.alert("成功", "血壓紀錄已新增");
      fetchBP();
    } catch(e) {}
  };

  // ================= 畫面渲染 =================

  // 1. 登入畫面
  if (page === 'login') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t.appName}</Text>
        <TextInput style={styles.input} placeholder={t.account} placeholderTextColor="#888" value={username} onChangeText={setUsername} autoCapitalize="none" />
        <TextInput style={styles.input} placeholder={t.password} placeholderTextColor="#888" value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin} disabled={loading}><Text style={styles.btnText}>{t.loginBtn}</Text></TouchableOpacity>
        <TouchableOpacity style={{marginTop: 20}} onPress={() => setPage('register')}><Text style={styles.linkText}>沒有帳號？點此註冊 ➡</Text></TouchableOpacity>
      </View>
    );
  }

  // 2. 註冊畫面
  if (page === 'register') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>註冊新帳號</Text>
        
        <Text style={styles.label}>選擇身分：</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
          <TouchableOpacity style={[styles.roleBtn, { backgroundColor: regRole === 'family' ? '#00bfa5' : '#333' }]} onPress={() => setRegRole('family')}><Text style={styles.roleText}>👨‍👩‍👧 家屬</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.roleBtn, { backgroundColor: regRole === 'caregiver' ? '#00bfa5' : '#333' }]} onPress={() => setRegRole('caregiver')}><Text style={styles.roleText}>👩‍⚕️ 看護</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.roleBtn, { backgroundColor: regRole === 'care_recipient' ? '#00bfa5' : '#333' }]} onPress={() => setRegRole('care_recipient')}><Text style={styles.roleText}>👴 長輩</Text></TouchableOpacity>
        </View>

        <Text style={styles.label}>選擇預設語言：</Text>
        <View style={styles.pickerContainer}>
          <Picker selectedValue={regLang} onValueChange={(v) => setRegLang(v)} style={{color: 'white'}}>
            {langOptions.map(l => <Picker.Item key={l.code} label={l.name} value={l.code} />)}
          </Picker>
        </View>

        <TextInput style={styles.input} placeholder="設定帳號" placeholderTextColor="#888" value={regUsername} onChangeText={setRegUsername} autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="設定密碼" placeholderTextColor="#888" value={regPassword} onChangeText={setRegPassword} secureTextEntry />
        <TextInput style={styles.input} placeholder="您的姓名" placeholderTextColor="#888" value={regName} onChangeText={setRegName} />
        
        <TouchableOpacity style={styles.primaryBtn} onPress={handleRegister} disabled={loading}><Text style={styles.btnText}>確認註冊</Text></TouchableOpacity>
        <TouchableOpacity style={{marginTop: 20}} onPress={() => setPage('login')}><Text style={styles.linkText}>⬅ 返回登入</Text></TouchableOpacity>
      </View>
    );
  }

  // 3. 主畫面
  if (page === 'main') {
    return (
      <View style={{flex: 1, backgroundColor: '#121212'}}>
        <ScrollView contentContainerStyle={{padding: 20, paddingBottom: 80}}>
          
          {activeTab === 'home' && (
            <View>
              <Text style={styles.headerText}>{currentUser?.name} ({currentUser?.role === 'family' ? '家屬' : currentUser?.role === 'caregiver' ? '看護' : '受照顧者'})</Text>
              
              {/* === A. 家屬端首頁 === */}
              {currentUser?.role === 'family' && (
                <View>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                    <Text style={styles.sectionTitle}>{t.historySection}</Text>
                    <TouchableOpacity onPress={fetchLogs}><Text style={{color: '#00bfa5'}}>{t.refreshBtn}</Text></TouchableOpacity>
                  </View>
                  <View style={styles.card}>
                    {logs.length === 0 ? <Text style={{color: '#777', textAlign: 'center'}}>{t.noHistory}</Text> : (
                      logs.map((log, idx) => (
                        <View key={idx} style={styles.logItem}>
                          <Text style={{color: '#ff5252', fontWeight: 'bold', fontSize: 16}}>{log.phrase}</Text>
                          <Text style={{color: '#777', fontSize: 12}}>{log.senderName} • {log.time}</Text>
                        </View>
                      ))
                    )}
                  </View>

                  <Text style={[styles.sectionTitle, {marginTop: 20}]}>{t.customCategory}</Text>
                  <View style={{flexDirection: 'row', marginBottom: 15}}>
                    <TextInput style={[styles.input, {flex: 1, marginBottom: 0, marginRight: 10}]} placeholder={t.customPlaceholder} placeholderTextColor="#888" value={newCustomPhrase} onChangeText={setNewCustomPhrase} />
                    <TouchableOpacity style={[styles.primaryBtn, {width: 80, padding: 0, justifyContent: 'center'}]} onPress={handleAddCustomPhrase}><Text style={styles.btnText}>{t.addBtn}</Text></TouchableOpacity>
                  </View>
                  <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
                    {customPhrases.map((p, idx) => (
                      <View key={idx} style={styles.customChipBox}>
                        <Text style={styles.chipText}>{p['zh-TW']}</Text>
                        <TouchableOpacity onPress={() => handleDeleteCustomPhrase(p.id)} style={{marginLeft: 10}}><Text style={{color: '#ff5252', fontWeight: 'bold'}}>✕</Text></TouchableOpacity>
                      </View>
                    ))}
                  </View>

                  {currentUser.patientBoundTo && (
                    <View style={{marginTop: 20}}>
                      <Text style={styles.sectionTitle}>📈 長輩血壓趨勢 ({currentUser.patientBoundToName})</Text>
                      <LineChart 
                        data={{labels: bpData.labels, datasets: [{ data: bpData.systolic, color: () => `rgba(255, 99, 132, 1)` }, { data: bpData.diastolic, color: () => `rgba(54, 162, 235, 1)` }], legend: ["收縮壓", "舒張壓"]}} 
                        width={screenWidth - 40} height={220} bezier 
                        chartConfig={{ backgroundColor: '#1e1e1e', backgroundGradientFrom: '#1e1e1e', backgroundGradientTo: '#1e1e1e', color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})` }} 
                        style={{ borderRadius: 16 }} 
                      />
                    </View>
                  )}
                </View>
              )}

              {/* === B. 看護端首頁 === */}
              {currentUser?.role === 'caregiver' && (
                <View>
                   <Text style={styles.sectionTitle}>⚠️ 最新警報</Text>
                   {logs.length > 0 && (
                     <View style={[styles.card, {borderColor: '#ff5252', marginBottom: 20}]}>
                       <Text style={{color: '#ff5252', fontWeight: 'bold'}}>{logs[0].phrase}</Text>
                       <Text style={{color: '#777', fontSize: 12}}>{logs[0].senderName} • {logs[0].time}</Text>
                     </View>
                   )}

                  <TextInput style={[styles.input, styles.textArea]} placeholder={t.transPlaceholder} placeholderTextColor="#888" value={inputText} onChangeText={setInputText} multiline />
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => executeTranslation(inputText)} disabled={loading}>
                    {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>{t.transBtn}</Text>}
                  </TouchableOpacity>
                  <View style={styles.resultBox}><Text style={styles.resultText}>{translatedText}</Text></View>

                  <Text style={styles.sectionTitle}>{t.systemCategory}</Text>
                  <View style={styles.pickerContainer}>
                    <Picker selectedValue={selectedSysPhrase} onValueChange={(val) => { setSelectedSysPhrase(val); if(val) { setInputText(val); executeTranslation(val); } }} style={{color: 'white'}}>
                      <Picker.Item label={`-- ${t.systemCategory} --`} value="" />
                      {t.phrases.map((phrase: string, idx: number) => <Picker.Item key={idx} label={phrase} value={phrase} />)}
                    </Picker>
                  </View>

                  {customPhrases.length > 0 && (
                    <View>
                      <Text style={styles.sectionTitle}>{t.customCategory}</Text>
                      <View style={styles.pickerContainer}>
                        <Picker selectedValue={selectedCustomPhrase} onValueChange={(val) => { setSelectedCustomPhrase(val); if(val) { setInputText(val); executeTranslation(val); } }} style={{color: 'white'}}>
                          <Picker.Item label={`-- ${t.customCategory} --`} value="" />
                          {customPhrases.map((p, idx) => <Picker.Item key={idx} label={p[uiLang] || p['zh-TW']} value={p[uiLang] || p['zh-TW']} />)}
                        </Picker>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* === C. 受照顧者端首頁 === */}
              {currentUser?.role === 'care_recipient' && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{color: '#aaa', marginBottom: 20}}>若有緊急狀況，請按下紅色按鈕</Text>
                  
                  <TouchableOpacity style={styles.sosButton} onPress={handleSOS}>
                    <Text style={styles.sosTitle}>SOS</Text>
                    <Text style={styles.sosSub}>緊急求助</Text>
                  </TouchableOpacity>

                  <View style={{width: '100%', marginTop: 30}}>
                    <Text style={styles.sectionTitle}>🩸 記錄今日血壓</Text>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                      <TextInput style={[styles.input, {flex: 1, marginRight: 10}]} placeholder="收縮壓 (高)" placeholderTextColor="#888" keyboardType="numeric" value={sysBP} onChangeText={setSysBP} />
                      <TextInput style={[styles.input, {flex: 1, marginRight: 10}]} placeholder="舒張壓 (低)" placeholderTextColor="#888" keyboardType="numeric" value={diaBP} onChangeText={setDiaBP} />
                      <TouchableOpacity style={[styles.primaryBtn, {width: 80, justifyContent: 'center', padding: 0}]} onPress={handleAddBP}><Text style={styles.btnText}>儲存</Text></TouchableOpacity>
                    </View>

                    <Text style={styles.sectionTitle}>📈 近期血壓趨勢</Text>
                    <LineChart
                      data={{
                        labels: bpData.labels,
                        datasets: [
                          { data: bpData.systolic, color: () => `rgba(255, 99, 132, 1)` },
                          { data: bpData.diastolic, color: () => `rgba(54, 162, 235, 1)` }
                        ],
                        legend: ["收縮壓", "舒張壓"]
                      }}
                      width={screenWidth - 40} height={220} bezier
                      chartConfig={{ backgroundColor: '#1e1e1e', backgroundGradientFrom: '#1e1e1e', backgroundGradientTo: '#1e1e1e', color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`, labelColor: (opacity = 1) => `rgba(150, 150, 150, ${opacity})` }}
                      style={{ borderRadius: 16, marginVertical: 8 }}
                    />
                  </View>
                </View>
              )}
            </View>
          )}

          {activeTab === 'profile' && (
            <View>
              <Text style={styles.headerText}>{t.navProfile}</Text>
              <Text style={styles.sectionTitle}>🌐 語言 / Language</Text>
              <View style={styles.pickerContainer}>
                <Picker selectedValue={uiLang} onValueChange={(itemValue) => setUiLang(itemValue)} style={{color: 'white'}}>
                  {langOptions.map(l => <Picker.Item key={l.code} label={l.name} value={l.code} />)}
                </Picker>
              </View>

              <Text style={styles.sectionTitle}>🔗 {t.bindSec}</Text>
              <View style={styles.card}>
                <Text style={{color: '#fff', fontSize: 16, marginBottom: 10}}>{t.myCodeLabel}: <Text style={{color: '#00bfa5', fontWeight: 'bold'}}>{currentUser.bindCode}</Text></Text>
                
                {currentUser.role === 'family' ? (
                  <>
                    <View style={{marginBottom: 15, paddingBottom: 15, borderBottomWidth: 1, borderColor: '#333'}}>
                      <Text style={{color: '#aaa', marginBottom: 5}}>👩‍⚕️ 綁定看護：</Text>
                      {currentUser.boundToName ? (
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                          <Text style={{color: '#00bfa5'}}>{currentUser.boundToName}</Text>
                          <TouchableOpacity style={[styles.primaryBtn, {backgroundColor: '#333', paddingVertical: 5, paddingHorizontal: 15}]} onPress={() => handleUnbind('caregiver')}><Text style={{color: '#fff'}}>解除</Text></TouchableOpacity>
                        </View>
                      ) : (
                        <View style={{flexDirection: 'row'}}>
                          <TextInput style={[styles.input, {flex: 1, marginBottom: 0, marginRight: 10}]} placeholder="輸入看護代碼" placeholderTextColor="#888" value={targetBindCode} onChangeText={setTargetBindCode} />
                          <TouchableOpacity style={[styles.primaryBtn, {width: 80, padding: 0, justifyContent: 'center'}]} onPress={() => handleBind('caregiver')}><Text style={styles.btnText}>綁定</Text></TouchableOpacity>
                        </View>
                      )}
                    </View>
                    <View>
                      <Text style={{color: '#aaa', marginBottom: 5}}>👴 綁定長輩：</Text>
                      {currentUser.patientBoundToName ? (
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                          <Text style={{color: '#00bfa5'}}>{currentUser.patientBoundToName}</Text>
                          <TouchableOpacity style={[styles.primaryBtn, {backgroundColor: '#333', paddingVertical: 5, paddingHorizontal: 15}]} onPress={() => handleUnbind('patient')}><Text style={{color: '#fff'}}>解除</Text></TouchableOpacity>
                        </View>
                      ) : (
                        <View style={{flexDirection: 'row'}}>
                          <TextInput style={[styles.input, {flex: 1, marginBottom: 0, marginRight: 10}]} placeholder="輸入長輩代碼" placeholderTextColor="#888" value={targetBindCode} onChangeText={setTargetBindCode} />
                          <TouchableOpacity style={[styles.primaryBtn, {width: 80, padding: 0, justifyContent: 'center'}]} onPress={() => handleBind('patient')}><Text style={styles.btnText}>綁定</Text></TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </>
                ) : (
                  <View>
                     {currentUser.boundToName || currentUser.patientBoundToName ? (
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                          <Text style={{color: '#00bfa5'}}>{currentUser.boundToName || currentUser.patientBoundToName}</Text>
                          <TouchableOpacity style={[styles.primaryBtn, {backgroundColor: '#333', paddingVertical: 5, paddingHorizontal: 15}]} onPress={() => handleUnbind(currentUser.role === 'caregiver' ? 'caregiver' : 'patient')}><Text style={{color: '#fff'}}>解除</Text></TouchableOpacity>
                        </View>
                     ) : (
                        <View style={{flexDirection: 'row'}}>
                          <TextInput style={[styles.input, {flex: 1, marginBottom: 0, marginRight: 10}]} placeholder="輸入家屬代碼" placeholderTextColor="#888" value={targetBindCode} onChangeText={setTargetBindCode} />
                          <TouchableOpacity style={[styles.primaryBtn, {width: 80, padding: 0, justifyContent: 'center'}]} onPress={() => handleBind('family')}><Text style={styles.btnText}>綁定</Text></TouchableOpacity>
                        </View>
                     )}
                  </View>
                )}
              </View>

              <TouchableOpacity style={[styles.primaryBtn, {backgroundColor: '#cf6679', marginTop: 30}]} onPress={() => { setPage('login'); setCurrentUser(null); }}>
                <Text style={[styles.btnText, {color: '#000'}]}>{t.logout}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('home')}>
            <Text style={{fontSize: 24}}>🏠</Text>
            <Text style={{color: activeTab === 'home' ? '#00bfa5' : '#777', fontSize: 12, marginTop: 4}}>{t.navHome}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('profile')}>
            <Text style={{fontSize: 24}}>⚙️</Text>
            <Text style={{color: activeTab === 'profile' ? '#00bfa5' : '#777', fontSize: 12, marginTop: 4}}>{t.navProfile}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  return null;
}

// ================= 樣式設定 =================

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#121212', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 30, textAlign: 'center' },
  headerText: { fontSize: 22, color: '#00bfa5', fontWeight: 'bold', marginBottom: 20, marginTop: 20 },
  label: { fontSize: 14, color: '#aaa', marginTop: 10, marginBottom: 5 },
  sectionTitle: { fontSize: 14, color: '#777', marginVertical: 10, fontWeight: 'bold' },
  input: { backgroundColor: '#2c2c2c', color: '#fff', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#333', marginBottom: 15, fontSize: 16 },
  textArea: { height: 100, textAlignVertical: 'top' },
  primaryBtn: { backgroundColor: '#00bfa5', padding: 15, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  linkText: { color: '#00bfa5', textAlign: 'center', fontSize: 16, textDecorationLine: 'underline' },
  resultBox: { minHeight: 80, padding: 15, backgroundColor: '#1e1e1e', borderRadius: 8, justifyContent: 'center', borderColor: '#333', borderWidth: 1, marginBottom: 20 },
  resultText: { fontSize: 20, color: '#00bfa5', fontWeight: 'bold' },
  customChipBox: { flexDirection: 'row', backgroundColor: '#333', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, marginRight: 10, marginBottom: 10, borderWidth: 1, borderColor: '#00bfa5', alignItems: 'center' },
  chipText: { color: '#ddd', fontSize: 14 },
  card: { backgroundColor: '#1e1e1e', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  logItem: { borderLeftWidth: 4, borderLeftColor: '#ff5252', paddingLeft: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
  pickerContainer: { backgroundColor: '#2c2c2c', borderRadius: 8, borderWidth: 1, borderColor: '#333', marginBottom: 20 },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 70, backgroundColor: '#1e1e1e', borderTopWidth: 1, borderColor: '#333', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  navItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  roleBtn: { flex: 1, padding: 12, borderRadius: 8, marginHorizontal: 3, alignItems: 'center' },
  roleText: { fontWeight: 'bold', color: '#fff' },
  sosButton: {
    width: 200, height: 200, borderRadius: 100, backgroundColor: '#ff3b30',
    justifyContent: 'center', alignItems: 'center',
    elevation: 15, shadowColor: '#ff3b30', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.8, shadowRadius: 20, borderWidth: 8, borderColor: '#ff8a84'
  },
  sosTitle: { fontSize: 60, fontWeight: '900', color: '#fff', letterSpacing: 2 },
  sosSub: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginTop: -5 }
});