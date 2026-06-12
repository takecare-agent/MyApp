/**
 * 後端 API 路由：家屬端與看護端
 * MongoDB + Express 實現
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// ─── MongoDB Schema 定義 ────────────────────────────────────────────────

/**
 * 主要血壓記錄 Schema
 * 包含所有角色的血壓測量數據
 */
const BloodPressureSchema = new mongoose.Schema({
    // 基本數據
    userId: { type: String, required: true, index: true },
    role: { type: String, enum: ['elderly', 'family', 'caregiver'], default: 'elderly' },
    sys: { type: Number, required: true },
    dia: { type: Number, required: true },
    pulse: { type: Number },

    // 上下文資訊
    mood: { type: String, enum: ['正常', '開心', '平靜', '壓力大', '焦慮', '未標記'], default: '未標記' },
    notes: String,

    // 時間戳與來源
    time: { type: Date, default: Date.now, index: true },
    recordedAt: { type: Date, default: Date.now },
    source: { type: String, enum: ['omron_bluetooth', 'health_connect', 'manual', 'caregiver_guided'], default: 'omron_bluetooth' },
    recordedBy: { type: String },

    // 同步與追蹤
    syncKey: { type: String, unique: true, sparse: true },
    deviceId: String,
    guidedByCaregiver: { type: Boolean, default: false },

    // 狀態分類（便於查詢）
    status: { type: String, enum: ['normal', 'warning', 'danger'], index: true },
}, { timestamps: true });

/**
 * 用戶資訊 Schema
 * 存儲長輩與家屬/看護的基本信息與關係
 */
const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    role: { type: String, enum: ['elderly', 'family', 'caregiver'], required: true },
    name: String,
    phone: String,
    email: String,
    birthDate: Date,

    // 關係欄位
    elderlyId: String,                    // 如果是 family 或 caregiver，指向所照顧的長輩
    familyContactIds: [String],           // 家屬/家人 ID 列表
    assignedCaregivers: [String],         // 指派的看護 ID 列表

    // 設定
    measurementReminder: { type: Boolean, default: true },
    reminderTimes: [String],              // 例如: ['06:00', '14:00', '20:00']
    healthGoals: {
        targetSystolic: { type: Number, default: 120 },
        targetDiastolic: { type: Number, default: 80 }
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

/**
 * 每日檢核 Schema
 * 追蹤每一天的測量完成狀況
 */
const DailyCheckSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },  // YYYY-MM-DD 格式

    morningMeasured: { type: Boolean, default: false },
    morningTime: Date,

    afternoonMeasured: { type: Boolean, default: false },
    afternoonTime: Date,

    eveningMeasured: { type: Boolean, default: false },
    eveningTime: Date,

    totalMeasurements: { type: Number, default: 0 },
    allCompleted: { type: Boolean, default: false },

    // 該日的統計數據
    avgSystolic: Number,
    avgDiastolic: Number,
    maxSystolic: Number,
    minSystolic: Number,

    // 看護備註
    caregiverNotes: String,
    lastUpdatedBy: String  // 家屬或看護 ID
}, { timestamps: true });

/**
 * 告警事件 Schema
 * 記錄所有異常血壓事件用於通知
 */
const AlertEventSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    recordId: mongoose.Schema.Types.ObjectId,

    level: { type: String, enum: ['warning', 'danger'], required: true },
    message: String,

    sys: Number,
    dia: Number,
    pulse: Number,

    sentToFamilyAt: Date,
    familyAcknowledgedAt: Date,
    acknowledged: { type: Boolean, default: false },

    createdAt: { type: Date, default: Date.now, index: true }
});

// ─── Model 定義 ────────────────────────────────────────────────────────

const BloodPressure = mongoose.model('BloodPressure', BloodPressureSchema);
const User = mongoose.model('User', UserSchema);
const DailyCheck = mongoose.model('DailyCheck', DailyCheckSchema);
const AlertEvent = mongoose.model('AlertEvent', AlertEventSchema);

