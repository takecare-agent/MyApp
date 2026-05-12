const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  // 🔗 關鍵：這筆資料屬於哪個使用者？(關聯 User Model)
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // 基本健康數值
  gender: { type: String, enum: ['Male', 'Female', 'Other'] }, // 性別
  age: { type: Number },
  height: { type: Number }, // cm
  weight: { type: Number }, // kg
  bloodType: { type: String }, // 血型
  
  // 進階資料 (陣列)
  allergies: [String], // 過敏源，例如 ["花生", "盤尼西林"]
  medicalHistory: [String], // 病史，例如 ["高血壓", "糖尿病"]

  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Profile', profileSchema);