import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import client from '../api/client';

export default function AbnormalEventScreen({ navigation }) {
  // 狀態管理
  const [type, setType] = useState('跌倒/受傷');
  const [detail, setDetail] = useState('');
  const [customDetail, setCustomDetail] = useState('');
  const [severity, setSeverity] = useState('注意'); // 預設為「注意」
  const [loading, setLoading] = useState(false);

  // 📖 連動選單資料庫
  const eventTypes = ['跌倒/受傷', '生理異常', '情緒/行為', '飲食/排泄', '其他'];
  const detailPresets = {
    '跌倒/受傷': ['浴室滑倒', '下床跌倒', '行走時絆倒', '撞到傢俱', '皮膚擦傷/瘀青'],
    '生理異常': ['發燒 (>38度)', '呼吸急促/困難', '血壓過高 (>160)', '持續嘔吐', '意識不清'],
    '情緒/行為': ['情緒激動/吼叫', '拒絕照護/服藥', '甚至遊走/迷路', '睡眠障礙/失眠'],
    '飲食/排泄': ['完全拒食', '吞嚥困難/嗆咳', '便秘 (>3天)', '嚴重腹瀉'],
    '其他': ['請手動描述異常狀況']
  };

  // 🚦 嚴重程度定義 (給看護看的指導原則)
  const severityLevels = [
    { 
      id:'輕微', 
      label: '🟢 輕微 (觀察)', 
      desc: '如：輕微擦傷、食慾稍差。無立即危險，持續觀察即可。',
      color: '#52c41a', 
      bg: '#f6ffed' 
    },
    { 
      id:'注意', 
      label: '🟠 注意 (需處置)', 
      desc: '如：發燒、持續腹瀉、跌倒。需家屬知情或安排就醫。',
      color: '#fa8c16', 
      bg: '#fff7e6' 
    },
    { 
      id:'緊急', 
      label: '🔴 緊急 (立即送醫)', 
      desc: '如：意識不清、呼吸困難、大出血。請直接撥打 119！',
      color: '#f5222d', 
      bg: '#fff1f0' 
    }
  ];

  const handleSubmit = async () => {
    // 組合描述內容
    const finalDescription = (detail === '其他' || type === '其他') ? customDetail : detail;

    if (!finalDescription) {
      Alert.alert('提示', '請選擇或輸入異常描述');
      return;
    }

    setLoading(true);
    try {
      // 1. 先在終端機檢查到底送了什麼（除錯用）
      console.log("【準備通報】資料：", {
        type: type,         
        description: finalDescription,
        severity: severity,  
      });
      // 傳送到 MongoDB
      const response = await client.post('/api/abnormal-events', {
        type: type,
        description: finalDescription,
        severity: severity, // 儲存明確的嚴重等級
        status: 'pending',  // 預設狀態為「待處理」
        createdAt: new Date()
      });
      if (response.data) {
      Alert.alert('通報成功');
      if (response.status === 200 || response.status === 201) {
      Alert.alert('⚠️ 通報成功', '系統已發送緊急通知給家屬！', [
          { text: '好的', onPress: () => navigation.goBack() }
        ]);
      }}
    } catch (error) {
    console.error(error); // 👈 這裡可以看到真正網址變成了什麼
    Alert.alert('通報失敗', '網路不穩');
  }
};

  return (
    <ScrollView style={styles.container}>
      {/* 紅色警示頂部 */}
      <View style={styles.warningHeader}>
        <Text style={styles.warningTitle}>⚠️ 異常事件通報</Text>
        <Text style={styles.warningSub}>請依照下方說明，選擇正確的嚴重程度</Text>
      </View>

      <View style={styles.formCard}>
        {/* 1. 事件類型 */}
        <Text style={styles.label}>1. 發生什麼事？(類型)</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={type}
            onValueChange={(val) => { setType(val); setDetail(''); setCustomDetail(''); }}
            itemStyle={{ color: '#333' }}
          >
            {eventTypes.map(t => <Picker.Item key={t} label={t} value={t} />)}
          </Picker>
        </View>
        {/* 2. 詳細狀況 */}
        <Text style={styles.label}>2. 詳細狀況描述</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={detail}
            onValueChange={(val) => setDetail(val)}
            itemStyle={{ color: '#333' }}
          >
            <Picker.Item label="請選擇具體狀況..." value="" />
            {(detailPresets[type] || []).map(d => <Picker.Item key={d} label={d} value={d} />)}
            <Picker.Item label=" 其他" value="其他" />
          </Picker>
        </View>

        {/* 手動輸入框 */}
        {(detail === '其他' || type === '其他') && (
          <TextInput
            style={styles.customInput}
            placeholder="請詳細描述發生經過..."
            value={customDetail}
            onChangeText={setCustomDetail}
            multiline
          />
        )}

        {/* 🚀 3. 嚴重程度選擇 (視覺化按鈕) */}
        <Text style={styles.label}>3. 嚴重程度判斷 (點擊選擇)</Text>
        <View style={styles.severityContainer}>
          {severityLevels.map((level) => (
            <TouchableOpacity
              key={level.id}
              style={[
                styles.severityBtn,
                // 選中時顯示深色邊框與背景
                severity === level.id ? { borderColor: level.color, backgroundColor: level.bg, borderWidth: 2 } : { borderColor: '#ddd' }
              ]}
              onPress={() => setSeverity(level.id)}
            >
              <Text style={[styles.severityLabel, { color: level.color }]}>
                {level.label}
              </Text>
              <Text style={styles.severityDesc}>{level.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity 
          style={[styles.submitBtn, loading && { opacity: 0.6 }]} 
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>🚨 立即通報</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  warningHeader: { backgroundColor: '#cf1322', padding: 25, alignItems: 'center', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  warningTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 5 },
  warningSub: { color: '#ffccc7', fontSize: 14 },
  
  formCard: { backgroundColor: '#fff', margin: 15, padding: 20, borderRadius: 15, marginTop: -20, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  label: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 20, marginBottom: 8 },
  pickerContainer: { borderWidth: 1, borderColor: '#d9d9d9', borderRadius: 8, backgroundColor: '#fafafa',height: 150, overflow: 'hidden', justifyContent: 'center' },
  customInput: { borderWidth: 1, borderColor: '#cf1322', padding: 12, borderRadius: 8, marginTop: 10, height: 80, textAlignVertical: 'top', backgroundColor: '#fff1f0' },
  
  // 🚀 嚴重程度按鈕樣式
  severityContainer: { flexDirection: 'column', gap: 10 },
  severityBtn: { padding: 15, borderRadius: 10, borderWidth: 1, backgroundColor: '#fff', marginBottom: 8 },
  severityLabel: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  severityDesc: { fontSize: 13, color: '#666', lineHeight: 18 },

  submitBtn: { backgroundColor: '#cf1322', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 30, shadowColor: '#cf1322', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  submitText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});