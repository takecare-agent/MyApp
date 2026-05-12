require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

const app = express();

app.use(cors());
app.use(express.json());

// --- 1. 資料庫連線 ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB 資料庫連線成功'))
  .catch(err => console.error('❌ 資料庫連線失敗:', err));

// --- 2. 資料模型 (Models) ---

const User = mongoose.model('User', new mongoose.Schema({
  name:             { type: String, required: true },
  email:            { type: String, required: true, unique: true, lowercase: true },
  password:         { type: String, required: true },
  role:             { type: String, required: true, enum: ['caregiver', 'family'] },
  resetCode:        String,
  resetCodeExpires: Date
}));

// 【修正】DailyRecord 加入 sleep 欄位，對齊 CaregiverRecordScreen 送出的資料
const DailyRecord = mongoose.model('DailyRecord', new mongoose.Schema({
  caregiverName: String,
  meals:         String,
  note:          String,
  sleep:         String, // ← 補上 sleep 欄位
  bloodPressure: String,
  heartRate:     String,
  temperature:   String,
  createdAt:     { type: Date, default: Date.now }
}));

// 【修正】AbnormalEvent 加入 eventType 欄位，對齊前端顯示的 item.eventType
const AbnormalEvent = mongoose.model('AbnormalEvent', new mongoose.Schema({
  caregiverName: String,
  eventType:     String,   // ← 新增：對應前端顯示的欄位名稱
  type:          String,   // ← 保留：後端分類用（跌倒/生理異常...）
  severity:      { type: String, enum: ['輕微', '注意', '緊急'], default: '注意' },
  description:   String,
  status:        { type: String, default: 'pending' },
  isHandled:     { type: Boolean, default: false },
  createdAt:     { type: Date, default: Date.now }
}));

const Reminder = mongoose.model('Reminder', new mongoose.Schema({
  category:    { type: String, required: true },
  content:     { type: String, required: true },
  time:        { type: Date, required: true },
  isCompleted: { type: Boolean, default: false },
  createdAt:   { type: Date, default: Date.now }
}));

// 常用項目（看護端 / 家屬端皆可管理）
const CustomItem = mongoose.model('CustomItem', new mongoose.Schema({
  category:  { type: String, required: true },
  content:   { type: String, required: true },
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now }
}));

// 任務模板（家屬設定，看護每日執行）
// weekdays: [0,1,2,3,4,5,6] 代表週日到週六，空陣列 = 每天
const TaskTemplate = mongoose.model('TaskTemplate', new mongoose.Schema({
  category:  { type: String, required: true }, // 如：用藥、飲食
  content:   { type: String, required: true }, // 如：早上用藥
  icon:      { type: String, default: '📋' },
  time:      { type: String, default: '08:00' }, // 預計時間 HH:MM
  weekdays:  { type: [Number], default: [] },    // [] = 每天；[1,3,5] = 週一三五
  order:     { type: Number, default: 0 },       // 排序
  createdAt: { type: Date, default: Date.now }
}));

// --- 3. API 區域 ---

// [註冊] ─ 密碼加密後儲存
app.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: '欄位不可為空' });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: '此信箱已被註冊' });

    // 【修正】密碼加密
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    const newUser = new User({ name, email, password: hashed, role });
    await newUser.save();
    res.json({ message: '註冊成功！' });
  } catch (error) {
    console.error('註冊錯誤:', error);
    res.status(500).json({ message: '伺服器錯誤' });
  }
});

// [登入] ─ 使用 bcrypt 比對密碼
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: '帳密錯誤' });

    // 【修正】bcrypt 比對，不再明文比較
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: '帳密錯誤' });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret123');
    res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
  } catch (error) {
    res.status(500).json({ message: '系統錯誤' });
  }
});

// [重設密碼]
app.post('/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  try {
    const user = await User.findOne({
      email,
      resetCode: code,
      resetCodeExpires: { $gt: Date.now() }
    });
    if (!user) return res.status(400).json({ message: '驗證碼錯誤或已過期' });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    await user.save();
    res.json({ message: '重設成功' });
  } catch (error) {
    res.status(500).json({ message: '伺服器錯誤' });
  }
});

