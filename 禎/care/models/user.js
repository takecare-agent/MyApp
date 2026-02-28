const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  
  role: { type: String, enum: ['caregiver', 'family'], default: 'caregiver' },
  resetCode: { type: String }, 
  resetCodeExpires: { type: Date }, // 驗證碼有效期
  createdAt: { type: Date, default: Date.now }
});

// 👇 重點檢查這裡：括號裡面要是空的 ()
userSchema.pre('save', async function() { 
  // 1. 如果密碼沒被修改過，直接結束
  if (!this.isModified('password')) {
    return;
  }
  
  // 2. 加密流程
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  
  // 3. 函式執行完畢，因為是 async，Mongoose 會自動知道「做完了」，不用 call next()
});

module.exports = mongoose.model('User', userSchema);