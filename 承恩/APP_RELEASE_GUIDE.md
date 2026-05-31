# 手機測試版 App 指南（iOS 優先，非上架）

這份流程只針對「手機上可以像 App 一樣打開使用」，不包含 App Store / Google Play 上架。

## 1) 目前狀態

1. 專案已完成 Capacitor 整合。
2. 已有原生專案：
   - `frontend/ios`
   - `frontend/android`
3. 你只要做「前端打包 + 同步」就能更新手機 App 內容。

## 2) 最常用指令（在 `frontend` 執行）

```bash
npm run app:prepare
```

這個指令會：

1. 先 build 前端
2. 再 sync 到 iOS/Android 原生專案
3. 已處理 Windows 中文路徑常見錯誤（`spawn EPERM`）

## 3) iOS 測試（優先）

iOS 真機安裝一定要用 macOS + Xcode（Windows 無法直接編譯 iOS App）。

1. 在 Mac 開專案的 `frontend`。
2. 執行：

```bash
npm install
npm run app:prepare:ios
npm run app:open:ios
```

3. Xcode 裡做最小設定：
   - `Signing & Capabilities` 選你的 Team（Apple ID 也可）
   - 接上 iPhone，選實機後按 Run

這樣就能把測試版 App 安裝到 iPhone，不需要上架。

## 4) Android 測試

1. 在 `frontend` 執行：

```bash
npm run app:prepare:android
npm run app:open:android
```

2. Android Studio 選模擬器或實機後按 Run。

## 5) 每次你改完前端後

重跑一次：

```bash
npm run app:prepare
```

再回 Xcode / Android Studio 按 Run 即可看到最新畫面。

## 6) API 連線設定（測試用）

在 `frontend/.env` 設定：

```env
VITE_API_BASE_URL=http://你的後端IP:5000
```

注意：手機不能用 `localhost` 連你的電腦後端，需改成電腦在同網路下可連到的 IP。
