import math
import numpy as np
from collections import deque
import time

class ActionAnalyzer:
    def __init__(self):
        self.finger_buffer = deque(maxlen=10)
        self.wrist_x_history = deque(maxlen=20) 
        self.hip_y_history = deque(maxlen=15)
        self.ratio_history = deque(maxlen=15)
        
        self.sit_stand_state = "SITTING"
        self.stand_start_time = 0
        self.prev_nose_y = 0
        
        self.swing_count = 0
        self.last_swing_dir = 0 
        
        self.alert_lock_time = 0
        self.active_alerts = {}
        
        self.severity_map = {
            "DANGER: FALL": "高",
            "CRITICAL SOS: WAVING": "高",
            "SEDENTARY": "低",
            "OFF_BED": "中"
        }

    def count_fingers(self, hand_landmarks):
        if not hand_landmarks: return 0
        lm = hand_landmarks.landmark
        dist_thumb_to_pinky = math.dist([lm[4].x, lm[4].y], [lm[17].x, lm[17].y])
        dist_base_to_pinky = math.dist([lm[2].x, lm[2].y], [lm[17].x, lm[17].y])
        fingers = [1 if dist_thumb_to_pinky > dist_base_to_pinky * 1.2 else 0]
        for t_idx, p_idx in [(8, 6), (12, 10), (16, 14)]:
            d_tip = math.dist([lm[t_idx].x, lm[t_idx].y], [lm[0].x, lm[0].y])
            d_pip = math.dist([lm[p_idx].x, lm[p_idx].y], [lm[0].x, lm[0].y])
            fingers.append(1 if d_tip > d_pip else 0)
        d_pinky_tip = math.dist([lm[20].x, lm[20].y], [lm[0].x, lm[0].y])
        d_pinky_pip = math.dist([lm[18].x, lm[18].y], [lm[0].x, lm[0].y])
        fingers.append(1 if d_pinky_tip > (d_pinky_pip * 0.9) else 0)
        self.finger_buffer.append(fingers.count(1))
        return int(np.median(self.finger_buffer))
    
    def analyze_all_movements(self, results, metrics):
        current_frame_actions = {}
        
        if not results.pose_landmarks:
            self.ratio_history.clear()
            self.hip_y_history.clear()
            return {}

        landmarks = results.pose_landmarks.landmark
        
        check_points = [0, 11, 12, 23, 24, 27, 28]
        for idx in check_points:
            if landmarks[idx].visibility < 0.85:
                return {}

        sh_w = metrics.get("sh_width", 0.15)
        hip_y = metrics.get("hip_y", 0.5)
        nose_y = landmarks[0].y
        
        body_len = abs(landmarks[28].y - landmarks[0].y)
        if body_len < 0.25 or sh_w < 0.05:
            return {}

        aspect_ratio = metrics.get("aspect_ratio", 2.0)
        self.ratio_history.append(aspect_ratio)
        self.hip_y_history.append(hip_y)

        is_collapsing = False
        if len(self.ratio_history) >= 10:
            avg_ratio = sum(list(self.ratio_history)[:5]) / 5
            if (avg_ratio - aspect_ratio) > 0.4 and aspect_ratio < 1.1:
                is_collapsing = True

        fall_v = 0
        if len(self.hip_y_history) >= 8:
            fall_v = self.hip_y_history[-1] - self.hip_y_history[-8]

        is_horizontal = metrics.get("is_horizontal", False) or abs(nose_y - hip_y) < (sh_w * 0.6)

        if (fall_v > (sh_w * 0.7) and is_collapsing) or (nose_y > hip_y and hip_y > 0.68) or (is_horizontal and hip_y > 0.75):
            current_frame_actions["DANGER: FALL"] = self.severity_map["DANGER: FALL"]

        if self.sit_stand_state == "SITTING" and metrics["rel_height"] > 0.38:
            self.sit_stand_state = "RISING"
            self.stand_start_time = time.time()
        elif self.sit_stand_state == "RISING" and metrics["rel_height"] > 0.48:
            duration = time.time() - self.stand_start_time
            self.sit_stand_state = "STANDING"
            current_frame_actions[f"RISE DONE: {round(duration, 1)}s"] = "正常"
        elif self.sit_stand_state == "STANDING" and metrics["rel_height"] < 0.32:
            self.sit_stand_state = "SITTING"
            
        if current_frame_actions:
            self.active_alerts = current_frame_actions
            self.alert_lock_time = time.time()
        
        if time.time() - self.alert_lock_time < 2.5:
            return self.active_alerts
            
        return {}

    def check_sos(self, hand_lm, metrics):
        if not hand_lm or not metrics: return None
        curr_x = hand_lm.landmark[0].x
        curr_y = hand_lm.landmark[0].y
        self.wrist_x_history.append(curr_x)
        if curr_y > metrics["sh_y"] or self.count_fingers(hand_lm) < 4:
            self.swing_count = 0
            self.last_swing_dir = 0
            return None
        if len(self.wrist_x_history) >= 5:
            move = self.wrist_x_history[-1] - self.wrist_x_history[-3]
            threshold = metrics["sh_width"] * 0.2
            curr_dir = 1 if move > threshold else (-1 if move < -threshold else 0)
            if curr_dir != 0 and curr_dir != self.last_swing_dir:
                self.swing_count += 1
                self.last_swing_dir = curr_dir
            if self.swing_count >= 4:
                return "CRITICAL SOS: WAVING"
        return None