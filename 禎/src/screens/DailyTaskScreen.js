import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { colors, radius, shadow, text } from '../theme';

const todayKey = () => {
  const d = new Date();
  return `dailyTask_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const CAT_ICON = { '用藥提醒': '💊', '醫療行程': '🏥', '生活照護': '🛁', '其他': '📝' };

export default function DailyTaskScreen() {
  const [tasks, setTasks]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const fetchTasks = async () => {
    try {
      const [remRes, tplRes] = await Promise.all([
        client.get('/api/reminders'),
        client.get('/api/task-templates/today'),
      ]);
      const todayStr = new Date().toDateString();

      const reminders = remRes.data
        .filter(r => new Date(r.time).toDateString() === todayStr)
        .map(r => {
          const d = new Date(r.time);
          const hhmm = !isNaN(d) ? `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` : '--:--';
          return { id: r._id, category: r.category, content: r.content, time: hhmm, _type: 'reminder' };
        });

      const templates = tplRes.data.map(t => ({
        id: t._id, category: t.category, content: t.content, time: t.time || '--:--', _type: 'template',
      }));

      let merged = [...reminders, ...templates].sort((a, b) => a.time.localeCompare(b.time));

      const saved = await AsyncStorage.getItem(todayKey());
      const submitted = await AsyncStorage.getItem(`${todayKey()}_submitted`);
      if (submitted === 'true') setIsSubmitted(true);

      if (saved) {
        const savedStatus = JSON.parse(saved);
        merged = merged.map(t => {
          const local = savedStatus.find(s => s.id === t.id);
          return local ? { ...t, status: local.status, completedAt: local.completedAt } : { ...t, status: null, completedAt: null };
        });
      } else {
        merged = merged.map(t => ({ ...t, status: null, completedAt: null }));
      }
      setTasks(merged);
    } catch (e) {
      console.error('載入失敗', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchTasks();
  }, []));

  const handleToggle = async (taskId, status) => {
    const now = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    const updated = tasks.map(t => {
      if (t.id !== taskId) return t;
      if (t.status === status) return { ...t, status: null, completedAt: null };
      return { ...t, status, completedAt: status === 'done' ? now : null };
    });
    setTasks(updated);
    await AsyncStorage.setItem(todayKey(), JSON.stringify(updated.map(t => ({ id: t.id, status: t.status, completedAt: t.completedAt }))));
  };

  const handleSubmitAll = async () => {
    const done = tasks.filter(t => t.status === 'done');
    const skip = tasks.filter(t => t.status === 'skip');
    if (done.length === 0 && skip.length === 0) return Alert.alert('提示', '請先標記任務執行狀況');
    if (isSubmitted) return Alert.alert('提示', '今日紀錄已送出，請勿重複提交');

    setSubmitting(true);
    try {
      const caregiverName = await AsyncStorage.getItem('userName') || '專屬看護';
      for (const t of tasks) {
        if (t.status === 'done') {
          if (t._type === 'reminder') await client.patch(`/api/reminders/${t.id}`, { isCompleted: true });
          await client.post('/care-records', { title: `[任務完成] ${t.category}`, description: `${t.content}（打卡時間：${t.completedAt}）`, caregiverName });
        } else if (t.status === 'skip') {
          await client.post('/care-records', { meals: `[未執行] ${t.category}`, note: `未執行原因需確認：${t.content}`, caregiverName });
        }
      }
      await AsyncStorage.setItem(`${todayKey()}_submitted`, 'true');
      setIsSubmitted(true);
      Alert.alert('大功告成！', `已上傳 ${done.length} 筆完成，${skip.length} 筆未執行紀錄。`);
    } catch {
      Alert.alert('錯誤', '送出失敗，請檢查網路連線');
    } finally {
      setSubmitting(false);
    }
  };

  const doneCount = tasks.filter(t => t.status === 'done').length;
  const skipCount = tasks.filter(t => t.status === 'skip').length;
  const total     = tasks.length;

  const renderItem = ({ item }) => {
    const isDone = item.status === 'done';
    const isSkip = item.status === 'skip';
    const icon   = CAT_ICON[item.category] || '📋';
    return (
      <View style={[s.card, isDone && s.cardDone, isSkip && s.cardSkip]}>
        <Text style={s.taskIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <View style={s.taskMeta}>
            <Text style={[s.taskCat, isDone && { color: colors.success }, isSkip && { color: colors.danger }]}>
              {item.category}{item._type === 'reminder' ? '（單次）' : ''}
            </Text>
            <Text style={s.taskTime}>⏰ {item.time}</Text>
          </View>
          <Text style={[s.taskContent, isDone && s.strikeGreen, isSkip && s.strikeRed]}>{item.content}</Text>
          {isDone && item.completedAt && <Text style={s.doneAt}>✅ 完成於 {item.completedAt}</Text>}
          {isSkip && <Text style={s.skipAt}>⏭️ 標記未執行</Text>}
        </View>
        <View style={s.btnGroup}>
          <TouchableOpacity style={[s.circleBtn, s.greenCircle, isDone && s.greenCircleFill]} onPress={() => handleToggle(item.id, 'done')}>
            <Ionicons name="checkmark" size={18} color={isDone ? '#fff' : colors.success} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.circleBtn, s.redCircle, isSkip && s.redCircleFill]} onPress={() => handleToggle(item.id, 'skip')}>
            <Ionicons name="close" size={18} color={isSkip ? '#fff' : colors.danger} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) return <ActivityIndicator size="large" color={colors.success} style={{ marginTop: 60 }} />;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>📋 今日照護清單</Text>
        <View style={s.progressRow}>
          <Text style={s.progressText}>完成 <Text style={s.progressDone}>{doneCount}</Text> / {total}</Text>
          {skipCount > 0 && <Text style={s.progressSkip}>  未執行 {skipCount} 項</Text>}
        </View>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: total === 0 ? '0%' : `${(doneCount/total)*100}%` }]} />
        </View>
      </View>

      <FlatList data={tasks} keyExtractor={t => t.id} renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListEmptyComponent={<Text style={s.empty}>家屬目前尚未指派任務</Text>}
      />

      {total > 0 && (
        <View style={s.footer}>
          {isSubmitted ? (
            <View style={s.submittedBanner}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={s.submittedText}>今日紀錄已送出</Text>
            </View>
          ) : (
            <TouchableOpacity style={[s.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmitAll} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>一鍵送出今日紀錄</Text>}
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.bg },
  header:      { backgroundColor: colors.card, padding: 20, ...shadow.sm },
  headerTitle: { ...text.h2, marginBottom: 10 },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  progressText:{ ...text.body, color: colors.textSub },
  progressDone:{ color: colors.success, fontWeight: '700', fontSize: 18 },
  progressSkip:{ ...text.sm, color: colors.danger },
  progressBar: { height: 6, backgroundColor: colors.border, borderRadius: 3 },
  progressFill:{ height: 6, backgroundColor: colors.success, borderRadius: 3 },

  card:        { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: 14, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: colors.success, ...shadow.sm },
  cardDone:    { backgroundColor: colors.successBg, borderLeftColor: colors.success, opacity: 0.85 },
  cardSkip:    { backgroundColor: colors.dangerBg, borderLeftColor: colors.danger, opacity: 0.8 },
  taskIcon:    { fontSize: 26, marginRight: 12 },
  taskMeta:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  taskCat:     { fontSize: 12, fontWeight: '600', color: colors.success },
  taskTime:    { ...text.xs },
  taskContent: { ...text.body, fontWeight: '600' },
  strikeGreen: { color: colors.success, textDecorationLine: 'line-through' },
  strikeRed:   { color: colors.danger,  textDecorationLine: 'line-through' },
  doneAt:      { fontSize: 12, color: colors.success, marginTop: 3 },
  skipAt:      { fontSize: 12, color: colors.danger,  marginTop: 3 },

  btnGroup:       { flexDirection: 'column', gap: 8, marginLeft: 10 },
  circleBtn:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  greenCircle:    { borderColor: colors.success, backgroundColor: '#fff' },
  greenCircleFill:{ backgroundColor: colors.success },
  redCircle:      { borderColor: colors.danger, backgroundColor: '#fff' },
  redCircleFill:  { backgroundColor: colors.danger },

  footer:          { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
  submitBtn:       { backgroundColor: colors.success, padding: 15, borderRadius: radius.md, alignItems: 'center' },
  submitText:      { color: '#fff', fontSize: 15, fontWeight: '700' },
  submittedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15, borderRadius: radius.md, backgroundColor: colors.successBg, borderWidth: 1.5, borderColor: '#86EFAC' },
  submittedText:   { color: colors.success, fontSize: 15, fontWeight: '700' },
  empty:           { textAlign: 'center', marginTop: 50, color: colors.textMuted, fontSize: 15 },
});