import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  Alert, SafeAreaView, FlatList, Dimensions, ActivityIndicator, Platform 
} from 'react-native';
import Share from 'react-native-share';
import RNFS from 'react-native-fs';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart } from "react-native-chart-kit";
import { launchCamera } from 'react-native-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';

// Firebase
import auth from '@react-native-firebase/auth';

const App = () => {
  // --- 狀態管理 ---
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [bp, setBp] = useState({ sys: '', dia: '', pulse: '' });
  const [records, setRecords] = useState<any[]>([]); 
  const API_URL = 'https://bp-backend-server.onrender.com/api/bp';

  // --- 登入監控 ---
  useEffect(() => {
    const subscriber = auth().onAuthStateChanged((userState) => {
      setUser(userState);
      setLoading(false);
    });
    return subscriber;
  }, []);

  const handleSignUp = async () => {
    if (!email || !password) return Alert.alert("錯誤", "請輸入信箱與密碼");
    try {
      await auth().createUserWithEmailAndPassword(email, password);
    } catch (e: any) { Alert.alert("註冊失敗", e.message); }
  };

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert("錯誤", "請輸入信箱與密碼");
    try {
      await auth().signInWithEmailAndPassword(email, password);
    } catch (e: any) { Alert.alert("登入失敗", "帳號或密碼錯誤"); }
  };

  const handleLogout = () => {
    auth().signOut().then(() => {
      setRecords([]);
      Alert.alert("提示", "已登出雲端帳號");
    });
  };

  // --- 資料處理核心 ---
  const autoSaveRecord = async (data: any) => {
    if (!data.sys || !data.dia) {
      Alert.alert("提示", "請輸入完整的血壓數值");
      return;
    }

    const s = Number(data.sys);
    const d = Number(data.dia);
    let level = "正常";
    if (s >= 140 || d >= 90) level = "高血壓";
    else if (s < 90 || d < 60) level = "低血壓";
    else if (s >= 120 || d >= 80) level = "需注意";

    const newRecord = { 
      sys: s.toString(),
      dia: d.toString(),
      pulse: data.pulse || '75',
      level: level, 
      time: new Date().toLocaleString('zh-TW'),
      id: Date.now(),
      userId: user?.uid
    };

    const updated = [newRecord, ...records];
    setRecords(updated);
    setBp({ sys: '', dia: '', pulse: '' });

    try {
      await AsyncStorage.setItem(`bp_records_${user?.uid}`, JSON.stringify(updated));
      await axios.post(API_URL, newRecord, { timeout: 5000 });
    } catch (err) { console.log("雲端同步延遲，已存於本地"); }
  };

  // --- 📸 拍照辨識 OCR ---
const handleOCR = async () => {
    try {
      const result: any = await launchCamera({ mediaType: 'photo', quality: 0.5 });
      if (result.didCancel || !result.assets) return;

      const ocrResult = await TextRecognition.recognize(result.assets[0].uri);
      const numbers = ocrResult.text.match(/\d{2,3}/g);

      if (numbers && numbers.length >= 2) {
        const detected = { 
          sys: numbers[0], 
          dia: numbers[1], 
          pulse: numbers[2] || '75' 
        };

        Alert.alert(
          "辨識結果",
          `收縮壓: ${detected.sys}\n舒張壓: ${detected.dia}\n心率: ${detected.pulse}\n\n數值準確嗎？`,
          [
            { text: "不準，我手動輸", style: "cancel" },
            { 
              text: "準確，填入", 
              onPress: () => setBp(detected) 
            }
          ]
        );
      } else {
        Alert.alert("提醒", "無法清晰辨識血壓數值，請對準螢幕重拍一次。");
      }
    } catch (err) {
      console.log("OCR Error:", err);
      Alert.alert("錯誤", "OCR 啟動失敗，請確認相機權限或手動輸入數值。");
    }
  }; 

  // --- 初始化數據 ---
  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      const saved = await AsyncStorage.getItem(`bp_records_${user.uid}`);
      if (saved) setRecords(JSON.parse(saved));
      try {
        const res = await axios.get(`${API_URL}?userId=${user.uid}`, { timeout: 5000 });
        setRecords(res.data.reverse());
      } catch (e) { console.log("雲端獲取失敗"); }
    };
    loadData();
  }, [user]);

  // --- 圖表資料 ---
