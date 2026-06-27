"""
Fall Detection v8 — HTTP API 包裝
===================================
把 v8 即時跌倒偵測（TFLite + MediaPipe + 時序狀態機）包成一個 HTTP 服務，
讓 TakeCare 後端的 VISION_MODEL_ENDPOINT 可以來「問」目前的偵測狀態。

啟動：
    source infer_env/bin/activate
    python vision_api_server.py

後端 backend/.env 設定：
    VISION_MODEL_ENDPOINT=http://localhost:8000/detect

設計：
    - 主執行緒：開攝影機 + MediaPipe 姿態 + TFLite 推論 + 狀態機（沿用 v8 邏輯）
      （macOS 的 OpenCV 視窗必須在主執行緒，所以相機迴圈放主執行緒）
    - 背景執行緒：HTTP server，回應後端的 POST /detect
    - 兩者共用一份「目前狀態」(latest_state)，用 lock 保護

回傳給後端的對應：
    state == CONFIRMED → action="DANGER: FALL"（後端判為 High，會自動通知家屬）
    其他狀態           → action="NORMAL"（Low，代表正在監測、目前正常）

環境變數（可選）：
    VISION_API_PORT   服務 port（預設 8000）
    VISION_LOCATION   回報的位置字串（預設「客廳」）
    HEADLESS=1        不開 OpenCV 視窗（純背景跑，適合部署）
    CAM_INDEX         攝影機編號（預設 0）
按 q 離開，CONFIRMED 狀態下按 r 手動重置。
"""
import json
import os
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np
import mediapipe.python.solutions.pose as mp_pose
import mediapipe.python.solutions.drawing_utils as mp_drawing
import tensorflow as tf

# ── 模型 / 偵測設定（與 realtime_predict_v8.py 一致）──────────────────────────
TFLITE_PATH      = "fall_detection_model_v8.tflite"
THRESHOLDS_JSON  = "thresholds_v8.json"
FRAME_LEN        = 30
LANDMARKS_NUM    = 33
DIM_PER_POINT    = 3
POINTS_PER_FRAME = LANDMARKS_NUM * DIM_PER_POINT
MAX_ZERO_FRAMES  = 10
CAM_INDEX        = int(os.environ.get("CAM_INDEX", "0"))
DISPLAY_MAX_W    = 1280
INFER_STEP       = 5

# ── 狀態機常數 ────────────────────────────────────────────────────────────────
SUSPECT_PROB_THR  = 0.55
SUSPECT_ENTRY_SEC = 0.5
CONFIRM_PROB_THR  = 0.50
CONFIRM_A_SEC     = 5.0
CONFIRM_B_SEC     = 1.5
CONFIRM_B_DROP    = 0.12
CONFIRM_C_SEC     = 6.0
CONFIRM_C_RANGE   = 0.05
DISMISS_HIP_RISE  = 0.10
OBSERVE_TIMEOUT   = 8.0
DISMISSED_HOLD    = 2.0

# ── HTTP / 回報設定 ──────────────────────────────────────────────────────────
API_PORT      = int(os.environ.get("VISION_API_PORT", "8000"))
REPORT_LOCATION = os.environ.get("VISION_LOCATION", "客廳")
HEADLESS      = os.environ.get("HEADLESS", "") == "1"
MODEL_NAME    = "Fall-Detection-v8"

# ── 共用狀態（主執行緒寫、HTTP 執行緒讀）─────────────────────────────────────
state_lock = threading.Lock()
latest_state = {
    "state": "IDLE",      # IDLE / SUSPECTED / CONFIRMED / DISMISSED
    "prob": 0.0,          # 最新跌倒機率
    "trigger": "",        # CONFIRMED 的觸發條件
    "updated_at": 0.0,    # 上次更新時間（unix）
}

# 即時影像串流共用影格（主執行緒寫入最新 JPEG，/stream 執行緒讀出）
frame_lock = threading.Lock()
latest_jpeg = {"data": None}
STREAM_W = 480            # 串流寬度（縮小以省頻寬，高度依比例）
STREAM_FPS = 15
STREAM_JPEG_QUALITY = 70


def set_latest(**kwargs):
    with state_lock:
        latest_state.update(kwargs)
        latest_state["updated_at"] = time.time()


