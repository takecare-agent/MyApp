import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

export default function DateRangePicker({ onRangeChange, initialStart, initialEnd }) {
  const today = new Date();

  const [startDate, setStartDate] = useState(initialStart || null);
  const [endDate, setEndDate] = useState(initialEnd || null);
  const [mode, setMode] = useState('single');
  const [visible, setVisible] = useState(false);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [pickingFor, setPickingFor] = useState('start');

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const parseDate = (str) => {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return { year: y, month: m - 1, day: d };
  };

  const formatDisplay = (str) => {
    if (!str) return '請選擇';
    const { year, month, day } = parseDate(str);
    return `${year}/${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  };

  const dateToString = (year, month, day) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const stringToDate = (str) => {
    if (!str) return null;
    return new Date(str);
  };

  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push({ day: null, disabled: true });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ day: d, disabled: false });
    }

    return days;
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const isSelected = (day) => {
    if (!day) return false;
    const dateStr = dateToString(viewYear, viewMonth, day);
    return dateStr === startDate || dateStr === endDate;
  };

  const isInRange = (day) => {
    if (!day || !startDate || !endDate) return false;
    const dateStr = dateToString(viewYear, viewMonth, day);
    const start = stringToDate(startDate);
    const end = stringToDate(endDate);
    const current = new Date(dateStr);
    return current > start && current < end;
  };

  const isStart = (day) => {
    if (!day) return false;
    return dateToString(viewYear, viewMonth, day) === startDate;
  };

  const isEnd = (day) => {
    if (!day) return false;
    return dateToString(viewYear, viewMonth, day) === endDate;
  };

  const isToday = (day) => {
    if (!day) return false;
    return viewYear === today.getFullYear() &&
           viewMonth === today.getMonth() &&
           day === today.getDate();
  };

  const handleDayPress = (day) => {
    if (!day) return;
    const dateStr = dateToString(viewYear, viewMonth, day);

    if (mode === 'single') {
      setStartDate(dateStr);
      setEndDate(null);
      onRangeChange && onRangeChange({ start: dateStr, end: null });
      setVisible(false);
    } else {
      if (pickingFor === 'start') {
        setStartDate(dateStr);
        setEndDate(null);
        setPickingFor('end');
        onRangeChange && onRangeChange({ start: dateStr, end: null });
      } else {
        const startDateObj = new Date(startDate);
        const clickedDateObj = new Date(dateStr);
        if (clickedDateObj < startDateObj) {
          setStartDate(dateStr);
          setEndDate(startDate);
          onRangeChange && onRangeChange({ start: dateStr, end: startDate });
        } else {
          setEndDate(dateStr);
          onRangeChange && onRangeChange({ start: startDate, end: dateStr });
        }
        setPickingFor('start');
        setVisible(false);
      }
    }
  };

  const handleClear = () => {
    setStartDate(null);
    setEndDate(null);
    setPickingFor('start');
    onRangeChange && onRangeChange({ start: null, end: null });
  };

  const displayText = () => {
    if (startDate && endDate) {
      if (startDate === endDate) return formatDisplay(startDate);
      return `${formatDisplay(startDate)} ~ ${formatDisplay(endDate)}`;
    }
    if (startDate) return `從 ${formatDisplay(startDate)}`;
    return mode === 'range' ? '選擇日期區間' : '選擇日期';
  };

  const handleModeChange = (newMode) => {
    if (newMode !== mode) {
      setMode(newMode);
      handleClear();
    }
  };

  const calendarDays = generateCalendarDays();

  return (
    <View>
      <TouchableOpacity style={s.trigger} onPress={() => setVisible(true)}>
        <Ionicons name="calendar-outline" size={16} color={colors.primary} />
        <Text style={[s.triggerText, (startDate || endDate) && s.triggerTextActive]}>
          {displayText()}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.textSub} />
      </TouchableOpacity>

      <View style={s.modeRow}>
        <TouchableOpacity
          style={[s.modeBtn, mode === 'single' && s.modeBtnActive]}
          onPress={() => handleModeChange('single')}>
          <Text style={[s.modeBtnText, mode === 'single' && s.modeBtnTextActive]}>單一日期</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modeBtn, mode === 'range' && s.modeBtnActive]}
          onPress={() => handleModeChange('range')}>
          <Text style={[s.modeBtnText, mode === 'range' && s.modeBtnTextActive]}>日期區間</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={visible} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setVisible(false)} />
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {mode === 'range' ? `選擇${pickingFor === 'start' ? '開始' : '結束'}日期` : '選擇日期'}
              </Text>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textSub} />
              </TouchableOpacity>
            </View>

            {/* 月份導航 */}
            <View style={s.monthNav}>
              <TouchableOpacity onPress={handlePrevMonth} style={s.navBtn}>
                <Ionicons name="chevron-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={s.monthTitle}>{viewYear}年 {viewMonth + 1}月</Text>
              <TouchableOpacity onPress={handleNextMonth} style={s.navBtn}>
                <Ionicons name="chevron-forward" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* 星期抬頭 */}
            <View style={s.weekdayRow}>
              {WEEKDAY_LABELS.map((label, idx) => (
                <Text key={idx} style={[s.weekdayText, idx === 0 && s.weekdayWeekend, idx === 6 && s.weekdayWeekend]}>{label}</Text>
              ))}
            </View>

            {/* 日曆格子 */}
            <View style={s.calendarGrid}>
              {calendarDays.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    s.dayCell,
                    item.disabled && s.dayDisabled,
                    isInRange(item.day) && s.dayInRange,
                    isStart(item.day) && s.dayStart,
                    isEnd(item.day) && s.dayEnd,
                  ]}
                  onPress={() => handleDayPress(item.day)}
                  disabled={item.disabled}
                >
                  {item.day && (
                    <Text style={[
                      s.dayText,
                      item.disabled && s.dayTextDisabled,
                      isToday(item.day) && s.dayTextToday,
                      (isStart(item.day) || isEnd(item.day)) && s.dayTextSelected,
                    ]}>
                      {item.day}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.actionRow}>
              <TouchableOpacity style={s.clearBtn} onPress={handleClear}>
                <Text style={s.clearBtnText}>清除</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={() => setVisible(false)}>
                <Text style={s.confirmBtnText}>完成</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primaryBg, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary,
  },
  triggerText: { fontSize: 14, color: colors.textSub },
  triggerTextActive: { color: colors.primary, fontWeight: '600' },

  modeRow: { flexDirection: 'row', marginTop: 8, gap: 8 },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: '#F1F5F9', alignItems: 'center' },
  modeBtnActive: { backgroundColor: colors.primary },
  modeBtnText: { fontSize: 13, color: colors.textSub },
  modeBtnTextActive: { color: '#fff', fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },

  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  navBtn: { padding: 8 },
  monthTitle: { fontSize: 18, fontWeight: '700', color: colors.text },

  weekdayRow: { flexDirection: 'row', marginBottom: 8 },
  weekdayText: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '600', color: colors.textSub },
  weekdayWeekend: { color: '#ff4d4f' },

  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayDisabled: { opacity: 0 },
  dayInRange: { backgroundColor: '#e6f7ff', borderRadius: 0 },
  dayStart: { backgroundColor: colors.primary, borderTopLeftRadius: 20, borderBottomLeftRadius: 20 },
  dayEnd: { backgroundColor: colors.primary, borderTopRightRadius: 20, borderBottomRightRadius: 20 },
  dayText: { fontSize: 15, color: colors.text },
  dayTextDisabled: { color: '#ccc' },
  dayTextToday: { fontWeight: '700', color: colors.primary },
  dayTextSelected: { color: '#fff', fontWeight: '700' },

  actionRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  clearBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, backgroundColor: '#F1F5F9', alignItems: 'center' },
  clearBtnText: { fontSize: 15, color: colors.textSub, fontWeight: '600' },
  confirmBtn: { flex: 2, paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  confirmBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
