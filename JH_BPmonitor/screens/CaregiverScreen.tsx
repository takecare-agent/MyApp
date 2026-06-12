/* eslint-disable react-native/no-inline-styles */
/**
 * 看護端介面 (Caregiver Screen)
 * 核心功能：每日檢核清單、協助引導、7天歷史摘要
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    StyleSheet, Text, View, TouchableOpacity, ScrollView,
    ActivityIndicator, SafeAreaView, Alert, TextInput,
    Modal, Platform
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../src/config/api';

// ─── 型別定義 ────────────────────────────────────────────────────────────
interface BloodPressureRecord {
    _id?: string;
    id?: string;
    sys: number;
    dia: number;
    pulse: number;
    mood?: string;
    notes?: string;
    source?: string;
    time: string;
    userId: string;
    role: string;
    measuredToday?: boolean;
}

interface DailyChecklistItem {
    id: string;
    title: string;
    completed: boolean;
    timestamp?: string;
    icon: string;
}

interface SevenDayHistory {
    date: string;
    dayLabel: string;
    hasRecord: boolean;
    records: BloodPressureRecord[];
    avgSys?: number;
    avgDia?: number;
}

interface CaregiverScreenProps {
    onResetRole?: () => void;
}

const MOOD_OPTIONS = ['平靜', '開心', '壓力大', '焦慮'] as const;
const BODY_STATUS_OPTIONS = ['無不適', '頭暈', '胸悶', '頭痛', '疲倦', '其他'] as const;

const toFiniteNumber = (value: unknown) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const parseRecordTimestamp = (value?: string | number | Date | null) => {
    if (!value) return 0;
    if (value instanceof Date) {
        const timestamp = value.getTime();
        return Number.isNaN(timestamp) ? 0 : timestamp;
    }
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

    const raw = String(value).trim();
    const directTimestamp = new Date(raw).getTime();
    if (!Number.isNaN(directTimestamp)) return directTimestamp;

    const normalized = raw
        .replace(/\//g, '-')
        .replace('上午', 'AM')
        .replace('下午', 'PM')
        .replace(/\s+/g, ' ');
    const normalizedTimestamp = new Date(normalized).getTime();
    if (!Number.isNaN(normalizedTimestamp)) return normalizedTimestamp;

    const match = raw.match(
        /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s*(上午|下午|AM|PM)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/i
    );
    if (!match) return 0;

    const [, year, month, day, meridiem, hourText, minuteText, secondText] = match;
    let hour = Number(hourText);
    const normalizedMeridiem = meridiem?.toUpperCase();
    if ((normalizedMeridiem === '下午' || normalizedMeridiem === 'PM') && hour < 12) hour += 12;
    if ((normalizedMeridiem === '上午' || normalizedMeridiem === 'AM') && hour === 12) hour = 0;

    const parsedDate = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        hour,
        Number(minuteText),
        Number(secondText || 0)
    );
    const timestamp = parsedDate.getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
};

const formatRecordDateTime = (value?: string | number | Date | null) => {
    const timestamp = parseRecordTimestamp(value);
    return timestamp ? new Date(timestamp).toLocaleString('zh-TW') : '尚無時間';
};

const formatRecordTime = (value?: string | number | Date | null) => {
    const timestamp = parseRecordTimestamp(value);
    return timestamp
        ? new Date(timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
        : '尚無時間';
};

const normalizeBloodPressureRecord = (record: any): BloodPressureRecord => ({
    ...record,
    sys: toFiniteNumber(record?.sys),
    dia: toFiniteNumber(record?.dia),
    pulse: toFiniteNumber(record?.pulse),
    time: record?.time || new Date().toISOString(),
    userId: record?.userId || '',
    role: record?.role || 'elderly'
});

const getRecordTimestamp = (record: BloodPressureRecord) => {
    return parseRecordTimestamp(record.time);
};

const getRecordDateKey = (record: BloodPressureRecord) => {
    const timestamp = getRecordTimestamp(record);
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getTodayKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const isAbnormalMeasurement = (record: BloodPressureRecord) =>
    record.sys >= 140 || record.dia >= 90 || record.sys < 90 || record.dia < 60 || record.pulse > 100 || (record.pulse > 0 && record.pulse < 50);

const getBpStatusLabel = (record: BloodPressureRecord) => {
    if (record.sys >= 180 || record.dia >= 120) return '危險高血壓';
    if (record.sys >= 140 || record.dia >= 90) return '血壓偏高';
    if (record.sys < 90 || record.dia < 60) return '血壓偏低';
    if (record.pulse > 100) return '脈搏偏快';
    if (record.pulse > 0 && record.pulse < 50) return '脈搏偏慢';
    return '正常';
};

const getLocalBpRecords = async (userId: string) => {
    const saved = await AsyncStorage.getItem(`bp_records_${userId}`);
    if (!saved) return [];

    try {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(normalizeBloodPressureRecord)
            .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
    } catch {
        return [];
    }
};

const buildSevenDayHistory = (records: BloodPressureRecord[]): SevenDayHistory[] => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(today);
        date.setDate(today.getDate() - index);
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const dayRecords = records.filter((record) => getRecordDateKey(record) === dateKey);
        const avgSys = dayRecords.length
            ? Math.round(dayRecords.reduce((sum, record) => sum + record.sys, 0) / dayRecords.length)
            : undefined;
        const avgDia = dayRecords.length
            ? Math.round(dayRecords.reduce((sum, record) => sum + record.dia, 0) / dayRecords.length)
            : undefined;

        return {
            date: dateKey,
            dayLabel: index === 0 ? '今天' : index === 1 ? '昨天' : date.toLocaleDateString('zh-TW', { weekday: 'short' }),
            hasRecord: dayRecords.length > 0,
            records: dayRecords,
            avgSys,
            avgDia
        };
    });
};

const saveLocalBpRecord = async (userId: string, record: BloodPressureRecord) => {
    const localRecords = await getLocalBpRecords(userId);
    const updated = [record, ...localRecords]
        .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
    await AsyncStorage.setItem(`bp_records_${userId}`, JSON.stringify(updated));
    return updated;
};

const isSameRecord = (a: BloodPressureRecord, b: BloodPressureRecord) =>
    Boolean((a._id && b._id && a._id === b._id) || (a.id && b.id && a.id === b.id) || (a.time && b.time && a.time === b.time));

const updateLocalBpRecord = async (userId: string, updatedRecord: BloodPressureRecord) => {
    const localRecords = await getLocalBpRecords(userId);
    const matched = localRecords.some((record) => isSameRecord(record, updatedRecord));
    const updated = (matched
        ? localRecords.map((record) => isSameRecord(record, updatedRecord) ? { ...record, ...updatedRecord } : record)
        : [updatedRecord, ...localRecords]
    ).sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
    await AsyncStorage.setItem(`bp_records_${userId}`, JSON.stringify(updated));
    return updated;
};

// ─── 主元件 ────────────────────────────────────────────────────────────
export const CaregiverScreen: React.FC<CaregiverScreenProps> = ({ onResetRole }) => {
    // ─── 狀態管理 ────
    const [todayMeasured, setTodayMeasured] = useState(false);
    const [todayData, setTodayData] = useState<BloodPressureRecord | null>(null);
    const [sevenDayHistory, setSevenDayHistory] = useState<SevenDayHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [elderlyCaregiverId, setElderlyCaregiverId] = useState<string>('');
    const [guideModalVisible, setGuideModalVisible] = useState(false);
    const [manualModalVisible, setManualModalVisible] = useState(false);
    const [careStatusModalVisible, setCareStatusModalVisible] = useState(false);
    const [syncProgress, setSyncProgress] = useState<string>('');
    const [dataNotice, setDataNotice] = useState<string>('');
    const [manualSys, setManualSys] = useState('');
    const [manualDia, setManualDia] = useState('');
    const [manualPulse, setManualPulse] = useState('');
    const [selectedMood, setSelectedMood] = useState<string>('平靜');
    const [selectedBodyStatus, setSelectedBodyStatus] = useState<string>('無不適');
    const [careNotes, setCareNotes] = useState('');
    const [dailyChecklist, setDailyChecklist] = useState<DailyChecklistItem[]>([
        { id: '1', title: '晨測血壓 06:00-12:00', completed: false, icon: '早' },
        { id: '2', title: '午測血壓 14:00-18:00', completed: false, icon: '午' },
        { id: '3', title: '晚測血壓 20:00-23:00', completed: false, icon: '晚' },
        { id: '4', title: '詢問情緒與身體狀況', completed: false, icon: '記' }
    ]);

    // ─── 根據今日所有測量數據更新檢核清單 ────
    const updateChecklistFromRecords = useCallback((records: BloodPressureRecord[]) => {
        const todayRecords = records.filter((record) => getRecordDateKey(record) === getTodayKey());
        const isTodayManualCompletion = (item: DailyChecklistItem) =>
            item.completed && Boolean(item.timestamp) && getRecordDateKey({
                sys: 0,
                dia: 0,
                pulse: 0,
                time: item.timestamp || '',
                userId: '',
                role: 'caregiver'
            }) === getTodayKey();
        const findRecordInHours = (start: number, end: number) =>
            todayRecords.find((record) => {
                const timestamp = getRecordTimestamp(record);
                if (!timestamp) return false;
                const hour = new Date(timestamp).getHours();
                return hour >= start && hour < end;
            });

        const morning = findRecordInHours(6, 12);
        const afternoon = findRecordInHours(14, 18);
        const evening = findRecordInHours(20, 24);

        setDailyChecklist((prev) =>
            prev.map((item) => {
                if (item.id === '1') return { ...item, completed: Boolean(morning) || isTodayManualCompletion(item), timestamp: morning?.time || item.timestamp };
                if (item.id === '2') return { ...item, completed: Boolean(afternoon) || isTodayManualCompletion(item), timestamp: afternoon?.time || item.timestamp };
                if (item.id === '3') return { ...item, completed: Boolean(evening) || isTodayManualCompletion(item), timestamp: evening?.time || item.timestamp };
                if (item.id === '4') return { ...item, completed: todayRecords.some((record) => Boolean(record.mood || record.notes)) || isTodayManualCompletion(item) };
                return item;
            })
        );
    }, []);

    // ─── 檢查今日是否已測量 ────
    const checkTodayMeasurement = useCallback(async (caregiverId: string) => {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/api/caregiver/today-status?userId=${encodeURIComponent(caregiverId)}`,
                { timeout: 5000 }
            );

            if (response.data.measuredToday && response.data.latestRecord) {
                const latestRecord = normalizeBloodPressureRecord(response.data.latestRecord);
                setTodayMeasured(true);
                setTodayData(latestRecord);
                setDataNotice('');
            } else {
                setTodayMeasured(false);
                setTodayData(null);
            }
        } catch (error) {
            console.warn('檢查今日測量狀態失敗，改用本機資料:', error);
            const localRecords = await getLocalBpRecords(caregiverId);
            const todayRecords = localRecords.filter((record) => getRecordDateKey(record) === getTodayKey());
            if (todayRecords.length > 0) {
                setTodayMeasured(true);
                setTodayData(todayRecords[0]);
                setDataNotice('後端今日狀態暫時無法連線，已改用此手機本機紀錄。');
                return;
            }
            setTodayMeasured(false);
            setTodayData(null);
            setDataNotice('尚未取得後端資料。若看護端與長輩端不同手機，請確認後端服務與配對碼。');
        }
    }, []);

    // ─── 擷取7天歷史 ────
    const fetchSevenDayHistory = useCallback(async (caregiverId: string) => {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/api/caregiver/seven-day-history?userId=${encodeURIComponent(caregiverId)}`,
                { timeout: 5000 }
            );

            const history = Array.isArray(response.data.history)
                ? response.data.history.map((day: SevenDayHistory) => ({
                    ...day,
                    records: Array.isArray(day.records) ? day.records.map(normalizeBloodPressureRecord) : []
                }))
                : [];
            setSevenDayHistory(history);
            updateChecklistFromRecords(history.flatMap((day: SevenDayHistory) => day.records));
        } catch (error) {
            console.warn('擷取7天歷史失敗，改用本機資料:', error);
            const localRecords = await getLocalBpRecords(caregiverId);
            const localHistory = buildSevenDayHistory(localRecords);
            setSevenDayHistory(localHistory);
            updateChecklistFromRecords(localRecords);
        }
    }, [updateChecklistFromRecords]);

    const initializeScreen = useCallback(async (showLoading = false) => {
        try {
            if (showLoading) setLoading(true);
            // 從 AsyncStorage 取得長輩 ID（您應該在登入時存儲此資訊）
            const elderlyId = await AsyncStorage.getItem('elderlyId');
            const fallbackId = await AsyncStorage.getItem('monitoredElderlyId');
            const caregiverId = elderlyId || fallbackId || 'elderly_001';
            setElderlyCaregiverId(caregiverId);

            // 擷取今日測量狀態
            await checkTodayMeasurement(caregiverId);
            // 擷取7天歷史
            await fetchSevenDayHistory(caregiverId);
        } catch (error) {
            console.warn('初始化 Caregiver Screen 失敗:', error);
        } finally {
            if (showLoading) setLoading(false);
        }
    }, [checkTodayMeasurement, fetchSevenDayHistory]);

    // ─── 初始化與數據擷取 ────
    useEffect(() => {
        initializeScreen(true);
        // 每60秒自動更新一次
        const interval = setInterval(() => initializeScreen(false), 60000);
        return () => clearInterval(interval);
    }, [initializeScreen]);

    // ─── 協助引導 - 觸發藍牙/Health Connect 同步 ────
    const handleGuideSync = async () => {
        try {
            setSyncing(true);
            setSyncProgress('正在連接OMRON血壓計...');

            // 模擬藍牙連接過程
            await new Promise<void>((resolve) => setTimeout(() => resolve(), 1500));
            setSyncProgress('正在讀取血壓計數據...');

            await new Promise<void>((resolve) => setTimeout(() => resolve(), 1500));
            setSyncProgress('正在同步至 Health Connect...');

            // 呼叫後端 API 觸發同步
            const response = await axios.post(
                `${API_BASE_URL}/api/caregiver/trigger-sync`,
                {
                    userId: elderlyCaregiverId,
                    role: 'caregiver',
                    guidedByCaregiver: true
                },
                { timeout: 10000 }
            );

            setSyncProgress('');
            setGuideModalVisible(false);

            if (response.data.success) {
                Alert.alert(
                    '✅ 同步成功',
                    `新血壓數據已同步：\n收縮壓: ${response.data.record.sys} mmHg\n舒張壓: ${response.data.record.dia} mmHg\n脈搏: ${response.data.record.pulse} bpm`,
                    [{ text: '確認', onPress: () => initializeScreen(false) }]
                );
            }
        } catch (error) {
            setSyncProgress('');
            setGuideModalVisible(false);
            Alert.alert(
                '❌ 同步失敗',
                '無法連接OMRON血壓計。請檢查:\n• 藍牙已開啟\n• 血壓計電源已開\n• 血壓計在設備附近',
                [{ text: '重試', onPress: handleGuideSync }, { text: '取消' }]
            );
            console.warn('同步失敗:', error);
        } finally {
            setSyncing(false);
        }
    };

    // ─── 手動記錄血壓 ────
    const handleManualEntry = () => {
        setManualSys('');
        setManualDia('');
        setManualPulse('');
        setSelectedMood(todayData?.mood && todayData.mood !== '未標記' ? todayData.mood : '平靜');
        setSelectedBodyStatus('無不適');
        setCareNotes('');
        setManualModalVisible(true);
    };

    const submitManualEntry = async () => {
        const sys = parseInt(manualSys.trim(), 10);
        const dia = parseInt(manualDia.trim(), 10);
        const pulse = parseInt(manualPulse.trim(), 10);

        if (!sys || !dia || !pulse || sys < 40 || dia < 30 || pulse < 30) {
            Alert.alert('格式錯誤', '請輸入有效的收縮壓、舒張壓與脈搏。');
            return;
        }

        const record: BloodPressureRecord = {
            sys,
            dia,
            pulse,
            mood: selectedMood,
            notes: selectedBodyStatus === '無不適' && !careNotes.trim()
                ? '身體狀況：無不適'
                : `身體狀況：${selectedBodyStatus}${careNotes.trim() ? `；備註：${careNotes.trim()}` : ''}`,
            time: new Date().toISOString(),
            userId: elderlyCaregiverId,
            role: 'caregiver',
            source: 'caregiver_guided'
        };

        try {
            const response = await axios.post(
                `${API_BASE_URL}/api/bp/manual-record`,
                {
                    userId: elderlyCaregiverId,
                    sys,
                    dia,
                    pulse,
                    mood: selectedMood,
                    notes: record.notes,
                    role: 'caregiver',
                    recordedBy: 'caregiver'
                },
                { timeout: 5000 }
            );
            const savedRecord = normalizeBloodPressureRecord(response.data?.record || response.data || record);
            await saveLocalBpRecord(elderlyCaregiverId, savedRecord);
            setManualModalVisible(false);
            Alert.alert('記錄成功', '血壓數據已保存。');
            await initializeScreen(false);
        } catch (error) {
            console.warn('手動記錄後端保存失敗，已保存到本機:', error);
            const updated = await saveLocalBpRecord(elderlyCaregiverId, record);
            setTodayMeasured(getRecordDateKey(record) === getTodayKey());
            setTodayData(record);
            setSevenDayHistory(buildSevenDayHistory(updated));
            updateChecklistFromRecords(updated);
            setDataNotice('後端暫時無法連線，這筆手動紀錄已先保存於此手機本機。');
            setManualModalVisible(false);
            Alert.alert('已先保存於本機', '後端恢復後請再同步資料。');
        }
    };

    const openCareStatusModal = () => {
        if (!todayData) {
            Alert.alert(
                '尚無今日血壓紀錄',
                '請先協助同步或手動補登今日血壓，再登記情緒與身體狀況。',
                [
                    { text: '取消' },
                    { text: '協助同步', onPress: () => setGuideModalVisible(true) },
                    { text: '手動補登', onPress: handleManualEntry }
                ]
            );
            return;
        }

        setSelectedMood(todayData.mood && todayData.mood !== '未標記' ? todayData.mood : '平靜');
        const existingNotes = todayData.notes || '';
        const matchedStatus = BODY_STATUS_OPTIONS.find((status) => existingNotes.includes(status));
        setSelectedBodyStatus(matchedStatus || '無不適');
        setCareNotes(existingNotes.replace(/^身體狀況：[^；]+；?備註：?/, '').replace(/^身體狀況：[^；]+$/, ''));
        setCareStatusModalVisible(true);
    };

    const submitCareStatus = async () => {
        if (!todayData) {
            setCareStatusModalVisible(false);
            return;
        }

        const notes = selectedBodyStatus === '無不適' && !careNotes.trim()
            ? '身體狀況：無不適'
            : `身體狀況：${selectedBodyStatus}${careNotes.trim() ? `；備註：${careNotes.trim()}` : ''}`;
        const updatedRecord: BloodPressureRecord = {
            ...todayData,
            mood: selectedMood,
            notes,
            userId: todayData.userId || elderlyCaregiverId
        };

        const updatedRecords = await updateLocalBpRecord(elderlyCaregiverId, updatedRecord);
        setTodayData(updatedRecord);
        setSevenDayHistory(buildSevenDayHistory(updatedRecords));
        updateChecklistFromRecords(updatedRecords);
        setCareStatusModalVisible(false);
        setDataNotice('看護已登記今日情緒與身體狀況。');

        try {
            await axios.post(`${API_BASE_URL}/api/bp`, updatedRecord, { timeout: 5000 });
        } catch (error) {
            console.warn('情緒與身體狀況已保存本機，後端同步暫時失敗:', error);
            setDataNotice('情緒與身體狀況已先保存於此手機本機，後端恢復後請再同步。');
        }
    };

    // ─── 重新整理 ────
    const handleRefresh = async () => {
        await initializeScreen(false);
    };

    const completedChecklistCount = dailyChecklist.filter((item) => item.completed).length;
    const totalRecordsSevenDays = sevenDayHistory.reduce((sum, day) => sum + day.records.length, 0);
    const abnormalRecordsSevenDays = sevenDayHistory
        .flatMap((day) => day.records)
        .filter(isAbnormalMeasurement);
    const latestStatusLabel = todayData ? getBpStatusLabel(todayData) : '尚無資料';
    const latestIsAbnormal = todayData ? isAbnormalMeasurement(todayData) : false;
    const statusColor = !todayData ? '#ad6800' : latestIsAbnormal ? '#cf1322' : '#237804';

    const showChecklistSummary = () => {
        const pendingItems = dailyChecklist.filter((item) => !item.completed);
        Alert.alert(
            '今日檢核狀態',
            pendingItems.length === 0
                ? '今日檢核項目都已完成。'
                : `已完成 ${completedChecklistCount}/4 項。\n待處理：${pendingItems.map((item) => item.title).join('、')}`
        );
    };

    const showSevenDaySummary = () => {
        Alert.alert(
            '近 7 天紀錄',
            `共有 ${totalRecordsSevenDays} 筆量測，其中 ${abnormalRecordsSevenDays.length} 筆需要追蹤。`
        );
    };

    const showAbnormalSummary = () => {
        if (abnormalRecordsSevenDays.length === 0) {
            Alert.alert('異常紀錄', '近 7 天目前沒有異常量測。');
            return;
        }

        const details = abnormalRecordsSevenDays
            .slice(0, 5)
            .map((record) => `${formatRecordDateTime(record.time)}  ${record.sys}/${record.dia}，脈搏 ${record.pulse}（${getBpStatusLabel(record)}）`)
            .join('\n');
        Alert.alert('異常紀錄', `${details}${abnormalRecordsSevenDays.length > 5 ? '\n...' : ''}`);
    };

    const handleChecklistItemPress = (item: DailyChecklistItem) => {
        if (item.id === '4') {
            openCareStatusModal();
            return;
        }

        if (item.completed) {
            Alert.alert('已完成', item.timestamp ? `${item.title}\n完成時間：${formatRecordDateTime(item.timestamp)}` : item.title);
            return;
        }

        Alert.alert(
            item.title,
            '請選擇要協助長輩完成量測的方式。',
            [
                { text: '取消' },
                { text: '協助同步', onPress: () => setGuideModalVisible(true) },
                { text: '手動補登', onPress: handleManualEntry }
            ]
        );
    };

    const handleHistoryDayPress = (day: SevenDayHistory) => {
        if (!day.hasRecord) {
            Alert.alert(day.dayLabel, '這一天沒有血壓紀錄。');
            return;
        }

        const detailText = day.records
            .map((record) => {
                const careText = `${record.mood ? `\n情緒：${record.mood}` : ''}${record.notes ? `\n${record.notes}` : ''}`;
                return `${formatRecordTime(record.time)}  ${record.sys}/${record.dia}，脈搏 ${record.pulse}（${getBpStatusLabel(record)}）${careText}`;
            })
            .join('\n');
        Alert.alert(`${day.dayLabel} ${day.date}`, detailText);
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color="#1890ff" style={{ marginTop: 50 }} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
            >
                {/* ─── 標題與更新按鈕 ────────────────────────────────────────────── */}
                <View style={styles.headerContainer}>
                    <View style={styles.headerTitleBlock}>
                        <Text style={styles.headerTitle}>看護每日照護工作台</Text>
                        <Text style={styles.headerSubtitle}>確認今日量測、協助同步與回報近 7 天狀態</Text>
                    </View>
                    <View style={styles.headerButtonGroup}>
                        {onResetRole && (
                            <TouchableOpacity
                                style={[styles.refreshButton, styles.resetButton]}
                                onPress={onResetRole}
                            >
                                <Text style={styles.refreshButtonText}>重新選擇身份</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[styles.refreshButton, styles.updateButton]}
                            onPress={handleRefresh}
                        >
                            <Text style={styles.refreshButtonText}>更新</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.connectionInfoCard}>
                    <Text style={styles.connectionInfoTitle}>目前照護對象</Text>
                    <Text style={styles.connectionInfoText}>配對碼：{elderlyCaregiverId || '尚未取得'}</Text>
                    <Text style={styles.connectionInfoText}>後端位址：{API_BASE_URL}</Text>
                    {dataNotice ? (
                        <Text style={styles.connectionNoticeText}>{dataNotice}</Text>
                    ) : (
                        <Text style={styles.connectionOkText}>已使用配對碼查詢今日狀態與近 7 天紀錄。</Text>
                    )}
                </View>

                {/* ─── 今日測量狀態卡片（黃色警告/綠色完成） ────────────────────────── */}
                <View
                    style={[
                        styles.todayStatusCard,
                        todayMeasured ? styles.cardGreen : styles.cardYellow
                    ]}
                >
                    <View style={{ flex: 1 }}>
                        <View style={styles.statusHeaderRow}>
                            <View>
                                <Text style={styles.sectionEyebrow}>今日照護狀態</Text>
                                <Text style={styles.statusTitle}>
                                    {todayMeasured ? '今日已有血壓紀錄' : '今日尚未看到量測'}
                                </Text>
                            </View>
                            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                                <Text style={styles.statusBadgeText}>{latestStatusLabel}</Text>
                            </View>
                        </View>
                        <Text style={styles.statusDescription}>
                            {todayMeasured
                                ? '請確認數值是否異常，必要時協助複測並通知家屬。'
                                : '請協助長輩完成量測，可使用同步或手動記錄。'}
                        </Text>

                        {todayData && (
                            <View style={styles.todayDataPreview}>
                                <Text style={styles.previewLabel}>最新數據</Text>
                                <Text style={styles.previewValue}>
                                    {todayData.sys}/{todayData.dia} mmHg • {todayData.pulse} bpm
                                </Text>
                                <Text style={styles.previewTime}>
                                    {formatRecordDateTime(todayData.time)}
                                </Text>
                                {(todayData.mood || todayData.notes) && (
                                    <Text style={styles.previewCareText}>
                                        {todayData.mood ? `情緒：${todayData.mood}` : ''}
                                        {todayData.notes ? `${todayData.mood ? '，' : ''}${todayData.notes}` : ''}
                                    </Text>
                                )}
                            </View>
                        )}
                    </View>
                </View>

                <View style={styles.summaryGrid}>
                    <TouchableOpacity style={styles.summaryCard} onPress={showChecklistSummary} activeOpacity={0.8}>
                        <Text style={styles.summaryLabel}>今日檢核</Text>
                        <Text style={styles.summaryValue}>{completedChecklistCount}/4</Text>
                        <Text style={styles.summaryUnit}>項完成</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.summaryCard} onPress={showSevenDaySummary} activeOpacity={0.8}>
                        <Text style={styles.summaryLabel}>近 7 天紀錄</Text>
                        <Text style={styles.summaryValue}>{totalRecordsSevenDays}</Text>
                        <Text style={styles.summaryUnit}>筆量測</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.summaryCard, abnormalRecordsSevenDays.length > 0 && styles.summaryCardWarning]}
                        onPress={showAbnormalSummary}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.summaryLabel}>異常紀錄</Text>
                        <Text style={[styles.summaryValue, abnormalRecordsSevenDays.length > 0 && { color: '#cf1322' }]}>
                            {abnormalRecordsSevenDays.length}
                        </Text>
                        <Text style={styles.summaryUnit}>筆需追蹤</Text>
                    </TouchableOpacity>
                </View>

                {/* ─── 協助引導按鈕區塊 ────────────────────────────────────────────── */}
                <View style={styles.actionButtonsContainer}>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.primaryButton]}
                        onPress={() => setGuideModalVisible(true)}
                    >
                        <View style={{ flex: 1 }}>
                            <Text style={styles.primaryActionButtonTitle}>協助引導同步</Text>
                            <Text style={styles.primaryActionButtonSubtitle}>協助長輩從裝置同步資料</Text>
                        </View>
                        <Text style={styles.primaryActionButtonArrow}>→</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, styles.secondaryButton]}
                        onPress={handleManualEntry}
                    >
                        <View style={{ flex: 1 }}>
                            <Text style={styles.actionButtonTitle}>手動記錄</Text>
                            <Text style={styles.actionButtonSubtitle}>網路或同步失敗時先補登</Text>
                        </View>
                        <Text style={styles.actionButtonArrow}>→</Text>
                    </TouchableOpacity>
                </View>

                {/* ─── 每日檢核清單 ────────────────────────────────────────────────── */}
                <View style={styles.checklistContainer}>
                    <Text style={styles.sectionEyebrow}>每日工作</Text>
                    <Text style={styles.checklistTitle}>今日檢核清單</Text>
                    <View style={styles.checklistItems}>
                        {dailyChecklist.map((item) => (
                            <TouchableOpacity
                                key={item.id}
                                style={[
                                    styles.checklistItem,
                                    item.completed && styles.checklistItemCompleted
                                ]}
                                onPress={() => handleChecklistItemPress(item)}
                                activeOpacity={0.8}
                            >
                                <View style={styles.checklistIconContainer}>
                                    <Text style={styles.checklistItemIcon}>{item.icon}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.checklistItemTitle}>{item.title}</Text>
                                    {item.timestamp && (
                                        <Text style={styles.checklistItemTime}>
                                            完成於 {formatRecordTime(item.timestamp)}
                                        </Text>
                                    )}
                                </View>
                                <View
                                    style={[
                                        styles.checklistCheckbox,
                                        item.completed && styles.checklistCheckboxCompleted
                                    ]}
                                >
                                    {item.completed && (
                                        <Text style={styles.checklistCheckmark}>✓</Text>
                                    )}
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* ─── 7天歷史摘要 ────────────────────────────────────────────────── */}
                <View style={styles.historyContainer}>
                    <Text style={styles.sectionEyebrow}>照護回報</Text>
                    <Text style={styles.historyTitle}>近 7 天血壓摘要</Text>
                    <View style={styles.historyList}>
                        {sevenDayHistory.slice(0, 7).map((day) => (
                            <TouchableOpacity
                                key={day.date}
                                style={styles.historyDay}
                                onPress={() => handleHistoryDayPress(day)}
                                activeOpacity={0.8}
                            >
                                <View style={styles.dayHeaderContainer}>
                                    <View>
                                        <Text style={styles.dayLabel}>{day.dayLabel}</Text>
                                        <Text style={styles.dayDate}>{day.date}</Text>
                                    </View>
                                    {day.hasRecord && (
                                        <View style={styles.recordBadge}>
                                            <Text style={styles.recordCount}>{day.records.length} 筆</Text>
                                        </View>
                                    )}
                                    {!day.hasRecord && (
                                        <View style={styles.noRecordBadge}>
                                            <Text style={styles.noRecordText}>未測</Text>
                                        </View>
                                    )}
                                </View>

                                {day.hasRecord && (
                                    <View style={styles.dayDataContainer}>
                                        {day.records.map((record, idx) => {
                                            const isAbnormal = isAbnormalMeasurement(record);
                                            return (
                                            <View key={idx} style={[styles.recordItem, isAbnormal && styles.recordItemAbnormal]}>
                                                <Text style={styles.recordTime}>
                                                    {formatRecordTime(record.time)}
                                                </Text>
                                                <View style={styles.recordBP}>
                                                    <Text style={styles.recordBPValue}>{record.sys}</Text>
                                                    <Text style={styles.recordBPSlash}>/</Text>
                                                    <Text style={styles.recordBPValue}>{record.dia}</Text>
                                                    <Text style={styles.recordBPPulse}>({record.pulse})</Text>
                                                </View>
                                                {record.mood && (
                                                    <Text style={styles.recordMood}>{record.mood}</Text>
                                                )}
                                                {record.notes && (
                                                    <Text style={styles.recordMood}>已登記</Text>
                                                )}
                                            </View>
                                        );})}

                                        {day.avgSys !== undefined && (
                                            <View style={styles.dayAverageContainer}>
                                                <Text style={styles.dayAverageLabel}>平均：</Text>
                                                <Text style={styles.dayAverageValue}>
                                                    {day.avgSys}/{day.avgDia}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* ─── 提示與注意事項 ────────────────────────────────────────────── */}
                <View style={styles.tipsContainer}>
                    <Text style={styles.sectionEyebrow}>工作原則</Text>
                    <Text style={styles.tipsTitle}>看護回報重點</Text>
                    <View style={styles.tipsList}>
                        <View style={styles.tipItem}>
                            <Text style={styles.tipBullet}>1</Text>
                            <Text style={styles.tipText}>
                                建議每天在相同時間測量血壓（早、午、晚各一次）
                            </Text>
                        </View>
                        <View style={styles.tipItem}>
                            <Text style={styles.tipBullet}>2</Text>
                            <Text style={styles.tipText}>
                                測量前請讓長輩休息 5 分鐘，取坐姿並放鬆
                            </Text>
                        </View>
                        <View style={styles.tipItem}>
                            <Text style={styles.tipBullet}>3</Text>
                            <Text style={styles.tipText}>
                                記錄時同時詢問情緒狀況（開心/平靜/壓力大/焦慮）
                            </Text>
                        </View>
                        <View style={styles.tipItem}>
                            <Text style={styles.tipBullet}>4</Text>
                            <Text style={styles.tipText}>
                                如測值異常（收縮壓 ≥140 或 &lt;90），應立即告知家屬
                            </Text>
                        </View>
                        <View style={styles.tipItem}>
                            <Text style={styles.tipBullet}>5</Text>
                            <Text style={styles.tipText}>
                                每週向家屬匯報一次，可使用此介面的7天摘要作為報告
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>

            <Modal
                visible={manualModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setManualModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHandle} />
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.sectionEyebrow}>手動補登</Text>
                                <Text style={styles.modalTitle}>記錄血壓數據</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.closePill}
                                onPress={() => setManualModalVisible(false)}
                            >
                                <Text style={styles.closePillText}>關閉</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.manualForm}>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>收縮壓</Text>
                                <TextInput
                                    style={styles.manualInput}
                                    value={manualSys}
                                    onChangeText={setManualSys}
                                    keyboardType="number-pad"
                                    placeholder="例如 120"
                                    placeholderTextColor="#8c8c8c"
                                />
                            </View>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>舒張壓</Text>
                                <TextInput
                                    style={styles.manualInput}
                                    value={manualDia}
                                    onChangeText={setManualDia}
                                    keyboardType="number-pad"
                                    placeholder="例如 80"
                                    placeholderTextColor="#8c8c8c"
                                />
                            </View>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>脈搏</Text>
                                <TextInput
                                    style={styles.manualInput}
                                    value={manualPulse}
                                    onChangeText={setManualPulse}
                                    keyboardType="number-pad"
                                    placeholder="例如 70"
                                    placeholderTextColor="#8c8c8c"
                                />
                            </View>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>情緒狀態</Text>
                                <View style={styles.optionGrid}>
                                    {MOOD_OPTIONS.map((mood) => (
                                        <TouchableOpacity
                                            key={mood}
                                            style={[styles.optionChip, selectedMood === mood && styles.optionChipSelected]}
                                            onPress={() => setSelectedMood(mood)}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={[styles.optionChipText, selectedMood === mood && styles.optionChipTextSelected]}>{mood}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>身體狀況</Text>
                                <View style={styles.optionGrid}>
                                    {BODY_STATUS_OPTIONS.map((status) => (
                                        <TouchableOpacity
                                            key={status}
                                            style={[styles.optionChip, selectedBodyStatus === status && styles.optionChipSelected]}
                                            onPress={() => setSelectedBodyStatus(status)}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={[styles.optionChipText, selectedBodyStatus === status && styles.optionChipTextSelected]}>{status}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>補充備註</Text>
                                <TextInput
                                    style={[styles.manualInput, styles.notesInput]}
                                    value={careNotes}
                                    onChangeText={setCareNotes}
                                    placeholder="例如：飯後頭暈、睡眠不足、已通知家屬"
                                    placeholderTextColor="#8c8c8c"
                                    multiline
                                />
                            </View>
                        </View>

                        <View style={styles.modalFooter}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonCancel]}
                                onPress={() => setManualModalVisible(false)}
                            >
                                <Text style={styles.modalButtonText}>取消</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonPrimary]}
                                onPress={submitManualEntry}
                            >
                                <Text style={[styles.modalButtonText, styles.modalButtonPrimaryText]}>保存</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={careStatusModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setCareStatusModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHandle} />
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.sectionEyebrow}>照護紀錄</Text>
                                <Text style={styles.modalTitle}>情緒與身體狀況</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.closePill}
                                onPress={() => setCareStatusModalVisible(false)}
                            >
                                <Text style={styles.closePillText}>關閉</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.manualForm}>
                            {todayData && (
                                <View style={styles.todayDataPreview}>
                                    <Text style={styles.previewLabel}>今日最新血壓</Text>
                                    <Text style={styles.previewValue}>
                                        {todayData.sys}/{todayData.dia} mmHg • {todayData.pulse} bpm
                                    </Text>
                                    <Text style={styles.previewTime}>{formatRecordDateTime(todayData.time)}</Text>
                                </View>
                            )}
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>情緒狀態</Text>
                                <View style={styles.optionGrid}>
                                    {MOOD_OPTIONS.map((mood) => (
                                        <TouchableOpacity
                                            key={mood}
                                            style={[styles.optionChip, selectedMood === mood && styles.optionChipSelected]}
                                            onPress={() => setSelectedMood(mood)}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={[styles.optionChipText, selectedMood === mood && styles.optionChipTextSelected]}>{mood}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>身體狀況</Text>
                                <View style={styles.optionGrid}>
                                    {BODY_STATUS_OPTIONS.map((status) => (
                                        <TouchableOpacity
                                            key={status}
                                            style={[styles.optionChip, selectedBodyStatus === status && styles.optionChipSelected]}
                                            onPress={() => setSelectedBodyStatus(status)}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={[styles.optionChipText, selectedBodyStatus === status && styles.optionChipTextSelected]}>{status}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>補充備註</Text>
                                <TextInput
                                    style={[styles.manualInput, styles.notesInput]}
                                    value={careNotes}
                                    onChangeText={setCareNotes}
                                    placeholder="例如：頭暈 10 分鐘、已喝水休息、已通知家屬"
                                    placeholderTextColor="#8c8c8c"
                                    multiline
                                />
                            </View>
                        </View>

                        <View style={styles.modalFooter}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonCancel]}
                                onPress={() => setCareStatusModalVisible(false)}
                            >
                                <Text style={styles.modalButtonText}>取消</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonPrimary]}
                                onPress={submitCareStatus}
                            >
                                <Text style={[styles.modalButtonText, styles.modalButtonPrimaryText]}>保存</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ─── 協助引導模態框 ────────────────────────────────────────────────── */}
            <Modal
                visible={guideModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setGuideModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHandle} />
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.sectionEyebrow}>協助同步</Text>
                                <Text style={styles.modalTitle}>引導裝置同步</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.closePill}
                                onPress={() => setGuideModalVisible(false)}
                                disabled={syncing}
                            >
                                <Text style={styles.closePillText}>關閉</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.modalBody}>
                            <Text style={styles.stepTitle}>準備步驟：</Text>

                            <View style={styles.stepItem}>
                                <Text style={styles.stepNumber}>1</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.stepText}>確保長輩的 OMRON 血壓計已開啟電源</Text>
                                </View>
                            </View>

                            <View style={styles.stepItem}>
                                <Text style={styles.stepNumber}>2</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.stepText}>確保此手機的藍牙已開啟</Text>
                                </View>
                            </View>

                            <View style={styles.stepItem}>
                                <Text style={styles.stepNumber}>3</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.stepText}>OMRON 血壓計應在手機 10 公尺以內</Text>
                                </View>
                            </View>

                            <View style={styles.stepItem}>
                                <Text style={styles.stepNumber}>4</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.stepText}>點擊下方「開始同步」按鈕</Text>
                                </View>
                            </View>

                            {syncProgress && (
                                <View style={styles.progressContainer}>
                                    <Text style={styles.progressText}>{syncProgress}</Text>
                                    <View style={styles.spinner} />
                                </View>
                            )}
                        </ScrollView>

                        <View style={styles.modalFooter}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonCancel]}
                                onPress={() => setGuideModalVisible(false)}
                                disabled={syncing}
                            >
                                <Text style={styles.modalButtonText}>取消</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonPrimary, syncing && { opacity: 0.6 }]}
                                onPress={handleGuideSync}
                                disabled={syncing}
                            >
                                <Text style={[styles.modalButtonText, styles.modalButtonPrimaryText]}>
                                    {syncing ? '同步中...' : '開始同步'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

// ─── 樣式定義 ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f6f8fb'
    },
    scrollContent: {
        paddingBottom: Platform.OS === 'ios' ? 32 : 16
    },
    headerContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginTop: 8
    },
    headerTitleBlock: {
        marginBottom: 10
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#262626',
        lineHeight: 28
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#4f6473',
        fontWeight: '700',
        marginTop: 3,
        lineHeight: 18
    },
    refreshButton: {
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#154360',
        borderRadius: 8
    },
    refreshButtonText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '800',
        textAlign: 'center'
    },
    headerButtonGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    resetButton: {
        backgroundColor: '#8c8c8c',
        flex: 1.35
    },
    updateButton: {
        flex: 0.75
    },
    connectionInfoCard: {
        marginHorizontal: 12,
        marginVertical: 8,
        backgroundColor: '#f6f8fb',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#d7e0e7'
    },
    connectionInfoTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#154360',
        marginBottom: 6
    },
    connectionInfoText: {
        fontSize: 12,
        color: '#4f6473',
        marginBottom: 3
    },
    connectionNoticeText: {
        fontSize: 12,
        color: '#ad6800',
        lineHeight: 18,
        marginTop: 6
    },
    connectionOkText: {
        fontSize: 12,
        color: '#237804',
        marginTop: 6
    },
    todayStatusCard: {
        marginHorizontal: 12,
        marginVertical: 12,
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3
    },
    cardYellow: {
        backgroundColor: '#fffbe6',
        borderLeftColor: '#faad14',
        borderLeftWidth: 5
    },
    cardGreen: {
        backgroundColor: '#f6ffed',
        borderLeftColor: '#52c41a',
        borderLeftWidth: 5
    },
    statusHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 8
    },
    sectionEyebrow: {
        fontSize: 12,
        fontWeight: '800',
        color: '#154360',
        marginBottom: 4
    },
    statusTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#262626',
        lineHeight: 22
    },
    statusBadge: {
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        flexShrink: 0
    },
    statusBadgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '800'
    },
    statusDescription: {
        fontSize: 13,
        color: '#595959',
        lineHeight: 19,
        marginBottom: 12
    },
    todayDataPreview: {
        backgroundColor: 'rgba(255, 255, 255, 0.6)',
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 10
    },
    previewLabel: {
        fontSize: 11,
        color: '#8c8c8c',
        marginBottom: 2
    },
    previewValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1890ff',
        marginBottom: 2
    },
    previewTime: {
        fontSize: 10,
        color: '#8c8c8c'
    },
    previewCareText: {
        fontSize: 12,
        color: '#4f6473',
        fontWeight: '700',
        lineHeight: 18,
        marginTop: 6
    },
    summaryGrid: {
        flexDirection: 'row',
        marginHorizontal: 12,
        marginVertical: 8,
        gap: 8
    },
    summaryCard: {
        flex: 1,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#edf1f4',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 12,
        alignItems: 'center'
    },
    summaryCardWarning: {
        backgroundColor: '#fff7f0',
        borderColor: '#ffbb96'
    },
    summaryLabel: {
        fontSize: 11,
        color: '#4f6473',
        fontWeight: '800',
        marginBottom: 6,
        textAlign: 'center'
    },
    summaryValue: {
        fontSize: 20,
        color: '#1890ff',
        fontWeight: '800'
    },
    summaryUnit: {
        fontSize: 10,
        color: '#8c8c8c',
        marginTop: 2,
        textAlign: 'center'
    },
    actionButtonsContainer: {
        marginHorizontal: 12,
        marginVertical: 12,
        gap: 10
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
        elevation: 2
    },
    primaryButton: {
        backgroundColor: '#154360',
    },
    secondaryButton: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#d9d9d9'
    },
    actionButtonTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#262626'
    },
    primaryActionButtonTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#fff'
    },
    actionButtonSubtitle: {
        fontSize: 12,
        color: '#8c8c8c',
        marginTop: 2
    },
    primaryActionButtonSubtitle: {
        fontSize: 12,
        color: '#d7e0e7',
        marginTop: 2
    },
    actionButtonArrow: {
        fontSize: 18,
        color: '#1890ff'
    },
    primaryActionButtonArrow: {
        fontSize: 18,
        color: '#fff'
    },
    checklistContainer: {
        marginHorizontal: 12,
        marginVertical: 12,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3
    },
    checklistTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#262626',
        marginBottom: 12
    },
    checklistItems: {
        gap: 10
    },
    checklistItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#fafafa',
        borderRadius: 8,
        borderLeftWidth: 4,
        borderLeftColor: '#d9d9d9'
    },
    checklistItemCompleted: {
        backgroundColor: '#f6ffed',
        borderLeftColor: '#52c41a'
    },
    checklistIconContainer: {
        fontSize: 20,
        width: 30,
        justifyContent: 'center',
        alignItems: 'center'
    },
    checklistItemIcon: {
        fontSize: 20
    },
    checklistItemTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#262626'
    },
    checklistItemTime: {
        fontSize: 11,
        color: '#52c41a',
        marginTop: 2
    },
    checklistCheckbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#d9d9d9',
        justifyContent: 'center',
        alignItems: 'center'
    },
    checklistCheckboxCompleted: {
        backgroundColor: '#52c41a',
        borderColor: '#52c41a'
    },
    checklistCheckmark: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700'
    },
    historyContainer: {
        marginHorizontal: 12,
        marginVertical: 12,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3
    },
    historyTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#262626',
        marginBottom: 12
    },
    historyList: {
        gap: 12
    },
    historyDay: {
        borderWidth: 1,
        borderColor: '#f0f0f0',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#fafafa'
    },
    dayHeaderContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        paddingHorizontal: 0
    },
    dayLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#262626'
    },
    dayDate: {
        fontSize: 11,
        color: '#8c8c8c',
        marginTop: 2
    },
    recordBadge: {
        backgroundColor: '#e6f7ff',
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 4
    },
    recordCount: {
        fontSize: 11,
        fontWeight: '600',
        color: '#1890ff'
    },
    noRecordBadge: {
        backgroundColor: '#fff7e6',
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 4
    },
    noRecordText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#faad14'
    },
    dayDataContainer: {
        gap: 8
    },
    recordItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 6
    },
    recordItemAbnormal: {
        backgroundColor: '#fff1f0',
        borderWidth: 1,
        borderColor: '#ffccc7'
    },
    recordTime: {
        fontSize: 11,
        color: '#8c8c8c',
        width: 40
    },
    recordBP: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 2,
        flex: 1
    },
    recordBPValue: {
        fontSize: 12,
        fontWeight: '600',
        color: '#262626'
    },
    recordBPSlash: {
        fontSize: 12,
        color: '#d9d9d9'
    },
    recordBPPulse: {
        fontSize: 10,
        color: '#8c8c8c',
        marginLeft: 4
    },
    recordMood: {
        fontSize: 10,
        color: '#8c8c8c',
        fontStyle: 'italic'
    },
    dayAverageContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        paddingHorizontal: 0,
        borderTopWidth: 1,
        borderTopColor: '#e8e8e8',
        paddingVertical: 6
    },
    dayAverageLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#8c8c8c',
        marginRight: 4
    },
    dayAverageValue: {
        fontSize: 12,
        fontWeight: '600',
        color: '#1890ff'
    },
    tipsContainer: {
        marginHorizontal: 12,
        marginVertical: 12,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3
    },
    tipsTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#262626',
        marginBottom: 12
    },
    tipsList: {
        gap: 10
    },
    tipItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10
    },
    tipBullet: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#1890ff',
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
        textAlign: 'center',
        lineHeight: 24,
        flexShrink: 0
    },
    tipText: {
        flex: 1,
        fontSize: 12,
        color: '#595959',
        lineHeight: 18
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end'
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: '82%',
        paddingTop: 8
    },
    modalHandle: {
        alignSelf: 'center',
        width: 44,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#c7d0d8',
        marginBottom: 8
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0'
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#262626'
    },
    closePill: {
        backgroundColor: '#f0f3f6',
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 9
    },
    closePillText: {
        color: '#154360',
        fontSize: 13,
        fontWeight: '800'
    },
    modalBody: {
        paddingHorizontal: 16,
        paddingVertical: 16
    },
    stepTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#262626',
        marginBottom: 12
    },
    stepItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#f5f5f5',
        borderRadius: 8
    },
    stepNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#154360',
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
        textAlign: 'center',
        lineHeight: 28,
        flexShrink: 0
    },
    stepText: {
        flex: 1,
        fontSize: 13,
        color: '#262626',
        lineHeight: 18
    },
    progressContainer: {
        alignItems: 'center',
        paddingVertical: 24
    },
    progressText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1890ff',
        marginBottom: 12
    },
    spinner: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 4,
        borderColor: '#f0f0f0',
        borderTopColor: '#1890ff'
    },
    modalFooter: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0'
    },
    modalButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center'
    },
    modalButtonCancel: {
        backgroundColor: '#f5f5f5',
        borderWidth: 1,
        borderColor: '#d9d9d9'
    },
    modalButtonPrimary: {
        backgroundColor: '#154360'
    },
    modalButtonText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#262626'
    },
    modalButtonPrimaryText: {
        color: '#fff'
    },
    manualForm: {
        paddingHorizontal: 16,
        paddingVertical: 16,
        gap: 12
    },
    inputGroup: {
        gap: 6
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '800',
        color: '#154360'
    },
    manualInput: {
        backgroundColor: '#f6f8fb',
        borderWidth: 1,
        borderColor: '#d7e0e7',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 16,
        color: '#262626',
        fontWeight: '700'
    },
    notesInput: {
        minHeight: 76,
        textAlignVertical: 'top',
        lineHeight: 21
    },
    optionGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8
    },
    optionChip: {
        minWidth: '30%',
        flexGrow: 1,
        backgroundColor: '#f6f8fb',
        borderWidth: 1,
        borderColor: '#d7e0e7',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 10,
        alignItems: 'center'
    },
    optionChipSelected: {
        backgroundColor: '#e6f7ff',
        borderColor: '#1890ff'
    },
    optionChipText: {
        fontSize: 13,
        color: '#4f6473',
        fontWeight: '800'
    },
    optionChipTextSelected: {
        color: '#0050b3'
    }
});

export default CaregiverScreen;
