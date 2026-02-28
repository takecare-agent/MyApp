import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import client from '../api/client';
import { Ionicons } from '@expo/vector-icons';

export default function ForgotPasswordScreen({ navigation }) {
  // 狀態管理
  const [step, setStep] = useState(1); // 1: 輸入Email, 2: 輸入驗證碼&新密碼
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
// 🚀 1. 新增：控制密碼是否可見的狀態
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);

  // 🔹 第一步：發送驗證碼
  const handleSendCode = async () => {
    if (!email) return Alert.alert('錯誤', '請輸入 Email');

    setLoading(true);
    try {
      // 呼叫後端 /send-code
      await client.post('/api/send-code', { email });
      Alert.alert('✅ 已發送', '驗證碼已寄出，請檢查信箱 (含垃圾郵件)');
      setStep(2); // 成功後，切換到第二步驟
    } catch (error) {
      const msg = error.response?.data?.message || '請檢查 Email 是否正確';
      Alert.alert('❌ 發送失敗', msg);
    } finally {
      setLoading(false);
    }
  };

  // 🔹 第二步：重設密碼
  const handleResetPassword = async () => {
    // 🚀 2. 新增：前端驗證邏輯
    if (!code || !newPassword || !confirmPassword) {
      return Alert.alert('錯誤', '請填寫所有欄位');
    }
    
    if (newPassword !== confirmPassword) {
      return Alert.alert('錯誤', '兩次輸入的密碼不一致！');
    }
    setLoading(true);
    try {
      // 呼叫後端 /reset-password
      await client.post('/reset-password', { 
        email, 
        code, 
        newPassword 
      });
      
      Alert.alert('🎉 成功', '密碼已重設，請用新密碼登入！', [
        { text: '回登入頁', onPress: () => navigation.navigate('Login') }
      ]);
    } catch (error) {
      const msg = error.response?.data?.message || '驗證碼錯誤或已過期';
      Alert.alert('❌ 重設失敗', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{step === 1 ? '忘記密碼' : '重設密碼'}</Text>
      
      {step === 1 ? (
        <TextInput
          style={styles.input}
          placeholder="輸入您的 Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="輸入 6 位數驗證碼"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
          />

          {/* 🚀 2. 新密碼欄位：加入切換圖示 */}
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.flexInput}
              placeholder="輸入新密碼"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!isPasswordVisible} // 根據狀態切換
            />
            <TouchableOpacity onPress={() => setIsPasswordVisible(!isPasswordVisible)}>
              <Ionicons 
                name={isPasswordVisible ? "eye-outline" : "eye-off-outline"} 
                size={24} 
                color="#95a5a6" 
              />
            </TouchableOpacity>
          </View>

          {/* 🚀 3. 確認密碼欄位：獨立切換 */}
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.flexInput}
              placeholder="再次輸入新密碼"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!isConfirmVisible} 
            />
            <TouchableOpacity onPress={() => setIsConfirmVisible(!isConfirmVisible)}>
              <Ionicons 
                name={isConfirmVisible ? "eye-outline" : "eye-off-outline"} 
                size={24} 
                color="#95a5a6" 
              />
            </TouchableOpacity>
          </View>
        </>
      )}

      <TouchableOpacity style={styles.button} onPress={step === 1 ? handleSendCode : handleResetPassword} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{step === 1 ? '發送驗證碼' : '確認重設'}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 30, color: '#2c3e50' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 15, borderRadius: 10, marginBottom: 15, fontSize: 16, backgroundColor: '#fafafa' },
  // 🚀 4. 新增：密碼容器樣式，讓圖示排在右邊
  passwordContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 10, 
    marginBottom: 15, 
    paddingRight: 15, 
    backgroundColor: '#fafafa' 
  },
  flexInput: { flex: 1, padding: 15, fontSize: 16 },
  button: { backgroundColor: '#3498db', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});