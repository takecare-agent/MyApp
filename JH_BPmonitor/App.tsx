import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  Alert, SafeAreaView, FlatList, Dimensions, ActivityIndicator, ScrollView,
  AppState, InteractionManager, Platform, Modal, Linking, Pressable, PanResponder, Animated
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import Share from 'react-native-share';
import RNFS from 'react-native-fs';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart } from 'react-native-chart-kit';
import { launchCamera } from 'react-native-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import auth from '@react-native-firebase/auth';
import {
  initialize,
  requestPermission,
  readRecords,
  getGrantedPermissions,
} from 'react-native-health-connect';

// ─── 月曆中文設定 ────────────────────────────────────────────────────────────
LocaleConfig.locales['zh'] = {
  monthNames: ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'],
  monthNamesShort: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
  dayNames: ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'],
  dayNamesShort: ['日','一','二','三','四','五','六'],
  today: '今天',
};
LocaleConfig.defaultLocale = 'zh';

const Tab = createBottomTabNavigator();
const API_URL = 'https://bp-backend-server.onrender.com/api/bp';
const MOOD_ANALYSIS_SOURCE_URL = 'https://www.heart.org/en/health-topics/high-blood-pressure/changes-you-can-make-to-manage-high-blood-pressure/managing-stress-to-control-high-blood-pressure';
const PULSE_ANALYSIS_SOURCE_URL = 'https://www.health.harvard.edu/healthy-aging-and-longevity/understanding-the-stress-response';
const HEALTH_CONNECT_PERMISSIONS = [
  { accessType: 'read', recordType: 'BloodPressure' },
  { accessType: 'read', recordType: 'HeartRate' },
] as const;
const PULSE_MATCH_WINDOW_MS = 15 * 60 * 1000;

const createSwipeDownDismissPanResponder = (translateY: Animated.Value, onDismiss: () => void) =>
  PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) =>
      gestureState.dy > 4 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy > 0) {
        translateY.setValue(gestureState.dy);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 25 || gestureState.vy > 0.35) {
        translateY.setValue(0);
        onDismiss();
        return;
      }
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();
    },
  });

type Mood = '開心' | '壓力大' | '焦慮' | '平靜' | '未標記';
type BpLevel = '正常' | '偏低' | '血壓前期' | '高血壓' | '超高血壓';

interface BpStatus {
  level: BpLevel;
  color: string;
  isAbnormal: boolean;
  isCritical: boolean;
}

const MOOD_OPTIONS: Array<{ value: Mood; emoji: string; label: string }> = [
  { value: '開心', emoji: '😊', label: '開心' },
  { value: '壓力大', emoji: '😓', label: '壓力大' },
  { value: '焦慮', emoji: '😟', label: '焦慮' },
  { value: '平靜', emoji: '😌', label: '平靜' },
];

const UNMARKED_MOOD: Mood = '未標記';
const STRESS_MOODS = new Set<Mood>(['焦慮', '壓力大']);

const isMarkedMood = (mood?: string): mood is Mood =>
  Boolean(mood && mood !== UNMARKED_MOOD);

const isStressMood = (mood?: string) =>
  isMarkedMood(mood) && STRESS_MOODS.has(mood);

const getMoodOption = (mood?: string) =>
  MOOD_OPTIONS.find((option) => option.value === mood);

const getMoodEmoji = (mood?: string) =>
  getMoodOption(mood)?.emoji ?? '➕';

const getBpStatusFromValues = (sys: number, dia: number): BpStatus => {
  if (sys >= 180 || dia >= 120) {
    return { level: '超高血壓', color: '#7f1d1d', isAbnormal: true, isCritical: true };
  }
  if (sys >= 140 || dia >= 90) {
    return { level: '高血壓', color: '#cf1322', isAbnormal: true, isCritical: false };
  }
  if (sys < 90 || dia < 60) {
    return { level: '偏低', color: '#722ed1', isAbnormal: true, isCritical: false };
  }
  if (sys >= 120 || dia >= 80) {
    return { level: '血壓前期', color: '#faad14', isAbnormal: false, isCritical: false };
  }
  return { level: '正常', color: '#52c41a', isAbnormal: false, isCritical: false };
};

const getBpLevel = (sys: number, dia: number): BpLevel =>
  getBpStatusFromValues(sys, dia).level;

const getBpLevelColor = (level?: string) => {
  if (level === '超高血壓') return getBpStatusFromValues(180, 120).color;
  if (level === '高血壓') return getBpStatusFromValues(140, 90).color;
  if (level === '偏低') return getBpStatusFromValues(89, 59).color;
  if (level === '血壓前期') return getBpStatusFromValues(120, 80).color;
  return getBpStatusFromValues(110, 70).color;
};

const getMoodStressAnalysis = (items: BpRecord[]) => {
  const recent = items.slice(0, 14);
  const stressRelatedHighCount = recent.filter((record) => {
    const sys = Number(record.sys);
    return Number.isFinite(sys) && sys > 140 && isStressMood(record.mood);
  }).length;
  const markedCount = recent.filter((record) => isMarkedMood(record.mood)).length;

  if (stressRelatedHighCount > 0) {
    return `近 ${recent.length} 筆紀錄中，有 ${stressRelatedHighCount} 筆收縮壓偏高且同時標記為焦慮或壓力大。數值偏高可能與當下情緒壓力及交感神經反應有關，建議靜坐 5 分鐘後再次測量。`;
  }

  if (markedCount > 0) {
    return `近 ${recent.length} 筆紀錄中暫未看到「高收縮壓 + 焦慮/壓力大」的明顯重疊。可持續記錄心情，觀察壓力情境是否與血壓波動同步出現。`;
  }

  return '目前心情標記不足，尚無法觀察血壓與心理狀態的關聯。建議每次測量時補上心情，累積後趨勢會更有參考價值。';
};

const getPulseMoodAnalysis = (items: BpRecord[]) => {
  const recent = items.slice(0, 14);
  const recordsWithPulse = recent
    .map((record) => ({
      record,
      pulse: toFiniteNumber(record.pulse),
      sys: toFiniteNumber(record.sys),
    }))
    .filter((item): item is { record: BpRecord; pulse: number; sys: number } =>
      item.pulse != null && item.sys != null
    );
  const markedRecords = recordsWithPulse.filter(({ record }) => isMarkedMood(record.mood));
  const averagePulse = recordsWithPulse.length > 0
    ? recordsWithPulse.reduce((sum, item) => sum + item.pulse, 0) / recordsWithPulse.length
    : null;
  const sympatheticOverlapCount = recordsWithPulse.filter(({ record, pulse, sys }) =>
    pulse >= 85 && sys > 130 && isStressMood(record.mood)
  ).length;
  const calmCount = markedRecords.filter(({ record }) => record.mood === '平靜').length;

  if (sympatheticOverlapCount > 0) {
    return '近期的紀錄中發現，當您感到壓力或焦慮時，脈搏會伴隨血壓同時升高（Pulse >= 85 bpm）。這符合交感神經釋放皮質醇與腎上腺素的生理反應。建議在標記壓力的日子，安排 5-10 分鐘的腹式呼吸來活化副交感神經，協助心率與血壓回穩。';
  }

  if (
    averagePulse != null &&
    averagePulse >= 85 &&
    markedRecords.length > 0 &&
    calmCount >= Math.ceil(markedRecords.length / 2)
  ) {
    return '近期在平靜狀態下脈搏仍有些微偏高，建議留意是否與咖啡因攝取、睡眠不足或測量前未充分休息有關。';
  }

  return '目前脈搏與情緒的關聯數據累積中，持續記錄能協助觀察您的心血管神經調節趨勢。';
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(() => resolve(), ms));

const waitForNativeActivityReady = async () => {
  if (Platform.OS !== 'android') return;

  if (AppState.currentState !== 'active') {
    await new Promise<void>((resolve) => {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          subscription.remove();
          resolve();
        }
      });
    });
  }

  await new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
  await wait(350);
};

const toFiniteNumber = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getMillimetersOfMercury = (reading: any): number | null => {
  if (reading == null) return null;

  const direct = toFiniteNumber(reading);
  if (direct != null) return direct;

  return (
    toFiniteNumber(reading.inMillimetersOfMercury) ??
    toFiniteNumber(reading.value) ??
    toFiniteNumber(reading.millimetersOfMercury) ??
    toFiniteNumber(reading.mmHg) ??
    null
  );
};

