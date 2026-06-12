require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;
const memoryRecords = [];
let isMongoReady = false;

app.use(cors());
app.use(bodyParser.json());

const mongoose = require('mongoose');

const RecordSchema = new mongoose.Schema({
  sys: String,
  dia: String,
  pulse: String,
  mood: String,
  level: String,
  time: { type: String, default: () => new Date().toLocaleString('zh-TW') },
  id: String,
  syncKey: String,
  userId: String
}, { strict: false });

const Record = mongoose.model('Record', RecordSchema);

if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => {
      isMongoReady = true;
      console.log('MongoDB 連線成功！');
    })
    .catch(err => {
      isMongoReady = false;
      console.error('MongoDB 連線失敗，改用本機記憶體暫存模式：', err.message);
    });
} else {
  console.warn('未設定 MONGO_URI，使用本機記憶體暫存模式。重新啟動後資料會清空。');
}

const UNMARKED_MOOD = '未標記';
const STRESS_MOODS = new Set(['焦慮', '壓力大']);

const getBpStatusFromValues = (sys, dia) => {
  if (sys >= 180 || dia >= 120) return { level: '超高血壓', category: 'danger' };
  if (sys >= 140 || dia >= 90) return { level: '高血壓', category: 'danger' };
  if (sys < 90 || dia < 60) return { level: '偏低', category: 'warning' };
  if (sys >= 120 || dia >= 80) return { level: '血壓前期', category: 'warning' };
  return { level: '正常', category: 'normal' };
};

const toFiniteNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getPulseValue = (record) =>
  toFiniteNumber(record?.pulse ?? record?.heartRate ?? record?.bpm ?? record?.pulseRate) ?? 0;

