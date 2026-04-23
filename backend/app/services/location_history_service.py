from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from app.services.Device.device_service import device_service
from app.utils.logger import get_logger


logger = get_logger("LocationHistoryService")


class LocationHistoryService:
    """
    MongoDB 版 DeviceLocationHistory 能力层。

    数据来源不是独立 SQL 表，而是设备文档中的 `trajectory` 数组。
    对外提供与历史轨迹查询/摘要统计等价的能力。
    """

    @staticmethod
    def _parse_timestamp(value: str | None) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return None

    @staticmethod
    def _normalize_time(dt: datetime) -> datetime:
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    def get_device_history(
        self,
        device_id: str,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        hours: int = 24,
    ) -> dict:
        """
        获取单设备历史轨迹。

        返回结构对齐旧 SQL 版接口语义：
        {
            "device_id": "...",
            "points": [{"lat": ..., "lng": ..., "speed": ..., "direction": ..., "time": "..."}],
            "count": N
        }
        """
        trajectory = device_service.get_trajectory(device_id, 0)

        if start_time and end_time:
            start_dt = self._parse_timestamp(start_time)
            end_dt = self._parse_timestamp(end_time)
            if start_dt and end_dt:
                start_dt = self._normalize_time(start_dt)
                end_dt = self._normalize_time(end_dt)
                trajectory = [
                    point for point in trajectory
                    if (point_dt := self._parse_timestamp(point.get("timestamp")))
                    and start_dt <= self._normalize_time(point_dt) <= end_dt
                ]
        elif hours > 0:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
            trajectory = [
                point for point in trajectory
                if (point_dt := self._parse_timestamp(point.get("timestamp")))
                and self._normalize_time(point_dt) >= cutoff
            ]

        result = [
            {
                "lat": point.get("lat"),
                "lng": point.get("lng"),
                "speed": point.get("speed"),
                "direction": point.get("direction"),
                "time": point.get("timestamp"),
            }
            for point in trajectory
        ]

        return {
            "device_id": device_id,
            "points": result,
            "count": len(result),
        }

    def get_devices_history_summary(self, days: int = 7) -> dict:
        """
        获取所有设备最近 N 天轨迹摘要。

        返回结构对齐旧 SQL 版 `/location/devices/history` 语义。
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        devices = device_service.get_devices()
        tracks = []

        for device in devices:
            trajectory = device.get("trajectory", [])
            filtered = []
            for point in trajectory:
                point_dt = self._parse_timestamp(point.get("timestamp"))
                if not point_dt:
                    continue
                if self._normalize_time(point_dt) >= cutoff:
                    filtered.append(point)

            if not filtered:
                continue

            filtered.sort(key=lambda item: item.get("timestamp", ""))
            tracks.append({
                "deviceId": device.get("device_id"),
                "deviceName": device.get("name") or f"定位设备-{device.get('device_id')}",
                "holder": device.get("holder", ""),
                "company": device.get("company", ""),
                "project": device.get("project", ""),
                "team": device.get("team", ""),
                "startTime": filtered[0].get("timestamp"),
                "endTime": filtered[-1].get("timestamp"),
                "pointCount": len(filtered),
            })

        logger.info(f"Loaded {len(tracks)} device track summaries from MongoDB")
        return {"tracks": tracks}


location_history_service = LocationHistoryService()
