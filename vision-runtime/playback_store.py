"""
本機 24 小時「錄製時長」回拉檔（R116）
--------------------------------------
保留的是累積有畫面的秒數，不是日曆滑過 24 小時。
每天測 2 小時 → 約可留 12 天；鏡頭一直開 → 仍是最近 24 小時連續。
"""
from __future__ import annotations

import bisect
import os
import queue
import threading
import time

PLAYBACK_DIR = os.environ.get(
    "VISION_PLAYBACK_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "playback_ring"),
)
GAP_SEC = 2.0


def ensure_dir(path=None):
    os.makedirs(path or PLAYBACK_DIR, exist_ok=True)


def frame_path(ts: float) -> str:
    hour = time.strftime("%Y%m%d%H", time.localtime(ts))
    folder = os.path.join(PLAYBACK_DIR, hour)
    return os.path.join(folder, f"{int(round(float(ts) * 1000)):013d}.jpg")


def resolve_path(ts: float) -> str:
    path = frame_path(ts)
    if os.path.isfile(path):
        return path
    flat = os.path.join(PLAYBACK_DIR, f"{int(round(float(ts) * 1000)):013d}.jpg")
    if os.path.isfile(flat):
        return flat
    return path


def spans_from_timestamps(stamps, gap=GAP_SEC):
    if not stamps:
        return []
    start = prev = stamps[0]
    out = []
    for ts in stamps:
        if ts - prev > gap:
            out.append([start, prev])
            start = ts
        prev = ts
    out.append([start, prev])
    return out


def _read_jpeg(path):
    try:
        with open(path, "rb") as handle:
            data = handle.read()
        return data or None
    except OSError:
        return None


def scan_timestamps():
    """啟動掃描：含子資料夾與舊版扁平檔。"""
    ensure_dir()
    stamps = []
    for root, _dirs, files in os.walk(PLAYBACK_DIR):
        for name in files:
            if not name.endswith(".jpg"):
                continue
            stem = name[:-4]
            if not stem.isdigit():
                continue
            stamps.append(int(stem) / 1000.0)
    stamps.sort()
    return stamps


class PlaybackArchive:
    """循環 JPEG。額度＝累積錄製秒數（keep_sec × persist_fps 幀）。"""

    def __init__(self, keep_sec: float, persist_fps: float):
        self.keep_sec = max(3600.0, float(keep_sec))
        self.persist_fps = max(0.5, float(persist_fps))
        self.min_interval = 1.0 / self.persist_fps
        self.max_frames = int(self.keep_sec * self.persist_fps)
        self._index = []
        self._lock = threading.Lock()
        self._last = 0.0
        self._q = queue.Queue(maxsize=8000)
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def recorded_hours(self, count=None):
        n = self.max_frames if count is None else count
        return (n * self.min_interval) / 3600.0

    def _trim_unlocked(self):
        dropped = []
        while len(self._index) > self.max_frames:
            dropped.append(self._index.pop(0))
        for ts in dropped:
            self._offer(("delete", ts, None))
        return len(dropped)

    def load_index(self):
        stamps = scan_timestamps()
        extra = 0
        if len(stamps) > self.max_frames:
            extra = len(stamps) - self.max_frames
            for ts in stamps[:extra]:
                self._delete_file(ts)
            stamps = stamps[extra:]
        with self._lock:
            self._index = stamps
            self._last = stamps[-1] if stamps else 0.0
        hours = self.recorded_hours(len(stamps))
        print(
            f"  ✓ 回拉檔：{len(stamps)} 幀＝約 {hours:.1f} 小時錄製"
            + (f"（刪超額 {extra}）" if extra else "")
            + f"／上限 {self.keep_sec / 3600:.0f} 小時"
        )
        return list(stamps)

    def maybe_put(self, ts, jpeg):
        if not jpeg:
            return
        ts = float(ts)
        if ts - self._last < self.min_interval:
            return
        self._last = ts
        with self._lock:
            if self._index and ts <= self._index[-1]:
                return
            self._index.append(ts)
            self._trim_unlocked()
        self._offer(("put", ts, jpeg))

    def spans(self):
        with self._lock:
            return spans_from_timestamps(self._index)

    def coverage(self):
        with self._lock:
            if not self._index:
                return 0.0, 0.0, 0
            return self._index[0], self._index[-1], len(self._index)

    def nearest(self, ts, max_dt=0.9):
        ts = float(ts)
        with self._lock:
            if not self._index:
                return None
            i = bisect.bisect_left(self._index, ts)
            cands = []
            if i < len(self._index):
                cands.append(self._index[i])
            if i > 0:
                cands.append(self._index[i - 1])
            best = min(cands, key=lambda item: abs(item - ts))
            if abs(best - ts) > max_dt:
                return None
        return _read_jpeg(resolve_path(best))

    def iter_from(self, ts, until=None):
        ts = float(ts)
        until = float(until) if until else None
        with self._lock:
            i = bisect.bisect_left(self._index, ts - 0.3)
            stamps = [
                item for item in self._index[i:]
                if until is None or item < until - 0.05
            ]
        for stamp in stamps:
            data = _read_jpeg(resolve_path(stamp))
            if data:
                yield stamp, data

    def load_recent_jpegs(self, within_sec: float):
        """RAM 只載「最後錄到的」一段，不看日曆是否已過 24h。"""
        n = max(1, int(max(60.0, float(within_sec)) * self.persist_fps))
        with self._lock:
            stamps = self._index[-n:]
        frames = []
        for stamp in stamps:
            data = _read_jpeg(resolve_path(stamp))
            if data:
                frames.append((stamp, data))
        return frames

    def _offer(self, item):
        try:
            self._q.put_nowait(item)
        except queue.Full:
            pass

    def _delete_file(self, ts):
        path = resolve_path(ts)
        try:
            os.remove(path)
        except OSError:
            pass
        folder = os.path.dirname(path)
        try:
            if folder != PLAYBACK_DIR and not os.listdir(folder):
                os.rmdir(folder)
        except OSError:
            pass

    def _loop(self):
        ensure_dir()
        while True:
            op, ts, jpeg = self._q.get()
            try:
                if op == "put":
                    path = frame_path(ts)
                    ensure_dir(os.path.dirname(path))
                    with open(path, "wb") as handle:
                        handle.write(jpeg)
                elif op == "delete":
                    self._delete_file(ts)
            except OSError as exc:
                print(f"  ⚠️  回拉落地失敗：{exc}")
