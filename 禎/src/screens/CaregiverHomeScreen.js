import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator, FlatList } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

const RECORD_ITEMS = [
  { label: '飲食', icon: '🍽️' },
  { label: '用藥', icon: '💊' },
  { label: '清潔', icon: '🛁' },
  { label: '活動', icon: '🚶' },
  { label: '睡眠', icon: '😴' },
  { label: '其他', icon: '📝' },
];

const DETAIL_PRESETS = {
  '飲食':   ['早餐已用', '午餐已用', '晚餐已用', '點心/水果'],
  '用藥':   ['飯後藥已吃', '睡前藥已吃', '胰島素已打', '外用藥已擦'],
  '清潔':   ['已洗澡', '更換衣物', '口腔清潔', '翻身拍背'],
  '活動':   ['散步', '復健運動', '下床活動'],
  '睡眠':   ['正常入睡', '睡眠品質佳', '輾轉難眠', '早醒'],
  '其他':   ['請手動輸入詳細內容'],
};

const QUICK_BTNS = [
  { label: '異常回報', icon: 'warning', route: 'AbnormalEvent', color: '#ff4d4f', bg: '#fff2f0' },
  { label: '異常紀錄', icon: 'document-text', route: 'AbnormalList', color: '#faad14', bg: '#fff7e6' },
  { label: '異常統計', icon: 'stats-chart', route: 'AbnormalStats', color: '#1890ff', bg: '#e6f7ff' },
  { label: '提醒清單', icon: 'notifications', route: 'ReminderList', color: '#52c41a', bg: '#f6ffed' },
];

