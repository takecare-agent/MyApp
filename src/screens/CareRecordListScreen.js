import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import client from '../api/client';
import { colors, radius, shadow, text } from '../theme';

export default function CareRecordListScreen({ navigation }) {
  const [records, setRecords]       = useState([]);
  const [filtered, setFiltered]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  const fetchRecords = async () => {
    try {
      const res = await client.get('/care-records');
      setRecords(res.data); setFiltered(res.data);
    } catch { console.error('無法取得照護紀錄'); }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchRecords().finally(() => setLoading(false));
  }, []));

  const onRefresh = async () => { setRefreshing(true); await fetchRecords(); setRefreshing(false); };

  const toDateStr = iso => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const getUniqueDates = () => ['全部', ...new Set(records.map(r => toDateStr(r.createdAt)))];
  const handleDateFilter = date => {
    if (date === '全部') { setSelectedDate(null); setFiltered(records); }
    else { setSelectedDate(date); setFiltered(records.filter(r => toDateStr(r.createdAt) === date)); }
  };

  const formatTime = iso => {
    if (!iso) return '--';
    const d = new Date(iso);
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const VITALS = [
    { mci: 'water-outline',  label: '血壓', key: 'bloodPressure', fmt: v => v },
    { mci: 'heart-pulse',    label: '心率', key: 'heartRate',     fmt: v => `${v} bpm` },
    { mci: 'thermometer',    label: '體溫', key: 'temperature',   fmt: v => `${v}°C` },
  ];

  const renderItem = ({ item }) => (
    <TouchableOpacity style={s.card} activeOpacity={0.8}
      onPress={() => navigation.navigate('RecordDetail', { record: item })}>
      <View style={s.cardHeader}>
        <View style={s.timeBadge}>
          <Ionicons name="calendar-outline" size={13} color="#fff" />
          <Text style={s.timeText}>{formatTime(item.createdAt)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {item.caregiverName ? <Text style={s.caregiverText}>{item.caregiverName}</Text> : null}
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </View>

      <View style={s.vitalsBox}>
        <View style={s.vitalsHeader}>
          <Ionicons name="bluetooth" size={12} color={colors.primary} />
          <Text style={s.vitalsHeaderText}>藍牙裝置回傳</Text>
        </View>
        <View style={s.vitalsRow}>
          {VITALS.map((v, i) => (
            <React.Fragment key={v.label}>
              <View style={s.vitalItem}>
                <MaterialCommunityIcons name={v.mci} size={18} color={colors.danger} />
                <Text style={s.vitalLabel}>{v.label}</Text>
                <Text style={s.vitalValue}>{item[v.key] ? v.fmt(item[v.key]) : '--'}</Text>
              </View>
              {i < VITALS.length - 1 && <View style={s.vitalDivider} />}
            </React.Fragment>
          ))}
        </View>
      </View>

      <View style={{ gap: 4 }}>
        {item.meals ? (
          <View style={s.detailRow}>
            <Ionicons name="clipboard-outline" size={15} color={colors.success} />
            <Text style={s.detailText} numberOfLines={1}><Text style={s.bold}>項目：</Text>{item.meals}</Text>
          </View>
        ) : null}
        {item.note ? (
          <View style={s.detailRow}>
            <Ionicons name="document-text-outline" size={15} color={colors.textSub} />
            <Text style={s.detailText} numberOfLines={1}><Text style={s.bold}>內容：</Text>{item.note}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={s.container}>
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

      {loading && !refreshing ? <ActivityIndicator size="large" color={colors.success} style={{ marginTop: 30 }} /> : (
        <FlatList data={filtered} keyExtractor={i => i._id} renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={s.empty}>此日期沒有照護紀錄</Text>}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.bg },
  filterBar:  { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  chip:       { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, backgroundColor: '#F1F5F9', marginRight: 8 },
  chipActive: { backgroundColor: colors.success },
  chipText:   { fontSize: 13, color: colors.textSub },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  card:         { backgroundColor: colors.card, borderRadius: radius.md, marginBottom: 12, padding: 14, ...shadow.sm },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  timeBadge:    { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.success, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, gap: 4 },
  timeText:     { color: '#fff', fontSize: 12, fontWeight: '600' },
  caregiverText:{ ...text.xs },

  vitalsBox:    { backgroundColor: '#F8FAFF', borderRadius: radius.sm, borderWidth: 1, borderColor: '#DBEAFE', marginBottom: 10, overflow: 'hidden' },
  vitalsHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, gap: 5 },
  vitalsHeaderText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  vitalsRow:    { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 },
  vitalItem:    { alignItems: 'center', flex: 1 },
  vitalDivider: { width: 1, backgroundColor: '#DBEAFE', marginVertical: 2 },
  vitalLabel:   { fontSize: 10, color: colors.textMuted, marginTop: 3 },
  vitalValue:   { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 1 },

  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 13, color: colors.text, flex: 1 },
  bold:       { fontWeight: '600', color: colors.textSub },
  empty:      { textAlign: 'center', marginTop: 50, color: colors.textMuted, fontSize: 15 },
});