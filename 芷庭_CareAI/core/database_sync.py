import pymongo
import uuid
import time
import threading
import cv2

class DatabaseSync:
    def __init__(self):
        try:
            self.client = pymongo.MongoClient("mongodb://localhost:27017/", serverSelectionTimeoutMS=2000)
            self.db = self.client["care_system"]
            self.events_col = self.db["events"]
            self.tasks_col = self.db["task_logs"]
        except:
            self.client = None
        self.case_id = 1
        self.device_id = 1

    def execute_db_async(self, collection, data):
        def _async_insert():
            try:
                if self.client:
                    collection.insert_one(data)
            except:
                pass
        threading.Thread(target=_async_insert, daemon=True).start()

    def create_event_payload(self, event_type, severity, confidence=0.95, metrics=None):
        payload = {
            "id": str(uuid.uuid4()),
            "case_id": self.case_id,
            "device_id": self.device_id,
            "event_type": event_type,
            "severity": severity,
            "technical_metrics": {
                "aspect_ratio": round(metrics.get("aspect_ratio", 0), 2) if metrics else "N/A",
                "rel_height": round(metrics.get("rel_height", 0), 3) if metrics else "N/A",
                "sh_width": round(metrics.get("sh_width", 0), 3) if metrics else "N/A"
            },
            "confidence_score": f"{confidence*100:.1f}%",
            "occurred_at": time.strftime('%Y-%m-%d %H:%M:%S'),
            "status": "未處理",
            "log_reference": "Care-AI Professional Analysis Engine",
            "detailed_description": f"AI自動偵測: {event_type} (已啟動昏暗環境增益處理)"
        }
        self.execute_db_async(self.events_col, payload)
        return payload

    def create_task_log_payload(self, task_id, result_value):
        payload = {
            "id": str(uuid.uuid4()),
            "task_id": task_id,
            "recorded_at": time.strftime('%Y-%m-%d %H:%M:%S'),
            "result_value": str(result_value),
            "engine_mode": "Low-Light Enhanced Detection",
            "data_precision": "Landmark Vector Analysis"
        }
        self.execute_db_async(self.tasks_col, payload)

    def save_snapshot(self, frame, event_type):
        filename = f"event_{int(time.time())}_{event_type}.jpg"
        cv2.imwrite(f"snapshots/{filename}", frame)
        return filename