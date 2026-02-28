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
    ref: 'User',
    required: true
  },

  // 3. 誰寫這筆紀錄？(看護的 User ID)
  caregiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // 4. 內容詳情
  title: { type: String, required: true }, // 例如：「午餐紀錄」、「跌倒意外」、「吃藥提醒」
  description: { type: String }, // 詳細文字
  
  // 5. 數值資料 (給每日照護用，例如血壓、體溫，選填)
  vitals: {
    temperature: Number,
    systolic: Number, // 收縮壓
    diastolic: Number // 舒張壓
  },

  // 6. 是否已讀/已完成 (給提醒用)
  isCompleted: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CareRecord', careRecordSchema);