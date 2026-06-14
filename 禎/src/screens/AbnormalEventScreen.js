import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons'; 
import client from '../api/client';

export default function AbnormalEventScreen({ navigation }) {
  const [type, setType] = useState('跌倒/受傷');
  const [detail, setDetail] = useState('');
  const [customDetail, setCustomDetail] = useState('');
  const [customType, setCustomType] = useState('');
  const [severity, setSeverity] = useState('注意'); 
  const [loading, setLoading] = useState(false);

  const eventTypes = [
    { label: '跌倒/受傷', icon: '🚨' },
    { label: '生理異常', icon: '🩺' },
    { label: '情緒/行為', icon: '😰' },
    { label: '飲食/排泄', icon: '🍽️' },
    { label: '其他', icon: '📝' },
  ];
  const detailPresets = {
    '跌倒/受傷': ['浴室滑倒', '下床跌倒', '行走時絆倒', '撞到傢俱', '皮膚擦傷/瘀青'],
    '生理異常': ['發燒 (>38度)', '呼吸急促/困難', '血壓過高', '持續嘔吐', '意識不清'],
    '情緒/行為': ['情緒激動/吼叫', '拒絕照護/服藥', '遊走/迷路', '睡眠障礙/失眠'],
    '飲食/排泄': ['完全拒食', '吞嚥困難/嗆咳', '便秘 (>3天)', '嚴重腹瀉'],
    '其他': []
  };

  // 🚦 嚴重程度定義 (柔和化顏色)
  const severityLevels = [
    { 
      id:'輕微', 
      label: '🟢 輕微 (觀察)', 
      desc: '如：輕微擦傷、食慾稍差。無立即危險，持續觀察即可。',
      color: '#52c41a', 
      bg: '#f6ffed',
      borderColor: '#b7eb8f'
    },
    { 
      id:'注意', 
      label: '🟠 注意 (需處置)', 
      desc: '如：發燒、持續腹瀉、跌倒。需家屬知情或安排就醫。',
      color: '#fa8c16', 
      bg: '#fff7e6',
      borderColor: '#ffd591'
    },
    { 
      id:'緊急', 
      label: '🔴 緊急 (立即送醫)', 
      desc: '如：意識不清、呼吸困難、大出血。請直接撥打 119！',
      color: '#f5222d', 
      bg: '#fff1f0',
      borderColor: '#ffa39e'
    }
  ];

  const handleSubmit = async () => {
    const finalType = type === '其他' ? customType : type;
    const finalDescription = detail === '其他' ? customDetail : detail;

    if (!finalType || !finalDescription) {
      Alert.alert('提示', '請填寫事件類別與狀況描述');
      return;
    }

    setLoading(true);
    try {
      const response = await client.post('/api/abnormal-events', {
        type: finalType,
        description: finalDescription,
        severity: severity, 
        status: 'pending',  
        createdAt: new Date()
      });
      if (response.status === 200 || response.status === 201) {
        Alert.alert('通報成功', '已發送通知給家屬！', [
          { text: '好的', onPress: () => navigation.goBack() }
        ]);
      }
    } catch (error) {
      console.error(error); 
      Alert.alert('通報失敗', '網路不穩');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* 🚀 柔和質感的頂部標題 */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>異常事件通報</Text>
        </View>
        <Text style={styles.subtitle}>請協助記錄長輩的突發狀況，系統將同步通知家屬。</Text>
      </View>

      <View style={styles.formCard}>
        {/* 1. 事件類別 */}
        <Text style={styles.label}>1. 選擇事件類別</Text>
        <View style={styles.pickerBox}>
          <Picker
            selectedValue={type}
            onValueChange={(val) => { setType(val); setDetail(''); setCustomDetail(''); setCustomType(''); }}
            itemStyle={{ color: '#333333' }}
          >
            {eventTypes.map(t => <Picker.Item key={t.label} label={`${t.icon} ${t.label}`} value={t.label} />)}
          </Picker>
        </View>

        {/* 事件類別為「其他」時的輸入框 */}
        {type === '其他' && (
          <TextInput
            style={styles.customInput}
            placeholder="請輸入事件類別..."
            placeholderTextColor="#999"
            value={customType}
            onChangeText={setCustomType}
          />
        )}

        {/* 2. 狀況描述 */}
        <Text style={styles.label}>2. 詳細狀況描述</Text>
        <View style={[styles.pickerBox, { marginTop: 5 }]}>
          <Picker
            selectedValue={detail}
            onValueChange={(val) => setDetail(val)}
            itemStyle={{ color: '#333333' }}
          >
            <Picker.Item label="請選擇具體狀況..." value="" />
            {(detailPresets[type] || []).map(d => <Picker.Item key={d} label={d} value={d} />)}
            <Picker.Item label=" 其他 (手動輸入)" value="其他" />
          </Picker>
        </View>

        {/* 狀況描述為「其他」時的輸入框 */}
        {detail === '其他' && (
          <TextInput
            style={styles.customInput}
            placeholder="請詳細描述發生經過..."
            placeholderTextColor="#999"
            value={customDetail}
            onChangeText={setCustomDetail}
            multiline
          />
        )}

        {/* 3. 嚴重程度選擇 */}
        <Text style={styles.label}>3. 嚴重程度判斷</Text>
        <View style={styles.severityContainer}>
          {severityLevels.map((level) => {
            const isActive = severity === level.id;
            return (
              <TouchableOpacity
                key={level.id}
                style={[
                  styles.severityBtn,
                  isActive ? { backgroundColor: level.bg, borderColor: level.borderColor, borderWidth: 2 } : null
                ]}
                onPress={() => setSeverity(level.id)}
              >
                <View style={styles.severityHeader}>
                  <Text style={[styles.severityLabel, { color: level.color }]}>{level.label}</Text>
                  {isActive && <Ionicons name="checkmark-circle" size={20} color={level.color} />}
                </View>
                <Text style={styles.severityDesc}>{level.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 確認按鈕 (對齊截圖的綠色) */}
        <TouchableOpacity 
          style={[styles.submitBtn, loading && { opacity: 0.6 }]} 
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>確認通報</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  
  // 清爽的頂部設計
  header: { padding: 25, paddingTop: 30, backgroundColor: '#ffffff', borderBottomWidth: 1, borderColor: '#eeeeee' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2c3e50', marginLeft: 8 },
  subtitle: { fontSize: 14, color: '#7f8c8d', lineHeight: 20 },
  
  // 乾淨的白色卡片
  formCard: { backgroundColor: '#ffffff', margin: 15, padding: 20, borderRadius: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  label: { fontSize: 16, fontWeight: 'bold', color: '#34495e', marginTop: 15, marginBottom: 10 },
  
  // 統一的滾輪框
  pickerBox: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, backgroundColor: '#fafafa', height: 150, overflow: 'hidden', justifyContent: 'center' },
  
  // 手動輸入框 (拿掉紅色)
  customInput: { borderWidth: 1, borderColor: '#d9d9d9', padding: 15, borderRadius: 10, marginTop: 15, height: 100, textAlignVertical: 'top', backgroundColor: '#fafafa', fontSize: 15, color: '#333' },
  
  // 嚴重程度按鈕
  severityContainer: { flexDirection: 'column', gap: 12 },
  severityBtn: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#ffffff' },
  severityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  severityLabel: { fontSize: 16, fontWeight: 'bold' },
  severityDesc: { fontSize: 13, color: '#7f8c8d', lineHeight: 18 },

  // 送出按鈕 (與截圖一致的綠色)
  submitBtn: { backgroundColor: '#389e0d', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 35, elevation: 2 },
  submitText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' }
});