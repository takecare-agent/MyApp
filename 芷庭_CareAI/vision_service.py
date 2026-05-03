import cv2
import mediapipe as mp
import requests
import math
import numpy as np
import time
from collections import deque

# 1. 核心模型初始化：使用最高複雜度模型以確保長距離下的點位穩定
mp_holistic = mp.solutions.holistic
holistic = mp_holistic.Holistic(
    static_image_mode=False,
    model_complexity=2, 
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)
mp_drawing = mp.solutions.drawing_utils
NODE_SERVER_URL = "http://127.0.0.1:5001/api/emergency"

# 2. 全球頂級照護邏輯緩衝區
HISTORY_LEN = 30
pose_y_history = deque(maxlen=HISTORY_LEN)     # 跌倒與起坐速度分析
finger_buffer = deque(maxlen=10)               # 手指數中位數濾波
wrist_x_history = deque(maxlen=20)             # SOS 揮手路徑追蹤
body_movement_buffer = deque(maxlen=50)        # 倒地後生命狀態監控
hip_y_history = deque(maxlen=20)               # 起坐過程位移追蹤
prev_nose_y = 0

# --- 起坐狀態機變數 ---
sit_stand_state = "SITTING" 
stand_start_time = 0

def count_fingers_precise(hand_landmarks):
    """採用工業級歐氏距離比值法，消除手指重疊時的誤差"""
    lm = hand_landmarks.landmark
    dist_thumb = math.dist([lm[4].x, lm[4].y], [lm[17].x, lm[17].y])
    dist_thumb_base = math.dist([lm[2].x, lm[2].y], [lm[17].x, lm[17].y])
    fingers = [1 if dist_thumb > dist_thumb_base * 1.3 else 0]
    
    tips, pips = [8, 12, 16, 20], [6, 10, 14, 18]
    for t, p in zip(tips, pips):
        d_tip = math.dist([lm[t].x, lm[t].y], [lm[0].x, lm[0].y])
        d_pip = math.dist([lm[p].x, lm[p].y], [lm[0].x, lm[0].y])
        fingers.append(1 if d_tip > d_pip else 0)
    return fingers.count(1)

cap = cv2.VideoCapture(0)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret: break
    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = holistic.process(image)
    image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)

    current_actions = set() 
    frame_fingers = 0

    if results.pose_landmarks:
        lm = results.pose_landmarks.landmark
        mp_drawing.draw_landmarks(image, results.pose_landmarks, mp_holistic.POSE_CONNECTIONS)
        
        # --- 生理標尺：肩膀寬度與身體高度基準 ---
        sh_width = math.dist([lm[11].x, lm[11].y], [lm[12].x, lm[12].y])
        sh_y = (lm[11].y + lm[12].y) / 2
        nose_y, hip_y = lm[0].y, (lm[23].y + lm[24].y) / 2
        ankle_y = (lm[27].y + lm[28].y) / 2
        current_rel_height = ankle_y - hip_y # 相對地面高度

        # 1. 精準點頭辨識 (正規化判定)
        if sh_width > 0:
            if abs(nose_y - prev_nose_y) / sh_width > 0.15:
                current_actions.add("NODDING")
        prev_nose_y = nose_y

        # 2. 起坐平衡與肌力測試 (Sit-to-Stand)
        if sit_stand_state == "SITTING" and current_rel_height > 0.35:
            sit_stand_state = "RISING"
            stand_start_time = time.time()
        elif sit_stand_state == "RISING" and current_rel_height > 0.45:
            rise_duration = time.time() - stand_start_time
            sit_stand_state = "STANDING"
            status = "NORMAL RISE" if rise_duration < 2.5 else "SLOW RISE (WEAK)"
            current_actions.add(f"{status}: {round(rise_duration, 1)}s")
        elif sit_stand_state == "STANDING" and current_rel_height < 0.35:
            sit_stand_state = "SITTING"

        # 3. 進階跌倒與倒地後監控
        pose_y_history.append(nose_y)
        is_falling = False
        if len(pose_y_history) == HISTORY_LEN:
            velocity = pose_y_history[-1] - pose_y_history[0]
            if nose_y > hip_y and velocity > 0.12: # 快速位移且重心崩潰
                is_falling = True
                current_actions.add("DANGER: FALL")
        
        if is_falling:
            mid_hip = [(lm[23].x + lm[24].x)/2, (lm[23].y + lm[24].y)/2]
            body_movement_buffer.append(mid_hip)
            if len(body_movement_buffer) == 50:
                mvt = math.dist(body_movement_buffer[0], body_movement_buffer[-1])
                if mvt < 0.01: # 幾乎完全靜止，極度危險
                    current_actions.add("CRITICAL: UNCONSCIOUS")
                    try: requests.post(NODE_SERVER_URL, json={"type":"SOS", "msg":"跌倒後無意識"})
                    except: pass

        # 4. 複合式求救辨識 (手勢 + 動作 + 比例)
        if results.right_hand_landmarks:
            r_fingers = count_fingers_precise(results.right_hand_landmarks)
            frame_fingers += r_fingers
            wrist_x, wrist_y = results.right_hand_landmarks.landmark[0].x, results.right_hand_landmarks.landmark[0].y
            wrist_x_history.append(wrist_x)
            
            if wrist_y < sh_y: # 必須高於肩膀
                if r_fingers == 5 and len(wrist_x_history) == 20:
                    swing = (max(wrist_x_history) - min(wrist_x_history)) / sh_width
                    if swing > 0.6: 
                        current_actions.add("CRITICAL SOS: WAVING")
                        try: requests.post(NODE_SERVER_URL, json={"type":"SOS", "msg":"手勢求救"})
                        except: pass
                    else: current_actions.add("RAISING HAND")
                else: current_actions.add("RAISING HAND")

    # 5. 手指數穩定器
    finger_buffer.append(frame_fingers)
    stable_fingers = round(np.median(finger_buffer)) if finger_buffer else 0

    # 介面繪製
    cv2.putText(image, f"Fingers: {stable_fingers}", (20, 50), 1, 2, (0, 255, 0), 2)
    for i, act in enumerate(current_actions):
        clr = (0, 0, 255) if any(x in act for x in ["DANGER", "CRITICAL", "SOS"]) else (255, 255, 255)
        cv2.putText(image, act, (20, 100 + i*40), 1, 2, clr, 2)

    cv2.imshow('Care AI Pro - Motion Matrix', image)
    if cv2.waitKey(1) & 0xFF == ord('q'): break

cap.release()
cv2.destroyAllWindows()