#!/bin/zsh
# 只列名稱，不自動選鏡（編號會對調）。
echo "系統看到的鏡頭："
system_profiler SPCameraDataType 2>/dev/null | grep -E '^[ ]{4}[^ ]|Model ID'
echo
echo "現況對照（轉接頭插著時）："
echo "  0 = HD WEB CAMERA＝房間（start-cam.sh 用這顆）"
echo "  1 = MacBook Pro相機＝筆電內建"
echo "  2 = 塔塔相機＝iPhone，不要用"
echo
echo "自己開房間鏡頭："
echo "  cd ~/Desktop/MyApp-main/vision-runtime && ./start-cam.sh"
