import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import client from '../api/client';

export default function CareRecordListScreen() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 📥 抓取資料
  const fetchRecords = async () => {
    try {
      // 根據你的 server.js，路徑是 /care-records
      const response = await client.get('/care-records');
      setRecords(response.data);
    } catch (error) {
      console.error("無法取得照護紀錄:", error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchRecords().finally(() => setLoading(false));
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRecords();
    setRefreshing(false);
  };

  // 🕒 時間格式化
  const formatTime = (isoString) => {
    if (!isoString) return '--/-- --:--';
    const date = new Date(isoString);
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  // 🎨 渲染每一張卡片
  const renderItem = ({ item }) => (
    <View style={styles.card}>
      {/* 1. 頂部時間與人員 */}
      <View style={styles.cardHeader}>
        <View style={styles.timeBadge}>
          <Ionicons name="calendar-outline" size={14} color="#fff" />
          <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
        </View>
        {item.caregiverName && <Text style={styles.caregiverText}>紀錄者: {item.caregiverName}</Text>}
      </View>

      {/* 2. 生理數值區 (血壓、心率、體溫) */}
      <View style={styles.vitalsContainer}>
        <View style={styles.vitalItem}>
          <MaterialCommunityIcons name="water-outline" size={20} color="#ff4d4f" />
          <Text style={styles.vitalLabel}>血壓</Text>
          <Text style={styles.vitalValue}>{item.bloodPressure || '--'}</Text>
        </View>
        <View style={styles.vitalItem}>
          <MaterialCommunityIcons name="heart-pulse" size={20} color="#ff4d4f" />
          <Text style={styles.vitalLabel}>心率</Text>
          <Text style={styles.vitalValue}>{item.heartRate || '--'}</Text>
        </View>
        <View style={styles.vitalItem}>
          <MaterialCommunityIcons name="thermometer" size={20} color="#ff4d4f" />
          <Text style={styles.vitalLabel}>體溫</Text>
          <Text style={styles.vitalValue}>{item.temperature || '--'}°C</Text>
        </View>
      </View>

      {/* 3. 飲食與備註區 */}
      <View style={styles.detailContainer}>
        {item.meals ? (
          <View style={styles.detailRow}>
            <Ionicons name="restaurant-outline" size={18} color="#389e0d" />
            <Text style={styles.detailText}><Text style={styles.bold}>飲食：</Text>{item.meals}</Text>
          </View>
        ) : null}
        
        {item.note ? (
          <View style={styles.detailRow}>
            <Ionicons name="document-text-outline" size={18} color="#666" />
            <Text style={styles.detailText}><Text style={styles.bold}>備註：</Text>{item.note}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#389e0d" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={records}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 15 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>目前沒有照護紀錄</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  card: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 15, padding: 15, elevation: 3 },
  
  // 頂部樣式
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10 },
  timeBadge: { flexDirection: 'row', backgroundColor: '#389e0d', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 15, alignItems: 'center' },
  timeText: { color: '#fff', fontSize: 13, fontWeight: 'bold', marginLeft: 4 },
  caregiverText: { color: '#999', fontSize: 12 },

  // 生理數值樣式
  vitalsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15, backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8 },
  vitalItem: { alignItems: 'center' },
  vitalLabel: { fontSize: 12, color: '#666', marginTop: 4 },
  vitalValue: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 2 },

  // 詳細內容樣式
  detailContainer: { gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  detailText: { fontSize: 15, color: '#333', marginLeft: 8, flex: 1 },
  bold: { fontWeight: 'bold', color: '#555' },

  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#999', fontSize: 16 }
});