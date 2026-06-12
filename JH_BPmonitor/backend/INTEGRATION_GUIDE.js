/**
 * 後端整合指南：將 caregivingRoutes 集成到 server.js
 * 
 * 在 server.js 中的適當位置添加以下程式碼：
 */

// ─── 在 server.js 中的模型定義區塊之後添加 ────────────────────────────

// 導入照護管理路由
const caregivingRoutes = require('./routes/caregivingRoutes');

// ─── 在 app.use(cors()) 之後添加 ────────────────────────────

// 血壓相關路由（包括家屬端與看護端）
app.use('/api/bp', caregivingRoutes);

// ─── 必要的 npm 依賴 ────────────────────────────────────────────────

/**
 * 確保 backend/package.json 中包含以下依賴：
 */
/*
{
  "dependencies": {
    "express": "^4.18.0",
    "mongoose": "^7.0.0",
    "cors": "^2.8.5",
    "body-parser": "^1.20.0",
    "dotenv": "^16.0.0",
    "axios": "^1.4.0"
  }
}
*/

// ─── 環境變數設定 (.env 檔案) ────────────────────────────────────────

/**
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/blood_pressure_db?retryWrites=true&w=majority
PORT=5000
NODE_ENV=development

Firebase 推送通知設定（如果啟用）:
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email
*/

// ─── 完整的 server.js 整合範例 ────────────────────────────────────────

const fullServerExample = `
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// ──── MongoDB 連線 ────
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => {
      console.log('✅ MongoDB 連線成功！');
    })
    .catch(err => {
      console.error('❌ MongoDB 連線失敗:', err.message);
    });
} else {
  console.warn('⚠️ 未設定 MONGO_URI');
}

// ──── 導入路由 ────
const caregivingRoutes = require('./routes/caregivingRoutes');

// ──── 使用路由 ────
app.use('/api/bp', caregivingRoutes);

// ──── 基本健康檢查 ────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ──── 啟動伺服器 ────
app.listen(PORT, () => {
  console.log(\`🚀 伺服器運行於 http://localhost:\${PORT}\`);
});
`;

module.exports = fullServerExample;
