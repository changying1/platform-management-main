from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from pymongo import ASCENDING, DESCENDING

from app.core.database import get_mongo_collection
from app.schemas.device_schema import TrajectoryPoint
from app.utils.config_manager import get_track_record_interval
from app.utils.logger import get_logger


logger = get_logger("DeviceLocationHistoryService")

COLLECTION_NAME = "device_location_history"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
        except Exception:
            return None
    return None


def _iso_z(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class DeviceLocationHistoryService:
    """Stores long-term device track points in a dedicated MongoDB collection."""

    def __init__(self):
        self.collection = get_mongo_collection(COLLECTION_NAME)
        self._indexes_ready = False

    def ensure_indexes(self):
        if self._indexes_ready:
            return
        try:
            self.collection.create_index([("device_id", ASCENDING), ("timestamp", ASCENDING)])
            self.collection.create_index([("timestamp", DESCENDING)])
            self.collection.create_index([("project_id", ASCENDING), ("timestamp", DESCENDING)])
            self.collection.create_index([("branch_id", ASCENDING), ("timestamp", DESCENDING)])
            self.collection.create_index([("grid_id", ASCENDING), ("timestamp", DESCENDING)])
            self.collection.create_index([("team_id", ASCENDING), ("timestamp", DESCENDING)])
            self.collection.create_index([("expire_at", ASCENDING)], expireAfterSeconds=0)
            self._indexes_ready = True
        except Exception as exc:
            logger.warning(f"Failed to ensure device location history indexes: {exc}")

    def _last_point(self, device_id: str) -> dict | None:
        self.ensure_indexes()
        return self.collection.find_one({"device_id": device_id}, sort=[("timestamp", DESCENDING)])

    def should_record_by_interval(self, device_id: str, timestamp: datetime) -> bool:
        interval = get_track_record_interval()
        if interval <= 0:
            return True
        last_point = self._last_point(device_id)
        if not last_point:
            return True
        last_dt = _parse_datetime(last_point.get("timestamp"))
        if not last_dt:
            return True
        return (timestamp - last_dt).total_seconds() >= interval

    def add_point(
        self,
        device: dict,
        point: TrajectoryPoint,
        retention_days: int | None = None,
    ) -> dict | None:
        device_id = str(device.get("device_id") or device.get("id") or "").strip()
        if not device_id:
            return None

        timestamp = _parse_datetime(point.timestamp) or _utc_now()
        if not self.should_record_by_interval(device_id, timestamp):
            logger.debug(f"Skipped history point for {device_id}: below trackRecordInterval")
            return None

        self.ensure_indexes()
        expire_at = None
        if retention_days and retention_days > 0:
            expire_at = timestamp + timedelta(days=retention_days)

        doc = {
            "device_id": device_id,
            "device_name": device.get("name") or device.get("device_name") or "",
            "holder": device.get("holder") or "",
            "holder_phone": device.get("holderPhone") or device.get("phone_num") or "",
            "personnel_id": device.get("personnel_id") or device.get("holder_id") or "",
            "lat": point.lat,
            "lng": point.lng,
            "speed": point.speed,
            "direction": point.direction,
            "timestamp": timestamp,
            "timestamp_text": _iso_z(timestamp),
            "branch_id": device.get("branch_id") or "",
            "company": device.get("company") or device.get("branch_name") or "",
            "project_id": device.get("project_id") or "",
            "project": device.get("project") or device.get("project_name") or "",
            "grid_id": device.get("grid_id") or "",
            "grid": device.get("grid") or device.get("grid_name") or "",
            "team_id": device.get("team_id") or "",
            "team": device.get("team") or device.get("team_name") or "",
            "created_at": _utc_now(),
        }
        if expire_at:
            doc["expire_at"] = expire_at

        self.collection.insert_one(doc)
        return doc

    def get_device_points(
        self,
        device_id: str,
        hours: int = 24,
        start_time: str | None = None,
        end_time: str | None = None,
    ) -> list[dict]:
        self.ensure_indexes()
        query: dict[str, Any] = {"device_id": str(device_id)}
        time_query: dict[str, Any] = {}

        start_dt = _parse_datetime(start_time)
        end_dt = _parse_datetime(end_time)
        if start_dt:
            time_query["$gte"] = start_dt
        if end_dt:
            time_query["$lte"] = end_dt
        if not time_query and hours and hours > 0:
            time_query["$gte"] = _utc_now() - timedelta(hours=hours)
        if time_query:
            query["timestamp"] = time_query

        return [self._point_to_trajectory(doc) for doc in self.collection.find(query).sort("timestamp", ASCENDING)]

    def get_devices_with_points(
        self,
        hours: int = 24,
        start_time: str | None = None,
        end_time: str | None = None,
    ) -> list[dict]:
        self.ensure_indexes()
        match: dict[str, Any] = {}
        time_query: dict[str, Any] = {}
        start_dt = _parse_datetime(start_time)
        end_dt = _parse_datetime(end_time)
        if start_dt:
            time_query["$gte"] = start_dt
        if end_dt:
            time_query["$lte"] = end_dt
        if not time_query and hours and hours > 0:
            time_query["$gte"] = _utc_now() - timedelta(hours=hours)
        if time_query:
            match["timestamp"] = time_query

        pipeline = []
        if match:
            pipeline.append({"$match": match})
        pipeline.extend([
            {"$sort": {"timestamp": 1}},
            {
                "$group": {
                    "_id": "$device_id",
                    "trajectory": {"$push": {
                        "timestamp": "$timestamp_text",
                        "lat": "$lat",
                        "lng": "$lng",
                        "speed": "$speed",
                        "direction": "$direction",
                    }},
                    "latest": {"$last": "$$ROOT"},
                }
            },
        ])
        results = []
        for row in self.collection.aggregate(pipeline):
            latest = row.get("latest") or {}
            latest["trajectory"] = row.get("trajectory") or []
            results.append(latest)
        return results

    def get_track_summaries(
        self,
        hours: int = 24,
        start_time: str | None = None,
        end_time: str | None = None,
    ) -> list[dict]:
        self.ensure_indexes()
        match: dict[str, Any] = {}
        time_query: dict[str, Any] = {}
        start_dt = _parse_datetime(start_time)
        end_dt = _parse_datetime(end_time)
        if start_dt:
            time_query["$gte"] = start_dt
        if end_dt:
            time_query["$lte"] = end_dt
        if not time_query and hours and hours > 0:
            time_query["$gte"] = _utc_now() - timedelta(hours=hours)
        if time_query:
            match["timestamp"] = time_query

        pipeline = []
        if match:
            pipeline.append({"$match": match})
        pipeline.extend([
            {"$sort": {"device_id": 1, "timestamp": 1}},
            {
                "$group": {
                    "_id": "$device_id",
                    "first": {"$first": "$$ROOT"},
                    "latest": {"$last": "$$ROOT"},
                    "point_count": {"$sum": 1},
                }
            },
        ])

        results = []
        for row in self.collection.aggregate(pipeline, allowDiskUse=True):
            first = row.get("first") or {}
            latest = row.get("latest") or {}
            results.append({
                **latest,
                "device_id": str(row.get("_id") or latest.get("device_id") or ""),
                "start_time": first.get("timestamp_text") or _iso_z(_parse_datetime(first.get("timestamp"))),
                "end_time": latest.get("timestamp_text") or _iso_z(_parse_datetime(latest.get("timestamp"))),
                "point_count": int(row.get("point_count") or 0),
                "start_point": {
                    "timestamp": first.get("timestamp_text") or _iso_z(_parse_datetime(first.get("timestamp"))),
                    "lat": first.get("lat"),
                    "lng": first.get("lng"),
                    "speed": first.get("speed"),
                    "direction": first.get("direction"),
                },
            })
        return results

    def summarize_recent_tracks(self, days: int = 7) -> list[dict]:
        self.ensure_indexes()
        cutoff = _utc_now() - timedelta(days=max(1, days))
        pipeline = [
            {"$match": {"timestamp": {"$gte": cutoff}}},
            {"$sort": {"timestamp": 1}},
            {
                "$group": {
                    "_id": "$device_id",
                    "deviceName": {"$last": "$device_name"},
                    "holder": {"$last": "$holder"},
                    "company": {"$last": "$company"},
                    "project": {"$last": "$project"},
                    "team": {"$last": "$team"},
                    "startTime": {"$first": "$timestamp_text"},
                    "endTime": {"$last": "$timestamp_text"},
                    "pointCount": {"$sum": 1},
                }
            },
        ]
        return [
            {
                "deviceId": row.get("_id"),
                "deviceName": row.get("deviceName") or f"定位设备-{row.get('_id')}",
                "holder": row.get("holder") or "",
                "company": row.get("company") or "",
                "project": row.get("project") or "",
                "team": row.get("team") or "",
                "startTime": row.get("startTime"),
                "endTime": row.get("endTime"),
                "pointCount": row.get("pointCount", 0),
            }
            for row in self.collection.aggregate(pipeline)
        ]

    def cleanup_older_than(self, retention_days: int) -> int:
        self.ensure_indexes()
        cutoff = _utc_now() - timedelta(days=retention_days)
        result = self.collection.delete_many({"timestamp": {"$lt": cutoff}})
        return int(result.deleted_count or 0)

    @staticmethod
    def _point_to_trajectory(doc: dict) -> dict:
        timestamp = _parse_datetime(doc.get("timestamp"))
        return {
            "timestamp": doc.get("timestamp_text") or (_iso_z(timestamp) if timestamp else ""),
            "lat": doc.get("lat"),
            "lng": doc.get("lng"),
            "speed": doc.get("speed"),
            "direction": doc.get("direction"),
        }


device_location_history_service = DeviceLocationHistoryService()
