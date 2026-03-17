import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput, ScrollView, Platform
} from 'react-native';
import { Picker } from '@react-native-picker/picker'; 
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const CATEGORY_OPTIONS = ['用藥提醒', '醫療行程', '生理量測', '生活照護', '其他'];
const DETAIL_PRESETS = {
  '用藥提醒': ['飯後服用血壓藥', '睡前服用安眠藥', '三餐飯後服藥', '施打胰島素'],
  '醫療行程': ['醫院回診', '診所拿藥', '物理治療/復健', '施打疫苗'],
  '生理量測': ['測量血壓', '測量空腹血糖', '測量體溫', '測量體重'],
  '生活照護': ['協助洗澡', '更換尿布', '剪指甲', '翻身拍背'],
  '其他': ['請手動輸入']
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

const EMPTY_TASK_FORM = { category: '用藥提醒', detail: '飯後服用血壓藥', customDetail: '', hour: 8, minute: 0, weekdays: [] };

export default function FamilyReminderListScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('reminders'); 

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

  // --- 時間彈出選單控制 ---
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [activeTimePicker, setActiveTimePicker] = useState(null); // 'hour' | 'minute'

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

  const openAddTask = () => { 
    setEditTarget(null); 
    setTaskForm(EMPTY_TASK_FORM); 
    setTaskModal(true); 
  };
  
  const openEditTask = (item) => {
    setEditTarget(item);
    let h = 8, m = 0;
    if (item.time && item.time.includes(':')) {
      const parts = item.time.split(':');
      h = parseInt(parts[0], 10) || 0;
      m = parseInt(parts[1], 10) || 0;
    }

    const cat = item.category || '用藥提醒';
    const content = item.content || '';
    const presets = DETAIL_PRESETS[cat] || [];
    
    let det = '其他';
    let cust = '';
    if (presets.includes(content)) {
      det = content;
    } else {
      det = '其他';
      cust = content;
    }

    setTaskForm({ 
      category: cat, 
      detail: det,
      customDetail: cust,
      hour: h, 
      minute: m, 
      weekdays: item.weekdays || [] 
    });
    setTaskModal(true);
  };

  const handleSaveTask = async () => {
    const finalContent = (taskForm.detail === '其他' || taskForm.category === '其他') ? taskForm.customDetail : taskForm.detail;
    if (!finalContent || !finalContent.trim()) return Alert.alert('提示', '請填寫任務內容');

    setSaving(true);
    try {
      const timeString = `${String(taskForm.hour).padStart(2, '0')}:${String(taskForm.minute).padStart(2, '0')}`;
      const payload = { 
        category: taskForm.category,
        content: finalContent,
        time: timeString,
        weekdays: taskForm.weekdays
      };

      if (editTarget) {
        const res = await client.put(`/api/task-templates/${editTarget._id}`, payload);
        setTemplates(prev => prev.map(t => t._id === editTarget._id ? res.data : t));
      } else {
        const res = await client.post('/api/task-templates', payload);
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
    if (!weekdays || weekdays.length === 0) return '每天執行';
    return weekdays.map(d => WEEKDAY_LABELS[d]).join('、');
  };

  // 渲染底部時間滾輪的內容
  const renderTimePickerContent = () => {
    if (activeTimePicker === 'hour') {
      return HOURS.map(h => <Picker.Item key={h} label={`${String(h).padStart(2,'0')}時`} value={h} color="#333333" />);
    }
    return MINUTES.map(m => <Picker.Item key={m} label={`${String(m).padStart(2,'0')}分`} value={m} color="#333333" />);
  };

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
    <View style={[styles.card, { borderLeftColor: '#389e0d' }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: '#f6ffed' }]}>
          <Text style={[styles.badgeText, { color: '#389e0d' }]}>{item.category}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: '#f0f5ff', borderColor: '#d6e4ff' }]}>
          <Ionicons name="calendar-outline" size={14} color="#2f54eb" />
          <Text style={[styles.statusText, { color: '#2f54eb' }]}>{weekdayLabel(item.weekdays)}</Text>
        </View>
      </View>
      <Text style={styles.content}>{item.content}</Text>
      <View style={styles.timeRow}>
        <Ionicons name="alarm-outline" size={18} color="#666666" />
        <Text style={styles.timeLabel}> 每日預定：</Text>
        <Text style={styles.timeText}>{item.time}</Text>
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.editBtn, { borderColor: '#389e0d', backgroundColor: '#f6ffed' }]} onPress={() => openEditTask(item)}>
          <Ionicons name="pencil-outline" size={16} color="#389e0d" />
          <Text style={[styles.editBtnText, { color: '#389e0d' }]}>編輯</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteTask(item)}>
          <Ionicons name="trash-outline" size={16} color="#ff4d4f" />
          <Text style={styles.deleteBtnText}>刪除</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Tab 切換 */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, activeTab === 'reminders' ? styles.tabActive : null]} onPress={() => setActiveTab('reminders')}>
          <Text style={[styles.tabText, activeTab === 'reminders' ? styles.tabTextActive : null]}>單次提醒</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'tasks' ? styles.tabActive : null]} onPress={() => setActiveTab('tasks')}>
          <Text style={[styles.tabText, activeTab === 'tasks' ? styles.tabTextActive : null]}>重複提醒</Text>
        </TouchableOpacity>
      </View>

      {/* 提醒清單 Tab */}
      {activeTab === 'reminders' ? (
        <View style={{ flex: 1 }}>
          <View style={styles.actionContainer}>
            <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('AddReminder')}>
              <Ionicons name="add" size={24} color="#fff" />
              <Text style={styles.addBtnText}> 新增單次提醒</Text>
            </TouchableOpacity>
          </View>
          {remindersLoading ? <ActivityIndicator size="large" color="#1890ff" style={{ marginTop: 20 }} /> : (
            <FlatList
              data={reminders}
              keyExtractor={i => i._id}
              renderItem={renderReminder}
              contentContainerStyle={{ paddingBottom: 20 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListEmptyComponent={<View style={styles.emptyContainer}><Text style={styles.emptyText}>尚無提醒事項</Text></View>}
            />
          )}
        </View>
      ) : null}

      {/* 任務模板 Tab */}
      {activeTab === 'tasks' ? (
        <View style={{ flex: 1 }}>
          <View style={styles.actionContainer}>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#389e0d' }]} onPress={openAddTask}>
              <Ionicons name="add" size={24} color="#fff" />
              <Text style={styles.addBtnText}> 新增重複清單</Text>
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
                  <Text style={styles.emptyText}>尚無常規任務</Text>
                  <Text style={styles.emptySubText}>設定後，將自動出現在看護的每日清單中</Text>
                </View>
              }
            />
          )}
        </View>
      ) : null}

      {/* 🚀 完美還原截圖的「全螢幕表單」 */}
      <Modal visible={taskModal} animationType="slide" transparent={false}>
        <View style={styles.fullScreenModal}>
          {/* 仿原生的標題列 */}
          <View style={styles.modalHeaderFullScreen}>
            <TouchableOpacity onPress={() => setTaskModal(false)} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color="#333" />
              <Text style={styles.backBtnText}>提醒清單</Text>
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>{editTarget ? '編輯任務' : '新增任務'}</Text>
            <View style={{ width: 80 }} /> 
          </View>

          <ScrollView style={styles.modalScrollBody} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* 1. 提醒事項 (兩層滾輪) */}
            <Text style={styles.sectionLabel}>1. 提醒事項</Text>
            <View style={styles.formCard}>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={taskForm.category}
                  onValueChange={(v) => {
                    const defaultDetail = (DETAIL_PRESETS[v] || [])[0] || '其他';
                    setTaskForm({ ...taskForm, category: v, detail: defaultDetail });
                  }}
                  itemStyle={{ color: '#333333' }}
                >
                  {CATEGORY_OPTIONS.map(c => <Picker.Item key={c} label={c} value={c} color="#333333" />)}
                </Picker>
              </View>

              <View style={[styles.pickerBox, { marginTop: 15 }]}>
                <Picker
                  selectedValue={taskForm.detail}
                  onValueChange={(v) => setTaskForm({ ...taskForm, detail: v })}
                  itemStyle={{ color: '#333333' }}
                >
                  {(DETAIL_PRESETS[taskForm.category] || []).map(d => <Picker.Item key={d} label={d} value={d} color="#333333" />)}
                  <Picker.Item label="其他 (手動輸入)" value="其他" color="#333333" />
                </Picker>
              </View>

              {(taskForm.detail === '其他' || taskForm.category === '其他') ? (
                <TextInput style={styles.customInput} placeholder="請輸入自訂內容..." value={taskForm.customDetail} onChangeText={v => setTaskForm({ ...taskForm, customDetail: v })} />
              ) : null}
            </View>

            {/* 2. 執行日 (圓形按鈕) */}
            <Text style={styles.sectionLabel}>2. 執行日 (不選代表每天)</Text>
            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((label, idx) => (
                <TouchableOpacity key={idx}
                  style={[styles.dayBtn, taskForm.weekdays.includes(idx) ? styles.dayBtnActive : null]}
                  onPress={() => toggleWeekday(idx)}>
                  <Text style={[styles.dayBtnText, taskForm.weekdays.includes(idx) ? styles.dayBtnTextActive : null]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 3. 設定時間 (彈出式下拉選單按鈕) */}
            <Text style={styles.sectionLabel}>3. 設定時間</Text>
            <View style={styles.rowContainer}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <TouchableOpacity style={styles.dropdownBox} onPress={() => { setActiveTimePicker('hour'); setShowTimePicker(true); }}>
                  <Text style={styles.selectorText}>{String(taskForm.hour).padStart(2,'0')} 時</Text>
                  <Ionicons name="chevron-down" size={16} color="#666" />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 20, fontWeight: 'bold' }}>:</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <TouchableOpacity style={styles.dropdownBox} onPress={() => { setActiveTimePicker('minute'); setShowTimePicker(true); }}>
                  <Text style={styles.selectorText}>{String(taskForm.minute).padStart(2,'0')} 分</Text>
                  <Ionicons name="chevron-down" size={16} color="#666" />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={[styles.submitBigBtn, saving ? { opacity: 0.6 } : null]} onPress={handleSaveTask} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBigText}>確認{editTarget ? '修改' : '新增'}</Text>}
            </TouchableOpacity>
          </ScrollView>

          {/* 🚀 底部彈出的時間滾輪 */}
          <Modal visible={showTimePicker} transparent animationType="slide">
            <View style={styles.bottomModalOverlay}>
              <View style={styles.bottomModalContent}>
                <View style={styles.bottomModalHeader}>
                  <Text style={styles.bottomModalTitle}>選擇時間</Text>
                  <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                    <Text style={styles.bottomModalDone}>完成</Text>
                  </TouchableOpacity>
                </View>
                <Picker
                  selectedValue={activeTimePicker === 'hour' ? taskForm.hour : taskForm.minute}
                  onValueChange={(val) => setTaskForm({ ...taskForm, [activeTimePicker]: val })}
                  style={{ height: 200, backgroundColor: '#ffffff' }}
                  itemStyle={{ color: '#333333' }}
                >
                  {renderTimePickerContent()}
                </Picker>
              </View>
            </View>
          </Modal>

        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },

  tabRow: { flexDirection: 'row', backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 3, borderBottomColor: '#1890ff' },
  tabText: { fontSize: 15, color: '#888888', fontWeight: 'bold' },
  tabTextActive: { color: '#1890ff' },

  actionContainer: { padding: 15, backgroundColor: '#ffffff' },
  addBtn: { backgroundColor: '#1890ff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 10, elevation: 3 },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

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

  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#999999', fontSize: 16 },
  emptySubText: { color: '#cccccc', fontSize: 14, marginTop: 5, textAlign: 'center' },

  // 🚀 完美還原 AddReminderScreen 的全螢幕表單樣式
  fullScreenModal: { flex: 1, backgroundColor: '#fcfcfc' },
  modalHeaderFullScreen: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, paddingTop: Platform.OS === 'ios' ? 50 : 20, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 100 },
  backBtnText: { fontSize: 16, color: '#333' },
  modalHeaderTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  
  modalScrollBody: { padding: 20 },
  sectionLabel: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 10, marginTop: 15 },
  
  formCard: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, backgroundColor: '#fff', padding: 15, marginBottom: 10 },
  pickerBox: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#fafafa', overflow: 'hidden' },
  customInput: { borderWidth: 1, borderColor: '#389e0d', padding: 12, borderRadius: 8, marginTop: 15, backgroundColor: '#f6ffed', fontSize: 16 },

  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, paddingHorizontal: 5 },
  dayBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  dayBtnActive: { backgroundColor: '#389e0d', borderColor: '#389e0d' },
  dayBtnText: { fontSize: 15, color: '#555' },
  dayBtnTextActive: { color: '#ffffff', fontWeight: 'bold' },

  rowContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30 },
  dropdownBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 15, height: 50, backgroundColor: '#fff' },
  selectorText: { fontSize: 16, color: '#333' },

  submitBigBtn: { backgroundColor: '#389e0d', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  submitBigText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  // 🚀 底部彈出滾輪樣式
  bottomModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  bottomModalContent: { backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
  bottomModalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#eeeeee', alignItems: 'center' },
  bottomModalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  bottomModalDone: { fontSize: 16, color: '#007aff', fontWeight: 'bold' }
});