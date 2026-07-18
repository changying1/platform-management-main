from __future__ import annotations

from datetime import datetime
from typing import Optional

from app.core.database import get_mongo_collection
from app.schemas.device_registration_schema import CameraRegistrationResponse
from app.utils.logger import get_logger


logger = get_logger("DeviceRegistrationRepository")


class DeviceRegistrationRepository:
    collection_name = "device_registration_records"

    def _collection(self):
        return get_mongo_collection(self.collection_name)

    def save_record(
        self,
        *,
        video_id: Optional[str],
        device_serial: str,
        sim_card_id: Optional[str],
        result: CameraRegistrationResponse,
    ) -> None:
        now = datetime.utcnow().isoformat()
        doc = {
            "video_id": str(video_id) if video_id is not None else None,
            "device_serial": device_serial,
            "sim_card_id": sim_card_id,
            "local_status": result.local.status,
            "local_message": result.local.message,
            "ezviz_status": result.ezviz.status,
            "ezviz_message": result.ezviz.message,
            "hikiot_status": result.hikiot.status,
            "hikiot_message": result.hikiot.message,
            "created_at": now,
            "updated_at": now,
        }
        try:
            self._collection().insert_one(doc)
        except Exception as exc:
            logger.warning(
                "Failed to write device registration record video_id=%s serial=%s: %s",
                video_id,
                device_serial,
                exc,
            )
            raise
