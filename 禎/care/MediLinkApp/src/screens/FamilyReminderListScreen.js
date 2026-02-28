import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';

export default function FamilyReminderListScreen({ navigation }) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 📥 抓取資料
  const fetchReminders = async () => {
    try {
      // 確保這裡的路徑跟你的 server 設定一致 (如果 server 有設 /api 就要加)
      const response = await client.get('/api/reminders');
      
      // 過濾壞資料 + 排序 (新 -> 舊)
      const validData = response.data.filter(item => !isNaN(new Date(item.time).getTime()));
      const sortedData = validData.sort((a, b) => new Date(a.time) - new Date(b.time));
      setReminders(sortedData);
    } catch (error) {
      console.error("抓取失敗:", error);
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

  // 🕒 時間格式化 (這是讓時間變漂亮的關鍵)
  const formatTime = (isoString) => {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  };

  // 🎨 渲染卡片
  const renderItem = ({ item }) => {
    return (
      <View style={styles.card}>
        {/* 卡片標題列：類別 + 狀態 */}
        <View style={styles.cardHeader}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.category}</Text>
          </View>
          <View style={[styles.statusBadge, item.isCompleted ? styles.statusDone : styles.statusPending]}>
            <Ionicons name={item.isCompleted ? "checkmark" : "time"} size={14} color="#555" />
            <Text style={styles.statusText}>{item.isCompleted ? '已完成' : '待處理'}</Text>
          </View>
        </View>

        {/* 🚀 這裡就是讓「內容」顯示出來的關鍵！ */}
        <Text style={styles.content}>{item.content}</Text>

        {/* 時間顯示區 */}
        <View style={styles.timeRow}>
          <Ionicons name="alarm-outline" size={18} color="#666" />
          <Text style={styles.timeLabel}> 預定時間：</Text>
          {/* 這裡呼叫了美化函式 */}
          <Text style={styles.timeText}>{formatTime(item.time)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 🔵 新增按鈕區域 */}
      <View style={styles.actionContainer}>
        {/* 請確認這裡的跳轉頁面名稱 'AddReminder' 與 App.js 一致 */}
        <TouchableOpacity 
          style={styles.addBtn} 
          onPress={() => navigation.navigate('AddReminder')}
        >
          <Ionicons name="add" size={24} color="#fff" />
          <Text style={styles.addBtnText}> 新增提醒</Text>
        </TouchableOpacity>
      </View>

      {/* 清單區域 */}
      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#1890ff" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>尚無提醒事項</Text>
              <Text style={styles.emptySubText}>點擊上方按鈕來指派任務</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  
  // 🔵 按鈕樣式
  actionContainer: { padding: 15, backgroundColor: '#fff' },
  addBtn: { 
    backgroundColor: '#1890ff', 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 12, 
    borderRadius: 10,
    elevation: 3
  },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  // ⬜️ 卡片樣式
  card: { 
    backgroundColor: '#fff', 
    marginHorizontal: 15, 
    marginTop: 12, 
    padding: 15, 
    borderRadius: 12, 
    elevation: 2,
    borderLeftWidth: 5,
    borderLeftColor: '#1890ff' // 左邊加一條藍線增加質感
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  
  // 標籤 Badge
  badge: { backgroundColor: '#e6f7ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { color: '#1890ff', fontWeight: 'bold', fontSize: 12 },
  
  // 狀態 Badge
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  statusPending: { backgroundColor: '#fffbe6', borderColor: '#ffe58f' }, // 黃色待處理
  statusDone: { backgroundColor: '#f6ffed', borderColor: '#b7eb8f' },    // 綠色已完成
  statusText: { fontSize: 12, color: '#555', marginLeft: 4 },

  // 📝 內容文字
  content: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 12 },

  // ⏰ 時間列
  timeRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10 },
  timeLabel: { color: '#666', fontSize: 14 },
  timeText: { color: '#333', fontSize: 16, fontWeight: 'bold' },

  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#999', fontSize: 16 },
  emptySubText: { color: '#ccc', fontSize: 14, marginTop: 5 }
});