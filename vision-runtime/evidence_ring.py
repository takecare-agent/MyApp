"""
事件證據 ring buffer（骨架渲染幀）
- 記憶體保留最近 PRE_ROLL_SEC 秒無骨架 JPEG
- 短片從綠色 IDLE 起（begin_clip from_ts）到 CONFIRMED 後 POST_ROLL_SEC
"""
import base64
import os
import shutil
import subprocess
import threading
import time
from collections import deque
import cv2
import numpy as np
import requests

PRE_ROLL_SEC = float(os.environ.get("EVIDENCE_PRE_ROLL_SEC", "20"))
POST_ROLL_SEC = float(os.environ.get("EVIDENCE_POST_ROLL_SEC", "8"))
TARGET_FPS = float(os.environ.get("EVIDENCE_FPS", "5"))
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
AVCONVERT_BIN = "/usr/bin/avconvert"


def _ffmpeg_bin():
    found = shutil.which("ffmpeg")
    if found:
        return found
    for path in ("/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"):
        if os.path.isfile(path):
            return path
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def _mp4_moov_front(path):
    try:
        with open(path, "rb") as handle:
            head = handle.read(4096)
        return b"moov" in head
    except OSError:
        return False


def _make_playable_mp4(src):
    """OpenCV 寫的 isom＋moov 在檔尾，QuickTime／iPhone 打不開。轉成 mp42 faststart。"""
    if not src or not os.path.isfile(src):
        return None
    dst = src.replace(".mp4", "_play.mp4")
    ffmpeg_bin = _ffmpeg_bin()
    if ffmpeg_bin:
        try:
            result = subprocess.run(
                [
                    ffmpeg_bin, "-y", "-i", src,
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", "-an", dst,
                ],
                capture_output=True,
                timeout=40,
                check=False,
            )
            if result.returncode == 0 and os.path.isfile(dst) and os.path.getsize(dst) > 1024:
                return dst
        except Exception:
            pass
        try:
            os.remove(dst)
        except OSError:
            pass
    if os.path.isfile(AVCONVERT_BIN):
        try:
            result = subprocess.run(
                [
                    AVCONVERT_BIN,
                    "--preset", "PresetPassthrough",
                    "--source", src,
                    "--output", dst,
                    "--replace",
                ],
                capture_output=True,
                timeout=60,
                check=False,
            )
            if result.returncode == 0 and os.path.isfile(dst) and os.path.getsize(dst) > 1024:
                if _mp4_moov_front(dst):
                    return dst
        except Exception:
            pass
        try:
            os.remove(dst)
        except OSError:
            pass
    return src if _mp4_moov_front(src) else None


class EvidenceRingBuffer:
    def __init__(self, pre_roll_sec: float = PRE_ROLL_SEC, target_fps: float = TARGET_FPS):
        self.pre_roll_sec = pre_roll_sec
        self.target_fps = max(1.0, target_fps)
        self._min_interval = 1.0 / self.target_fps
        self._frames = deque()  # (ts, jpeg_bytes)
        self._lock = threading.Lock()
        self._last_push = 0.0
        self._clip_jobs = {}  # event_key -> {started, frames_post, done}

    def push_bgr(self, bgr, now=None):
        """推入一幀（使用者證據＝無骨架真影）。自動節流與淘汰過舊幀。"""
        if bgr is None:
            return
        if now is None:
            now = time.time()
        with self._lock:
            if now - self._last_push < self._min_interval:
                return
            self._last_push = now
            ok, buf = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
            if not ok:
                return
            self._frames.append((now, buf.tobytes()))
            cutoff = now - self.pre_roll_sec - 1.0
            while self._frames and self._frames[0][0] < cutoff:
                self._frames.popleft()

            # 進行中的 clip post-roll 也收幀
            for key, job in list(self._clip_jobs.items()):
                if job.get("done"):
                    continue
                job["post"].append((now, buf.tobytes()))
                if now - job["started"] >= POST_ROLL_SEC:
                    job["done"] = True

    def snapshot_jpeg(self):
        with self._lock:
            if not self._frames:
                return None
            return self._frames[-1][1]

    def begin_clip(self, event_key: str, from_ts: float | None = None):
        """from_ts：從「綠色 IDLE」起算的時間；沒指定則用 ring 內全部。"""
        with self._lock:
            if from_ts is None:
                pre = list(self._frames)
            else:
                pre = [item for item in self._frames if item[0] >= from_ts]
                if not pre:
                    pre = list(self._frames)
            self._clip_jobs[event_key] = {
                "started": time.time(),
                "pre": pre,
                "post": [],
                "done": False,
            }

    def take_finished_clip(self, event_key: str):
        with self._lock:
            job = self._clip_jobs.get(event_key)
            if not job or not job.get("done"):
                return None
            frames = job["pre"] + job["post"]
            del self._clip_jobs[event_key]
            return frames

    @staticmethod
    def frames_to_mp4_bytes(frames, fps=TARGET_FPS):
        if not frames:
            return None
        # 解第一幀拿尺寸
        arr0 = np.frombuffer(frames[0][1], dtype=np.uint8)
        img0 = cv2.imdecode(arr0, cv2.IMREAD_COLOR)
        if img0 is None:
            return None
        h, w = img0.shape[:2]
        tmp = os.path.join("/tmp", f"takecare_clip_{int(time.time() * 1000)}.mp4")
        writer = None
        for codec in ("avc1", "H264", "mp4v"):
            fourcc = cv2.VideoWriter_fourcc(*codec)
            candidate = cv2.VideoWriter(tmp, fourcc, max(1.0, fps), (w, h))
            if candidate.isOpened():
                writer = candidate
                break
            candidate.release()
        if writer is None:
            return None
        try:
            for _, jpeg in frames:
                arr = np.frombuffer(jpeg, dtype=np.uint8)
                img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if img is None:
                    continue
                if img.shape[0] != h or img.shape[1] != w:
                    img = cv2.resize(img, (w, h))
                writer.write(img)
        finally:
            writer.release()
        playable = _make_playable_mp4(tmp)
        tmp_use = playable or tmp
        try:
            data = open(tmp_use, "rb").read()
        finally:
            for path in {tmp, tmp_use}:
                try:
                    os.remove(path)
                except OSError:
                    pass
        if not data or len(data) > MAX_UPLOAD_BYTES:
            return None
        return data


