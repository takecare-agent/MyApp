import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';

export default function ReminderListScreen({ navigation }) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 📥 抓取資料
  const fetchReminders = async () => {
    try {
      const response = await client.get('/api/reminders');
      
      // 1. 過濾壞資料 (時間不正確的不要顯示)
      const validData = response.data.filter(item => !isNaN(new Date(item.time).getTime()));

      // 2. 排序：未完成的放前面 (讓看護先看到要解決的)，時間早的放前面
      const sortedData = validData.sort((a, b) => {
        if (a.isCompleted === b.isCompleted) {
          return new Date(a.time) - new Date(b.time);
        }
        return a.isCompleted ? 1 : -1;
      });

      setReminders(sortedData);
    } catch (error) {
      console.error("看護端抓取失敗:", error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchReminders().finally(() => setLoading(false));
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchReminders();
    setRefreshing(false);
  };

  // ✅ 看護專用：打勾/取消打勾
  const toggleComplete = async (id, currentStatus) => {
    try {
      // 樂觀更新 (UI 立刻變色，不用等後端)
      setReminders(prev => prev.map(item => 
        item._id === id ? { ...item, isCompleted: !currentStatus } : item
      ));

      // 傳送給後端
      await client.patch(`/api/reminders/${id}`, {
        isCompleted: !currentStatus
      });
    } catch (error) {
      Alert.alert('更新失敗', '網路不穩，請稍後再試');
      fetchReminders(); // 失敗就抓回原本的狀態
    }
  };

  // 🕒 時間美化
  const formatTime = (isoString) => {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  };

  // 🎨 渲染每一張卡片
  const renderItem = ({ item }) => {
    const isDone = item.isCompleted; // 是否已完成

    return (
      <View style={[styles.card, isDone && styles.cardDone]}>
        {/* 左側：資訊區 */}
        <View style={styles.infoContainer}>
          <View style={styles.headerRow}>
            <View style={[styles.badge, isDone ? styles.badgeDone : styles.badgeActive]}>
              <Text style={[styles.badgeText, isDone && styles.textDone]}>{item.category}</Text>
            </View>
            <Text style={[styles.timeText, isDone && styles.textDone]}>
              {formatTime(item.time)}
            </Text>
          </View>
          
          {/* 🚀 關鍵修復：這裡加上了 content，看護才看得到要幹嘛 */}
          <Text style={[styles.content, isDone && styles.textDone]}>
            {item.content}
          </Text>
        </View>

        {/* 右側：打勾按鈕 (看護專屬功能) */}
        <TouchableOpacity 
          style={styles.checkBtn}
          onPress={() => toggleComplete(item._id, item.isCompleted)}
        >
          <Ionicons 
            name={isDone ? "checkmark-circle" : "ellipse-outline"} 
            size={40} 
            color={isDone ? "#52c41a" : "#ccc"} 
          />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 看護端不需要新增按鈕，直接顯示標題或清單 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📋 待辦事項清單</Text>
        <Text style={styles.headerSub}>請依時間完成任務並打勾</Text>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#389e0d" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>太棒了！目前沒有任務 🎉</Text>
              <Text style={styles.emptySubText}>請等待家屬指派</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  
  header: { padding: 20, backgroundColor: '#fff', elevation: 2, alignItems: 'flex-start' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  headerSub: { fontSize: 14, color: '#888', marginTop: 4 },

  
  // 卡片樣式
  card: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#fff', 
    marginHorizontal: 15, 
    marginTop: 12, 
    padding: 15, 
    borderRadius: 12, 
    elevation: 2,
    borderLeftWidth: 5,
    borderLeftColor: '#389e0d' // 看護端用綠色系
  },
  cardDone: { 
    backgroundColor: '#f9f9f9', 
    borderLeftColor: '#ccc',
    opacity: 0.7 
  },
  
  infoContainer: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  
  // 標籤 Badge
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 8 },
  badgeActive: { backgroundColor: '#f6ffed' },
  badgeDone: { backgroundColor: '#eee' },
  badgeText: { fontSize: 12, fontWeight: 'bold', color: '#389e0d' },
  
  timeText: { fontSize: 14, fontWeight: 'bold', color: '#ff4d4f' },
  
  // 內容文字
  content: { fontSize: 18, color: '#333', fontWeight: 'bold' },
  textDone: { color: '#999', textDecorationLine: 'line-through' }, // 完成後刪除線
  
  checkBtn: { padding: 5, marginLeft: 10 },
  
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#999' },
  emptySubText: { fontSize: 14, color: '#ccc', marginTop: 5 }
});