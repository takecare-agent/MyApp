import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';
import { colors, radius, shadow, text } from '../theme';

const QUICK_BTNS = [
  { label: '異常紀錄', icon: '🚨', route: 'AbnormalList',       color: colors.danger,  bg: colors.dangerBg },
  { label: '清單紀錄', icon: '📋', route: 'FamilyReminderList', color: colors.primary, bg: colors.primaryBg },
];

export default function FamilyHomeScreen({ navigation }) {
  const [records, setRecords]       = useState([]);
  const [filtered, setFiltered]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  const fetchRecords = async () => {
    try {
      const res = await client.get('/care-records');
      setRecords(res.data); setFiltered(res.data);
    } catch { console.error('抓取失敗'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchRecords(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchRecords(); };

  const toDateStr = d => {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  };
  const getUniqueDates = () => ['全部', ...new Set(records.map(r => toDateStr(r.createdAt)))];

  const handleDateFilter = date => {
    if (date === '全部') { setSelectedDate(null); setFiltered(records); }
    else { setSelectedDate(date); setFiltered(records.filter(r => toDateStr(r.createdAt) === date)); }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={s.card} activeOpacity={0.8}
      onPress={() => navigation.navigate('RecordDetail', { record: item })}>
      <View style={s.cardTop}>
        <Text style={s.cardTitle} numberOfLines={1}>🧾 {item.meals || '未填寫'}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
      <Text style={s.cardNote} numberOfLines={1}>📝 {item.note || '無詳細內容'}</Text>
      {(item.bloodPressure || item.temperature) && (
        <View style={s.vitals}>
          <Text style={s.vitalsText}>🌡️ {item.temperature || '--'}°C</Text>
          <Text style={s.vitalsText}>💓 {item.heartRate || '--'} bpm</Text>
        </View>
      )}
      <Text style={s.cardTime}>{new Date(item.createdAt).toLocaleString()}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={s.container}>
      {/* 快速按鈕 */}
      <View style={s.quickRow}>
        {QUICK_BTNS.map(btn => (
          <TouchableOpacity key={btn.route} style={[s.quickBtn, { backgroundColor: btn.bg }]}
            onPress={() => navigation.navigate(btn.route)}>
            <Text style={s.quickIcon}>{btn.icon}</Text>
            <Text style={[s.quickLabel, { color: btn.color }]}>{btn.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 日期篩選 */}
      <View style={s.filterBar}>
        <Ionicons name="calendar-outline" size={15} color={colors.textSub} style={{ marginRight: 6 }} />
        <FlatList horizontal data={getUniqueDates()} keyExtractor={d => d}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item: date }) => {
            const active = (date === '全部' && !selectedDate) || date === selectedDate;
            return (
              <TouchableOpacity style={[s.chip, active && s.chipActive]} onPress={() => handleDateFilter(date)}>
                <Text style={[s.chipText, active && s.chipTextActive]}>{date}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <Text style={s.sectionLabel}>
        照護紀錄 {selectedDate ? `（${selectedDate}）` : '（全部）'}
      </Text>

      {loading ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /> : (
        <FlatList data={filtered} keyExtractor={i => i._id} renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={s.empty}>此日期沒有照護紀錄</Text>}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.bg },
  quickRow:   { flexDirection: 'row', backgroundColor: colors.card, padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  quickBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: radius.md },
  quickIcon:  { fontSize: 18 },
  quickLabel: { fontSize: 13, fontWeight: '700' },

  filterBar:  { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  chip:       { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, backgroundColor: '#F1F5F9', marginRight: 8 },
  chipActive: { backgroundColor: colors.primary },
  chipText:   { fontSize: 13, color: colors.textSub },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  sectionLabel: { ...text.sm, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },

  card:       { backgroundColor: colors.card, borderRadius: radius.md, padding: 15, marginBottom: 12, ...shadow.sm },
  cardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle:  { ...text.h3, flex: 1 },
  cardNote:   { ...text.body, color: colors.textSub, marginBottom: 8 },
  vitals:     { flexDirection: 'row', gap: 16, backgroundColor: colors.primaryBg, padding: 8, borderRadius: radius.sm, marginBottom: 8 },
  vitalsText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  cardTime:   { ...text.xs, textAlign: 'right' },
  empty:      { textAlign: 'center', marginTop: 50, color: colors.textMuted, fontSize: 15 },
});
