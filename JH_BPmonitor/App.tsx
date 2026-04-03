import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  Alert, SafeAreaView, FlatList, Dimensions, ActivityIndicator, ScrollView 
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import Share from 'react-native-share';
import RNFS from 'react-native-fs';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart } from "react-native-chart-kit";
import { launchCamera } from 'react-native-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import auth from '@react-native-firebase/auth';

// --- 月曆中文設定 ---
LocaleConfig.locales['zh'] = {
  monthNames: ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'],
  monthNamesShort: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
  dayNames: ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'],
  dayNamesShort: ['日','一','二','三','四','五','六'],
  today: '今天'
};
LocaleConfig.defaultLocale = 'zh';

const Tab = createBottomTabNavigator();
const API_URL = 'https://bp-backend-server.onrender.com/api/bp';

// --- 1. 即時測量分頁 (HomeScreen) ---
const HomeScreen = ({ user, bp, setBp, handleOCR, autoSaveRecord, lastRecord }: any) => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>👤 使用者：{user?.email}</Text></View>
      <ScrollView style={styles.inputArea} keyboardShouldPersistTaps="handled">
        
        <Text style={styles.sectionTitle}>最新數據</Text>
        <View style={styles.latestCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}><Text style={{color:'#fff', fontSize:12}}>❤️</Text></View>
            <View>
              <Text style={styles.cardHeaderText}>血壓</Text>
              <Text style={styles.cardHeaderTime}>{lastRecord ? lastRecord.time : '尚無數據'}</Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            {/* 左側比例尺 */}
            <View style={styles.scaleWrapper}>
              <View style={[styles.limitLine, {bottom: '58%'}]}><Text style={styles.limitText}>130</Text></View>
              <View style={[styles.limitLine, {bottom: '22%'}]}><Text style={styles.limitText}>80</Text></View>
              
              {/* 紅色指示水平線 */}
              {lastRecord && (() => {
                const sysVal = Number(lastRecord.sys);
                const pos = Math.min(Math.max((sysVal - 60) / (180 - 60), 0), 1) * 100;
                return (
                  <View style={[styles.valueIndicatorLine, { bottom: `${pos}%` }]}>
                    <View style={styles.redDot} /><View style={styles.redLine} /><View style={styles.redDot} />
                  </View>
                );
              })()}
              
              <View style={styles.baseLine} />
              
              {/* 星期標籤 - 使用容器精確對齊 */}
              <View style={styles.weekLabelsContainer}>
                {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
                  <Text key={day} style={styles.weekLabelText}>{day}</Text>
                ))}
              </View>
            </View>

            {/* 右側數值 */}
            <View style={styles.valueWrapper}>
              <Text style={styles.bigBpText}>{lastRecord ? `${lastRecord.sys}/${lastRecord.dia}` : '--/--'}</Text>
              <Text style={styles.unitText}>收縮壓 / 舒張壓 mmHg</Text>
              <Text style={styles.bigPulseText}>{lastRecord ? (lastRecord.pulse || '75') : '--'}</Text>
              <Text style={styles.unitText}>心率 bpm</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.ocrBtn} onPress={handleOCR}><Text style={styles.saveBtnText}>📸 拍照辨識血壓計</Text></TouchableOpacity>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} placeholder="收縮壓" keyboardType="numeric" value={bp.sys} onChangeText={(t) => setBp({...bp, sys: t})} blurOnSubmit={false} />
          <TextInput style={styles.input} placeholder="舒張壓" keyboardType="numeric" value={bp.dia} onChangeText={(t) => setBp({...bp, dia: t})} blurOnSubmit={false} />
        </View>
        <TouchableOpacity style={styles.saveBtn} onPress={() => autoSaveRecord(bp)}><Text style={styles.saveBtnText}>💾 儲存血壓數據</Text></TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

