import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';
import DateRangePicker from '../components/DateRangePicker';

const TYPE_ICONS = {
  '跌倒/受傷': '🚨',
  '生理異常': '🩺',
  '情緒/行為': '😰',
  '飲食/排泄': '🍽️',
  '其他': '📝',
};

export default function AbnormalListScreen({ navigation, route }) {
  const role = route?.params?.role || 'family';

  const [events, setEvents] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [selectedType, setSelectedType] = useState(null);
  const [showHandled, setShowHandled] = useState('全部'); // '全部' | '未處理' | '已處理'

  const fetchEvents = async () => {
    try {
      const response = await client.get('/api/abnormal-events');
      setEvents(response.data);
      setFiltered(response.data);
    } catch (error) {
      console.error("抓取異常失敗:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchEvents(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchEvents(); };

  // 日期范围过滤
  const handleDateRangeChange = (range) => {
    setDateRange(range);
  };

  // 套用篩選
  useEffect(() => {
    let result = [...events];
    if (dateRange.start) {
      result = result.filter(r => {
        const d = new Date(r.createdAt);
        const start = new Date(dateRange.start);
        const end = dateRange.end ? new Date(dateRange.end) : new Date(dateRange.start);
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);
        return d >= start && d <= end;
      });
    }
    if (selectedType) {
      result = result.filter(r => (r.type || r.eventType) === selectedType);
    }
    if (showHandled === '已處理') result = result.filter(r => r.isHandled);
    if (showHandled === '未處理') result = result.filter(r => !r.isHandled);
    setFiltered(result);
  }, [dateRange, selectedType, showHandled, events]);

  // 標記已處理
  const toggleHandled = async (item) => {
    try {
      await client.patch(`/api/abnormal-events/${item._id}`, { isHandled: !item.isHandled });
      setEvents(prev => prev.map(e => e._id === item._id ? { ...e, isHandled: !e.isHandled } : e));
    } catch {
      Alert.alert('錯誤', '更新失敗');
    }
  };

  const getUniqueTypes = () => {
    const types = events.map(r => r.type || r.eventType).filter(Boolean);
    return [...new Set(types)];
  };

  const renderItem = ({ item }) => {
    const typeIcon = TYPE_ICONS[item.type || item.eventType] || '📝';
    return (
      <View style={[styles.card,
        item.severity === '緊急' ? styles.urgentBorder :
        item.severity === '輕微' ? styles.mildBorder :
        styles.noticeBorder
      ]}>
        <View style={styles.headerRow}>
          <Text style={[styles.badge,
            item.severity === '緊急' ? styles.bgUrgent :
            item.severity === '輕微' ? styles.bgMild :
            styles.bgNotice
          ]}>
            {item.severity}
          </Text>
          <Text style={styles.eventTime}>{new Date(item.createdAt).toLocaleString()}</Text>
        </View>

        <Text style={styles.eventTitle}>{typeIcon} {item.type || item.eventType}</Text>
        <Text style={styles.description}>{item.description}</Text>
        <Text style={styles.caregiver}>回報人：{item.caregiverName || '專屬看護'}</Text>

        {/* 是否已處理 */}
        <TouchableOpacity
          style={[styles.handledBtn, item.isHandled && styles.handledBtnDone]}
          onPress={() => toggleHandled(item)}
        >
          <Ionicons name={item.isHandled ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={item.isHandled ? '#52c41a' : '#aaa'} />
          <Text style={[styles.handledText, item.isHandled && styles.handledTextDone]}>
            {item.isHandled ? '已處理' : '標記為已處理'}
          </Text>
        </TouchableOpacity>

        {/* 看護端才顯示「再通報」 */}
        {role === 'caregiver' && (
          <TouchableOpacity style={styles.reportBtn} onPress={() => navigation.navigate('AbnormalEvent')}>
            <Ionicons name="warning-outline" size={16} color="#ff4d4f" />
            <Text style={styles.reportBtnText}>再通報</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 篩選區 */}
      <View style={styles.filterSection}>
        {/* 日期區間篩選 */}
        <Text style={styles.filterLabel}>📅 日期區間</Text>
        <DateRangePicker onRangeChange={handleDateRangeChange} />

        {/* 類型篩選 */}
        <Text style={[styles.filterLabel, { marginTop: 12 }]}>🏷️ 類型</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <TouchableOpacity style={[styles.chip, !selectedType && styles.chipActive]} onPress={() => setSelectedType(null)}>
            <Text style={[styles.chipText, !selectedType && styles.chipTextActive]}>全部</Text>
          </TouchableOpacity>
          {getUniqueTypes().map(t => (
            <TouchableOpacity key={t} style={[styles.chip, selectedType === t && styles.chipActive]} onPress={() => setSelectedType(t === selectedType ? null : t)}>
              <Text style={[styles.chipText, selectedType === t && styles.chipTextActive]}>{TYPE_ICONS[t] || ''} {t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 處理狀態篩選 */}
        <Text style={styles.filterLabel}>處理狀態</Text>
        <View style={styles.segmentRow}>
          {['全部', '未處理', '已處理'].map(s => (
            <TouchableOpacity key={s} style={[styles.segment, showHandled === s && styles.segmentActive]} onPress={() => setShowHandled(s)}>
              <Text style={[styles.segmentText, showHandled === s && styles.segmentTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#ff4d4f" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 15 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.empty}>沒有符合條件的異常紀錄</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbfb' },

  filterSection: { backgroundColor: '#ffffff', padding: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  filterLabel: { fontSize: 12, fontWeight: 'bold', color: '#888888', marginBottom: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: '#f0f0f0', marginRight: 8 },
  chipActive: { backgroundColor: '#ff4d4f' },
  chipText: { fontSize: 13, color: '#555555' },
  chipTextActive: { color: '#ffffff', fontWeight: 'bold' },
  segmentRow: { flexDirection: 'row' },
  segment: { flex: 1, paddingVertical: 7, alignItems: 'center', borderWidth: 1, borderColor: '#ddd', backgroundColor: '#f9f9f9' },
  segmentActive: { backgroundColor: '#ff4d4f', borderColor: '#ff4d4f' },
  segmentText: { fontSize: 13, color: '#555555' },
  segmentTextActive: { color: '#ffffff', fontWeight: 'bold' },

  card: { backgroundColor: '#ffffff', padding: 15, borderRadius: 12, marginBottom: 15, borderLeftWidth: 6, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1 },
  urgentBorder: { borderLeftColor: '#ff4d4f' },
  noticeBorder: { borderLeftColor: '#faad14' },
  mildBorder:   { borderLeftColor: '#52c41a' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 'bold' },
  bgUrgent: { backgroundColor: '#ff4d4f' },
  bgNotice: { backgroundColor: '#faad14' },
  bgMild:   { backgroundColor: '#52c41a' },
  eventTime: { color: '#999999', fontSize: 12 },
  eventTitle: { fontSize: 18, fontWeight: 'bold', color: '#262626', marginBottom: 5 },
  description: { fontSize: 16, color: '#595959', lineHeight: 22 },
  caregiver: { marginTop: 10, fontSize: 12, color: '#8c8c8c', fontStyle: 'italic' },

  handledBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fafafa', alignSelf: 'flex-start' },
  handledBtnDone: { borderColor: '#52c41a', backgroundColor: '#f6ffed' },
  handledText: { fontSize: 13, color: '#aaa', marginLeft: 5 },
  handledTextDone: { color: '#52c41a', fontWeight: 'bold' },

  reportBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 8, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#ff4d4f', backgroundColor: '#fff1f0' },
  reportBtnText: { color: '#ff4d4f', fontSize: 14, fontWeight: 'bold', marginLeft: 4 },

  empty: { textAlign: 'center', marginTop: 50, color: '#bfbfbf', fontSize: 16 }
});
