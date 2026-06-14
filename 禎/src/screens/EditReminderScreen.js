import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Modal } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';

export default function EditReminderScreen({ route, navigation }) {
  const { item } = route.params;

  const [category, setCategory] = useState(item.category || '用藥提醒');
  const [detail, setDetail] = useState(item.content || '');
  const [customDetail, setCustomDetail] = useState('');
  const [isCustomContent, setIsCustomContent] = useState(false);

  const now = new Date(item.time ? new Date(item.time) : new Date());
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [day, setDay] = useState(now.getDate());
  const [hour, setHour] = useState(now.getHours());
  const [minute, setMinute] = useState(now.getMinutes());

  const [showModal, setShowModal] = useState(false);
  const [activePicker, setActivePicker] = useState(null);
  const [loading, setLoading] = useState(false);

  const categories = ['用藥提醒', '醫療行程', '生理量測', '生活照護', '其他'];
  const detailPresets = {
    '用藥提醒': ['飯後服用血壓藥', '睡前服用安眠藥', '三餐飯後服藥', '施打胰島素'],
    '醫療行程': ['醫院回診', '診所拿藥', '物理治療/復健', '施打疫苗'],
    '生理量測': ['測量血壓', '測量空腹血糖', '測量體溫', '測量體重'],
    '生活照護': ['協助洗澡', '更換尿布', '剪指甲', '翻身拍背'],
    '其他': ['請手動輸入']
  };

  useEffect(() => {
    const presets = detailPresets[category] || [];
    if (presets.includes(item.content)) {
      setDetail(item.content);
      setIsCustomContent(false);
    } else {
      setDetail('其他');
      setCustomDetail(item.content);
      setIsCustomContent(true);
    }
  }, []);

  const generateRange = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const years = generateRange(now.getFullYear(), now.getFullYear() + 20);
  const months = generateRange(1, 12);
  const hours = generateRange(0, 23);
  const minutes = generateRange(0, 59);

  const getDaysInMonth = (y, m) => new Date(y, m, 0).getDate();
  const [days, setDays] = useState(generateRange(1, 31));

  useEffect(() => {
    const maxDay = getDaysInMonth(year, month);
    setDays(generateRange(1, maxDay));
    if (day > maxDay) setDay(maxDay);
  }, [year, month]);

  const displayDate = () => {
    const y = year;
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${y}/${m}/${d}`;
  };

  const handleCategoryChange = (newCategory) => {
    setCategory(newCategory);
    const presets = detailPresets[newCategory] || [];
    if (presets.length > 0) {
      setDetail(presets[0]);
      setCustomDetail('');
      setIsCustomContent(false);
    } else {
      setDetail('');
      setIsCustomContent(true);
    }
  };

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

  const handleValueChange = (val) => {
    switch (activePicker) {
      case 'year': setYear(val); break;
      case 'month': setMonth(val); break;
      case 'day': setDay(val); break;
      case 'hour': setHour(val); break;
      case 'minute': setMinute(val); break;
    }
  };

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

  const getPickerTitle = () => {
    switch (activePicker) {
      case 'year': return '選擇年';
      case 'month': return '選擇月';
      case 'day': return '選擇日';
      case 'hour': return '選擇時';
      case 'minute': return '選擇分';
      default: return '請選擇';
    }
  };

  const handleSubmit = async () => {
    const finalContent = isCustomContent ? customDetail : detail;
    if (!finalContent) return Alert.alert('提示', '請填寫內容');

    setLoading(true);
    try {
      const scheduledTime = new Date(year, month - 1, day, hour, minute);

      await client.put(`/api/reminders/${item._id}`, {
        category,
        content: finalContent,
        time: scheduledTime.toISOString(),
      });

      Alert.alert('成功', '提醒已更新！', [{ text: '好', onPress: () => navigation.goBack() }]);
    } catch (error) {
      console.log("錯誤詳情:", error);
      let errorMessage = '連線錯誤';
      if (error.response) {
        if (error.response.status === 404) errorMessage = '找不到路徑 (404)';
        else if (error.response.status === 500) errorMessage = '伺服器錯誤 (500)';
        else errorMessage = `錯誤: ${error.response.status}`;
      } else if (error.request) {
        errorMessage = '無法連接伺服器，請檢查網路';
      } else {
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
        <Text style={styles.title}>📅 編輯提醒</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>1. 提醒事項</Text>
        <View style={styles.pickerBox}>
          <Picker selectedValue={category} onValueChange={handleCategoryChange}>
            {categories.map(c => <Picker.Item key={c} label={c} value={c} />)}
          </Picker>
        </View>

        <View style={[styles.pickerBox, { marginTop: 10 }]}>
          <Picker selectedValue={detail} onValueChange={(v) => {
            setDetail(v);
            setIsCustomContent(v === '其他');
          }}>
            {(detailPresets[category] || []).map(d => <Picker.Item key={d} label={d} value={d} />)}
            <Picker.Item label=" 其他" value="其他" />
          </Picker>
        </View>

        {isCustomContent && (
          <TextInput
            style={styles.input}
            placeholder="輸入內容..."
            value={customDetail}
            onChangeText={setCustomDetail}
          />
        )}

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
          <Text style={styles.submitText}>{loading ? '儲存中...' : '儲存修改'}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{getPickerTitle()}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={styles.modalDone}>完成</Text>
              </TouchableOpacity>
            </View>
            <Picker
              selectedValue={getCurrentValue()}
              onValueChange={handleValueChange}
              style={{ height: 200 }}
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
  header: { padding: 20, backgroundColor: '#1890ff', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  formCard: { backgroundColor: '#fff', margin: 15, padding: 20, borderRadius: 15, marginTop: -15, elevation: 3 },
  label: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 15, marginBottom: 5 },
  pickerBox: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#fafafa' },
  input: { borderWidth: 1, borderColor: '#1890ff', padding: 10, borderRadius: 8, marginTop: 10, backgroundColor: '#e6f4ff' },
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
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  modalDone: { fontSize: 16, color: '#007aff', fontWeight: 'bold' },
  submitBtn: { backgroundColor: '#1890ff', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 25 },
  submitText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});
