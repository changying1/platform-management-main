from datetime import datetime, timedelta
from typing import Optional

from app.core.database import get_mongo_collection
from app.services.Device.device_service import device_service
from app.utils.logger import get_logger


logger = get_logger("AttendanceService")

attendance_collection = get_mongo_collection("attendance_record")
fence_device_collection = get_mongo_collection("fence_device")


def _now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _direction(event_type: str) -> str:
    raw = (event_type or "").strip().lower()
    if raw in {"in", "clock_in", "check_in", "signin", "entry", "enter"}:
        return "in"
    if raw in {"out", "clock_out", "check_out", "signout", "exit", "leave"}:
        return "out"
    return raw


class AttendanceService:
    def ensure_indexes(self):
        try:
            attendance_collection.create_index([("check_time", -1)])
            attendance_collection.create_index([("device_id", 1), ("check_time", -1)])
            attendance_collection.create_index([("personnel_id", 1), ("check_time", -1)])
            attendance_collection.create_index([("project_id", 1), ("check_time", -1)])
            attendance_collection.create_index([("branch_id", 1), ("check_time", -1)])
        except Exception as exc:
            logger.warning(f"Failed to ensure attendance indexes: {exc}")

    def record_device_event(
        self,
        phone_num: str,
        event_type: str,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
        check_time: Optional[datetime] = None,
    ) -> dict:
        self.ensure_indexes()
        checked_at = check_time or datetime.now()
        check_time_text = checked_at.strftime("%Y-%m-%d %H:%M:%S")
        device = fence_device_collection.find_one({"jt808_phone_num": phone_num})
        if not device:
            device = device_service.get_device_by_holder_phone(phone_num)
        direction = _direction(event_type)

        device_id = device.get("device_id") if device else phone_num
        doc = {
            "device_id": device_id,
            "jt808_phone_num": phone_num,
            "personnel_id": (device.get("personnel_id") or device.get("holder_id")) if device else None,
            "holder": device.get("holder") if device else None,
            "holderPhone": device.get("holderPhone") if device else phone_num,
            "branch_id": device.get("branch_id") if device else None,
            "project_id": device.get("project_id") if device else None,
            "project": device.get("project") if device else None,
            "team_id": device.get("team_id") if device else None,
            "team": device.get("team") if device else None,
            "direction": direction,
            "type": direction,
            "source": "jt808",
            "check_time": check_time_text,
            "lat": lat,
            "lng": lon,
            "created_at": _now_text(),
        }

        result = attendance_collection.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        logger.info(f"Recorded attendance: device={device_id}, direction={direction}, time={check_time_text}")
        return doc

    def get_device_week_records(self, device_id: str) -> list[dict]:
        since = datetime.now() - timedelta(days=7)
        docs = list(
            attendance_collection.find(
                {
                    "device_id": device_id,
                    "check_time": {"$gte": since.strftime("%Y-%m-%d %H:%M:%S")},
                },
                {"_id": 0},
            ).sort("check_time", -1)
        )
        return docs


attendance_service = AttendanceService()
