import { useState, useEffect } from 'react'
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Toast } from '@capacitor/toast';
import axios from 'axios'
import './App.css'

//介面
const translations = {
  'zh-TW': {
    appName: 'demo',
    loginTitle: '人員登入',
    registerTitle: '註冊新帳號',
    account: '帳號',
    password: '密碼',
    name: '您的姓名',
    roleLabel: '選擇身分',
    langLabel: '選擇語言',
    roleFamily: '👨‍👩‍👧 家屬 (Family)',
    roleCaregiver: '👩‍⚕️ 看護 (Caregiver)',
    loginBtn: '登入',
    regBtn: '註冊帳號',
    toRegBtn: '沒有帳號？去註冊 ➡',
    toLoginBtn: '已有帳號？去登入 ➡',
    navHome: '首頁',
    navProfile: '設定',
    familyHomeTitle: '照護管理',
    historySection: '⚠️ 異常紀錄 (僅顯示危險項目)',
    customSection: '自訂語句',
    noHistory: '目前無危險紀錄',
    refreshBtn: '刷新',
    addBtn: '新增',
    adding: '翻譯中...',
    customPlaceholder: '輸入中文...',
    transTitle: '溝通介面',
    transPlaceholder: '輸入文字 (自動翻成中文)...',
    transBtn: '翻譯並發音', 
    quickPhrasesTitle: '常用語句 (選擇後自動翻譯發音)',
    customCategory: '自訂選項',
    systemCategory: '系統選項',
    profileTitle: '設定',
    accountSec: '帳號與安全性',
    bindSec: '綁定狀態',
    prefSec: '偏好設定',
    myCodeLabel: '我的綁定碼',
    bindInputLabel: '綁定對象代碼',
    bindBtn: '確認綁定',
    unbindBtn: '解除綁定',
    boundStatus: '已連結：',
    noBound: '尚未綁定',
    changeLangLabel: '介面語言',
    logout: '登出',
    regSuccess: '註冊成功',
    loginFailed: '帳號或密碼錯誤，請再試一次',
    phrases: [
      "現在要吃飯了", "請慢慢吃", "要不要喝水？", "我幫你拿水", 
      "現在要休息一下", "該睡覺了", "我要幫你換衣服", "請把手抬起來", 
      "這樣會比較舒服", "我在你旁邊", "要上廁所嗎？", "我陪你一起去", 
      "請慢慢坐下", "已經好了", "現在要吃藥", "這是醫生開的藥", 
      "吃完藥要喝水", "吃完了嗎？", "你哪裡不舒服？", "會不會頭暈？", 
      "會不會想吐？", "有沒有覺得痛？", "是這裡痛嗎？", "你覺得冷嗎？", 
      "你覺得熱嗎？", "呼吸還順嗎？", "心跳會不會很快？", "你聽得到我說話嗎？", 
      "看著我", "不用擔心", "放輕鬆", "慢慢來", "我會幫你", 
      "我在這裡陪你", "不要動", "坐下", "躺好", "慢慢呼吸", 
      "有流血", "我幫你止血", "不要怕", "我在這裡", "我已經叫救護車", 
      "救護車快到了", "很快就會好一點", "請保持清醒", "聽我說話", "你是安全的"
    ]
  },
  'en': {
    appName: 'demo',
    loginTitle: 'Login',
    registerTitle: 'Register',
    account: 'Username',
    password: 'Password',
    name: 'Name',
    roleLabel: 'Role',
    langLabel: 'Language',
    roleFamily: 'Family',
    roleCaregiver: 'Caregiver',
    loginBtn: 'Login',
    regBtn: 'Register',
    toRegBtn: 'Register ➡',
    toLoginBtn: 'Login ➡',
    navHome: 'Home',
    navProfile: 'Settings',
    familyHomeTitle: 'Management',
    historySection: '⚠️ Alert History (Danger Only)',
    customSection: 'Custom Phrases',
    noHistory: 'No alerts',
    refreshBtn: 'Refresh',
    addBtn: 'Add',
    adding: '...',
    customPlaceholder: 'New phrase...',
    transTitle: 'Translate',
    transPlaceholder: 'Type text (Auto to Chinese)...',
    transBtn: 'Translate & Speak',
    quickPhrasesTitle: 'Library (Select to Speak)',
    customCategory: 'Custom',
    systemCategory: 'System',
    profileTitle: 'Settings',
    accountSec: 'Account & Security',
    bindSec: 'Binding',
    prefSec: 'Preferences',
    myCodeLabel: 'My Code',
    bindInputLabel: 'Partner Code',
    bindBtn: 'Bind',
    unbindBtn: 'Unbind',
    boundStatus: 'Linked:',
    noBound: 'Not Linked',
    changeLangLabel: 'Language',
    logout: 'Logout',
    regSuccess: 'Registration Successful',
    loginFailed: 'Incorrect username or password',
    phrases: [
      "Time to eat", "Please eat slowly", "Do you want water?", "I'll get water",
      "Rest a bit now", "Time to sleep", "I'll help change clothes", "Raise your hand",
      "This is more comfortable", "I'm beside you", "Need toilet?", "I'll go with you",
      "Sit down slowly", "It's done", "Time for medicine", "Doctor prescribed this",
      "Drink water after meds", "Finished?", "Where is uncomfortable?", "Feeling dizzy?",
      "Feeling nauseous?", "In pain?", "Pain here?", "Feeling cold?",
      "Feeling hot?", "Breathing okay?", "Heart beating fast?", "Can you hear me?",
      "Look at me", "Don't worry", "Relax", "Take your time", "I will help you",
      "I'm here with you", "Don't move", "Sit down", "Lie down", "Breathe slowly",
      "Bleeding", "I'll stop bleeding", "Don't be afraid", "I am here", "Called ambulance",
      "Ambulance coming", "Will be better soon", "Stay awake", "Listen to me", "You are safe"
    ]
  },
  'id': { 
    appName: 'demo', 
    loginTitle: 'Masuk', 
    loginBtn: 'Masuk', 
    navHome: 'Beranda', 
    navProfile: 'Pengaturan', 
    profileTitle: 'Pengaturan', 
    accountSec: 'Akun & Keamanan', 
    bindSec: 'Tautan', 
    prefSec: 'Preferensi', 
    regSuccess: 'Pendaftaran Berhasil',
    loginFailed: 'Nama pengguna atau kata sandi salah',
    phrases: [
      "Waktunya makan", "Makan pelan-pelan", "Mau minum?", "Saya ambilkan air",
      "Istirahat sebentar", "Waktunya tidur", "Saya ganti bajunya", "Angkat tangan",
      "Ini lebih nyaman", "Saya di sampingmu", "Mau ke toilet?", "Saya temani",
      "Duduk pelan-pelan", "Sudah selesai", "Waktunya obat", "Ini obat dokter",
      "Minum air setelah obat", "Sudah habis?", "Sakit di mana?", "Pusing?",
      "Mual?", "Ada rasa sakit?", "Sakit di sini?", "Merasa dingin?",
      "Merasa panas?", "Napas lancar?", "Jantung berdebar?", "Bisa dengar saya?",
      "Lihat saya", "Jangan khawatir", "Santai saja", "Pelan-pelan", "Saya bantu",
      "Saya di sini", "Jangan bergerak", "Duduk", "Berbaring", "Napas pelan",
      "Ada pendarahan", "Saya hentikan darahnya", "Jangan takut", "Saya disini", "Sudah panggil ambulans",
      "Ambulans segera datang", "Segera membaik", "Tetap sadar", "Dengar saya", "Anda aman"
    ] 
  },
  'th': { 
    appName: 'demo', 
    loginTitle: 'เข้าสู่ระบบ', 
    loginBtn: 'เข้าสู่ระบบ', 
    navHome: 'หน้าแรก', 
    navProfile: 'การตั้งค่า', 
    profileTitle: 'การตั้งค่า', 
    accountSec: 'บัญชี', 
    bindSec: 'การเชื่อมต่อ', 
    prefSec: 'การตั้งค่า', 
    regSuccess: 'ลงทะเบียนสำเร็จ',
    loginFailed: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    phrases: [
      "ได้เวลากินข้าว", "ค่อยๆ กิน", "ดื่มน้ำไหม?", "ฉันไปเอาน้ำให้",
      "พักผ่อนหน่อย", "ได้เวลานอน", "ฉันจะเปลี่ยนเสื้อให้", "ยกมือขึ้น",
      "แบบนี้สบายกว่า", "ฉันอยู่ข้างๆ", "เข้าห้องน้ำไหม?", "ฉันไปเป็นเพื่อน",
      "ค่อยๆ นั่งลง", "เสร็จแล้ว", "ได้เวลากินยา", "นี่คือยาหมอสั่ง",
      "ดื่มน้ำตามเยอะๆ", "กินหมดหรือยัง?", "เจ็บตรงไหน?", "เวียนหัวไหม?",
      "อยากอาเจียนไหม?", "ปวดไหม?", "เจ็บตรงนี้ไหม?", "หนาวไหม?",
      "ร้อนไหม?", "หายใจสะดวกไหม?", "ใจสั่นไหม?", "ได้ยินฉันไหม?",
      "มองหน้าฉัน", "ไม่ต้องห่วง", "ผ่อนคลาย", "ไม่ต้องรีบ", "ฉันจะช่วย",
      "ฉันอยู่ตรงนี้", "ห้ามขยับ", "นั่งลง", "นอนลง", "หายใจช้าๆ",
      "มีเลือดออก", "ฉันจะห้ามเลือดให้", "ไม่ต้องกลัว", "ฉันอยู่นี่", "เรียกรถพยาบาลแล้ว",
      "รถพยาบาลใกล้ถึงแล้ว", "เดี๋ยวก็ดีขึ้น", "ตื่นไว้", "ฟังฉันนะ", "คุณปลอดภัย"
    ] 
  },
  'vi': { 
    appName: 'demo', 
    loginTitle: 'Đăng nhập', 
    loginBtn: 'Đăng nhập', 
    navHome: 'Trang chủ', 
    navProfile: 'Cài đặt', 
    profileTitle: 'Cài đặt', 
    accountSec: 'Tài khoản', 
    bindSec: 'Liên kết', 
    prefSec: 'Tùy chọn', 
    regSuccess: 'Đăng ký thành công',
    loginFailed: 'Tên đăng nhập hoặc mật khẩu sai',
    phrases: [
      "Đến giờ ăn rồi", "Ăn từ từ thôi", "Uống nước không?", "Tôi lấy nước cho",
      "Nghỉ ngơi chút", "Đến giờ ngủ", "Tôi thay đồ cho", "Giơ tay lên",
      "Thế này dễ chịu hơn", "Tôi ở bên cạnh", "Đi vệ sinh không?", "Tôi đi cùng",
      "Ngồi xuống từ từ", "Xong rồi", "Đến giờ uống thuốc", "Thuốc bác sĩ kê",
      "Uống nước sau thuốc", "Xong chưa?", "Đau ở đâu?", "Chóng mặt không?",
      "Buồn nôn không?", "Có đau không?", "Đau ở đây hả?", "Thấy lạnh không?",
      "Thấy nóng không?", "Thở được không?", "Tim đập nhanh không?", "Nghe tôi nói không?",
      "Nhìn tôi này", "Đừng lo lắng", "Thả lỏng ra", "Từ từ thôi", "Tôi sẽ giúp",
      "Tôi ở đây", "Đừng cử động", "Ngồi xuống", "Nằm xuống", "Thở chậm lại",
      "Đang chảy máu", "Tôi cầm máu cho", "Đừng sợ", "Tôi ở đây", "Đã gọi cấp cứu",
      "Xe sắp đến rồi", "Sẽ ổn ngay thôi", "Hãy tỉnh táo", "Nghe tôi nói", "Bạn an toàn rồi"
    ] 
  }
};