// ─── 輔助函數 ────────────────────────────────────────────────────────

/**
 * 判定血壓狀態
 */
const getBpStatus = (sys, dia) => {
    if (sys >= 180 || dia >= 120) return 'danger';
    if (sys >= 140 || dia >= 90) return 'danger';
    if (sys >= 130 && sys < 140 && dia >= 80 && dia < 90) return 'warning';
    if (sys >= 120 && sys < 130) return 'warning';
    if (sys < 90 || dia < 60) return 'warning';
    return 'normal';
};

/**
 * 建立或更新每日檢核
 */
const updateDailyCheck = async (userId, date) => {
    const records = await BloodPressure.find({
        userId,
        time: {
            $gte: new Date(`${date}T00:00:00`),
            $lt: new Date(`${date}T23:59:59`)
        }
    });

    if (records.length === 0) return null;

    const hour = new Date().getHours();
    const morningRecords = records.filter(r => new Date(r.time).getHours() < 12);
    const afternoonRecords = records.filter(r => {
        const h = new Date(r.time).getHours();
        return h >= 12 && h < 18;
    });
    const eveningRecords = records.filter(r => new Date(r.time).getHours() >= 18);

    const avgSys = Math.round(records.reduce((sum, r) => sum + r.sys, 0) / records.length);
    const avgDia = Math.round(records.reduce((sum, r) => sum + r.dia, 0) / records.length);
    const sysList = records.map(r => r.sys);
    const maxSys = Math.max(...sysList);
    const minSys = Math.min(...sysList);

    await DailyCheck.updateOne(
        { userId, date },
        {
            morningMeasured: morningRecords.length > 0,
            afternoonMeasured: afternoonRecords.length > 0,
            eveningMeasured: eveningRecords.length > 0,
            totalMeasurements: records.length,
            allCompleted: morningRecords.length > 0 && afternoonRecords.length > 0 && eveningRecords.length > 0,
            avgSystolic: avgSys,
            avgDiastolic: avgDia,
            maxSystolic: maxSys,
            minSystolic: minSys
        },
        { upsert: true }
    );
};

/**
 * 建立告警事件
 */
const createAlertEvent = async (userId, recordId, sys, dia, pulse) => {
    const status = getBpStatus(sys, dia);
    if (status === 'normal') return;

    const level = status === 'danger' ? 'danger' : 'warning';
    const message = level === 'danger'
        ? `🚨 危險高血壓：收縮壓 ${sys} mmHg，舒張壓 ${dia} mmHg`
        : `⚠️ 血壓異常：收縮壓 ${sys} mmHg，舒張壓 ${dia} mmHg`;

    const alert = new AlertEvent({
        userId,
        recordId,
        level,
        message,
        sys,
        dia,
        pulse
    });

    await alert.save();

    // TODO: 這裡應該觸發 Firebase Push Notification 發送給家屬
    // await sendNotificationToFamily(userId, message);

    return alert;
};

// ─── 【家屬端】API 端點 ────────────────────────────────────────────────

/**
 * GET /api/bp/latest
 * 取得最新一筆血壓數據（用於家屬即時監控）
 */