def upload_evidence(
    *,
    backend_url: str,
    shared_token: str,
    patient_email: str,
    event_key: str,
    media_type: str,
    content_type: str,
    raw_bytes: bytes,
    duration_sec: float | None = None,
    start_at: float | None = None,
):
    if not backend_url or not shared_token or not patient_email or not raw_bytes:
        print("  ⚠️  evidence 上傳跳過：缺少設定或空資料")
        return
    try:
        payload = {
            "patientEmail": patient_email,
            "eventKey": event_key,
            "mediaType": media_type,
            "contentType": content_type,
            "dataBase64": base64.b64encode(raw_bytes).decode("ascii"),
            "durationSec": duration_sec,
        }
        if start_at:
            payload["startAt"] = start_at
        resp = requests.post(
            f"{backend_url.rstrip('/')}/vision/evidence",
            headers={"X-Vision-Token": shared_token, "Content-Type": "application/json"},
            json=payload,
            timeout=20,
        )
        if resp.status_code in (200, 201):
            print(f"  ✅ 已上傳事件證據 {media_type} eventKey={event_key}")
        else:
            print(f"  ⚠️  證據上傳失敗 HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as exc:
        print(f"  ⚠️  證據上傳例外：{exc}")


def finalize_and_upload_clip(ring: EvidenceRingBuffer, event_key: str, backend_url, token, patient_email):
    """背景：等 post-roll 完成後上傳 mp4。高／極高只要短片，失敗不改傳截圖。"""
    deadline = time.time() + POST_ROLL_SEC + 5
    frames = None
    while time.time() < deadline:
        frames = ring.take_finished_clip(event_key)
        if frames is not None:
            break
        time.sleep(0.5)
    if not frames:
        print(f"  ⚠️  短片無幀，略過截圖退回  eventKey={event_key}")
        return
    poster = frames[0][1] if frames[0][1] else None
    if poster:
        upload_evidence(
            backend_url=backend_url,
            shared_token=token,
            patient_email=patient_email,
            event_key=event_key,
            media_type="snapshot",
            content_type="image/jpeg",
            raw_bytes=poster,
        )
    mp4 = EvidenceRingBuffer.frames_to_mp4_bytes(frames)
    if mp4:
        upload_evidence(
            backend_url=backend_url,
            shared_token=token,
            patient_email=patient_email,
            event_key=event_key,
            media_type="clip",
            content_type="video/mp4",
            raw_bytes=mp4,
            duration_sec=len(frames) / max(1.0, TARGET_FPS),
            start_at=frames[0][0],
        )
    else:
        print(f"  ⚠️  短片編碼失敗，不改傳截圖  eventKey={event_key}")
