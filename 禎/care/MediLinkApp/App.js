import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from './src/theme';
import LoginScreen            from './src/screens/LoginScreen';
import RegisterScreen         from './src/screens/RegisterScreen';
import ForgotPasswordScreen   from './src/screens/ForgotPasswordScreen';

import CaregiverHomeScreen    from './src/screens/CaregiverHomeScreen';
import CareRecordListScreen   from './src/screens/CareRecordListScreen';
import ReminderListScreen     from './src/screens/ReminderListScreen';
import AbnormalEventScreen    from './src/screens/AbnormalEventScreen';
import DailyTaskScreen        from './src/screens/DailyTaskScreen';
import RecordDetailScreen     from './src/screens/RecordDetailScreen';
import EditRecordScreen       from './src/screens/EditRecordScreen';

import FamilyHomeScreen       from './src/screens/FamilyHomeScreen';
import AbnormalListScreen     from './src/screens/AbnormalListScreen';
import FamilyReminderListScreen from './src/screens/FamilyReminderListScreen';
import AddReminderScreen      from './src/screens/AddReminderScreen';
import EditReminderScreen     from './src/screens/EditReminderScreen';

const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: '#FFFFFF' },
  headerTintColor: colors.text,
  headerTitleStyle: { fontSize: 17, fontWeight: '600', color: colors.text },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
};

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login" screenOptions={screenOptions}>
        {/* 公共 */}
        <Stack.Screen name="Login"          component={LoginScreen}          options={{ headerShown: false }} />
        <Stack.Screen name="Register"       component={RegisterScreen}       options={{ title: '新帳號註冊' }} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: '重設密碼' }} />

        {/* 看護端 */}
        <Stack.Screen name="CaregiverHome"  component={CaregiverHomeScreen}  options={{ title: '看護端' }} />
        <Stack.Screen name="ReminderList"   component={ReminderListScreen}   options={{ title: '工作清單' }} />
        <Stack.Screen name="AbnormalEvent"  component={AbnormalEventScreen}  options={{ title: '異常回報' }} />
        <Stack.Screen name="CareRecordList" component={CareRecordListScreen} options={{ title: '照護紀錄' }} />
        <Stack.Screen name="DailyTask"      component={DailyTaskScreen}      options={{ title: '今日照護清單' }} />
        <Stack.Screen name="RecordDetail"   component={RecordDetailScreen}   options={{ title: '紀錄詳細' }} />
        <Stack.Screen name="EditRecord"     component={EditRecordScreen}     options={{ title: '編輯紀錄' }} />

        {/* 家屬端 */}
        <Stack.Screen name="FamilyHome"         component={FamilyHomeScreen}         options={{ title: '家屬端' }} />
        <Stack.Screen name="AbnormalList"        component={AbnormalListScreen}       options={{ title: '異常紀錄' }} />
        <Stack.Screen name="FamilyReminderList"  component={FamilyReminderListScreen} options={{ title: '提醒清單' }} />
        <Stack.Screen name="AddReminder"         component={AddReminderScreen}        options={{ title: '新增提醒' }} />
        <Stack.Screen name="EditReminder"        component={EditReminderScreen}       options={{ title: '修改提醒' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}