# React Native CLI 手機測試指南

> 分支：`vision-integration`
>
> 本分支已包含影像辨識執行包 `vision-runtime/`。
> 組員只要 clone 這個 repo（不用另外下載 Fall_Detection_Lab），即可測試 App + 跌倒偵測。

## 快速啟動（四個服務）

請開 4 個終端機分頁，依序執行：

```bash
# 1) 後端 (5000)
cd backend
npm install
npm run dev

# 2) 影像辨識服務 (8000)
cd vision-runtime
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell:
# .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python vision_api_server.py

# 3) Metro (8081)
cd mobile-expo
npm install
npm run start

# 4) 安裝/啟動 Android App
cd mobile-expo
npm run android
```

如果 Android 出現連不到 Metro，執行：

```bash
adb reverse tcp:8081 tcp:8081
```

## 必要設定（影像辨識）

`backend/.env` 需有：

```env
VISION_MODEL_ENDPOINT=http://localhost:8000/detect
```

若未啟動 `vision-runtime`，後端會 fallback 到 mock 影像資料，App 仍可跑，但不是即時真模型。

## App 測試帳號（建議）

- 受顧者：`patient@test.com`
- 看護：`caregiver@test.com`（長輩 Email 填 `patient@test.com`）
- 家屬：`family@test.com`（長輩 Email 填 `patient@test.com`）
- Android 模擬器 API Base URL：`http://10.0.2.2:5000`

## 跨平台說明（Windows 組員）

- Windows 可以跑影像辨識，非 macOS 專屬。
- 請用 Python 3.10~3.12。
- 攝影機不通時先跑 `python list_cameras.py`，再指定 `CAM_INDEX` 啟動：
  - PowerShell：`$env:CAM_INDEX=1; python vision_api_server.py`
  - macOS/Linux：`CAM_INDEX=1 python vision_api_server.py`

這個版本是給 Android / iOS 原生 React Native CLI 專案使用，不使用 managed workflow。Android 血壓同步會使用 Health Connect 原生套件。

## 專案結構

1. 後端：`backend`
2. 手機前端：`mobile-expo`
3. Web 前端：`frontend`

## 主要套件

1. `react`: `19.1.0`
2. `react-native`: `0.81.5`
3. `@react-native-async-storage/async-storage`: `2.2.0`
4. `react-native-vector-icons`: `^10.3.0`
5. `react-native-health-connect`: `^3.5.3`

## 1. 安裝手機原生依賴

在 `mobile-expo` 執行：

```bash
npm install react-native-vector-icons
npm install react-native-health-connect
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
2. `Email`
3. `Role`：`patient` / `family` / `caregiver`

實體手機不要使用 `localhost`，請改用電腦的 LAN IP。

## 5. 測試登入 API

手機測試登入會呼叫：

`POST /mobile/dev-login`

後端會建立或更新測試使用者，並回傳 JWT token 給手機 App 使用。

## 6. Android Health Connect 血壓同步

實機同步流程：

1. 手機需為 Android，且已安裝/啟用 Health Connect。
2. 先讓 OMRON 或血壓計 App 將血壓資料同步到 Health Connect。
3. 開啟本 App，登入並選擇 `patient` 或 `caregiver`。
4. 進入血壓照護功能，按「從 Health Connect 同步」。
5. 第一次會跳出 Health Connect 權限頁，請允許血壓與心率讀取。
6. App 會讀取近 30 天血壓資料，並用 HeartRate 資料補脈搏。
7. 後端會用 `syncKey` 去重，只匯入缺少的紀錄；重複紀錄不會反覆新增。

注意：`family` 角色是監看模式，不能直接同步或新增血壓資料。家屬端會查看已綁定長輩的同步結果。
