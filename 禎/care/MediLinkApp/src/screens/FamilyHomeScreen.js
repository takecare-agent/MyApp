import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import client from '../api/client';

export default function FamilyHomeScreen({ navigation }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 取得照護紀錄流水帳
  const fetchRecords = async () => {
    try {
      const response = await client.get('/care-records');
      setRecords(response.data);
    } catch (error) {
      console.error("抓取失敗:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRecords();
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.recordTitle}>🧾 項目：{item.meals || '未填寫'}</Text>
      <Text style={styles.recordContent}>📝 內容：{item.note || '無詳細內容'}</Text>
      
      {(item.bloodPressure || item.temperature) && (
        <View style={styles.vitals}>
          <Text style={styles.vitalsText}>🌡️ {item.temperature || '--'}°C</Text>
          <Text style={styles.vitalsText}>💓 {item.heartRate || '--'} bpm</Text>
        </View>
      )}
      <Text style={styles.recordTime}>
        📅 {new Date(item.createdAt).toLocaleString()}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* 🚀 功能按鈕區：只保留兩個按鈕 */}
      <View style={styles.actionHeader}>
        <Text style={styles.sectionLabel}>管理與回報</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#fff5f5', borderColor: '#ffccc7' }]} 
            onPress={() => navigation.navigate('AbnormalList')}
          >
            <Text style={styles.btnIcon}>🚨</Text>
            <Text style={[styles.btnText, { color: '#ff4d4f' }]}>異常紀錄</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#f0f7ff', borderColor: '#bae7ff' }]} 
            onPress={() => navigation.navigate('FamilyReminderList')}
          >
            <Text style={styles.btnIcon}>📋</Text>
            <Text style={[styles.btnText, { color: '#007AFF' }]}>清單紀錄</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.divider} />

      {/* 下方的照護紀錄清單 */}
      <Text style={styles.sectionLabel}>照護紀錄</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 15, paddingBottom: 30 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={<Text style={styles.empty}>目前還沒有照護紀錄喔！</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  actionHeader: { padding: 15, backgroundColor: '#fff' },
  sectionLabel: { fontSize: 16, fontWeight: 'bold', color: '#8c8c8c', marginBottom: 12, marginLeft: 5 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    padding: 15, 
    borderRadius: 12, 
    marginHorizontal: 5,
    borderWidth: 1,
    elevation: 1,
  },
  btnIcon: { fontSize: 20, marginRight: 8 },
  btnText: { fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  divider: { height: 8, backgroundColor: '#f0f2f5' },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  recordTitle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
  recordContent: { fontSize: 16, color: '#555', marginVertical: 8 },
  vitals: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#f0f7ff', padding: 8, borderRadius: 8, marginBottom: 8 },
  vitalsText: { fontSize: 14, color: '#007AFF', fontWeight: '600' },
  recordTime: { fontSize: 12, color: '#999', textAlign: 'right' },
  empty: { textAlign: 'center', marginTop: 50, color: '#999', fontSize: 16 }
});