const getBloodPressureRecordTime = (record: any): Date | null => {
  const rawTime =
    record?.time ??
    record?.measurementTime ??
    record?.startTime ??
    record?.metadata?.lastModifiedTime ??
    null;

  if (!rawTime) return null;
  const date = new Date(rawTime);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getHeartRateSampleTime = (sample: any): Date | null => {
  const rawTime = sample?.time ?? sample?.startTime ?? sample?.endTime ?? null;
  if (!rawTime) return null;
  const date = new Date(rawTime);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getPulseFromHeartRateRecords = (heartRateRecords: any[], targetDate: Date): number | null => {
  let nearestPulse: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const targetTime = targetDate.getTime();

  heartRateRecords.forEach((record) => {
    const samples = Array.isArray(record?.samples) ? record.samples : [];
    samples.forEach((sample: any) => {
      const pulse = toFiniteNumber(sample?.beatsPerMinute);
      const sampleDate = getHeartRateSampleTime(sample);
      if (pulse == null || !sampleDate) return;

      const distance = Math.abs(sampleDate.getTime() - targetTime);
      if (distance <= PULSE_MATCH_WINDOW_MS && distance < nearestDistance) {
        nearestPulse = Math.round(pulse);
        nearestDistance = distance;
      }
    });
  });

  return nearestPulse;
};

const normalizePulse = (value: any): number | null => {
  const pulse =
    toFiniteNumber(value) ??
    toFiniteNumber(value?.beatsPerMinute) ??
    toFiniteNumber(value?.bpm) ??
    toFiniteNumber(value?.value) ??
    toFiniteNumber(value?.inBeatsPerMinute);

  if (pulse == null || pulse < 30 || pulse > 220) return null;
  return Math.round(pulse);
};

const getPulseFromBloodPressureRecord = (record: any): number | null =>
  normalizePulse(record?.pulse) ??
  normalizePulse(record?.pulseRate) ??
  normalizePulse(record?.heartRate) ??
  normalizePulse(record?.beatsPerMinute) ??
  normalizePulse(record?.bpm);

// ─── 型別 ────────────────────────────────────────────────────────────────────
interface BpRecord {
  sys: string;
  dia: string;
  pulse?: string;
  mood?: Mood;
  level: string;
  time: string;
  id: string;
  syncKey?: string;
  userId?: string;
}

interface DailyBpSummary {
  dateKey: string;
  label: string;
  avgSys: number;
  avgDia: number;
  count: number;
  minSys: number;
  maxSys: number;
  minDia: number;
  maxDia: number;
}

interface AbnormalBpDetail {
  key: string;
  date: string;
  time: string;
  sys: string;
  dia: string;
  pulse?: string;
  level: string;
  color: string;
  mood?: Mood;
}

const getBpRecordTimestamp = (record: BpRecord): number => {
  const normalizedTime = record.time?.replace(/\//g, '-');
  const timestamp = normalizedTime ? new Date(normalizedTime).getTime() : NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const sortRecordsNewestFirst = (items: BpRecord[]) =>
  [...items].sort((a, b) => getBpRecordTimestamp(b) - getBpRecordTimestamp(a));

const getStableBpSyncKey = (sys: number, dia: number, date: Date) =>
  `hc_bp_${date.getTime()}_${Math.round(sys)}_${Math.round(dia)}`;

const getBpRecordIdentity = (record: BpRecord) => {
  const keys = new Set<string>();
  const syncKey = record.syncKey ? `sync:${record.syncKey}` : null;
  const idKey = record.id ? `id:${record.id}` : null;

  const timestamp = getBpRecordTimestamp(record);
  const sys = Number(record.sys);
  const dia = Number(record.dia);
  const measurementKey =
    timestamp && Number.isFinite(sys) && Number.isFinite(dia)
      ? `bp:${timestamp}:${Math.round(sys)}:${Math.round(dia)}`
      : null;

  [measurementKey, syncKey, idKey].forEach((key) => {
    if (key) keys.add(key);
  });

  return {
    primaryKey: measurementKey ?? syncKey ?? idKey ?? '',
    keys: [...keys],
  };
};

const getBpRecordIdentityKeys = (record: BpRecord): string[] =>
  getBpRecordIdentity(record).keys;

const getBpRecordPrimaryKey = (record: BpRecord) =>
  getBpRecordIdentity(record).primaryKey || record.id;

const mergeRecordsPreservingLocalMood = (remoteRecords: BpRecord[], localRecords: BpRecord[]) => {
  const localMoodByKey = new Map<string, Mood>();
  const localPulseByKey = new Map<string, string>();

  localRecords.forEach((record) => {
    const mood = record.mood;
    const keys = getBpRecordIdentity(record).keys;
    if (isMarkedMood(mood)) {
      keys.forEach((key) => localMoodByKey.set(key, mood));
    }
    if (record.pulse) {
      keys.forEach((key) => localPulseByKey.set(key, record.pulse as string));
    }
  });

  return remoteRecords.map((record) => {
    const keys = getBpRecordIdentity(record).keys;
    const preservedMood = keys
      .map((key) => localMoodByKey.get(key))
      .find((mood): mood is Mood => Boolean(mood));
    const preservedPulse = keys
      .map((key) => localPulseByKey.get(key))
      .find((pulse): pulse is string => Boolean(pulse));

    return {
      ...record,
      mood: isMarkedMood(record.mood) ? record.mood : (preservedMood ?? record.mood ?? UNMARKED_MOOD),
      pulse: record.pulse ?? preservedPulse,
    };
  });
};

const getBpRecordDateKey = (record: BpRecord): string | null => {
  const timestamp = getBpRecordTimestamp(record);
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getShortRecordDateLabel = (record: BpRecord, fallback: string) => {
  const dateKey = getBpRecordDateKey(record);
  if (!dateKey) return fallback;
  const [, month, day] = dateKey.split('-');
  return `${Number(month)}/${Number(day)}`;
};

const getDailyBpSummaries = (items: BpRecord[]): DailyBpSummary[] => {
  const groups: Record<string, { sys: number[]; dia: number[] }> = {};

  items.forEach((record) => {
    const dateKey = getBpRecordDateKey(record);
    const sys = Number(record.sys);
    const dia = Number(record.dia);
    if (!dateKey || !Number.isFinite(sys) || !Number.isFinite(dia)) return;

    if (!groups[dateKey]) groups[dateKey] = { sys: [], dia: [] };
    groups[dateKey].sys.push(sys);
    groups[dateKey].dia.push(dia);
  });

  return Object.entries(groups)
    .map(([dateKey, values]) => {
      const avgSys = Math.round(values.sys.reduce((sum, value) => sum + value, 0) / values.sys.length);
      const avgDia = Math.round(values.dia.reduce((sum, value) => sum + value, 0) / values.dia.length);
      const [, month, day] = dateKey.split('-');

      return {
        dateKey,
        label: `${Number(month)}/${Number(day)}`,
        avgSys,
        avgDia,
        count: values.sys.length,
        minSys: Math.min(...values.sys),
        maxSys: Math.max(...values.sys),
        minDia: Math.min(...values.dia),
        maxDia: Math.max(...values.dia),
      };
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
};

const getDailyBpWarnings = (summaries: DailyBpSummary[]): string[] =>
  summaries
    .filter((day) =>
      day.avgSys >= 180 ||
      day.avgDia >= 120 ||
      day.avgSys >= 140 ||
      day.avgDia >= 90 ||
      day.avgSys < 90 ||
      day.avgDia < 60 ||
      day.maxSys - day.minSys >= 20 ||
      day.maxDia - day.minDia >= 10
    )
    .slice(-3)
    .map((day) => {
      if (day.avgSys >= 180 || day.avgDia >= 120) {
        return `${day.label} 平均達超高血壓提醒 (${day.avgSys}/${day.avgDia})`;
      }
      if (day.avgSys >= 140 || day.avgDia >= 90) {
        return `${day.label} 平均偏高 (${day.avgSys}/${day.avgDia})`;
      }
      if (day.avgSys < 90 || day.avgDia < 60) {
        return `${day.label} 平均偏低 (${day.avgSys}/${day.avgDia})`;
      }
      return `${day.label} 同日波動較大 (${day.count} 筆)`;
    });

// ─── 1. 即時測量分頁 ──────────────────────────────────────────────────────────
const getAbnormalBpDetails = (items: BpRecord[]): AbnormalBpDetail[] => {
  const abnormalRows = sortRecordsNewestFirst(items)
    .filter((record) => {
      const status = getBpRecordStatus(record);
      return Boolean(status?.isAbnormal);
    })
    .map((record, index) => {
      const status = getBpRecordStatus(record);
      const [date = '未知日期', time = '未知時間'] = (record.time || '').split(' ');
      return {
        key: `${getBpRecordPrimaryKey(record)}-${index}`,
        date,
        time: time.slice(0, 5) || time,
        sys: record.sys,
        dia: record.dia,
        pulse: record.pulse,
        level: status?.level ?? record.level,
        color: status?.color ?? getBpLevelColor(record.level),
        mood: record.mood,
      };
    });

  return abnormalRows.slice(0, 12);
};

const getMiniChartPositionPercent = (value: number) =>
  Math.min(Math.max((value - 40) / (180 - 40), 0), 1) * 100;

const getMiniChartBarHeight = (value: number) =>
  Math.max(getMiniChartPositionPercent(value), 8);

const isAbnormalBpRecord = (record: BpRecord): boolean => {
  const sys = Number(record.sys);
  const dia = Number(record.dia);
  return Number.isFinite(sys) && Number.isFinite(dia) && getBpStatusFromValues(sys, dia).isAbnormal;
};

const getBpRecordStatus = (record?: BpRecord): BpStatus | null => {
  if (!record) return null;
  const sys = Number(record.sys);
  const dia = Number(record.dia);
  if (!Number.isFinite(sys) || !Number.isFinite(dia)) return null;
  return getBpStatusFromValues(sys, dia);
};

const sortRecordsAbnormalFirst = (items: BpRecord[]) =>
  [...items].sort((a, b) => {
    const abnormalDiff = Number(isAbnormalBpRecord(b)) - Number(isAbnormalBpRecord(a));
    if (abnormalDiff !== 0) return abnormalDiff;
    return getBpRecordTimestamp(b) - getBpRecordTimestamp(a);
  });

const HomeScreen = ({
  user, bp, setBp, handleOCR, autoSaveRecord, lastRecord, recentRecords = [], onSync, isSyncing, onUpdateMood,
}: any) => {
  const dailyTrend = useMemo(
    () => getDailyBpSummaries(recentRecords).slice(-5),
    [recentRecords]
  );
  const dailyWarnings = useMemo(
    () => getDailyBpWarnings(dailyTrend),
    [dailyTrend]
  );
  const abnormalDetails = useMemo(
    () => getAbnormalBpDetails(recentRecords),
    [recentRecords]
  );

  const [isLatestMoodModalVisible, setIsLatestMoodModalVisible] = useState(false);
  const [isAbnormalModalVisible, setIsAbnormalModalVisible] = useState(false);
  const abnormalModalTranslateY = useRef(new Animated.Value(0)).current;
  const abnormalModalPanResponder = useMemo(
    () => createSwipeDownDismissPanResponder(abnormalModalTranslateY, () => setIsAbnormalModalVisible(false)),
    [abnormalModalTranslateY]
  );

  const updateLatestMood = (mood: Mood) => {
    if (!lastRecord) return;
    onUpdateMood(getBpRecordPrimaryKey(lastRecord), mood);
    setIsLatestMoodModalVisible(false);
  };
  const latestStatus = getBpRecordStatus(lastRecord);

  return (
  <SafeAreaView style={styles.container}>
    <View style={styles.header}>
      <Text style={styles.title}>👤 使用者：{user?.email}</Text>
    </View>
    <ScrollView
      style={styles.inputArea}
      contentContainerStyle={styles.inputAreaContent}
      keyboardShouldPersistTaps="handled"
    >

      <View style={styles.latestCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIcon}><Text style={{ color: '#fff', fontSize: 12 }}>❤️</Text></View>
          <View style={styles.cardHeaderInfo}>
            <Text style={styles.cardHeaderText}>血壓</Text>
            <Text style={styles.cardHeaderTime}>{lastRecord ? lastRecord.time : '尚無數據'}</Text>
          </View>
          {latestStatus && (
            <View style={[styles.bpStatusPill, { backgroundColor: latestStatus.color }]}>
              <Text style={styles.bpStatusPillText}>{latestStatus.level}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <View style={styles.valueWrapper}>
            <View style={styles.bpValueBlock}>
              <Text style={styles.valueLabel}>收縮壓</Text>
              <Text style={styles.bigBpText}>{lastRecord ? lastRecord.sys : '--'}</Text>
            </View>
            <View style={styles.bpDivider} />
            <View style={styles.bpValueBlock}>
              <Text style={styles.valueLabel}>舒張壓</Text>
              <Text style={styles.bigBpText}>{lastRecord ? lastRecord.dia : '--'}</Text>
            </View>
            <View style={styles.bpDivider} />
            <View style={styles.bpValueBlock}>
              <Text style={styles.valueLabel}>脈搏</Text>
              <Text style={styles.bigBpText}>{lastRecord?.pulse || '--'}</Text>
            </View>
            <Text style={styles.unitText}>mmHg / bpm</Text>
          </View>
          <TouchableOpacity
            style={styles.latestMoodRow}
            onPress={() => lastRecord && setIsLatestMoodModalVisible(true)}
            disabled={!lastRecord}
          >
            <Text style={styles.latestMoodLabel}>心情狀態</Text>
            <Text style={styles.latestMoodValue}>
              {lastRecord ? `${getMoodEmoji(lastRecord.mood)} ${lastRecord.mood || UNMARKED_MOOD}` : '--'}
            </Text>
          </TouchableOpacity>

          <View style={styles.miniTrendHeader}>
            <Text style={styles.miniTrendTitle}>近五日平均數據</Text>
            <View style={styles.chartLegend}>
              <View style={styles.chartLegendItem}>
                <View style={[styles.chartLegendDot, { backgroundColor: '#1890ff' }]} />
                <Text style={styles.chartLegendText}>收縮壓</Text>
              </View>
              <View style={styles.chartLegendItem}>
                <View style={[styles.chartLegendDot, { backgroundColor: '#52c41a' }]} />
                <Text style={styles.chartLegendText}>舒張壓</Text>
              </View>
            </View>
          </View>
          <View style={styles.scaleWrapper}>
            <View style={[styles.limitLine, { bottom: `${getMiniChartPositionPercent(130)}%` }]}><Text style={styles.limitText}>130</Text></View>
            <View style={[styles.limitLine, { bottom: `${getMiniChartPositionPercent(80)}%` }]}><Text style={styles.limitText}>80</Text></View>

            <View style={styles.baseLine} />
            <View style={styles.miniTrendContainer}>
              {dailyTrend.map((day) => {
                const sysHeight = getMiniChartBarHeight(day.avgSys);
                const diaHeight = getMiniChartBarHeight(day.avgDia);
                return (
                  <View key={day.dateKey} style={styles.miniTrendPoint}>
                    <View style={styles.miniTrendBarGroup}>
                      <Text style={[styles.sysBarValue, { bottom: sysHeight + 2 }]} numberOfLines={1}>{day.avgSys}</Text>
                      <View style={[styles.miniTrendBar, { height: sysHeight }]} />
                    </View>
                    <View style={styles.miniTrendBarGroup}>
                      <Text style={[styles.diaBarValue, { bottom: diaHeight + 2 }]} numberOfLines={1}>{day.avgDia}</Text>
                      <View style={[styles.miniTrendBar, styles.miniTrendBarDia, { height: diaHeight }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
          <View style={styles.weekLabelsContainer}>
            {dailyTrend.map((day) => (
              <Text key={day.dateKey} style={styles.weekLabelText} numberOfLines={1}>{day.label}</Text>
            ))}
          </View>
          <View style={styles.referenceLegend}>
            <Text style={styles.referenceLegendText}>130 代表收縮壓偏高提醒，80 代表舒張壓偏高提醒</Text>
          </View>
        </View>

        {dailyWarnings.length > 0 && (
          <View style={styles.bpWarningBox}>
            {dailyWarnings.map((warning) => (
              <Text key={warning} style={styles.bpWarningText}>{warning}</Text>
            ))}
            <TouchableOpacity style={styles.abnormalDetailBtn} onPress={() => setIsAbnormalModalVisible(true)}>
              <Text style={styles.abnormalDetailBtnText}>查看異常時間數據</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={styles.actionSectionTitle}>自動匯入</Text>
      <TouchableOpacity
        style={[styles.ocrBtn, { backgroundColor: '#52c41a', opacity: isSyncing ? 0.6 : 1 }]}
        onPress={() => onSync(true)}
        disabled={isSyncing}
      >
        <Text style={styles.saveBtnText}>
          {isSyncing ? '⏳ 同步中...' : '🔄 從 Health Connect 同步 (OMRON)'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.ocrBtn} onPress={handleOCR}>
        <Text style={styles.saveBtnText}>📸 拍照辨識血壓計</Text>
      </TouchableOpacity>

      <Text style={styles.actionSectionTitle}>新增一筆紀錄</Text>
      <View style={styles.inputRow}>
        <View style={styles.inputField}>
          <Text style={styles.inputLabel}>收縮壓</Text>
          <View style={styles.inputValueRow}>
            <TextInput
              style={styles.inputControl}
              placeholder="120"
              keyboardType="numeric"
              value={bp.sys}
              onChangeText={(t) => setBp({ ...bp, sys: t })}
              blurOnSubmit={false}
            />
            <Text style={styles.inputUnit}>mmHg</Text>
          </View>
        </View>
        <View style={styles.inputField}>
          <Text style={styles.inputLabel}>舒張壓</Text>
          <View style={styles.inputValueRow}>
            <TextInput
              style={styles.inputControl}
              placeholder="80"
              keyboardType="numeric"
              value={bp.dia}
              onChangeText={(t) => setBp({ ...bp, dia: t })}
              blurOnSubmit={false}
            />
            <Text style={styles.inputUnit}>mmHg</Text>
          </View>
        </View>
        <View style={styles.inputField}>
          <Text style={styles.inputLabel}>脈搏</Text>
          <View style={styles.inputValueRow}>
            <TextInput
              style={styles.inputControl}
              placeholder="72"
              keyboardType="numeric"
              value={bp.pulse}
              onChangeText={(t) => setBp({ ...bp, pulse: t })}
              blurOnSubmit={false}
            />
            <Text style={styles.inputUnit}>bpm</Text>
          </View>
        </View>
      </View>
      <View style={styles.moodPicker}>
        {MOOD_OPTIONS.map((option) => {
          const selected = bp.mood === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.moodChip, selected && styles.moodChipSelected]}
              onPress={() => setBp({ ...bp, mood: option.value })}
            >
              <Text style={styles.moodEmoji}>{option.emoji}</Text>
              <Text style={[styles.moodLabel, selected && styles.moodLabelSelected]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={styles.saveBtn} onPress={() => autoSaveRecord(bp)}>
        <Text style={styles.saveBtnText}>💾 儲存血壓數據</Text>
      </TouchableOpacity>
      <Modal
        animationType="slide"
        transparent
        visible={isAbnormalModalVisible}
        onRequestClose={() => setIsAbnormalModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismissArea} onPress={() => setIsAbnormalModalVisible(false)} />
          <Animated.View style={[styles.abnormalRecordsModal, { transform: [{ translateY: abnormalModalTranslateY }] }]}>
            <View style={styles.modalDragHandleArea} {...abnormalModalPanResponder.panHandlers}>
              <View style={styles.modalDragHandle} />
            </View>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>異常時間數據</Text>
                <Text style={styles.modalSubtitle}>最近 {abnormalDetails.length} 筆偏高或偏低紀錄</Text>
              </View>
              <TouchableOpacity onPress={() => setIsAbnormalModalVisible(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>關閉</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={abnormalDetails}
              keyExtractor={(item) => item.key}
              contentContainerStyle={styles.abnormalRecordsList}
              ListEmptyComponent={<Text style={styles.emptyDayText}>目前沒有偏高或偏低的單筆紀錄</Text>}
              renderItem={({ item }) => (
                <View style={styles.abnormalRecordCard}>
                  <View style={styles.abnormalRecordTop}>
                    <View>
                      <Text style={styles.abnormalRecordDate}>{item.date}</Text>
                      <Text style={styles.abnormalRecordTime}>{item.time}</Text>
                    </View>
                    <View style={[styles.abnormalRecordLevel, { backgroundColor: item.color }]}>
                      <Text style={styles.abnormalRecordLevelText}>{item.level}</Text>
                    </View>
                  </View>
                  <View style={styles.abnormalRecordValueRow}>
                    <Text style={styles.abnormalRecordValue}>{item.sys}/{item.dia}</Text>
                    <Text style={styles.abnormalRecordUnit}>mmHg</Text>
                    <Text style={styles.abnormalRecordPulse}>脈搏 {item.pulse || '--'} bpm</Text>
                  </View>
                  <Text style={styles.abnormalRecordMood}>心情：{getMoodEmoji(item.mood)} {item.mood || UNMARKED_MOOD}</Text>
                </View>
              )}
            />
          </Animated.View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        transparent
        visible={isLatestMoodModalVisible}
        onRequestClose={() => setIsLatestMoodModalVisible(false)}
      >
        <View style={styles.centerModalBackdrop}>
          <View style={styles.moodSelectModal}>
            <Text style={styles.moodSelectTitle}>修改這筆心情狀態</Text>
            <View style={styles.moodSelectGrid}>
              {MOOD_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={`latest-${option.value}`}
                  style={[
                    styles.moodSelectChip,
                    lastRecord?.mood === option.value && styles.moodSelectChipSelected,
                  ]}
                  onPress={() => updateLatestMood(option.value)}
                >
                  <Text style={styles.moodEmoji}>{option.emoji}</Text>
                  <Text style={styles.moodLabel}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.moodSelectCancelBtn} onPress={() => setIsLatestMoodModalVisible(false)}>
              <Text style={styles.moodSelectCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  </SafeAreaView>
  );
};

// ─── 2. 趨勢分析分頁 ──────────────────────────────────────────────────────────
const TrendScreen = ({ records, healthAdvice }: any) => {
  const lastSeven = [...records].slice(0, 7).reverse();
  const moodStressAnalysis = getMoodStressAnalysis(records);
  const pulseMoodAnalysis = getPulseMoodAnalysis(records);
  const pulseValues = lastSeven.map((r: any) => toFiniteNumber(r.pulse));
  const validPulseValues = pulseValues.filter((value): value is number => value != null);
  const hasPulseData = validPulseValues.length > 0;
  const latestPulse = validPulseValues[validPulseValues.length - 1];
  const avgPulse = hasPulseData
    ? Math.round(validPulseValues.reduce((sum, value) => sum + value, 0) / validPulseValues.length)
    : null;
  const chartData = {
    labels: lastSeven.length > 0
      ? lastSeven.map((record: BpRecord, i: number) => getShortRecordDateLabel(record, `${i + 1}`))
      : ['0'],
    datasets: [
      {
        data: lastSeven.length > 0 ? lastSeven.map((r: any) => Number(r.sys)) : [0],
        color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
        strokeWidth: 3,
      },
      {
        data: lastSeven.length > 0 ? lastSeven.map((r: any) => Number(r.dia)) : [0],
        color: (opacity = 0.6) => `rgba(100, 255, 218, ${opacity})`,
        strokeWidth: 2,
      },
    ],
    legend: ['收縮壓', '舒張壓'],
  };
  const openMoodAnalysisSource = useCallback(() => {
    Linking.openURL(MOOD_ANALYSIS_SOURCE_URL).catch(() => {
      Alert.alert('無法開啟連結', '請稍後再試。');
    });
  }, []);
  const openPulseAnalysisSource = useCallback(() => {
    Linking.openURL(PULSE_ANALYSIS_SOURCE_URL).catch(() => {
      Alert.alert('無法開啟連結', '請稍後再試。');
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.trendContent}>
      <View style={styles.analysisCard}>
        <Text style={styles.analysisTitle}>📊 近七次趨勢圖表</Text>
        <View style={styles.chartFrame}>
          <Text style={[styles.chartAxisTag, styles.chartYAxisTag]}>mmHg</Text>
          <View style={styles.shiftedChart}>
            <LineChart
              data={chartData}
              width={Dimensions.get('window').width - 50}
              height={220}
              chartConfig={{
                backgroundGradientFrom: '#154360',
                backgroundGradientTo: '#051937',
                color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                propsForDots: { r: '5', strokeWidth: '2', stroke: '#ffa726' },
                propsForHorizontalLabels: { fontSize: 9 },
                propsForVerticalLabels: { fontSize: 10 },
              }}
              bezier
              style={styles.chartStyle}
            />
          </View>
        </View>
        <View style={styles.adviceBox}>
          <Text style={styles.adviceText}>{healthAdvice}</Text>
        </View>
        {hasPulseData && (
          <View style={styles.pulseSummaryBox}>
            <View style={styles.pulseSummaryItem}>
              <Text style={styles.pulseSummaryLabel}>近七次平均脈搏</Text>
              <Text style={styles.pulseSummaryValue}>{avgPulse} bpm</Text>
            </View>
            <View style={styles.pulseSummaryDivider} />
            <View style={styles.pulseSummaryItem}>
              <Text style={styles.pulseSummaryLabel}>最近一次脈搏</Text>
              <Text style={styles.pulseSummaryValue}>{latestPulse} bpm</Text>
            </View>
          </View>
        )}
        <View style={styles.moodAnalysisBox}>
          <Text style={styles.moodAnalysisTitle}>血壓與心理狀態關聯性分析</Text>
          <Text style={styles.analysisLabel}>觀察</Text>
          <Text style={styles.moodAnalysisText}>{moodStressAnalysis}</Text>
          <Text style={styles.analysisLabel}>來源</Text>
          <Text style={styles.moodSourceText}>
            <Text style={styles.moodSourceLink} onPress={openMoodAnalysisSource}>
              American Heart Association 壓力與血壓衛教
            </Text>
            ；交感神經壓力反應可能使心跳加快、血管收縮並短暫升高血壓。本分析僅供參考，不能取代醫療診斷。
          </Text>
        </View>
        <View style={styles.pulseAnalysisBox}>
          <Text style={styles.pulseAnalysisTitle}>脈搏與身心調節分析</Text>
          <Text style={styles.analysisLabel}>觀察</Text>
          <Text style={styles.pulseAnalysisText}>{pulseMoodAnalysis}</Text>
          <Text style={styles.analysisLabel}>來源</Text>
          <Text style={styles.pulseSourceText}>
            <Text style={styles.pulseSourceLink} onPress={openPulseAnalysisSource}>
              Harvard Health Publishing 壓力反應指南
            </Text>
            ；當心理面臨焦慮時，交感神經刺激會促使心跳加快（BPM上升）以應對外在威脅。本分析非醫療診斷，若持續心悸請諮詢專業醫師。
          </Text>
        </View>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ─── 3. 血壓日記分頁 ──────────────────────────────────────────────────────────
const DiaryRecordItem = ({ item, onUpdateMood }: { item: BpRecord; onUpdateMood: (recordKey: string, mood: Mood) => void }) => {
  const recordStatus = getBpRecordStatus(item);

  return (
    <View style={styles.recordItem}>
      <View style={styles.recordLeft}>
        <Text style={styles.recordText}>{item?.time?.split(' ')[1] || '未知'}</Text>
        <View style={styles.recordValueRow}>
          <Text style={styles.recordVal}>{item?.sys}/{item?.dia} mmHg</Text>
          <Text style={styles.recordMoodIcon}>{getMoodEmoji(item?.mood)}</Text>
        </View>
        <Text style={styles.recordPulse}>脈搏 {item?.pulse || '--'} bpm</Text>
        <Text style={styles.recordMoodLabel}>心情：{item?.mood || UNMARKED_MOOD}</Text>
        <View style={styles.recordMoodPicker}>
          {MOOD_OPTIONS.map((option) => {
            const selected = item?.mood === option.value;
            return (
              <TouchableOpacity
                key={`${getBpRecordPrimaryKey(item)}-${option.value}`}
                style={[styles.recordMoodChip, selected && styles.recordMoodChipSelected]}
                onPress={() => onUpdateMood(getBpRecordPrimaryKey(item), option.value)}
              >
                <Text style={styles.recordMoodChipText}>{option.emoji}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={[
        styles.levelTag,
        { backgroundColor: recordStatus?.color ?? getBpLevelColor(item?.level) },
      ]}>
        <Text style={styles.levelTagText}>{recordStatus?.level ?? item?.level}</Text>
      </View>
    </View>
  );
};

const DiaryScreen = ({ records, selectedDate, setSelectedDate, exportToCSV, onUpdateMood }: any) => {
  const todayDateKey = new Date().toISOString().split('T')[0];
  const dateMap: Record<string, BpRecord[]> = {};
  records.forEach((r: any) => {
    if (r && r.time) {
      const datePart = r.time.split(' ')[0].replace(/\//g, '-');
      if (!dateMap[datePart]) dateMap[datePart] = [];
      dateMap[datePart].push(r);
    }
  });
  const currentDayRecords = sortRecordsAbnormalFirst(dateMap[selectedDate] || []);
  const todayRecords = sortRecordsAbnormalFirst(dateMap[todayDateKey] || []);
  const [isDayModalVisible, setIsDayModalVisible] = useState(false);
  const [hasPickedDate, setHasPickedDate] = useState(false);
  const dayModalTranslateY = useRef(new Animated.Value(0)).current;
  const dayModalPanResponder = useMemo(
    () => createSwipeDownDismissPanResponder(dayModalTranslateY, () => setIsDayModalVisible(false)),
    [dayModalTranslateY]
  );
  const displayedRecords = hasPickedDate ? currentDayRecords : todayRecords;
  const emptyRecordText = hasPickedDate ? '這天沒有血壓紀錄' : '今天還沒有血壓紀錄';
  const openDayRecords = (dateString: string) => {
    setHasPickedDate(true);
    setSelectedDate(dateString);
    setIsDayModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.diaryContent} showsVerticalScrollIndicator={false}>
        <Calendar
          onDayPress={(day: any) => openDayRecords(day.dateString)}
          dayComponent={({ date, state }: any) => {
            const dStr = date.dateString;
            const hasData = dateMap[dStr];
            const hasAbnormalData = Boolean(hasData?.some(isAbnormalBpRecord));
            const displayRecord = hasData ? sortRecordsAbnormalFirst(hasData)[0] : undefined;
            const displayRecordStatus = getBpRecordStatus(displayRecord);
            return (
              <TouchableOpacity
                onPress={() => openDayRecords(dStr)}
                style={[
                  styles.customDay,
                  hasAbnormalData && styles.abnormalDay,
                  selectedDate === dStr && styles.selectedDay,
                ]}
              >
                {hasAbnormalData && (
                <Text style={styles.abnormalDayIcon}>⚠️</Text>
              )}
              <Text style={[styles.dayLabel, state === 'disabled' && { color: '#ccc' }]}>{date.day}</Text>
              {displayRecord && (
                <Text style={[styles.dayValue, { color: displayRecordStatus?.color ?? getBpLevelColor(displayRecord.level) }]}>
                  {displayRecord.sys}/{displayRecord.dia}
                </Text>
              )}
            </TouchableOpacity>
            );
          }}
        />
        <View style={styles.calendarLegend}>
          <Text style={styles.calendarLegendText}>⚠️ 代表當日有偏高或偏低紀錄</Text>
        </View>
        <View style={styles.diaryDetailHeader}>
          <Text style={styles.detailTitle}>{hasPickedDate ? `已選擇 ${selectedDate}` : `今天 ${todayDateKey} 紀錄`}</Text>
          <TouchableOpacity onPress={exportToCSV} style={styles.miniBtn}>
            <Text style={{ color: '#fff', fontSize: 12 }}>匯出</Text>
          </TouchableOpacity>
        </View>
        <View>
          {displayedRecords.length === 0 ? (
            <Text style={styles.emptyDayText}>{emptyRecordText}</Text>
          ) : (
            displayedRecords.map((item, index) => (
              <DiaryRecordItem
                key={`${getBpRecordPrimaryKey(item)}-${index}`}
                item={item}
                onUpdateMood={onUpdateMood}
              />
            ))
          )}
        </View>
      </ScrollView>
      <Modal
        animationType="slide"
        transparent
        visible={isDayModalVisible}
        onRequestClose={() => setIsDayModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismissArea} onPress={() => setIsDayModalVisible(false)} />
          <Animated.View style={[styles.dayRecordsModal, { transform: [{ translateY: dayModalTranslateY }] }]}>
            <View style={styles.modalDragHandleArea} {...dayModalPanResponder.panHandlers}>
              <View style={styles.modalDragHandle} />
            </View>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📋 {selectedDate} 紀錄</Text>
              <TouchableOpacity onPress={() => setIsDayModalVisible(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>關閉</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={currentDayRecords}
              keyExtractor={(item, index) => `${getBpRecordPrimaryKey(item)}-${index}`}
              ListEmptyComponent={<Text style={styles.emptyDayText}>這天沒有血壓紀錄</Text>}
              renderItem={({ item }) => (
                <DiaryRecordItem item={item} onUpdateMood={onUpdateMood} />
              )}
            />
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ─── App 主組件 ───────────────────────────────────────────────────────────────
const App = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bp, setBp] = useState<{ sys: string; dia: string; pulse: string; mood: Mood }>({
    sys: '',
    dia: '',
    pulse: '',
    mood: UNMARKED_MOOD,
  });
  const [records, setRecords] = useState<BpRecord[]>([]);
  const [healthAdvice, setHealthAdvice] = useState('讀取中...');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [pendingMoodRecords, setPendingMoodRecords] = useState<BpRecord[]>([]);
  const [isSyncMoodModalVisible, setIsSyncMoodModalVisible] = useState(false);
  const syncMoodModalTranslateY = useRef(new Animated.Value(0)).current;
  const syncMoodModalPanResponder = useMemo(
    () => createSwipeDownDismissPanResponder(syncMoodModalTranslateY, () => setIsSyncMoodModalVisible(false)),
    [syncMoodModalTranslateY]
  );

  // ── 修復核心：分離「服務可用」與「原生 launcher 已初始化」兩個狀態 ──
  const [isHealthAvailable, setIsHealthAvailable] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const isMountedRef = useRef(false);
  const healthInitPromiseRef = useRef<Promise<boolean> | null>(null);

  // 1. Firebase Auth 監聽
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const ensureHealthConnectReady = useCallback(async () => {
    if (Platform.OS !== 'android') return false;

    if (!healthInitPromiseRef.current) {
      healthInitPromiseRef.current = (async () => {
        await waitForNativeActivityReady();
        const initialized = await initialize();
        if (isMountedRef.current) {
          setIsHealthAvailable(Boolean(initialized));
        }
        return Boolean(initialized);
      })().finally(() => {
        healthInitPromiseRef.current = null;
      });
    }

    return healthInitPromiseRef.current;
  }, []);

  useEffect(() => {
    const subscriber = auth().onAuthStateChanged((userState) => {
      setUser(userState);
      setLoading(false);
    });
    return subscriber;
  }, []);

  // 2. Health Connect 初始化
  //    initialize() 只確認服務存在，不代表原生 launcher 已就緒。
  //    原生 launcher (requestPermission) 的初始化是在 MainActivity.onCreate()
  //    由套件自動完成，只要 AndroidManifest.xml 設定正確即可。
  //    這裡僅用來控制 UI 是否顯示同步按鈕。
  useEffect(() => {
    const initHealth = async () => {
      try {
        const result = await ensureHealthConnectReady();
        if (result) {
          console.log('[HealthConnect] 初始化成功');
          setIsHealthAvailable(true);
        } else {
          console.warn('[HealthConnect] 初始化回傳 false，裝置可能不支援');
        }
      } catch (e) {
        console.error('[HealthConnect] 初始化例外：', e);
      }
    };
    initHealth();
  }, [ensureHealthConnectReady]);

  // 3. 血壓健康建議
  const analyzeHealth = useCallback((allRecords: BpRecord[]) => {
    if (allRecords.length === 0) { setHealthAdvice('尚無紀錄'); return; }
    const recent = allRecords.slice(0, 7);
    const severeRecord = recent.find((record) => {
      const sys = Number(record.sys);
      const dia = Number(record.dia);
      return Number.isFinite(sys) && Number.isFinite(dia) && getBpLevel(sys, dia) === '超高血壓';
    });
    if (severeRecord) {
      setHealthAdvice('🚨 超高血壓提醒：請先安靜休息 1 分鐘後再量一次；若仍接近 180/120 或有胸痛、喘、無力、視力改變、說話困難等症狀，請立即就醫或撥打緊急電話。');
      return;
    }
    const emotionLinkedHighRecord = recent.find((record) => {
      const sys = Number(record.sys);
      return Number.isFinite(sys) && sys > 140 && isStressMood(record.mood);
    });
    if (emotionLinkedHighRecord) {
      setHealthAdvice('數值偏高可能與您當前的情緒壓力有關，建議靜坐 5 分鐘後再次測量。');
      return;
    }
    const avgSys = recent.reduce((sum, r) => sum + Number(r.sys), 0) / recent.length;
    const avgDia = recent.reduce((sum, r) => sum + Number(r.dia), 0) / recent.length;
    if (avgSys >= 180 || avgDia >= 120) setHealthAdvice('🚨 警示：近期平均值已達超高血壓提醒範圍，請儘快與醫師聯絡評估。');
    else if (avgSys >= 140) setHealthAdvice('⚠️ 警示：近期平均血壓偏高（高血壓）。請諮詢醫師。');
    else if (avgSys >= 120) setHealthAdvice('🔔 提醒：血壓處於「前期」範圍，建議留意飲食與作息。');
    else                    setHealthAdvice('✅ 正常：血壓控制良好，請繼續保持！');
  }, []);

  // 4. 載入本地 + 雲端數據
  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      let local: BpRecord[] = [];
      try {
        const saved = await AsyncStorage.getItem(`bp_records_${user.uid}`);
        if (saved) {
          local = sortRecordsNewestFirst(JSON.parse(saved));
          setRecords(local);
          analyzeHealth(local);
        }
      } catch {}
      try {
        const res = await axios.get(`${API_URL}?userId=${user.uid}`);
        const remote: BpRecord[] = mergeRecordsPreservingLocalMood(sortRecordsNewestFirst(res.data), local);
        setRecords(remote);
        analyzeHealth(remote);
      } catch {
        console.log('[API] 雲端獲取失敗，使用本地數據');
      }
    };
    loadData();
  }, [user, analyzeHealth]);

  // 5. Health Connect 同步（修復版）
  const syncHealthData = async (isManual = false) => {
    // 防止重複點擊
    if (isSyncing) return;

    // Health Connect 服務未就緒
    if (!isHealthAvailable && !(await ensureHealthConnectReady())) {
      if (isManual) Alert.alert('提示', '健康連結服務未就緒，請確認已安裝 Health Connect App');
      return;
    }

    setIsSyncing(true);

    try {
      // ── 步驟 A：先檢查現有權限，避免每次都彈出授權視窗 ──
      let alreadyGranted = false;
      try {
        const granted = await getGrantedPermissions();
        const grantedReadTypes = new Set(
          Array.isArray(granted)
            ? granted.filter((p: any) => p.accessType === 'read').map((p: any) => p.recordType)
            : []
        );
        alreadyGranted = HEALTH_CONNECT_PERMISSIONS.every((p) => grantedReadTypes.has(p.recordType));
      } catch {
        // getGrantedPermissions 在部分舊版不存在，忽略錯誤
        console.warn('[HealthConnect] getGrantedPermissions 不支援，跳過預檢');
      }

      // ── 步驟 B：尚未授權才呼叫 requestPermission ──
      if (!alreadyGranted) {
        console.log('[HealthConnect] 發起授權請求...');
        await waitForNativeActivityReady();
        const result = await requestPermission([...HEALTH_CONNECT_PERMISSIONS]);
        if (!Array.isArray(result) || result.length === 0) {
          if (isManual) Alert.alert('權限不足', '請在「健康連結」App 中授予血壓讀取權限\n\n設定 → 應用程式 → 健康連結 → 應用程式權限');
          return;
        }
        console.log('[HealthConnect] 已獲得授權');
      } else {
        console.log('[HealthConnect] 已有授權，略過授權請求');
      }

      // ── 步驟 C：讀取數據 ──
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000); // 近 30 天

      console.log(`[HealthConnect] 讀取 ${startTime.toISOString()} ~ ${endTime.toISOString()}`);

      const result = await readRecords('BloodPressure', {
        timeRangeFilter: {
          operator: 'between',
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        },
      });

      const healthRecords = Array.isArray(result?.records) ? result.records : [];
      let heartRateRecords: any[] = [];

      try {
        const heartRateResult = await readRecords('HeartRate', {
          timeRangeFilter: {
            operator: 'between',
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
          },
        });
        heartRateRecords = Array.isArray(heartRateResult?.records) ? heartRateResult.records : [];
      } catch (e) {
        console.warn('[HealthConnect] 心率讀取失敗，這次只同步血壓：', e);
      }

      if (!healthRecords.length) {
        if (isManual) Alert.alert('無新數據', '近 30 天在健康連結中查無血壓紀錄\n\n請確認歐姆龍 App 已完成同步');
        return;
      }

      console.log(`[HealthConnect] 取得 ${healthRecords.length} 筆原始數據`);

      // ── 步驟 D：資料轉換 ──
      const newRecords = healthRecords
        .map((record: any) => {
          // 相容不同版本的 API 回傳格式
          const s = getMillimetersOfMercury(record?.systolic);
          const d = getMillimetersOfMercury(record?.diastolic);
          const rDate = getBloodPressureRecordTime(record);

          if (s == null || d == null || !rDate) return null;

          const sNum = Math.round(s);
          const dNum = Math.round(d);
          const pulse = getPulseFromBloodPressureRecord(record) ?? getPulseFromHeartRateRecords(heartRateRecords, rDate);
          const timeStr = `${rDate.getFullYear()}/${String(rDate.getMonth() + 1).padStart(2, '0')}/${String(rDate.getDate()).padStart(2, '0')} ${rDate.toLocaleTimeString('zh-TW', { hour12: false })}`;
          const level = getBpLevel(sNum, dNum);
          const metadataId = typeof record.metadata?.id === 'string' ? record.metadata.id : null;
          const syncKey = metadataId || getStableBpSyncKey(sNum, dNum, rDate);

          return {
            sys: sNum.toString(),
            dia: dNum.toString(),
            pulse: pulse != null ? pulse.toString() : undefined,
            mood: UNMARKED_MOOD,
            level,
            time: timeStr,
            id: metadataId || syncKey,
            syncKey,
            userId: user?.uid,
          } as BpRecord;
        })
        .filter((r): r is BpRecord => r !== null);

      // ── 步驟 E：去重（metadata id + 穩定的時間/數值 key）──
      const existingKeys = new Set(records.flatMap(getBpRecordIdentityKeys));
      let updatedExistingRecords = records;
      let pulseBackfillCount = 0;
      const toSave: BpRecord[] = [];

      for (const record of newRecords) {
        const identity = getBpRecordIdentity(record);
        const isDuplicate = identity.keys.some((key) => existingKeys.has(key));
        if (isDuplicate) {
          if (record.pulse) {
            let didBackfillPulse = false;
            updatedExistingRecords = updatedExistingRecords.map((existingRecord) => {
              const existingKeysForRecord = getBpRecordIdentityKeys(existingRecord);
              const isSameRecord = identity.keys.some((key) => existingKeysForRecord.includes(key));
              if (!isSameRecord || existingRecord.pulse) return existingRecord;
              didBackfillPulse = true;
              return { ...existingRecord, pulse: record.pulse };
            });
            if (didBackfillPulse) pulseBackfillCount += 1;
          }
          continue;
        }

        toSave.push(record);
        identity.keys.forEach((key) => existingKeys.add(key));
      }

      if (toSave.length === 0 && pulseBackfillCount === 0) {
        if (isManual) Alert.alert('已是最新', '沒有新的血壓紀錄需要同步');
        return;
      }

      // ── 步驟 F：儲存 ──
      const updated = sortRecordsNewestFirst([...toSave, ...updatedExistingRecords]);
      setRecords(updated);
      analyzeHealth(updated);

      // 本地快取
      try {
        await AsyncStorage.setItem(`bp_records_${user?.uid}`, JSON.stringify(updated));
      } catch (e) {
        console.warn('[AsyncStorage] 寫入失敗：', e);
      }

      // 上傳雲端（逐筆，失敗不影響主流程）
      for (const rec of toSave) {
        try { await axios.post(API_URL, rec); } catch {}
      }

      const unmarkedImportedRecords = toSave.filter((record) => !isMarkedMood(record.mood));
      if (unmarkedImportedRecords.length > 0) {
        setPendingMoodRecords(sortRecordsNewestFirst(unmarkedImportedRecords));
        setIsSyncMoodModalVisible(true);
      }

      const pendingMoodCount = unmarkedImportedRecords.length;
      Alert.alert(
        '同步完成 ✅',
        [
          `匯入新血壓：${toSave.length} 筆`,
          `補上脈搏：${pulseBackfillCount} 筆`,
          `待補心情：${pendingMoodCount} 筆`,
        ].join('\n')
      );

    } catch (e: any) {
      console.error('[HealthConnect] 同步錯誤：', e);
      if (isManual) {
        Alert.alert(
          '同步失敗',
          `錯誤訊息：${e?.message ?? '未知錯誤'}\n\n請確認：\n1. 歐姆龍 App 已連結健康連結\n2. 已授予血壓讀取權限\n3. 健康連結 App 版本是最新的`
        );
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // 6. 手動儲存血壓
  const autoSaveRecord = async (data: { sys: string; dia: string; pulse?: string; mood?: Mood }) => {
    if (!data.sys || !data.dia) {
      Alert.alert('提示', '請輸入收縮壓與舒張壓數值');
      return;
    }
    const s = Number(data.sys);
    const d = Number(data.dia);
    const p = data.pulse ? Number(data.pulse) : null;
    if (isNaN(s) || isNaN(d) || s < 60 || s > 250 || d < 40 || d > 150) {
      Alert.alert('數值異常', '請確認輸入的血壓數值是否正確');
      return;
    }
    if (p != null && (isNaN(p) || p < 30 || p > 220)) {
      Alert.alert('數值異常', '請確認輸入的脈搏數值是否正確');
      return;
    }
    const level = getBpLevel(s, d);
    const now = new Date();
    const timeStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${now.toLocaleTimeString('zh-TW', { hour12: false })}`;

    const newRecord: BpRecord = {
      sys: s.toString(),
      dia: d.toString(),
      pulse: p != null ? Math.round(p).toString() : undefined,
      mood: data.mood ?? UNMARKED_MOOD,
      level,
      time: timeStr,
      id: Date.now().toString(),
      userId: user?.uid,
    };

    const updated = sortRecordsNewestFirst([newRecord, ...records]);
    setRecords(updated);
    analyzeHealth(updated);
    setBp({ sys: '', dia: '', pulse: '', mood: UNMARKED_MOOD });

    try {
      await AsyncStorage.setItem(`bp_records_${user?.uid}`, JSON.stringify(updated));
      await axios.post(API_URL, newRecord);
      if (level === '超高血壓') {
        Alert.alert(
          '超高血壓提醒',
          '請先安靜休息 1 分鐘後再量一次；若仍接近 180/120，或有胸痛、喘、無力、視力改變、說話困難等症狀，請立即就醫或撥打緊急電話。'
        );
      } else {
        Alert.alert('儲存成功 💾');
      }
    } catch {
      Alert.alert(
        level === '超高血壓' ? '超高血壓提醒' : '儲存成功 💾',
        level === '超高血壓'
          ? '數據已存於本機。請先安靜休息 1 分鐘後再量一次；若仍接近 180/120 或有不適症狀，請立即就醫。'
          : '（雲端同步失敗，數據已存於本機）'
      );
    }
  };

  // 7. OCR 拍照辨識
  const handleOCR = async () => {
    const result: any = await launchCamera({ mediaType: 'photo', quality: 0.5 });
    if (result.assets && result.assets[0]?.uri) {
      try {
        const ocrResult = await TextRecognition.recognize(result.assets[0].uri);
        const nums = ocrResult.text.match(/\d{2,3}/g);
        if (nums && nums.length >= 2) {
          setBp((current) => ({ ...current, sys: nums[0], dia: nums[1], pulse: nums[2] || '' }));
        } else {
          Alert.alert('辨識失敗', '請確保血壓計螢幕清晰可見');
        }
      } catch {
        Alert.alert('OCR 錯誤', '文字辨識失敗，請手動輸入');
      }
    }
  };

  const updateRecordMood = useCallback(async (recordKey: string, mood: Mood) => {
    const updated = sortRecordsNewestFirst(records.map((record) =>
      getBpRecordPrimaryKey(record) === recordKey ? { ...record, mood } : record
    ));

    setRecords(updated);
    analyzeHealth(updated);
    setPendingMoodRecords((current) => current.map((record) =>
      getBpRecordPrimaryKey(record) === recordKey ? { ...record, mood } : record
    ));

    try {
      await AsyncStorage.setItem(`bp_records_${user?.uid}`, JSON.stringify(updated));
    } catch (e) {
      console.warn('[AsyncStorage] 心情更新寫入失敗：', e);
    }
  }, [analyzeHealth, records, user?.uid]);

  // 8. 匯出 CSV
  const exportToCSV = async () => {
    try {
      const header = '\ufeff時間,收縮壓,舒張壓,脈搏,心情,狀態\n';
      const rows = records.map(r => `${r.time},${r.sys},${r.dia},${r.pulse || ''},${r.mood || UNMARKED_MOOD},${r.level}`).join('\n');
      const path = `${RNFS.TemporaryDirectoryPath}/BloodPressureReport.csv`;
      await RNFS.writeFile(path, header + rows, 'utf8');
      await Share.open({ url: `file://${path}`, type: 'text/csv', filename: 'BloodPressureReport' });
    } catch (e: any) {
      if (e?.message !== 'User did not share') {
        Alert.alert('匯出失敗', e?.message);
      }
    }
  };

  // ── 載入畫面 ──
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1890ff" />
      </View>
    );
  }

  // ── 登入畫面 ──
  if (!user) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <Text style={styles.loginTitle}>☁️ 雲端血壓日記</Text>
        <TextInput
          style={styles.loginInput}
          placeholder="信箱"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.loginInput}
          placeholder="密碼（至少 6 位）"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => auth().signInWithEmailAndPassword(email, password).catch(e => Alert.alert('登入失敗', e.message))}
        >
          <Text style={styles.btnText}>登入</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.loginBtn, { backgroundColor: '#52c41a' }]}
          onPress={() => auth().createUserWithEmailAndPassword(email, password).catch(e => Alert.alert('註冊失敗', e.message))}
        >
          <Text style={styles.btnText}>註冊</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── 主畫面 ──
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarStyle: { height: 52, paddingTop: 4, paddingBottom: 4, backgroundColor: '#fff', elevation: 15 },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
          tabBarIconStyle: { display: 'none' },
          tabBarActiveTintColor: '#154360',
          headerRight: () => (
            <TouchableOpacity onPress={() => auth().signOut()} style={{ marginRight: 15 }}>
              <Text style={{ color: '#ff4d4f', fontWeight: 'bold' }}>登出</Text>
            </TouchableOpacity>
          ),
        }}
      >
        <Tab.Screen name="Measure" options={{ title: '📸 測量' }}>
          {() => (
            <HomeScreen
              user={user}
              bp={bp}
              setBp={setBp}
              handleOCR={handleOCR}
              autoSaveRecord={autoSaveRecord}
              lastRecord={records[0]}
              recentRecords={records}
              onSync={syncHealthData}
              isSyncing={isSyncing}
              onUpdateMood={updateRecordMood}
            />
          )}
        </Tab.Screen>

        <Tab.Screen name="Trend" options={{ title: '📈 趨勢' }}>
          {() => <TrendScreen records={records} healthAdvice={healthAdvice} />}
        </Tab.Screen>

        <Tab.Screen name="Diary" options={{ title: '📔 日記' }}>
          {() => (
            <DiaryScreen
              records={records}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              exportToCSV={exportToCSV}
              onUpdateMood={updateRecordMood}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
      <Modal
        animationType="slide"
        transparent
        visible={isSyncMoodModalVisible}
        onRequestClose={() => setIsSyncMoodModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Animated.View style={[styles.dayRecordsModal, { transform: [{ translateY: syncMoodModalTranslateY }] }]}>
            <View style={styles.modalDragHandleArea} {...syncMoodModalPanResponder.panHandlers}>
              <View style={styles.modalDragHandle} />
            </View>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>補標記同步資料心情</Text>
                <Text style={styles.modalSubtitle}>剛匯入的血壓紀錄預設為未標記</Text>
              </View>
              <TouchableOpacity onPress={() => setIsSyncMoodModalVisible(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>完成</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={pendingMoodRecords}
              keyExtractor={(item, index) => `${getBpRecordPrimaryKey(item)}-${index}`}
              ListEmptyComponent={<Text style={styles.emptyDayText}>目前沒有需要補標記的同步紀錄</Text>}
              renderItem={({ item }) => (
                <DiaryRecordItem item={item} onUpdateMood={updateRecordMood} />
              )}
            />
          </Animated.View>
        </View>
      </Modal>
    </NavigationContainer>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loginContainer: { flex: 1, justifyContent: 'center', padding: 30, backgroundColor: '#fff' },
  loginTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 30, color: '#154360' },
  loginInput: { backgroundColor: '#f5f5f5', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#eee' },
  loginBtn: { backgroundColor: '#154360', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  header: { padding: 15, backgroundColor: 'white' },
  title: { fontSize: 14, fontWeight: 'bold', color: '#555' },
  inputArea: { padding: 15 },
  inputAreaContent: { paddingBottom: 84 },
  inputRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  input: { flex: 0.31, backgroundColor: 'white', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', color: '#333' },
  inputField: { flex: 0.31, minHeight: 78, backgroundColor: 'white', paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#d9e6f2' },
  inputLabel: { fontSize: 11, color: '#154360', fontWeight: '900', marginBottom: 4 },
  inputValueRow: { flex: 1, justifyContent: 'space-between' },
  inputControl: { minHeight: 32, padding: 0, color: '#1f2937', fontSize: 20, fontWeight: '900' },
  inputUnit: { fontSize: 10, color: '#6b7280', fontWeight: '800' },
  actionSectionTitle: { marginBottom: 10, fontSize: 13, color: '#154360', fontWeight: '800' },
  moodPicker: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  moodChip: { flex: 1, minHeight: 54, marginHorizontal: 3, borderRadius: 10, borderWidth: 1, borderColor: '#d9d9d9', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  moodChipSelected: { borderColor: '#1890ff', backgroundColor: '#e6f7ff' },
  moodEmoji: { fontSize: 20, marginBottom: 2 },
  moodLabel: { fontSize: 11, color: '#595959', fontWeight: '700' },
  moodLabelSelected: { color: '#0050b3' },
  ocrBtn: { backgroundColor: '#cf1322', padding: 18, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  saveBtn: { backgroundColor: '#1890ff', padding: 15, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { color: 'white', fontWeight: 'bold' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  latestCard: { backgroundColor: '#fff', borderRadius: 15, padding: 16, marginBottom: 20, elevation: 3, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  cardIcon: { width: 30, height: 30, backgroundColor: '#154360', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  cardHeaderInfo: { flex: 1 },
  cardHeaderText: { fontSize: 16, fontWeight: 'bold', color: '#154360' },
  cardHeaderTime: { fontSize: 11, color: '#999' },
  bpStatusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  bpStatusPillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  cardBody: { minHeight: 250 },
  miniTrendHeader: { marginTop: 14, marginLeft: 35, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scaleWrapper: { height: 150, justifyContent: 'center', marginLeft: 35, marginTop: 6, position: 'relative' },
  baseLine: { height: 1, backgroundColor: '#eee', width: '100%' },
  limitLine: { position: 'absolute', left: 0, width: '100%', borderTopWidth: 1, borderTopColor: '#ffccc7', zIndex: 1, elevation: 1 },
  limitText: { position: 'absolute', left: -35, top: -8, fontSize: 10, color: '#ff4d4f', width: 30, textAlign: 'right' },
  miniTrendTitle: { fontSize: 15, color: '#154360', fontWeight: '900' },
  miniTrendContainer: { position: 'absolute', left: 0, right: 0, bottom: 18, height: 132, flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, zIndex: 4, elevation: 4 },
  miniTrendPoint: { flex: 1, height: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  miniTrendBarGroup: { alignItems: 'center', justifyContent: 'flex-end', height: 120, position: 'relative' },
  miniTrendBar: { width: 7, borderRadius: 4, backgroundColor: '#1890ff', marginHorizontal: 1 },
  miniTrendBarDia: { backgroundColor: '#52c41a' },
  sysBarValue: { position: 'absolute', fontSize: 9, color: '#1890ff', fontWeight: '800', minWidth: 18, textAlign: 'center', zIndex: 20, elevation: 20 },
  diaBarValue: { position: 'absolute', fontSize: 9, color: '#389e0d', fontWeight: '800', minWidth: 18, textAlign: 'center', zIndex: 20, elevation: 20 },
  weekLabelsContainer: { flexDirection: 'row', marginLeft: 35, marginTop: 6, paddingHorizontal: 8 },
  weekLabelText: { flex: 1, fontSize: 9, color: '#8c8c8c', textAlign: 'center' },
  chartLegend: { flexDirection: 'row', alignItems: 'center' },
  chartLegendItem: { flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
  chartLegendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  chartLegendText: { fontSize: 10, color: '#6b7280', fontWeight: '800' },
  referenceLegend: { marginTop: 6, alignItems: 'center' },
  referenceLegendText: { fontSize: 12, color: '#595959', fontWeight: '800', lineHeight: 18, textAlign: 'center' },
  bpWarningBox: { marginTop: 12, borderRadius: 10, backgroundColor: '#fff7e6', borderWidth: 1, borderColor: '#ffd591', padding: 10 },
  bpWarningText: { color: '#ad4e00', fontSize: 12, fontWeight: '700', marginBottom: 3 },
  abnormalDetailBtn: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#ad4e00', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  abnormalDetailBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  abnormalRecordsModal: { maxHeight: '82%', backgroundColor: '#f0f2f5', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 14, paddingBottom: 20 },
  abnormalRecordsList: { paddingBottom: 12 },
  abnormalRecordCard: { marginHorizontal: 15, marginBottom: 10, padding: 14, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#f0f0f0' },
  abnormalRecordTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  abnormalRecordDate: { fontSize: 13, color: '#154360', fontWeight: '900' },
  abnormalRecordTime: { marginTop: 2, fontSize: 12, color: '#6b7280', fontWeight: '700' },
  abnormalRecordLevel: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  abnormalRecordLevelText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  abnormalRecordValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  abnormalRecordValue: { fontSize: 24, color: '#1f2937', fontWeight: '900' },
  abnormalRecordUnit: { marginLeft: 6, fontSize: 12, color: '#6b7280', fontWeight: '800' },
  abnormalRecordPulse: { marginLeft: 12, fontSize: 12, color: '#fa8c16', fontWeight: '800' },
  abnormalRecordMood: { marginTop: 8, fontSize: 12, color: '#595959', fontWeight: '700' },
  valueWrapper: { minHeight: 74, borderRadius: 12, backgroundColor: '#f7fbff', borderWidth: 1, borderColor: '#e6f0ff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  latestMoodRow: { marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#fff7e6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  latestMoodLabel: { fontSize: 12, color: '#8c5a00', fontWeight: '700' },
  latestMoodValue: { fontSize: 13, color: '#ad6800', fontWeight: '800' },
  bpValueBlock: { flex: 1 },
  valueLabel: { fontSize: 11, color: '#6b7280', fontWeight: '700', marginBottom: 2 },
  bpDivider: { width: 1, height: 42, backgroundColor: '#dbeafe', marginHorizontal: 12 },
  bigBpText: { fontSize: 28, fontWeight: 'bold', color: '#1f2937' },
  unitText: { fontSize: 10, color: '#6b7280', fontWeight: 'bold', alignSelf: 'flex-end', marginBottom: 14 },
  customDay: { alignItems: 'center', justifyContent: 'center', width: 46, height: 50, borderRadius: 8, position: 'relative' },
  abnormalDay: { backgroundColor: '#fff1f0', borderWidth: 1, borderColor: '#ffa39e' },
  selectedDay: { backgroundColor: '#e6f7ff', borderWidth: 1, borderColor: '#1890ff' },
  abnormalDayIcon: { position: 'absolute', top: 2, right: 2, fontSize: 10, zIndex: 2, elevation: 2 },
  dayLabel: { fontSize: 14, color: '#333' },
  dayValue: { fontSize: 9, fontWeight: 'bold', marginTop: 2 },
  calendarLegend: { marginHorizontal: 15, marginTop: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: '#fff7e6', borderWidth: 1, borderColor: '#ffd591' },
  calendarLegendText: { color: '#ad4e00', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  analysisCard: { backgroundColor: 'white', margin: 15, padding: 15, borderRadius: 20, elevation: 5 },
  trendContent: { paddingBottom: 84 },
  diaryContent: { paddingBottom: 84 },
  analysisTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#154360' },
  chartFrame: { position: 'relative' },
  shiftedChart: { marginLeft: 0 },
  chartStyle: { borderRadius: 15, paddingRight: 54 },
  chartAxisTag: { position: 'absolute', zIndex: 10, elevation: 10, fontSize: 9, color: '#fff', fontWeight: '900', backgroundColor: 'rgba(21,67,96,0.62)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  chartYAxisTag: { top: 6, left: 6 },
  adviceBox: { marginTop: 15, padding: 15, backgroundColor: '#e6f7ff', borderRadius: 10, borderLeftWidth: 5, borderLeftColor: '#1890ff' },
  adviceText: { fontSize: 14, color: '#003a8c' },
  pulseSummaryBox: { marginTop: 12, padding: 12, backgroundColor: '#fffbe6', borderRadius: 10, borderLeftWidth: 5, borderLeftColor: '#faad14', flexDirection: 'row', alignItems: 'center' },
  pulseSummaryItem: { flex: 1 },
  pulseSummaryDivider: { width: 1, height: 36, backgroundColor: '#ffe58f', marginHorizontal: 10 },
  pulseSummaryLabel: { fontSize: 11, color: '#8c6d1f', fontWeight: '800', marginBottom: 4 },
  pulseSummaryValue: { fontSize: 18, color: '#ad6800', fontWeight: '900' },
  moodAnalysisBox: { marginTop: 12, padding: 15, backgroundColor: '#fff7e6', borderRadius: 10, borderLeftWidth: 5, borderLeftColor: '#faad14' },
  moodAnalysisTitle: { fontSize: 15, fontWeight: '800', color: '#8c5a00', marginBottom: 6 },
  analysisLabel: { alignSelf: 'flex-start', marginTop: 6, marginBottom: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.62)', color: '#154360', fontSize: 11, fontWeight: '900' },
  moodAnalysisText: { fontSize: 13, lineHeight: 20, color: '#5c3b00' },
  moodSourceText: { marginTop: 8, fontSize: 11, lineHeight: 17, color: '#8c6d1f' },
  moodSourceLink: { color: '#0050b3', fontWeight: '800', textDecorationLine: 'underline' },
  pulseAnalysisBox: { marginTop: 12, padding: 15, backgroundColor: '#f0f5ff', borderRadius: 10, borderLeftWidth: 5, borderLeftColor: '#2f54eb' },
  pulseAnalysisTitle: { fontSize: 15, fontWeight: '800', color: '#10239e', marginBottom: 6 },
  pulseAnalysisText: { fontSize: 13, lineHeight: 20, color: '#1d39c4' },
  pulseSourceText: { marginTop: 8, fontSize: 11, lineHeight: 17, color: '#1d39c4' },
  pulseSourceLink: { color: '#0050b3', fontWeight: '800', textDecorationLine: 'underline' },
  diaryDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center' },
  detailTitle: { fontSize: 15, fontWeight: 'bold' },
  miniBtn: { backgroundColor: '#52c41a', padding: 5, borderRadius: 5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalDismissArea: { flex: 1, width: '100%' },
  centerModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 22 },
  moodSelectModal: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  moodSelectTitle: { fontSize: 16, fontWeight: '800', color: '#154360', marginBottom: 12, textAlign: 'center' },
  moodSelectGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  moodSelectChip: { width: '48%', minHeight: 68, marginBottom: 10, borderRadius: 10, borderWidth: 1, borderColor: '#d9d9d9', backgroundColor: '#fafafa', alignItems: 'center', justifyContent: 'center' },
  moodSelectChipSelected: { borderColor: '#1890ff', backgroundColor: '#e6f7ff' },
  moodSelectCancelBtn: { marginTop: 4, alignItems: 'center', padding: 10 },
  moodSelectCancelText: { color: '#8c8c8c', fontWeight: '800' },
  dayRecordsModal: { maxHeight: '82%', backgroundColor: '#f0f2f5', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 14, paddingBottom: 24 },
  modalDragHandleArea: { alignItems: 'center', paddingTop: 2, paddingBottom: 8 },
  modalDragHandle: { width: 44, height: 5, borderRadius: 999, backgroundColor: '#bfbfbf', marginBottom: 5 },
  modalDragHint: { fontSize: 11, color: '#8c8c8c', fontWeight: '700' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#154360' },
  modalSubtitle: { marginTop: 2, fontSize: 11, color: '#6b7280', fontWeight: '700' },
  modalCloseBtn: { backgroundColor: '#154360', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  modalCloseText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  emptyDayText: { margin: 18, padding: 18, borderRadius: 10, backgroundColor: '#fff', color: '#8c8c8c', textAlign: 'center', fontWeight: '700' },
  recordItem: { backgroundColor: 'white', padding: 15, marginHorizontal: 15, marginBottom: 10, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recordLeft: { flex: 1 },
  recordText: { fontSize: 12, color: '#8c8c8c' },
  recordValueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  recordVal: { fontSize: 18, fontWeight: 'bold' },
  recordMoodIcon: { marginLeft: 8, fontSize: 18 },
  recordPulse: { marginTop: 2, fontSize: 12, color: '#fa8c16', fontWeight: '700' },
  recordMoodLabel: { marginTop: 4, fontSize: 12, color: '#595959', fontWeight: '700' },
  recordMoodPicker: { flexDirection: 'row', marginTop: 8 },
  recordMoodChip: { width: 34, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#e8e8e8', backgroundColor: '#fafafa', alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  recordMoodChipSelected: { borderColor: '#1890ff', backgroundColor: '#e6f7ff' },
  recordMoodChipText: { fontSize: 16 },
  levelTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  levelTagText: { color: 'white', fontSize: 11, fontWeight: 'bold' },
});

export default App;
