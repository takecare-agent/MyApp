import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import DateRangePicker from '../components/DateRangePicker';

const ITEM_ICONS = {
  '飲食': '🍽️', '用藥': '💊', '清潔': '🛁', '活動': '🚶', '睡眠': '😴', '其他': '📝'
};
const getItemIcon = (meals) => ITEM_ICONS[meals] || '📋';

const QUICK_BTNS = [
  { label: '異常統計', icon: 'stats-chart', route: 'AbnormalStats', color: '#1890ff', bg: '#e6f7ff' },
  { label: '異常紀錄', icon: 'document-text', route: 'AbnormalList', color: '#ff4d4f', bg: '#fff2f0' },
  { label: '提醒清單', icon: 'notifications', route: 'FamilyReminderList', color: '#52c41a', bg: '#f6ffed' },
];

export default function FamilyHomeScreen({ navigation }) {
  const [records, setRecords]       = useState([]);
  const [filtered, setFiltered]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange]   = useState({ start: null, end: null });

  // 查詢功能
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [allData, setAllData] = useState({ records: [], events: [], reminders: [] });
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef(null);

  // 載入所有資料
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const token = await AsyncStorage.getItem('token');

      const [recordsRes, eventsRes, remindersRes] = await Promise.all([
        client.get('/care-records').catch(() => ({ data: [] })),
        client.get('/family/alerts/history', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }).catch(() => ({ data: [] })),
        client.get('/family/reminders', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }).catch(() => ({ data: [] })),
      ]);

      console.log('載入資料:', {
        records: recordsRes.data?.length || 0,
        events: eventsRes.data?.records?.length || eventsRes.data?.length || 0,
        reminders: remindersRes.data?.length || 0,
      });

      const eventsData = eventsRes.data?.records || eventsRes.data || [];

      setAllData({
        records: recordsRes.data || [],
        events: eventsData,
        reminders: remindersRes.data || [],
      });
    } catch (err) {
      console.error('載入資料失敗:', err);
    }
  };

  const fetchRecords = async () => {
    try {
      const res = await client.get('/care-records');
      setRecords(res.data); setFiltered(res.data);
    } catch { console.error('抓取失敗'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchRecords(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchRecords(); loadAllData(); };

  const handleDateRangeChange = (range) => {
    setDateRange(range);
    if (!range.start) {
      setFiltered(records);
    } else {
      const filtered = records.filter(r => {
        const d = new Date(r.createdAt);
        const start = new Date(range.start);
        const end = range.end ? new Date(range.end) : new Date(range.start);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return d >= start && d <= end;
      });
      setFiltered(filtered);
    }
  };

  // 搜尋 (debounce 300ms 呼叫後端 /api/search)
  const handleSearch = (text) => {
    setSearchQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!text.trim()) {
      setShowResults(false);
      setSearchResults([]);
      return;
    }

    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await client.get('/api/search', {
          params: { q: text },
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        setSearchResults(res.data.results || []);
        setShowResults(true);
      } catch (err) {
        console.error('搜尋失敗:', err);
        setSearchResults([]);
        setShowResults(true);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  // 元件卸載時清掉 timer
  useEffect(() => {
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, []);

  const getResultColor = (type) => {
    switch (type) {
      case 'record': return '#1890ff';
      case 'event': return '#ff4d4f';
      case 'reminder': return '#52c41a';
      default: return '#8c8c8c';
    }
  };

  const handleResultPress = (item) => {
    setShowResults(false);
    setSearchQuery('');
    if (item._type === 'record') {
      navigation.navigate('RecordDetail', { record: item });
    } else if (item._type === 'event') {
      navigation.navigate('AbnormalList');
    } else if (item._type === 'reminder') {
      navigation.navigate('FamilyReminderList');
    }
  };

  const renderSearchResult = ({ item: record }) => (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={() => handleResultPress(record)}
    >
      <View style={styles.resultHeader}>
        <View style={styles.resultType}>
          <View style={[styles.typeTag, { backgroundColor: getResultColor(record._type) }]}>
            <Text style={styles.typeTagText}>{record._label}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#8c8c8c" />
      </View>
      <Text style={styles.resultTitle} numberOfLines={1}>
        {record.meals || record.eventType || record.type || record.category || record.content || '無標題'}
      </Text>
      <Text style={styles.resultNote} numberOfLines={2}>
        {record.note || record.description || record.content || record.actionTaken || '無詳細內容'}
      </Text>
      <View style={styles.resultFooter}>
        <Ionicons name="time-outline" size={12} color="#8c8c8c" />
        <Text style={styles.resultTime}>
          {record.createdAt ? new Date(record.createdAt).toLocaleString('zh-TW') :
           record.happenedAt ? new Date(record.happenedAt).toLocaleString('zh-TW') : '時間未知'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.8}
      onPress={() => navigation.navigate('RecordDetail', { record: item })}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle} numberOfLines={1}>{getItemIcon(item.meals)} {item.meals || '未填寫'}</Text>
        <Ionicons name="chevron-forward" size={16} color="#8c8c8c" />
      </View>
      <Text style={styles.cardNote} numberOfLines={1}>📝 {item.note || '無詳細內容'}</Text>
      <Text style={styles.cardTime}>{new Date(item.createdAt).toLocaleString()}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* 搜尋列 - 最上方 */}
      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={22} color="#8c8c8c" />
          <TextInput
            style={styles.searchInput}
            placeholder="搜尋全部內容..."
            value={searchQuery}
            onChangeText={handleSearch}
            placeholderTextColor="#bfbfbf"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setShowResults(false); }}>
              <Ionicons name="close-circle" size={22} color="#8c8c8c" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 搜尋結果 */}
      {showResults && (
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>
            {searching ? '搜尋中…' : `找到 ${searchResults.length} 筆資料`}
          </Text>
          {searchResults.length === 0 && !searching ? (
            <Text style={styles.noResults}>找不到符合的資料</Text>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item, index) => `${item._type}-${item._id || index}`}
              renderItem={renderSearchResult}
              style={styles.resultsList}
            />
          )}
        </View>
      )}

      {!showResults && (
        <>
          {/* 歡迎標題 */}
          <View style={styles.header}>
            <Text style={styles.kicker}>家屬端</Text>
            <Text style={styles.title}>家庭照護中心</Text>
            <Text style={styles.subtitle}>查看受顧者照護狀況與提醒事項</Text>
          </View>

          {/* 快速按鈕 */}
          <View style={styles.quickRow}>
            {QUICK_BTNS.map(btn => (
              <TouchableOpacity key={btn.route} style={[styles.quickBtn, { backgroundColor: btn.bg }]}
                onPress={() => navigation.navigate(btn.route)}>
                <Ionicons name={btn.icon} size={18} color={btn.color} />
                <Text style={[styles.quickLabel, { color: btn.color }]}>{btn.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 日期區間篩選 */}
          <View style={styles.filterBar}>
            <DateRangePicker onRangeChange={handleDateRangeChange} />
          </View>

          <Text style={styles.sectionLabel}>
            {dateRange.start
              ? `（${dateRange.start}${dateRange.end && dateRange.end !== dateRange.start ? ` ~ ${dateRange.end}` : ''}）`
              : `（${records.length} 筆記錄）`}
          </Text>

          {loading ? (
            <ActivityIndicator size="large" color="#1890ff" style={{ marginTop: 40 }} />
          ) : (
            <FlatList data={filtered} keyExtractor={i => i._id} renderItem={renderItem}
              contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListEmptyComponent={<Text style={styles.empty}>此日期沒有照護紀錄</Text>}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f5f6fa' },

  // 搜尋區域
  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f6fa',
    borderRadius: 25,
    paddingHorizontal: 16,
    height: 46,
  },
  searchInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 16, color: '#262626' },

  resultsContainer: { backgroundColor: '#fff', margin: 16, borderRadius: 12, padding: 16, maxHeight: 400, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  resultsTitle: { fontSize: 14, fontWeight: '600', color: '#595959', marginBottom: 12 },
  noResults: { textAlign: 'center', color: '#8c8c8c', fontSize: 14, paddingVertical: 20 },
  resultsList: { maxHeight: 350 },
  resultItem: { backgroundColor: '#f5f6fa', borderRadius: 8, padding: 12, marginBottom: 8 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  resultType: { flexDirection: 'row', alignItems: 'center' },
  typeTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  typeTagText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  resultTitle: { fontSize: 15, fontWeight: '600', color: '#262626', marginBottom: 4 },
  resultNote: { fontSize: 13, color: '#595959', marginBottom: 4 },
  resultTime: { fontSize: 11, color: '#8c8c8c' },
  resultFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },

  header: { padding: 20, backgroundColor: '#fff' },
  kicker: { fontSize: 12, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#262626', marginTop: 4 },
  subtitle: { fontSize: 14, color: '#8c8c8c', marginTop: 8 },

  quickRow:   { flexDirection: 'row', backgroundColor: '#fff', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  quickBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 12 },
  quickLabel: { fontSize: 12, fontWeight: '700' },

  filterBar:  { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  sectionLabel: { fontSize: 13, color: '#8c8c8c', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },

  card:       { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  cardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle:  { fontSize: 16, fontWeight: '600', color: '#262626', flex: 1 },
  cardNote:   { fontSize: 14, color: '#8c8c8c', marginBottom: 8 },
  cardTime:   { fontSize: 12, color: '#bfbfbf', textAlign: 'right' },
  empty:      { textAlign: 'center', marginTop: 50, color: '#bfbfbf', fontSize: 15 },
});
