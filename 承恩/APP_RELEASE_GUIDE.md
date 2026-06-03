# Expo Go 手機測試指南（SDK 54）

這個版本是給 iPhone / Android 用 Expo Go 測試，不是上架版。

## 專案結構

1. 後端（Node.js）：`backend`
2. 手機前端（React Native / Expo Go）：`mobile-expo`
3. Web 前端（React）：`frontend`

## 目前已鎖定的相容版本

1. `expo`: `~54.0.35`
2. `react`: `19.1.0`
3. `react-native`: `0.81.5`
4. `expo-status-bar`: `~3.0.9`
5. `@react-native-async-storage/async-storage`: `2.2.0`

## 1) 啟動後端

在 `backend` 執行：

```bash
npm install
npm run dev
```

## 2) 啟動 Expo Go 專案

在 `mobile-expo` 執行：

```bash
npm install
npx expo start
```

如果 iPhone 和電腦在同一個 Wi-Fi，優先用 LAN 模式；若網路環境複雜再改用 tunnel。

## 3) 手機登入（測試用）

App 首頁會要求：

1. `API Base URL`（例如 `http://192.168.1.25:5000`）
2. `Email`
3. `Role`（patient / family / caregiver）

按下 `Login for Mobile Test` 後，會呼叫：

`POST /mobile/dev-login`

用途是建立/更新測試使用者並回傳 JWT。

## 4) 注意事項

1. 手機不能用 `localhost` 連你電腦後端，必須用電腦 LAN IP。
2. Expo Go 版本如果太舊，先到 App Store 更新到最新公開版。
3. 若開不起來，先刪 Expo Go 內快取後重掃 QR。

