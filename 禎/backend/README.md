# MediLink Backend

照護管理系統的 Node.js + Express 後端 API 服務。

## 功能

- 使用者註冊/登入（支援家屬與看護角色）
- 密碼重設（寄送驗證碼至 Email）
- 照護紀錄管理（新增、編輯、刪除、查詢）
- 異常事件回報與追蹤
- 提醒事項設定
- 任務模板管理
- 常用項目管理

## 安裝

```bash
npm install
```

## 設定

1. 複製 `.env.example` 為 `.env`
2. 填入你的 MongoDB 連線字串
3. 設定 JWT Secret
4. 設定 Gmail 寄信功能（需開啟「應用程式密碼」）

## 啟動

```bash
npm start
```

伺服器會在 `http://localhost:3000` 啟動

## API 端點

### 認證
- `POST /register` - 註冊
- `POST /login` - 登入
- `POST /reset-password` - 重設密碼
- `POST /api/send-code` - 發送驗證碼

### 照護紀錄
- `GET /care-records` - 取得所有紀錄
- `POST /care-records` - 新增紀錄
- `PUT /care-records/:id` - 編輯紀錄
- `DELETE /care-records/:id` - 刪除紀錄

### 異常事件
- `GET /api/abnormal-events` - 取得事件列表
- `POST /api/abnormal-events` - 回報事件
- `PATCH /api/abnormal-events/:id` - 更新處理狀態

### 提醒
- `GET /api/reminders` - 取得提醒
- `POST /api/reminders` - 新增提醒
- `PUT /api/reminders/:id` - 修改提醒
- `PATCH /api/reminders/:id` - 標記完成
- `DELETE /api/reminders/:id` - 刪除提醒

### 任務模板
- `GET /api/task-templates` - 取得模板
- `GET /api/task-templates/today` - 取得今日任務
- `POST /api/task-templates` - 新增模板
- `PUT /api/task-templates/:id` - 修改模板
- `DELETE /api/task-templates/:id` - 刪除模板

### 常用項目
- `GET /api/custom-items` - 取得項目
- `POST /api/custom-items` - 新增項目
- `PUT /api/custom-items/:id` - 修改項目
- `DELETE /api/custom-items/:id` - 刪除項目

## 資料庫

使用 MongoDB，請確保已啟動 MongoDB 服務。
