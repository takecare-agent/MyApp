# TakeCare App 測試指南（vision-integration）

> **請抓分支 `vision-integration`，不要抓 `main`。**
>
> 本分支已包含影像辨識執行包 `vision-runtime/`。  
> clone 這個 repo 後，依作業系統照下方 **Windows** 或 **macOS** 指引操作，即可測試 App + 跌倒偵測。

---

## 0. 共同前置

```bash
git clone https://github.com/takecare-agent/MyApp.git
cd MyApp
git checkout vision-integration
```

確認 repo 根目錄有這三個資料夾：`backend/`、`mobile-expo/`、`vision-runtime/`。

### 環境需求

| 項目 | Windows | macOS |
|---|---|---|
| Node.js | **20.20.2**（建議用 nvm） | **20.20.2**（建議用 nvm） |
| Android | Android Studio + SDK + 模擬器 | Android Studio + SDK + 模擬器 |
| Python（影像辨識） | **3.10 ~ 3.12，64-bit** | **3.10 ~ 3.12** |
| 終端機 | **PowerShell** | Terminal（zsh/bash） |

### 後端設定（兩平台相同）

`backend/.env` 需有：

```env
VISION_MODEL_ENDPOINT=http://localhost:8000/detect
```

### App 測試帳號

| 角色 | Email | 長輩 Email |
|---|---|---|
| 受顧者 | `patient@test.com` | 留空 |
| 看護 | `caregiver@test.com` | `patient@test.com` |
| 家屬 | `family@test.com` | `patient@test.com` |

Android 模擬器 API Base URL：`http://10.0.2.2:5000`

---

## A. Windows 完整啟動（4 個 PowerShell 分頁）

### 分頁 1 — 後端 (5000)

```powershell
cd backend
npm install
npm run dev
```

看到 `Backend running on http://localhost:5000` 即成功。

### 分頁 2 — 影像辨識 (8000)

```powershell
cd vision-runtime
Set-ExecutionPolicy -Scope Process Bypass
.\setup-windows.ps1
.\start-windows.ps1
```

看到 `http://localhost:8000/detect` 即成功。

> ⚠️ **不要用** `source .venv/bin/activate`（那是 macOS/Linux 指令）。

### 分頁 3 — Metro (8081)

```powershell
cd mobile-expo
npm install
npm run start
```

### 分頁 4 — Android App

```powershell
cd mobile-expo
npm run android
```

若出現紅色 `Unable to load script`：

```powershell
adb reverse tcp:8081 tcp:8081
```

然後在模擬器按 **R 兩下** 重載。

---

## B. macOS 完整啟動（4 個 Terminal 分頁）

### 分頁 1 — 後端 (5000)

```bash
cd backend
source ~/.nvm/nvm.sh && nvm use 20.20.2
npm install
npm run dev
```

### 分頁 2 — 影像辨識 (8000)

```bash
cd vision-runtime
bash setup-mac.sh
source .venv/bin/activate
python vision_api_server.py
```

### 分頁 3 — Metro (8081)

```bash
cd mobile-expo
source ~/.nvm/nvm.sh && nvm use 20.20.2
npm install
npm run start
```

### 分頁 4 — Android App

```bash
cd mobile-expo
source ~/.nvm/nvm.sh && nvm use 20.20.2
npm run android
```

若出現紅色 `Unable to load script`：

```bash
adb reverse tcp:8081 tcp:8081
```

然後在模擬器按 **R 兩下** 重載。

攝影機不是外接鏡頭時：

```bash
CAM_INDEX=1 python vision_api_server.py
```

---

## C. Windows 組員錯誤排解（照截圖情境）

若出現以下錯誤，請依序處理：

### 錯誤 1：`source .venv/bin/activate` 無效

**原因**：用了 macOS/Linux 指令。  
**解法**：刪掉舊 venv，改用 Windows 腳本：

```powershell
cd vision-runtime
Remove-Item -Recurse -Force .venv -ErrorAction SilentlyContinue
Set-ExecutionPolicy -Scope Process Bypass
.\setup-windows.ps1
```

### 錯誤 2：`No matching distribution found for tensorflow==2.16.2`

**原因**：Python 版本不支援（常見 **3.13**）或 **32-bit Python**。  
**解法**：

1. 安裝 Python 3.12（64-bit）：https://www.python.org/downloads/
2. 安裝時勾選 **Add python.exe to PATH**
3. 確認版本：

```powershell
py -3.12 -c "import sys; print(sys.version)"
```

3.10 / 3.11 / 3.12 都可以，**不要用 3.13**。

4. 重新安裝：

```powershell
cd vision-runtime
Remove-Item -Recurse -Force .venv -ErrorAction SilentlyContinue
Set-ExecutionPolicy -Scope Process Bypass
.\setup-windows.ps1
```

### 錯誤 3：`Defaulting to user installation because normal site-packages is not writeable`

**原因**：虛擬環境沒啟動，pip 裝到全域。  
**解法**：

```powershell
cd vision-runtime
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 錯誤 4：`ModuleNotFoundError: No module named 'cv2'`

**原因**：上一步 `pip install` 失敗，opencv 沒裝到。  
**解法**：先修好 Python 版本與 venv（錯誤 2、3），再重跑 `setup-windows.ps1`，最後：

```powershell
.\start-windows.ps1
```

### Windows 攝影機找不到

```powershell
cd vision-runtime
.\.venv\Scripts\Activate.ps1
python list_cameras.py
$env:CAM_INDEX=1; python vision_api_server.py
```

---

## D. 功能確認清單

- [ ] 後端 5000 正常（`npm run dev`）
- [ ] 影像 8000 正常（`/health` 有回應）
- [ ] Metro 8081 正常（App 不紅屏）
- [ ] App 登入成功（三角色）
- [ ] 影像頁有串流畫面 + 狀態橫幅
- [ ] 受顧者 SOS → 看護/家屬 SOS 列表可看到

> 若沒跑 `vision-runtime`，App 仍可用，但影像會走 mock 假資料，不是真模型。

---

## 附錄：專案結構與其他功能

| 路徑 | 用途 |
|---|---|
| `backend/` | Node.js API（5000） |
| `mobile-expo/` | React Native App |
| `vision-runtime/` | 跌倒偵測影像服務（8000） |
| `frontend/` | Web 前端（可選） |

### Android Health Connect 血壓同步（實機）

1. 手機需 Android + Health Connect。
2. 先讓血壓計 App 同步資料到 Health Connect。
3. App 登入 `patient` 或 `caregiver`，進血壓照護按「從 Health Connect 同步」。
4. `family` 角色只能監看，不能直接同步。

### 測試登入 API

`POST /mobile/dev-login` — 後端建立/更新測試使用者並回傳 JWT。
