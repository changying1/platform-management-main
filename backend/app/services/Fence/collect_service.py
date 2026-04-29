from __future__ import annotations

from datetime import datetime
from threading import Lock


class FenceCollectService:
    def __init__(self):
        self._lock = Lock()
        self._active = False
        self._started_at: str | None = None
        self._points: list[dict] = []

    def start_session(self) -> dict:
        with self._lock:
            self._active = True
            self._started_at = datetime.now().isoformat()
            self._points = []
            return self._snapshot_no_lock()

    def stop_session(self) -> dict:
        with self._lock:
            snapshot = self._snapshot_no_lock()
            self._active = False
            self._started_at = None
            self._points = []
            return snapshot

    def record_point(self, device_id: str, lat: float | None, lng: float | None) -> bool:
        if not device_id or lat is None or lng is None:
            return False

        with self._lock:
            if not self._active:
                return False

            point = {
                "device_id": device_id,
                "lat": lat,
                "lng": lng,
                "timestamp": datetime.now().isoformat(),
            }

            # 检查坐标是否已存在（精度保留6位小数）
            existing_point = next(
                (p for p in self._points 
                 if abs(p["lat"] - lat) < 1e-6 and abs(p["lng"] - lng) < 1e-6),
                None
            )
            
            if existing_point:
                # 更新已存在点的时间戳和设备ID
                existing_point.update(point)
            else:
                # 添加新点
                self._points.append(point)
            return True

    def get_snapshot(self) -> dict:
        with self._lock:
            return self._snapshot_no_lock()

    def _snapshot_no_lock(self) -> dict:
        # 获取所有唯一设备ID
        device_ids = list({p["device_id"] for p in self._points})
        return {
            "active": self._active,
            "started_at": self._started_at,
            "device_ids": device_ids,
            "points": self._points.copy(),
            "count": len(self._points),
            "can_draw": len(self._points) >= 3,
        }


fence_collect_service = FenceCollectService()
