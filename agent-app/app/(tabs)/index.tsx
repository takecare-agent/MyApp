import React, { useState, useEffect } from 'react';
import { 
  NativeModules, NativeEventEmitter, PermissionsAndroid, Platform, 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  Alert, FlatList, Dimensions 
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context'; // 👈 修正: 使用新的 SafeAreaView
import BleManager from 'react-native-ble-manager';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart } from "react-native-chart-kit";
import Tts from 'react-native-tts';

// --- 定義資料型別 (TypeScript 專用) ---
interface RecordItem {
  id?: number;
  _id?: string;
  time: string;
  sys: string;
  dia: string;
  pulse?: string;
  level: string;
}

interface BpState {
  sys: string;
  dia: string;
  pulse: string;
}

// --- 初始化藍牙模組 ---
const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

// --- 輔助函數 (解決巢狀三元運算子問題) ---
const getLevelColor = (level: string) => {
  if (level === '高血壓') return '#cf1322';
  if (level === '正常') return '#52c41a';
  return '#faad14';
};

const getRecordKey = (item: RecordItem) => {
  if (item._id) return item._id.toString();
  if (item.id) return item.id.toString();
  return Math.random().toString();
};

const getLangIcon = (lang: string) => {
  if (lang === 'id') return '🇮🇩 印尼';
  if (lang === 'vi') return '🇻🇳 越南';
  if (lang === 'th') return '🇹🇭 泰國';
  return '🇺🇸 英文';
};

