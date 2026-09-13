# 現行鎖定（2026-09-13 16:03）— 用戶確認 iPhone 終於對了

Git tag：`checkpoint-2026-09-13-iphone-ok`  
離線安卓：`~/Desktop/TakeCare-demo/TakeCare-vision-integration.apk`  
桌面備份：`~/Desktop/_Backup_TakeCare_2026-09-13_iPhone對了/`

## 禁止

- 還原 `_Backup_TakeCare_2026-09-12收工`（04:21 git bundle，比晚上 APK 舊）
- 把 Library 的 `InitializeCore` 寫進 `metro.config.js` 的 `getModulesRunBeforeMainModule`
- Metro 掛掉時叫用戶滑掉 App
- 預設 `npx react-native start --reset-cache`

## Metro

```
mkdir -p /tmp/nowatch; printf '%s\n' '#!/bin/sh' 'exit 1' > /tmp/nowatch/watchman; chmod +x /tmp/nowatch/watchman
cd ~/Desktop/MyApp-main/mobile-expo && ulimit -n 65536 && PATH="/tmp/nowatch:$PATH" node scripts/run-metro.js
```

`curl -sS -m 2 http://127.0.0.1:8081/status` 必須是 `packager-status:running`。  
正確 JS 包尾：`__r(polyfillWindow)` → `__r(InitializeCore)` → `__r(index)`。
