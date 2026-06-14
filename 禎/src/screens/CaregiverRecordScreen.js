import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

export default function CaregiverRecordScreen({ navigation }) {
  const [form, setForm] = useState({
    bloodPressure: '',
    heartRate: '',
    temperature: '',
    meals: '',
    sleep: '',
    note: ''
  });

  const handleSubmit = async () => {
    try {
      const userId = await AsyncStorage.getItem('userId');
      let userName = await AsyncStorage.getItem('userName');
      if (!userName) {
        console.warn('AsyncStorage userName 為空，使用預設值');
        userName = '未知';
      }

      console.log('上傳資料:', { ...form, caregiverId: userId, caregiverName: userName });

      const res = await client.post('/care-records', {
        ...form,
        caregiverName: userName
      });

      const newRecord = {
        ...res.data,
        meals: form.meals,
        note: form.note
      };

      console.log('上傳成功:', newRecord);
      Alert.alert('成功', '今天的照護紀錄已上傳', [{ text: '好', onPress: () => navigation.goBack() }]);
    } catch (error) {
      console.error('上傳失敗:', error.response?.data || error.message);
      const msg = error.response?.data?.message || '儲存失敗，請檢查網路';
      Alert.alert('錯誤', msg);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>填寫今日照護紀錄</Text>
      
      <Text style={styles.label}>生理數據</Text>
      <TextInput style={styles.input} placeholder="血壓 (如: 120/80)" value={form.bloodPressure} onChangeText={(v)=>setForm({...form, bloodPressure:v})} />
      <TextInput style={styles.input} placeholder="心率 (bpm)" keyboardType="numeric" value={form.heartRate} onChangeText={(v)=>setForm({...form, heartRate:v})} />
      <TextInput style={styles.input} placeholder="體溫 (°C)" keyboardType="numeric" value={form.temperature} onChangeText={(v)=>setForm({...form, temperature:v})} />

      <Text style={styles.label}>生活觀察</Text>
      <TextInput style={styles.input} placeholder="飲食狀況 (如：早餐食慾良好)" value={form.meals} onChangeText={(v)=>setForm({...form, meals:v})} />      
      <Text style={styles.label}>其他備註</Text>
      <TextInput style={[styles.input, { height: 100 }]} placeholder="請輸入當日異常或特別觀察..." multiline value={form.note} onChangeText={(v)=>setForm({...form, note:v})} />

      <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
        <Text style={styles.submitText}>提交紀錄</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, color: '#2c3e50' },
  label: { fontSize: 16, fontWeight: 'bold', marginTop: 15, color: '#34495e' },
  input: { borderBottomWidth: 1, borderColor: '#ddd', padding: 10, fontSize: 16 },
  submitBtn: { backgroundColor: '#3498db', padding: 15, borderRadius: 10, marginTop: 30, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});