def build_detect_response():
    """把目前狀態轉成後端 VISION_MODEL_ENDPOINT 期望的 JSON。"""
    with state_lock:
        s = dict(latest_state)
    prob = float(s["prob"])
    age = time.time() - s["updated_at"] if s["updated_at"] else 999
    # 相機若超過 5 秒沒更新，視為畫面異常，回 NORMAL 並標註
    stale = age > 5.0

    if s["state"] == "CONFIRMED" and not stale:
        return {
            "action": "DANGER: FALL",
            "confidence": max(prob, 0.9),
            "location": REPORT_LOCATION,
            "description": f"確認跌倒（觸發條件 {s['trigger']}），跌倒機率 {prob * 100:.0f}%",
            "modelName": MODEL_NAME,
        }

    note = "畫面更新逾時" if stale else f"監測中（{s['state']}）"
    return {
        "action": "NORMAL",
        "confidence": prob,
        "location": REPORT_LOCATION,
        "description": f"{note}，目前跌倒機率 {prob * 100:.0f}%",
        "modelName": MODEL_NAME,
    }


# ── HTTP server ───────────────────────────────────────────────────────────────
class VisionHandler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.rstrip("/") == "/detect":
            length = int(self.headers.get("Content-Length", 0) or 0)
            if length:
                self.rfile.read(length)  # 後端會帶 frameTag/location/description，這裡用不到
            self._send(200, build_detect_response())
        else:
            self._send(404, {"error": "not found"})

    def do_GET(self):
        path = self.path.rstrip("/")
        if path == "/health":
            with state_lock:
                self._send(200, dict(latest_state))
        elif path == "/stream":
            self.stream_mjpeg()
        else:
            self._send(404, {"error": "not found"})

    def stream_mjpeg(self):
        """以 multipart/x-mixed-replace 連續推送 JPEG，瀏覽器/WebView <img> 可直接播。"""
        self.send_response(200)
        self.send_header("Age", "0")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self.end_headers()
        try:
            while True:
                with frame_lock:
                    data = latest_jpeg["data"]
                if data is None:
                    time.sleep(0.05)
                    continue
                self.wfile.write(b"--frame\r\n")
                self.wfile.write(b"Content-Type: image/jpeg\r\n")
                self.wfile.write(f"Content-Length: {len(data)}\r\n\r\n".encode())
                self.wfile.write(data)
                self.wfile.write(b"\r\n")
                time.sleep(1.0 / STREAM_FPS)
        except (BrokenPipeError, ConnectionResetError):
            pass  # 客戶端關閉連線，正常結束

    def log_message(self, *args):
        pass  # 靜音，避免洗版


def start_http_server():
    server = ThreadingHTTPServer(("0.0.0.0", API_PORT), VisionHandler)
    print(f"  🌐 偵測結果 API : http://localhost:{API_PORT}/detect  (POST)")
    print(f"  📹 即時影像串流 : http://localhost:{API_PORT}/stream  (GET, 給 App 看)")
    server.serve_forever()


# ── 前處理（與訓練一致，沿用 v8）──────────────────────────────────────────────
def smooth_and_impute_zeros(arr):
    arr_s = np.copy(arr)
    prev = None
    for i in range(arr_s.shape[0]):
        if np.all(arr_s[i] == 0):
            if prev is not None:
                arr_s[i] = prev
        else:
            prev = arr_s[i]
    mask = ~np.all(arr_s == 0, axis=(1, 2))
    if mask.sum() >= 3:
        for j in range(arr_s.shape[1]):
            for k in range(arr_s.shape[2]):
                col = arr_s[:, j, k]
                vals = col.copy()
                for idx in range(1, len(col) - 1):
                    if mask[idx - 1] and mask[idx] and mask[idx + 1]:
                        vals[idx] = (col[idx - 1] + col[idx] + col[idx + 1]) / 3
                arr_s[:, j, k] = vals
    return arr_s


def get_hip_y(coords):
    left = coords[23]
    right = coords[24]
    if np.all(left == 0) and np.all(right == 0):
        return None
    if np.all(left == 0):
        return float(right[1])
    if np.all(right == 0):
        return float(left[1])
    return float((left[1] + right[1]) / 2)


# ── 模型載入 ──────────────────────────────────────────────────────────────────
print("=" * 58)
print("  Fall Detection v8  —  HTTP API 服務  —  啟動中")
print("=" * 58)
with open(THRESHOLDS_JSON) as f:
    _t = json.load(f)
FALL_THRESHOLD = _t["threshold_safe"]

