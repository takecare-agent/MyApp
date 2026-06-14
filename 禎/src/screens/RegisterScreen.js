import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import client from '../api/client';

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('caregiver');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    // 🚀 關鍵第一步：檢查欄位是否為空
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert('提示', '請完整填寫姓名、信箱與密碼！');
      return; // 阻擋發送請求
    }

    setLoading(true);
    try {
      console.log('Registering with:', { name, email, password, role });
      await client.post('/register', {
        name,
        email,
        password,
        role
      });
      console.log('Registration successful');

      Alert.alert('成功', '註冊成功，請登入！', [
        { text: '好', onPress: () => navigation.navigate('Login') }
      ]);
    } catch (error) {
      const msg = error.response?.data?.message || '註冊失敗，請檢查網路';
      Alert.alert('錯誤', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>新帳號註冊</Text>
      
      <TextInput style={styles.input} placeholder="名稱" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="電子信箱" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="密碼" value={password} onChangeText={setPassword} secureTextEntry />

      <Text style={styles.label}>請選擇您的身分：</Text>
      <View style={styles.roleContainer}>
        {/* 看護端按鈕 */}
        <TouchableOpacity 
          style={[styles.roleButton, role === 'caregiver' && styles.activeRole]} 
          onPress={() => setRole('caregiver')}
        >
          <Text style={role === 'caregiver' ? styles.activeText : styles.roleText}>我是看護</Text>
        </TouchableOpacity>

        {/* 家屬端按鈕 */}
        <TouchableOpacity 
          style={[styles.roleButton, role === 'family' && styles.activeRole]} 
          onPress={() => setRole('family')}
        >
          <Text style={role === 'family' ? styles.activeText : styles.roleText}>我是家屬</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleRegister}>
        <Text style={styles.buttonText}>立即註冊</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { borderBottomWidth: 1, borderColor: '#ccc', marginBottom: 15, padding: 10 },
  label: { fontSize: 16, marginBottom: 10, marginTop: 10 },
  roleContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  roleButton: { flex: 0.48, padding: 15, borderWidth: 1, borderColor: '#3498db', borderRadius: 8, alignItems: 'center' },
  activeRole: { backgroundColor: '#3498db' },
  roleText: { color: '#3498db', fontWeight: 'bold' },
  activeText: { color: '#fff', fontWeight: 'bold' },
  button: { backgroundColor: '#2ecc71', padding: 15, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});