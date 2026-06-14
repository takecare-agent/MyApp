const mongoose = require('mongoose');

const careRecordSchema = new mongoose.Schema({
  // 1. 紀錄類型 (對應你的需求：每日照護、異常紀錄、提醒)
  type: {
    type: String,
    enum: ['daily', 'abnormal', 'reminder'],
    required: true
  },

  // 2. 誰是被照顧者？(家屬/病患的 User ID)
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // 3. 誰寫這筆紀錄？(看護的 User ID)
  caregiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // 4. 內容詳情
  title: { type: String }, // 例如：「午餐紀錄」、「跌倒意外」
  description: { type: String }, // 詳細文字

  // 5. 照護項目類型（飲食/用藥/清潔等）
  meals: { type: String },

  // 6. 照護詳情
  note: { type: String },

  // 7. 睡眠記錄
  sleep: { type: String },

  // 8. 生理數值
  bloodPressure: { type: String }, // 如 "120/80"
  heartRate: { type: Number },      // bpm
  temperature: { type: Number },    // °C

  // 9. 數值資料 (給每日照護用，例如血壓、體溫)
  vitals: {
    temperature: Number,
    systolic: Number, // 收縮壓
    diastolic: Number // 舒張壓
  },

  // 10. 照護者名稱（直接存字串，方便列表顯示）
  caregiverName: { type: String },

  // 11. 是否已讀/已完成 (給提醒用)
  isCompleted: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CareRecord', careRecordSchema);