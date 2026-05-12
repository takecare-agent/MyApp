import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput, ScrollView
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const CATEGORY_OPTIONS = ['用藥', '飲食', '生理量測', '清潔', '活動', '如廁', '睡眠', '其他'];
const ICON_OPTIONS = ['💊', '🍱', '🩺', '🚶', '🛁', '🚿', '🛏️', '📋', '🪥', '💧'];
const EMPTY_TASK_FORM = { category: '用藥', content: '', icon: '💊', time: '08:00', weekdays: [] };

export default function FamilyReminderListScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('reminders'); // 'reminders' | 'tasks'

  // --- 提醒清單 ---
  const [reminders, setReminders] = useState([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // --- 任務模板 ---
  const [templates, setTemplates] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskModal, setTaskModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
  const [saving, setSaving] = useState(false);

  const fetchReminders = async () => {
    try {
      const res = await client.get('/api/reminders');
      const valid = res.data.filter(i => !isNaN(new Date(i.time).getTime()));
      setReminders(valid.sort((a, b) => new Date(a.time) - new Date(b.time)));
    } catch (e) { console.error('提醒抓取失敗', e); }
  };

  const fetchTemplates = async () => {
    try {
      const res = await client.get('/api/task-templates');
      setTemplates(res.data);
    } catch (e) { console.error('模板抓取失敗', e); }
  };

  useFocusEffect(useCallback(() => {
    setRemindersLoading(true);
    setTasksLoading(true);
    Promise.all([fetchReminders(), fetchTemplates()])
      .finally(() => { setRemindersLoading(false); setTasksLoading(false); });
  }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchReminders(), fetchTemplates()]);
    setRefreshing(false);
  };

  // --- 提醒操作 ---
  const handleDeleteReminder = (item) => {
    Alert.alert('確認刪除', `刪除「${item.content}」？`, [
      { text: '取消', style: 'cancel' },
      { text: '刪除', style: 'destructive', onPress: async () => {
        await client.delete(`/api/reminders/${item._id}`);
        setReminders(prev => prev.filter(r => r._id !== item._id));
      }}
    ]);
  };

  const formatTime = (iso) => {
    if (!iso) return '--:--';
    const d = new Date(iso);
    return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  // --- 任務模板操作 ---
  const openAddTask = () => { setEditTarget(null); setTaskForm(EMPTY_TASK_FORM); setTaskModal(true); };
  const openEditTask = (item) => {
    setEditTarget(item);
    setTaskForm({ category: item.category, content: item.content, icon: item.icon, time: item.time, weekdays: item.weekdays || [] });
    setTaskModal(true);
  };

  const handleSaveTask = async () => {
    if (!taskForm.content.trim()) return Alert.alert('提示', '請填寫任務內容');
    setSaving(true);
    try {
      if (editTarget) {
        const res = await client.put(`/api/task-templates/${editTarget._id}`, taskForm);
        setTemplates(prev => prev.map(t => t._id === editTarget._id ? res.data : t));
      } else {
        const res = await client.post('/api/task-templates', taskForm);
        setTemplates(prev => [...prev, res.data]);
      }
      setTaskModal(false);
    } catch (e) { Alert.alert('錯誤', '儲存失敗'); }
    finally { setSaving(false); }
  };

  const handleDeleteTask = (item) => {
    Alert.alert('確認刪除', `刪除「${item.content}」？`, [
      { text: '取消', style: 'cancel' },
      { text: '刪除', style: 'destructive', onPress: async () => {
        await client.delete(`/api/task-templates/${item._id}`);
        setTemplates(prev => prev.filter(t => t._id !== item._id));
      }}
    ]);
  };

  const toggleWeekday = (day) => {
    setTaskForm(prev => {
      const wd = prev.weekdays.includes(day)
        ? prev.weekdays.filter(d => d !== day)
        : [...prev.weekdays, day].sort();
      return { ...prev, weekdays: wd };
    });
  };

  const weekdayLabel = (weekdays) => {
    if (!weekdays || weekdays.length === 0) return '每天';
    return weekdays.map(d => WEEKDAY_LABELS[d]).join('、');
  };

  // --- 渲染 ---
  const renderReminder = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.badge}><Text style={styles.badgeText}>{item.category}</Text></View>
        <View style={[styles.statusBadge, item.isCompleted ? styles.statusDone : styles.statusPending]}>
          <Ionicons name={item.isCompleted ? 'checkmark' : 'time'} size={14} color="#555555" />
          <Text style={styles.statusText}>{item.isCompleted ? '已完成' : '待處理'}</Text>
        </View>
      </View>
      <Text style={styles.content}>{item.content}</Text>
      <View style={styles.timeRow}>
        <Ionicons name="alarm-outline" size={18} color="#666666" />
        <Text style={styles.timeLabel}> 預定時間：</Text>
        <Text style={styles.timeText}>{formatTime(item.time)}</Text>
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('EditReminder', { item })}>
          <Ionicons name="pencil-outline" size={16} color="#1890ff" />
          <Text style={styles.editBtnText}>編輯</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteReminder(item)}>
          <Ionicons name="trash-outline" size={16} color="#ff4d4f" />
          <Text style={styles.deleteBtnText}>刪除</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTemplate = ({ item }) => (
    <View style={styles.taskCard}>
      <Text style={styles.taskIcon}>{item.icon}</Text>
      <View style={styles.taskInfo}>
        <View style={styles.taskRow}>
          <Text style={styles.taskCategory}>{item.category}</Text>
          <Text style={styles.taskTime}>⏰ {item.time}</Text>
        </View>
        <Text style={styles.taskContent}>{item.content}</Text>
        <Text style={styles.taskWeekday}>📅 {weekdayLabel(item.weekdays)}</Text>
      </View>
      <View style={styles.taskActions}>
        <TouchableOpacity onPress={() => openEditTask(item)} style={{ padding: 6 }}>
          <Ionicons name="pencil-outline" size={18} color="#1890ff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteTask(item)} style={{ padding: 6 }}>
          <Ionicons name="trash-outline" size={18} color="#ff4d4f" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Tab 切換 */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, activeTab === 'reminders' && styles.tabActive]} onPress={() => setActiveTab('reminders')}>
          <Text style={[styles.tabText, activeTab === 'reminders' && styles.tabTextActive]}>當日清單</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'tasks' && styles.tabActive]} onPress={() => setActiveTab('tasks')}>
          <Text style={[styles.tabText, activeTab === 'tasks' && styles.tabTextActive]}>重複清單</Text>
        </TouchableOpacity>
      </View>

      {/* 提醒清單 Tab */}
      {activeTab === 'reminders' && (
        <View style={{ flex: 1 }}>
          <View style={styles.actionContainer}>
            <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('AddReminder')}>
              <Ionicons name="add" size={24} color="#fff" />
              <Text style={styles.addBtnText}> 新增提醒</Text>
            </TouchableOpacity>
          </View>
          {remindersLoading ? <ActivityIndicator size="large" color="#1890ff" style={{ marginTop: 20 }} /> : (
            <FlatList
              data={reminders}
              keyExtractor={i => i._id}
              renderItem={renderReminder}
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
      )}

      {/* 任務模板 Tab */}
      {activeTab === 'tasks' && (
        <View style={{ flex: 1 }}>
          <View style={styles.actionContainer}>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#389e0d' }]} onPress={openAddTask}>
              <Ionicons name="add" size={24} color="#fff" />
              <Text style={styles.addBtnText}> 新增任務模板</Text>
            </TouchableOpacity>
          </View>
          {tasksLoading ? <ActivityIndicator size="large" color="#389e0d" style={{ marginTop: 20 }} /> : (
            <FlatList
              data={templates}
              keyExtractor={t => t._id}
              renderItem={renderTemplate}
              contentContainerStyle={{ paddingBottom: 20 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>尚無任務模板</Text>
                  <Text style={styles.emptySubText}>點擊上方按鈕新增，看護每日清單將自動同步</Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* 任務模板 Modal */}
      <Modal visible={taskModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editTarget ? '編輯任務模板' : '新增任務模板'}</Text>

            <Text style={styles.fieldLabel}>圖示</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {ICON_OPTIONS.map(ic => (
                <TouchableOpacity key={ic} onPress={() => setTaskForm(f => ({ ...f, icon: ic }))}
                  style={[styles.iconChip, taskForm.icon === ic && styles.iconChipActive]}>
                  <Text style={{ fontSize: 22 }}>{ic}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>類別</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {CATEGORY_OPTIONS.map(c => (
                <TouchableOpacity key={c} onPress={() => setTaskForm(f => ({ ...f, category: c }))}
                  style={[styles.chip, taskForm.category === c && styles.chipActive]}>
                  <Text style={[styles.chipText, taskForm.category === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>任務內容</Text>
            <TextInput style={styles.input} value={taskForm.content}
              onChangeText={v => setTaskForm(f => ({ ...f, content: v }))} placeholder="例如：早上用藥" />

            <Text style={styles.fieldLabel}>預計時間</Text>
            <TextInput style={styles.input} value={taskForm.time}
              onChangeText={v => setTaskForm(f => ({ ...f, time: v }))}
              placeholder="HH:MM，例如：08:00" keyboardType="numbers-and-punctuation" />

            <Text style={styles.fieldLabel}>執行日（不選 = 每天）</Text>
            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((label, idx) => (
                <TouchableOpacity key={idx}
                  style={[styles.dayBtn, taskForm.weekdays.includes(idx) && styles.dayBtnActive]}
                  onPress={() => toggleWeekday(idx)}>
                  <Text style={[styles.dayBtnText, taskForm.weekdays.includes(idx) && styles.dayBtnTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setTaskModal(false)}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSaveTask} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>儲存</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },

  // Tab
  tabRow: { flexDirection: 'row', backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 3, borderBottomColor: '#1890ff' },
  tabText: { fontSize: 15, color: '#888888', fontWeight: 'bold' },
  tabTextActive: { color: '#1890ff' },

  actionContainer: { padding: 15, backgroundColor: '#ffffff' },
  addBtn: { backgroundColor: '#1890ff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 10, elevation: 3 },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  // 提醒卡片
  card: { backgroundColor: '#ffffff', marginHorizontal: 15, marginTop: 12, padding: 15, borderRadius: 12, elevation: 2, borderLeftWidth: 5, borderLeftColor: '#1890ff' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  badge: { backgroundColor: '#e6f7ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { color: '#1890ff', fontWeight: 'bold', fontSize: 12 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  statusPending: { backgroundColor: '#fffbe6', borderColor: '#ffe58f' },
  statusDone: { backgroundColor: '#f6ffed', borderColor: '#b7eb8f' },
  statusText: { fontSize: 12, color: '#555555', marginLeft: 4 },
  content: { fontSize: 18, fontWeight: 'bold', color: '#222222', marginBottom: 12 },
  timeRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10 },
  timeLabel: { color: '#666666', fontSize: 14 },
  timeText: { color: '#222222', fontSize: 16, fontWeight: 'bold' },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10 },
  editBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#1890ff', backgroundColor: '#e6f4ff' },
  editBtnText: { color: '#1890ff', fontSize: 14, fontWeight: 'bold', marginLeft: 4 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#ff4d4f', backgroundColor: '#fff1f0' },
  deleteBtnText: { color: '#ff4d4f', fontSize: 14, fontWeight: 'bold', marginLeft: 4 },

  // 任務模板卡片
  taskCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', marginHorizontal: 15, marginTop: 12, padding: 14, borderRadius: 12, elevation: 2, borderLeftWidth: 5, borderLeftColor: '#389e0d' },
  taskIcon: { fontSize: 28, marginRight: 12 },
  taskInfo: { flex: 1 },
  taskRow: { flexDirection: 'row', justifyContent: 'space-between' },
  taskCategory: { fontSize: 12, color: '#389e0d', fontWeight: 'bold' },
  taskTime: { fontSize: 12, color: '#888888' },
  taskContent: { fontSize: 16, fontWeight: 'bold', color: '#333333', marginVertical: 2 },
  taskWeekday: { fontSize: 12, color: '#888888' },
  taskActions: { flexDirection: 'column', gap: 4 },

  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#999999', fontSize: 16 },
  emptySubText: { color: '#cccccc', fontSize: 14, marginTop: 5, textAlign: 'center' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333333', marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: 'bold', color: '#555555', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#d9d9d9', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#fafafa', marginBottom: 14 },
  iconChip: { padding: 8, borderRadius: 10, borderWidth: 1, borderColor: '#d9d9d9', marginRight: 8, backgroundColor: '#fafafa' },
  iconChipActive: { borderColor: '#389e0d', backgroundColor: '#f6ffed' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f0f0f0', marginRight: 8 },
  chipActive: { backgroundColor: '#389e0d' },
  chipText: { fontSize: 13, color: '#555555' },
  chipTextActive: { color: '#ffffff', fontWeight: 'bold' },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  dayBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#d9d9d9', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafafa' },
  dayBtnActive: { backgroundColor: '#389e0d', borderColor: '#389e0d' },
  dayBtnText: { fontSize: 14, color: '#555555' },
  dayBtnTextActive: { color: '#ffffff', fontWeight: 'bold' },
  modalBtns: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#d9d9d9', alignItems: 'center' },
  cancelBtnText: { fontSize: 16, color: '#555555' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#389e0d', alignItems: 'center' },
  saveBtnText: { fontSize: 16, color: '#ffffff', fontWeight: 'bold' }
});