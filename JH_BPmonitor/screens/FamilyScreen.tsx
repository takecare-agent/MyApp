/* eslint-disable react-native/no-inline-styles */
/**
 * 家屬端介面 (Family Screen)
 * 核心功能：遠端監控長輩血壓健康，大數據視覺化，異常警報提示
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    StyleSheet, Text, View, TouchableOpacity, ScrollView,
    Dimensions, ActivityIndicator, SafeAreaView, Modal, Platform
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../src/config/api';

const { width: screenWidth } = Dimensions.get('window');
const MONITORING_PERIOD: '3m' = '3m';

// ─── 型別定義 ────────────────────────────────────────────────────────────
interface BloodPressureRecord {
    _id?: string;
    sys: number;
    dia: number;
    pulse: number;
    mood?: string;
    source?: string;
    status?: string;
    time: string;
    userId: string;
    role: string;
}

interface AlertNotification {
    visible: boolean;
    message: string;
    level: 'danger' | 'warning' | 'normal';
}

interface FamilyScreenProps {
    onResetRole?: () => void;
}

interface StatisticsData {
    period: '3m' | '6m';
    avgSystolic: number;
    avgDiastolic: number;
    maxSystolic: number;
    minSystolic: number;
    highBPDays: number;
    totalDays: number;
    totalMeasurements: number;
    abnormalMeasurements: number;
    trendData: DailyTrendData[];
}

interface DailyTrendData {
    label: string;
    avgSys: number;
    avgDia: number;
    count?: number;
}

// ─── 血壓狀態判定邏輯 ────────────────────────────────────────────────────
const getBpStatus = (sys: number, dia: number) => {
    if (sys >= 180 || dia >= 120) {
        return { level: 'danger', label: '危險高血壓', color: '#cf1322', backgroundColor: '#fff1f0', borderColor: '#cf1322', recommendation: '請立即聯絡家屬並評估就醫' };
    }
    if (sys > 140 || dia >= 90) {
        return { level: 'danger', label: '高血壓警戒', color: '#cf1322', backgroundColor: '#fff1f0', borderColor: '#cf1322', recommendation: '請儘快確認長輩狀況並安排複測' };
    }
    if (sys >= 130 && sys < 140 && dia >= 80 && dia < 90) {
        return { level: 'warning', label: '血壓前期', color: '#ad6800', backgroundColor: '#fffbe6', borderColor: '#faad14', recommendation: '建議增加監測頻率並留意飲食作息' };
    }
    if (sys >= 120 && sys < 130 && dia < 80) {
        return { level: 'warning', label: '偏高', color: '#ad6800', backgroundColor: '#fffbe6', borderColor: '#faad14', recommendation: '請持續觀察近期趨勢' };
    }
    if ((sys >= 90 && sys < 120) && (dia >= 60 && dia < 80)) {
        return { level: 'normal', label: '正常', color: '#237804', backgroundColor: '#f6ffed', borderColor: '#52c41a', recommendation: '目前狀態穩定，請保持規律測量' };
    }
    if (sys < 90 || dia < 60) {
        return { level: 'warning', label: '血壓偏低', color: '#ad6800', backgroundColor: '#fffbe6', borderColor: '#faad14', recommendation: '請確認是否頭暈、無力，必要時聯絡醫師' };
    }
    return { level: 'warning', label: '需複測', color: '#ad6800', backgroundColor: '#fffbe6', borderColor: '#faad14', recommendation: '請再次測量確認數值' };
};

const getPulseStatus = (pulse: number) => {
    if (pulse > 100) return { label: '脈搏偏快', color: '#cf1322' };
    if (pulse > 0 && pulse < 50) return { label: '脈搏偏慢', color: '#cf1322' };
    return { label: '脈搏正常', color: '#237804' };
};

const getSourceLabel = (source?: string) => {
    if (source === 'health_connect') return 'Health Connect 同步';
    if (source === 'omron_bluetooth') return 'OMRON 藍牙同步';
    if (source === 'caregiver_guided') return '看護協助同步';
    if (source === 'manual') return '手動輸入';
    return 'OMRON / Health Connect 同步';
};

const toFiniteNumber = (value: unknown) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const getPulseValue = (record: any) =>
    toFiniteNumber(record?.pulse ?? record?.heartRate ?? record?.bpm ?? record?.pulseRate);

const hasPulseData = (pulse: number) => pulse > 0;

const formatPulseValue = (pulse: number) => hasPulseData(pulse) ? String(pulse) : '未取得';

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

const formatMeasurementTime = (value?: string | number | Date | null) => {
    const timestamp = parseRecordTimestamp(value);
    if (!timestamp) return '尚無可讀時間';
    return new Date(timestamp).toLocaleString('zh-TW');
};

const normalizeBloodPressureRecord = (record: any): BloodPressureRecord => ({
    ...record,
    sys: toFiniteNumber(record?.sys),
    dia: toFiniteNumber(record?.dia),
    pulse: getPulseValue(record),
    time: record?.time || new Date().toISOString(),
    userId: record?.userId || '',
    role: record?.role || 'elderly'
});

const isAbnormalMeasurement = (sys: number, dia: number, pulse = 0) =>
    sys >= 140 || dia >= 90 || sys < 90 || dia < 60 || pulse > 100 || (pulse > 0 && pulse < 50);

const getRecordTimestamp = (record: BloodPressureRecord) => {
    return parseRecordTimestamp(record.time);
};

const getRecordDateKey = (record: BloodPressureRecord) => {
    const timestamp = getRecordTimestamp(record);
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

const buildLocalStatistics = (records: BloodPressureRecord[], period: '3m' | '6m'): StatisticsData => {
    const daysBack = period === '3m' ? 90 : 180;
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    const periodRecords = records.filter((record) => getRecordTimestamp(record) >= cutoff);
    const grouped = periodRecords.reduce<Record<string, { sys: number[]; dia: number[] }>>((acc, record) => {
        const dateKey = getRecordDateKey(record);
        if (!dateKey || !record.sys || !record.dia) return acc;
        if (!acc[dateKey]) acc[dateKey] = { sys: [], dia: [] };
        acc[dateKey].sys.push(record.sys);
        acc[dateKey].dia.push(record.dia);
        return acc;
    }, {});

    const trendData = Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateKey, values]) => {
            const [, month, day] = dateKey.split('-');
            return {
                label: `${Number(month)}/${Number(day)}`,
                avgSys: Math.round(values.sys.reduce((sum, value) => sum + value, 0) / values.sys.length),
                avgDia: Math.round(values.dia.reduce((sum, value) => sum + value, 0) / values.dia.length),
                count: values.sys.length
            };
        });

    const sysValues = periodRecords.map((record) => record.sys).filter((value) => value > 0);
    const diaValues = periodRecords.map((record) => record.dia).filter((value) => value > 0);
    const abnormalMeasurements = periodRecords.filter((record) =>
        isAbnormalMeasurement(record.sys, record.dia, record.pulse)
    ).length;

    return {
        period,
        avgSystolic: sysValues.length ? Math.round(sysValues.reduce((sum, value) => sum + value, 0) / sysValues.length) : 0,
        avgDiastolic: diaValues.length ? Math.round(diaValues.reduce((sum, value) => sum + value, 0) / diaValues.length) : 0,
        maxSystolic: sysValues.length ? Math.max(...sysValues) : 0,
        minSystolic: sysValues.length ? Math.min(...sysValues) : 0,
        highBPDays: trendData.filter((day) => isAbnormalMeasurement(day.avgSys, day.avgDia)).length,
        totalDays: trendData.length,
        totalMeasurements: periodRecords.length,
        abnormalMeasurements,
        trendData
    };
};

const normalizeTrendPoint = (item: any): DailyTrendData | null => {
    const avgSys = toFiniteNumber(item?.avgSys ?? item?.avgSystolic ?? item?.sys ?? item?.systolic);
    const avgDia = toFiniteNumber(item?.avgDia ?? item?.avgDiastolic ?? item?.dia ?? item?.diastolic);
    if (!avgSys || !avgDia) return null;

    const rawLabel = item?.label || item?.date || item?.day;
    const label = rawLabel
        ? String(rawLabel).replace(/^\d{4}-0?/, '').replace('-', '/')
        : '';

    return {
        label,
        avgSys: Math.round(avgSys),
        avgDia: Math.round(avgDia),
        count: toFiniteNumber(item?.count ?? item?.measurements ?? item?.records?.length)
    };
};

const normalizeStatisticsPayload = (payload: any, period: '3m' | '6m'): StatisticsData | null => {
    if (!payload || typeof payload !== 'object') return null;

    const trendData: DailyTrendData[] = Array.isArray(payload.trendData)
        ? payload.trendData.map(normalizeTrendPoint).filter((item: DailyTrendData | null): item is DailyTrendData => item !== null)
        : [];

    const totalMeasurements = toFiniteNumber(payload.totalMeasurements ?? payload.measurements ?? payload.recordCount)
        || trendData.reduce((sum: number, item: DailyTrendData) => sum + (item.count || 0), 0);
    const abnormalMeasurements = toFiniteNumber(payload.abnormalMeasurements ?? payload.abnormalCount)
        || 0;

    return {
        period,
        avgSystolic: toFiniteNumber(payload.avgSystolic ?? payload.averageSystolic),
        avgDiastolic: toFiniteNumber(payload.avgDiastolic ?? payload.averageDiastolic),
        maxSystolic: toFiniteNumber(payload.maxSystolic),
        minSystolic: toFiniteNumber(payload.minSystolic),
        highBPDays: toFiniteNumber(payload.highBPDays ?? payload.abnormalDays),
        totalDays: toFiniteNumber(payload.totalDays) || trendData.length,
        totalMeasurements,
        abnormalMeasurements,
        trendData
    };
};

const fetchRemoteBpRecords = async (caregiverId: string) => {
    const response = await axios.get(
        `${API_BASE_URL}/api/bp?userId=${encodeURIComponent(caregiverId)}`,
        { timeout: 5000 }
    );
    const records = Array.isArray(response.data) ? response.data : [];
    return records
        .map(normalizeBloodPressureRecord)
        .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
};

const getRecordsWithinPeriod = (records: BloodPressureRecord[], period: '3m' | '6m') => {
    const daysBack = period === '3m' ? 90 : 180;
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    return records.filter((record) => getRecordTimestamp(record) >= cutoff);
};

const getAbnormalReason = (record: BloodPressureRecord) => {
    if (record.sys >= 180 || record.dia >= 120) return '危險高血壓';
    if (record.sys >= 140 || record.dia >= 90) return '血壓偏高';
    if (record.sys < 90 || record.dia < 60) return '血壓偏低';
    if (record.pulse > 100) return '脈搏偏快';
    if (record.pulse > 0 && record.pulse < 50) return '脈搏偏慢';
    return '需追蹤';
};

// ─── 主元件 ────────────────────────────────────────────────────────────
export const FamilyScreen: React.FC<FamilyScreenProps> = ({ onResetRole }) => {
    // ─── 狀態管理 ────
    const [latestData, setLatestData] = useState<BloodPressureRecord | null>(null);
    const [statistics, setStatistics] = useState<StatisticsData | null>(null);
    const [monitoredRecords, setMonitoredRecords] = useState<BloodPressureRecord[]>([]);
    const [abnormalDetailsVisible, setAbnormalDetailsVisible] = useState(false);
    const [alertNotification, setAlertNotification] = useState<AlertNotification>({
        visible: false,
        message: '',
        level: 'normal'
    });
    const [selectedTrendIndex, setSelectedTrendIndex] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [elderlyCaregiverId, setElderlyCaregiverId] = useState<string>('');
    const [dataNotice, setDataNotice] = useState<string>('');
    const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showAlertNotification = useCallback((message: string, level: 'danger' | 'warning' | 'normal') => {
        if (alertTimerRef.current) {
            clearTimeout(alertTimerRef.current);
        }

        setAlertNotification({
            visible: true,
            message,
            level
        });

        alertTimerRef.current = setTimeout(() => {
            setAlertNotification({
                visible: false,
                message: '',
                level: 'normal'
            });
            alertTimerRef.current = null;
        }, 5000);
    }, []);

    useEffect(() => () => {
        if (alertTimerRef.current) {
            clearTimeout(alertTimerRef.current);
        }
    }, []);

    // ─── 擷取最新血壓數據 ────
    const fetchLatestData = useCallback(async (caregiverId: string) => {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/api/bp/latest?userId=${encodeURIComponent(caregiverId)}`,
                { timeout: 5000 }
            );

            const data = response.data?.latestRecord || response.data?.record || response.data;
            if (data) {
                const normalizedData = normalizeBloodPressureRecord(data);
                setLatestData(normalizedData);
                setDataNotice('');

                // 檢查是否需要觸發異常警報
                if (normalizedData.sys > 140 || normalizedData.dia >= 90 || normalizedData.pulse > 100 || (normalizedData.pulse > 0 && normalizedData.pulse < 50)) {
                    showAlertNotification(
                        `Firebase 異常警告 Push Notification 模擬：長輩最新血壓 ${normalizedData.sys}/${normalizedData.dia} mmHg，脈搏 ${normalizedData.pulse} bpm，請立即查看。`,
                        'danger'
                    );
                }
            }
        } catch (error) {
            console.warn('擷取最新數據失敗，改用可用備援資料:', error);
            const localRecords = await getLocalBpRecords(caregiverId);
            if (localRecords.length > 0) {
                setMonitoredRecords(localRecords);
                setLatestData(localRecords[0]);
                setDataNotice('後端目前沒有回傳資料，已改用此手機本機儲存的受顧者紀錄。若家屬使用另一台手機，仍需要確認後端已啟動且受顧者資料已上傳。');
                return;
            }

            setLatestData(null);
            setDataNotice('已配對，但後端沒有找到這個配對碼的血壓資料。請先用受顧者帳號同步或儲存一筆血壓，並確認手機連到同一個後端位址。');
        }
    }, [showAlertNotification]);

    // ─── 擷取統計數據 ────
    const fetchStatistics = useCallback(async (caregiverId: string, period: '3m' | '6m') => {
        try {
            const daysBack = period === '3m' ? 90 : 180;
            const response = await axios.get(
                `${API_BASE_URL}/api/bp/statistics?userId=${encodeURIComponent(caregiverId)}&daysBack=${daysBack}`,
                { timeout: 5000 }
            );

            const remoteStatistics = normalizeStatisticsPayload(response.data, period);
            const hasRemoteTrend = Boolean(remoteStatistics?.trendData?.length);
            if (!hasRemoteTrend) {
                const remoteRecords = await fetchRemoteBpRecords(caregiverId);
                if (remoteRecords.length > 0) {
                    setMonitoredRecords(remoteRecords);
                    setStatistics(buildLocalStatistics(remoteRecords, period));
                    setDataNotice('後端統計目前沒有趨勢資料，已改用原始血壓紀錄產生監控摘要。');
                    return;
                }

                const localRecords = await getLocalBpRecords(caregiverId);
                if (localRecords.length > 0) {
                    setMonitoredRecords(localRecords);
                    setStatistics(buildLocalStatistics(localRecords, period));
                    setDataNotice('後端統計目前沒有資料，已改用此手機本機紀錄產生趨勢摘要。');
                    return;
                }
            }

            setStatistics(remoteStatistics);
            try {
                const remoteRecords = await fetchRemoteBpRecords(caregiverId);
                if (remoteRecords.length > 0) {
                    setMonitoredRecords(remoteRecords);
                }
            } catch (recordError) {
                const localRecords = await getLocalBpRecords(caregiverId);
                if (localRecords.length > 0) {
                    setMonitoredRecords(localRecords);
                }
                console.warn('統計已取得，但原始血壓紀錄暫時無法同步:', recordError);
            }
        } catch (error) {
            console.warn('擷取統計數據失敗，改抓原始紀錄產生摘要:', error);
            try {
                const remoteRecords = await fetchRemoteBpRecords(caregiverId);
                if (remoteRecords.length > 0) {
                    setMonitoredRecords(remoteRecords);
                    setStatistics(buildLocalStatistics(remoteRecords, period));
                    setDataNotice('統計端點暫時無法使用，已改抓原始血壓紀錄產生家屬監控摘要。');
                    return;
                }
            } catch (recordError) {
                console.warn('擷取原始血壓紀錄失敗，改用本機紀錄:', recordError);
            }

            const localRecords = await getLocalBpRecords(caregiverId);
            if (localRecords.length > 0) {
                setMonitoredRecords(localRecords);
                setStatistics(buildLocalStatistics(localRecords, period));
                setDataNotice('後端統計擷取失敗，已改用此手機本機紀錄產生趨勢摘要。');
                return;
            }

            setStatistics(null);
        }
    }, []);

    const initializeScreen = useCallback(async () => {
        try {
            setLoading(true);
            // 從 AsyncStorage 取得家屬監控的長輩 ID（您應該在登入時存儲此資訊）
            const monitoredId = await AsyncStorage.getItem('monitoredElderlyId');
            const fallbackId = await AsyncStorage.getItem('elderlyId');
            const caregiverId = monitoredId || fallbackId || 'elderly_001';
            setElderlyCaregiverId(caregiverId);

            // 擷取最新一筆血壓數據
            await fetchLatestData(caregiverId);
            // 擷取近 3 個月統計數據
            await fetchStatistics(caregiverId, MONITORING_PERIOD);
        } catch (error) {
            console.warn('初始化 Family Screen 失敗:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchLatestData, fetchStatistics]);

    // ─── 初始化與數據擷取 ────
    useEffect(() => {
        initializeScreen();
    }, [initializeScreen]);

    // ─── 重新整理數據 ────
    const handleRefresh = async () => {
        await fetchLatestData(elderlyCaregiverId);
        await fetchStatistics(elderlyCaregiverId, MONITORING_PERIOD);
    };

    const bpStatus = latestData ? getBpStatus(latestData.sys, latestData.dia) : null;
    const pulseStatus = latestData && hasPulseData(latestData.pulse) ? getPulseStatus(latestData.pulse) : null;
    const periodLabel = '近 3 個月';
    const trendPoints = useMemo(
        () => statistics?.trendData?.slice(-14) ?? [],
        [statistics]
    );
    const trendDateLabels = useMemo(() => {
        if (trendPoints.length <= 4) {
            return trendPoints.map((point) => point.label);
        }

        const lastIndex = trendPoints.length - 1;
        const middleIndex = Math.floor(lastIndex / 2);
        const visibleIndexes = new Set(
            screenWidth < 380 || trendPoints.length > 10
                ? [0, lastIndex]
                : [0, middleIndex, lastIndex]
        );

        return trendPoints.map((point, index) => {
            return visibleIndexes.has(index) ? point.label : '';
        });
    }, [trendPoints]);
    const chartRecordsCount = trendPoints.reduce((sum, item) => sum + (item.count || 0), 0);
    const selectedTrendPoint = selectedTrendIndex != null ? trendPoints[selectedTrendIndex] : null;
    const selectedTrendStatus = selectedTrendPoint
        ? getBpStatus(selectedTrendPoint.avgSys, selectedTrendPoint.avgDia)
        : null;
    const selectedTrendHealthLabel = selectedTrendStatus?.level === 'normal'
        ? '健康狀態良好'
        : selectedTrendStatus?.level === 'danger'
            ? '健康狀態偏危險'
            : '健康狀態需注意';
    const todayKey = getRecordDateKey({
        sys: 0,
        dia: 0,
        pulse: 0,
        time: new Date().toISOString(),
        userId: '',
        role: 'elderly'
    });
    const latestDateKey = latestData ? getRecordDateKey(latestData) : null;
    const hasMeasuredToday = Boolean(todayKey && latestDateKey === todayKey);
    const latestIsAbnormal = latestData ? isAbnormalMeasurement(latestData.sys, latestData.dia, latestData.pulse) : false;
    const monitoringStatusColor = !latestData
        ? '#8c8c8c'
        : latestIsAbnormal
            ? '#cf1322'
            : hasMeasuredToday
                ? '#237804'
                : '#ad6800';
    const monitoringStatusLabel = !latestData
        ? '尚無資料'
        : latestIsAbnormal
            ? '需要立即追蹤'
            : hasMeasuredToday
                ? '今日已量測'
                : '今日尚未看到新量測';
    const lastMeasurementText = latestData
        ? formatMeasurementTime(latestData.time)
        : '尚未取得';
    const abnormalRecords = useMemo(
        () => getRecordsWithinPeriod(monitoredRecords, MONITORING_PERIOD)
            .filter((record) => isAbnormalMeasurement(record.sys, record.dia, record.pulse))
            .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a)),
        [monitoredRecords]
    );
    const abnormalRecordsCount = abnormalRecords.length || statistics?.abnormalMeasurements || 0;

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
                {/* ─── 異常警報橫幅 ────────────────────────────────────────────────── */}
                {alertNotification.visible && (
                    <View
                        style={[
                            styles.alertBanner,
                            { backgroundColor: alertNotification.level === 'danger' ? '#ff4d4f' : '#faad14' }
                        ]}
                    >
                        <Text style={styles.alertText}>{alertNotification.message}</Text>
                        <Text style={styles.alertSubText}>模擬 Firebase Cloud Messaging 推播：已通知家屬端立即追蹤。</Text>
                    </View>
                )}

                {/* ─── 標題與最後更新時間 ────────────────────────────────────────────── */}
                <View style={styles.headerContainer}>
                    <View style={styles.headerTitleBlock}>
                        <Text style={styles.headerTitle}>長輩每日血壓監控</Text>
                        <Text style={styles.headerSubtitle}>家屬端固定查看近 3 個月資料</Text>
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
                    <Text style={styles.connectionInfoTitle}>目前配對與資料來源</Text>
                    <Text style={styles.connectionInfoText}>配對碼：{elderlyCaregiverId || '尚未取得'}</Text>
                    <Text style={styles.connectionInfoText}>後端位址：{API_BASE_URL}</Text>
                    {dataNotice ? (
                        <Text style={styles.connectionNoticeText}>{dataNotice}</Text>
                    ) : (
                        <Text style={styles.connectionOkText}>已使用配對碼向後端查詢資料。</Text>
                    )}
                </View>

                {!latestData && (
                    <View style={styles.emptyDataCard}>
                        <Text style={styles.emptyDataTitle}>尚未擷取到受顧者數據</Text>
                        <Text style={styles.emptyDataText}>請確認受顧者端已完成至少一筆 OMRON / Health Connect 同步，或已手動儲存一筆血壓。</Text>
                        <Text style={styles.emptyDataText}>如果受顧者與家屬使用不同手機，資料必須成功上傳到同一個後端，單純輸入配對碼不會自動讀到另一台手機的本機資料。</Text>
                    </View>
                )}

                {/* ─── 最新血壓狀態卡片（紅黃綠聯動） ────────────────────────────────── */}
                {latestData && bpStatus && (
                    <View
                        style={[
                            styles.latestDataCard,
                            {
                                backgroundColor: bpStatus.backgroundColor,
                                borderLeftColor: bpStatus.borderColor,
                                borderLeftWidth: 6
                            }
                        ]}
                    >
                        <View style={styles.latestCardHeader}>
                            <View>
                                <Text style={styles.sectionEyebrow}>即時數據狀態</Text>
                                <Text style={styles.latestCardTitle}>最新一筆血壓同步</Text>
                                <Text style={styles.latestSourceText}>{getSourceLabel(latestData.source)}</Text>
                            </View>
                            <View
                                style={[
                                    styles.statusBadge,
                                    { backgroundColor: bpStatus.borderColor }
                                ]}
                            >
                                <Text style={styles.statusLabel}>{bpStatus.label}</Text>
                            </View>
                        </View>

                        <View style={styles.dataRow}>
                            <View style={styles.dataItem}>
                                <Text style={styles.dataLabel}>收縮壓 (SYS)</Text>
                                <Text style={[styles.dataValue, { color: bpStatus.color }]}>
                                    {latestData.sys}
                                </Text>
                                <Text style={styles.dataUnit}>mmHg</Text>
                            </View>

                            <View style={styles.divider} />

                            <View style={styles.dataItem}>
                                <Text style={styles.dataLabel}>舒張壓 (DIA)</Text>
                                <Text style={[styles.dataValue, { color: bpStatus.color }]}>
                                    {latestData.dia}
                                </Text>
                                <Text style={styles.dataUnit}>mmHg</Text>
                            </View>

                            <View style={styles.divider} />

                            <View style={styles.dataItem}>
                                <Text style={styles.dataLabel}>脈搏</Text>
                                <Text style={[styles.dataValue, { color: pulseStatus?.color || '#237804' }]}>
                                    {formatPulseValue(latestData.pulse)}
                                </Text>
                                <Text style={styles.dataUnit}>{hasPulseData(latestData.pulse) ? 'bpm' : '脈搏'}</Text>
                            </View>
                        </View>

                        {pulseStatus && (
                            <View style={styles.pulseStatusRow}>
                                <Text style={[styles.pulseStatusText, { color: pulseStatus.color }]}>{pulseStatus.label}</Text>
                            </View>
                        )}

                        <View style={styles.recommendationBox}>
                            <Text style={styles.recommendationLabel}>家屬追蹤重點</Text>
                            <Text style={styles.recommendationText}>{bpStatus.recommendation}</Text>
                        </View>

                        <Text style={styles.measurementTime}>
                            📅 測量時間：{formatMeasurementTime(latestData.time)}
                        </Text>
                    </View>
                )}

                {/* ─── 家屬每日監控重點 ─────────────────────────────────────────────── */}
                <View style={styles.monitoringContainer}>
                    <View style={styles.monitoringHeader}>
                        <View>
                            <Text style={styles.sectionEyebrow}>每日監控</Text>
                            <Text style={styles.monitoringTitle}>家屬追蹤看板</Text>
                        </View>
                        <View style={[styles.monitoringBadge, { backgroundColor: monitoringStatusColor }]}>
                            <Text style={styles.monitoringBadgeText}>{monitoringStatusLabel}</Text>
                        </View>
                    </View>

                    <View style={styles.monitoringList}>
                        <View style={styles.monitoringItem}>
                            <Text style={styles.monitoringLabel}>今日量測狀態</Text>
                            <Text style={[styles.monitoringValue, { color: hasMeasuredToday ? '#237804' : '#ad6800' }]}>
                                {hasMeasuredToday ? '已看到今日新紀錄' : '尚未看到今日新紀錄'}
                            </Text>
                        </View>
                        <View style={styles.monitoringItem}>
                            <Text style={styles.monitoringLabel}>最新量測時間</Text>
                            <Text style={styles.monitoringValue}>{lastMeasurementText}</Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.monitoringItem, styles.monitoringItemAction]}
                            onPress={() => setAbnormalDetailsVisible(true)}
                            activeOpacity={0.8}
                        >
                            <View style={styles.monitoringActionHeader}>
                                <Text style={styles.monitoringLabel}>異常量測筆數</Text>
                                <Text style={styles.monitoringOpenText}>查看明細</Text>
                            </View>
                            <Text style={[styles.monitoringValue, { color: '#cf1322' }]}>
                                {abnormalRecordsCount} / {statistics?.totalMeasurements || monitoredRecords.length || 0} 筆
                            </Text>
                        </TouchableOpacity>
                        <View style={styles.monitoringItem}>
                            <Text style={styles.monitoringLabel}>家屬下一步</Text>
                            <Text style={styles.monitoringValue}>
                                {latestIsAbnormal ? '先電話確認長輩狀態，必要時請看護協助複測。' : '持續確認每天是否有新量測資料。'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ─── 趨勢圖表 ────────────────────────────────────────────────────── */}
                {statistics && statistics.trendData && statistics.trendData.length > 0 ? (
                    <View style={styles.chartContainer}>
                        <Text style={styles.sectionEyebrow}>大數據視覺化</Text>
                        <Text style={styles.chartTitle}>📈 {periodLabel}每日血壓趨勢</Text>
                        <Text style={styles.chartSubtitle}>
                            匯總 {statistics.totalDays} 個有紀錄天數，圖表顯示最近 {trendPoints.length} 個趨勢點，合計 {chartRecordsCount || statistics.totalMeasurements || statistics.trendData.length} 筆測量。
                        </Text>
                        <LineChart
                            data={{
                                labels: trendDateLabels,
                                datasets: [
                                    {
                                        data: trendPoints.map((d) => d.avgSys),
                                        color: (opacity = 1) => `rgba(207, 19, 34, ${opacity})`,
                                        strokeWidth: 2
                                    },
                                    {
                                        data: trendPoints.map((d) => d.avgDia),
                                        color: (opacity = 1) => `rgba(24, 144, 255, ${opacity})`,
                                        strokeWidth: 2
                                    }
                                ]
                            }}
                            width={screenWidth - 40}
                            height={280}
                            chartConfig={{
                                backgroundGradientFrom: '#f5f5f5',
                                backgroundGradientTo: '#f5f5f5',
                                color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                                strokeWidth: 2,
                                propsForDots: {
                                    r: '4',
                                    strokeWidth: '1',
                                    stroke: '#1890ff'
                                }
                            }}
                            onDataPointClick={({ index }) => setSelectedTrendIndex(index)}
                            verticalLabelRotation={0}
                            bezier
                            style={styles.chart}
                        />
                        {selectedTrendPoint ? (
                            <View style={styles.selectedTrendCard}>
                                <View style={styles.selectedTrendHeader}>
                                    <Text style={styles.selectedTrendDate}>{selectedTrendPoint.label}</Text>
                                    {selectedTrendStatus && (
                                        <View style={[styles.selectedTrendBadge, { backgroundColor: selectedTrendStatus.borderColor }]}>
                                            <Text style={styles.selectedTrendBadgeText}>{selectedTrendHealthLabel}</Text>
                                        </View>
                                    )}
                                </View>
                                <View style={styles.selectedTrendValues}>
                                    <Text style={styles.selectedTrendValue}>收縮壓 {selectedTrendPoint.avgSys} mmHg</Text>
                                    <Text style={styles.selectedTrendValue}>舒張壓 {selectedTrendPoint.avgDia} mmHg</Text>
                                </View>
                                {selectedTrendStatus && (
                                    <Text style={[styles.selectedTrendStatusText, { color: selectedTrendStatus.color }]}>
                                        判讀：{selectedTrendStatus.label}，{selectedTrendStatus.recommendation}
                                    </Text>
                                )}
                                <Text style={styles.selectedTrendCount}>
                                    當日量測 {selectedTrendPoint.count || 1} 筆
                                </Text>
                            </View>
                        ) : (
                            <Text style={styles.chartTapHint}>點擊圖上的圓點可查看該日日期與數值</Text>
                        )}
                        <View style={styles.chartLegend}>
                            <View style={styles.legendItem}>
                                <View style={{ width: 12, height: 12, backgroundColor: '#cf1322', borderRadius: 2 }} />
                                <Text style={styles.legendText}>收縮壓 (SYS)</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={{ width: 12, height: 12, backgroundColor: '#1890ff', borderRadius: 2 }} />
                                <Text style={styles.legendText}>舒張壓 (DIA)</Text>
                            </View>
                        </View>
                    </View>
                ) : null}

                {/* ─── 統計摘要卡片 ────────────────────────────────────────────────── */}
                {statistics && (
                    <View style={styles.statisticsContainer}>
                        <Text style={styles.sectionEyebrow}>長期加總統計</Text>
                        <Text style={styles.statisticsTitle}>📊 {periodLabel}血壓監控摘要</Text>

                        <View style={styles.statsGrid}>
                            <View style={styles.statCard}>
                                <Text style={styles.statLabel}>平均收縮壓</Text>
                                <Text style={styles.statValue}>{Math.round(statistics.avgSystolic)}</Text>
                                <Text style={styles.statUnit}>mmHg</Text>
                            </View>

                            <View style={styles.statCard}>
                                <Text style={styles.statLabel}>平均舒張壓</Text>
                                <Text style={styles.statValue}>{Math.round(statistics.avgDiastolic)}</Text>
                                <Text style={styles.statUnit}>mmHg</Text>
                            </View>

                            <View style={styles.statCard}>
                                <Text style={styles.statLabel}>最高收縮壓</Text>
                                <Text style={[styles.statValue, { color: '#cf1322' }]}>{statistics.maxSystolic}</Text>
                                <Text style={styles.statUnit}>mmHg</Text>
                            </View>

                            <View style={styles.statCard}>
                                <Text style={styles.statLabel}>最低收縮壓</Text>
                                <Text style={[styles.statValue, { color: '#52c41a' }]}>{statistics.minSystolic}</Text>
                                <Text style={styles.statUnit}>mmHg</Text>
                            </View>

                            <TouchableOpacity
                                style={[styles.statCard, styles.statCardAction, { backgroundColor: '#fff7e6' }]}
                                onPress={() => setAbnormalDetailsVisible(true)}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.statLabel}>異常天數</Text>
                                <Text style={[styles.statValue, { color: '#faad14' }]}>{statistics.highBPDays}</Text>
                                <Text style={styles.statUnit}>天 / {statistics.totalDays}，點擊看明細</Text>
                            </TouchableOpacity>

                            <View style={[styles.statCard, { backgroundColor: '#f6f8fb' }]}>
                                <Text style={styles.statLabel}>總量測筆數</Text>
                                <Text style={[styles.statValue, { color: '#1890ff' }]}>
                                    {statistics.totalMeasurements || statistics.trendData.length}
                                </Text>
                                <Text style={styles.statUnit}>筆</Text>
                            </View>
                        </View>
                    </View>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
            <Modal
                visible={abnormalDetailsVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setAbnormalDetailsVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHandle} />
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.sectionEyebrow}>{periodLabel}</Text>
                                <Text style={styles.modalTitle}>異常量測明細</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.modalCloseButton}
                                onPress={() => setAbnormalDetailsVisible(false)}
                            >
                                <Text style={styles.modalCloseText}>關閉</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                            {abnormalRecords.length > 0 ? (
                                abnormalRecords.map((record, index) => (
                                        <View key={`${record._id || record.time}-${index}`} style={styles.abnormalRecordCard}>
                                            <View style={styles.abnormalRecordHeader}>
                                                <Text style={styles.abnormalReason}>{getAbnormalReason(record)}</Text>
                                                <Text style={styles.abnormalTime}>
                                                    {formatMeasurementTime(record.time)}
                                                </Text>
                                            </View>
                                            <View style={styles.abnormalValueRow}>
                                                <Text style={styles.abnormalValue}>收縮壓 {record.sys}</Text>
                                                <Text style={styles.abnormalValue}>舒張壓 {record.dia}</Text>
                                                <Text style={styles.abnormalValue}>脈搏 {formatPulseValue(record.pulse)}</Text>
                                            </View>
                                        </View>
                                ))
                            ) : (
                                <View style={styles.emptyAbnormalCard}>
                                    <Text style={styles.emptyAbnormalTitle}>目前沒有可顯示的異常明細</Text>
                                    <Text style={styles.emptyAbnormalText}>
                                        若上方已有異常統計但此處沒有清單，代表目前只取得統計摘要，尚未同步到原始量測紀錄。
                                    </Text>
                                </View>
                            )}
                        </ScrollView>
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
    alertBanner: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginHorizontal: 12,
        marginTop: 12,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
        elevation: 3
    },
    alertText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center'
    },
    alertSubText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '500',
        marginTop: 4,
        opacity: 0.95,
        textAlign: 'center'
    },
    headerContainer: {
        alignItems: 'stretch',
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
        marginTop: 3
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
    refreshButton: {
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#154360',
        borderRadius: 8
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
    emptyDataCard: {
        marginHorizontal: 12,
        marginVertical: 12,
        backgroundColor: '#fffbe6',
        borderLeftColor: '#faad14',
        borderLeftWidth: 5,
        borderRadius: 10,
        padding: 14
    },
    emptyDataTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#ad6800',
        marginBottom: 8
    },
    emptyDataText: {
        fontSize: 13,
        color: '#595959',
        lineHeight: 19,
        marginBottom: 6
    },
    latestDataCard: {
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
    latestCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 14
    },
    sectionEyebrow: {
        fontSize: 12,
        fontWeight: '800',
        color: '#154360',
        marginBottom: 4
    },
    latestCardTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#262626'
    },
    latestSourceText: {
        fontSize: 12,
        color: '#595959',
        marginTop: 4
    },
    statusBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20
    },
    statusLabel: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700'
    },
    dataRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        marginBottom: 16
    },
    dataItem: {
        flex: 1,
        alignItems: 'center'
    },
    dataLabel: {
        fontSize: 12,
        color: '#8c8c8c',
        marginBottom: 4
    },
    dataValue: {
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 2
    },
    dataUnit: {
        fontSize: 11,
        color: '#8c8c8c'
    },
    divider: {
        width: 1,
        height: 40,
        backgroundColor: '#e8e8e8',
        marginHorizontal: 8
    },
    pulseStatusRow: {
        alignSelf: 'flex-end',
        marginBottom: 10
    },
    pulseStatusText: {
        fontSize: 12,
        fontWeight: '800'
    },
    recommendationBox: {
        backgroundColor: '#f0f5ff',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
        borderLeftColor: '#1890ff',
        borderLeftWidth: 3
    },
    recommendationLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#1890ff',
        marginBottom: 4
    },
    recommendationText: {
        fontSize: 13,
        color: '#262626',
        lineHeight: 18
    },
    measurementTime: {
        fontSize: 11,
        color: '#8c8c8c',
        textAlign: 'right'
    },
    chartContainer: {
        marginHorizontal: 12,
        marginVertical: 12,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3
    },
    chartTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#262626',
        marginBottom: 6
    },
    chartSubtitle: {
        fontSize: 12,
        color: '#595959',
        lineHeight: 18,
        marginBottom: 12
    },
    chart: {
        borderRadius: 8
    },
    chartTapHint: {
        marginTop: 8,
        fontSize: 12,
        color: '#4f6473',
        fontWeight: '700',
        textAlign: 'center'
    },
    selectedTrendCard: {
        marginTop: 10,
        backgroundColor: '#f6f8fb',
        borderWidth: 1,
        borderColor: '#d7e0e7',
        borderRadius: 8,
        padding: 10
    },
    selectedTrendHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 6
    },
    selectedTrendDate: {
        flex: 1,
        fontSize: 14,
        color: '#154360',
        fontWeight: '900'
    },
    selectedTrendBadge: {
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 5,
        flexShrink: 0
    },
    selectedTrendBadgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '900'
    },
    selectedTrendValues: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8
    },
    selectedTrendValue: {
        backgroundColor: '#fff',
        borderRadius: 6,
        paddingHorizontal: 9,
        paddingVertical: 6,
        color: '#262626',
        fontSize: 12,
        fontWeight: '800'
    },
    selectedTrendStatusText: {
        marginTop: 8,
        fontSize: 12,
        fontWeight: '800',
        lineHeight: 18
    },
    selectedTrendCount: {
        marginTop: 6,
        color: '#4f6473',
        fontSize: 12,
        fontWeight: '700'
    },
    chartLegend: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 24,
        marginTop: 12
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    legendText: {
        fontSize: 12,
        color: '#8c8c8c'
    },
    statisticsContainer: {
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
    statisticsTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#262626',
        marginBottom: 16
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12
    },
    statCard: {
        width: '48%',
        backgroundColor: '#fafafa',
        borderRadius: 10,
        padding: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#f0f0f0'
    },
    statCardAction: {
        borderColor: '#ffd591'
    },
    statLabel: {
        fontSize: 12,
        color: '#8c8c8c',
        marginBottom: 8
    },
    statValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1890ff',
        marginBottom: 2
    },
    statUnit: {
        fontSize: 10,
        color: '#8c8c8c'
    },
    monitoringContainer: {
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
    monitoringHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 12
    },
    monitoringTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#262626'
    },
    monitoringBadge: {
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        flexShrink: 0
    },
    monitoringBadgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '800'
    },
    monitoringList: {
        gap: 10
    },
    monitoringItem: {
        backgroundColor: '#f6f8fb',
        borderWidth: 1,
        borderColor: '#d7e0e7',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10
    },
    monitoringItemAction: {
        backgroundColor: '#fff7f0',
        borderColor: '#ffbb96'
    },
    monitoringActionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12
    },
    monitoringOpenText: {
        fontSize: 12,
        color: '#cf1322',
        fontWeight: '800'
    },
    monitoringLabel: {
        fontSize: 12,
        color: '#4f6473',
        fontWeight: '700',
        marginBottom: 4
    },
    monitoringValue: {
        fontSize: 14,
        color: '#262626',
        fontWeight: '700',
        lineHeight: 20
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        justifyContent: 'flex-end'
    },
    modalSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: '82%',
        paddingTop: 8,
        paddingHorizontal: 16,
        paddingBottom: 18
    },
    modalHandle: {
        alignSelf: 'center',
        width: 44,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#c7d0d8',
        marginBottom: 12
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#edf1f4'
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#262626'
    },
    modalCloseButton: {
        backgroundColor: '#f0f3f6',
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 9
    },
    modalCloseText: {
        color: '#154360',
        fontSize: 13,
        fontWeight: '800'
    },
    modalList: {
        marginTop: 12
    },
    abnormalRecordCard: {
        backgroundColor: '#fff7f0',
        borderWidth: 1,
        borderColor: '#ffbb96',
        borderRadius: 10,
        padding: 12,
        marginBottom: 10
    },
    abnormalRecordHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 10
    },
    abnormalReason: {
        fontSize: 14,
        fontWeight: '800',
        color: '#cf1322',
        flexShrink: 0
    },
    abnormalTime: {
        flex: 1,
        fontSize: 12,
        color: '#595959',
        textAlign: 'right',
        lineHeight: 18
    },
    abnormalValueRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8
    },
    abnormalValue: {
        backgroundColor: '#fff',
        borderRadius: 6,
        paddingHorizontal: 9,
        paddingVertical: 6,
        fontSize: 13,
        fontWeight: '800',
        color: '#262626'
    },
    emptyAbnormalCard: {
        backgroundColor: '#f6f8fb',
        borderRadius: 10,
        padding: 14,
        borderWidth: 1,
        borderColor: '#d7e0e7'
    },
    emptyAbnormalTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#262626',
        marginBottom: 6
    },
    emptyAbnormalText: {
        fontSize: 13,
        color: '#595959',
        lineHeight: 19
    }
});

export default FamilyScreen;
