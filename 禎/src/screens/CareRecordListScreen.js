import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';
import { colors, radius, shadow, text } from '../theme';
import DateRangePicker from '../components/DateRangePicker';

const ITEM_ICONS = {
  '飲食': '🍽️', '用藥': '💊', '清潔': '🛁', '活動': '🚶', '睡眠': '😴', '其他': '📝'
};
const getItemIcon = (meals) => ITEM_ICONS[meals] || '📋';

export default function CareRecordListScreen({ navigation }) {
  const [records, setRecords]       = useState([]);
  const [filtered, setFiltered]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState({ start: null, end: null });

  const fetchRecords = useCallback(async () => {
    try {
      const res = await client.get('/care-records');
      console.log('列表收到記錄筆數:', res.data.length, res.data.map(r => ({ _id: r._id, meals: r.meals, note: r.note })));
      setRecords(res.data); setFiltered(res.data);
    } catch { console.error('無法取得照護紀錄'); }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchRecords().finally(() => setLoading(false));
    }, [fetchRecords])
  );

  const onRefresh = async () => { setRefreshing(true); await fetchRecords(); setRefreshing(false); };

  const formatTime = iso => {
    if (!iso) return '--';
    const d = new Date(iso);
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  // 日期范围过滤
  const handleDateRangeChange = (range) => {
    setDateRange(range);
    if (!range.start) {
      setFiltered(records);
    } else {
      const filtered = records.filter(r => {
        const d = new Date(r.createdAt);
        const start = new Date(range.start);
        const end = range.end ? new Date(range.end) : new Date(range.start);
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);
        return d >= start && d <= end;
      });
      setFiltered(filtered);
    }
  };

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

      <View style={{ gap: 4 }}>
        {item.bloodPressure ? (
          <View style={s.detailRow}>
            <Ionicons name="heart" size={14} color={colors.danger} />
            <Text style={s.detailText} numberOfLines={1}><Text style={s.bold}>血壓：</Text>{item.bloodPressure}</Text>
          </View>
        ) : null}
        {item.heartRate ? (
          <View style={s.detailRow}>
            <Ionicons name="pulse" size={14} color={colors.warning} />
            <Text style={s.detailText} numberOfLines={1}><Text style={s.bold}>心率：</Text>{item.heartRate} bpm</Text>
          </View>
        ) : null}
        {item.temperature ? (
          <View style={s.detailRow}>
            <Ionicons name="thermometer" size={14} color={colors.primary} />
            <Text style={s.detailText} numberOfLines={1}><Text style={s.bold}>體溫：</Text>{item.temperature} °C</Text>
          </View>
        ) : null}
        {item.meals ? (
          <View style={s.detailRow}>
            <Text style={s.itemIcon}>{getItemIcon(item.meals)}</Text>
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
        <DateRangePicker onRangeChange={handleDateRangeChange} />
      </View>

      <Text style={s.resultCount}>
        {dateRange.start
          ? `共 ${filtered.length} 筆記錄${dateRange.end && dateRange.end !== dateRange.start ? `（${dateRange.start} ~ ${dateRange.end}）` : `（${dateRange.start}）`}`
          : `共 ${records.length} 筆記錄`}
      </Text>

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
  filterBar:  { backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  resultCount: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 13, color: colors.textSub, backgroundColor: colors.bg },

  card:         { backgroundColor: colors.card, borderRadius: radius.md, marginBottom: 12, padding: 14, ...shadow.sm },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  timeBadge:    { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.success, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, gap: 4 },
  timeText:     { color: '#fff', fontSize: 12, fontWeight: '600' },
  caregiverText:{ ...text.xs },

  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 13, color: colors.text, flex: 1 },
  bold:       { fontWeight: '600', color: colors.textSub },
  itemIcon:   { fontSize: 15 },
  empty:      { textAlign: 'center', marginTop: 50, color: colors.textMuted, fontSize: 15 },
});
