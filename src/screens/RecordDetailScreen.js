import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import client from '../api/client';
import { colors, radius, shadow, text } from '../theme';

export default function RecordDetailScreen({ route, navigation }) {
  const [record, setRecord]     = useState(route.params.record);
  const [deleting, setDeleting] = useState(false);

  const formatTime = iso => {
    if (!iso) return '--';
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}  ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const handleDelete = () => {
    Alert.alert('確認刪除', '刪除後無法復原，確定嗎？', [
      { text: '取消', style: 'cancel' },
      { text: '刪除', style: 'destructive', onPress: async () => {
        setDeleting(true);
        try {
          await client.delete(`/care-records/${record._id}`);
          Alert.alert('已刪除', '', [{ text: '好', onPress: () => navigation.goBack() }]);
        } catch {
          Alert.alert('錯誤', '刪除失敗');
          setDeleting(false);
        }
      }}
    ]);
  };

  const Row = ({ ionIcon, mciIcon, color, label, value }) => {
    if (!value) return null;
    return (
      <View style={s.row}>
        {mciIcon
          ? <MaterialCommunityIcons name={mciIcon} size={18} color={color} style={{ width: 26 }} />
          : <Ionicons name={ionIcon} size={18} color={color} style={{ width: 26 }} />
        }
        <View style={{ flex: 1 }}>
          <Text style={s.rowLabel}>{label}</Text>
          <Text style={s.rowValue}>{value}</Text>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTime}>{formatTime(record.createdAt)}</Text>
        {record.caregiverName ? <Text style={s.headerSub}>紀錄者：{record.caregiverName}</Text> : null}
      </View>

      <View style={s.actionRow}>
        <TouchableOpacity style={s.editBtn}
          onPress={() => navigation.navigate('EditRecord', { record, onSaved: setRecord })}>
          <Ionicons name="pencil-outline" size={16} color={colors.primary} />
          <Text style={s.editBtnText}>編輯</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.deleteBtn, deleting && { opacity: 0.5 }]}
          onPress={handleDelete} disabled={deleting}>
          {deleting ? <ActivityIndicator size="small" color={colors.danger} />
            : <><Ionicons name="trash-outline" size={16} color={colors.danger} /><Text style={s.deleteBtnText}>刪除</Text></>}
        </TouchableOpacity>
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>📋 照護紀錄</Text>
        <Row ionIcon="clipboard-outline"    color={colors.success} label="紀錄項目" value={record.meals} />
        <Row ionIcon="document-text-outline" color={colors.textSub} label="內容"    value={record.note} />
        <Row ionIcon="moon-outline"          color={colors.purple}  label="睡眠狀況" value={record.sleep} />
        {!record.meals && !record.note && !record.sleep &&
          <Text style={s.empty}>無照護紀錄內容</Text>}
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>🩺 生理數據（藍牙回傳）</Text>
        <Row mciIcon="water-outline" color={colors.danger} label="血壓" value={record.bloodPressure} />
        <Row mciIcon="heart-pulse"   color={colors.danger} label="心率" value={record.heartRate ? `${record.heartRate} bpm` : null} />
        <Row mciIcon="thermometer"   color={colors.danger} label="體溫" value={record.temperature ? `${record.temperature}°C` : null} />
        {!record.bloodPressure && !record.heartRate && !record.temperature &&
          <Text style={s.empty}>尚無藍牙裝置數據</Text>}
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.bg },
  header:      { backgroundColor: colors.success, padding: 20 },
  headerTime:  { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub:   { color: '#BBF7D0', fontSize: 13, marginTop: 4 },

  actionRow:    { flexDirection: 'row', margin: 16, marginBottom: 0, gap: 10 },
  editBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 13, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primaryBg },
  editBtnText:  { color: colors.primary, fontSize: 15, fontWeight: '600' },
  deleteBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 13, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.danger, backgroundColor: colors.dangerBg },
  deleteBtnText:{ color: colors.danger, fontSize: 15, fontWeight: '600' },

  card:         { backgroundColor: colors.card, margin: 16, marginBottom: 0, borderRadius: radius.md, padding: 16, ...shadow.sm },
  sectionTitle: { ...text.h3, marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  row:          { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  rowLabel:     { ...text.xs, marginBottom: 2 },
  rowValue:     { ...text.body, fontWeight: '500' },
  empty:        { ...text.sm, textAlign: 'center', paddingVertical: 8 },
});