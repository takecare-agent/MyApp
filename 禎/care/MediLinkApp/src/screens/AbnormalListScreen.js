import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';
import { colors, radius, shadow, text } from '../theme';
import DateFilterModal from './DateFilterModal';

export default function AbnormalListScreen({ navigation, route }) {
  const role = route?.params?.role || 'family';

  const [events, setEvents]         = useState([]);
  const [filtered, setFiltered]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [showHandled, setShowHandled]   = useState('全部');

  const fetchEvents = async () => {
    try {
      const res = await client.get('/api/abnormal-events');
      setEvents(res.data);
      setFiltered(res.data);
    } catch { console.error('抓取異常失敗'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchEvents(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchEvents(); };

  const toDateStr = iso => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  useEffect(() => {
    let result = [...events];
    if (selectedDate)            result = result.filter(r => toDateStr(r.createdAt) === selectedDate);
    if (selectedType)            result = result.filter(r => (r.type || r.eventType) === selectedType);
    if (showHandled === '已處理') result = result.filter(r => r.isHandled);
    if (showHandled === '未處理') result = result.filter(r => !r.isHandled);
    setFiltered(result);
  }, [selectedDate, selectedType, showHandled, events]);

  const toggleHandled = async (item) => {
    try {
      await client.patch(`/api/abnormal-events/${item._id}`, { isHandled: !item.isHandled });
      setEvents(prev => prev.map(e => e._id === item._id ? { ...e, isHandled: !e.isHandled } : e));
    } catch { Alert.alert('錯誤', '更新失敗'); }
  };

  const getUniqueTypes = () => [...new Set(events.map(r => r.type || r.eventType).filter(Boolean))];

  const SEVERITY = {
    '緊急': { border: colors.danger,   bg: colors.dangerBg,   badge: colors.danger  },
    '注意': { border: colors.warning,  bg: colors.warningBg,  badge: colors.warning },
    '輕微': { border: colors.success,  bg: colors.successBg,  badge: colors.success },
  };

  const renderItem = ({ item }) => {
    const sv = SEVERITY[item.severity] || SEVERITY['注意'];
    return (
      <View style={[s.card, { borderLeftColor: sv.border }]}>
        <View style={s.cardHeader}>
          <View style={[s.badge, { backgroundColor: sv.badge }]}>
            <Text style={s.badgeText}>{item.severity}</Text>
          </View>
          <Text style={s.eventTime}>{new Date(item.createdAt).toLocaleString()}</Text>
        </View>

        <Text style={s.eventTitle}>⚠️ {item.type || item.eventType}</Text>
        <Text style={s.description}>{item.description}</Text>

        <TouchableOpacity
          style={[s.handledBtn, item.isHandled && s.handledBtnDone]}
          onPress={() => toggleHandled(item)}
        >
          <Ionicons name={item.isHandled ? 'checkmark-circle' : 'ellipse-outline'}
            size={16} color={item.isHandled ? colors.success : colors.textMuted} />
          <Text style={[s.handledText, item.isHandled && s.handledTextDone]}>
            {item.isHandled ? '已查看' : '未查看'}
          </Text>
        </TouchableOpacity>

        {role === 'caregiver' && (
          <TouchableOpacity style={s.reportBtn} onPress={() => navigation.navigate('AbnormalEvent')}>
            <Ionicons name="warning-outline" size={16} color={colors.danger} />
            <Text style={s.reportBtnText}>再通報</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={s.container}>
      <View style={s.filterSection}>

        {/* 日期篩選 — 改用滾輪選單 */}
        <View style={s.filterRow}>
          <Text style={s.filterLabel}>📅 日期</Text>
          <DateFilterModal selectedDate={selectedDate} onSelect={setSelectedDate} />
        </View>

        {/* 類型篩選 */}
        <Text style={s.filterLabel}>🏷️ 類型</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <TouchableOpacity style={[s.chip, !selectedType && s.chipActive]} onPress={() => setSelectedType(null)}>
            <Text style={[s.chipText, !selectedType && s.chipTextActive]}>全部</Text>
          </TouchableOpacity>
          {getUniqueTypes().map(t => (
            <TouchableOpacity key={t}
              style={[s.chip, selectedType === t && s.chipActive]}
              onPress={() => setSelectedType(t === selectedType ? null : t)}>
              <Text style={[s.chipText, selectedType === t && s.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 處理狀態 */}
        <Text style={s.filterLabel}>✅ 處理狀態</Text>
        <View style={s.segmentRow}>
          {['全部', '未處理', '已處理'].map(seg => (
            <TouchableOpacity key={seg}
              style={[s.segment, showHandled === seg && s.segmentActive]}
              onPress={() => setShowHandled(seg)}>
              <Text style={[s.segmentText, showHandled === seg && s.segmentTextActive]}>{seg}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? <ActivityIndicator size="large" color={colors.danger} style={{ marginTop: 50 }} /> : (
        <FlatList data={filtered} keyExtractor={i => i._id} renderItem={renderItem}
          contentContainerStyle={{ padding: 15 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={s.empty}>沒有符合條件的異常紀錄</Text>}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#FFFBFB' },
  filterSection: { backgroundColor: colors.card, padding: 15, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  filterLabel:   { fontSize: 12, fontWeight: '700', color: colors.textSub, marginBottom: 6 },

  chip:          { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.full, backgroundColor: '#F0F0F0', marginRight: 8 },
  chipActive:    { backgroundColor: colors.danger },
  chipText:      { fontSize: 13, color: colors.textSub },
  chipTextActive:{ color: '#fff', fontWeight: '700' },

  segmentRow:    { flexDirection: 'row', borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  segment:       { flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: '#F9F9F9' },
  segmentActive: { backgroundColor: colors.danger },
  segmentText:   { fontSize: 13, color: colors.textSub },
  segmentTextActive: { color: '#fff', fontWeight: '700' },

  card:          { backgroundColor: colors.card, padding: 15, borderRadius: radius.md, marginBottom: 15, borderLeftWidth: 5, ...shadow.sm },
  cardHeader:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  badge:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  badgeText:     { color: '#fff', fontSize: 12, fontWeight: '700' },
  eventTime:     { ...text.xs },
  eventTitle:    { ...text.h2, marginBottom: 5 },
  description:   { ...text.body, color: colors.textSub, lineHeight: 22 },
  caregiver:     { marginTop: 8, ...text.xs, fontStyle: 'italic' },

  handledBtn:     { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FAFAFA', alignSelf: 'flex-start' },
  handledBtnDone: { borderColor: colors.success, backgroundColor: colors.successBg },
  handledText:    { fontSize: 13, color: colors.textMuted, marginLeft: 5 },
  handledTextDone:{ color: colors.success, fontWeight: '700' },

  reportBtn:     { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 8, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerBg },
  reportBtnText: { color: colors.danger, fontSize: 14, fontWeight: '700', marginLeft: 4 },

  empty:         { textAlign: 'center', marginTop: 50, color: colors.textMuted, fontSize: 16 },
});