const parseRecordTimestamp = (value) => {
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

const getRecordTimestamp = (record) => {
  return parseRecordTimestamp(record.time || record.createdAt || record._id?.getTimestamp?.());
};

const getRecordDateKey = (record) => {
  const timestamp = getRecordTimestamp(record);
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getRecordIdentityConditions = (record) => {
  const conditions = [];
  if (record._id && mongoose.Types.ObjectId.isValid(record._id)) {
    conditions.push({ _id: record._id });
  }
  if (record.syncKey) conditions.push({ syncKey: record.syncKey });
  if (record.id) conditions.push({ id: record.id });
  if (record.time && record.sys && record.dia) {
    conditions.push({
      time: record.time,
      sys: String(record.sys),
      dia: String(record.dia)
    });
  }
  return conditions;
};

const mergeIncomingRecord = (existingRecord, incomingRecord) => ({
  ...existingRecord,
  ...incomingRecord,
  mood: isStressMood(incomingRecord.mood) || incomingRecord.mood === '開心' || incomingRecord.mood === '平靜'
    ? incomingRecord.mood
    : (existingRecord.mood || incomingRecord.mood || UNMARKED_MOOD),
  pulse: incomingRecord.pulse || existingRecord.pulse,
  syncKey: incomingRecord.syncKey || existingRecord.syncKey,
  userId: incomingRecord.userId || existingRecord.userId
});

const getRiskCategory = (record) => {
  const sys = toFiniteNumber(record.sys);
  const dia = toFiniteNumber(record.dia);
  const level = sys != null && dia != null
    ? getBpStatusFromValues(sys, dia).level
    : record.level;

  if (level === '高血壓' || level === '超高血壓') return 'danger';
  if (level === '正常') return 'normal';
  return 'warning';
};

const isStressMood = (mood) =>
  Boolean(mood && mood !== UNMARKED_MOOD && STRESS_MOODS.has(mood));

const isDangerRecord = (record) => getRiskCategory(record) === 'danger';

const getDailyBpSummaries = (records) => {
  const groups = records.reduce((acc, record) => {
    const dateKey = getRecordDateKey(record);
    const sys = toFiniteNumber(record.sys);
    const dia = toFiniteNumber(record.dia);
    if (!dateKey || sys == null || dia == null) return acc;

    if (!acc[dateKey]) acc[dateKey] = { sys: [], dia: [] };
    acc[dateKey].sys.push(sys);
    acc[dateKey].dia.push(dia);
    return acc;
  }, {});

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
        maxDia: Math.max(...values.dia)
      };
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
};

const getPercent = (count, total) =>
  total > 0 ? Math.round((count / total) * 100) : 0;

const generateHealthSummary = (records, months) => {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffTime = cutoff.getTime();
  const periodRecords = records.filter((record) => getRecordTimestamp(record) >= cutoffTime);

  const dailyRiskMap = periodRecords.reduce((acc, record) => {
    const dateKey = getRecordDateKey(record);
    if (!dateKey) return acc;

    const category = getRiskCategory(record);
    const current = acc[dateKey];
    if (!current || category === 'danger' || (category === 'warning' && current === 'normal')) {
      acc[dateKey] = category;
    }
    return acc;
  }, {});

  const counts = Object.values(dailyRiskMap).reduce(
    (acc, category) => {
      acc[category] += 1;
      return acc;
    },
    { normal: 0, warning: 0, danger: 0 }
  );
  const totalDays = Object.keys(dailyRiskMap).length;
  const stressHighRecords = periodRecords.filter((record) =>
    isStressMood(record.mood) && isDangerRecord(record)
  );
  const stressMoodCounts = stressHighRecords.reduce((acc, record) => {
    const label = record.mood || UNMARKED_MOOD;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const stressHighMoodLabel = Object.entries(stressMoodCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || '壓力大/焦慮';
  const periodicObservation = stressHighRecords.length > 0
    ? `發現您的危險數值有 ${stressHighRecords.length} 次伴隨「焦慮/壓力大」心情標記，其中以「${stressHighMoodLabel}」較常見，具有情緒生理連動週期，建議看診時提供醫師參考。`
    : '目前未發現「焦慮/壓力大」與高血壓同時出現的明顯週期；請持續標記心情，累積後更利於醫師判讀。';

  return {
    months,
    totalDays,
    normal: { days: counts.normal, percent: getPercent(counts.normal, totalDays) },
    warning: { days: counts.warning, percent: getPercent(counts.warning, totalDays) },
    danger: { days: counts.danger, percent: getPercent(counts.danger, totalDays) },
    stressHighCount: stressHighRecords.length,
    stressHighMoodLabel,
    periodicObservation,
    dailySummaries: getDailyBpSummaries(periodRecords)
  };
};

const buildUserRecordQuery = (userId) =>
  userId
    ? { $or: [{ userId }, { userId: { $exists: false } }, { userId: null }] }
    : {};

const getScopedMemoryRecords = (userId) =>
  userId
    ? memoryRecords.filter((record) => record.userId === userId || record.userId == null)
    : memoryRecords;

const getRecordsForUser = async (userId) => {
  if (!userId) return [];
  if (!isMongoReady) return getScopedMemoryRecords(userId);

  const query = buildUserRecordQuery(userId);
  return Record.find(query).sort({ _id: -1 }).lean();
};

const normalizeBpRecord = (record) => ({
  ...record,
  sys: toFiniteNumber(record.sys) ?? 0,
  dia: toFiniteNumber(record.dia) ?? 0,
  pulse: getPulseValue(record),
  time: record.time || record.createdAt || new Date().toISOString(),
});

const getTodayDateKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const getDayLabel = (date) =>
  date.toLocaleDateString('zh-TW', { weekday: 'short' });

app.post('/api/bp', async (req, res) => {
  try {
    const identityConditions = getRecordIdentityConditions(req.body);
    if (!isMongoReady) {
      const duplicateIndex = identityConditions.length > 0
        ? memoryRecords.findIndex((record) =>
          identityConditions.some((condition) =>
            Object.entries(condition).every(([key, value]) => record[key] === value)
          )
        )
        : -1;

      if (duplicateIndex >= 0) {
        memoryRecords[duplicateIndex] = mergeIncomingRecord(memoryRecords[duplicateIndex], req.body);
        res.status(200).send(memoryRecords[duplicateIndex]);
        return;
      }

      const newRecord = { ...req.body, _id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, id: req.body.id || Date.now().toString() };
      memoryRecords.unshift(newRecord);
      res.status(201).send(newRecord);
      return;
    }

    if (identityConditions.length > 0) {
      const scopeQuery = buildUserRecordQuery(req.body.userId);
      const duplicateQuery = Object.keys(scopeQuery).length > 0
        ? { $and: [scopeQuery, { $or: identityConditions }] }
        : { $or: identityConditions };
      const existingRecord = await Record.findOne(duplicateQuery);

      if (existingRecord) {
        Object.assign(existingRecord, mergeIncomingRecord(existingRecord.toObject(), req.body));
        await existingRecord.save();
        res.status(200).send(existingRecord);
        return;
      }
    }

    const newRecord = new Record(req.body);
    await newRecord.save();
    res.status(201).send(newRecord);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get('/api/bp/latest', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: '缺少 userId' });

    if (!isMongoReady) {
      const records = getScopedMemoryRecords(userId)
        .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
      if (!records.length) return res.status(404).json({ error: '無血壓記錄' });
      res.json(normalizeBpRecord(records[0]));
      return;
    }

    const query = buildUserRecordQuery(userId);
    const records = await Record.find(query).lean();
    const record = records
      .map(normalizeBpRecord)
      .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a))[0];
    if (!record) return res.status(404).json({ error: '無血壓記錄' });
    res.json(record);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get('/api/caregiver/today-status', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const records = (await getRecordsForUser(userId))
      .map(normalizeBpRecord)
      .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
    const todayKey = getTodayDateKey();
    const latestRecord = records[0] || null;
    const todayRecords = records.filter((record) => getRecordDateKey(record) === todayKey);

    res.json({
      measuredToday: todayRecords.length > 0,
      latestRecord: todayRecords[0] || latestRecord,
      totalToday: todayRecords.length,
    });
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get('/api/caregiver/seven-day-history', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const records = (await getRecordsForUser(userId))
      .map(normalizeBpRecord)
      .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));

    const history = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - index);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const dayRecords = records.filter((record) => getRecordDateKey(record) === dateKey);
      const sysValues = dayRecords.map((record) => record.sys).filter((value) => value > 0);
      const diaValues = dayRecords.map((record) => record.dia).filter((value) => value > 0);

      return {
        date: dateKey,
        dayLabel: index === 0 ? '今天' : getDayLabel(date),
        hasRecord: dayRecords.length > 0,
        records: dayRecords,
        avgSys: sysValues.length ? Math.round(sysValues.reduce((a, b) => a + b, 0) / sysValues.length) : undefined,
        avgDia: diaValues.length ? Math.round(diaValues.reduce((a, b) => a + b, 0) / diaValues.length) : undefined,
      };
    });

    res.json({ history });
  } catch (err) {
    res.status(500).send(err);
  }
});

