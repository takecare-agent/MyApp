import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, text } from '../theme';

// 用法：
// <DateFilterModal
//   selectedDate={selectedDate}        // null 或 'YYYY-MM-DD'
//   onSelect={(dateStr) => ...}        // 回傳 'YYYY-MM-DD' 或 null（清除）
// />

export default function DateFilterModal({ selectedDate, onSelect }) {
  const [visible, setVisible] = useState(false);

  const now = new Date();
  const [year,  setYear]  = useState(selectedDate ? parseInt(selectedDate.split('-')[0]) : now.getFullYear());
  const [month, setMonth] = useState(selectedDate ? parseInt(selectedDate.split('-')[1]) : now.getMonth() + 1);
  const [day,   setDay]   = useState(selectedDate ? parseInt(selectedDate.split('-')[2]) : now.getDate());

  const years  = Array.from({ length: 5 }, (_, i) => now.getFullYear() + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const getDays = (y, m) => Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => i + 1);

  const handleConfirm = () => {
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onSelect(`${year}-${mm}-${dd}`);
    setVisible(false);
  };

  const handleClear = () => {
    onSelect(null);
    setVisible(false);
  };

  const displayLabel = selectedDate || '選擇日期';

  return (
    <>
      {/* 觸發按鈕 */}
      <View style={s.row}>
        <TouchableOpacity style={s.triggerBtn} onPress={() => setVisible(true)}>
          <Ionicons name="calendar-outline" size={16} color={selectedDate ? colors.primary : colors.textSub} />
          <Text style={[s.triggerText, selectedDate && s.triggerTextActive]}>{displayLabel}</Text>
          <Ionicons name="chevron-down" size={14} color={selectedDate ? colors.primary : colors.textSub} />
        </TouchableOpacity>
        {selectedDate && (
          <TouchableOpacity style={s.clearBtn} onPress={handleClear}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* 滾輪 Modal */}
      <Modal visible={visible} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>選擇日期</Text>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Ionicons name="close" size={22} color={colors.textSub} />
              </TouchableOpacity>
            </View>

            <View style={s.pickersRow}>
              {/* 年 */}
              <View style={s.pickerColYear}>
                <Text style={s.pickerLabel}>年</Text>
                <View style={s.pickerBox}>
                  <Picker selectedValue={year} onValueChange={val => setYear(val)} style={s.picker}
                    itemStyle={{ fontSize: 16, color: colors.text }}>
                    {years.map(y => <Picker.Item key={y} label={`${y} `} value={y} />)}
                  </Picker>
                </View>
              </View>

              {/* 月 */}
              <View style={s.pickerColMonth}>
                <Text style={s.pickerLabel}>月</Text>
                <View style={s.pickerBox}>
                  <Picker selectedValue={month}
                    onValueChange={val => { setMonth(val); const max = new Date(year, val, 0).getDate(); if (day > max) setDay(max); }}
                    style={s.picker} itemStyle={{ fontSize: 16, color: colors.text }}>
                    {months.map(m => <Picker.Item key={m} label={`${m} `} value={m} />)}
                  </Picker>
                </View>
              </View>

              {/* 日 */}
              <View style={s.pickerColDay}>
                <Text style={s.pickerLabel}>日</Text>
                <View style={s.pickerBox}>
                  <Picker selectedValue={day} onValueChange={setDay} style={s.picker}
                    itemStyle={{ fontSize: 16, color: colors.text }}>
                    {getDays(year, month).map(d => <Picker.Item key={d} label={`${d} `} value={d} />)}
                  </Picker>
                </View>
              </View>
            </View>

            <View style={s.btnRow}>
              <TouchableOpacity style={s.clearFullBtn} onPress={handleClear}>
                <Text style={s.clearFullBtnText}>清除篩選</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm}>
                <Text style={s.confirmBtnText}>確認</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center' },
  triggerBtn:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  triggerText:      { fontSize: 14, color: colors.textSub },
  triggerTextActive:{ color: colors.primary, fontWeight: '600' },
  clearBtn:  { marginLeft: 6, padding: 2 },

  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:     { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle:{ ...text.h2 },

  pickersRow:   { flexDirection: 'row', gap: 8, marginBottom: 24 },
  pickerColYear: { width: 120 },
  pickerColMonth:{ width: 90 },
  pickerColDay:  { width: 90 },
  pickerCol:    { flex: 1, minWidth: 90 },
  pickerLabel:{ ...text.sm, textAlign: 'center', marginBottom: 4 },
  pickerBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: '#F8FAFC', height: 150, overflow: 'hidden', justifyContent: 'center' },
  picker:    { height: 150 },

  btnRow:       { flexDirection: 'row', gap: 10 },
  clearFullBtn: { flex: 1, padding: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  clearFullBtnText: { fontSize: 15, color: colors.textSub, fontWeight: '600' },
  confirmBtn:   { flex: 1, padding: 14, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  confirmBtnText:{ fontSize: 15, color: '#fff', fontWeight: '700' },
});