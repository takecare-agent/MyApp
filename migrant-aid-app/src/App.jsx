import React, { useState, useRef, useEffect } from 'react'
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { Geolocation } from '@capacitor/geolocation'
import step1Img from './assets/step1.png';
import step2Img from './assets/step2.png';
import { Preferences } from '@capacitor/preferences';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
function App() {
  const [isAlertActive, setIsAlertActive] = useState(false); // 是否正在警報
  const [alertLocation, setAlertLocation] = useState(null); // 儲存求救者座標
  const [pairingCode, setPairingCode] = useState(''); // 儲存產生的或輸入的配對碼
  const [isPaired, setIsPaired] = useState(false); // 是否已成功連線
  const [caregiverPhone, setCaregiverPhone] = useState('');
  const [userRole, setUserRole] = useState(null);
  const [guide, setGuide] = useState(null)
  const [currentLang, setCurrentLang] = useState('zh')
  const [isMetronomePlaying, setIsMetronomePlaying] = useState(false)
  const [showGuide, setShowGuide] = useState(true)
  const [showSetup, setShowSetup] = useState(false)
  const [emergencyContact, setEmergencyContact] = useState('')
  const metroInterval = useRef(null)
  const audioCtx = useRef(null)
  const [isSpeaking, setIsSpeaking] = useState(false);
  const requestNotificationPermission = async () => {
    // 1. 請求手機權限
    const result = await FirebaseMessaging.requestPermissions();
    if (result.receive === 'granted') {
      // 2. 取得此手機的 Token
      const { token } = await FirebaseMessaging.getToken();
      // 3. 將此 Token 儲存到雲端配對資料夾中，讓看護端知道要傳給誰
      if (pairingCode) {
        await FirebaseFirestore.setDocument({
          reference: `pairings/${pairingCode}`,
          data: { familyToken: token },
          merge: true
        });
      }
    }
  };
  const savePairingData = async (role, code) => {
    try {
      await Preferences.set({ key: 'userRole', value: role });
      await Preferences.set({ key: 'pairingCode', value: code });
    } catch (e) {
      console.error("資料儲存失敗", e);
    }
  };
  const playEmergencySound = () => {
    try {
      if (!audioCtx.current) {
        audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.current.state === 'suspended') {
        audioCtx.current.resume();
      }
      const osc = audioCtx.current.createOscillator();
      const gain = audioCtx.current.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, audioCtx.current.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.current.currentTime + 0.5);
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.current.currentTime + 1.0);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.current.currentTime + 1.5);

      osc.connect(gain);
      gain.connect(audioCtx.current.destination);

      osc.start();
      osc.stop(audioCtx.current.currentTime + 2.0);
    } catch (e) {
      console.warn("音效播放失敗", e);
    }
  };
  const generateRandomCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };
  const uiStrings = {
    zh: {
      sos: "一鍵求救 (119 + 家屬通知)",
      subSos: "*將自動通知家屬並跳轉至撥號畫面",
      speak: "語音朗讀指引",
      stop: "停止播放",
      start: "開始按壓",
      stopMetro: "停止節拍",
      hintTitle: "💡 操作說明：",
      hint1: "1. 建議將手機音量調至最大。",
      hint2: "2. 跟隨「嗶」聲按壓，深度需達 5-6 公分。",
      setupTitle: "📞 設定您的聯絡電話",
      setupDesc: "請輸入此手機（看護者）的號碼：",
      setupPlaceholder: "例如：0912345678",
      setupButton: "儲存並開始守護",
      pairingTitle: "🔗 連結家屬端",
      pairingDesc: "請將下方的配對碼提供給家屬輸入：",
      pairingConfirm: "確認家屬已輸入",
      backToRole: "返回身份選擇"
    },
    vi: {
      sos: "Cấp cứu một chạm (119 + Thông báo người thân)",
      subSos: "*Sẽ tự động thông báo cho người thân và chuyển sang màn hình quay số",
      speak: "Đọc hướng dẫn",
      stop: "Dừng lại",
      start: "Bắt đầu",
      stopMetro: "Dừng",
      hintTitle: "💡 Hướng dẫn vận hành:",
      hint1: "1. Nên điều chỉnh âm lượng điện thoại lên mức tối đa.",
      hint2: "2. Nhấn theo tiếng 'bíp', độ sâu cần đạt 5-6 cm.",
      setupTitle: "📞 Thiết lập số điện thoại",
      setupDesc: "Nhập số điện thoại của bạn (người chăm sóc):",
      setupPlaceholder: "Ví dụ: 0912345678",
      setupButton: "Lưu dan bắt đầu",
      pairingTitle: "🔗 Kết nối người nhà",
      pairingDesc: "Cung cấp mã này cho người nhà của bạn:",
      pairingConfirm: "Xác nhận đã nhập",
      backToRole: "Quay lại"
    },
    id: {
      sos: "Panggilan Darurat (119 + Notifikasi Keluarga)",
      subSos: "*Akan otomatis memberitahu keluarga dan beralih ke layar dialer",
      speak: "Baca Instruksi",
      stop: "Berhenti",
      start: "Mulai",
      stopMetro: "Berhenti",
      hintTitle: "💡 Instruksi Operasi:",
      hint1: "1. Disarankan untuk mengatur volume ponsel ke maksimal.",
      hint2: "2. Tekan mengikuti suara 'beep', kedalaman harus 5-6 cm.",
      setupTitle: "📞 Atur Nomor Telepon",
      setupDesc: "Masukkan nomor HP Anda (pengasuh):",
      setupPlaceholder: "Contoh: 0912345678",
      setupButton: "Simpan dan Mulai",
      pairingTitle: "🔗 Hubungkan Keluarga",
      pairingDesc: "Berikan kode ini kepada keluarga Anda:",
      pairingConfirm: "Konfirmasi input",
      backToRole: "Kembali"
    },
    th: {
      sos: "ขอความช่วยเหลือ (119 + แจ้งเตือนครอบครัว)",
      subSos: "*จะแจ้งเตือนครอบครัวโดยอัตโนมัติและเปลี่ยนไปยังหน้าจอโทรออก",
      speak: "อ่านออกเสียง",
      stop: "หยุด",
      start: "เริ่ม",
      stopMetro: "หยุด",
      hintTitle: "💡 คำแนะนำการใช้งาน:",
      hint1: "1. แนะนำให้ปรับระดับเสียงโทรศัพท์ให้สูงสุด",
      hint2: "2. กดตามเสียง 'บี๊บ' ความลึกต้องถึง 5-6 ซม.",
      setupTitle: "📞 ตั้งค่าเบอร์โทรศัพท์",
      setupDesc: "กรอกเบอร์โทรศัพท์ของคุณ (ผู้ดูแล):",
      setupPlaceholder: "ตัวอย่าง: 0912345678",
      setupButton: "บันทึกและเริ่มใช้งาน",
      pairingTitle: "🔗 เชื่อมต่อครอบครัว",
      pairingDesc: "ให้รหัสนี้กับครอบครัวของคุณ:",
      pairingConfirm: "ยืนยันการกรอกรหัส",
      backToRole: "กลับไปเลือกสถานะ"
    },
    en: {
      sos: "Emergency Call (119 + Family Notify)",
      subSos: "*Will automatically notify family and jump to the dialer screen",
      speak: "Voice Guide",
      stop: "Stop",
      start: "Start",
      stopMetro: "Stop",
      hintTitle: "💡 Operating Instructions:",
      hint1: "1. Suggest setting phone volume to maximum.",
      hint2: "2. Press with the 'beep', depth should be 5-6 cm.",
      setupTitle: "📞 Setup Phone Number",
      setupDesc: "Enter your (caregiver) phone number:",
      setupPlaceholder: "Ex: 0912345678",
      setupButton: "Save and Start",
      pairingTitle: "🔗 Connect Family",
      pairingDesc: "Provide this code to your family:",
      pairingConfirm: "Confirm input",
      backToRole: "Back"
    }
  };
  useEffect(() => {
    // 1. 載入語音指引與初始化本地儲存資料
    loadGuide('zh');
    // 2. 核心監聽：FCM 推播通知 (放置於此)
    // 當 App 在背景或螢幕關閉時，家屬點擊通知列進入 App
    FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      console.log('使用者點擊通知進入 App', event.notification);
      setIsAlertActive(true); // 觸發全螢幕紅色警報
    });

    // 當 App 正在前台使用時收到通知
    FirebaseMessaging.addListener('notificationReceived', (event) => {
      console.log('App 執行中收到通知', event.notification);
      setIsAlertActive(true); // 直接彈出警報
      playEmergencySound();    // 同步播放警報音效
    });

    const initApp = async () => {
      // 在 useEffect 的 initApp 內加入這行
      const { value: savedPhone } = await Preferences.get({ key: 'caregiverPhone' });
      if (savedPhone) setEmergencyContact(savedPhone);
      try {
        // 讀取手機本地紀錄的身份與配對碼
        const { value: savedRole } = await Preferences.get({ key: 'userRole' });
        const { value: savedCode } = await Preferences.get({ key: 'pairingCode' });

        if (savedRole && savedCode) {
          setUserRole(savedRole);
          setPairingCode(savedCode);
          setIsPaired(true);
        }
      } catch (e) {
        console.warn("讀取儲存資料失敗", e);
      }
    };
    initApp();

    // 2. 家屬端監聽邏輯
    let callbackId = null;
    if (userRole === 'family' && isPaired && pairingCode) {
      FirebaseFirestore.addDocumentListener({
        reference: `pairings/${pairingCode}`
      }, (snapshot) => {
        // 觸發緊急警報
        if (snapshot?.data?.status === 'EMERGENCY') {
          setAlertLocation(snapshot.data.location);
          setCaregiverPhone(snapshot.data.caregiverPhone);
          setIsAlertActive(true);

          // A. 震動回饋 (請確保已執行過 npx cap sync)
          try {
            import('@capacitor/haptics').then(m => m.Haptics.vibrate({ duration: 1500 }));
          } catch (e) { console.warn("震動失敗", e); }

          // B. 警報音效
          playEmergencySound();
        }
        // 雲端重置後關閉警報
        else if (snapshot?.data?.status === 'NORMAL') {
          setIsAlertActive(false);
        }
      }).then(id => { callbackId = id; });

      return () => {
        if (callbackId) {
          FirebaseFirestore.removeSnapshotListener({ callbackId });
        }
      };
    }
  }, [userRole, isPaired, pairingCode]);

  const permissionGuide = {
    zh: {
      title: "通訊與定位設定說明",
      desc: "為了在緊急求救時能自動填寫定位並撥打電話，我們需要您的「位置」權限。同時，請輸入您的（看護者）手機號碼，以便家屬在收到求救通知時能第一時間回撥與您聯絡。"
    },
    vi: {
      title: "Hướng dẫn thiết lập",
      desc: "Để tự động cung cấp vị trí và gọi điện khi khẩn cấp, chúng tôi cần quyền 'Vị trí'. Ngoài ra, vui lòng nhập số điện thoại của BẠN (người chăm sóc) để người nhà có thể gọi lại ngay khi nhận được thông báo cứu trợ."
    },
    id: {
      title: "Panduan Pengaturan",
      desc: "Untuk mengisi lokasi dan menelepon secara otomatis saat darurat, kami memerlukan izin 'Lokasi'. Juga, masukkan nomor HP ANDA (pengasuh) agar keluarga dapat segera menghubungi Anda saat menerima notifikasi darurat."
    },
    th: {
      title: "คำแนะนำการตั้งค่า",
      desc: "เพื่อระบุตำแหน่งและโทรออกโดยอัตโนมัติเมื่อเกิดเหตุฉุกเฉิน เราต้องการสิทธิ์ 'ตำแหน่ง' ของคุณ นอกจากนี้ โปรดกรอกเบอร์โทรศัพท์ของคุณ (ผู้ดูแล) เพื่อให้ญาติสามารถโทรกลับหาคุณได้ทันทีเมื่อได้รับแจ้งเหตุ"
    },
    en: {
      title: "Setup Guide",
      desc: "To provide your location and make calls automatically during an emergency, we need 'Location' permission. Also, please enter YOUR (caregiver) phone number so family members can call you back immediately upon receiving an alert."
    }
  };

  const handleAcceptGuide = async () => {
    setShowGuide(false);
    try {
      await Geolocation.requestPermissions();
    } catch (e) {
      console.warn("權限要求被拒絕", e);
    }
    setShowSetup(true);
  };

  const handleSaveContact = async () => {
    if (emergencyContact.trim() === "") {
      alert(currentLang === 'zh' ? "請輸入有效的電話號碼" : "Please enter a valid phone number");
      return;
    }
    try {
      await Preferences.set({ key: 'caregiverPhone', value: emergencyContact });
    } catch (e) { console.error("儲存電話失敗", e); }

    setShowSetup(false);
  };
  const allGuides = {
    zh: { title: "CPR 急救指引", steps: [{ text: "1. 確認環境安全，拍打肩膀確認意識。" }, { text: "2. 兩乳頭連線中點，深度5-6公分，每分鐘110次。" }] },
    vi: { title: "Hướng dẫn cấp cứu CPR", steps: [{ text: "1. Xác nhận môi trường an toàn, vỗ vai kiểm tra ý thức." }, { text: "2. Điểm giữa đường nối hai đầu vú, ấn sâu 5-6cm, 110 lần/phút." }] },
    id: { title: "Panduan CPR", steps: [{ text: "1. Pastikan lingkungan aman, tepuk bahu cek kesadaran." }, { text: "2. Titik tengah puting, tekan 5-6cm, 110 kali/menit." }] },
    th: { title: "คำแนะนำ CPR", steps: [{ text: "1. ตรวจสอบความปลอดภัย ตบไหล่เช็คสติ" }, { text: "2. กึ่งกลางหัวนม กดลึก 5-6 ซม. 110 ครั้ง/นาที" }] },
    en: { title: "CPR Guide", steps: [{ text: "1. Check surroundings, tap shoulder for consciousness." }, { text: "2. Center of chest, 5-6cm depth, 110 bpm." }] }
  };

