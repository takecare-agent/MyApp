import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';
import { colors, radius, shadow, text } from '../theme';

const MEAL_ITEMS   = ['飲食', '用藥', '生理量測', '清潔', '活動', '其他'];
const DETAIL_MAP   = {
  '飲食':   ['早餐已用', '午餐已用', '晚餐已用', '點心/水果'],
  '用藥':   ['飯後藥已吃', '睡前藥已吃', '胰島素已打', '外用藥已擦'],
  '生理量測': ['血壓量測', '體溫量測', '血糖量測', '體重記錄'],
  '清潔':   ['已洗澡', '更換衣物', '口腔清潔', '翻身拍背'],
  '活動':   ['散步', '復健運動', '下床活動'],
  '其他':   ['請手動輸入詳細內容'],
};

export default function EditRecordScreen({ route, navigation }) {
  const { record, onSaved } = route.params;

  const initCat   = MEAL_ITEMS.includes(record.meals) ? record.meals : '其他';
  const initDet   = DETAIL_MAP[initCat]?.includes(record.note) ? record.note : '其他';

  const [category, setCategory]             = useState(initCat);
  const [detail, setDetail]                 = useState(initDet);
  const [customCategory, setCustomCategory] = useState(initCat === '其他' ? (record.meals || '') : '');
  const [customDetail, setCustomDetail]     = useState(initDet === '其他' ? (record.note || '') : '');
  const [saving, setSaving]                 = useState(false);

  const handleCategoryChange = val => {
    setCategory(val); setDetail(''); setCustomDetail('');
    if (val === '其他') setDetail('其他');
  };

  const handleSave = async () => {
    const finalMeals = category === '其他' ? customCategory : category;
    const finalNote  = (detail === '其他' || category === '其他') ? customDetail : detail;
    if (!finalMeals || !finalNote) return Alert.alert('提示', '請完整填寫紀錄項目與內容');

    setSaving(true);
    try {
      const res = await client.put(`/care-records/${record._id}`, { meals: finalMeals, note: finalNote });
      if (onSaved) onSaved(res.data);
      Alert.alert('成功', '紀錄已更新', [{ text: '好', onPress: () => navigation.goBack() }]);
    } catch {
      Alert.alert('錯誤', '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.card}>
        <Text style={s.label}>1. 選擇紀錄項目</Text>
        <View style={s.picker}>
          <Picker selectedValue={category} onValueChange={handleCategoryChange} itemStyle={{ color: colors.text }}>
            {MEAL_ITEMS.map(i => <Picker.Item key={i} label={i} value={i} />)}
          </Picker>
        </View>
        {category === '其他' && (
          <TextInput style={s.input} placeholder="請輸入項目名稱..."
            value={customCategory} onChangeText={setCustomCategory} />
        )}

        <Text style={s.label}>2. 詳細內容描述</Text>
        <View style={s.picker}>
          <Picker selectedValue={detail} onValueChange={setDetail}
            enabled={category !== '其他'} itemStyle={{ color: colors.text }}>
            <Picker.Item label="請選擇..." value="" />
            {(DETAIL_MAP[category] || []).map(d => <Picker.Item key={d} label={d} value={d} />)}
            <Picker.Item label=" 其他（手動輸入）" value="其他" />
          </Picker>
        </View>
        {(detail === '其他' || category === '其他') && (
          <TextInput style={[s.input, { height: 90, textAlignVertical: 'top' }]}
            placeholder="請輸入詳細內容..." value={customDetail}
            onChangeText={setCustomDetail} multiline />
        )}


      </View>

      <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>儲存修改</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  card:      { backgroundColor: colors.card, margin: 16, borderRadius: radius.md, padding: 20, ...shadow.sm },
  label:     { ...text.h3, marginTop: 16, marginBottom: 6 },
  picker:    { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: '#F8FAFC', height: 140, overflow: 'hidden', justifyContent: 'center', marginBottom: 8 },
  input:     { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, padding: 12, fontSize: 15, backgroundColor: colors.primaryBg, marginBottom: 8 },
  notice:    { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryBg, padding: 10, borderRadius: radius.sm, gap: 8, marginTop: 12 },
  noticeText:{ fontSize: 12, color: colors.primary, flex: 1 },
  saveBtn:   { backgroundColor: colors.primary, margin: 16, marginTop: 4, padding: 16, borderRadius: radius.md, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});