// [發送驗證碼]
app.post('/api/send-code', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: '此信箱尚未註冊' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetCode = code;
    user.resetCodeExpires = Date.now() + 600000;
    await user.save();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    await transporter.sendMail({
      from: `"MediLink" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '重設密碼驗證碼',
      html: `<div style="padding:20px;border:1px solid #ddd;"><h2>重設您的密碼</h2><p>驗證碼：</p><h1 style="color:#007AFF;">${code}</h1><p>驗證碼 10 分鐘內有效</p></div>`
    });
    res.json({ message: '驗證碼已成功寄出！' });
  } catch (error) {
    console.error('❌ Nodemailer 寄信錯誤：', error);
    res.status(500).json({ message: '寄信失敗' });
  }
});

// [照護紀錄] GET
app.get('/care-records', async (req, res) => {
  const records = await DailyRecord.find().sort({ createdAt: -1 });
  res.json(records);
});

// [照護紀錄] POST
// 【修正】同時支援兩種路徑：CaregiverHomeScreen 用 /care-records，CaregiverRecordScreen 用 /api/records
app.post('/care-records', async (req, res) => {
  try {
    const { title, description, bloodPressure, heartRate, temperature, sleep, caregiverName } = req.body;
    const newRecord = new DailyRecord({
      meals: title,
      note: description,
      bloodPressure,
      heartRate,
      temperature,
      sleep,
      caregiverName
    });
    await newRecord.save();
    res.status(201).json(newRecord);
  } catch (error) {
    res.status(500).json({ message: '儲存失敗' });
  }
});

// [照護紀錄] PUT（編輯）
app.put('/care-records/:id', async (req, res) => {
  try {
    const { meals, note, sleep } = req.body;
    const updated = await DailyRecord.findByIdAndUpdate(
      req.params.id,
      { meals, note, sleep },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: '找不到此紀錄' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: '修改失敗' });
  }
});

// [照護紀錄] DELETE
app.delete('/care-records/:id', async (req, res) => {
  try {
    await DailyRecord.findByIdAndDelete(req.params.id);
    res.json({ message: '已刪除' });
  } catch (error) {
    res.status(500).json({ message: '刪除失敗' });
  }
});

// 【修正】CaregiverRecordScreen 原本打 /api/records，改為對齊的路由
app.post('/api/records', async (req, res) => {
  try {
    const { bloodPressure, heartRate, temperature, meals, sleep, note, caregiverName } = req.body;
    const newRecord = new DailyRecord({
      bloodPressure, heartRate, temperature, meals, sleep, note, caregiverName
    });
    await newRecord.save();
    res.status(201).json(newRecord);
  } catch (error) {
    res.status(500).json({ message: '儲存失敗' });
  }
});

// [異常事件] POST
// 【修正】將前端傳來的 type 同時存入 eventType，讓列表顯示正確
app.post('/api/abnormal-events', async (req, res) => {
  try {
    const { type, description, severity, status } = req.body;
    const newEvent = new AbnormalEvent({
      eventType: type,   // ← 對應前端 AbnormalListScreen 顯示的 item.eventType
      type,
      description,
      severity: severity || '注意',
      status: status || 'pending'
    });
    await newEvent.save();
    res.status(201).json({ message: '已回報' });
  } catch (error) {
    console.error('異常事件儲存失敗:', error);
    res.status(500).json({ message: '存檔失敗' });
  }
});

// [異常事件] GET
app.get('/api/abnormal-events', async (req, res) => {
  const events = await AbnormalEvent.find().sort({ createdAt: -1 });
  res.json(events);
});

// [異常事件] 標記已處理
app.patch('/api/abnormal-events/:id', async (req, res) => {
  try {
    const updated = await AbnormalEvent.findByIdAndUpdate(
      req.params.id,
      { isHandled: req.body.isHandled },
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: '更新失敗' });
  }
});

// [提醒] GET
app.get('/api/reminders', async (req, res) => {
  try {
    const reminders = await Reminder.find().sort({ time: 1 });
    res.json(reminders);
  } catch (error) {
    res.status(500).json({ message: '取得失敗' });
  }
});

// [提醒] POST
app.post('/api/reminders', async (req, res) => {
  try {
    const { category, content, time } = req.body;
    const newReminder = new Reminder({ category, content, time });
    await newReminder.save();
    res.status(201).json(newReminder);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '新增失敗' });
  }
});

// [提醒] PATCH（打勾）
app.patch('/api/reminders/:id', async (req, res) => {
  try {
    const updated = await Reminder.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: '更新失敗' });
  }
});

// [提醒] PUT（修改內容）
app.put('/api/reminders/:id', async (req, res) => {
  try {
    const { category, content, time } = req.body;
    const updated = await Reminder.findByIdAndUpdate(
      req.params.id,
      { category, content, time },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: '找不到該提醒' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: '修改失敗' });
  }
});

// [提醒] DELETE
app.delete('/api/reminders/:id', async (req, res) => {
  try {
    await Reminder.findByIdAndDelete(req.params.id);
    res.json({ message: '提醒已成功移除' });
  } catch (error) {
    res.status(500).json({ message: '刪除失敗' });
  }
});

// --- 常用項目 API ---

// GET 取得全部
app.get('/api/custom-items', async (req, res) => {
  try {
    const items = await CustomItem.find().sort({ category: 1, createdAt: 1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: '取得失敗' });
  }
});

// POST 新增
app.post('/api/custom-items', async (req, res) => {
  try {
    const { category, content, createdBy } = req.body;
    if (!category || !content) {
      return res.status(400).json({ message: '項目名稱與內容不可為空' });
    }
    const newItem = new CustomItem({ category, content, createdBy });
    await newItem.save();
    res.status(201).json(newItem);
  } catch (error) {
    res.status(500).json({ message: '新增失敗' });
  }
});

// PUT 修改
app.put('/api/custom-items/:id', async (req, res) => {
  try {
    const { category, content } = req.body;
    const updated = await CustomItem.findByIdAndUpdate(
      req.params.id,
      { category, content },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: '找不到此項目' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: '修改失敗' });
  }
});

// DELETE 刪除
app.delete('/api/custom-items/:id', async (req, res) => {
  try {
    await CustomItem.findByIdAndDelete(req.params.id);
    res.json({ message: '已刪除' });
  } catch (error) {
    res.status(500).json({ message: '刪除失敗' });
  }
});

// --- 任務模板 API ---

// GET 取得所有模板
app.get('/api/task-templates', async (req, res) => {
  try {
    const templates = await TaskTemplate.find().sort({ order: 1, time: 1 });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: '取得失敗' });
  }
});

// GET 取得今天應執行的任務（依星期幾過濾）
app.get('/api/task-templates/today', async (req, res) => {
  try {
    const todayWeekday = new Date().getDay(); // 0=週日, 1=週一 ...
    const all = await TaskTemplate.find().sort({ order: 1, time: 1 });
    // weekdays 為空陣列 = 每天都執行；否則只在指定的星期執行
    const todayTasks = all.filter(t => t.weekdays.length === 0 || t.weekdays.includes(todayWeekday));
    res.json(todayTasks);
  } catch (error) {
    res.status(500).json({ message: '取得失敗' });
  }
});

// POST 新增模板
app.post('/api/task-templates', async (req, res) => {
  try {
    const { category, content, icon, time, weekdays, order } = req.body;
    if (!category || !content) return res.status(400).json({ message: '類別與內容不可為空' });
    const t = new TaskTemplate({ category, content, icon, time, weekdays: weekdays || [], order: order || 0 });
    await t.save();
    res.status(201).json(t);
  } catch (error) {
    res.status(500).json({ message: '新增失敗' });
  }
});

// PUT 修改模板
app.put('/api/task-templates/:id', async (req, res) => {
  try {
    const { category, content, icon, time, weekdays, order } = req.body;
    const updated = await TaskTemplate.findByIdAndUpdate(
      req.params.id,
      { category, content, icon, time, weekdays, order },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: '找不到此任務' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: '修改失敗' });
  }
});

// DELETE 刪除模板
app.delete('/api/task-templates/:id', async (req, res) => {
  try {
    await TaskTemplate.findByIdAndDelete(req.params.id);
    res.json({ message: '已刪除' });
  } catch (error) {
    res.status(500).json({ message: '刪除失敗' });
  }
});

// --- 4. 啟動伺服器 ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 伺服器啟動: http://localhost:${PORT}`);
});