router.get('/latest', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: '缺少 userId' });

        const record = await BloodPressure.findOne({ userId })
            .sort({ time: -1 })
            .lean();

        if (!record) {
            return res.status(404).json({ error: '無血壓記錄' });
        }

        res.json({
            sys: record.sys,
            dia: record.dia,
            pulse: record.pulse || 0,
            mood: record.mood,
            time: record.time,
            source: record.source,
            status: record.status
        });
    } catch (error) {
        console.error('Error fetching latest BP:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/bp/statistics
 * 取得統計數據與趨勢圖表（支援 3 個月 / 6 個月查詢）
 */
router.get('/statistics', async (req, res) => {
    try {
        const { userId, daysBack = 90 } = req.query;
        if (!userId) return res.status(400).json({ error: '缺少 userId' });

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(daysBack));

        const records = await BloodPressure.find({
            userId,
            time: { $gte: startDate }
        }).sort({ time: 1 }).lean();

        if (records.length === 0) {
            return res.json({
                avgSystolic: 0,
                avgDiastolic: 0,
                maxSystolic: 0,
                minSystolic: 0,
                highBPDays: 0,
                totalDays: 0,
                trendData: []
            });
        }

        // 按日期分組
        const dailyData = {};
        records.forEach(record => {
            const date = new Date(record.time);
            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

            if (!dailyData[dateKey]) {
                dailyData[dateKey] = { sys: [], dia: [], records: [] };
            }

            dailyData[dateKey].sys.push(record.sys);
            dailyData[dateKey].dia.push(record.dia);
            dailyData[dateKey].records.push(record);
        });

        // 計算統計數據
        const allSys = records.map(r => r.sys);
        const allDia = records.map(r => r.dia);
        const avgSystolic = Math.round(allSys.reduce((a, b) => a + b, 0) / allSys.length);
        const avgDiastolic = Math.round(allDia.reduce((a, b) => a + b, 0) / allDia.length);
        const maxSystolic = Math.max(...allSys);
        const minSystolic = Math.min(...allSys);

        // 計算高血壓天數
        const highBPDays = Object.values(dailyData).filter(day => {
            const avgDaySys = Math.round(day.sys.reduce((a, b) => a + b) / day.sys.length);
            return avgDaySys >= 140;
        }).length;

        // 構建趨勢圖表數據
        const trendData = Object.entries(dailyData)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, data]) => {
                const [year, month, day] = date.split('-');
                return {
                    date,
                    label: `${month}/${day}`,
                    avgSys: Math.round(data.sys.reduce((a, b) => a + b) / data.sys.length),
                    avgDia: Math.round(data.dia.reduce((a, b) => a + b) / data.dia.length)
                };
            });

        const totalDays = Object.keys(dailyData).length;

        res.json({
            period: daysBack <= 90 ? '3m' : '6m',
            avgSystolic,
            avgDiastolic,
            maxSystolic,
            minSystolic,
            highBPDays,
            totalDays,
            trendData
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── 【看護端】API 端點 ────────────────────────────────────────────────

/**
 * GET /api/caregiver/today-status
 * 取得今日測量狀態（完成與否、最新數據）
 */
router.get('/caregiver/today-status', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: '缺少 userId' });

        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        // 查詢今日所有記錄
        const records = await BloodPressure.find({
            userId,
            time: {
                $gte: new Date(`${dateStr}T00:00:00`),
                $lt: new Date(`${dateStr}T23:59:59`)
            }
        }).sort({ time: -1 }).lean();

        // 更新每日檢核
        if (records.length > 0) {
            await updateDailyCheck(userId, dateStr);
        }

        const dailyCheck = await DailyCheck.findOne({ userId, date: dateStr }).lean();

        res.json({
            measuredToday: records.length > 0,
            latestRecord: records[0] || null,
            totalMeasurements: records.length,
            dailyStatus: dailyCheck || {
                morningMeasured: false,
                afternoonMeasured: false,
                eveningMeasured: false,
                allCompleted: false
            }
        });
    } catch (error) {
        console.error('Error fetching today status:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/caregiver/seven-day-history
 * 取得近7天的血壓摘要（用於看護向家屬匯報）
 */
router.get('/caregiver/seven-day-history', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: '缺少 userId' });

        const history = [];
        const today = new Date();

        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const dayLabel = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];

            const records = await BloodPressure.find({
                userId,
                time: {
                    $gte: new Date(`${dateStr}T00:00:00`),
                    $lt: new Date(`${dateStr}T23:59:59`)
                }
            }).sort({ time: 1 }).lean();

            let avgSys, avgDia;
            if (records.length > 0) {
                avgSys = Math.round(records.reduce((sum, r) => sum + r.sys, 0) / records.length);
                avgDia = Math.round(records.reduce((sum, r) => sum + r.dia, 0) / records.length);
            }

            history.push({
                date: dateStr,
                dayLabel: `${dayLabel}`,
                hasRecord: records.length > 0,
                records,
                avgSys,
                avgDia
            });
        }

        res.json({ history });
    } catch (error) {
        console.error('Error fetching seven day history:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/caregiver/trigger-sync
 * 看護觸發藍牙/Health Connect 同步
 * 模擬與 OMRON 血壓計或 Health Connect 的同步過程
 */
router.post('/caregiver/trigger-sync', async (req, res) => {
    try {
        const { userId, role, guidedByCaregiver } = req.body;
        if (!userId) return res.status(400).json({ error: '缺少 userId' });

        // TODO: 這裡應該觸發實際的藍牙/Health Connect 連接
        // 以下為模擬數據
        const mockRecord = {
            userId,
            sys: 120 + Math.floor(Math.random() * 30),
            dia: 70 + Math.floor(Math.random() * 20),
            pulse: 60 + Math.floor(Math.random() * 30),
            mood: '平靜',
            source: 'caregiver_guided',
            recordedBy: role,
            guidedByCaregiver: true,
            status: 'normal'
        };

        const record = new BloodPressure(mockRecord);
        await record.save();

        // 建立告警事件（如果需要）
        if (mockRecord.sys >= 140 || mockRecord.dia >= 90) {
            await createAlertEvent(userId, record._id, mockRecord.sys, mockRecord.dia, mockRecord.pulse);
        }

        // 更新每日檢核
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        await updateDailyCheck(userId, dateStr);

        res.json({
            success: true,
            message: '同步成功',
            record: {
                sys: mockRecord.sys,
                dia: mockRecord.dia,
                pulse: mockRecord.pulse,
                time: record.createdAt
            }
        });
    } catch (error) {
        console.error('Error triggering sync:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/bp/manual-record
 * 手動記錄血壓（由看護或長輩本人輸入）
 */
router.post('/manual-record', async (req, res) => {
    try {
        const { userId, sys, dia, pulse, role, recordedBy, mood = '未標記', notes } = req.body;

        if (!userId || sys === undefined || dia === undefined) {
            return res.status(400).json({ error: '缺少必要參數' });
        }

        const status = getBpStatus(sys, dia);
        const record = new BloodPressure({
            userId,
            sys,
            dia,
            pulse: pulse || 0,
            mood,
            notes,
            role,
            source: 'manual',
            recordedBy,
            status
        });

        await record.save();

        // 建立告警事件
        if (status !== 'normal') {
            await createAlertEvent(userId, record._id, sys, dia, pulse);
        }

        // 更新每日檢核
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        await updateDailyCheck(userId, dateStr);

        res.json({
            success: true,
            message: '記錄成功',
            record: {
                _id: record._id,
                sys: record.sys,
                dia: record.dia,
                pulse: record.pulse,
                mood: record.mood,
                notes: record.notes,
                time: record.time
            }
        });
    } catch (error) {
        console.error('Error saving manual record:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/caregiver/daily-checklist
 * 取得今日的檢核清單狀態
 */
router.get('/caregiver/daily-checklist', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: '缺少 userId' });

        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const dailyCheck = await DailyCheck.findOne({ userId, date: dateStr }).lean();

        if (!dailyCheck) {
            return res.json({
                morning: { completed: false, time: null },
                afternoon: { completed: false, time: null },
                evening: { completed: false, time: null },
                allCompleted: false
            });
        }

        res.json({
            morning: { completed: dailyCheck.morningMeasured, time: dailyCheck.morningTime },
            afternoon: { completed: dailyCheck.afternoonMeasured, time: dailyCheck.afternoonTime },
            evening: { completed: dailyCheck.eveningMeasured, time: dailyCheck.eveningTime },
            allCompleted: dailyCheck.allCompleted,
            notes: dailyCheck.caregiverNotes
        });
    } catch (error) {
        console.error('Error fetching daily checklist:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
