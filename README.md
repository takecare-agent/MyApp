# TakeCare

居家照護 App：跌倒影像偵測、SOS、看護／家屬通知、聊天與血壓紀錄。

手機端為 React Native（`mobile-expo`）。後端為 Node.js（`backend`）。攝影機辨識為 Python（`vision-runtime`，MediaPipe 骨架＋自訓 LSTM v8＋姿勢狀態機）。

## 目錄

| 路徑 | 說明 |
|---|---|
| `mobile-expo/` | iOS／Android 應用程式 |
| `backend/` | REST API（埠 5000） |
| `vision-runtime/` | 外接攝影機與跌倒辨識（埠 8000） |
| `docs/` | 系統文件書 |
| `frontend/` | 早期網頁原型，非正式手機版 |
| `scripts/` | 建置輔助腳本 |

密鑰請複製 `backend/.env.example` 為 `backend/.env`，勿將 `.env` 與 Firebase 服務帳號提交至版本庫。

## 本機啟動（三個終端，順序如下）

**1. 後端**

```
cd backend
node index.js
```

等到出現 `[whisper] ready` 與 `Backend running`。

**2. Metro**

```
cd mobile-expo
node scripts/run-metro.js
```

`http://127.0.0.1:8081/status` 應回傳 `packager-status:running`。

**3. 攝影機（選用）**

```
cd vision-runtime
./start-cam.sh
```

外接鏡頭固定編號 0。Android USB 另執行：

```
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5000 tcp:5000
adb reverse tcp:8000 tcp:8000
```

## 測試帳號

密碼皆為 `Test1234!`。

| 角色 | Email |
|---|---|
| 受顧者 | patient@test.com |
| 看護 | caregiver@test.com |
| 家屬 | family@test.com |

分支請使用 `vision-integration`。
