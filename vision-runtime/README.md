# TakeCare Vision — 跌倒偵測影像服務

TakeCare App 的即時跌倒偵測服務。攝影機畫面經 MediaPipe Pose + TFLite 模型 + 狀態機判斷，
透過 HTTP 提供給 TakeCare 後端與 App。**Windows / macOS / Linux 皆可跑**（純 Python）。

> 這是「執行用」精簡包，只含跑服務需要的檔案，不含訓練資料與模型訓練腳本。

## 內容
| 檔案 | 用途 |
|---|---|
| `vision_api_server.py` | 主程式：攝影機 + 推論 + HTTP API |
| `fall_detection_model_v8.tflite` | 跌倒偵測模型 (v8) |
| `thresholds_v8.json` | 模型閾值 |
| `list_cameras.py` | 列出可用攝影機編號（找 CAM_INDEX 用）|
| `requirements.txt` | 套件版本 |

## 需求
- Python **3.10 ~ 3.12**（TensorFlow 2.16 / MediaPipe 0.10 支援範圍）
- 一支 webcam

## 安裝

### Windows（推薦：一鍵腳本）

```powershell
cd vision-runtime
Set-ExecutionPolicy -Scope Process Bypass
.\setup-windows.ps1
.\start-windows.ps1
```

> ⚠️ **不要用** `source .venv/bin/activate`（那是 macOS/Linux 指令）。

### macOS / Linux

```bash
cd vision-runtime
bash setup-mac.sh
source .venv/bin/activate
python vision_api_server.py
```

### 手動安裝（進階）

#### Windows (PowerShell)
```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

#### macOS / Linux
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 執行

先找攝影機編號（看哪個是你的 webcam）：
```bash
python list_cameras.py
```

啟動服務（預設 port 8000、攝影機 CAM_INDEX=0）：
```bash
python vision_api_server.py
```

指定攝影機 / 參數：
```bash
# macOS / Linux
CAM_INDEX=1 VISION_API_PORT=8000 python vision_api_server.py

# Windows PowerShell
$env:CAM_INDEX=1; python vision_api_server.py
```

啟動成功會看到：
```
偵測結果 API : http://localhost:8000/detect   (POST)
即時影像串流 : http://localhost:8000/stream   (GET, 給 App 看)
健康狀態     : http://localhost:8000/health   (GET)
```

會跳出一個視窗顯示即時畫面與骨架；狀態為 **CONFIRMED（紅）時按 `r`** 可手動重置，按 `q` 離開。
不想開視窗可設 `HEADLESS=1`。

## 環境變數
| 變數 | 預設 | 說明 |
|---|---|---|
| `VISION_API_PORT` | `8000` | HTTP 服務埠 |
| `CAM_INDEX` | `0` | 攝影機編號（用 list_cameras.py 找）|
| `VISION_LOCATION` | `客廳` | 回報的位置標籤 |
| `HEADLESS` | （空）| 設 `1` 則不開 OpenCV 視窗 |

## 與 TakeCare 後端串接
在後端 `backend/.env` 設：
```
VISION_MODEL_ENDPOINT=http://localhost:8000/detect
```
偵測到跌倒（CONFIRMED）時，後端會判為 High 並自動建立家屬警報。
**若不跑本服務，後端會自動 fallback 使用內建模擬資料，App 仍可正常測試。**

## API
- `POST /detect` → `{action, confidence, location, description, modelName}`；CONFIRMED 時 `action="DANGER: FALL"`
- `GET /health` → `{state, prob, trigger, updated_at}`（App 每 2 秒輪詢）
- `GET /stream` → MJPEG 即時影像（App WebView 顯示）

## Windows 小提醒
- **Python 必須 3.10~3.12（64-bit）**。3.13 會出現 `No matching distribution found for tensorflow`。
- 第一次跑 TensorFlow 較慢屬正常。
- 攝影機被其他程式（Teams/Zoom）佔用時會開不起來，先關掉再跑。
- 若 `pip install` 顯示 `Defaulting to user installation`，代表 venv 沒啟動，請先 `.\.venv\Scripts\Activate.ps1`。
