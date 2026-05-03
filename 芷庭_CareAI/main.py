import cv2
import numpy as np
import time
from core.vision_engine import VisionEngine
from core.action_analyzer import ActionAnalyzer
from core.health_monitor import HealthMonitor
from core.database_sync import DatabaseSync

def main():
    engine = VisionEngine()
    analyzer = ActionAnalyzer()
    monitor = HealthMonitor()
    db_sync = DatabaseSync()
    triggered_events = set()
    
    cap = None
    # 搜尋所有索引，鎖定 iVCam 的高解析度特性
    # 這裡我們從 1 開始搜尋，因為 0 通常是 Mac 內建鏡頭
    for i in range(1, 6):
        temp_cap = cv2.VideoCapture(i, cv2.CAP_AVFOUNDATION)
        if temp_cap.isOpened():
            # iVCam 預設解析度通常較高，我們以此作為判定標準
            temp_cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
            temp_cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
            ret, frame = temp_cap.read()
            if ret and frame.shape[1] >= 1280:
                # 這裡如果辨識到高解析度，代表成功抓到無線手機鏡頭
                cap = temp_cap
                print(f"✅ 成功鎖定無線 iPhone 鏡頭 (Index: {i})")
                break
            temp_cap.release()

    # 如果 index 1-5 都失敗，最後才考慮 index 0
    if cap is None:
        print("⚠️ 找不到無線設備，嘗試啟動預設攝影機")
        cap = cv2.VideoCapture(0)

    cv2.namedWindow('Care AI Professional', cv2.WINDOW_NORMAL)

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        
        results, enhanced_frame = engine.process(frame)
        display_frame = enhanced_frame.copy()
        current_actions = {}
        current_metrics = None
        
        if results.pose_landmarks:
            current_metrics = engine.get_metrics(results.pose_landmarks)
            # 只有當人體關鍵點可見度符合我們在 ActionAnalyzer 設定的 0.85 門檻時才處理
            pose_actions = analyzer.analyze_all_movements(results, current_metrics)
            current_actions.update(pose_actions) 
            
            engine.mp_drawing.draw_landmarks(
                display_frame, results.pose_landmarks, engine.mp_holistic.POSE_CONNECTIONS,
                engine.mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2),
                engine.mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2)
            )

            if results.right_hand_landmarks:
                engine.mp_drawing.draw_landmarks(display_frame, results.right_hand_landmarks, engine.mp_holistic.HAND_CONNECTIONS)
                sos_r = analyzer.check_sos(results.right_hand_landmarks, current_metrics)
                if sos_r: current_actions[f"R_{sos_r}"] = analyzer.severity_map.get(sos_r, "高")
                
            if results.left_hand_landmarks:
                engine.mp_drawing.draw_landmarks(display_frame, results.left_hand_landmarks, engine.mp_holistic.HAND_CONNECTIONS)
                sos_l = analyzer.check_sos(results.left_hand_landmarks, current_metrics)
                if sos_l: current_actions[f"L_{sos_l}"] = analyzer.severity_map.get(sos_l, "高")

        # UI 狀態區：顯示當前硬體與過濾強度
        cv2.rectangle(display_frame, (0, 0), (450, 180), (0, 0, 0), -1)
        cv2.putText(display_frame, f"Source: iVCam Wireless", (20, 50), 1, 1.2, (0, 255, 255), 1)
        cv2.putText(display_frame, f"Filter: 0.85 Visibility Enabled", (20, 100), 1, 1.2, (0, 255, 0), 1)
        cv2.putText(display_frame, f"State: {analyzer.sit_stand_state}", (20, 140), 1, 1.2, (200, 200, 200), 1)
        
        for i, (act, sev) in enumerate(current_actions.items()):
            color = (0, 0, 255) if sev == "高" else (255, 255, 255)
            y_pos = 240 + i*40
            cv2.putText(display_frame, f"[{sev}] {act}", (20, y_pos), 1, 1.5, color, 2)
            
            if sev == "高" and act not in triggered_events:
                db_sync.create_event_payload(act, sev, metrics=current_metrics)
                db_sync.save_snapshot(frame, act)
                triggered_events.add(act)

        if not current_actions:
            triggered_events.clear()

        cv2.imshow('Care AI Professional', display_frame)
        if cv2.waitKey(1) & 0xFF == ord('q'): break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()