// ==========================================
// 頁面 1：血壓量測系統
// ==========================================
const BloodPressureScreen = () => {
  const [bp, setBp] = useState<BpState>({ sys: '', dia: '', pulse: '' });
  const [status, setStatus] = useState({ label: '等待輸入', color: '#d9d9d9', guide: '' });
  const [records, setRecords] = useState<RecordItem[]>([]); // 👈 修正: 指定陣列型別
  const [isScanning, setIsScanning] = useState(false);
  const API_URL = 'https://bp-backend-server.onrender.com/api/bp';

  const getChartData = () => {
    const lastSix = [...records].slice(0, 6).reverse();
    if (lastSix.length === 0) {
      return { labels: ["無資料"], datasets: [{ data: [0] }, { data: [0] }], legend: ["收縮壓", "舒張壓"] };
    }
    return {
      labels: lastSix.map(r => r.time.split(' ')[1]?.substring(0, 5) || ""), 
      datasets: [
        { data: lastSix.map(r => Number(r.sys)), color: (opacity = 1) => `rgba(255, 77, 79, ${opacity})`, strokeWidth: 2 },
        { data: lastSix.map(r => Number(r.dia)), color: (opacity = 1) => `rgba(82, 196, 26, ${opacity})`, strokeWidth: 2 }
      ],
      legend: ["收縮壓", "舒張壓"]
    };
  };

  const parseHexToBp = (value: any) => ({ sys: value[1] || 120, dia: value[3] || 80, pulse: value[5] || 70 });

  const autoSaveRecord = async (data: BpState) => {
    let level = "正常";
    const s = Number(data.sys); const d = Number(data.dia);
    if (s >= 140 || d >= 90) level = "高血壓";
    else if (s < 90 || d < 60) level = "低血壓";
    else if (s >= 120 || d >= 80) level = "需注意";

    const newRecord: RecordItem = { 
      sys: data.sys.toString(), dia: data.dia.toString(), pulse: data.pulse ? data.pulse.toString() : '',
      level: level, time: new Date().toLocaleString('zh-TW'), id: Date.now() 
    };

    const newRecordsList = [newRecord, ...records];
    setRecords(newRecordsList);

    try {
      await AsyncStorage.setItem('bp_records', JSON.stringify(newRecordsList));
      await axios.post(API_URL, newRecord, { timeout: 10000 });
    } catch (err) { 
      console.log("雲端同步延遲，已先存於手機", err); // 👈 修正: 處理 err
    }
  };

  const handleManualSave = () => {
    if (!bp.sys || !bp.dia) { Alert.alert("提醒", "請先輸入血壓數值"); return; }
    autoSaveRecord(bp);
    Alert.alert("儲存成功", "手動資料已存檔");
    setBp({ sys: '', dia: '', pulse: '' });
  };

  const connectToDevice = (deviceId: string) => {
    BleManager.connect(deviceId)
      .then(() => Alert.alert("藍牙狀態", "已成功連接到血壓計"))
      .catch((error) => console.log('連線失敗', error));
  };

  useEffect(() => {
    const handlerDiscover = bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', async (peripheral: any) => {
      if (peripheral.name && (peripheral.name.includes('BPM') || peripheral.name.includes('BP'))) {
        BleManager.stopScan(); setIsScanning(false);
        await AsyncStorage.setItem('last_paired_device_id', peripheral.id);
        connectToDevice(peripheral.id);
      }
    });
    const handlerUpdate = bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', (data: any) => {
      autoSaveRecord(parseHexToBp(data.value)); 
    });
    return () => { handlerDiscover.remove(); handlerUpdate.remove(); };
  }, [records]);

  useEffect(() => {
    BleManager.start({ showAlert: false });
    const initApp = async () => {
      const savedId = await AsyncStorage.getItem('last_paired_device_id');
      if (savedId) connectToDevice(savedId);
      const savedData = await AsyncStorage.getItem('bp_records');
      if (savedData) setRecords(JSON.parse(savedData));
      try {
        const response = await axios.get(API_URL, { timeout: 8000 });
        setRecords(response.data.reverse());
        await AsyncStorage.setItem('bp_records', JSON.stringify(response.data.reverse()));
      } catch (err) { 
        console.log("雲端連線中...", err); 
      }
    };
    initApp();
    if (Platform.OS === 'android' && Platform.Version >= 23) {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }
  }, []);

  const startScan = () => {
    if (!isScanning) {
      setIsScanning(true);
      // 👈 修正: 強制轉換型別以避免 TS 誤判參數數量
      (BleManager.scan as any)([], 5, true).then(() => setTimeout(() => setIsScanning(false), 5000)).catch(() => setIsScanning(false));
    }
  };

  const mockBluetoothData = () => {
    const mockValues = { sys: "135", dia: "85", pulse: "72" };
    setBp(mockValues); autoSaveRecord(mockValues); 
    Alert.alert("模擬接收成功", "數據已自動存檔並同步");
  };

  useEffect(() => {
    const s = Number(bp.sys); const d = Number(bp.dia);
    if (s > 0 && d > 0) {
      if (s < 90 || d < 60) setStatus({ label: "低血壓", color: "#ff4d4f", guide: "請平躺墊高下肢。" });
      else if (s >= 140 || d >= 90) setStatus({ label: "高血壓", color: "#cf1322", guide: "請休息並放鬆。" });
      else if (s < 120 && d < 80) setStatus({ label: "正常", color: "#52c41a", guide: "" });
      else setStatus({ label: "需注意", color: "#faad14", guide: "" });
    } else { setStatus({ label: "等待輸入", color: "#d9d9d9", guide: "" }); }
  }, [bp.sys, bp.dia]);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ListHeaderComponent={
          <>
            <View style={styles.header}><Text style={styles.title}>🩸 血壓監測</Text></View>
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
                <Text style={styles.saveBtnText}>💾 儲存資料</Text>
              </TouchableOpacity>
              <View style={[styles.statusCard, { backgroundColor: status.color }]}><Text style={styles.statusText}>{status.label}</Text></View>
            </View>
            <View style={styles.chartArea}>
              <Text style={styles.listTitle}>📈 血壓趨勢圖 (最近6筆)</Text>
              <LineChart
                data={getChartData()}
                width={Dimensions.get("window").width - 40}
                height={220}
                chartConfig={{
                  backgroundColor: "#ffffff", backgroundGradientFrom: "#ffffff", backgroundGradientTo: "#ffffff",
                  decimalPlaces: 0, color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`, style: { borderRadius: 16 }
                }}
                bezier style={{ marginVertical: 8, borderRadius: 16 }}
              />
            </View>
            <Text style={styles.listTitle}>📋 歷史紀錄</Text>
          </>
        }
        data={records}
        keyExtractor={getRecordKey} // 👈 修正: 使用輔助函數
        renderItem={({ item }) => (
          <View style={styles.recordItem}>
            <View style={styles.recordLeft}>
              <Text style={styles.recordText}>{item.time}</Text>
              <Text style={styles.recordVal}>{item.sys}/{item.dia} mmHg</Text>
            </View>
            <View style={[styles.levelTag, { backgroundColor: getLevelColor(item.level) }]}>
              <Text style={styles.levelTagText}>{item.level}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
};

// ==========================================
// 頁面 2：照護翻譯與溝通系統
// ==========================================
const TranslationScreen = () => {
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [targetLang, setTargetLang] = useState('id'); 
  const [isLoading, setIsLoading] = useState(false);

  const TRANSLATE_API_URL = 'https://bp-backend-server.onrender.com/api/translate'; 

  const defaultPhrases = [
    { text: '阿公/阿嬤，該吃飯了', icon: '🍚' },
    { text: '請幫我推輪椅', icon: '🦽' },
    { text: '請問哪裡不舒服？', icon: '🤕' },
    { text: '該吃藥了', icon: '💊' },
    { text: '我要去洗手間', icon: '🚽' },
  ];

  const handleTranslate = async (textToTranslate: string = inputText) => {
    if (!textToTranslate.trim()) {
      Alert.alert("提醒", "請輸入要翻譯的句子");
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await axios.post(TRANSLATE_API_URL, {
        text: textToTranslate,
        targetLang: targetLang
      });
      setTranslatedText(response.data.translatedText);
    } catch (error) {
      console.log("翻譯失敗:", error);
      Alert.alert("錯誤", "翻譯伺服器連線失敗，請檢查網路或後端狀態");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeak = (text: string) => {
    if (targetLang === 'id') Tts.setDefaultLanguage('id-ID');
    else if (targetLang === 'vi') Tts.setDefaultLanguage('vi-VN');
    else if (targetLang === 'th') Tts.setDefaultLanguage('th-TH');
    else Tts.setDefaultLanguage('en-US');
    
    Tts.speak(text);
  };

  const handlePhraseClick = (phrase: string) => {
    setInputText(phrase);
    handleTranslate(phrase);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🗣️ 照護溝通助手</Text>
      </View>

      <View style={styles.translateArea}>
        <View style={styles.langSelector}>
          {['id', 'vi', 'th', 'en'].map((lang) => (
            <TouchableOpacity 
              key={lang} 
              style={[styles.langBtn, targetLang === lang && styles.langBtnActive]}
              onPress={() => setTargetLang(lang)}
            >
              <Text style={[styles.langText, targetLang === lang && styles.langTextActive]}>
                {getLangIcon(lang)} {/* 👈 修正: 使用輔助函數 */}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.textArea}
          placeholder="請輸入中文..."
          multiline={true}
          value={inputText}
          onChangeText={setInputText}
        />

        <TouchableOpacity style={styles.actionBtn} onPress={() => handleTranslate(inputText)}>
          <Text style={styles.actionBtnText}>{isLoading ? "翻譯中..." : "🔄 翻譯 (Translate)"}</Text>
        </TouchableOpacity>

        {translatedText ? (
          <View style={styles.resultBox}>
            <Text style={styles.resultText}>{translatedText}</Text>
            <TouchableOpacity style={styles.speakBtn} onPress={() => handleSpeak(translatedText)}>
              <Text style={styles.speakBtnText}>🔊 語音朗讀</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1, paddingHorizontal: 15 }}>
        <Text style={styles.listTitle}>💡 常用語句</Text>
        <FlatList
          data={defaultPhrases}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.phraseItem} onPress={() => handlePhraseClick(item.text)}>
              <Text style={styles.phraseIcon}>{item.icon}</Text>
              <Text style={styles.phraseText}>{item.text}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </SafeAreaView>
  );
};

// ==========================================
// 底部導覽列設定 (App 主程式)
// ==========================================
const Tab = createBottomTabNavigator();

// 👈 修正: 將圖示元件移出父元件
const TranslateIcon = () => <Text style={{fontSize: 20}}>🗣️</Text>;
const BloodPressureIcon = () => <Text style={{fontSize: 20}}>🩸</Text>;

const App = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: '#1890ff' }}>
        <Tab.Screen 
          name="溝通翻譯" 
          component={TranslationScreen} 
          options={{ tabBarIcon: TranslateIcon }}
        />
        <Tab.Screen 
          name="血壓監測" 
          component={BloodPressureScreen} 
          options={{ tabBarIcon: BloodPressureIcon }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: { padding: 15, backgroundColor: 'white', elevation: 2 },
  title: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', color: '#1a1a1a' },
  inputArea: { padding: 15 },
  btRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  btBtn: { flex: 0.48, padding: 12, borderRadius: 8, alignItems: 'center' },
  btBtnText: { color: 'white', fontWeight: 'bold' },
  inputRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  input: { flex: 0.45, backgroundColor: 'white', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  saveBtn: { backgroundColor: '#1890ff', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  statusCard: { padding: 12, borderRadius: 8, alignItems: 'center' },
  statusText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  chartArea: { backgroundColor: 'white', padding: 10, marginHorizontal: 15, borderRadius: 12, marginBottom: 20, alignItems: 'center', elevation: 3 },
  listTitle: { paddingLeft: 15, fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  recordItem: { backgroundColor: 'white', padding: 15, marginHorizontal: 15, marginBottom: 10, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 1 },
  recordLeft: { flex: 1 },
  recordText: { fontSize: 12, color: '#8c8c8c' },
  recordVal: { fontSize: 18, fontWeight: 'bold', color: '#262626', marginTop: 3 },
  levelTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  levelTagText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  translateArea: { padding: 15 },
  langSelector: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  langBtn: { flex: 1, marginHorizontal: 3, paddingVertical: 10, backgroundColor: '#e6f7ff', borderRadius: 8, alignItems: 'center' },
  langBtnActive: { backgroundColor: '#1890ff' },
  langText: { color: '#1890ff', fontWeight: 'bold' },
  langTextActive: { color: 'white' },
  textArea: { backgroundColor: 'white', height: 100, borderRadius: 10, padding: 15, fontSize: 16, textAlignVertical: 'top', marginBottom: 15, borderWidth: 1, borderColor: '#ddd' },
  actionBtn: { backgroundColor: '#52c41a', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 20 },
  actionBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  resultBox: { backgroundColor: '#fffbe6', padding: 20, borderRadius: 10, borderWidth: 1, borderColor: '#ffe58f', alignItems: 'center' },
  resultText: { fontSize: 20, fontWeight: 'bold', color: '#faad14', marginBottom: 15, textAlign: 'center' },
  speakBtn: { backgroundColor: '#faad14', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  speakBtnText: { color: 'white', fontWeight: 'bold' },
  phraseItem: { flexDirection: 'row', backgroundColor: 'white', padding: 15, marginBottom: 10, borderRadius: 10, alignItems: 'center', elevation: 1 },
  phraseIcon: { fontSize: 24, marginRight: 15 },
  phraseText: { fontSize: 16, color: '#333' }
});

export default App;