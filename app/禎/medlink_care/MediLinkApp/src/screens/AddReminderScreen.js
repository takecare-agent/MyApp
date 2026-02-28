import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Modal, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons'; // 增加箭頭圖示讓它更像選單
import client from '../api/client';

export default function AddReminderScreen({ navigation }) {
  const [category, setCategory] = useState('用藥提醒');
  const [detail, setDetail] = useState('');
  const [customDetail, setCustomDetail] = useState('');

  // 🚀 時間狀態
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [day, setDay] = useState(now.getDate());
  const [hour, setHour] = useState(now.getHours());
  const [minute, setMinute] = useState(now.getMinutes());

  // 🚀 控制彈出視窗的狀態 (解決 iOS 壓扁問題的關鍵)
  const [showModal, setShowModal] = useState(false);
  const [activePicker, setActivePicker] = useState(null); // 記錄現在正在選哪一個：'year', 'month', 'day'...

  const [loading, setLoading] = useState(false);

  // 選單資料
  const categories = ['用藥提醒', '醫療行程', '生理量測', '生活照護', '其他'];
  const detailPresets = {
    '用藥提醒': ['飯後服用血壓藥', '睡前服用安眠藥', '三餐飯後服藥', '施打胰島素'],
    '醫療行程': ['醫院回診', '診所拿藥', '物理治療/復健', '施打疫苗'],
    '生理量測': ['測量血壓', '測量空腹血糖', '測量體溫', '測量體重'],
    '生活照護': ['協助洗澡', '更換尿布', '剪指甲', '翻身拍背'],
    '其他': ['請手動輸入']
  };

  // 產生數字陣列
  const generateRange = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const years = generateRange(now.getFullYear(), now.getFullYear() + 20);
  const months = generateRange(1, 12);
  const hours = generateRange(0, 23);
  const minutes = generateRange(0, 59);

  // 大小月處理
  const getDaysInMonth = (y, m) => new Date(y, m, 0).getDate();
  const [days, setDays] = useState(generateRange(1, 31));

  useEffect(() => {
    const maxDay = getDaysInMonth(year, month);
    setDays(generateRange(1, maxDay));
    if (day > maxDay) setDay(maxDay);
  }, [year, month]);

  // 📌 通用的選單按鈕元件 (讓畫面變整齊的功臣)
  const renderSelectorBtn = (label, value, type) => (
    <TouchableOpacity 
      style={styles.dropdownBox} 
      onPress={() => {
        setActivePicker(type);
        setShowModal(true);
      }}
    >
      <Text style={styles.selectorText}>{value}{label}</Text>
      <Ionicons name="chevron-down" size={16} color="#666" />
    </TouchableOpacity>
  );

  // 📌 根據現在點選的項目，回傳對應的 Picker 選項
  const renderPickerContent = () => {
    switch (activePicker) {
      case 'year':
        return years.map(y => <Picker.Item key={y} label={`${y}年`} value={y} />);
      case 'month':
        return months.map(m => <Picker.Item key={m} label={`${m}月`} value={m} />);
      case 'day':
        return days.map(d => <Picker.Item key={d} label={`${d}日`} value={d} />);
      case 'hour':
        return hours.map(h => <Picker.Item key={h} label={`${String(h).padStart(2,'0')}時`} value={h} />);
      case 'minute':
        return minutes.map(m => <Picker.Item key={m} label={`${String(m).padStart(2,'0')}分`} value={m} />);
      default:
        return null;
    }
  };

  // 📌 處理數值變更
  const handleValueChange = (val) => {
    switch (activePicker) {
      case 'year': setYear(val); break;
      case 'month': setMonth(val); break;
      case 'day': setDay(val); break;
      case 'hour': setHour(val); break;
      case 'minute': setMinute(val); break;
    }
  };

  // 📌 取得目前選單的值 (給 Picker 顯示用)
  const getCurrentValue = () => {
    switch (activePicker) {
      case 'year': return year;
      case 'month': return month;
      case 'day': return day;
      case 'hour': return hour;
      case 'minute': return minute;
      default: return 0;
    }
  };

  const handleSubmit = async () => {
    const finalContent = (detail === '其他' || category === '其他') ? customDetail : detail;
    if (!finalContent) return Alert.alert('提示', '請填寫內容');

    setLoading(true);
    try {
      const scheduledTime = new Date(year, month - 1, day, hour, minute);
      
      await client.post('/api/reminders', {
        category,
        content: finalContent,
        time: scheduledTime.toISOString(),
        isCompleted: false,
        createdAt: new Date()
      });
     // ... 前面的程式碼 ...
      Alert.alert('成功', '提醒已設定！', [{ text: '好', onPress: () => navigation.goBack() }]);
    } catch (error) {
      // 🕵️‍♂️ 偵探模式：把錯誤印出來
      console.log("錯誤詳情:", error);

      let errorMessage = '連線錯誤';
      
      if (error.response) {
        // 狀況 A：伺服器有回應，但是是拒絕的 (例如 404 找不到, 500 當機)
        console.log("伺服器回應狀態:", error.response.status);
        if (error.response.status === 404) {
          errorMessage = '找無路徑 (404)！請檢查後端路由';
        } else if (error.response.status === 500) {
          errorMessage = '伺服器內部錯誤 (500)';
        } else {
          errorMessage = `伺服器錯誤: ${error.response.status}`;
        }
      } else if (error.request) {
        // 狀況 B：請求發出去了，但完全沒收到回應 (通常是 IP 錯、防火牆擋住、或後端沒開)
        errorMessage = '無法連接伺服器 (Network Error)，請檢查 IP 或防火牆';
      } else {
        // 狀況 C：程式碼本身寫錯
        errorMessage = error.message;
      }

      Alert.alert('失敗', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📅 新增提醒</Text>
      </View>

      <View style={styles.formCard}>
        {/* 1. 類別 (這部分如果是 Android 顯示正常可以保留，若也跑版可改用一樣的 Modal 邏輯) */}
        <Text style={styles.label}>1. 提醒事項</Text>
        <View style={styles.pickerBox}>
          <Picker selectedValue={category} onValueChange={(v) => { setCategory(v); setDetail(''); }}>
            {categories.map(c => <Picker.Item key={c} label={c} value={c} />)}
          </Picker>
        </View>

        <View style={[styles.pickerBox, { marginTop: 10 }]}>
          <Picker selectedValue={detail} onValueChange={setDetail}>
            {(detailPresets[category] || []).map(d => <Picker.Item key={d} label={d} value={d} />)}
            <Picker.Item label=" 其他" value="其他" />
          </Picker>
        </View>

        {(detail === '其他' || category === '其他') && (
          <TextInput style={styles.input} placeholder="輸入內容..." value={customDetail} onChangeText={setCustomDetail} />
        )}

        {/* 🚀 2. 漂亮的方塊按鈕區 (iOS 也不會跑版了) */}
        <Text style={styles.label}>2. 設定日期</Text>
        <View style={styles.rowContainer}>
          <View style={{ flex: 1.3, marginRight: 5 }}>
            {renderSelectorBtn('年', year, 'year')}
          </View>
          <View style={{ flex: 1, marginRight: 5 }}>
            {renderSelectorBtn('月', month, 'month')}
          </View>
          <View style={{ flex: 1 }}>
            {renderSelectorBtn('日', day, 'day')}
          </View>
        </View>

        <Text style={styles.label}>3. 設定時間</Text>
        <View style={styles.rowContainer}>
          <View style={{ flex: 1, marginRight: 10 }}>
            {renderSelectorBtn('時', String(hour).padStart(2,'0'), 'hour')}
          </View>
          <Text style={{ fontSize: 20, fontWeight: 'bold' }}>:</Text>
          <View style={{ flex: 1, marginLeft: 10 }}>
            {renderSelectorBtn('分', String(minute).padStart(2,'0'), 'minute')}
          </View>
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
          <Text style={styles.submitText}>{loading ? '設定中...' : '確認新增'}</Text>
        </TouchableOpacity>
      </View>

      {/* 🚀 彈出式選單 (Modal) - 解決 iOS 擠壓問題的核心 */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* 標題與關閉按鈕 */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>請選擇</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={styles.modalDone}>完成</Text>
              </TouchableOpacity>
            </View>
            
            {/* 滾輪本體 */}
            <Picker
              selectedValue={getCurrentValue()}
              onValueChange={handleValueChange}
              style={{ height: 200 }} // 給滾輪足夠的高度
            >
              {renderPickerContent()}
            </Picker>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: { padding: 20, backgroundColor: '#389e0d', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  formCard: { backgroundColor: '#fff', margin: 15, padding: 20, borderRadius: 15, marginTop: -15, elevation: 3 },
  label: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 15, marginBottom: 5 },
  
  // 原本的 Picker 外框
  pickerBox: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#fafafa' },
  input: { borderWidth: 1, borderColor: '#389e0d', padding: 10, borderRadius: 8, marginTop: 10, backgroundColor: '#f6ffed' },

  // 🚀 新的方塊按鈕樣式 (像你的設計圖)
  rowContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownBox: { 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1, 
    borderColor: '#ccc', 
    borderRadius: 8, 
    paddingHorizontal: 10,
    height: 50, 
    backgroundColor: '#fff' 
  },
  selectorText: { fontSize: 16, color: '#333' },

  // 🚀 Modal 彈出視窗樣式
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  modalDone: { fontSize: 16, color: '#007aff', fontWeight: 'bold' },

  submitBtn: { backgroundColor: '#389e0d', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 25 },
  submitText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});