// 1. 修改 loadGuide 確保指引資料 100% 存在
  const loadGuide = (lang) => {
    console.log("切換語系至:", lang); // 加入日誌檢查
    setCurrentLang(lang);
    if (allGuides[lang]) {
      setGuide(allGuides[lang]);
    } else {
      setGuide(allGuides['zh']); // 找不到語系時的保底
    }
  };

 const speakText = () => {
    // 1. 基礎檢查：確保有指引內容可讀
    if (!guide) {
      console.warn("語音指引內容尚未載入");
      return;
    }

    // 2. 狀態處理：如果正在播放則停止
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    try {
      // 3. 預備動作：強制重置語音引擎狀態
      window.speechSynthesis.cancel();
      
      // 4. 建立語音物件內容
      const textToSpeak = `${guide.title}。${guide.steps[0]?.text || ''}。${guide.steps[1]?.text || ''}`;
      const msg = new SpeechSynthesisUtterance(textToSpeak);

      // 5. 設定語系 (對應您目前的 currentLang)
      const langMap = { 'zh': 'zh-TW', 'vi': 'vi-VN', 'id': 'id-ID', 'th': 'th-TH', 'en': 'en-US' };
      msg.lang = langMap[currentLang] || 'zh-TW';
      msg.volume = 1.0; // 音量最大
      msg.rate = 0.9;   // 語速稍微放慢，確保聽得清楚

      // 6. 監聽播放狀態
      msg.onstart = () => setIsSpeaking(true);
      msg.onend = () => setIsSpeaking(false);
      msg.onerror = (e) => {
        console.error("語音播放發生錯誤:", e);
        setIsSpeaking(false);
      };

      // 7. 【核心修正】解決 Android WebView 引擎未就緒問題
      // 先播放一個「極短的空白」來強制喚醒系統語音模組
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));

      // 延遲 150 毫秒後再播放正式內容，避免引擎初始化不及導致報錯
      setTimeout(() => {
        window.speechSynthesis.speak(msg);
      }, 150);

    } catch (error) {
      console.error("執行 speakText 失敗:", error);
      setIsSpeaking(false);
      alert("語音引擎啟動失敗，請檢查系統設定");
    }
  };

  const playBeep = () => {
    if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)()
    const osc = audioCtx.current.createOscillator()
    const gain = audioCtx.current.createGain()
    osc.frequency.setValueAtTime(880, audioCtx.current.currentTime)
    osc.connect(gain); gain.connect(audioCtx.current.destination);
    gain.gain.setValueAtTime(1.0, audioCtx.current.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.current.currentTime + 0.1)
    osc.start(); osc.stop(audioCtx.current.currentTime + 0.1)
  }

  const toggleMetronome = () => {
    if (isMetronomePlaying) {
      clearInterval(metroInterval.current); setIsMetronomePlaying(false)
    } else {
      metroInterval.current = setInterval(playBeep, 60000 / 110); setIsMetronomePlaying(true)
    }
  }
  const handleEmergencyCall = async () => {
    // 1. 優先執行撥號動作
    // 在 Android 中，這會將 App 推至背景並開啟撥號介面
    window.location.href = `tel:119`;

    // 2. 隨後立即處理資訊回傳 (使用背景執行確保不卡住撥號)
    const uploadEmergencyData = async () => {
      let locationLink = "(定位抓取中...)";
      try {
        // 嘗試抓取最新定位
        const coordinates = await Geolocation.getCurrentPosition({
          timeout: 3000,
          enableHighAccuracy: false
        });
        locationLink = `${coordinates.coords.latitude},${coordinates.coords.longitude}`;
      } catch (e) {
        console.warn("背景定位抓取失敗", e);
      }

      // 3. 將求救資訊寫入 Firestore 以通知家屬端
      if (isPaired && pairingCode) {
        try {
          await FirebaseFirestore.setDocument({
            reference: `pairings/${pairingCode}`,
            data: {
              status: 'EMERGENCY',
              location: locationLink,
              caregiverPhone: emergencyContact, // 提供給家屬回撥的號碼
              pushTrigger: Date.now(),
              lastUpdated: Date.now()
            },
            merge: true
          });
        } catch (err) {
          console.error("回傳家屬失敗:", err);
        }
      }
    };

    uploadEmergencyData();
  };
  return (
    <div style={{ position: 'relative', minHeight: '100vh', backgroundColor: '#f9f9f9', fontFamily: 'sans-serif', overflowX: 'hidden' }}>

      {/* 1. 身份選擇頁面：最優先顯示 */}
      {!userRole && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: '#fff', zIndex: 20000, display: 'flex',
          flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box'
        }}>
          <h1 style={{ color: '#b91c1c', marginBottom: '10px' }}>CPR 急救連線</h1>
          <p style={{ color: '#666', marginBottom: '40px' }}>請選擇您的使用身份</p>

          <button
            onClick={() => {
              const newCode = generateRandomCode(); // 產生新號碼
              setPairingCode(newCode);
              setUserRole('caregiver');
            }}
            style={{ width: '100%', maxWidth: '300px', padding: '25px', marginBottom: '20px', backgroundColor: '#b91c1c', color: 'white', border: 'none', borderRadius: '15px', fontSize: '20px', fontWeight: 'bold', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
          >
            🚑 我是 看護端<br />
            <span style={{ fontSize: '14px', fontWeight: 'normal' }}>(執行急救與發送通知)</span>
          </button>

          <button
            onClick={() => setUserRole('family')}
            style={{ width: '100%', maxWidth: '300px', padding: '25px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '15px', fontSize: '20px', fontWeight: 'bold', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
          >
            🏠 我是 家屬端<br />
            <span style={{ fontSize: '14px', fontWeight: 'normal' }}>(接收通知與查看位置)</span>
          </button>
        </div>
      )}

      {/* 2. 看護端介面 (當 userRole === 'caregiver' 時) */}
      {userRole === 'caregiver' && (
        <>
          {!isPaired ? (
            /* A. 尚未配對：顯示配對碼畫面 */
            <div style={{ padding: '30px', textAlign: 'center', backgroundColor: '#fff', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <h2 style={{ color: '#b91c1c' }}>🔗 連結家屬端</h2>
              <p style={{ color: '#666' }}>請將下方的配對碼提供給家屬輸入：</p>

              <div style={{
                fontSize: '48px', fontWeight: 'bold', letterSpacing: '10px',
                margin: '30px 0', padding: '20px', backgroundColor: '#f3f4f6', borderRadius: '15px', width: '100%', maxWidth: '300px'
              }}>
                {/* 這裡現在會顯示隨機產生的號碼，不再是固定的 823915 */}
                {pairingCode}
              </div>

              <button
                onClick={() => {
                  // 直接確認配對，不需要重新設定 pairingCode
                  setIsPaired(true);
                }}
                style={{ width: '100%', maxWidth: '300px', padding: '15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '10px', fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}
              >
                確認家屬已輸入
              </button>

              <button
                onClick={() => setUserRole(null)}
                style={{ color: '#666', background: 'none', border: 'none', textDecoration: 'underline' }}
              >
                返回身份選擇
              </button>
            </div>
          ) : (
            /* B. 已成功配對：顯示原本的急救主介面 */
            <>
              {/* 權限遮罩與設定視窗 */}
              {/* 權限與通訊設定視窗 */}
              {(showGuide || showSetup) && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
                  {showGuide ? (
                    /* 權限指引 */
                    <div style={{ backgroundColor: '#222', padding: '30px', borderRadius: '25px', textAlign: 'center', maxWidth: '350px' }}>
                      <h2 style={{ color: '#ff4444', marginTop: 0 }}>⚠️ {permissionGuide[currentLang]?.title}</h2>
                      <p style={{ color: 'white', lineHeight: '1.5' }}>{permissionGuide[currentLang]?.desc}</p>
                      <button onClick={handleAcceptGuide} style={{ width: '100%', padding: '15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '30px', fontWeight: 'bold', fontSize: '18px' }}>OK</button>
                    </div>
                  ) : (
                    /* 看護端電話設定 (已加入語系切換) */
                    <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '20px', width: '100%', maxWidth: '350px', boxSizing: 'border-box' }}>
                      <h3 style={{ color: '#b91c1c', marginTop: 0 }}>{uiStrings[currentLang].setupTitle}</h3>
                      <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px', textAlign: 'left' }}>
                        {uiStrings[currentLang].setupDesc}
                      </p>
                      <input
                        type="tel"
                        placeholder={uiStrings[currentLang].setupPlaceholder}
                        value={emergencyContact}
                        onChange={(e) => setEmergencyContact(e.target.value)}
                        style={{ width: '100%', padding: '15px', marginBottom: '15px', borderRadius: '10px', border: '1px solid #ccc', boxSizing: 'border-box', fontSize: '16px' }}
                      />
                      <button
                        onClick={handleSaveContact}
                        style={{ width: '100%', padding: '15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '18px' }}
                      >
                        {uiStrings[currentLang].setupButton}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* 看護端主介面內容 */}
              <div style={{ padding: '20px', textAlign: 'center', boxSizing: 'border-box', maxWidth: '500px', margin: '0 auto' }}>
                <button onClick={handleEmergencyCall} style={{ width: '100%', padding: '18px', backgroundColor: '#b91c1c', color: 'white', borderRadius: '10px', fontWeight: 'bold', fontSize: '20px', border: 'none', marginBottom: '8px' }}>
                  🆘 {uiStrings[currentLang].sos}
                </button>
                <p style={{ fontSize: '13px', color: '#b91c1c', marginTop: 0, marginBottom: '20px' }}>
                  {uiStrings[currentLang].subSos}
                </p>

                {/* 語言切換 */}
                <div style={{ marginBottom: '20px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px' }}>
                  {['zh', 'vi', 'id', 'th', 'en'].map(l => (
                    <button key={l} onClick={() => loadGuide(l)} style={{ padding: '10px 12px', borderRadius: '8px', border: 'none', backgroundColor: currentLang === l ? '#ff4444' : '#eee', color: currentLang === l ? '#fff' : '#333', fontSize: '14px' }}>
                      {l === 'zh' ? '中文' : l === 'vi' ? 'Việt' : l === 'id' ? 'Indo' : l === 'th' ? 'ไทย' : 'English'}
                    </button>
                  ))}
                </div>

                {/* 指引區塊 */}
                {guide && (
                  <div style={{ border: '2px solid #ff4444', borderRadius: '20px', padding: '15px', backgroundColor: '#fff', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                    <h2 style={{ fontSize: '18px', marginTop: 0 }}>{guide.title}</h2>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                      <div style={{ width: '50%' }}>
                        <img src={step1Img} style={{ width: '100%', borderRadius: '10px', aspectRatio: '1/1', objectFit: 'cover' }} alt="1" />
                        <p style={{ fontSize: '14px', marginTop: '8px', color: '#333', textAlign: 'left', lineHeight: '1.4' }}>
                          {guide.steps[0]?.text}
                        </p>
                      </div>
                      <div style={{ width: '50%' }}>
                        <img src={step2Img} style={{ width: '100%', borderRadius: '10px', aspectRatio: '1/1', objectFit: 'cover' }} alt="2" />
                        <p style={{ fontSize: '14px', marginTop: '8px', color: '#333', textAlign: 'left', lineHeight: '1.4' }}>
                          {guide.steps[1]?.text}
                        </p>
                      </div>
                    </div>
                    <button onClick={speakText} style={{ width: '100%', padding: '15px', backgroundColor: isSpeaking ? '#ff4444' : '#4CAF50', color: 'white', borderRadius: '12px', border: 'none', fontWeight: 'bold', fontSize: '18px' }}>
                      {isSpeaking ? `🛑 ${uiStrings[currentLang].stop}` : `🔊 ${uiStrings[currentLang].speak}`}
                    </button>
                  </div>
                )}

                {/* 節奏器 */}
                <div style={{ marginTop: '30px' }}>
                  <button onClick={toggleMetronome} style={{ width: '100px', height: '100px', borderRadius: '50%', backgroundColor: isMetronomePlaying ? '#333' : '#ff4444', color: 'white', border: 'none', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
                    {isMetronomePlaying ? uiStrings[currentLang].stopMetro : uiStrings[currentLang].start}<br />110 BPM
                  </button>
                  <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#fff5f5', borderRadius: '10px', textAlign: 'left', fontSize: '13px', border: '1px solid #ffcccc' }}>
                    <strong>{uiStrings[currentLang].hintTitle}</strong><br />
                    {uiStrings[currentLang].hint1}<br />
                    {uiStrings[currentLang].hint2}
                  </div>
                </div>

                {/* 測試用：解除配對按鈕 */}
                <button
                  onClick={() => setIsPaired(false)}
                  style={{ marginTop: '40px', fontSize: '12px', color: '#999', border: 'none', background: 'none', textDecoration: 'underline' }}
                >
                  重設配對狀態
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* 3. 家屬端介面 (當 userRole === 'family' 時) */}
      {userRole === 'family' && (
        <div style={{ minHeight: '100vh', backgroundColor: isPaired ? '#f0fdf4' : '#fff' }}>

          {!isPaired ? (
            /* A. 尚未連線：顯示配對輸入畫面 */
            <div style={{ padding: '30px', textAlign: 'center' }}>
              <h2 style={{ color: '#166534' }}>🔍 尋找看護端</h2>
              <p style={{ color: '#666' }}>請輸入看護端手機上顯示的 6 位數配對碼：</p>

              <input
                type="number"
                placeholder="000000"
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value)}
                style={{
                  width: '100%', padding: '20px', fontSize: '32px', textAlign: 'center',
                  letterSpacing: '5px', borderRadius: '15px', border: '2px solid #ddd', margin: '30px 0', boxSizing: 'border-box'
                }}
              />

              <button
                onClick={async () => {
                  if (pairingCode.length === 6) {
                    // 1. 在這裡呼叫權限請求，這是觸發視窗的關鍵時機
                    await requestNotificationPermission();

                    savePairingData('family', pairingCode);
                    setIsPaired(true);
                  }
                }}
              >
                立即連線
              </button>

              <button
                onClick={async () => {
                  if (pairingCode.length === 6) {
                    // 1. 點擊按鈕時觸發音效授權 (解決自動播放攔截)
                    if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
                    audioCtx.current.resume();
                    // 2. 請求推播權限並取得 Token 存入雲端
                    await requestNotificationPermission();
                    // 3. 儲存配對資料並連線
                    savePairingData('family', pairingCode);
                    setIsPaired(true);
                  } else {
                    alert('請輸入完整 6 位碼');
                  }
                }}
                style={{ display: 'block', margin: '40px auto', color: '#666', border: 'none', background: 'none', textDecoration: 'underline' }}
              >
                返回身份選擇
              </button>
            </div>
          ) : (
            /* B. 已成功連線：顯示家屬監控模式 */
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <h2 style={{ color: '#166534' }}>🏠 家屬監控模式</h2>

              <div style={{ padding: '20px', backgroundColor: '#fff', borderRadius: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: '20px', border: '1px solid #dcfce7' }}>
                <p style={{ fontWeight: 'bold', margin: '5px 0' }}>連線狀態：<span style={{ color: '#22c55e' }}>● 守護中</span></p>
                <p style={{ fontSize: '14px', color: '#666', margin: '5px 0' }}>已配對碼：{pairingCode}</p>
                <p style={{ fontSize: '12px', color: '#999' }}>當看護端按下求救按鈕時，您將收到即時通知。</p>
              </div>

              {/* 測試按鈕：模擬接收到警報 */}
              <button
                onClick={() => { setIsAlertActive(true); setAlertLocation("25.174, 121.443"); }}
                style={{ padding: '12px 20px', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '10px', color: '#666' }}
              >
                模擬接收警報 (測試用)
              </button>

              <button
                onClick={async () => {
                  // 1. 清除本地儲存的紀錄，防止重啟後自動連線
                  try {
                    await Preferences.remove({ key: 'userRole' });
                    await Preferences.remove({ key: 'pairingCode' });
                  } catch (e) { console.error("清除本地資料失敗", e); }

                  // 2. 重置所有本地狀態
                  setIsPaired(false);
                  setUserRole(null);
                  setPairingCode('');

                  // 3. (選用) 若身分為家屬端，同步重置雲端狀態
                  if (userRole === 'family' && pairingCode) {
                    await FirebaseFirestore.setDocument({
                      reference: `pairings/${pairingCode}`,
                      data: { status: 'NORMAL' },
                      merge: true
                    });
                  }
                }}
                style={{ display: 'block', margin: '20px auto', color: '#999', fontSize: '12px', border: 'none', background: 'none' }}
              >
                解除配對
              </button>

              {/* --- 核心：緊急警報彈出視窗 (Overlay) --- */}
              {isAlertActive && (
                <div style={{
                  position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                  backgroundColor: '#b91c1c', zIndex: 30000, display: 'flex',
                  flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '30px', boxSizing: 'border-box'
                }}>
                  <div style={{ fontSize: '80px', marginBottom: '20px', animation: 'blink 1s infinite' }}>⚠️</div>
                  <h1 style={{ color: 'white', fontSize: '32px', margin: '0 0 10px 0' }}>緊急求救中！</h1>
                  <p style={{ color: '#fee2e2', fontSize: '18px', textAlign: 'center', lineHeight: '1.6' }}>
                    您的家人正在進行 CPR 救急<br />
                    位置：{alertLocation}
                  </p>

                  <div style={{ width: '100%', marginTop: '40px' }}>
                    <button
                      /* 修正：移除多餘的 '1'，確保地圖網址正確 */
                      onClick={() => window.location.href = `https://www.google.com/maps/search/?api=1&query=${alertLocation}`}
                      style={{ width: '100%', padding: '20px', backgroundColor: '#fff', color: '#b91c1c', border: 'none', borderRadius: '15px', fontSize: '20px', fontWeight: 'bold', marginBottom: '15px' }}
                    >
                      📍 開啟地圖導航
                    </button>

                    <button
                      /* 優先撥打變數中的電話*/
                      onClick={() => {
                        const targetPhone = caregiverPhone;
                        window.location.href = `tel:${targetPhone}`;
                      }}
                      style={{
                        width: '100%',
                        padding: '20px',
                        backgroundColor: '#22c55e',
                        color: 'white',
                        border: 'none',
                        borderRadius: '15px',
                        fontSize: '20px',
                        fontWeight: 'bold',
                        marginBottom: '15px'
                      }}
                    >
                      📞 立即回撥通話
                    </button>
                    <button
                      /* 修正：關閉時必須重置雲端狀態為 NORMAL */
                      onClick={async () => {
                        setIsAlertActive(false);
                        if (isPaired && pairingCode) {
                          try {
                            await FirebaseFirestore.setDocument({
                              reference: `pairings/${pairingCode}`,
                              data: { status: 'NORMAL', lastUpdated: new Date().getTime() },
                              merge: true // 僅更新狀態，保留定位歷史
                            });
                          } catch (err) { console.error("重置狀態失敗:", err); }
                        }
                      }}
                      style={{ width: '100%', padding: '15px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '15px', fontSize: '16px' }}
                    >
                      關閉警報視窗
                    </button>
                  </div>
                  <style>{`@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }`}</style>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


export default App;