const getChartData = () => {
  // 1. 確保 records 存在，不存在就回傳空資料
  if (!records || records.length === 0) {
    return { labels: ["無"], datasets: [{ data: [0] }], legend: ["血壓"] };
  }
  
  const lastSix = [...records].slice(0, 6).reverse();
  return {
    labels: lastSix.map(r => r.time.split(' ')[1]?.substring(0, 5) || ""),
    datasets: [
      { data: lastSix.map(r => Number(r.sys || 0)), color: (opacity = 1) => `rgba(255, 77, 79, ${opacity})` },
      { data: lastSix.map(r => Number(r.dia || 0)), color: (opacity = 1) => `rgba(82, 196, 26, ${opacity})` }
    ],
    legend: ["收縮壓", "舒張壓"]
  };
};

  // --- CSV 匯出 ---
  const exportToCSV = async () => {
    if (records.length === 0) return Alert.alert("提醒", "無紀錄可匯出");
    const header = "\ufeff時間,收縮壓,舒張壓,心率,狀態\n";
    const rows = records.map(r => `${r.time},${r.sys},${r.dia},${r.pulse},${r.level}`).join("\n");
    const path = `${RNFS.TemporaryDirectoryPath}/Report.csv`;
    try {
      await RNFS.writeFile(path, header + rows, 'utf8');
      await Share.open({ url: `file://${path}`, type: 'text/csv' });
    } catch (e) { console.log('匯出取消'); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1890ff" /></View>;

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

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.title}>👤 {user.email}</Text>
              <TouchableOpacity onPress={handleLogout}><Text style={{color: '#ff4d4f'}}>登出</Text></TouchableOpacity>
            </View>
            
            <View style={styles.inputArea}>
              <TouchableOpacity style={styles.ocrBtn} onPress={handleOCR}>
                <Text style={styles.saveBtnText}>📸 拍照辨識血壓計</Text>
              </TouchableOpacity>

              <View style={styles.inputRow}>
                <TextInput style={styles.input} placeholder="收縮壓" keyboardType="numeric" value={bp.sys} onChangeText={(t) => setBp({...bp, sys: t})} />
                <TextInput style={styles.input} placeholder="舒張壓" keyboardType="numeric" value={bp.dia} onChangeText={(t) => setBp({...bp, dia: t})} />
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={() => autoSaveRecord(bp)}>
                <Text style={styles.saveBtnText}>💾 儲存血壓數據</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.chartArea}>
              <Text style={styles.listTitle}>📈 血壓趨勢圖</Text>
              <LineChart
                data={getChartData()}
                width={Dimensions.get("window").width - 30}
                height={200}
                chartConfig={{
                  backgroundColor: "#fff", backgroundGradientFrom: "#fff", backgroundGradientTo: "#fff",
                  decimalPlaces: 0, color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
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
        keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
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
  title: { fontSize: 16, fontWeight: 'bold' },
  inputArea: { padding: 15 },
  inputRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  input: { flex: 0.48, backgroundColor: 'white', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  ocrBtn: { backgroundColor: '#FF4D4F', padding: 16, borderRadius: 10, alignItems: 'center', marginBottom: 15 },
  saveBtn: { backgroundColor: '#1890ff', padding: 14, borderRadius: 8, alignItems: 'center' },
  saveBtnText: { color: 'white', fontWeight: 'bold' },
  chartArea: { backgroundColor: 'white', padding: 10, marginHorizontal: 10, borderRadius: 12, marginBottom: 15 },
  listTitle: { paddingLeft: 10, fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
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