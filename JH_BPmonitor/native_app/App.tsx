import React, { useState, useEffect } from 'react';
import { 
  NativeModules, NativeEventEmitter, PermissionsAndroid, Platform, 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  Alert, SafeAreaView, FlatList, Dimensions, Share, ActivityIndicator
} from 'react-native';
import RNFS from 'react-native-fs';
import BleManager from 'react-native-ble-manager';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LineChart from "react-native-chart-kit/dist/line-chart/LineChart";

// 1. 引入 Firebase (請確保已安裝套件)
import auth from '@react-native-firebase/auth';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

const App = () => {
  // --- 狀態管理 ---
  const [user, setUser] = useState<any>(null); // 登入的使用者資訊
  const [loading, setLoading] = useState(true); // 檢查登入狀態中
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [bp, setBp] = useState({ sys: '', dia: '', pulse: '' });
  const [status, setStatus] = useState({ label: '等待輸入', color: '#d9d9d9', guide: '' });
  const [records, setRecords] = useState<any[]>([]); 
  const [isScanning, setIsScanning] = useState(false);
  const API_URL = 'https://bp-backend-server.onrender.com/api/bp';

  // --- 登入邏輯 ---
  useEffect(() => {
    // 監聽 Firebase 登入狀態
    const subscriber = auth().onAuthStateChanged((userState) => {
      setUser(userState);
      setLoading(false);
    });
    return subscriber; // 取消監聽
  }, []);

  const handleSignUp = async () => {
    if (!email || !password) return Alert.alert("錯誤", "請輸入信箱與密碼");
    try {
      await auth().createUserWithEmailAndPassword(email, password);
      Alert.alert("成功", "帳號註冊成功並已登入");
    } catch (e: any) {
      Alert.alert("註冊失敗", e.message);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert("錯誤", "請輸入信箱與密碼");
    try {
      await auth().signInWithEmailAndPassword(email, password);
    } catch (e: any) {
      Alert.alert("登入失敗", "帳號或密碼錯誤");
    }
  };

  const handleLogout = () => {
    auth().signOut().then(() => {
      setRecords([]); // 清空本地顯示
      Alert.alert("提示", "已登出雲端帳號");
    });
  };

  // --- CSV 匯出邏輯 ---
  const exportToCSV = async () => {
    if (records.length === 0) {
      Alert.alert("提醒", "目前沒有紀錄可以匯出");
      return;
    }
    const header = "時間,收縮壓(SYS),舒張壓(DIA),心率(Pulse),狀態\n";
    const rows = records.map(r => `${r.time},${r.sys},${r.dia},${r.pulse || 0},${r.level}`).join("\n");
    const csvContent = header + rows;
    const path = `${RNFS.TemporaryDirectoryPath}/BloodPressure_Records.csv`;
    try {
      await RNFS.writeFile(path, "\ufeff" + csvContent, 'utf8');
      await Share.share({
        url: Platform.OS === 'android' ? `file://${path}` : path,
        title: '匯出血壓紀錄',
        message: '這是我的血壓監控紀錄報表 (CSV 格式)',
      });
    } catch (error) {
      Alert.alert("錯誤", "無法產生匯出檔案");
    }
  };

  // --- 資料同步 (加入 userId) ---
  const autoSaveRecord = async (data: any) => {
    let level = "正常";
    const s = Number(data.sys);
    const d = Number(data.dia);
    if (s >= 140 || d >= 90) level = "高血壓";
    else if (s < 90 || d < 60) level = "低血壓";
    else if (s >= 120 || d >= 80) level = "需注意";

    const newRecord = { 
      sys: data.sys.toString(),
      dia: data.dia.toString(),
      pulse: data.pulse ? data.pulse.toString() : '',
      level: level, 
      time: new Date().toLocaleString('zh-TW'),
      id: Date.now(),
      userId: user?.uid // 綁定目前的用戶 ID
    };

    const newRecordsList = [newRecord, ...records];
    setRecords(newRecordsList);

    try {
      await AsyncStorage.setItem(`bp_records_${user?.uid}`, JSON.stringify(newRecordsList));
      await axios.post(API_URL, newRecord, { timeout: 10000 });
    } catch (err) {
      console.log("雲端同步延遲");
    }
  };

  // --- 初始化與數據抓取 ---
  useEffect(() => {
    if (!user) return; // 沒登入就不執行

    BleManager.start({ showAlert: false });
    const initApp = async () => {
      // 讀取該用戶的本地緩存
      const savedData = await AsyncStorage.getItem(`bp_records_${user.uid}`);
      if (savedData) setRecords(JSON.parse(savedData));
      
      try {
        // 從後端抓取該用戶的資料 (建議後端 API 也要改成支援 userId 查詢)
        const response = await axios.get(`${API_URL}?userId=${user.uid}`, { timeout: 8000 });
        const cloudData = response.data.reverse();
        setRecords(cloudData);
        await AsyncStorage.setItem(`bp_records_${user.uid}`, JSON.stringify(cloudData));
      } catch (err) { console.log("雲端連線中..."); }
    };
    initApp();
  }, [user]);

  // (其餘藍牙、圖表、手動儲存邏輯保持不變...)
  const getChartData = () => {
    const lastSix = [...records].slice(0, 6).reverse();
    if (lastSix.length === 0) return { labels: ["無"], datasets: [{ data: [0] }, { data: [0] }], legend: ["收縮壓", "舒張壓"] };
    return {
      labels: lastSix.map(r => r.time.split(' ')[1]?.substring(0, 5) || ""),
      datasets: [
        { data: lastSix.map(r => Number(r.sys)), color: (opacity = 1) => `rgba(255, 77, 79, ${opacity})`, strokeWidth: 2 },
        { data: lastSix.map(r => Number(r.dia)), color: (opacity = 1) => `rgba(82, 196, 26, ${opacity})`, strokeWidth: 2 }
      ],
      legend: ["收縮壓", "舒張壓"]
    };
  };

  const handleManualSave = () => {
    if (!bp.sys || !bp.dia) return Alert.alert("提醒", "請先輸入血壓數值");
    autoSaveRecord(bp);
    setBp({ sys: '', dia: '', pulse: '' });
  };

  const startScan = () => {
    if (!isScanning) {
      setIsScanning(true);
      BleManager.scan([], 5, true).then(() => setTimeout(() => setIsScanning(false), 5000));
    }
  };

  const mockBluetoothData = () => {
    // 產生隨機血壓：收縮壓 110~150，舒張壓 70~100
    const randomSys = Math.floor(Math.random() * (150 - 110 + 1)) + 110;
    const randomDia = Math.floor(Math.random() * (100 - 70 + 1)) + 70;
    
    const mockValues = { 
      sys: randomSys.toString(), 
      dia: randomDia.toString(), 
      pulse: "72" 
    };
    
    setBp(mockValues);
    autoSaveRecord(mockValues); 
  };
  // --- 畫面渲染 ---

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1890ff" /></View>;

  // 1. 未登入介面
  if (!user) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <Text style={styles.loginTitle}>☁️ 雲端照護系統</Text>
        <TextInput style={styles.loginInput} placeholder="電子信箱" value={email} onChangeText={setEmail} autoCapitalize="none" />
        <TextInput style={styles.loginInput} placeholder="密碼" value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}><Text style={styles.btnText}>立即登入</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.loginBtn, {backgroundColor: '#52c41a'}]} onPress={handleSignUp}><Text style={styles.btnText}>註冊新帳號</Text></TouchableOpacity>
      </SafeAreaView>
    );
  }

  // 2. 已登入主介面
  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.title}>🩸 照護助手 ({user.email})</Text>
              <TouchableOpacity onPress={handleLogout}><Text style={{color: '#ff4d4f'}}>登出</Text></TouchableOpacity>
            </View>
            
            <View style={styles.inputArea}>
              <View style={styles.btRow}>
                <TouchableOpacity style={[styles.btBtn, { backgroundColor: isScanning ? '#aaa' : '#4CAF50' }]} onPress={startScan}>
                  <Text style={styles.btBtnText}>{isScanning ? '掃描中...' : '🔍 搜尋血壓計'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btBtn, { backgroundColor: '#ff9800' }]} onPress={mockBluetoothData}>
                  <Text style={styles.btBtnText}>⚡ 模擬接收</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputRow}>
                <TextInput style={styles.input} placeholder="收縮壓" keyboardType="numeric" value={bp.sys} onChangeText={(t) => setBp({...bp, sys: t})} />
                <TextInput style={styles.input} placeholder="舒張壓" keyboardType="numeric" value={bp.dia} onChangeText={(t) => setBp({...bp, dia: t})} />
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={handleManualSave}>
                <Text style={styles.saveBtnText}>💾 儲存資料到雲端</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.chartArea}>
              <Text style={styles.listTitle}>📈 血壓趨勢圖 (最近6筆)</Text>
              <LineChart
                data={getChartData()}
                width={Dimensions.get("window").width - 20}
                height={200}
                chartConfig={{
                  backgroundColor: "#ffffff", backgroundGradientFrom: "#ffffff", backgroundGradientTo: "#ffffff",
                  decimalPlaces: 0, color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`, labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                }}
                bezier
                style={{ borderRadius: 16 }}
              />
            </View>

            <TouchableOpacity style={styles.exportBtn} onPress={exportToCSV}>
              <Text style={styles.exportBtnText}>📊 匯出 CSV 報表</Text>
            </TouchableOpacity>
          </>
        }
        data={records}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.recordItem}>
            <View style={styles.recordLeft}>
              <Text style={styles.recordText}>{item.time}</Text>
              <Text style={styles.recordVal}>{item.sys}/{item.dia} mmHg</Text>
            </View>
            <View style={[styles.levelTag, { backgroundColor: item.level === '高血壓' ? '#cf1322' : '#52c41a' }]}><Text style={styles.levelTagText}>{item.level}</Text></View>
          </View>
        )}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loginContainer: { flex: 1, justifyContent: 'center', padding: 30, backgroundColor: '#fff' },
  loginTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 30, color: '#1890ff' },
  loginInput: { backgroundColor: '#f5f5f5', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#eee' },
  loginBtn: { backgroundColor: '#1890ff', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  header: { padding: 15, backgroundColor: 'white', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: 'bold' },
  inputArea: { padding: 15 },
  btRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  btBtn: { flex: 0.48, padding: 12, borderRadius: 8, alignItems: 'center' },
  btBtnText: { color: 'white', fontWeight: 'bold' },
  inputRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  input: { flex: 0.45, backgroundColor: 'white', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  saveBtn: { backgroundColor: '#1890ff', padding: 14, borderRadius: 8, alignItems: 'center' },
  saveBtnText: { color: 'white', fontWeight: 'bold' },
  chartArea: { backgroundColor: 'white', padding: 10, marginHorizontal: 10, borderRadius: 12, marginBottom: 15 },
  listTitle: { paddingLeft: 15, fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  exportBtn: { backgroundColor: '#52c41a', padding: 12, marginHorizontal: 15, borderRadius: 8, alignItems: 'center', marginBottom: 15 },
  exportBtnText: { color: 'white', fontWeight: 'bold' },
  recordItem: { backgroundColor: 'white', padding: 15, marginHorizontal: 15, marginBottom: 10, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recordLeft: { flex: 1 },
  recordText: { fontSize: 11, color: '#8c8c8c' },
  recordVal: { fontSize: 16, fontWeight: 'bold' },
  levelTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
  levelTagText: { color: 'white', fontSize: 12, fontWeight: 'bold' }
});

export default App;