import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  Alert, SafeAreaView, FlatList, Dimensions, ActivityIndicator, ScrollView,
  AppState, InteractionManager, Platform
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
const HEALTH_CONNECT_PERMISSIONS = [
  { accessType: 'read', recordType: 'BloodPressure' },
] as const;

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

// ─── 型別 ────────────────────────────────────────────────────────────────────
interface BpRecord {
  sys: string;
  dia: string;
  level: string;
  time: string;
  id: string;
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

const getBpRecordTimestamp = (record: BpRecord): number => {
  const normalizedTime = record.time?.replace(/\//g, '-');
  const timestamp = normalizedTime ? new Date(normalizedTime).getTime() : NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const sortRecordsNewestFirst = (items: BpRecord[]) =>
  [...items].sort((a, b) => getBpRecordTimestamp(b) - getBpRecordTimestamp(a));

const getBpRecordDateKey = (record: BpRecord): string | null => {
  const timestamp = getBpRecordTimestamp(record);
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
      day.avgSys >= 140 ||
      day.avgDia >= 90 ||
      day.avgSys < 90 ||
      day.avgDia < 60 ||
      day.maxSys - day.minSys >= 20 ||
      day.maxDia - day.minDia >= 10
    )
    .slice(-3)
    .map((day) => {
      if (day.avgSys >= 140 || day.avgDia >= 90) {
        return `${day.label} 平均偏高 (${day.avgSys}/${day.avgDia})`;
      }
      if (day.avgSys < 90 || day.avgDia < 60) {
        return `${day.label} 平均偏低 (${day.avgSys}/${day.avgDia})`;
      }
      return `${day.label} 同日波動較大 (${day.count} 筆)`;
    });

// ─── 1. 即時測量分頁 ──────────────────────────────────────────────────────────
const getAbnormalBpDetails = (items: BpRecord[]): string[] => {
  const abnormalRows = sortRecordsNewestFirst(items)
    .filter((record) => {
      const sys = Number(record.sys);
      const dia = Number(record.dia);
      return (
        Number.isFinite(sys) &&
        Number.isFinite(dia) &&
        (sys >= 140 || dia >= 90 || sys < 90 || dia < 60)
      );
    })
    .map((record) => {
      const sys = Number(record.sys);
      const dia = Number(record.dia);
      const reason = sys >= 140 || dia >= 90 ? '偏高' : '偏低';
      return `${record.time}  ${record.sys}/${record.dia} mmHg (${reason})`;
    });

  return abnormalRows.slice(0, 12);
};

const HomeScreen = ({
  user, bp, setBp, handleOCR, autoSaveRecord, lastRecord, recentRecords = [], onSync, isSyncing,
}: any) => {
  const dailyTrend = getDailyBpSummaries(recentRecords).slice(-7);
  const dailyWarnings = getDailyBpWarnings(dailyTrend);
  const abnormalDetails = getAbnormalBpDetails(recentRecords);

  const showAbnormalDetails = () => {
    Alert.alert(
      '異常時間數據',
      abnormalDetails.length > 0
        ? abnormalDetails.join('\n')
        : '目前沒有偏高或偏低的單筆紀錄'
    );
  };

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

      <Text style={styles.sectionTitle}>最新數據</Text>
      <View style={styles.latestCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIcon}><Text style={{ color: '#fff', fontSize: 12 }}>❤️</Text></View>
          <View>
            <Text style={styles.cardHeaderText}>血壓</Text>
            <Text style={styles.cardHeaderTime}>{lastRecord ? lastRecord.time : '尚無數據'}</Text>
          </View>
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
            <Text style={styles.unitText}>mmHg</Text>
          </View>

          <View style={styles.scaleWrapper}>
            <View style={[styles.limitLine, { bottom: '58%' }]}><Text style={styles.limitText}>130</Text></View>
            <View style={[styles.limitLine, { bottom: '22%' }]}><Text style={styles.limitText}>80</Text></View>

            {lastRecord && (() => {
              const sysVal = Number(lastRecord.sys);
              const pos = Math.min(Math.max((sysVal - 60) / (180 - 60), 0), 1) * 100;
              return (
                <View style={[styles.valueIndicatorLine, { bottom: `${pos}%` }]}>
                  <View style={styles.redDot} />
                  <View style={styles.redLine} />
                  <View style={styles.redDot} />
                </View>
              );
            })()}

            <View style={styles.baseLine} />
            <View style={styles.miniTrendContainer}>
              {dailyTrend.map((day) => {
                const sysHeight = Math.min(Math.max((day.avgSys - 70) / 110, 0.08), 1) * 120;
                const diaHeight = Math.min(Math.max((day.avgDia - 40) / 80, 0.08), 1) * 120;
                return (
                  <View key={day.dateKey} style={styles.miniTrendPoint}>
                    <View style={[styles.miniTrendBar, { height: sysHeight }]} />
                    <View style={[styles.miniTrendBar, styles.miniTrendBarDia, { height: diaHeight }]} />
                  </View>
                );
              })}
            </View>
            <View style={styles.weekLabelsContainer}>
              {dailyTrend.map((day) => (
                <Text key={day.dateKey} style={styles.weekLabelText}>{day.label}</Text>
              ))}
            </View>
          </View>
        </View>

        {dailyWarnings.length > 0 && (
          <View style={styles.bpWarningBox}>
            {dailyWarnings.map((warning) => (
              <Text key={warning} style={styles.bpWarningText}>{warning}</Text>
            ))}
            <TouchableOpacity style={styles.abnormalDetailBtn} onPress={showAbnormalDetails}>
              <Text style={styles.abnormalDetailBtnText}>查看異常時間數據</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 同步按鈕：顯示 loading 狀態，防止重複點擊 */}
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

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="收縮壓"
          keyboardType="numeric"
          value={bp.sys}
          onChangeText={(t) => setBp({ ...bp, sys: t })}
          blurOnSubmit={false}
        />
        <TextInput
          style={styles.input}
          placeholder="舒張壓"
          keyboardType="numeric"
          value={bp.dia}
          onChangeText={(t) => setBp({ ...bp, dia: t })}
          blurOnSubmit={false}
        />
      </View>
      <TouchableOpacity style={styles.saveBtn} onPress={() => autoSaveRecord(bp)}>
        <Text style={styles.saveBtnText}>💾 儲存血壓數據</Text>
      </TouchableOpacity>
    </ScrollView>
  </SafeAreaView>
  );
};

// ─── 2. 趨勢分析分頁 ──────────────────────────────────────────────────────────
const TrendScreen = ({ records, healthAdvice }: any) => {
  const lastSeven = [...records].slice(0, 7).reverse();
  const chartData = {
    labels: lastSeven.length > 0 ? lastSeven.map((_: any, i: number) => `${i + 1}`) : ['0'],
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
    legend: ['SYS', 'DIA'],
  };
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.analysisCard}>
        <Text style={styles.analysisTitle}>📊 趨勢圖表</Text>
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
          }}
          bezier
          style={styles.chartStyle}
        />
        <View style={styles.adviceBox}>
          <Text style={styles.adviceText}>{healthAdvice}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

// ─── 3. 血壓日記分頁 ──────────────────────────────────────────────────────────
const DiaryScreen = ({ records, selectedDate, setSelectedDate, exportToCSV }: any) => {
  const dateMap: Record<string, BpRecord[]> = {};
  records.forEach((r: any) => {
    if (r && r.time) {
      const datePart = r.time.split(' ')[0].replace(/\//g, '-');
      if (!dateMap[datePart]) dateMap[datePart] = [];
      dateMap[datePart].push(r);
    }
  });
  const currentDayRecords = dateMap[selectedDate] || [];

  return (
    <SafeAreaView style={styles.container}>
      <Calendar
        onDayPress={(day: any) => setSelectedDate(day.dateString)}
        dayComponent={({ date, state }: any) => {
          const dStr = date.dateString;
          const hasData = dateMap[dStr];
          return (
            <TouchableOpacity
              onPress={() => setSelectedDate(dStr)}
              style={[styles.customDay, selectedDate === dStr && styles.selectedDay]}
            >
              <Text style={[styles.dayLabel, state === 'disabled' && { color: '#ccc' }]}>{date.day}</Text>
              {hasData && (
                <Text style={[styles.dayValue, { color: hasData[0].level === '高血壓' ? '#cf1322' : '#52c41a' }]}>
                  {hasData[0].sys}
                </Text>
              )}
            </TouchableOpacity>
          );
        }}
      />
      <View style={styles.diaryDetailHeader}>
        <Text style={styles.detailTitle}>📋 {selectedDate} 紀錄</Text>
        <TouchableOpacity onPress={exportToCSV} style={styles.miniBtn}>
          <Text style={{ color: '#fff', fontSize: 12 }}>匯出</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={currentDayRecords}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <View style={styles.recordItem}>
            <View style={styles.recordLeft}>
              <Text style={styles.recordText}>{item?.time?.split(' ')[1] || '未知'}</Text>
              <Text style={styles.recordVal}>{item?.sys}/{item?.dia} mmHg</Text>
            </View>
            <View style={[
              styles.levelTag,
              { backgroundColor: item?.level === '高血壓' ? '#cf1322' : (item?.level === '血壓前期' ? '#faad14' : '#52c41a') },
            ]}>
              <Text style={styles.levelTagText}>{item?.level}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
};

// ─── App 主組件 ───────────────────────────────────────────────────────────────
const App = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bp, setBp] = useState({ sys: '', dia: '' });
  const [records, setRecords] = useState<BpRecord[]>([]);
  const [healthAdvice, setHealthAdvice] = useState('讀取中...');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

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
    const avgSys = recent.reduce((sum, r) => sum + Number(r.sys), 0) / recent.length;
    if (avgSys >= 140)      setHealthAdvice('⚠️ 警示：近期平均血壓偏高（高血壓）。請諮詢醫師。');
    else if (avgSys >= 120) setHealthAdvice('🔔 提醒：血壓處於「前期」範圍，建議留意飲食與作息。');
    else                    setHealthAdvice('✅ 正常：血壓控制良好，請繼續保持！');
  }, []);

  // 4. 載入本地 + 雲端數據
  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      try {
        const saved = await AsyncStorage.getItem(`bp_records_${user.uid}`);
        if (saved) {
          const parsed = sortRecordsNewestFirst(JSON.parse(saved));
          setRecords(parsed);
          analyzeHealth(parsed);
        }
      } catch {}
      try {
        const res = await axios.get(`${API_URL}?userId=${user.uid}`);
        const remote: BpRecord[] = sortRecordsNewestFirst(res.data);
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
        alreadyGranted = Array.isArray(granted) && granted.some(
          (p: any) => p.recordType === 'BloodPressure' && p.accessType === 'read'
        );
      } catch (e) {
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
          const timeStr = `${rDate.getFullYear()}/${String(rDate.getMonth() + 1).padStart(2, '0')}/${String(rDate.getDate()).padStart(2, '0')} ${rDate.toLocaleTimeString('zh-TW', { hour12: false })}`;
          const level = sNum >= 140 || dNum >= 90 ? '高血壓' : (sNum >= 120 || dNum >= 80 ? '血壓前期' : '正常');

          return {
            sys: sNum.toString(),
            dia: dNum.toString(),
            level,
            time: timeStr,
            // 優先使用 metadata.id 做去重，比時間字串更可靠
            id: record.metadata?.id || `hc_${rDate.getTime()}_${Math.random().toString(36).slice(2)}`,
            userId: user?.uid,
          } as BpRecord;
        })
        .filter((r): r is BpRecord => r !== null);

      // ── 步驟 E：去重（以 metadata id 為準）──
      const existingIds = new Set(records.map((r) => r.id));
      const toSave = newRecords.filter((r) => !existingIds.has(r.id));

      if (toSave.length === 0) {
        if (isManual) Alert.alert('已是最新', '沒有新的血壓紀錄需要同步');
        return;
      }

      // ── 步驟 F：儲存 ──
      const updated = sortRecordsNewestFirst([...toSave, ...records]);
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

      Alert.alert('同步完成 ✅', `成功匯入 ${toSave.length} 筆歐姆龍血壓數據`);

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
  const autoSaveRecord = async (data: { sys: string; dia: string }) => {
    if (!data.sys || !data.dia) {
      Alert.alert('提示', '請輸入收縮壓與舒張壓數值');
      return;
    }
    const s = Number(data.sys);
    const d = Number(data.dia);
    if (isNaN(s) || isNaN(d) || s < 60 || s > 250 || d < 40 || d > 150) {
      Alert.alert('數值異常', '請確認輸入的血壓數值是否正確');
      return;
    }
    const level = s >= 140 || d >= 90 ? '高血壓' : (s >= 120 || d >= 80 ? '血壓前期' : '正常');
    const now = new Date();
    const timeStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${now.toLocaleTimeString('zh-TW', { hour12: false })}`;

    const newRecord: BpRecord = {
      sys: s.toString(),
      dia: d.toString(),
      level,
      time: timeStr,
      id: Date.now().toString(),
      userId: user?.uid,
    };

    const updated = sortRecordsNewestFirst([newRecord, ...records]);
    setRecords(updated);
    analyzeHealth(updated);
    setBp({ sys: '', dia: '' });

    try {
      await AsyncStorage.setItem(`bp_records_${user?.uid}`, JSON.stringify(updated));
      await axios.post(API_URL, newRecord);
      Alert.alert('儲存成功 💾');
    } catch {
      Alert.alert('儲存成功 💾', '（雲端同步失敗，數據已存於本機）');
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
          setBp({ sys: nums[0], dia: nums[1] });
        } else {
          Alert.alert('辨識失敗', '請確保血壓計螢幕清晰可見');
        }
      } catch (e) {
        Alert.alert('OCR 錯誤', '文字辨識失敗，請手動輸入');
      }
    }
  };

  // 8. 匯出 CSV
  const exportToCSV = async () => {
    try {
      const header = '\ufeff時間,收縮壓,舒張壓,狀態\n';
      const rows = records.map(r => `${r.time},${r.sys},${r.dia},${r.level}`).join('\n');
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
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
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
  input: { flex: 0.48, backgroundColor: 'white', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', color: '#333' },
  ocrBtn: { backgroundColor: '#cf1322', padding: 18, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  saveBtn: { backgroundColor: '#1890ff', padding: 15, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { color: 'white', fontWeight: 'bold' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  latestCard: { backgroundColor: '#fff', borderRadius: 15, padding: 16, marginBottom: 20, elevation: 3, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  cardIcon: { width: 30, height: 30, backgroundColor: '#154360', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  cardHeaderText: { fontSize: 16, fontWeight: 'bold', color: '#154360' },
  cardHeaderTime: { fontSize: 11, color: '#999' },
  cardBody: { minHeight: 230 },
  scaleWrapper: { height: 150, justifyContent: 'center', marginLeft: 35, marginTop: 14, position: 'relative' },
  baseLine: { height: 1, backgroundColor: '#eee', width: '100%' },
  limitLine: { position: 'absolute', left: 0, width: '100%', borderTopWidth: 1, borderTopColor: '#ffccc7' },
  limitText: { position: 'absolute', left: -35, top: -8, fontSize: 10, color: '#ff4d4f', width: 30, textAlign: 'right' },
  valueIndicatorLine: { position: 'absolute', left: 0, width: '100%', flexDirection: 'row', alignItems: 'center', zIndex: 5 },
  redLine: { flex: 1, height: 2, backgroundColor: '#ff4d4f' },
  redDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ff4d4f' },
  miniTrendContainer: { position: 'absolute', left: 0, right: 0, bottom: 18, height: 120, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 8 },
  miniTrendPoint: { width: 20, height: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  miniTrendBar: { width: 7, borderRadius: 4, backgroundColor: '#1890ff', marginHorizontal: 1 },
  miniTrendBarDia: { backgroundColor: '#52c41a' },
  weekLabelsContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 10, paddingHorizontal: 5 },
  weekLabelText: { fontSize: 10, color: '#ccc', textAlign: 'center', width: 20 },
  bpWarningBox: { marginTop: 12, borderRadius: 10, backgroundColor: '#fff7e6', borderWidth: 1, borderColor: '#ffd591', padding: 10 },
  bpWarningText: { color: '#ad4e00', fontSize: 12, fontWeight: '700', marginBottom: 3 },
  abnormalDetailBtn: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#ad4e00', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  abnormalDetailBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  valueWrapper: { minHeight: 74, borderRadius: 12, backgroundColor: '#f7fbff', borderWidth: 1, borderColor: '#e6f0ff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  bpValueBlock: { flex: 1 },
  valueLabel: { fontSize: 11, color: '#6b7280', fontWeight: '700', marginBottom: 2 },
  bpDivider: { width: 1, height: 42, backgroundColor: '#dbeafe', marginHorizontal: 12 },
  bigBpText: { fontSize: 28, fontWeight: 'bold', color: '#1f2937' },
  unitText: { fontSize: 10, color: '#6b7280', fontWeight: 'bold', alignSelf: 'flex-end', marginBottom: 14 },
  customDay: { alignItems: 'center', justifyContent: 'center', width: 42, height: 48, borderRadius: 8 },
  selectedDay: { backgroundColor: '#e6f7ff', borderWidth: 1, borderColor: '#1890ff' },
  dayLabel: { fontSize: 14, color: '#333' },
  dayValue: { fontSize: 10, fontWeight: 'bold', marginTop: 2 },
  analysisCard: { backgroundColor: 'white', margin: 15, padding: 15, borderRadius: 20, elevation: 5 },
  analysisTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#154360' },
  chartStyle: { borderRadius: 15 },
  adviceBox: { marginTop: 15, padding: 15, backgroundColor: '#e6f7ff', borderRadius: 10, borderLeftWidth: 5, borderLeftColor: '#1890ff' },
  adviceText: { fontSize: 14, color: '#003a8c' },
  diaryDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center' },
  detailTitle: { fontSize: 15, fontWeight: 'bold' },
  miniBtn: { backgroundColor: '#52c41a', padding: 5, borderRadius: 5 },
  recordItem: { backgroundColor: 'white', padding: 15, marginHorizontal: 15, marginBottom: 10, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recordLeft: { flex: 1 },
  recordText: { fontSize: 12, color: '#8c8c8c' },
  recordVal: { fontSize: 18, fontWeight: 'bold' },
  levelTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  levelTagText: { color: 'white', fontSize: 11, fontWeight: 'bold' },
});

export default App;
