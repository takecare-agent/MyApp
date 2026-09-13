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

Wave D1（主動推播，App 沒開也會建立警報）：
    一旦 SUSPECTED → CONFIRMED，背景執行緒會直接 POST 後端 VISION_BACKEND_URL/vision/report
    （shared token 驗證，不是使用者 JWT），不必等 App 輪詢 /health 才建立 AbnormalEvent。
    每次 CONFIRMED 事件會產生一組 eventKey，backend 用它防重複寫入；即使 App 同時也在輪詢
    /health 並嘗試自己補寫，backend 也會用同一組 eventKey 去重，只會留下一筆紀錄。

Wave D3（自動 DISMISS 改「建議解除」）：
    站起偵測需連續 STANDUP_SUSTAIN_SEC 秒才算數（避免單幀 pose 雜訊誤判站起），
    符合後只會進入 SUGGEST_DISMISS（建議解除，本地監測降級但不通知後端關閉），
    真正解除警報要由看護／家屬在 App「異常事件」頁按下「解除」（Wave C 的 resolve API）。

Wave G1（高＝確認跌倒後持續未起 ≥5 秒才報）：
    backend 收到 CONFIRMED 的 /vision/report 後，不會馬上建立高風險 Alert，而是先排一個 5 秒計時器
    （只記 Event，不推播）。這裡（CONFIRMED → SUGGEST_DISMISS，代表偵測到持續站起）會再呼叫
    POST /vision/report/standup（同一組 eventKey），backend 收到就取消該計時器：
      - 5 秒內站起 → 計時器被取消 → 不建立 Alert、不推播（只有 Event）
      - 5 秒內沒收到站起訊號 → 計時器到期 → backend 自動建立 High Alert + 推播
    這支呼叫失敗只印警告，不影響本地狀態機（backend 那邊沒收到站起訊號，5 秒到還是會照樣建立 Alert，
    寧可多報不要漏報）。

Wave M2（事件證據短片）：
    記憶體 ring buffer 保留無骨架幀；CONFIRMED 時開始 post-roll，組成短片 POST /vision/evidence。
    連續回拉＝本機循環 24 小時 JPEG（2 fps 落地；RAM 只留最近 30 分高幀）。不上雲端 NVR。

環境變數（可選）：
    VISION_API_PORT      服務 port（預設 8000，優先權低於 --port）
    VISION_LOCATION      回報的位置字串（預設「客廳」）
    HEADLESS=1           不開 OpenCV 視窗（純背景跑，適合部署）
    VISION_CAM_INDEX     攝影機編號（預設 0，優先權低於 --cam）
    VISION_BACKEND_URL   後端網址，例如 http://localhost:5000（設了才會主動推播）
    VISION_SHARED_TOKEN  與 backend/.env 的 VISION_SHARED_TOKEN 一致
    VISION_PATIENT_EMAIL 這台攝影機監控的長輩 email（用來讓後端找到對應長輩帳號）
CLI 參數（可選，優先權最高）：
    --cam             攝影機編號
    --port            服務 port（預設 8000）
