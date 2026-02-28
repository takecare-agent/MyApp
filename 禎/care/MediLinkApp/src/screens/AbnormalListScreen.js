import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import client from '../api/client';

export default function AbnormalListScreen() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEvents = async () => {
    try {
      // 🚀 對接後端 GET API
      const response = await client.get('/api/abnormal-events');
      setEvents(response.data);
    } catch (error) {
      console.error("抓取異常失敗:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEvents();
  };

  const renderItem = ({ item }) => (
    <View style={[styles.card, item.severity === '緊急' ? styles.urgentBorder : styles.noticeBorder]}>
      <View style={styles.headerRow}>
        <Text style={[styles.badge, item.severity === '緊急' ? styles.bgUrgent : styles.bgNotice]}>
          {item.severity}
        </Text>
        <Text style={styles.eventTime}>{new Date(item.createdAt).toLocaleString()}</Text>
      </View>

      <Text style={styles.eventTitle}>⚠️ {item.eventType}</Text>
      <Text style={styles.description}>{item.description}</Text>
      
      <Text style={styles.caregiver}>回報人：{item.caregiverName || '專屬看護'}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#ff4d4f" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 15 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={<Text style={styles.empty}>目前沒有任何異常紀錄，平安無事！</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbfb' },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    borderLeftWidth: 6, // 側邊色條
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
  },
  urgentBorder: { borderLeftColor: '#ff4d4f' },
  noticeBorder: { borderLeftColor: '#faad14' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 'bold' },
  bgUrgent: { backgroundColor: '#ff4d4f' },
  bgNotice: { backgroundColor: '#faad14' },
  eventTime: { color: '#999', fontSize: 12 },
  eventTitle: { fontSize: 18, fontWeight: 'bold', color: '#262626', marginBottom: 5 },
  description: { fontSize: 16, color: '#595959', lineHeight: 22 },
  caregiver: { marginTop: 10, fontSize: 12, color: '#8c8c8c', fontStyle: 'italic' },
  empty: { textAlign: 'center', marginTop: 50, color: '#bfbfbf', fontSize: 16 }
});