const languages = [
  { code: 'zh-TW', name: '繁體中文 (Traditional Chinese)' },
  { code: 'en', name: 'English' },
  { code: 'id', name: 'Bahasa Indonesia' }, 
  { code: 'th', name: 'ไทย (Thai)' },
  { code: 'vi', name: 'Tiếng Việt (Vietnamese)' }
];

function App() {
  const savedLang = localStorage.getItem('appLang');
  const initialLang = (savedLang === 'zh-CN' || !savedLang) ? 'zh-TW' : savedLang;

  const [page, setPage] = useState('login'); 
  const [activeTab, setActiveTab] = useState('home');
  const [uiLang, setUiLang] = useState(initialLang);

  const [topMessage, setTopMessage] = useState('');

  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  
  const [regUser, setRegUser] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regName, setRegName] = useState('');
  const [regRole, setRegRole] = useState('family'); 
  const [regLang, setRegLang] = useState('zh-TW');

  const [currentUser, setCurrentUser] = useState(null);
  const [targetBindCode, setTargetBindCode] = useState('');
  
  const [logs, setLogs] = useState([]); 
  const [customPhrases, setCustomPhrases] = useState([]); 
  const [newPhrase, setNewPhrase] = useState(''); 
  const [isAdding, setIsAdding] = useState(false); 
  
  const [text, setText] = useState('');
  const [translateResult, setTranslateResult] = useState('');
  const [loading, setLoading] = useState(false);
  
  //IP位址
  const myIP = '192.168.0.89'; 
  const API_URL = `http://${myIP}:5001`;

  const t = translations[uiLang] || translations['en']; 
  const safeT = (key) => t[key] || translations['en'][key] || key;

  const handleSetLanguage = (langCode) => {
    setUiLang(langCode);
    localStorage.setItem('appLang', langCode);
  };

  //語音
  const speakText = async (textToSpeak) => {
    if (!textToSpeak) return;
    const ttsLang = 'zh-TW'; 

    try {
      await TextToSpeech.stop();
      await TextToSpeech.speak({
        text: textToSpeak, 
        lang: ttsLang, 
        rate: 1.0, 
        pitch: 1.0, 
        volume: 1.0
      });
    } catch (error) {
      console.warn("原生 TTS 失敗，嘗試網頁版備用發音", error);
      try {
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.lang = ttsLang;
          utterance.rate = 0.9;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
      } catch (e) {
          alert("語音播放失敗：請檢查手機設定");
      }
    }
  };

  const fetchCustomPhrases = async (userAcc) => {
    try {
      const res = await axios.get(`${API_URL}/custom-phrases`, { params: { username: userAcc } });
      setCustomPhrases(res.data);
    } catch (e) { console.error(e); }
  };

  const handleLogin = async () => {
    if (!loginUser || !loginPass) {
        await Toast.show({ text: safeT('loginFailed'), position: 'bottom', duration: 'short' });
        return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/login`, { username: loginUser, password: loginPass });
      if (res.data.success) {
        setCurrentUser(res.data.user);
        if (res.data.user.lang) handleSetLanguage(res.data.user.lang);
        setPage('main'); 
        setActiveTab('home'); 
        setLoginPass('');
      }
    } catch (error) { 
        await Toast.show({ text: safeT('loginFailed'), position: 'bottom', duration: 'short' });
    } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!regUser || !regPass || !regName) return alert('Error');
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/register`, { 
          username: regUser, 
          password: regPass, 
          name: regName, 
          role: regRole, 
          lang: regLang 
      });
      
      if (res.data.success) { 
        handleSetLanguage(regLang);
        await Toast.show({ text: safeT('regSuccess'), position: 'bottom', duration: 'short' });
        setRegUser('');
        setRegPass('');
        setRegName('');
        setPage('login'); 
      } 
      else { alert(res.data.message); }
    } catch (error) { alert('Register Failed'); } finally { setLoading(false); }
  };

  const handleBind = async () => {
    if (!targetBindCode) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/bind`, { myUsername: currentUser.username, targetBindCode });
      if (res.data.success) {
        alert(safeT('boundStatus') + res.data.targetName);
        setCurrentUser({ ...currentUser, boundTo: res.data.targetName, boundToName: res.data.targetName }); 
        if(currentUser.role === 'caregiver') fetchCustomPhrases(currentUser.username);
      } else { alert(res.data.message); }
    } catch (error) { alert('Error'); } finally { setLoading(false); }
  };

  const handleUnbind = async () => {
    if(!confirm('Sure to unbind?')) return;
    try {
        const res = await axios.post(`${API_URL}/unbind`, { username: currentUser.username });
        if(res.data.success) {
            alert('Unbound');
            setCurrentUser({...currentUser, boundTo: null, boundToName: null});
            setLogs([]); 
        }
    } catch(e) {}
  };

  const handleAddPhrase = async () => {
    if (!newPhrase) return;
    setIsAdding(true);
    try {
      const res = await axios.post(`${API_URL}/custom-phrases`, { username: currentUser.username, phrase: newPhrase });
      if (res.data.success) {
        setCustomPhrases(res.data.phrases);
        setNewPhrase('');
      }
    } catch (e) { alert('Failed'); } finally { setIsAdding(false); }
  };

  const handleDeletePhrase = async (phraseId) => {
    if(!confirm('Delete?')) return;
    try {
      const res = await axios.delete(`${API_URL}/custom-phrases`, { data: { username: currentUser.username, phraseId: phraseId } });
      if (res.data.success) {
        setCustomPhrases(res.data.phrases);
      }
    } catch (e) { alert('Failed'); }
  };

  const fetchLogs = async () => {
    if (!currentUser.boundTo) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/logs`, { params: { targetUsername: currentUser.boundTo } });
      setLogs(res.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  //強制翻成中文再發音
  const executeTranslation = async (sourceText) => {
    if (!sourceText) return;
    setLoading(true);
    setTranslateResult('...');
    try {
      //丟給Google API翻譯成繁體中文
      const res = await axios.post(`${API_URL}/translate`, { text: sourceText, targetLang: 'zh-TW' });
      const resultText = res.data.translatedText;
      
      //顯示結果
      setTranslateResult(resultText);
      setTopMessage(resultText);
      speakText(resultText); 

      //判斷是否危險並紀錄
      try {
          await axios.post(`${API_URL}/track-phrase`, { 
              username: currentUser.username, 
              phrase: resultText 
          });
      } catch (logError) { console.error(logError); }

    } catch (error) { 
        setTranslateResult('Error'); 
    } finally { 
        setLoading(false); 
    }
  };

  //翻譯按鈕
  const handleTranslateClick = () => {
      executeTranslation(text);
  };

  //下拉選單
  const handleSelectPhrase = (e) => {
    const val = e.target.value;
    if (!val) return;
    const { display } = JSON.parse(val);
    
    setText(display); //讓輸入框顯示選擇的字
    executeTranslation(display); //翻譯、發音與紀錄
    
    e.target.value = ""; // 重置選單
  };

  const handleLogout = () => { 
      setPage('login'); 
      setCurrentUser(null); 
      setLoginUser(''); 
      setLoginPass('');
      setTopMessage('');
      setLogs([]); 
      setCustomPhrases([]); 
      setTranslateResult(''); 
      setText(''); 
  };
  
  const getPhraseText = (pObj) => { return pObj[uiLang] || pObj['en'] || pObj['zh-TW']; }

  useEffect(() => {
    if (page === 'main' && currentUser) {
        if (currentUser.role === 'caregiver' && activeTab === 'home') fetchCustomPhrases(currentUser.username);
        if (currentUser.role === 'family' && activeTab === 'home') { fetchCustomPhrases(currentUser.username); fetchLogs(); }
    }
  }, [page, currentUser, activeTab]);

  return (
    <div style={darkTheme}>
      
      {topMessage && (
        <div style={stickyBanner}>
            <div style={{flex:1}}>{topMessage}</div>
            <div onClick={()=>setTopMessage('')} style={{marginLeft:'15px', cursor:'pointer', fontWeight:'bold'}}>✕</div>
        </div>
      )}

      {page === 'main' && (
        <div style={{...darkHeader, marginTop: topMessage ? '50px' : '0'}}>
            <span style={{fontSize:'20px', fontWeight:'bold'}}>{activeTab === 'home' ? safeT('navHome') : safeT('profileTitle')}</span>
        </div>
      )}

      {page === 'login' && (
        <div style={authContainer}>
          <h2 style={{textAlign:'center', marginBottom:'15px', marginTop:'0'}}>{safeT('appName')}</h2>
          <input type="text" placeholder={safeT('account')} value={loginUser} onChange={e=>setLoginUser(e.target.value)} style={darkInput}/>
          <input type="password" placeholder={safeT('password')} value={loginPass} onChange={e=>setLoginPass(e.target.value)} style={darkInput}/>
          <button onClick={handleLogin} disabled={loading} style={primaryBtn}>{loading ? safeT('verifying') : safeT('loginBtn')}</button>
          <div style={{marginTop:'15px', textAlign:'center'}}>
             <span onClick={()=>setPage('register')} style={linkBtn}>{safeT('toRegBtn')}</span>
          </div>
        </div>
      )}

      {page === 'register' && (
        <div style={authContainer}>
          <h2 style={{textAlign:'center', marginBottom:'10px', marginTop:'0'}}>{safeT('registerTitle')}</h2>
          
          <div style={{marginBottom:'10px'}}>
            <div style={labelStyle}>{safeT('roleLabel')}</div>
            <div style={{display:'flex', gap:'10px'}}>
                <button onClick={()=>setRegRole('family')} style={{...roleBtn, borderColor: regRole==='family'?'#00bfa5':'#444', color: regRole==='family'?'#00bfa5':'#888'}}>{safeT('roleFamily')}</button>
                <button onClick={()=>setRegRole('caregiver')} style={{...roleBtn, borderColor: regRole==='caregiver'?'#00bfa5':'#444', color: regRole==='caregiver'?'#00bfa5':'#888'}}>{safeT('roleCaregiver')}</button>
            </div>
          </div>

          <div style={{marginBottom:'10px'}}>
            <div style={labelStyle}>{safeT('langLabel')}</div>
            <select value={regLang} onChange={e=>setRegLang(e.target.value)} style={darkInput}>
                {languages.map(l=><option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>

          <input type="text" placeholder={safeT('account')} value={regUser} onChange={e=>setRegUser(e.target.value)} style={darkInput}/>
          <input type="password" placeholder={safeT('password')} value={regPass} onChange={e=>setRegPass(e.target.value)} style={darkInput}/>
          <input type="text" placeholder={safeT('name')} value={regName} onChange={e=>setRegName(e.target.value)} style={darkInput}/>
          
          <button onClick={handleRegister} disabled={loading} style={primaryBtn}>{safeT('regBtn')}</button>
          <div style={{marginTop:'15px', textAlign:'center'}}>
             <span onClick={()=>setPage('login')} style={linkBtn}>{safeT('toLoginBtn')}</span>
          </div>
        </div>
      )}

      {page === 'main' && currentUser && (
        <div style={{paddingBottom:'70px'}}>
            {activeTab === 'home' && (
                <div style={{padding:'20px'}}>
                    
                    {currentUser.role === 'family' ? (
                        <>
                            <div style={darkSectionTitle}>{safeT('historySection')}</div>
                            <div style={{display:'flex', justifyContent:'flex-end', marginBottom:'10px'}}>
                                <button onClick={fetchLogs} style={smBtn}>{safeT('refreshBtn')}</button>
                            </div>
                            <div style={darkListContainer}>
                                {logs.length === 0 ? <div style={{padding:'15px', color:'#777', textAlign:'center'}}>{safeT('noHistory')}</div> : (
                                    logs.map((log, idx) => (
                                    <div key={idx} style={{...darkListItem, borderLeft: '4px solid #ff5252'}}>
                                        <div style={{color:'#ff5252', fontWeight:'bold'}}>{log.phrase}</div>
                                        <div style={{color:'#777', fontSize:'12px'}}>{log.time}</div>
                                    </div>
                                    ))
                                )}
                            </div>

                            <div style={darkSectionTitle}>{safeT('customSection')}</div>
                            <div style={{display:'flex', gap:'10px', marginBottom:'15px'}}>
                                <input type="text" value={newPhrase} onChange={e=>setNewPhrase(e.target.value)} placeholder={safeT('customPlaceholder')} style={{...darkInput, marginBottom:0, flex:1}}/>
                                <button onClick={handleAddPhrase} disabled={isAdding} style={{...primaryBtn, width:'auto', margin:0}}>
                                    {isAdding ? safeT('adding') : safeT('addBtn')}
                                </button>
                            </div>
                            <div style={{display:'flex', flexWrap:'wrap', gap:'8px'}}>
                                {customPhrases.map((p, idx) => (
                                    <div key={idx} style={darkChip}>
                                        {p['zh-TW']} 
                                        <span onClick={()=>handleDeletePhrase(p.id)} style={{marginLeft:'8px', color:'#ff5252', cursor:'pointer'}}>✕</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        //看護首頁
                        <>
                            <textarea rows="3" value={text} onChange={e=>setText(e.target.value)} placeholder={safeT('transPlaceholder')} style={darkInput}/>
                            
                            <button onClick={handleTranslateClick} style={{...primaryBtn, marginBottom:'20px'}}>{loading?'...': safeT('transBtn')}</button>
                            
                            <div style={darkResult}>
                                <span style={{flex:1}}>{translateResult}</span>
                                {translateResult && (
                                    <div onClick={() => speakText(translateResult)} style={{padding:'10px', cursor:'pointer', fontSize:'24px', marginLeft:'10px'}}>
                                        🔊
                                    </div>
                                )}
                            </div>
                            
                            <div style={darkSectionTitle}>{safeT('quickPhrasesTitle')}</div>
                            
                            {/*自訂語句*/}
                            {customPhrases.length > 0 && (
                                <div style={{marginBottom:'15px'}}>
                                    <div style={{fontSize:'12px', color:'#00bfa5', marginBottom:'5px'}}>{safeT('customCategory')}</div>
                                    <select 
                                        style={darkInput}
                                        defaultValue=""
                                        onChange={handleSelectPhrase}
                                    >
                                        <option value="" disabled>-- {safeT('customCategory')} --</option>
                                        {customPhrases.map((phraseObj, idx) => (
                                            <option 
                                                key={`c-${idx}`} 
                                                value={JSON.stringify({ display: getPhraseText(phraseObj) })}
                                            >
                                                {getPhraseText(phraseObj)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            
                            {/*系統語句*/}
                            <div style={{marginBottom:'15px'}}>
                                <div style={{fontSize:'12px', color:'#777', marginBottom:'5px'}}>{safeT('systemCategory')}</div>
                                <select 
                                    style={darkInput}
                                    defaultValue=""
                                    onChange={handleSelectPhrase}
                                >
                                    <option value="" disabled>-- {safeT('systemCategory')} --</option>
                                    {safeT('phrases').map((phrase, idx) => (
                                        <option 
                                            key={`s-${idx}`} 
                                            value={JSON.stringify({ display: phrase })}
                                        >
                                            {phrase}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/*個人資料*/}
            {activeTab === 'profile' && (
                <div style={{paddingTop:'10px'}}>
                    
                    {/*帳號與安全性*/}
                    <div style={listHeader}>{safeT('accountSec')}</div>
                    <div style={listItem}>
                        <div style={listLabel}>👤 {safeT('name')}</div>
                        <div style={listValue}>{currentUser.name} ({currentUser.role==='family'?safeT('roleFamily'):safeT('roleCaregiver')})</div>
                    </div>
                    
                    {/*綁定狀態(1對1)*/}
                    <div style={listHeader}>{safeT('bindSec')}</div>
                    <div style={listItem}>
                        <div style={listLabel}>🔢 {safeT('myCodeLabel')}</div>
                        <div style={{color:'#00bfa5', fontWeight:'bold', letterSpacing:'1px'}}>{currentUser.bindCode}</div>
                    </div>

                    <div style={listItemColumn}>
                        <div style={{display:'flex', justifyContent:'space-between', width:'100%', marginBottom:'10px'}}>
                            <div style={listLabel}>🔗 {safeT('bindBtn')}</div>
                            <div style={{color: currentUser.boundToName ? '#00bfa5' : '#777'}}>
                                {currentUser.boundToName ? `${safeT('boundStatus')} ${currentUser.boundToName}` : safeT('noBound')}
                            </div>
                        </div>
                        
                        {!currentUser.boundToName && (
                            <div style={{display:'flex', gap:'10px', width:'100%'}}>
                                <input type="text" value={targetBindCode} onChange={e=>setTargetBindCode(e.target.value)} placeholder={safeT('bindInputLabel')} style={{...darkInput, margin:0, flex:1}}/>
                                <button onClick={handleBind} style={{...primaryBtn, width:'auto', margin:0, padding:'0 20px'}}>{safeT('bindBtn')}</button>
                            </div>
                        )}

                        {currentUser.boundToName && (
                            <button onClick={handleUnbind} style={{...primaryBtn, backgroundColor:'#333', border:'1px solid #555', marginTop:'5px'}}>{safeT('unbindBtn')}</button>
                        )}
                    </div>

                    {/*偏好*/}
                    <div style={listHeader}>{safeT('prefSec')}</div>
                    <div style={listItem}>
                        <div style={listLabel}>🌐 {safeT('changeLangLabel')}</div>
                        <select value={uiLang} onChange={e=>handleSetLanguage(e.target.value)} style={{...darkInput, width:'auto', margin:0, padding:'5px'}}>
                            {languages.map(l=><option key={l.code} value={l.code}>{l.name}</option>)}
                        </select>
                    </div>

                    <div style={{padding:'20px'}}>
                        <button onClick={handleLogout} style={{...primaryBtn, backgroundColor:'#cf6679', color:'black'}}>{safeT('logout')}</button>
                    </div>
                </div>
            )}

           
            <div style={bottomNav}>
                <div onClick={() => setActiveTab('home')} style={{...navItem, color: activeTab === 'home' ? '#00bfa5' : '#777'}}>
                    <div style={{fontSize:'20px'}}>🏠</div>
                    <div style={{fontSize:'12px'}}>{safeT('navHome')}</div>
                </div>
                <div onClick={() => setActiveTab('profile')} style={{...navItem, color: activeTab === 'profile' ? '#00bfa5' : '#777'}}>
                    <div style={{fontSize:'20px'}}>⚙️</div>
                    <div style={{fontSize:'12px'}}>{safeT('navProfile')}</div>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}


const darkTheme = { backgroundColor: '#121212', color: '#ffffff', minHeight: '100vh', fontFamily: 'sans-serif' };
const darkHeader = { padding: '15px 20px', borderBottom: '1px solid #333', backgroundColor: '#1e1e1e', position: 'sticky', top: 0, zIndex: 10 };
const authContainer = { padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100vh', backgroundColor: '#121212', boxSizing: 'border-box' };

const darkInput = { 
    padding: '10px', borderRadius: '8px', border: '1px solid #333', 
    backgroundColor: '#2c2c2c', color: 'white', fontSize: '14px', 
    width: '100%', boxSizing: 'border-box', marginBottom: '10px' 
};

const primaryBtn = { 
    padding: '10px', background: '#00bfa5', color: '#000', 
    border: 'none', borderRadius: '8px', fontSize: '16px', 
    fontWeight: 'bold', width: '100%', cursor: 'pointer', marginTop: '5px' 
};

const outlineBtn = {
    padding: '8px 12px', borderRadius: '20px', border: '1px solid #00bfa5',
    backgroundColor: 'transparent', color: '#00bfa5', fontSize: '14px', margin: '0'
};

const linkBtn = { color: '#00bfa5', textDecoration: 'underline', cursor: 'pointer', fontSize: '14px' };
const labelStyle = { color: '#aaa', fontSize: '14px', marginBottom: '2px' };
const roleBtn = { flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #444', backgroundColor: 'transparent', cursor: 'pointer' };

const stickyBanner = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#00bfa5',
    color: '#000',
    padding: '15px 20px',
    zIndex: 9999,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontWeight: 'bold',
    fontSize: '18px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.5)'
};

const listHeader = { color: '#00bfa5', fontSize: '14px', padding: '20px 20px 5px', fontWeight: 'bold' };
const listItem = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid #333', backgroundColor: '#1e1e1e' };
const listItemColumn = { display: 'flex', flexDirection: 'column', padding: '15px 20px', borderBottom: '1px solid #333', backgroundColor: '#1e1e1e' };
const listLabel = { color: '#fff', fontSize: '16px' };
const listValue = { color: '#aaa', fontSize: '14px' };

const darkSectionTitle = { fontSize: '14px', color: '#777', margin: '20px 0 10px', textTransform: 'uppercase', letterSpacing: '1px' };
const darkListContainer = { backgroundColor: '#1e1e1e', borderRadius: '10px', overflow: 'hidden' };
const darkListItem = { padding: '15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between' };
const darkChip = { padding: '5px 10px', borderRadius: '15px', backgroundColor: '#333', fontSize: '14px', border: '1px solid #444', color: '#ccc' };

const darkResult = { 
    padding: '15px', 
    backgroundColor: '#1e1e1e', 
    borderRadius: '8px', 
    minHeight: '60px', 
    border: '1px solid #333', 
    fontSize: '18px', 
    fontWeight: 'bold', 
    color: '#00bfa5', 
    marginBottom: '20px',
    display: 'flex',           
    alignItems: 'center',      
    justifyContent: 'space-between' 
};

const smBtn = { padding: '5px 10px', fontSize: '12px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px' };

const bottomNav = { 
    position: 'fixed', bottom: 0, left: 0, right: 0, 
    height: '60px', backgroundColor: '#1e1e1e', borderTop: '1px solid #333', 
    display: 'flex', justifyContent: 'space-around', alignItems: 'center' 
};
const navItem = { textAlign: 'center', cursor: 'pointer', flex: 1 };

export default App