按 q 離開，CONFIRMED／SUGGEST_DISMISS 狀態下按 r 手動重置。
"""
import argparse
import base64
import json
import os
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import numpy as np
import requests
# macOS：先 mediapipe 再 cv2，避免 import 卡死。推論只用 TFLite，不載整包 tensorflow。
print("  載入 MediaPipe／OpenCV（第一次約 1～2 分鐘，請等）", flush=True)
import mediapipe.python.solutions.pose as mp_pose
import mediapipe.python.solutions.drawing_utils as mp_drawing
import cv2
from tensorflow.lite.python.interpreter import Interpreter

from evidence_ring import EvidenceRingBuffer, POST_ROLL_SEC, finalize_and_upload_clip, upload_evidence
from playback_store import PlaybackArchive

# ── CLI 參數：--cam（優先）> VISION_CAM_INDEX 環境變數 > 預設 0；--port（預設 8000）──
_arg_parser = argparse.ArgumentParser()
_arg_parser.add_argument("--cam", type=int, default=None)
_arg_parser.add_argument("--port", type=int, default=None)
_args = _arg_parser.parse_args()

# ── 模型 / 偵測設定（與 realtime_predict_v8.py 一致）──────────────────────────
TFLITE_PATH      = "fall_detection_model_v8.tflite"
THRESHOLDS_JSON  = "thresholds_v8.json"
FRAME_LEN        = 30
LANDMARKS_NUM    = 33
DIM_PER_POINT    = 3
POINTS_PER_FRAME = LANDMARKS_NUM * DIM_PER_POINT
MAX_ZERO_FRAMES  = 10
CAM_INDEX        = _args.cam if _args.cam is not None else int(os.environ.get("VISION_CAM_INDEX", "0"))
CAM_NAME         = f"cam {CAM_INDEX}"
DISPLAY_MAX_W    = 1280
INFER_STEP       = 5

# ── 狀態機常數 ────────────────────────────────────────────────────────────────
SUSPECT_PROB_THR  = 0.55
SUSPECT_ENTRY_SEC = 0.5
CONFIRM_PROB_THR  = 0.50
CONFIRM_A_SEC     = 1.5    # 躺姿持續才算摔倒（不再用「高機率 5 秒」，那會把蹲下當跌倒）
CONFIRM_B_SEC     = 1.5
CONFIRM_B_DROP    = 0.12
CONFIRM_C_SEC     = 6.0
CONFIRM_C_RANGE   = 0.05
DISMISS_HIP_RISE  = 0.10
OBSERVE_TIMEOUT   = 8.0
DISMISSED_HOLD    = 2.0
STANDUP_SUSTAIN_SEC   = 1.0   # 站起偵測需連續這麼久才算數，避免單幀 pose 雜訊誤判（D3 修誤關）
SUGGEST_DISMISS_HOLD  = 3.0   # 建議解除狀態停留這麼久才回 IDLE 重新武裝偵測
SQUAT_HOLD_SEC = 1.2
SQUAT_COOLDOWN_SEC = 12.0
SQUAT_AFTER_ALERT_SEC = 4.0   # 剛離開疑似／確認摔倒後，這幾秒不記蹲下
GREEN_LEAD_SEC = 5.0      # 短片從變紅前的綠色 IDLE 往前保留秒數

# ── HTTP / 回報設定 ──────────────────────────────────────────────────────────
API_PORT      = _args.port if _args.port is not None else int(os.environ.get("VISION_API_PORT", "8000"))
REPORT_LOCATION = os.environ.get("VISION_LOCATION", "客廳")
HEADLESS      = os.environ.get("HEADLESS", "") == "1"
MODEL_NAME    = "Fall-Detection-v8"

# Wave D1：CONFIRMED 時主動推播後端，App 沒開也會建立警報（三者皆設才會推播）
VISION_BACKEND_URL   = os.environ.get("VISION_BACKEND_URL", "").rstrip("/")
VISION_SHARED_TOKEN  = os.environ.get("VISION_SHARED_TOKEN", "")
VISION_PATIENT_EMAIL = os.environ.get("VISION_PATIENT_EMAIL", "")

# ── 共用狀態（主執行緒寫、HTTP 執行緒讀）─────────────────────────────────────
state_lock = threading.Lock()
latest_state = {
    "state": "IDLE",      # IDLE / SUSPECTED / CONFIRMED / SUGGEST_DISMISS / DISMISSED
    "prob": 0.0,          # 最新跌倒機率
    "trigger": "",        # CONFIRMED 的觸發條件
    "posture": "unknown", # stand / squat / bend / lie / unknown
    "camIndex": CAM_INDEX,
    "camName": CAM_NAME,
    "updated_at": 0.0,    # 上次更新時間（unix）
    "eventKey": "",       # 本次 CONFIRMED 事件的唯一 key（App 用來跟自己的補寫紀錄去重）
    "reported": False,    # 是否已成功主動推播給後端
    "playbackStart": 0.0,
    "playbackEnd": 0.0,
    "playbackSpans": [],
}
reset_flag = {"on": False}

# 即時影像串流共用影格（主執行緒寫入最新 JPEG，/stream 執行緒讀出）
frame_lock = threading.Lock()
latest_jpeg = {"data": None}
STREAM_W = 640            # 使用者串流：無骨架，可略提高解析度
STREAM_FPS = 15
STREAM_JPEG_QUALITY = 82
PLAYBACK_KEEP_SEC = float(os.environ.get("VISION_PLAYBACK_SEC", "72000"))  # 本機可回拉秒數（預設累積 20 小時）
PLAYBACK_RAM_SEC = float(os.environ.get("VISION_PLAYBACK_RAM_SEC", "1800"))  # RAM 高幀窗
PLAYBACK_FPS = 10.0
PLAYBACK_DISK_FPS = float(os.environ.get("VISION_PLAYBACK_DISK_FPS", "2"))
PLAYBACK_MAX_FRAMES = int(PLAYBACK_RAM_SEC * PLAYBACK_FPS)
playback_lock = threading.Lock()
playback_ring = deque()
_playback_last = 0.0
_playback_meta_at = 0.0
playback_archive = PlaybackArchive(PLAYBACK_KEEP_SEC, PLAYBACK_DISK_FPS)


def _publish_playback_meta(force=False):
    global _playback_meta_at
    now = time.time()
    if not force and now - _playback_meta_at < 1.0:
        return
    _playback_meta_at = now
    spans = playback_archive.spans()
    with playback_lock:
        ram_start = playback_ring[0][0] if playback_ring else 0.0
        ram_end = playback_ring[-1][0] if playback_ring else 0.0
    if ram_end > 0:
        if spans:
            if ram_start - spans[-1][1] <= 2.0 or ram_end - spans[-1][1] <= 2.0:
                spans[-1][1] = max(spans[-1][1], ram_end)
            else:
                spans.append([ram_start or ram_end, ram_end])
        elif ram_start:
            spans = [[ram_start, ram_end]]
    disk_start, disk_end, _n = playback_archive.coverage()
    start = disk_start or ram_start
    end = max(disk_end, ram_end)
    set_latest(playbackStart=start, playbackEnd=end, playbackSpans=spans)


def restore_playback_ring():
    """先建索引並開服務；近 30 分 JPEG 改背景載，避免擋住鏡頭。"""
    playback_archive.load_index()
    _publish_playback_meta(force=True)
    threading.Thread(target=_load_playback_ram, daemon=True).start()


def _load_playback_ram():
    global _playback_last
    frames = playback_archive.load_recent_jpegs(PLAYBACK_RAM_SEC)
    if frames:
        with playback_lock:
            playback_ring.clear()
            playback_ring.extend(frames)
            _playback_last = frames[-1][0]
        print(f"  ✓ 近 {PLAYBACK_RAM_SEC / 60:.0f} 分已載入 RAM（{len(frames)} 幀）", flush=True)
    else:
        print("  回拉：目前沒有可載入的近段畫面（鏡頭開始錄之後才會有）", flush=True)


def push_playback(ts, jpeg):
    global _playback_last
    if not jpeg:
        return
    if ts - _playback_last < (1.0 / PLAYBACK_FPS):
        return
    _playback_last = ts
    with playback_lock:
        playback_ring.append((ts, jpeg))
        while len(playback_ring) > PLAYBACK_MAX_FRAMES:
            playback_ring.popleft()
    playback_archive.maybe_put(ts, jpeg)
    _publish_playback_meta()


def _unix_seconds(ts):
    """App 可能傳毫秒；ring 一律 unix 秒。"""
    try:
        value = float(ts)
    except (TypeError, ValueError):
        return 0.0
    if value > 1e12:
        return value / 1000.0
    return value


def nearest_playback(ts):
    ts = _unix_seconds(ts)
    with playback_lock:
        if playback_ring:
            start, end = playback_ring[0][0], playback_ring[-1][0]
            if start - 0.3 <= ts <= end + 0.3:
                best = min(playback_ring, key=lambda item: abs(item[0] - ts))
                return best[1]
    return playback_archive.nearest(ts)


def _local_day_bounds(ts):
    local = time.localtime(ts)
    start = time.mktime((
        local.tm_year, local.tm_mon, local.tm_mday,
        0, 0, 0, local.tm_wday, local.tm_yday, local.tm_isdst,
    ))
    return start, start + 86400.0


def iter_playback_from(ts):
    """從 ts 順播：只播同一曆日。沒有鄰近幀就停，禁止跨日偷播。"""
    ts = _unix_seconds(ts)
    _day_start, day_end = _local_day_bounds(ts)
    with playback_lock:
        ram_start = playback_ring[0][0] if playback_ring else None
        ram_items = list(playback_ring) if playback_ring else []
    archive_until = day_end
    if ram_start is not None:
        archive_until = min(ram_start, day_end)
    yielded = False
    for stamp, data in playback_archive.iter_from(ts, until=archive_until):
        if stamp >= day_end:
            break
        if not yielded and stamp - ts > 2.0:
            return
        yielded = True
        yield stamp, data
    ram_from = ts if ram_start is None else max(ts, ram_start)
    for stamp, data in ram_items:
        if stamp >= day_end:
            break
        if stamp + 0.05 < ram_from:
            continue
        if not yielded and stamp - ts > 2.0:
            return
        yielded = True
        yield stamp, data
    if not yielded:
        data = nearest_playback(ts)
        if data:
            yield ts, data


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


def grab_snapshot():
    """事件當下截圖：先 ring，沒有再用即時 JPEG。沒畫面就不建空紀錄。"""
    try:
        snap = evidence_ring.snapshot_jpeg()
        if snap:
            return snap
    except NameError:
        pass
    with frame_lock:
        return latest_jpeg.get("data")


def report_confirmed_fall(event_key, prob, trigger):
    """CONFIRMED 當下主動推播後端。高／極高只留短片、不附截圖；短片稍後由 clip 執行緒上傳。"""
    if not VISION_BACKEND_URL or not VISION_SHARED_TOKEN or not VISION_PATIENT_EMAIL:
        print("  ⚠️  未設定 VISION_BACKEND_URL / VISION_SHARED_TOKEN / VISION_PATIENT_EMAIL，跳過主動推播（App 開著時輪詢備援仍會記錄）")
        return
    body = {
        "patientEmail": VISION_PATIENT_EMAIL,
        "eventKey": event_key,
        "action": "DANGER: FALL",
        "confidence": max(float(prob), 0.9),
        "location": REPORT_LOCATION,
        "description": f"確認跌倒（觸發條件 {trigger}），跌倒機率 {float(prob) * 100:.0f}%",
        "modelName": MODEL_NAME,
    }
    try:
        resp = requests.post(
            f"{VISION_BACKEND_URL}/vision/report",
            headers={"X-Vision-Token": VISION_SHARED_TOKEN, "Content-Type": "application/json"},
            json=body,
            timeout=12,
        )
        if resp.status_code in (200, 201):
            with state_lock:
                if latest_state.get("eventKey") == event_key:
                    latest_state["reported"] = True
            print(f"  ✅ 已主動推播後端建立警報  eventKey={event_key}")
        else:
            print(f"  ⚠️  主動推播後端失敗 HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as exc:
        print(f"  ⚠️  主動推播後端例外：{exc}（App 開著時輪詢備援仍會記錄）")


def report_standup(event_key):
    """背景執行緒（Wave G1）：CONFIRMED → SUGGEST_DISMISS（持續站起）當下通知後端取消 5 秒觀察窗內的高風險 Alert。
    失敗只印警告；backend 那邊該計時器沒被取消，5 秒到仍會照樣建立 Alert（寧可多報不漏報）。"""
    if not VISION_BACKEND_URL or not VISION_SHARED_TOKEN or not VISION_PATIENT_EMAIL:
        return
    try:
        resp = requests.post(
            f"{VISION_BACKEND_URL}/vision/report/standup",
            headers={"X-Vision-Token": VISION_SHARED_TOKEN, "Content-Type": "application/json"},
            json={"patientEmail": VISION_PATIENT_EMAIL, "eventKey": event_key},
            timeout=5,
        )
        if resp.status_code == 200:
            print(f"  ✅ 已通知後端站起，取消觀察窗內的高風險警報  eventKey={event_key}")
        else:
            print(f"  ⚠️  通知後端站起失敗 HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as exc:
        print(f"  ⚠️  通知後端站起例外：{exc}")


def send_camera_heartbeat():
    """R109：每 30s 告訴後端這台鏡頭還在。失敗只印，不影響偵測。"""
    if not VISION_BACKEND_URL or not VISION_SHARED_TOKEN or not VISION_PATIENT_EMAIL:
        return
    try:
        resp = requests.post(
            f"{VISION_BACKEND_URL}/vision/heartbeat",
            headers={"X-Vision-Token": VISION_SHARED_TOKEN, "Content-Type": "application/json"},
            json={"patientEmail": VISION_PATIENT_EMAIL, "source": CAM_NAME},
            timeout=5,
        )
        if resp.status_code not in (200, 201):
            print(f"  ⚠️  心跳失敗 HTTP {resp.status_code}: {resp.text[:160]}")
    except Exception as exc:
        print(f"  ⚠️  心跳例外：{exc}")


def heartbeat_loop():
    while True:
        send_camera_heartbeat()
        time.sleep(30)


def report_low_posture(action, event_key, description, snap_jpeg=None):
    """低等級只記 Event、不建 High Alert。沒有截圖就不寫入，避免列表出現空列。"""
    if not VISION_BACKEND_URL or not VISION_SHARED_TOKEN or not VISION_PATIENT_EMAIL:
        return
    if not snap_jpeg:
        print(f"  ⚠️  略過低等級 {action}：當下沒有畫面可截")
        return
    try:
        resp = requests.post(
            f"{VISION_BACKEND_URL}/vision/report",
            headers={"X-Vision-Token": VISION_SHARED_TOKEN, "Content-Type": "application/json"},
            json={
                "patientEmail": VISION_PATIENT_EMAIL,
                "eventKey": event_key,
                "action": action,
                "severity": "Low",
                "confidence": 0.7,
                "location": REPORT_LOCATION,
                "description": description,
                "modelName": MODEL_NAME,
                "snapshotBase64": base64.b64encode(snap_jpeg).decode("ascii"),
            },
            timeout=12,
        )
        if resp.status_code in (200, 201):
            print(f"  ✅ 已記錄低等級事件 {action}  eventKey={event_key}")
        else:
            print(f"  ⚠️  低等級事件寫入失敗 HTTP {resp.status_code}: {resp.text[:160]}")
    except Exception as exc:
        print(f"  ⚠️  低等級事件寫入例外：{exc}")


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
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        qs = parse_qs(parsed.query)
        if path == "/health":
            with state_lock:
                self._send(200, dict(latest_state))
        elif path == "/reset":
            reset_flag["on"] = True
            self._send(200, {"ok": True})
        elif path == "/stream":
            self.stream_mjpeg()
        elif path == "/playback":
            try:
                ts = float((qs.get("t") or ["0"])[0])
            except (TypeError, ValueError):
                ts = 0.0
            data = nearest_playback(ts)
            if not data:
                self._send(404, {"error": "no playback"})
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        elif path == "/playback/stream":
            try:
                ts = float((qs.get("from") or qs.get("t") or ["0"])[0])
            except (TypeError, ValueError):
                ts = 0.0
            self.stream_playback_mjpeg(ts)
        else:
            self._send(404, {"error": "not found"})

    def _begin_mjpeg(self):
        self.send_response(200)
        self.send_header("Age", "0")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self.end_headers()

    def _write_mjpeg_frame(self, data):
        if not data:
            return
        self.wfile.write(b"--frame\r\n")
        self.wfile.write(b"Content-Type: image/jpeg\r\n")
        self.wfile.write(f"Content-Length: {len(data)}\r\n\r\n".encode())
        self.wfile.write(data)
        self.wfile.write(b"\r\n")

    def stream_mjpeg(self):
        """以 multipart/x-mixed-replace 連續推送 JPEG，瀏覽器/WebView <img> 可直接播。"""
        self._begin_mjpeg()
        try:
            while True:
                with frame_lock:
                    data = latest_jpeg["data"]
                if data is None:
                    time.sleep(0.05)
                    continue
                self._write_mjpeg_frame(data)
                time.sleep(1.0 / STREAM_FPS)
        except (BrokenPipeError, ConnectionResetError):
            pass  # 客戶端關閉連線，正常結束

    def stream_playback_mjpeg(self, from_ts):
        """從指定時間順播；只留在同一曆日。過去日播完就停，不接即時、不跨日。"""
        from_ts = _unix_seconds(from_ts)
        today0, _today_end = _local_day_bounds(time.time())
        is_today = from_ts >= today0
        self._begin_mjpeg()
        try:
            prev = None
            had = False
            for stamp, data in iter_playback_from(from_ts):
                had = True
                self._write_mjpeg_frame(data)
                if prev is not None:
                    gap = stamp - prev
                    if 0.04 < gap < 2.0:
                        time.sleep(gap)
                    else:
                        time.sleep(0.05)
                prev = stamp
            if not had or not is_today:
                return
            while True:
                with frame_lock:
                    data = latest_jpeg["data"]
                if data is None:
                    time.sleep(0.05)
                    continue
                self._write_mjpeg_frame(data)
                time.sleep(1.0 / STREAM_FPS)
        except (BrokenPipeError, ConnectionResetError):
            pass

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


def get_pair_y(coords, left_idx, right_idx):
    left = coords[left_idx]
    right = coords[right_idx]
    if np.all(left == 0) and np.all(right == 0):
        return None
    if np.all(left == 0):
        return float(right[1])
    if np.all(right == 0):
        return float(left[1])
    return float((left[1] + right[1]) / 2)


def get_pair_x(coords, left_idx, right_idx):
    left = coords[left_idx]
    right = coords[right_idx]
    if np.all(left == 0) and np.all(right == 0):
        return None
    if np.all(left == 0):
        return float(right[0])
    if np.all(right == 0):
        return float(left[0])
    return float((left[0] + right[0]) / 2)


def skeleton_wh(coords):
    """骨架外框寬高（正規化座標）。文獻常用寬高比區分站立／倒地。"""
    mask = np.any(np.abs(coords[:, :2]) > 1e-6, axis=1)
    pts = coords[mask, :2]
    if len(pts) < 6:
        return 0.0, 0.0
    w = float(pts[:, 0].max() - pts[:, 0].min())
    h = float(pts[:, 1].max() - pts[:, 1].min())
    return w, h


def hip_delta(history, now, sec):
    """近 sec 秒髖部 y 變化；影像座標往下為正＝人往地板落。"""
    window = [y for t, y in history if t >= now - sec]
    if len(window) < 4:
        return 0.0
    return float(window[-1] - window[0])


def classify_posture(coords):
    """stand / squat / bend / lie。對齊 8/30 實測能過的規則，再加文獻特徵。

    8/30（Lab realtime_predict_v8、總帳 R04）：彎腰肩部下壓 ≠ 躺；躺＝髖部接近畫面底部。
    昨晚「軀幹水平＝躺」會把彎腰當摔倒，已撤回。

    文獻補強（OpenPose 摔倒論文 / URFD·Le2i 常用）：
    - 倒地：骨架外框寬≥高，且腿沒有像彎腰那樣垂在髖部下方
    - 彎腰／蹲下：髖心下落慢；摔倒：髖心下落快（速度在狀態機用，不在這一幀）
    """
    hip = get_hip_y(coords)
    knee = get_pair_y(coords, 25, 26)
    ankle = get_pair_y(coords, 27, 28)
    sh_y = get_pair_y(coords, 11, 12)
    sh_x = get_pair_x(coords, 11, 12)
    hip_x = get_pair_x(coords, 23, 24)
    if hip is None or sh_y is None:
        return "unknown"
    torso_dy = hip - sh_y
    torso_dx = abs((hip_x or 0.0) - (sh_x or 0.0))
    upright = torso_dy > 0.14 and torso_dy > (torso_dx * 0.7)
    bw, bh = skeleton_wh(coords)
    aspect = bw / max(bh, 1e-4)
    legs_hanging = (
        (ankle is not None and (ankle - hip) > 0.20)
        or (knee is not None and (knee - hip) > 0.12)
    )

    # 8/30：貼地／畫面底部才算躺
    if (not upright) and hip >= 0.64:
        return "lie"
    # 倒地外框：寬>高 + 髖已下降 + 不是彎腰那種「腳還在下面」
    if (not upright) and aspect >= 1.15 and hip >= 0.50 and not legs_hanging:
        return "lie"
    if knee is not None:
        knee_hip = knee - hip
        if upright and 0.02 < knee_hip < 0.16 and hip > 0.46:
            return "squat"
    if (not upright) and hip < 0.60:
        return "bend"
    return "stand"


# ── 模型載入 ──────────────────────────────────────────────────────────────────
print("=" * 58)
print("  Fall Detection v8  —  HTTP API 服務  —  啟動中")
print("=" * 58)
with open(THRESHOLDS_JSON) as f:
    _t = json.load(f)
FALL_THRESHOLD = _t["threshold_safe"]

print("  MediaPipe Pose 載入中...", flush=True)
pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=0,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7,
)
print("  ✓ MediaPipe Pose", flush=True)

interpreter = Interpreter(model_path=TFLITE_PATH)
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


# ── 先把 HTTP server 綁上 port（主執行緒 bind，避免後面載入卡住時 8000 沒掛）──
restore_playback_ring()
_http = ThreadingHTTPServer(("0.0.0.0", API_PORT), VisionHandler)
print(f"  🌐 偵測結果 API : http://localhost:{API_PORT}/detect  (POST)", flush=True)
print(f"  📹 即時影像串流 : http://localhost:{API_PORT}/stream  (GET, 給 App 看)", flush=True)
threading.Thread(target=_http.serve_forever, daemon=True).start()
threading.Thread(target=heartbeat_loop, daemon=True).start()
time.sleep(0.2)

# ── 攝影機（禁止自動選：探鏡頭會打亂編號。2026-08-30 實拍：0＝外接房間，1＝Mac 內建）──
print(f"  攝影機 CAM_INDEX={CAM_INDEX} 開啟中...", flush=True)
_av = getattr(cv2, "CAP_AVFOUNDATION", None)
cap = cv2.VideoCapture(CAM_INDEX, _av) if _av is not None else cv2.VideoCapture(CAM_INDEX)
CAM_NAME = f"USB cam {CAM_INDEX}" if CAM_INDEX == 0 else f"cam {CAM_INDEX}"
if cap is None or not cap.isOpened():
    print("  ❌ 無法開啟攝影機！請改 CAM_INDEX 或接上 USB")
    raise SystemExit(1)
latest_state["camIndex"] = CAM_INDEX
latest_state["camName"] = CAM_NAME
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

WIN_NAME = f"Fall Detection  |  {CAM_NAME}  |  q=離開"
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
standup_start = None    # CONFIRMED 狀態下持續站起的起始時間（D3 debounce，避免單幀誤判）
event_key = ""           # 本次 CONFIRMED 事件的唯一 key（D1 主動推播、防重複寫入用）
hip_y_history = deque()
trigger_label = ""
evidence_ring = EvidenceRingBuffer()
squat_hold_start = None
squat_hold_kind = ""
last_squat_at = 0.0
last_alertish_at = 0.0  # 最近一次進入 SUSPECTED／CONFIRMED，用來擋「摔完立刻記蹲」
posture = "unknown"

try:
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if disp_scale < 1.0:
            frame = cv2.resize(frame, (disp_w, disp_h))
        now = time.time()
        if reset_flag["on"]:
            reset_flag["on"] = False
            state = "IDLE"
            idle_high_start = None
            susp_high_start = None
            standup_start = None
            trigger_label = ""
            event_key = ""
            squat_hold_start = None
            set_latest(state="IDLE", eventKey="", reported=False, trigger="")
            print(f"[{now:.1f}s] RESET → IDLE")

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        res = pose.process(rgb)
        rgb.flags.writeable = True
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        h, w = bgr.shape[:2]
        clean = bgr.copy()

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

        posture = classify_posture(coords) if detected else "unknown"
        drop = hip_delta(hip_y_history, now, 1.2) if detected else 0.0
        bw, bh = skeleton_wh(coords) if detected else (0.0, 0.0)
        asp = bw / max(bh, 1e-4) if detected else 0.0
        # 文獻：摔倒髖心下落明顯快過彎腰／蹲；下落中不要叫 squat/bend
        if drop >= 0.16 and last_hip_y >= 0.48 and posture in ("squat", "bend"):
            posture = "lie"

        # ── 狀態機：對齊 8/30 Lab realtime_predict_v8（彎腰／蹲下不得升級）──
        if state == "IDLE":
            if posture in ("squat", "bend"):
                idle_high_start = None
            elif posture == "lie" or last_prob >= SUSPECT_PROB_THR:
                if idle_high_start is None:
                    idle_high_start = now
                elif now - idle_high_start >= SUSPECT_ENTRY_SEC:
                    state = "SUSPECTED"
                    state_enter_time = now
                    entering_hip_y = last_hip_y
                    idle_high_start = None
                    susp_high_start = None
                    last_alertish_at = now
                    print(f"[{now:.1f}s] IDLE → SUSPECTED  pose={posture}  prob={last_prob:.3f}  hip={last_hip_y:.2f}")
            else:
                idle_high_start = None

        elif state == "SUSPECTED":
            elapsed = now - state_enter_time
            confirmed = False
            if posture in ("squat", "bend"):
                state = "DISMISSED"
                state_enter_time = now
                print(f"[{now:.1f}s] SUSPECTED → DISMISSED  (姿勢={posture}，不當摔倒)")
            else:
                if posture == "lie":
                    if susp_high_start is None:
                        susp_high_start = now
                    elif now - susp_high_start >= CONFIRM_A_SEC:
                        confirmed = True
                        trigger_label = "A (躺姿持續)"
                else:
                    susp_high_start = None
                if not confirmed and elapsed <= CONFIRM_B_SEC:
                    if last_hip_y - entering_hip_y > CONFIRM_B_DROP and (
                        posture == "lie" or last_hip_y > 0.62
                    ):
                        confirmed = True
                        trigger_label = "B (快速下落)"
                if not confirmed and elapsed >= CONFIRM_C_SEC and posture == "lie":
                    vals = [y for t, y in hip_y_history if t >= now - CONFIRM_C_SEC]
                    if len(vals) >= 5 and (max(vals) - min(vals)) < CONFIRM_C_RANGE:
                        confirmed = True
                        trigger_label = "C (躺地靜止)"
                if confirmed:
                    suspected_at = state_enter_time
                    clip_from = suspected_at - GREEN_LEAD_SEC
                    state = "CONFIRMED"
                    state_enter_time = now
                    standup_start = None
                    last_alertish_at = now
                    event_key = f"vision-{int(now * 1000)}"
                    set_latest(eventKey=event_key, reported=False)
                    threading.Thread(
                        target=report_confirmed_fall,
                        args=(event_key, last_prob, trigger_label),
                        daemon=True,
                    ).start()
                    evidence_ring.begin_clip(event_key, from_ts=clip_from)
                    threading.Thread(
                        target=finalize_and_upload_clip,
                        args=(evidence_ring, event_key, VISION_BACKEND_URL, VISION_SHARED_TOKEN, VISION_PATIENT_EMAIL),
                        daemon=True,
                    ).start()
                    print(
                        f"[{now:.1f}s] CONFIRMED  觸發={trigger_label}  "
                        f"clip=綠{GREEN_LEAD_SEC:.0f}s→紅+後{POST_ROLL_SEC:.0f}s  "
                        f"prob={last_prob:.3f}  eventKey={event_key}"
                    )
                elif entering_hip_y - last_hip_y > DISMISS_HIP_RISE:
                    state = "DISMISSED"
                    state_enter_time = now
                elif elapsed > OBSERVE_TIMEOUT:
                    state = "DISMISSED"
                    state_enter_time = now

        elif state == "CONFIRMED":
            # 人已站／蹲／彎 → 本地解除紅燈；後端高風險仍要看護在活動裡已查看
            off_ground = posture in ("stand", "squat", "bend")
            hip_up = (
                entering_hip_y is not None
                and last_hip_y is not None
                and entering_hip_y - last_hip_y > DISMISS_HIP_RISE
            )
            if off_ground or hip_up:
                if standup_start is None:
                    standup_start = now
                elif now - standup_start >= 0.8:
                    state = "SUGGEST_DISMISS"
                    state_enter_time = now
                    standup_start = None
                    if event_key:
                        threading.Thread(target=report_standup, args=(event_key,), daemon=True).start()
                    print(f"[{now:.1f}s] CONFIRMED → SUGGEST_DISMISS  (姿勢={posture})")
            else:
                standup_start = None

        elif state == "SUGGEST_DISMISS":
            if posture == "lie":
                state = "CONFIRMED"
                state_enter_time = now
                standup_start = None
                print(f"[{now:.1f}s] SUGGEST_DISMISS → CONFIRMED  (又躺下)")
            elif now - state_enter_time >= 1.2:
                state = "IDLE"
                idle_high_start = None
                trigger_label = ""
                event_key = ""
                set_latest(eventKey="", reported=False)

        elif state == "DISMISSED":
            if now - state_enter_time >= DISMISSED_HOLD:
                state = "IDLE"
                idle_high_start = None
                trigger_label = ""

        # 低：蹲下／彎腰每次記、不推播。剛走完摔倒路徑的幾秒不記，避免摔被寫成蹲。
        if state == "IDLE" and posture in ("squat", "bend") and (now - last_alertish_at) >= SQUAT_AFTER_ALERT_SEC:
            if squat_hold_start is None or squat_hold_kind != posture:
                squat_hold_start = now
                squat_hold_kind = posture
            elif now - squat_hold_start >= SQUAT_HOLD_SEC and (now - last_squat_at) >= SQUAT_COOLDOWN_SEC:
                last_squat_at = now
                squat_hold_start = None
                action = "SQUAT" if posture == "squat" else "BEND_OVER"
                label = "蹲下" if posture == "squat" else "彎腰"
                snap = grab_snapshot()
                if snap:
                    threading.Thread(
                        target=report_low_posture,
                        args=(action, f"{posture}-{int(now * 1000)}", f"偵測到{label}（僅紀錄、不推播）", snap),
                        daemon=True,
                    ).start()
                else:
                    print(f"  ⚠️  略過{label}紀錄：當下沒有畫面可截")
        else:
            squat_hold_start = None
            squat_hold_kind = ""

        set_latest(state=state, prob=float(last_prob), trigger=trigger_label, posture=posture)

        col = {
            "IDLE": (50, 200, 50), "SUSPECTED": (30, 160, 255),
            "CONFIRMED": (40, 40, 255), "SUGGEST_DISMISS": (0, 165, 255),
            "DISMISSED": (140, 140, 140),
        }[state]
        if state == "IDLE" and posture in ("squat", "bend"):
            col = (180, 200, 40)
        cv2.putText(bgr, f"{state}", (12, 36), cv2.FONT_HERSHEY_SIMPLEX, 1.0, col, 2)
        cv2.putText(bgr, f"Fall prob: {last_prob * 100:.1f}%  pose:{posture}  hip:{last_hip_y:.2f}", (12, 72),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, col, 2)
        cv2.putText(bgr, f"drop:{drop:.2f}  boxW/H:{asp:.2f}  {CAM_NAME}",
                    (12, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        if state == "IDLE" and posture == "squat":
            cv2.putText(bgr, "SQUAT - record only", (12, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.7, col, 2)
        elif state == "IDLE" and posture == "bend":
            cv2.putText(bgr, "BEND - record only", (12, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.7, col, 2)
        if state == "CONFIRMED":
            cv2.rectangle(bgr, (0, 0), (w - 1, h - 1), (40, 40, 255), 10)
            cv2.putText(bgr, "FALL CONFIRMED!", (w // 2 - 180, h // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.2, (40, 40, 255), 3)
        elif state == "SUGGEST_DISMISS":
            cv2.rectangle(bgr, (0, 0), (w - 1, h - 1), (0, 165, 255), 8)
            cv2.putText(bgr, "SUGGEST DISMISS - confirm in App", (w // 2 - 260, h // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 165, 255), 3)

        # 使用者／存檔＝無骨架真影；Mac 視窗才畫骨架與綠／紅狀態
        evidence_ring.push_bgr(clean, now=now)

        stream_h = int(h * STREAM_W / w) if w else 360
        small = cv2.resize(clean, (STREAM_W, stream_h))
        ok_jpg, jpg = cv2.imencode(
            ".jpg", small,
            [int(cv2.IMWRITE_JPEG_QUALITY), STREAM_JPEG_QUALITY],
        )
        if ok_jpg:
            jpeg_bytes = jpg.tobytes()
            with frame_lock:
                latest_jpeg["data"] = jpeg_bytes
            push_playback(now, jpeg_bytes)

        # ── 視窗（非 headless 才開）──────────────────────────────────────
        if not HEADLESS:
            try:
                visible = cv2.getWindowProperty(WIN_NAME, cv2.WND_PROP_VISIBLE)
            except cv2.error:
                visible = -1
            if visible < 1:
                cv2.namedWindow(WIN_NAME, cv2.WINDOW_NORMAL)
                cv2.resizeWindow(WIN_NAME, max(disp_w, 640), max(disp_h, 480))
            cv2.imshow(WIN_NAME, bgr)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            elif key == ord("r") and state in ("CONFIRMED", "SUGGEST_DISMISS"):
                state = "IDLE"
                idle_high_start = None
                standup_start = None
                trigger_label = ""
                event_key = ""
                set_latest(eventKey="", reported=False)
                print("[手動重置] → IDLE")
        else:
            time.sleep(0.001)
finally:
    cap.release()
    if not HEADLESS:
        cv2.destroyAllWindows()
    pose.close()
    print("[INFO] 已結束。")