app.post('/api/caregiver/trigger-sync', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const records = (await getRecordsForUser(userId))
      .map(normalizeBpRecord)
      .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));

    res.json({
      success: true,
      record: records[0] || null,
      message: records[0] ? 'Latest paired record returned.' : 'No paired record yet.',
    });
  } catch (err) {
    res.status(500).send(err);
  }
});

app.post('/api/bp/manual-record', async (req, res) => {
  try {
    const record = {
      ...req.body,
      sys: String(req.body.sys),
      dia: String(req.body.dia),
      pulse: req.body.pulse != null ? String(req.body.pulse) : undefined,
      time: req.body.time || new Date().toLocaleString('zh-TW'),
      id: req.body.id || Date.now().toString(),
      source: req.body.source || 'manual',
    };

    if (!record.userId) return res.status(400).json({ error: 'Missing userId' });

    if (!isMongoReady) {
      const newRecord = { ...record, _id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
      memoryRecords.unshift(newRecord);
      res.status(201).json(newRecord);
      return;
    }

    const newRecord = new Record(record);
    await newRecord.save();
    res.status(201).json(newRecord);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get('/api/bp/statistics', async (req, res) => {
  try {
    const { userId, daysBack = 90 } = req.query;
    if (!userId) return res.status(400).json({ error: '缺少 userId' });
    const days = Math.min(Math.max(Number(daysBack) || 90, 1), 365);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    let records = [];
    if (!isMongoReady) {
      records = getScopedMemoryRecords(userId).filter((record) => getRecordTimestamp(record) >= cutoff);
    } else {
      const query = buildUserRecordQuery(userId);
      const all = await Record.find(query).lean();
      records = all.filter((record) => getRecordTimestamp(record) >= cutoff);
    }

    const dailySummaries = getDailyBpSummaries(records);
    const allSys = records.map((record) => toFiniteNumber(record.sys)).filter((v) => v != null);
    const allDia = records.map((record) => toFiniteNumber(record.dia)).filter((v) => v != null);
    const avgSystolic = allSys.length ? Math.round(allSys.reduce((a, b) => a + b, 0) / allSys.length) : 0;
    const avgDiastolic = allDia.length ? Math.round(allDia.reduce((a, b) => a + b, 0) / allDia.length) : 0;
    const maxSystolic = allSys.length ? Math.max(...allSys) : 0;
    const minSystolic = allSys.length ? Math.min(...allSys) : 0;
    const highBPDays = dailySummaries.filter((day) => day.avgSys >= 140).length;

    res.json({
      period: days <= 90 ? '3m' : '6m',
      avgSystolic,
      avgDiastolic,
      maxSystolic,
      minSystolic,
      highBPDays,
      totalDays: dailySummaries.length,
      trendData: dailySummaries
    });
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get('/api/bp', async (req, res) => {
  try {
    if (!isMongoReady) {
      res.json(getScopedMemoryRecords(req.query.userId));
      return;
    }

    const query = buildUserRecordQuery(req.query.userId);
    const records = await Record.find(query).sort({ _id: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get('/api/bp/summary', async (req, res) => {
  try {
    const months = Math.min(Math.max(Number(req.query.months) || 1, 1), 6);
    if (!isMongoReady) {
      res.json(generateHealthSummary(getScopedMemoryRecords(req.query.userId), months));
      return;
    }

    const query = buildUserRecordQuery(req.query.userId);
    const records = await Record.find(query).sort({ _id: -1 }).lean();
    res.json(generateHealthSummary(records, months));
  } catch (err) {
    res.status(500).send(err);
  }
});

app.listen(PORT, () => {
  console.log(`後端伺服器啟動成功：http://localhost:${PORT}`);
});
