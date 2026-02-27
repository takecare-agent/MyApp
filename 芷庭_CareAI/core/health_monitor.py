import time
import math

class HealthMonitor:
    def __init__(self):
        self.eating_count = 0
        self.last_eat_time = 0
        self.cooldown = 5

    def analyze_eating(self, hand_landmarks, pose_landmarks, metrics):
        if not hand_landmarks or not pose_landmarks:
            return None
            
        mouth_y = pose_landmarks.landmark[0].y
        hand_y = hand_landmarks.landmark[0].y
        
        dist = math.dist([hand_landmarks.landmark[0].x, hand_y], 
                         [pose_landmarks.landmark[0].x, mouth_y])
        
        if dist < metrics["sh_width"] * 0.4:
            curr_time = time.time()
            if curr_time - self.last_eat_time > self.cooldown:
                self.eating_count += 1
                self.last_eat_time = curr_time
                return "EVENT_EATING"
        return None