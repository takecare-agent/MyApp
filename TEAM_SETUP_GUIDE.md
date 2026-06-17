# TakeCare 組員完整安裝指南（0 → 1）

> **分支：`vision-integration`（不要抓 `main`）**  
> **本 repo 已包含 App + 後端 + 影像辨識執行包（`vision-runtime/`）**  
> 照本文件逐步操作即可，不需另外下載模型 zip。

---

## 一、你會得到什麼

完成後可測試：

- 受顧者 / 看護 / 家屬 三角色 App
- SOS、血壓、異常事件、聊天室等功能
- **電腦鏡頭即時跌倒偵測**（`vision-runtime`）

---

## 二、重要觀念（先看這段）

### 1) 沒有密碼

App 測試登入**只用 Email**，沒有密碼欄位。  
後端會用 `POST /mobile/dev-login` 建立/更新測試帳號並回傳 token。

### 2) 需要同時跑 4 個服務

| 服務 | Port | 資料夾 |
|---|---:|---|
| 後端 API | 5000 | `backend/` |
| 影像辨識 | 8000 | `vision-runtime/` |
| Metro Bundler | 8081 | `mobile-expo/` |
| Android App | - | `mobile-expo/`（模擬器或實機） |

### 3) 影像辨識用「電腦鏡頭」

- 影像服務跑在你電腦上，讀的是**你電腦的 webcam**（不是手機鏡頭）。
- App 只是透過網路看 `/stream` 畫面與狀態。
- 預設鏡頭編號是 `CAM_INDEX=0`；若不對，用 `list_cameras.py` 找正確編號。

### 4) API Base URL 規則

| 測試方式 | API Base URL 填什麼 | 影像服務會自動變成 |
|---|---|---|
| Android 模擬器（同電腦） | `http://10.0.2.2:5000` | `http://10.0.2.2:8000` |
| Android 實機（同 Wi‑Fi） | `http://你的電腦IP:5000` | `http://你的電腦IP:8000` |

> 不要用 `localhost` 給手機/模擬器填（手機上的 localhost 不是自己電腦）。

查電腦 IP：
- Windows：`ipconfig`（看 IPv4，例如 `192.168.1.100`）
- macOS：`ipconfig getifaddr en0`

### 5) 帳號與綁定順序（很重要）

1. **先登入受顧者**（建立長輩帳號）
2. 再登入看護/家屬，並填「長輩 Email」= 受顧者 Email

| 角色 | Email | 長輩 Email |
|---|---|---|
| 受顧者 | `patient@test.com` | 留空 |
| 看護 | `caregiver@test.com` | `patient@test.com` |
| 家屬 | `family@test.com` | `patient@test.com` |

---

## 三、下載專案

```bash
git clone https://github.com/takecare-agent/MyApp.git
cd MyApp
git checkout vision-integration
git pull
```

確認目前資料夾下**同層**有：

- `backend/`
- `mobile-expo/`
- `vision-runtime/`

若路徑變成 `.../MyApp/MyApp/...`（雙層資料夾），請退回正確根目錄再操作。

---

# Windows 完整流程

## W-0. 安裝系統工具（只做一次）

請安裝：

1. **Git**：https://git-scm.com/download/win
2. **Node.js 20.20.2**（建議 nvm-windows）：https://github.com/coreybutler/nvm-windows
3. **Android Studio**（含 SDK、Emulator、Platform Tools）
4. **Python 3.12（64-bit）**：https://www.python.org/downloads/
   - 安裝時勾選 **Add python.exe to PATH**
   - 不要用 Python 3.13（TensorFlow 裝不起來）

安裝後檢查（PowerShell）：

```powershell
git --version
node -v          # 應為 v20.20.2
npm -v
adb version
py -3.12 -c "import sys; print(sys.version)"
```

`py -3.12` 必須成功，且版本是 3.10/3.11/3.12。

---

## W-1. 後端設定（只做一次）

打開 `backend/.env`，確認有這行：

```env
VISION_MODEL_ENDPOINT=http://localhost:8000/detect
```

> repo 內通常已有 `.env`（含 MongoDB 連線）。若你 clone 後沒有 `.env`，複製：
>
> `copy backend\.env.example backend\.env`
>
> 並向組長索取 `MONGO_URI` 等值。

---

## W-2. 開 4 個 PowerShell 分頁

### 分頁 1：後端（5000）

```powershell
cd <你的路徑>\MyApp\backend
npm install
npm run dev
```

成功訊息：
- `Backend running on http://localhost:5000`
- `MongoDB connected`

---

### 分頁 2：影像辨識（8000）

```powershell
cd <你的路徑>\MyApp\vision-runtime
Set-ExecutionPolicy -Scope Process Bypass
.\setup-windows.ps1
.\start-windows.ps1
```

成功訊息：
- `http://localhost:8000/detect`
- `http://localhost:8000/stream`

> ⚠️ Windows 不要用 `source .venv/bin/activate`（那是 macOS 指令）。

#### 鏡頭不是 0 號時（常見）

```powershell
cd <你的路徑>\MyApp\vision-runtime
.\.venv\Scripts\Activate.ps1
python list_cameras.py
$env:CAM_INDEX=1
python vision_api_server.py
```

---

### 分頁 3：Metro（8081）

```powershell
cd <你的路徑>\MyApp\mobile-expo
npm install
npm run start
```

看到 `Dev server ready` 即成功。

---

### 分頁 4：Android App

先開好 Android 模擬器，再執行：

```powershell
cd <你的路徑>\MyApp\mobile-expo
npm run android
```

若紅屏 `Unable to load script`：