// --- 2. 趨勢分析分頁 (TrendScreen) ---
const TrendScreen = ({ records, healthAdvice }: any) => {
  const lastSeven = [...records].slice(0, 7).reverse();
  const chartData = {
    labels: lastSeven.length > 0 ? lastSeven.map((_, i) => `${i+1}`) : ["0"],
    datasets: [
      { data: lastSeven.length > 0 ? lastSeven.map(r => Number(r.sys)) : [0], color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`, strokeWidth: 3 },
      { data: lastSeven.length > 0 ? lastSeven.map(r => Number(r.dia)) : [0], color: (opacity = 0.6) => `rgba(100, 255, 218, ${opacity})`, strokeWidth: 2 }
    ],
    legend: ["SYS", "DIA"]
  };
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.analysisCard}>
        <Text style={styles.analysisTitle}>📊 趨勢圖表</Text>
        <LineChart data={chartData} width={Dimensions.get("window").width - 50} height={220} chartConfig={{ backgroundGradientFrom: "#154360", backgroundGradientTo: "#051937", color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`, labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`, propsForDots: { r: "5", strokeWidth: "2", stroke: "#ffa726" } }} bezier style={styles.chartStyle} />
        <View style={styles.adviceBox}><Text style={styles.adviceText}>{healthAdvice}</Text></View>
      </View>
    </SafeAreaView>
  );
};

// --- 3. 血壓日記分頁 (DiaryScreen) ---
const DiaryScreen = ({ records, selectedDate, setSelectedDate, exportToCSV }: any) => {
  const dateMap: any = {};
  records.forEach((r: any) => {
    if (r && r.time) {
      const datePart = r.time.split(' ')[0].replace(/\//g, '-');
      if (!dateMap[datePart]) dateMap[datePart] = [];
      dateMap[datePart].push(r);
    }
  });
  const currentDayRecords = dateMap[selectedDate] || [];
  return (
    <SafeAreaView style={styles.container}>
      <Calendar onDayPress={(day: any) => setSelectedDate(day.dateString)} dayComponent={({date, state}: any) => {
        const dStr = date.dateString;
        const hasData = dateMap[dStr];
        return (
          <TouchableOpacity onPress={() => setSelectedDate(dStr)} style={[styles.customDay, selectedDate === dStr && styles.selectedDay]}>
            <Text style={[styles.dayLabel, state === 'disabled' && {color: '#ccc'}]}>{date.day}</Text>
            {hasData && <Text style={[styles.dayValue, hasData[0].level === '高血壓' ? {color: '#cf1322'} : {color: '#52c41a'}]}>{hasData[0].sys}</Text>}
          </TouchableOpacity>
        );
      }} />
      <View style={styles.diaryDetailHeader}><Text style={styles.detailTitle}>📋 {selectedDate} 紀錄</Text><TouchableOpacity onPress={exportToCSV} style={styles.miniBtn}><Text style={{color:'#fff', fontSize:12}}>匯出</Text></TouchableOpacity></View>
      <FlatList data={currentDayRecords} keyExtractor={(item, index) => index.toString()} renderItem={({ item }) => (
        <View style={styles.recordItem}>
          <View style={styles.recordLeft}><Text style={styles.recordText}>{item?.time?.split(' ')[1] || '未知'}</Text><Text style={styles.recordVal}>{item?.sys}/{item?.dia} mmHg</Text></View>
          <View style={[styles.levelTag, { backgroundColor: item?.level === '高血壓' ? '#cf1322' : (item?.level === '血壓前期' ? '#faad14' : '#52c41a') }]}><Text style={styles.levelTagText}>{item?.level}</Text></View>
        </View>
      )} />
    </SafeAreaView>
  );
};

// --- App 主組件 ---
const App = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bp, setBp] = useState({ sys: '', dia: '' });
  const [records, setRecords] = useState<any[]>([]); 
  const [healthAdvice, setHealthAdvice] = useState("讀取中...");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const subscriber = auth().onAuthStateChanged((userState) => { setUser(userState); setLoading(false); });
    return subscriber;
  }, []);

  const analyzeHealth = useCallback((allRecords: any[]) => {
    if (allRecords.length === 0) return setHealthAdvice("尚無紀錄");
    const avgSys = allRecords.slice(0, 7).reduce((sum, r) => sum + Number(r.sys), 0) / Math.min(allRecords.length, 7);
    if (avgSys >= 140) setHealthAdvice("⚠️ 警示：平均血壓偏高（高血壓）。");
    else if (avgSys >= 120) setHealthAdvice("🔔 提醒：處於「血壓前期」，請注意作息。");
    else setHealthAdvice("✅ 正常：血壓控制良好。");
  }, []);

  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      const saved = await AsyncStorage.getItem(`bp_records_${user.uid}`);
      if (saved) { const parsed = JSON.parse(saved); setRecords(parsed); analyzeHealth(parsed); }
      try {
        const res = await axios.get(`${API_URL}?userId=${user.uid}`);
        setRecords(res.data.reverse()); analyzeHealth(res.data);
      } catch (e) { console.log("同步失敗"); }
    };
    loadData();
  }, [user, analyzeHealth]);

  const autoSaveRecord = async (data: any) => {
    if (!data.sys || !data.dia) return Alert.alert("提示", "請輸入數值");
    const s = Number(data.sys); const d = Number(data.dia);
    let level = s >= 140 || d >= 90 ? "高血壓" : (s >= 120 || d >= 80 ? "血壓前期" : "正常");
    const now = new Date();
    const timeStr = `${now.getFullYear()}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getDate().toString().padStart(2,'0')} ${now.toLocaleTimeString('zh-TW', { hour12: false })}`;
    const newRecord = { sys: s.toString(), dia: d.toString(), pulse: '75', level, time: timeStr, id: Date.now(), userId: user?.uid };
    const updated = [newRecord, ...records];
    setRecords(updated); analyzeHealth(updated); setBp({ sys: '', dia: '' });
    Alert.alert("儲存成功");
    try { await AsyncStorage.setItem(`bp_records_${user?.uid}`, JSON.stringify(updated)); await axios.post(API_URL, newRecord); } catch (err) {}
  };

  const handleOCR = async () => {
    const result: any = await launchCamera({ mediaType: 'photo', quality: 0.5 });
    if (result.assets) {
      const ocrResult = await TextRecognition.recognize(result.assets[0].uri);
      const nums = ocrResult.text.match(/\d{2,3}/g);
      if (nums && nums.length >= 2) setBp({ sys: nums[0], dia: nums[1] });
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1890ff" /></View>;
  if (!user) return (
    <SafeAreaView style={styles.loginContainer}>
      <Text style={styles.loginTitle}>☁️ 雲端血壓日記</Text>
      <TextInput style={styles.loginInput} placeholder="信箱" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <TextInput style={styles.loginInput} placeholder="密碼" value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={styles.loginBtn} onPress={() => auth().signInWithEmailAndPassword(email, password)}><Text style={styles.btnText}>登入</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.loginBtn, {backgroundColor: '#52c41a'}]} onPress={() => auth().createUserWithEmailAndPassword(email, password)}><Text style={styles.btnText}>註冊</Text></TouchableOpacity>
    </SafeAreaView>
  );

  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ tabBarStyle: { height: 70, paddingBottom: 12, backgroundColor: '#fff', elevation: 15 }, tabBarIconStyle: { display: 'none' }, tabBarActiveTintColor: '#154360', headerRight: () => (
        <TouchableOpacity onPress={() => auth().signOut()} style={{ marginRight: 15 }} focusable={false}><Text style={{ color: '#ff4d4f', fontWeight: 'bold' }}>登出</Text></TouchableOpacity>
      )}}>
        <Tab.Screen name="Measure" options={{ title: '📸 測量' }}>{() => <HomeScreen user={user} bp={bp} setBp={setBp} handleOCR={handleOCR} autoSaveRecord={autoSaveRecord} lastRecord={records[0]} />}</Tab.Screen>
        <Tab.Screen name="Trend" options={{ title: '📈 趨勢' }}>{() => <TrendScreen records={records} healthAdvice={healthAdvice} />}</Tab.Screen>
        <Tab.Screen name="Diary" options={{ title: '📔 日記' }}>{() => <DiaryScreen records={records} selectedDate={selectedDate} setSelectedDate={setSelectedDate} exportToCSV={async () => {
          const header = "\ufeff時間,收縮壓,舒張壓,狀態\n";
          const rows = records.map(r => `${r.time},${r.sys},${r.dia},${r.level}`).join("\n");
          const path = `${RNFS.TemporaryDirectoryPath}/Report.csv`;
          await RNFS.writeFile(path, header + rows, 'utf8');
          await Share.open({ url: `file://${path}`, type: 'text/csv' });
        }} />}</Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loginContainer: { flex: 1, justifyContent: 'center', padding: 30, backgroundColor: '#fff' },
  loginTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 30, color: '#154360' },
  loginInput: { backgroundColor: '#f5f5f5', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#eee' },
  loginBtn: { backgroundColor: '#154360', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  header: { padding: 15, backgroundColor: 'white' },
  title: { fontSize: 14, fontWeight: 'bold', color: '#555' },
  inputArea: { padding: 15 },
  inputRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  input: { flex: 0.48, backgroundColor: 'white', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', color: '#333' },
  ocrBtn: { backgroundColor: '#cf1322', padding: 18, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  saveBtn: { backgroundColor: '#1890ff', padding: 15, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { color: 'white', fontWeight: 'bold' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  latestCard: { backgroundColor: '#fff', borderRadius: 15, padding: 15, marginBottom: 20, elevation: 3, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardIcon: { width: 30, height: 30, backgroundColor: '#154360', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  cardHeaderText: { fontSize: 16, fontWeight: 'bold', color: '#154360' },
  cardHeaderTime: { fontSize: 11, color: '#999' },
  cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scaleWrapper: { flex: 1, height: 100, justifyContent: 'center', marginLeft: 35, position: 'relative' },
  baseLine: { height: 1, backgroundColor: '#eee', width: '100%' },
  limitLine: { position: 'absolute', left: 0, width: '100%', borderTopWidth: 1, borderTopColor: '#ffccc7' },
  limitText: { position: 'absolute', left: -35, top: -8, fontSize: 10, color: '#ff4d4f', width: 30, textAlign: 'right' },
  valueIndicatorLine: { position: 'absolute', left: 0, width: '100%', flexDirection: 'row', alignItems: 'center', zIndex: 5 },
  redLine: { flex: 1, height: 2, backgroundColor: '#ff4d4f' },
  redDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ff4d4f' },
  // --- 星期對齊修正 ---
  weekLabelsContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 10, paddingHorizontal: 5 },
  weekLabelText: { fontSize: 10, color: '#ccc', textAlign: 'center', width: 20 },
  
  valueWrapper: { flex: 1.2, alignItems: 'flex-end' },
  bigBpText: { fontSize: 32, fontWeight: 'bold', color: '#333' },
  bigPulseText: { fontSize: 24, fontWeight: 'bold', color: '#333', marginTop: 5 },
  unitText: { fontSize: 10, color: '#999', fontWeight: 'bold' },
  customDay: { alignItems: 'center', justifyContent: 'center', width: 42, height: 48, borderRadius: 8 },
  selectedDay: { backgroundColor: '#e6f7ff', borderWidth: 1, borderColor: '#1890ff' },
  dayLabel: { fontSize: 14, color: '#333' },
  dayValue: { fontSize: 10, fontWeight: 'bold', marginTop: 2 },
  analysisCard: { backgroundColor: 'white', margin: 15, padding: 15, borderRadius: 20, elevation: 5 },
  analysisTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#154360' },
  chartStyle: { borderRadius: 15 },
  adviceBox: { marginTop: 15, padding: 15, backgroundColor: '#e6f7ff', borderRadius: 10, borderLeftWidth: 5, borderLeftColor: '#1890ff' },
  adviceText: { fontSize: 14, color: '#003a8c' },
  diaryDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center' },
  detailTitle: { fontSize: 15, fontWeight: 'bold' },
  miniBtn: { backgroundColor: '#52c41a', padding: 5, borderRadius: 5 },
  recordItem: { backgroundColor: 'white', padding: 15, marginHorizontal: 15, marginBottom: 10, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recordLeft: { flex: 1 },
  recordText: { fontSize: 12, color: '#8c8c8c' },
  recordVal: { fontSize: 18, fontWeight: 'bold' },
  levelTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  levelTagText: { color: 'white', fontSize: 11, fontWeight: 'bold' }
});

export default App;