import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons'; // 👈 1. 補上這行，不然圖示出不來
import client from '../api/client';

export default function CaregiverHomeScreen({ navigation }) {
  const [item, setItem] = useState('飲食'); 
  const [detail, setDetail] = useState(''); 
  
  // 自定義輸入狀態
  const [customItem, setCustomItem] = useState(''); 
  const [customDetail, setCustomDetail] = useState(''); 
  
  const [loading, setLoading] = useState(false);

  const recordItems = ['飲食', '用藥', '生理量測', '清潔', '活動', '其他'];
  const detailPresets = {
    '飲食': ['早餐已用', '午餐已用', '晚餐已用', '點心/水果'],
    '用藥': ['飯後藥已吃', '睡前藥已吃', '胰島素已打', '外用藥已擦'],
    '生理量測': ['血壓量測', '體溫量測', '血糖量測', '體重記錄'],
    '清潔': ['已洗澡', '更換衣物', '口腔清潔', '翻身拍背'],
    '活動': ['散步', '復健運動', '下床活動'],
    '其他': ['請手動輸入詳細內容']
  };

  const handleSubmit = async () => {
    // 邏輯：如果是「其他」，就改用使用者手動輸入的文字
    const finalItem = item === '其他' ? customItem : item;
    const finalDetail = (detail === '其他' || item === '其他') ? customDetail : detail;

    if (!finalItem || !finalDetail) {
      Alert.alert('提示', '請完整填寫項目名稱與詳細內容');
      return;
    }

    setLoading(true);
    try {
      const response = await client.post('/care-records', {
        title: finalItem,   // 這裡統一改成 title (跟後端對齊)
        description: finalDetail,  // 統一改成 description
        createdAt: new Date()
      });

      if (response.status === 201 || response.status === 200) {
        Alert.alert('成功', '紀錄已儲存！');
        // 重置表單
        setCustomItem('');
        setCustomDetail('');
        setItem('飲食');
        setDetail('');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('失敗', '上傳錯誤');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* 快速按鈕區 */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={[styles.actionBtn, styles.redBtn]} onPress={() => navigation.navigate('AbnormalEvent')}>
          <Text style={styles.actionText}>🚨 異常回報</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.greenBtn]} onPress={() => navigation.navigate('ReminderList')}>
          <Text style={styles.actionText}>📅 提醒清單</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.header}>新增日常紀錄</Text>

        {/* --- 第一層：選擇項目 --- */}
        <Text style={styles.label}>1. 選擇紀錄項目</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={item}
            onValueChange={(val) => { 
              setItem(val); 
              setDetail(''); 
              if (val === '其他') setDetail('其他'); 
            }}
            itemStyle={{ color: '#333' }}
          >
            {recordItems.map(i => <Picker.Item key={i} label={i} value={i} />)}
          </Picker>
        </View>

        {/* 手動輸入項目 */}
        {item === '其他' && (
          <TextInput
            style={styles.simpleInput}
            placeholder="請輸入項目名稱 (例如：打掃環境)..."
            value={customItem}
            onChangeText={setCustomItem}
          />
        )}

        {/* --- 第二層：詳細內容 --- */}
        <Text style={styles.label}>2. 詳細內容描述</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={detail}
            onValueChange={(val) => setDetail(val)}
            enabled={item !== '其他'} 
            itemStyle={{ color: '#333' }}
          >
            <Picker.Item label="請選擇..." value="" />
            {(detailPresets[item] || []).map(d => <Picker.Item key={d} label={d} value={d} />)}
            <Picker.Item label=" 其他（手動輸入）" value="其他" />
          </Picker>
        </View>

        {/* 手動輸入詳細內容 */}
        {(detail === '其他' || item === '其他') && (
          <TextInput
            style={styles.customInput}
            placeholder="請輸入詳細內容..."
            value={customDetail}
            onChangeText={setCustomDetail}
            multiline
          />
        )}

        {/* 確認送出按鈕 */}
        <TouchableOpacity 
          style={[styles.submitBtn, loading && { opacity: 0.6 }]} 
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>確認送出紀錄</Text>}
        </TouchableOpacity>

        {/* 👇 2. 查看歷史紀錄按鈕 */}
        <TouchableOpacity 
          style={styles.historyBtn} 
          onPress={() => navigation.navigate('CareRecordList')}
        >
          <Ionicons name="time-outline" size={20} color="#3498db" />
          <Text style={styles.historyText}> 查看歷史紀錄</Text>
        </TouchableOpacity>

        <View style={{ height: 30 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  
  // 快速按鈕
  quickActions: { flexDirection: 'row', padding: 15, justifyContent: 'space-between' },
  actionBtn: { flex: 0.48, padding: 15, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  redBtn: { backgroundColor: '#fff1f0', borderColor: '#ffa39e' },
  greenBtn: { backgroundColor: '#f6ffed', borderColor: '#b7eb8f' },
  actionText: { fontWeight: 'bold', fontSize: 16 },
  
  // 表單卡片
  formCard: { backgroundColor: '#fff', margin: 15, padding: 20, borderRadius: 15, elevation: 3 },
  header: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 20 },
  label: { fontSize: 16, fontWeight: 'bold', color: '#666', marginTop: 15, marginBottom: 5 },
  pickerContainer: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, backgroundColor: '#fafafa', marginBottom: 10,height: 150, 
    overflow: 'hidden', 
    justifyContent: 'center' },
  
  // 輸入框
  simpleInput: { borderWidth: 1, borderColor: '#3498db', padding: 12, borderRadius: 10, marginBottom: 10, backgroundColor: '#eaf2f8' },
  customInput: { borderWidth: 1, borderColor: '#3498db', padding: 15, borderRadius: 10, marginTop: 5, height: 100, textAlignVertical: 'top', backgroundColor: '#eaf2f8' },
  
  // 送出按鈕 (實心藍)
  submitBtn: { 
    backgroundColor: '#3498db', 
    padding: 18, 
    borderRadius: 10, 
    alignItems: 'center', 
    marginTop: 30 
  },
  submitText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  // 👇 3. 補上歷史紀錄按鈕樣式 (空心藍)
  historyBtn: {
    marginTop: 15,
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3498db',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  historyText: {
    color: '#3498db',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 5
  }
});