interpreter = tf.lite.Interpreter(model_path=TFLITE_PATH)
interpreter.allocate_tensors()
in_det = interpreter.get_input_details()
out_det = interpreter.get_output_details()
print(f"  模型  : {TFLITE_PATH}")
print(f"  位置  : {REPORT_LOCATION}   Headless: {HEADLESS}")


def predict(window):
    x = window.reshape(1, FRAME_LEN, POINTS_PER_FRAME).astype(np.float32)
    interpreter.set_tensor(in_det[0]["index"], x)
    interpreter.invoke()
    return float(interpreter.get_tensor(out_det[0]["index"])[0][0])


# ── 先把 HTTP server 開起來（背景執行緒）──────────────────────────────────────
threading.Thread(target=start_http_server, daemon=True).start()

# ── MediaPipe ────────────────────────────────────────────────────────────────
pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=0,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7,
)

# ── 攝影機 ────────────────────────────────────────────────────────────────────
print(f"  攝影機 CAM_INDEX={CAM_INDEX} 開啟中...")
cap = cv2.VideoCapture(CAM_INDEX)
if not cap.isOpened():
    print("  ❌ 無法開啟攝影機！請改 CAM_INDEX 或先跑 list_cameras.py")
    raise SystemExit(1)
_frame = None
for _retry in range(30):
    ret, _frame = cap.read()
    if ret:
        break
    time.sleep(0.1)
if _frame is None:
    print("  ❌ 攝影機無法讀取畫面（重試 30 次失敗）")
    raise SystemExit(1)
_h, _w = _frame.shape[:2]
disp_scale = min(1.0, DISPLAY_MAX_W / _w) if _w > DISPLAY_MAX_W else 1.0
disp_w, disp_h = int(_w * disp_scale), int(_h * disp_scale)
print(f"  ✓ 攝影機: {_w}×{_h}")
print("=" * 58)
print("  ✅ 就緒！背景偵測中  |  q=離開  r=CONFIRMED 時重置")
print("=" * 58 + "\n")

