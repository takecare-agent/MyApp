"""
list_cameras.py — 列出所有可用攝影機
啟動: source infer_env/bin/activate && python list_cameras.py
"""
import cv2

MAX_IDX = 6

print("=" * 52)
print("  攝影機偵測工具")
print("=" * 52)

found = []
for idx in range(MAX_IDX):
    cap = cv2.VideoCapture(idx)
    if not cap.isOpened():
        cap.release()
        continue
    ret, frame = cap.read()
    if not ret or frame is None:
        cap.release()
        continue
    w   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    jpg = f"cam_test_{idx}.jpg"
    cv2.imwrite(jpg, frame)
    print(f"  Index {idx}: {w}×{h}  FPS={fps:.1f}  → 已存圖: {jpg}")
    found.append(idx)
    cap.release()

print("=" * 52)
if found:
    print(f"  找到 {len(found)} 顆攝影機，Index: {found}")
    print()
    for idx in found:
        print(f"  → 打開 cam_test_{idx}.jpg 確認是哪顆鏡頭")
    print()
    print("  確認後，編輯 realtime_predict_v7.py 頂端：")
    print("    CAM_INDEX = 0  →  改成 USB 外接鏡頭的 index")
else:
    print("  ❌ 未找到任何攝影機，請確認連線後重跑")
print("=" * 52)
