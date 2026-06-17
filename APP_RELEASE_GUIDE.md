# React Native CLI 手機測試指南

> **組員請優先看：`TEAM_SETUP_GUIDE.md`（0→1 完整步驟，含 Windows / macOS 分開寫）**
>
> 分支：`vision-integration`（不要抓 `main`）

本 repo 已包含：
- `backend/`（API 5000）
- `mobile-expo/`（App + Metro 8081）
- `vision-runtime/`（影像辨識 8000，含 v8 模型）

---

## 快速入口

| 文件 | 用途 |
|---|---|
| **`TEAM_SETUP_GUIDE.md`** | 組員從零安裝、登入、鏡頭、錯誤排解（主文件） |
| `vision-runtime/README.md` | 影像服務細節 |
| `APP_RELEASE_GUIDE.md` | 本文件（補充說明） |

---

## 專案結構

| 路徑 | 用途 |
|---|---|
| `backend/` | Node.js API（5000） |
| `mobile-expo/` | React Native App |
| `vision-runtime/` | 跌倒偵測影像服務（8000） |
| `frontend/` | Web 前端（可選） |

---

## Android Health Connect 血壓同步（實機）

1. 手機需 Android + Health Connect。
2. 先讓血壓計 App 同步資料到 Health Connect。
3. App 登入 `patient` 或 `caregiver`，進血壓照護按「從 Health Connect 同步」。
4. `family` 角色只能監看，不能直接同步。

## 測試登入 API

`POST /mobile/dev-login` — 後端建立/更新測試使用者並回傳 JWT（**無密碼，只用 Email**）。