```powershell
adb reverse tcp:8081 tcp:8081
```

回到模擬器按 **R 兩下** 重載。

---

## W-3. App 登入與測試

1. API Base URL：`http://10.0.2.2:5000`（模擬器）
2. Email / 角色依「帳號表」登入
3. 進入「影像偵測」：
   - 有即時畫面 = 鏡頭與 8000 正常
   - 狀態顯示正常監測中 = `/health` 正常
4. 測 SOS：受顧者觸發後，看護/家屬在 SOS 列表可看到

---

## W-4. Windows 常見錯誤（你截圖那組）

| 錯誤 | 原因 | 解法 |
|---|---|---|
| `source .venv/bin/activate` 無效 | 用錯系統指令 | 改用 `.\setup-windows.ps1` |
| `No matching distribution found for tensorflow==2.16.2` | Python 3.13 或 32-bit | 改裝 Python 3.12 64-bit 後重跑 setup |
| `Defaulting to user installation...` | venv 沒啟動 | `.\.venv\Scripts\Activate.ps1` 後再 pip |
| `No module named 'cv2'` | pip 安裝失敗 | 先修 Python/venv，再重跑 setup |
| App 紅屏連不到 Metro | 8081 未轉發 | `adb reverse tcp:8081 tcp:8081` |
| 影像頁空白 | 8000 沒開或鏡頭錯 | 開 `vision_api_server.py` + 調 `CAM_INDEX` |

Windows 一鍵重裝影像環境：

```powershell
cd vision-runtime
Remove-Item -Recurse -Force .venv -ErrorAction SilentlyContinue
Set-ExecutionPolicy -Scope Process Bypass
.\setup-windows.ps1
.\start-windows.ps1
```

---

# macOS 完整流程

## M-0. 安裝系統工具（只做一次）

請安裝：

1. **Xcode Command Line Tools**：`xcode-select --install`
2. **nvm + Node 20.20.2**
3. **Android Studio**（含 SDK、Emulator）
4. **Python 3.10~3.12**（可用系統 python3 或 pyenv）
5. **JDK 17**（建議 Azul Zulu 17）

安裝後檢查：

```bash
git --version
source ~/.nvm/nvm.sh && nvm use 20.20.2 && node -v
adb version
python3 --version
```

---

## M-1. 後端設定（只做一次）

確認 `backend/.env` 有：

```env
VISION_MODEL_ENDPOINT=http://localhost:8000/detect
```

---

## M-2. 開 4 個 Terminal 分頁

### 分頁 1：後端（5000）

```bash
cd ~/path/to/MyApp/backend
source ~/.nvm/nvm.sh && nvm use 20.20.2
npm install
npm run dev
```

---

### 分頁 2：影像辨識（8000）

```bash
cd ~/path/to/MyApp/vision-runtime
bash setup-mac.sh
source .venv/bin/activate
python vision_api_server.py
```

鏡頭不是 0 號時：

```bash
source .venv/bin/activate
python list_cameras.py
CAM_INDEX=1 python vision_api_server.py
```

---

### 分頁 3：Metro（8081）

```bash
cd ~/path/to/MyApp/mobile-expo
source ~/.nvm/nvm.sh && nvm use 20.20.2
npm install
npm run start
```

---

### 分頁 4：Android App

```bash
cd ~/path/to/MyApp/mobile-expo
source ~/.nvm/nvm.sh && nvm use 20.20.2
npm run android
```

紅屏時：

```bash
adb reverse tcp:8081 tcp:8081
```

模擬器按 **R 兩下** 重載。

---

## M-3. App 登入與測試

同 Windows 的 W-3（帳號、API URL、影像頁、SOS 測試）。

---

# 功能驗收清單（兩平台通用）

- [ ] 後端 5000 正常
- [ ] 影像 8000 正常（瀏覽器開 `http://localhost:8000/health` 有 JSON）
- [ ] Metro 8081 正常（App 不紅屏）
- [ ] 三角色可登入（受顧者先、再看護/家屬綁定）
- [ ] 影像頁有即時畫面（電腦鏡頭）
- [ ] 受顧者 SOS → 看護/家屬看得到

---

# 影像辨識補充（鏡頭相關）

## 可以用自己的電腦鏡頭嗎？

可以，而且**預設就是用電腦鏡頭**。

## 需要改什麼？

通常只要改 `CAM_INDEX`（鏡頭編號）：

- 預設：`0`
- 內建鏡頭常是 `1`（視電腦而定）
- 外接 USB 鏡頭常是 `0` 或 `1`

先用：

```bash
python list_cameras.py
```

再啟動：

- Windows：`$env:CAM_INDEX=1; python vision_api_server.py`
- macOS：`CAM_INDEX=1 python vision_api_server.py`

## 不用改程式碼的情況

- 用 Android 模擬器測試
- API Base URL 填 `http://10.0.2.2:5000`
- 後端 `.env` 已是 `VISION_MODEL_ENDPOINT=http://localhost:8000/detect`

## 需要改設定的情況

- 用 Android 實機：API Base URL 改電腦區網 IP（例如 `http://192.168.1.25:5000`）
- 鏡頭畫面黑屏：改 `CAM_INDEX`
- 鏡頭被 Zoom/Teams 佔用：先關閉那些程式

---

# 還是不行時，回報組長這 6 行

```text
1) 作業系統：Windows / macOS + 版本
2) python --version / py -3.12 --version
3) node -v
4) 四個服務是否都在跑（5000/8000/8081/App）
5) App API Base URL 填什麼
6) 錯誤截圖或終端機最後 20 行
```

---

最後更新：2026-06-17（vision-integration）
