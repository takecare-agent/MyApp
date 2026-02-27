import React, { useState, useEffect } from 'react';
import { 
  NativeModules, NativeEventEmitter, PermissionsAndroid, Platform, 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  Alert, SafeAreaView, FlatList 
} from 'react-native';
import BleManager from 'react-native-ble-manager';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

const App = () => {
  const [bp, setBp] = useState({ sys: '', dia: '', pulse: '' });
  const [status, setStatus] = useState({ label: '等待輸入', color: '#d9d9d9', guide: '' });
  const [records, setRecords] = useState<any[]>([]); 
  const [isScanning, setIsScanning] = useState(false);
  const API_URL = 'https://bp-backend-server.onrender.com/api/bp';

  // --- 1. 核心儲存與解析邏輯 ---

  // 解析藍牙數據
  const parseHexToBp = (value: any) => {
    return {
      sys: value[1] || 120, 
      dia: value[3] || 80,
      pulse: value[5] || 70
    };
  };

  // 核心儲存函數：處理本地與雲端同步
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
      id: Date.now() 
    };

    const newRecordsList = [newRecord, ...records];
    setRecords(newRecordsList);

    try {
      await AsyncStorage.setItem('bp_records', JSON.stringify(newRecordsList));
      await axios.post(API_URL, newRecord, { timeout: 10000 });
      console.log("資料同步成功");
    } catch (err) {
      console.log("雲端同步延遲，已先存於手機");
    }
  };

  // 手動儲存觸發器
  const handleManualSave = () => {
    if (!bp.sys || !bp.dia) {
      Alert.alert("提醒", "請先輸入血壓數值");
      return;
    }
    autoSaveRecord(bp);
    Alert.alert("儲存成功", "手動資料已存檔");
    setBp({ sys: '', dia: '', pulse: '' });
  };

  // --- 2. 藍牙連線與自動化監聽 ---

  const connectToDevice = (deviceId: string) => {
    BleManager.connect(deviceId)
      .then(() => {
        console.log('連線成功:', deviceId);
        Alert.alert("藍牙狀態", "已成功連接到血壓計");
      })
      .catch((error) => console.log('連線失敗', error));
  };

  useEffect(() => {
    // 監聽搜尋
    const handlerDiscover = bleManagerEmitter.addListener(
      'BleManagerDiscoverPeripheral',
      async (peripheral) => {
        if (peripheral.name && (peripheral.name.includes('BPM') || peripheral.name.includes('BP'))) {
          BleManager.stopScan();
          setIsScanning(false);
          await AsyncStorage.setItem('last_paired_device_id', peripheral.id);
          connectToDevice(peripheral.id);
        }
      }
    );

    // 監聽接收數據：此處執行自動儲存
    const handlerUpdate = bleManagerEmitter.addListener(
      'BleManagerDidUpdateValueForCharacteristic',
      (data) => {
        const parsedData = parseHexToBp(data.value);
        autoSaveRecord(parsedData); 
      }
    );

    return () => {
      handlerDiscover.remove();
      handlerUpdate.remove();
    };
  }, [records]);

  // --- 3. 初始化、掃描與模擬 ---

  useEffect(() => {
    BleManager.start({ showAlert: false });

    const initApp = async () => {
      const savedId = await AsyncStorage.getItem('last_paired_device_id');
      if (savedId) connectToDevice(savedId);
      
      const savedData = await AsyncStorage.getItem('bp_records');
      if (savedData) setRecords(JSON.parse(savedData));
      
      try {
        const response = await axios.get(API_URL, { timeout: 8000 });
        const cloudData = response.data.reverse();
        setRecords(cloudData);
        await AsyncStorage.setItem('bp_records', JSON.stringify(cloudData));
      } catch (err) { console.log("雲端連線中..."); }
    };

    initApp();

    if (Platform.OS === 'android' && Platform.Version >= 23) {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }
  }, []);

  const startScan = () => {
    if (!isScanning) {
      setIsScanning(true);
      BleManager.scan([], 5, true)
        .then(() => setTimeout(() => setIsScanning(false), 5000))
        .catch(() => setIsScanning(false));
    }
  };

  const mockBluetoothData = () => {
    const mockValues = { sys: "135", dia: "85", pulse: "72" };
    setBp(mockValues);
    autoSaveRecord(mockValues); // 模擬藍牙：自動儲存
    Alert.alert("模擬接收成功", "數據已自動存檔並同步");
  };

  // 血壓判斷
  useEffect(() => {
    const s = Number(bp.sys);
    const d = Number(bp.dia);
    if (s > 0 && d > 0) {
      if (s < 90 || d < 60) setStatus({ label: "低血壓", color: "#ff4d4f", guide: "請平躺墊高下肢。" });
      else if (s >= 140 || d >= 90) setStatus({ label: "高血壓", color: "#cf1322", guide: "請休息並放鬆。" });
      else if (s < 120 && d < 80) setStatus({ label: "正常", color: "#52c41a", guide: "" });
      else setStatus({ label: "需注意", color: "#faad14", guide: "" });
    }
  }, [bp.sys, bp.dia]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>🩸 照護助手 (BPMonitor)</Text></View>
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

        {/* 手動儲存按鈕 */}
        <TouchableOpacity style={styles.saveBtn} onPress={handleManualSave}>
          <Text style={styles.saveBtnText}>💾 儲存手動輸入資料</Text>
        </TouchableOpacity>

        <View style={[styles.statusCard, { backgroundColor: status.color }]}><Text style={styles.statusText}>{status.label}</Text></View>
      </View>

      <Text style={styles.listTitle}>📋 歷史紀錄 (Riwayat)</Text>
      <FlatList
        data={records}
        // 修復 MongoDB ID 讀取問題
        keyExtractor={(item) => (item._id ? item._id.toString() : (item.id ? item.id.toString() : Math.random().toString()))} 
        renderItem={({ item }) => (
          <View style={styles.recordItem}>
            <Text style={styles.recordText}>{item.time}</Text>
            <Text style={styles.recordVal}>{item.sys}/{item.dia} mmHg ({item.level})</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
};

// 樣式表：請確保這裡之後沒有重複定義
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { padding: 20, backgroundColor: 'white' },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  inputArea: { padding: 20 },
  btRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  btBtn: { flex: 0.48, padding: 12, borderRadius: 8, alignItems: 'center' },
  btBtnText: { color: 'white', fontWeight: 'bold' },
  inputRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  input: { flex: 0.45, backgroundColor: 'white', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  saveBtn: { backgroundColor: '#007bff', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 15 },
  saveBtnText: { color: 'white', fontWeight: 'bold' },
  statusCard: { padding: 15, borderRadius: 10, alignItems: 'center' },
  statusText: { color: 'white', fontWeight: 'bold' },
  listTitle: { paddingLeft: 20, fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  recordItem: { backgroundColor: 'white', padding: 15, marginHorizontal: 20, marginBottom: 10, borderRadius: 8, borderLeftWidth: 5, borderLeftColor: '#007bff' },
  recordText: { fontSize: 12, color: '#666' },
  recordVal: { fontSize: 16, fontWeight: 'bold', marginTop: 5 }
});

export default App;