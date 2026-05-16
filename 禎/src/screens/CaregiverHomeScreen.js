import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { colors, radius, shadow, text } from '../theme';

const RECORD_ITEMS = ['飲食', '用藥', '生理量測', '清潔', '活動', '其他'];
const DETAIL_PRESETS = {
  '飲食':   ['早餐已用', '午餐已用', '晚餐已用', '點心/水果'],
  '用藥':   ['飯後藥已吃', '睡前藥已吃', '胰島素已打', '外用藥已擦'],
  '生理量測': ['血壓量測', '體溫量測', '血糖量測', '體重記錄'],
  '清潔':   ['已洗澡', '更換衣物', '口腔清潔', '翻身拍背'],
  '活動':   ['散步', '復健運動', '下床活動'],
  '其他':   ['請手動輸入詳細內容'],
};

const QUICK_BTNS = [
  { label: '異常回報', icon: '🚨', route: 'AbnormalEvent',                color: colors.danger,   bg: colors.dangerBg },
  { label: '異常紀錄', icon: '📊', route: 'AbnormalList',                 color: colors.warning,  bg: colors.warningBg },
  { label: '今日清單', icon: '📋', route: 'DailyTask',                    color: colors.primary,  bg: colors.primaryBg },
  { label: '提醒清單', icon: '📅', route: 'ReminderList',                 color: colors.success,  bg: colors.successBg },
];

export default function CaregiverHomeScreen({ navigation }) {
  const [item, setItem]             = useState('飲食');
  const [detail, setDetail]         = useState('');
  const [customItem, setCustomItem] = useState('');
  const [customDetail, setCustomDetail] = useState('');
  const [loading, setLoading]       = useState(false);

  const handleSubmit = async () => {
    const finalItem   = item === '其他' ? customItem : item;
    const finalDetail = (detail === '其他' || item === '其他') ? customDetail : detail;
    if (!finalItem || !finalDetail) return Alert.alert('提示', '請完整填寫項目名稱與詳細內容');

    setLoading(true);
    try {
      const caregiverName = await AsyncStorage.getItem('userName') || '';
      await client.post('/care-records', { meals: finalItem, note: finalDetail, caregiverName });
      Alert.alert('成功', '紀錄已儲存！');
      setCustomItem(''); setCustomDetail(''); setItem('飲食'); setDetail('');
    } catch {
      Alert.alert('失敗', '上傳錯誤');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* 快速按鈕 */}
      <View style={s.quickRow}>
        {QUICK_BTNS.map(btn => (
          <TouchableOpacity key={btn.route}
            style={[s.quickBtn, { backgroundColor: btn.bg }]}
            onPress={() => navigation.navigate(btn.route, btn.route === 'AbnormalList' ? { role: 'caregiver' } : undefined)}
          >
            <Text style={s.quickIcon}>{btn.icon}</Text>
            <Text style={[s.quickLabel, { color: btn.color }]}>{btn.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 表單卡片 */}
      <View style={s.card}>
        <Text style={s.cardTitle}>新增日常紀錄</Text>

        <Text style={s.label}>1. 選擇紀錄項目</Text>
        <View style={s.picker}>
          <Picker selectedValue={item}
            onValueChange={val => { setItem(val); setDetail(''); setCustomDetail(''); }}
            itemStyle={{ color: colors.text }}>
            {RECORD_ITEMS.map(i => <Picker.Item key={i} label={i} value={i} />)}
          </Picker>
        </View>
        {item === '其他' && (
          <TextInput style={s.input} placeholder="請輸入項目名稱..." value={customItem} onChangeText={setCustomItem} />
        )}

        <Text style={s.label}>2. 詳細內容描述</Text>
        <View style={s.picker}>
          <Picker selectedValue={detail} onValueChange={setDetail}
            enabled={item !== '其他'} itemStyle={{ color: colors.text }}>
            <Picker.Item label="請選擇..." value="" />
            {(DETAIL_PRESETS[item] || []).map(d => <Picker.Item key={d} label={d} value={d} />)}
            <Picker.Item label=" 其他（手動輸入）" value="其他" />
          </Picker>
        </View>
        {(detail === '其他' || item === '其他') && (
          <TextInput style={[s.input, { height: 90, textAlignVertical: 'top' }]}
            placeholder="請輸入詳細內容..." value={customDetail}
            onChangeText={setCustomDetail} multiline />
        )}

        <TouchableOpacity style={[s.primaryBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>確認送出紀錄</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={s.outlineBtn} onPress={() => navigation.navigate('CareRecordList')}>
          <Ionicons name="time-outline" size={18} color={colors.primary} />
          <Text style={s.outlineBtnText}>查看歷史紀錄</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.bg },
  quickRow:     { flexDirection: 'row', padding: 16, gap: 10 },
  quickBtn:     { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md },
  quickIcon:    { fontSize: 20, marginBottom: 4 },
  quickLabel:   { fontSize: 11, fontWeight: '600' },

  card:         { backgroundColor: colors.card, marginHorizontal: 16, borderRadius: radius.lg, padding: 20, ...shadow.sm },
  cardTitle:    { ...text.h2, marginBottom: 16 },
  label:        { ...text.h3, marginTop: 16, marginBottom: 6 },
  picker:       { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: '#F8FAFC', height: 140, overflow: 'hidden', justifyContent: 'center', marginBottom: 8 },
  input:        { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, padding: 12, fontSize: 15, backgroundColor: colors.primaryBg, marginBottom: 8 },

  primaryBtn:   { backgroundColor: colors.primary, padding: 16, borderRadius: radius.md, alignItems: 'center', marginTop: 20 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  outlineBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary, marginTop: 10 },
  outlineBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
});
