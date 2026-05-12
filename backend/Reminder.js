const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  // 1. 類別 (對應前端的 category)
  category: {
    type: String,
    required: true
  },
  
  // 2. 內容 (對應前端的 content)
  content: {
    type: String,
    required: true
  },

  // 3. 時間 (前端傳 time)
  time: {
    type: Date,
    required: true
  },

  // 4. 完成狀態
  isCompleted: {
    type: Boolean,
    default: false
  },

  // 5. 建立時間
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Reminder', reminderSchema);