WIN_NAME = "Fall Detection v8 API  |  q=離開  r=重置"
if not HEADLESS:
    cv2.namedWindow(WIN_NAME, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(WIN_NAME, max(disp_w, 640), max(disp_h, 480))

# ── 主迴圈狀態 ────────────────────────────────────────────────────────────────
buf = deque(maxlen=FRAME_LEN)
last_prob = 0.0
last_hip_y = 0.5
frame_count = 0

state = "IDLE"
state_enter_time = 0.0
entering_hip_y = 0.5
idle_high_start = None
susp_high_start = None
hip_y_history = deque()
trigger_label = ""

try:
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if disp_scale < 1.0:
            frame = cv2.resize(frame, (disp_w, disp_h))
        now = time.time()

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        res = pose.process(rgb)
        rgb.flags.writeable = True
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        h, w = bgr.shape[:2]

        detected = False
        coords = np.zeros((LANDMARKS_NUM, DIM_PER_POINT), dtype=np.float32)
        if res.pose_landmarks:
            detected = True
            mp_drawing.draw_landmarks(
                bgr, res.pose_landmarks, mp_pose.POSE_CONNECTIONS,
                mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=3),
                mp_drawing.DrawingSpec(color=(0, 200, 255), thickness=2),
            )
            coords = np.array(
                [[p.x, p.y, p.z] for p in res.pose_landmarks.landmark],
                dtype=np.float32,
            )
            hip_y = get_hip_y(coords)
            if hip_y is not None:
                last_hip_y = hip_y
                hip_y_history.append((now, hip_y))
                cutoff_h = now - (OBSERVE_TIMEOUT + 2)
                while hip_y_history and hip_y_history[0][0] < cutoff_h:
                    hip_y_history.popleft()

        buf.append(coords)
        frame_count += 1

        if len(buf) == FRAME_LEN and frame_count % INFER_STEP == 0:
            window = np.stack(buf, axis=0)
            zero_cnt = int(np.sum(np.all(window == 0, axis=(1, 2))))
            if zero_cnt <= MAX_ZERO_FRAMES:
                last_prob = predict(smooth_and_impute_zeros(window))
            else:
                last_prob = 0.0

        # ── 狀態機（沿用 v8）──────────────────────────────────────────────
        if state == "IDLE":
            if last_prob >= SUSPECT_PROB_THR:
                if idle_high_start is None:
                    idle_high_start = now
                elif now - idle_high_start >= SUSPECT_ENTRY_SEC:
                    state = "SUSPECTED"
                    state_enter_time = now
                    entering_hip_y = last_hip_y
                    idle_high_start = None
                    susp_high_start = None
            else:
                idle_high_start = None

        elif state == "SUSPECTED":
            elapsed = now - state_enter_time
            confirmed = False
            if last_prob >= CONFIRM_PROB_THR:
                if susp_high_start is None:
                    susp_high_start = now
                elif now - susp_high_start >= CONFIRM_A_SEC:
                    confirmed = True
                    trigger_label = "A (持續高機率 5s)"
            else:
                susp_high_start = None
            if not confirmed and elapsed <= CONFIRM_B_SEC:
                if last_hip_y - entering_hip_y > CONFIRM_B_DROP:
                    confirmed = True
                    trigger_label = "B (快速下落)"
            if not confirmed and elapsed >= CONFIRM_C_SEC:
                vals = [y for t, y in hip_y_history if t >= now - CONFIRM_C_SEC]
                if len(vals) >= 5 and (max(vals) - min(vals)) < CONFIRM_C_RANGE:
                    confirmed = True
                    trigger_label = "C (靜止 6s)"
            if confirmed:
                state = "CONFIRMED"
                state_enter_time = now
                print(f"[{now:.1f}s] CONFIRMED  觸發={trigger_label}  prob={last_prob:.3f}")
            elif entering_hip_y - last_hip_y > DISMISS_HIP_RISE:
                state = "DISMISSED"
                state_enter_time = now
            elif elapsed > OBSERVE_TIMEOUT:
                state = "DISMISSED"
                state_enter_time = now

        elif state == "CONFIRMED":
            # 警報後持續觀察：站起來 → 解除警報 → 回到正常監測（不需手動按 r）
            if entering_hip_y is not None and last_hip_y is not None:
                if entering_hip_y - last_hip_y > DISMISS_HIP_RISE:
                    state = "DISMISSED"
                    state_enter_time = now
                    trigger_label = ""
                    print(f"[{now:.1f}s] CONFIRMED → DISMISSED  (已站起，hip 上升 {entering_hip_y - last_hip_y:.3f})")

        elif state == "DISMISSED":
            if now - state_enter_time >= DISMISSED_HOLD:
                state = "IDLE"
                idle_high_start = None
                trigger_label = ""

        # 把最新狀態同步給 HTTP 執行緒
        set_latest(state=state, prob=float(last_prob), trigger=trigger_label)

        # ── 疊加狀態資訊（視窗與串流共用）────────────────────────────────
        col = {
            "IDLE": (50, 200, 50), "SUSPECTED": (30, 160, 255),
            "CONFIRMED": (40, 40, 255), "DISMISSED": (140, 140, 140),
        }[state]
        cv2.putText(bgr, f"{state}", (12, 36), cv2.FONT_HERSHEY_SIMPLEX, 1.0, col, 2)
        cv2.putText(bgr, f"Fall prob: {last_prob * 100:.1f}%", (12, 72),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, col, 2)
        cv2.putText(bgr, f"Pose: {'OK' if detected else '--'}  Buf: {len(buf)}/{FRAME_LEN}",
                    (12, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        if state == "CONFIRMED":
            cv2.rectangle(bgr, (0, 0), (w - 1, h - 1), (40, 40, 255), 10)
            cv2.putText(bgr, "FALL CONFIRMED!", (w // 2 - 180, h // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.2, (40, 40, 255), 3)

        # 更新串流影格（縮小 + JPEG 編碼），讓 App 能看到即時畫面
        stream_h = int(h * STREAM_W / w) if w else 360
        ok_jpg, jpg = cv2.imencode(
            ".jpg", cv2.resize(bgr, (STREAM_W, stream_h)),
            [int(cv2.IMWRITE_JPEG_QUALITY), STREAM_JPEG_QUALITY],
        )
        if ok_jpg:
            with frame_lock:
                latest_jpeg["data"] = jpg.tobytes()

        # ── 視窗（非 headless 才開）──────────────────────────────────────
        if not HEADLESS:
            cv2.imshow(WIN_NAME, bgr)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            elif key == ord("r") and state == "CONFIRMED":
                state = "IDLE"
                idle_high_start = None
                trigger_label = ""
                print("[手動重置] → IDLE")
        else:
            time.sleep(0.001)
finally:
    cap.release()
    if not HEADLESS:
        cv2.destroyAllWindows()
    pose.close()
    print("[INFO] 已結束。")
