import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import client from '../api/client';

export default function EditReminderScreen({ route, navigation }) {
  // 從路由取得原本的資料
  const { item } = route.params; 
  const [title, setTitle] = useState(item.title);
  const [time, setTime] = useState(item.time);

  const handleUpdate = async () => {
    try {
      await client.put(`/api/reminders/${item._id}`, { title, time });
      Alert.alert('成功', '提醒內容已更新');
      navigation.goBack(); // 返回列表並觸發重新整理
    } catch (error) {
      Alert.alert('錯誤', '修改失敗');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>修改事項</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />

      <Text style={styles.label}>修改時間</Text>
      <TextInput style={styles.input} value={time} onChangeText={setTime} />

      <TouchableOpacity style={styles.saveBtn} onPress={handleUpdate}>
        <Text style={styles.btnText}>確認修改</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  label: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, marginBottom: 20 },
  saveBtn: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});