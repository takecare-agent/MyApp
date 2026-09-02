#!/bin/zsh
echo "USB 安卓 Reload 用。請用傳輸檔案線接上手機後執行。"
adb devices -l
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5000 tcp:5000
adb reverse tcp:8000 tcp:8000
echo "已 reverse 8081/5000/8000。搖手機 → Reload。"
echo "若仍舊畫面：這個包是 Release，必須重編 Debug："
echo "  cd ~/Desktop/MyApp-main/mobile-expo && npm run android"
