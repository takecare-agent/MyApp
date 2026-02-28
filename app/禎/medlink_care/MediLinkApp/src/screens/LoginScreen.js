import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { Ionicons } from '@expo/vector-icons'; 

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
const [isPasswordVisible, setIsPasswordVisible] = useState(false);
// --- LoginScreen.js 裡的 handleLogin 範例 ---
const handleLogin = async () => {
  try {
    const response = await client.post('/login', { email, password });
    
    // 取得後端回傳的 user 物件
    const { user } = response.data;

    // 🕵️‍♂️ Debug 第一步：在終端機印出後端回傳的所有資料
    console.log("登入回傳結果:", user);

    if (!user || !user.role) {
      Alert.alert('身分異常', '後端回傳資料不完整，找不到 role 欄位');
      return;
    }

    // 🕵️‍♂️ Debug 第二步：處理字串（轉小寫並去空格），防止資料庫存入 'Caregiver ' 這種錯誤
   // LoginScreen.js 的跳轉判斷
const userRole = user.role.trim().toLowerCase(); // 強制去空格 + 轉小寫

if (userRole === 'caregiver') {
  navigation.navigate('CaregiverHome');
} else if (userRole === 'family') {
  navigation.navigate('FamilyHome');
} else {
  // 這行可以幫你抓出到底是哪個字串不對
  Alert.alert('身分異常', `資料庫裡的 role 是: "${user.role}"`);
}

  } catch (error) {
    console.error(error);
   Alert.alert('登入失敗', '帳號密碼錯誤或伺服器連線中斷');
  }
};

  return (
<View style={styles.container}>
      <Text style={styles.title}>MediLink</Text>
      <Text style={styles.subtitle}>跨語系危險辨識照護平台</Text>

      <TextInput
        style={styles.input}
        placeholder="請輸入 Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
    // 1. 在檔案頂端定義狀態
const [isPasswordVisible, setIsPasswordVisible] = useState(false);

// 2. 密碼欄位 JSX
<View style={styles.passwordContainer}>
  <TextInput
    style={styles.flexInput}
    placeholder="密碼"
    value={password}
    onChangeText={setPassword}
    secureTextEntry={!isPasswordVisible} // 🚀 切換遮蓋狀態
    autoCapitalize="none"
  />
  <TouchableOpacity 
    style={styles.eyeBtn}
    onPress={() => setIsPasswordVisible(!isPasswordVisible)}
  >
    <Ionicons 
      name={isPasswordVisible ? "eye-outline" : "eye-off-outline"} 
      size={24} 
      color="#95a5a6" 
    />
  </TouchableOpacity>
</View>

      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>登入</Text>
      </TouchableOpacity>

      <View style={styles.linkContainer}>
        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={styles.linkText}>還沒帳號？去註冊</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={styles.linkText}>忘記密碼？</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f5f5' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#2c3e50', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 18, color: '#7f8c8d', textAlign: 'center', marginBottom: 40 },
  input: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#ddd' },
  button: { backgroundColor: '#3498db', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  linkContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  linkText: { color: '#3498db' },
  passwordContainer: { 
  flexDirection: 'row', 
  alignItems: 'center', 
  borderWidth: 1, 
  borderColor: '#ddd', 
  borderRadius: 10, 
  marginBottom: 20,
  backgroundColor: '#fff'
},
flexInput: { 
  flex: 1, 
  padding: 15, 
  fontSize: 16 
},
eyeBtn: { 
  padding: 10, 
  marginRight: 5 
},
});