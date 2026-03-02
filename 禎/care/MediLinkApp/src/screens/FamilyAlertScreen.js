import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import client from '../api/client';

export default function FamilyAlertScreen() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const fetchAlerts = async () => {
      const res = await client.get('/api/abnormal-events');
      setAlerts(res.data);
    };
    fetchAlerts();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⚠️ 異常警報中心</Text>
      <FlatList
        data={alerts}
        keyExtractor={item => item._id}
        renderItem={({ item }) => (
          <View style={[styles.card, item.severity === '緊急' ? styles.borderRed : styles.borderOrange]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.type, item.severity === '緊急' ? styles.textRed : styles.textOrange]}>
                [{item.severity}] {item.eventType}
              </Text>
              <Text style={styles.time}>{new Date(item.createdAt).toLocaleTimeString()}</Text>
            </View>
            <Text style={styles.desc}>{item.description || '無詳細描述'}</Text>
            <Text style={styles.footer}>回報者：{item.caregiverName}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: '#fef9f9' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, color: '#c0392b' },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 12, elevation: 2 },
  borderRed: { borderLeftWidth: 5, borderLeftColor: '#e74c3c' },
  borderOrange: { borderLeftWidth: 5, borderLeftColor: '#f39c12' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  type: { fontSize: 18, fontWeight: 'bold' },
  textRed: { color: '#e74c3c' },
  textOrange: { color: '#f39c12' },

  time: { color: '#95a5a6', fontSize: 12 },
  desc: { marginTop: 10, fontSize: 15, color: '#34495e' },
  footer: { marginTop: 10, fontSize: 12, color: '#bdc3c7', textAlign: 'right' }
});