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

const getRecordTimestamp = (record) => {
  const normalizedTime = record.time?.replace(/\//g, '-');
  const timestamp = normalizedTime ? new Date(normalizedTime).getTime() : NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const getRecordDateKey = (record) => {
  const timestamp = getRecordTimestamp(record);
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getRecordIdentityConditions = (record) => {
  const conditions = [];
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
