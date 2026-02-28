import React, { useState, useEffect } from 'react';
import { 
  NativeModules, NativeEventEmitter, PermissionsAndroid, Platform, 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  Alert, SafeAreaView, FlatList, Dimensions 
} from 'react-native';
import BleManager from 'react-native-ble-manager';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LineChart from "react-native-chart-kit/dist/line-chart/LineChart";

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

const App = () => {
  const [bp, setBp] = useState({ sys: '', dia: '', pulse: '' });
  const [status, setStatus] = useState({ label: '等待輸入', color: '#d9d9d9', guide: '' });
  const [records, setRecords] = useState<any[]>([]); 
  const [isScanning, setIsScanning] = useState(false);
  const API_URL = 'https://bp-backend-server.onrender.com/api/bp';

  // --- 1. 資料處理與圖表邏輯 ---

  // 取得圖表所需的數據格式 (取最近 6 筆)
  const getChartData = () => {
    const lastSix = [...records].slice(0, 6).reverse();
    
    if (lastSix.length === 0) {
      return {
        labels: ["無資料"],
        datasets: [{ data: [0] }, { data: [0] }],
        legend: ["收縮壓", "舒張壓"]
      };
    }

    return {
      labels: lastSix.map(r => r.time.split(' ')[1]?.substring(0, 5) || ""), // 顯示時間(時:分)
      datasets: [
        {
          data: lastSix.map(r => Number(r.sys)),
          color: (opacity = 1) => `rgba(255, 77, 79, ${opacity})`, // 紅色: 收縮壓
          strokeWidth: 2
        },
        {
          data: lastSix.map(r => Number(r.dia)),
          color: (opacity = 1) => `rgba(82, 196, 26, ${opacity})`, // 綠色: 舒張壓
          strokeWidth: 2
        }
      ],
      legend: ["收縮壓", "舒張壓"]
    };
  };

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
    autoSaveRecord(mockValues); 
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
      <FlatList
        ListHeaderComponent={
          <>
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

              <TouchableOpacity style={styles.saveBtn} onPress={handleManualSave}>
                <Text style={styles.saveBtnText}>💾 儲存手動輸入資料</Text>
              </TouchableOpacity>

              <View style={[styles.statusCard, { backgroundColor: status.color }]}><Text style={styles.statusText}>{status.label}</Text></View>
            </View>

            {/* --- 加入趨勢圖表 --- */}
            <View style={styles.chartArea}>
              <Text style={styles.listTitle}>📈 血壓趨勢圖 (最近6筆)</Text>
              <LineChart
                data={getChartData()}
                width={Dimensions.get("window").width - 20}
                height={220}
                chartConfig={{
                  backgroundColor: "#ffffff",
                  backgroundGradientFrom: "#ffffff",
                  backgroundGradientTo: "#ffffff",
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                  style: { borderRadius: 16 },
                  propsForDots: { r: "5", strokeWidth: "2" }
                }}
                bezier
                style={{ marginVertical: 8, borderRadius: 16 }}
              />
            </View>

            <Text style={styles.listTitle}>📋 歷史紀錄 (Riwayat)</Text>
          </>
        }
        data={records}
        keyExtractor={(item) => (item._id ? item._id.toString() : (item.id ? item.id.toString() : Math.random().toString()))} 
        renderItem={({ item }) => (
          <View style={styles.recordItem}>
            <View style={styles.recordLeft}>
              <Text style={styles.recordText}>{item.time}</Text>
              <Text style={styles.recordVal}>{item.sys}/{item.dia} mmHg</Text>
            </View>
            <View style={[styles.levelTag, { backgroundColor: item.level === '高血壓' ? '#cf1322' : (item.level === '正常' ? '#52c41a' : '#faad14') }]}>
              <Text style={styles.levelTagText}>{item.level}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
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
  chartArea: { backgroundColor: 'white', padding: 10, marginHorizontal: 10, borderRadius: 12, marginBottom: 20, alignItems: 'center', elevation: 3 },
  listTitle: { paddingLeft: 15, fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  recordItem: { backgroundColor: 'white', padding: 15, marginHorizontal: 15, marginBottom: 10, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 1 },
  recordLeft: { flex: 1 },
  recordText: { fontSize: 12, color: '#8c8c8c' },
  recordVal: { fontSize: 18, fontWeight: 'bold', color: '#262626', marginTop: 3 },
  levelTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  levelTagText: { color: 'white', fontSize: 12, fontWeight: 'bold' }
});

export default App;