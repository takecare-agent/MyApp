/**
 * TypeScript 型別定義
 * 供 FamilyScreen 和 CaregiverScreen 使用
 */

// ════════════════════════════════════════════════════════════════════════════
// 【血壓測量相關型別】
// ════════════════════════════════════════════════════════════════════════════

export interface BloodPressureRecord {
    _id?: string;
    userId: string;
    role: 'elderly' | 'family' | 'caregiver';
    sys: number;
    dia: number;
    pulse: number;
    mood?: string;
    notes?: string;
    time: string | Date;
    recordedAt?: string | Date;
    source: 'omron_bluetooth' | 'health_connect' | 'manual' | 'caregiver_guided';
    recordedBy?: string;
    syncKey?: string;
    deviceId?: string;
    guidedByCaregiver?: boolean;
    status?: 'normal' | 'warning' | 'danger';
    createdAt?: string | Date;
    updatedAt?: string | Date;
}

export interface BloodPressureStatus {
    level: 'danger' | 'warning' | 'normal';
    label: string;
    color: string;
    recommendation: string;
}

// ════════════════════════════════════════════════════════════════════════════
// 【家屬端相關型別】
// ════════════════════════════════════════════════════════════════════════════

export interface DailyTrendData {
    date: string;
    label: string;
    avgSys: number;
    avgDia: number;
    minSys?: number;
    maxSys?: number;
    minDia?: number;
    maxDia?: number;
    count?: number;
}

export interface StatisticsData {
    period: '3m' | '6m';
    avgSystolic: number;
    avgDiastolic: number;
    maxSystolic: number;
    minSystolic: number;
    highBPDays: number;
    totalDays: number;
    trendData: DailyTrendData[];
}

export interface AlertNotification {
    visible: boolean;
    message: string;
    level: 'danger' | 'warning' | 'normal';
}

export interface FamilyScreenState {
    latestData: BloodPressureRecord | null;
    chartPeriod: '3m' | '6m';
    statistics: StatisticsData | null;
    alertNotification: AlertNotification;
    loading: boolean;
    elderlyCaregiverId: string;
}

// ════════════════════════════════════════════════════════════════════════════
// 【看護端相關型別】
// ════════════════════════════════════════════════════════════════════════════

export interface DailyChecklistItem {
    id: string;
    title: string;
    completed: boolean;
    timestamp?: string | Date;
    icon: string;
}

export interface DailyCheckStatus {
    morning: { completed: boolean; time: string | Date | null };
    afternoon: { completed: boolean; time: string | Date | null };
    evening: { completed: boolean; time: string | Date | null };
    allCompleted: boolean;
    notes?: string;
}

export interface SevenDayHistory {
    date: string;
    dayLabel: string;
    hasRecord: boolean;
    records: BloodPressureRecord[];
    avgSys?: number;
    avgDia?: number;
}

export interface CaregiverScreenState {
    todayMeasured: boolean;
    todayData: BloodPressureRecord | null;
    sevenDayHistory: SevenDayHistory[];
    loading: boolean;
    syncing: boolean;
    elderlyCaregiverId: string;
    guideModalVisible: boolean;
    syncProgress: string;
    dailyChecklist: DailyChecklistItem[];
}

// ════════════════════════════════════════════════════════════════════════════
// 【API 請求與回應型別】
// ════════════════════════════════════════════════════════════════════════════

export interface LatestBPResponse {
    sys: number;
    dia: number;
    pulse: number;
    mood?: string;
    time: string;
    source: string;
    status: string;
}

export interface StatisticsResponse extends StatisticsData { }

export interface TodayStatusResponse {
    measuredToday: boolean;
    latestRecord: BloodPressureRecord | null;
    totalMeasurements: number;
    dailyStatus: {
        morningMeasured: boolean;
        afternoonMeasured: boolean;
        eveningMeasured: boolean;
        allCompleted: boolean;
    };
}

export interface SevenDayHistoryResponse {
    history: SevenDayHistory[];
}

export interface SyncResponse {
    success: boolean;
    message: string;
    record?: {
        sys: number;
        dia: number;
        pulse: number;
        time: string;
    };
    error?: string;
}

export interface ManualRecordResponse {
    success: boolean;
    message: string;
    record?: BloodPressureRecord;
    error?: string;
}

export interface ManualRecordRequest {
    userId: string;
    sys: number;
    dia: number;
    pulse?: number;
    role: 'elderly' | 'family' | 'caregiver';
    recordedBy: string;
    mood?: string;
}

// ════════════════════════════════════════════════════════════════════════════
// 【用戶與系統型別】
// ════════════════════════════════════════════════════════════════════════════

