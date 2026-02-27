import mediapipe as mp
import cv2
import math
import numpy as np

class VisionEngine:
    def __init__(self):
        self.mp_holistic = mp.solutions.holistic
        self.holistic = self.mp_holistic.Holistic(
            static_image_mode=False,
            model_complexity=2,
            min_detection_confidence=0.85,
            min_tracking_confidence=0.85
        )
        self.mp_drawing = mp.solutions.drawing_utils
        self.clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

    def process(self, frame):
        gamma = 1.2
        invGamma = 1.0 / gamma
        table = np.array([((i / 255.0) ** invGamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
        frame = cv2.LUT(frame, table)

        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l = self.clahe.apply(l)
        enhanced_lab = cv2.merge((l, a, b))
        enhanced_frame = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
        
        enhanced_frame = cv2.bilateralFilter(enhanced_frame, 9, 75, 75)
        
        image_rgb = cv2.cvtColor(enhanced_frame, cv2.COLOR_BGR2RGB)
        results = self.holistic.process(image_rgb)
        
        if results.pose_landmarks:
            lm = results.pose_landmarks.landmark
            critical_indices = [0, 11, 12, 23, 24, 27, 28]
            visibility_scores = [lm[i].visibility for i in critical_indices]
            if np.mean(visibility_scores) < 0.85:
                results.pose_landmarks = None
                
        return results, enhanced_frame

    @staticmethod
    def get_metrics(pose_landmarks):
        lm = pose_landmarks.landmark
        nose_y = lm[0].y
        sh_width = math.dist([lm[11].x, lm[11].y], [lm[12].x, lm[12].y])
        sh_y = (lm[11].y + lm[12].y) / 2
        hip_y = (lm[23].y + lm[24].y) / 2
        ankle_y = (lm[27].y + lm[28].y) / 2
        
        x_coords = [lm[i].x for i in range(len(lm))]
        y_coords = [lm[i].y for i in range(len(lm))]
        bbox_w = max(x_coords) - min(x_coords)
        bbox_h = max(y_coords) - min(y_coords)
        aspect_ratio = bbox_h / bbox_w if bbox_w > 0 else 1.0
        
        return {
            "sh_width": sh_width,
            "sh_y": sh_y,
            "hip_y": hip_y,
            "nose_y": nose_y,
            "ankle_y": ankle_y,
            "rel_height": ankle_y - hip_y,
            "aspect_ratio": aspect_ratio,
            "is_horizontal": aspect_ratio < 0.9
        }