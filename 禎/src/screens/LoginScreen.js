import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const handleLogin = async () => {
    try {
      console.log('API URL:', client.defaults.baseURL);
      console.log('Attempting login with:', { email, password });
      const response = await client.post('/login', { email, password });
      console.log('Login response:', response.data);
      const { user } = response.data;

      if (!user || !user.role) {
        Alert.alert('身分異常', '後端回傳資料不完整，找不到 role 欄位');
        return;
      }

      const userRole = user.role.trim().toLowerCase();

      // 嘗試儲存使用者資訊（失敗也繼續執行）
      try {
        await AsyncStorage.setItem('userName', user.name);
        await AsyncStorage.setItem('userId', user.id);
        console.log('User info saved to storage');
      } catch (storageError) {
        console.log('Storage error (non-critical):', storageError.message);
      }

      if (userRole === 'caregiver') {
        navigation.navigate('CaregiverHome');
      } else if (userRole === 'family') {
        navigation.navigate('FamilyHome');
      } else {
        Alert.alert('身分異常', `資料庫裡的 role 是: "${user.role}"`);
      }
    } catch (error) {
      console.error('Login error:', error.message);
      console.error('Login error response:', error.response?.data);
      Alert.alert('登入失敗', error.response?.data?.message || '帳號密碼錯誤或伺服器連線中斷');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.content}>
        {/* Logo 區 */}
        <View style={styles.logoSection}>
          <View style={styles.logoBox}>
            <Ionicons name="heart" size={48} color="#fff" />
          </View>
          <Text style={styles.appName}>MediLink</Text>
          <Text style={styles.appDesc}>跨語系危險辨識照護平台</Text>
        </View>

        {/* 表單卡片 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>登入</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputBox}>
              <Ionicons name="mail-outline" size={20} color="#8c8c8c" />
              <TextInput
                style={styles.input}
                placeholder="請輸入 Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholderTextColor="#bfbfbf"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>密碼</Text>
            <View style={styles.inputBox}>
              <Ionicons name="lock-closed-outline" size={20} color="#8c8c8c" />
              <TextInput
                style={styles.input}
                placeholder="請輸入密碼"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!isPasswordVisible}
                autoCapitalize="none"
                placeholderTextColor="#bfbfbf"
              />
              <TouchableOpacity onPress={() => setIsPasswordVisible(!isPasswordVisible)}>
                <Ionicons
                  name={isPasswordVisible ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color="#8c8c8c"
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin}>
            <Text style={styles.primaryBtnText}>登入</Text>
          </TouchableOpacity>

          <View style={styles.linkRow}>
            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
              <Text style={styles.linkText}>忘記密碼？</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.linkText}>還沒帳號？去註冊</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6fa' },
  content: { flex: 1, justifyContent: 'center', padding: 24 },

  logoSection: { alignItems: 'center', marginBottom: 32 },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#1890ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#1890ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  appName: { fontSize: 28, fontWeight: 'bold', color: '#262626' },
  appDesc: { fontSize: 14, color: '#8c8c8c', marginTop: 8 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  cardTitle: { fontSize: 24, fontWeight: 'bold', color: '#262626', textAlign: 'center', marginBottom: 24 },

  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#595959', marginBottom: 8 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f6fa',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  input: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 16, color: '#262626' },

  primaryBtn: {
    backgroundColor: '#1890ff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#1890ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  linkRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  linkText: { color: '#1890ff', fontSize: 14, fontWeight: '500' },
});