export interface User {
    userId: string;
    role: 'elderly' | 'family' | 'caregiver';
    name: string;
    phone?: string;
    email?: string;
    birthDate?: Date;
    elderlyId?: string;
    familyContactIds?: string[];
    assignedCaregivers?: string[];
    measurementReminder?: boolean;
    reminderTimes?: string[];
    healthGoals?: {
        targetSystolic: number;
        targetDiastolic: number;
    };
    createdAt?: Date;
    updatedAt?: Date;
}

export interface DailyCheck {
    _id?: string;
    userId: string;
    date: string;
    morningMeasured: boolean;
    morningTime?: Date;
    afternoonMeasured: boolean;
    afternoonTime?: Date;
    eveningMeasured: boolean;
    eveningTime?: Date;
    totalMeasurements: number;
    allCompleted: boolean;
    avgSystolic?: number;
    avgDiastolic?: number;
    maxSystolic?: number;
    minSystolic?: number;
    caregiverNotes?: string;
    lastUpdatedBy?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface AlertEvent {
    _id?: string;
    userId: string;
    recordId?: string;
    level: 'warning' | 'danger';
    message: string;
    sys: number;
    dia: number;
    pulse?: number;
    sentToFamilyAt?: Date;
    familyAcknowledgedAt?: Date;
    acknowledged: boolean;
    createdAt?: Date;
}

// ════════════════════════════════════════════════════════════════════════════
// 【API 錯誤型別】
// ════════════════════════════════════════════════════════════════════════════

export interface APIError {
    status: number;
    error: string;
    details?: any;
}

export class APIErrorResponse extends Error {
    constructor(
        public status: number,
        public error: string,
        public details?: any
    ) {
        super(error);
        this.name = 'APIError';
    }
}

// ════════════════════════════════════════════════════════════════════════════
// 【工具型別】
// ════════════════════════════════════════════════════════════════════════════

export type TimeRange = '1w' | '3m' | '6m' | '1y';

export type BloodPressureLevel = 'normal' | 'warning' | 'danger';

export interface ChartDataPoint {
    x: number | string;
    y: number;
    label?: string;
}

export interface TrendChartData {
    labels: string[];
    datasets: {
        data: number[];
        color?: (opacity: number) => string;
        strokeWidth?: number;
        label?: string;
    }[];
}

// ════════════════════════════════════════════════════════════════════════════
// 【常數定義】
// ════════════════════════════════════════════════════════════════════════════

export const BP_REFERENCE_VALUES = {
    OPTIMAL: { sys: 120, dia: 80 },
    NORMAL: { sys: 130, dia: 85 },
    ELEVATED: { sys: 139, dia: 89 },
    STAGE1_HYPERTENSION: { sys: 159, dia: 99 },
    STAGE2_HYPERTENSION: { sys: 179, dia: 119 },
    HYPERTENSIVE_CRISIS: { sys: 180, dia: 120 }
} as const;

export const BP_STATUS_COLORS = {
    normal: '#52c41a',
    warning: '#faad14',
    danger: '#cf1322',
    low: '#722ed1'
} as const;

export const MOOD_OPTIONS = [
    '正常',
    '開心',
    '平靜',
    '壓力大',
    '焦慮',
    '未標記'
] as const;

export const MEASUREMENT_TIMES = {
    MORNING: { label: '晨測', start: 6, end: 12, emoji: '🌅' },
    AFTERNOON: { label: '午測', start: 14, end: 18, emoji: '☀️' },
    EVENING: { label: '晚測', start: 20, end: 21, emoji: '🌙' }
} as const;

// ════════════════════════════════════════════════════════════════════════════
// 【API 常數】
// ════════════════════════════════════════════════════════════════════════════

export const API_ENDPOINTS = {
    // 家屬端
    LATEST: '/api/bp/latest',
    STATISTICS: '/api/bp/statistics',

    // 看護端
    TODAY_STATUS: '/api/caregiver/today-status',
    SEVEN_DAY_HISTORY: '/api/caregiver/seven-day-history',
    TRIGGER_SYNC: '/api/caregiver/trigger-sync',
    DAILY_CHECKLIST: '/api/caregiver/daily-checklist',

    // 通用
    MANUAL_RECORD: '/api/bp/manual-record',
    HEALTH_CHECK: '/health'
} as const;

export const DEFAULT_API_TIMEOUT = 5000;
export const SYNC_OPERATION_TIMEOUT = 10000;

export type APIEndpoint = typeof API_ENDPOINTS[keyof typeof API_ENDPOINTS];

export default {
    // 所有型別匯出
};