export default function CaregiverHomeScreen({ navigation }) {
  const [item, setItem]             = useState('飲食');
  const [detail, setDetail]         = useState('');
  const [customItem, setCustomItem] = useState('');
  const [customDetail, setCustomDetail] = useState('');
  const [loading, setLoading]       = useState(false);

  // 查詢功能
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const [allData, setAllData] = useState({ records: [], events: [], reminders: [] });

  // 載入所有資料
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const token = await AsyncStorage.getItem('token');

      const [recordsRes, eventsRes, remindersRes] = await Promise.all([
        client.get('/care-records').catch(() => ({ data: [] })),
        client.get('/caregiver/alerts/history', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }).catch(() => ({ data: [] })),
        client.get('/caregiver/reminders', {
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

  const getIcon = (label) => RECORD_ITEMS.find(r => r.label === label)?.icon || '📋';

  const handleSubmit = async () => {
    const finalItem   = item === '其他' ? customItem : item;
    const finalDetail = (detail === '其他' || item === '其他') ? customDetail : detail;
    if (!finalItem || !finalDetail) return Alert.alert('提示', '請完整填寫項目名稱與詳細內容');

    setLoading(true);
    try {
      const caregiverName = await AsyncStorage.getItem('userName') || '未知';
      console.log('上傳資料:', { meals: finalItem, note: finalDetail, caregiverName });
      const res = await client.post('/care-records', { meals: finalItem, note: finalDetail, caregiverName });
      console.log('上傳成功:', res.data);
      Alert.alert('成功', '紀錄已儲存！', [{ text: '好', onPress: () => navigation.navigate('CareRecordList') }]);
      setCustomItem(''); setCustomDetail(''); setItem('飲食'); setDetail('');
      loadAllData();
    } catch (err) {
      console.error('上傳失敗:', err.response?.data || err.message);
      Alert.alert('失敗', '上傳錯誤');
    } finally {
      setLoading(false);
    }
  };

  // 搜尋全部內容
  const handleSearch = async (text) => {
    setSearchQuery(text);
    if (text.length < 1) {
      setShowResults(false);
      setSearchResults([]);
      return;
    }

    const query = text.toLowerCase();
    const results = [];

    // 搜尋照護紀錄
    allData.records.forEach(r => {
      const recordText = [
        r.meals, r.note, r.caregiverName,
        r.createdAt ? new Date(r.createdAt).toLocaleDateString('zh-TW') : ''
      ].filter(Boolean).join(' ').toLowerCase();
      if (recordText.includes(query)) {
        results.push({ ...r, _type: 'record', _label: '照護紀錄' });
      }
    });

    // 搜尋異常事件
    allData.events.forEach(e => {
      const eventText = [
        e.alertId, e.type, e.riskLevel, e.status,
        e.actionTaken, e.description, e.location,
        e.happenedAt ? new Date(e.happenedAt).toLocaleDateString('zh-TW') : ''
      ].filter(Boolean).join(' ').toLowerCase();
      if (eventText.includes(query)) {
        results.push({ ...e, _type: 'event', _label: '異常事件' });
      }
    });

    // 搜尋提醒
    allData.reminders.forEach(r => {
      const reminderText = [
        r.reminderId, r.title, r.content, r.status,
        r.createdAt ? new Date(r.createdAt).toLocaleDateString('zh-TW') : ''
      ].filter(Boolean).join(' ').toLowerCase();
      if (reminderText.includes(query)) {
        results.push({ ...r, _type: 'reminder', _label: '提醒' });
      }
    });

    setSearchResults(results);
    setShowResults(true);
  };

  const getResultIcon = (type) => {
    switch (type) {
      case 'record': return 'document-text';
      case 'event': return 'warning';
      case 'reminder': return 'notifications';
      default: return 'ellipse';
    }
  };

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
      navigation.navigate('ReminderList');
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
        {record.meals || record.type || record.title || record.alertId || record.reminderId || '無標題'}
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
            找到 {searchResults.length} 筆資料
          </Text>
          {searchResults.length === 0 ? (
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
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* 歡迎標題 */}
          <View style={styles.header}>
            <Text style={styles.kicker}>照護者</Text>
            <Text style={styles.title}>照護功能總覽</Text>
            <Text style={styles.subtitle}>以下為系統主要功能模組</Text>
          </View>

          {/* 快速按鈕 */}
          <View style={styles.quickRow}>
            {QUICK_BTNS.map(btn => (
              <TouchableOpacity key={btn.route}
                style={[styles.quickBtn, { backgroundColor: btn.bg }]}
                onPress={() => navigation.navigate(btn.route, btn.route === 'AbnormalList' ? { role: 'caregiver' } : undefined)}
              >
                <Ionicons name={btn.icon} size={20} color={btn.color} />
                <Text style={[styles.quickLabel, { color: btn.color }]}>{btn.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 表單卡片 */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📝 新增日常紀錄</Text>

            <Text style={styles.label}>1. 選擇紀錄項目 {getIcon(item)}</Text>
            <View style={styles.picker}>
              <Picker selectedValue={item}
                onValueChange={val => { setItem(val); setDetail(''); setCustomDetail(''); }}
                itemStyle={{ color: '#262626' }}>
                {RECORD_ITEMS.map(i => <Picker.Item key={i.label} label={`${i.icon} ${i.label}`} value={i.label} />)}
              </Picker>
            </View>
            {item === '其他' && (
              <TextInput style={styles.input} placeholder="請輸入項目名稱..." value={customItem} onChangeText={setCustomItem} />
            )}

            <Text style={styles.label}>2. 詳細內容描述</Text>
            <View style={styles.picker}>
              <Picker selectedValue={detail} onValueChange={setDetail}
                enabled={item !== '其他'} itemStyle={{ color: '#262626' }}>
                <Picker.Item label="請選擇..." value="" />
                {(DETAIL_PRESETS[item] || []).map(d => <Picker.Item key={d} label={d} value={d} />)}
                <Picker.Item label=" 其他（手動輸入）" value="其他" />
              </Picker>
            </View>
            {(detail === '其他' || item === '其他') && (
              <TextInput style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
                placeholder="請輸入詳細內容..." value={customDetail}
                onChangeText={setCustomDetail} multiline />
            )}

            <TouchableOpacity style={[styles.primaryBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>確認送出紀錄</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.outlineBtn} onPress={() => navigation.navigate('CareRecordList')}>
              <Ionicons name="time-outline" size={18} color="#1890ff" />
              <Text style={styles.outlineBtnText}>查看歷史紀錄</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f5f6fa' },

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

  quickRow:     { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  quickBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  quickLabel:   { fontSize: 11, fontWeight: '600' },

  card:         { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  cardTitle:    { fontSize: 18, fontWeight: 'bold', color: '#262626', marginBottom: 16 },
  label:        { fontSize: 14, fontWeight: '600', color: '#595959', marginTop: 16, marginBottom: 8 },
  picker:       { borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 12, backgroundColor: '#f5f6fa', height: 140, overflow: 'hidden', justifyContent: 'center', marginBottom: 8 },
  input:        { borderWidth: 1, borderColor: '#1890ff', borderRadius: 12, padding: 14, fontSize: 15, backgroundColor: '#e6f7ff', marginBottom: 8 },

  primaryBtn:   { backgroundColor: '#1890ff', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20, shadowColor: '#1890ff', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  outlineBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#1890ff', marginTop: 12 },
  outlineBtnText: { color: '#1890ff', fontSize: 15, fontWeight: '600' },
});
