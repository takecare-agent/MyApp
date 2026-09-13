# 明天實機 Demo 流程（Mac 跑服務 + 組員 Android 手機）

> **2026-09-12**：現行說明改看 `Fall_Detection_Lab/docs/CURRENT_現行這包_2026-09-12.md`。帳號有密碼 `Test1234!`。鏡頭用 `./start-cam.sh`（cam 0）。  
> 適用情境：組員 Windows 本機影像跑不起來，改由**你的 Mac** 跑後端與影像，手機透過 Wi‑Fi 連你的 Mac 測試。

---

## 一、為什麼組員 Windows 沒影像畫面？

常見原因（不是你的 App 壞掉）：

1. **他們電腦沒成功跑 `vision-runtime`（8000）**（Python/TensorFlow 安裝問題）
2. **實機填了 `10.0.2.2`** — 這只有 Android **模擬器**能用，實機不行
3. 手機與電腦**不在同一 Wi‑Fi**
4. Windows **防火牆擋了 8000**

明天方案：**影像與後端都在你的 Mac 跑**，手機只連你的 Mac IP。

---

## 二、今晚準備（在你 Mac 上做一次）

### 1) 建置可離線安裝的 APK

```bash
bash ~/Desktop/MyApp-main/scripts/build-demo-apk.sh
```

產出：
`~/Desktop/TakeCare-demo/TakeCare-vision-integration.apk`

> 這是 **Release APK**（JS 已打包），裝到手機後**不需要 Metro**，拔線也能開 App。

### 2) 確認檔案存在

```bash
ls -lh ~/Desktop/TakeCare-demo/TakeCare-vision-integration.apk
```

可把整個 `TakeCare-demo` 資料夾 AirDrop / USB 給組員備份，但明天主要用 USB `adb install` 即可。

---

## 三、明天現場流程（建議順序）

### 步驟 0：所有人連同一個 Wi‑Fi

- 你的 Mac 與組員 Android 手機必須在**同一個區網**（例如教室 Wi‑Fi）。
- 查 Mac IP：

```bash
bash ~/Desktop/MyApp-main/scripts/tomorrow-preflight.sh
```

記下輸出的 IP，例如 `192.168.1.25`。  
手機 App 要填：**`http://192.168.1.25:5000`**

---

### 步驟 1：Mac 開兩個服務（只需 2 個 Terminal，不用 Metro）

**Terminal A — 後端**
```bash
cd ~/Desktop/MyApp-main/backend
source ~/.nvm/nvm.sh && nvm use 20.20.2
npm run dev
```

**Terminal B — 影像（用你的 Mac 鏡頭）**
```bash
cd ~/Desktop/MyApp-main/vision-runtime
source .venv/bin/activate
# 若 .venv 還沒裝好，改用：
# source ~/Desktop/Fall_Detection_Lab/infer_env/bin/activate
python vision_api_server.py
```

確認：
- 瀏覽器開 `http://localhost:8000/health` 有 JSON
- `backend/.env` 有 `VISION_MODEL_ENDPOINT=http://localhost:8000/detect`

---

### 步驟 2：手機 USB 接上 Mac，安裝 APK

手機先開啟：
- 開發者選項 → **USB 偵錯**

```bash
~/Library/Android/sdk/platform-tools/adb devices
```

看到 `device` 後：

```bash
~/Library/Android/sdk/platform-tools/adb install -r ~/Desktop/TakeCare-demo/TakeCare-vision-integration.apk
```

多台手機就每台接一次重複 `adb install`（或同時接 hub，逐台 install）。

裝完可以**拔 USB**（若走 Wi‑Fi 測試）。

---

### 步驟 3：手機登入 App

1. 打開 **TakeCare**
2. **API Base URL**：`http://<你的MacIP>:5000`（不是 10.0.2.2！）
3. Email / 角色：
   - 受顧者：`patient@test.com`（長輩留空）
   - 看護：`caregiver@test.com`（長輩 `patient@test.com`）
   - 家屬：`family@test.com`（長輩 `patient@test.com`）

---

### 步驟 4：測影像辨識

1. 受顧者手機 →「影像偵測」
2. 應看到：
   - 上方**即時畫面**（來自你 Mac 鏡頭的 `/stream`）
   - 狀態橫幅（正常監測中 / 觀察中 / 跌倒）
3. 若空白：
   - 確認 Mac 上 `vision_api_server.py` 還在跑
   - 手機瀏覽器試開 `http://<MacIP>:8000/health`（應看到 JSON）

---

## 四、IP / 連線問題對照

| 情境 | API Base URL | 影像自動變成 |
|---|---|---|
| Android 模擬器（Mac 上） | `http://10.0.2.2:5000` | `http://10.0.2.2:8000` |
| **實機（明天這個）** | `http://<Mac區網IP>:5000` | `http://<Mac區網IP>:8000` |

注意：
- App 內建預設可能是 `192.168.1.100`，**若跟你 Mac IP 不同，登入時一定要手動改**。
- 手機與 Mac **必須同一 Wi‑Fi**。
- macOS 若跳防火牆，請允許 **Node** 與 **Python** 接受區網連線。

---

## 五、若 Wi‑Fi 不穩（備援：USB 不拔）

手機維持 USB 連 Mac，執行：

```bash
adb reverse tcp:5000 tcp:5000
adb reverse tcp:8000 tcp:8000
```

App 可改填：`http://127.0.0.1:5000`（透過 USB 轉發到你 Mac）。

---

## 六、明天最小驗收清單

- [ ] 手機能登入三角色之一
- [ ] SOS 能送出，另一角色能看到
- [ ] 影像頁有畫面（Mac 鏡頭）
- [ ] 跌倒時狀態變紅 / 異常事件有記錄

---

## 七、帶什麼去現場

- Mac 電源 + 外接鏡頭（若內建鏡頭角度不好）
- USB 線（Type‑C 為主，可帶 hub）
- 已建好的 APK：`~/Desktop/TakeCare-demo/TakeCare-vision-integration.apk`
- 本文件 + `APP_RELEASE_GUIDE.md`

---

最後更新：vision-integration 分支
