from __future__ import annotations

from collections import OrderedDict
from datetime import datetime
from threading import Lock


class FenceCollectService:
    def __init__(self):
        self._lock = Lock()
        self._active = False
        self._started_at: str | None = None
        self._points_by_device: OrderedDict[str, dict] = OrderedDict()

    def start_session(self) -> dict:
        with self._lock:
            self._active = True
            self._started_at = datetime.now().isoformat()
            self._points_by_device = OrderedDict()
            return self._snapshot_no_lock()

    def stop_session(self) -> dict:
        with self._lock:
            snapshot = self._snapshot_no_lock()
            self._active = False
            self._started_at = None
            self._points_by_device = OrderedDict()
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

            if device_id in self._points_by_device:
                self._points_by_device[device_id].update(point)
            else:
                self._points_by_device[device_id] = point
            return True

    def get_snapshot(self) -> dict:
        with self._lock:
            return self._snapshot_no_lock()

    def _snapshot_no_lock(self) -> dict:
        points = list(self._points_by_device.values())
        return {
            "active": self._active,
            "started_at": self._started_at,
            "device_ids": list(self._points_by_device.keys()),
            "points": points,
            "count": len(points),
            "can_draw": len(points) >= 3,
        }


fence_collect_service = FenceCollectService()
