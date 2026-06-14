# React Native CLI 手機測試指南

這個版本是給 Android / iOS 原生 React Native CLI 專案使用，不使用 managed workflow，也不需要相關套件。

## 專案結構

1. 後端：`backend`
2. 手機前端：`mobile-expo`
3. Web 前端：`frontend`

## 主要套件

1. `react`: `19.1.0`
2. `react-native`: `0.81.5`
3. `@react-native-async-storage/async-storage`: `2.2.0`
4. `react-native-webview`: `13.15.0`
5. `react-native-vector-icons`: `^10.3.0`

## 1. 安裝手機原生依賴

在 `mobile-expo` 執行：

```bash
npm install react-native-vector-icons
npm install --save-dev @react-native/metro-config@0.81.5 @react-native/babel-preset@0.81.5 @react-native-community/cli@20.0.0 @react-native-community/cli-platform-android@20.0.0 @react-native-community/cli-platform-ios@20.0.0
```

如果已經套用本次修改，也可以直接執行：

```bash
npm install
```

## 2. 啟動後端

在 `backend` 執行：

```bash
npm install
npm run dev
```

## 3. 啟動手機 App

在 `mobile-expo` 執行 Metro：

```bash
npm run start
```

另開一個終端機執行 Android：

```bash
npm run android
```

iOS 需要在 macOS 與 CocoaPods 環境下執行：

```bash
npm run ios
```

## 4. 手機登入設定

App 會要求輸入：

1. `API Base URL`：例如 `http://192.168.1.25:5000`
2. `Web Base URL`：例如 `http://192.168.1.25:5173`
3. `Email`
4. `Role`：`patient` / `family` / `caregiver`

實體手機不要使用 `localhost`，請改用電腦的 LAN IP。

## 5. 測試登入 API

手機測試登入會呼叫：

`POST /mobile/dev-login`

後端會建立或更新測試使用者，並回傳 JWT token 給手機 App 使用。
