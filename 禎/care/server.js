require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
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
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ['caregiver', 'family'] },
  resetCode: String,
  resetCodeExpires: Date
}));

const DailyRecord = mongoose.model('DailyRecord', new mongoose.Schema({
  caregiverName: String,
  meals: String,
  note: String,
  bloodPressure: String,
  heartRate: String,
  temperature: String,
  createdAt: { type: Date, default: Date.now }
}));

const AbnormalEvent = mongoose.model('AbnormalEvent', new mongoose.Schema({
  caregiverName: String,
  type: String,
  severity: { type: String, enum: ['輕微', '注意','緊急'], default: '注意' },
  description: String,
  createdAt: { type: Date, default: Date.now }
}));

// 🚀 [關鍵修正]：這裡改成了 category 和 content，跟你的 App 對接！
const Reminder = mongoose.model('Reminder', new mongoose.Schema({
  category: { type: String, required: true }, // 類別 (如：用藥提醒)
  content: { type: String, required: true },  // 內容 (如：吃血壓藥)
  time: { type: Date, required: true },       // 時間
  isCompleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}));

// --- 3. API 區域 ---

// [註冊]
app.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: '註冊失敗：欄位不可為空' });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: '此信箱已被註冊' });
    }
    const newUser = new User({ name, email, password, role });
    await newUser.save();
    res.json({ message: '註冊成功！' });
  } catch (error) {
    console.error('註冊錯誤:', error);
    res.status(500).json({ message: '伺服器錯誤' });
  }
});

// [登入]
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || user.password !== password) return res.status(400).json({ message: '帳密錯誤' });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret123');
    res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
  } catch (error) { res.status(500).json({ message: '系統錯誤' }); }
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
    user.password = newPassword;
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
    user.resetCodeExpires = Date.now() + 600000; // 改成 10 分鐘
    await user.save();
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    await transporter.sendMail({
      from: `"MediLink" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '重設密碼驗證碼',
      html: `<div style="padding: 20px; border: 1px solid #ddd;"><h2>重設您的密碼</h2><p>驗證碼：</p><h1 style="color: #007AFF;">${code}</h1></div>`
    });
    res.json({ message: '驗證碼已成功寄出！' });
  } catch (error) {
    console.error('❌ Nodemailer 寄信錯誤：', error);
    res.status(500).json({ message: '寄信失敗' });
  }
});

// [照護紀錄]
app.get('/care-records', async (req, res) => {
  const records = await DailyRecord.find().sort({ createdAt: -1 });
  res.json(records);
});
app.post('/care-records', async (req, res) => {
  const { title, description, bloodPressure, heartRate, temperature } = req.body;
  const newRecord = new DailyRecord({ meals: title, note: description, bloodPressure, heartRate, temperature });
  await newRecord.save();
  res.status(201).json(newRecord);
});

// [異常事件]
app.post('/api/abnormal-events', async (req, res) => {
  try {
    const newEvent = new AbnormalEvent(req.body);
    await newEvent.save();
    res.json({ message: '已回報' });
  } catch (error) {
    res.status(500).json({ message: '存檔失敗' });
  }
});
app.get('/api/abnormal-events', async (req, res) => { 
    const events = await AbnormalEvent.find().sort({ createdAt: -1 });
    res.json(events);
});

// --- 🚀 [重點修正區域] 提醒功能 API ---

// 1. 取得提醒 (GET)
app.get('/api/reminders', async (req, res) => {
  try {
    const reminders = await Reminder.find().sort({ time: 1 });
    res.json(reminders);
  } catch (error) {
    res.status(500).json({ message: '取得失敗' });
  }
});

// 2. 新增提醒 (POST) - 這裡現在會接收 category 和 content
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

// 3. 勾選完成 (PATCH)
app.patch('/api/reminders/:id', async (req, res) => { 
  try {
    const updated = await Reminder.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: '更新失敗' });
  }
});

// 4. 修改內容 (PUT) - 支援修改 content 和 category
app.put('/api/reminders/:id', async (req, res) => {
  try {
    const { category, content, time } = req.body; // 這裡也改成 category, content
    const updatedReminder = await Reminder.findByIdAndUpdate(
      req.params.id,
      { category, content, time },
      { new: true } 
    );
    if (!updatedReminder) return res.status(404).json({ message: '找不到該提醒' });
    res.json(updatedReminder);
  } catch (error) {
    res.status(500).json({ message: '修改失敗', error });
  }
});

// 5. 刪除提醒 (DELETE)
app.delete('/api/reminders/:id', async (req, res) => {
  try {
    await Reminder.findByIdAndDelete(req.params.id);
    res.json({ message: '提醒已成功移除' });
  } catch (error) {
    res.status(500).json({ message: '刪除失敗' });
  }
});

// --- 4. 啟動伺服器 ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`🚀 伺服器啟動: http://localhost:${PORT}`); });