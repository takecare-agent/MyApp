import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import client from '../api/client';

export default function FamilyRecordScreen() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = async () => {
    try {
      // const response = await client.get(`/care-records/${user_id}`);
      setRecords(response.data);
    } catch (error) {
      console.log('取得紀錄失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.date}>{new Date(item.date).toLocaleDateString()}</Text>
        <Text style={styles.caregiver}>紀錄者：{item.caregiverName}</Text>
      </View>
      <View style={styles.divider} />
      <Text style={styles.text}>🩸 血壓：{item.bloodPressure} | ❤️ 心率：{item.heartRate}</Text>
      <Text style={styles.text}>🌡️ 體溫：{item.temperature}°C</Text>
      <Text style={styles.text}>🍲 飲食：{item.meals}</Text>
      <Text style={styles.text}>😴 睡眠：{item.sleep}</Text>
      {item.note && <Text style={styles.note}>💡 備註：{item.note}</Text>}
    </View>
  );

  if (loading) return <ActivityIndicator size="large" style={{flex:1}} />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>歷史照護紀錄</Text>
      <FlatList
        data={records}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.empty}>目前尚無紀錄</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: '#f5f6fa' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 15 },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 3 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  date: { fontSize: 16, fontWeight: 'bold', color: '#2980b9' },
  caregiver: { fontSize: 14, color: '#7f8c8d' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  text: { fontSize: 15, marginBottom: 5, color: '#2c3e50' },
  note: { fontSize: 14, fontStyle: 'italic', marginTop: 5, color: '#16a085' },
  empty: { textAlign: 'center', marginTop: 50, color: '#95a5a6' }
});