from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.schemas.alarm_schema import AlarmCreate, AlarmUpdate
from app.utils.logger import get_logger
from app.core.database import get_mongo_db, get_next_sequence
from app.services.video_service import VideoService
from app.services.notification_service import notification_service

from datetime import datetime, timedelta
import asyncio

# 不再恢复 SQL 报警主链
# from app.models.alarm_records import AlarmRecord
# from app.models.device import Device
# from app.models.fence import ElectronicFence

logger = get_logger("AlarmService")

class AlarmService:
    def _safe_int(self, value):
        if value in [None, "", "null", "None"]:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _get_video_device_by_id(self, device_id: int | str):
        video_service = VideoService()
        return video_service._get_video_runtime_by_id(int(device_id))
    
    def _alarm_collection(self):
        return get_mongo_db()["alarm_record"]

    def _fence_collection(self):
        mongo = get_mongo_db()
        for name in ["electronic_fence", "electronic_fences", "fence", "fences"]:
            if name in mongo.list_collection_names():
                return mongo[name]
        return None

    def _project_device_collection(self):
        mongo = get_mongo_db()
        for name in ["project_device", "project_devices"]:
            if name in mongo.list_collection_names():
                return mongo[name]
        return None

    def _find_fence_doc_by_id(self, fence_id: int | str):
        collection = self._fence_collection()
        if collection is None or fence_id is None:
            return None

        candidates = [{"id": int(fence_id)}]
        candidates.append({"id": str(fence_id)})

        return collection.find_one({"$or": candidates})

    def _infer_project_id_from_device(self, device_id: int | str):
        collection = self._project_device_collection()
        if collection is None:
            return None

        candidates = [{"device_id": int(device_id)}]
        candidates.append({"device_id": str(device_id)})

        row = collection.find_one({"$or": candidates})
        if not row:
            return None

        return self._safe_int(row.get("project_id"))

    def _apply_fence_business_fields(self, alarm):
        """
        保留真实围栏业务语义：
        1. fence_id 存在时尝试查围栏
        2. 生成 description
        3. 生成/修正 location
        4. 若未传 project_id，尝试从设备关联推断
        """
        if alarm.fence_id == 0:
            alarm.fence_id = None
        if alarm.project_id == 0:
            alarm.project_id = None

        if alarm.fence_id is not None:
            fence = self._find_fence_doc_by_id(alarm.fence_id)
            if fence:
                behavior = str(fence.get("behavior") or "").strip()
                behavior_text = "禁入" if behavior == "No Entry" else "禁出"
                fence_name = fence.get("name") or f"Fence-{alarm.fence_id}"

                if not alarm.description:
                    alarm.description = f"[电子围栏-{behavior_text}] {fence_name} 触发报警"

                if alarm.location and "," in str(alarm.location):
                    alarm.location = f"{fence_name} ({alarm.location})"
                elif not alarm.location:
                    alarm.location = fence_name

                if alarm.project_id is None:
                    fence_project_id = fence.get("project_id")
                    if fence_project_id not in [None, "", 0, "0"]:
                        alarm.project_id = fence_project_id

        if alarm.project_id is None:
            inferred_project_id = self._infer_project_id_from_device(alarm.device_id)
            if inferred_project_id not in [None, "", 0, "0"]:
                alarm.project_id = inferred_project_id

        return alarm

    def _mongo_alarm_to_out(self, doc: dict) -> dict:
        if not doc:
            return {}

        doc = dict(doc)
        doc.pop("_id", None)

        return {
            "id": self._safe_int(doc.get("id")) or doc.get("id"),
            "device_id": str(doc.get("device_id")) if doc.get("device_id") is not None else "",
            "fence_id": self._safe_int(doc.get("fence_id")),
            "project_id": self._safe_int(doc.get("project_id")),
            "alarm_type": doc.get("alarm_type"),
            "severity": doc.get("severity"),
            "timestamp": doc.get("timestamp"),
            "description": doc.get("description"),
            "status": doc.get("status"),
            "handled_at": doc.get("handled_at"),
            "location": doc.get("location"),
            "recording_path": doc.get("recording_path") or "",
            "recording_status": doc.get("recording_status") or "pending",
            "recording_error": doc.get("recording_error") or "",
            "alarm_image_path": doc.get("alarm_image_path") or "",
            "personnel_id": doc.get("personnel_id") or "",
            "person_name": doc.get("person_name") or doc.get("person", {}).get("username") or "未知",
            "person": doc.get("person") or {},
        }

    def _find_alarm_doc_by_id(self, alarm_id: int | str):
        return self._alarm_collection().find_one({"id": int(alarm_id)})

    def _update_alarm_fields(self, alarm_id: int | str, updates: dict):
        clean_updates = {k: v for k, v in (updates or {}).items() if k != "_id"}
        if not clean_updates:
            return
        self._alarm_collection().update_one(
            {"id": int(alarm_id)},
            {"$set": clean_updates}
        )

    def _notify_alarm_created(self, alarm_doc: dict):
        """
        低风险保留上游 notification_service 功能。

        注意：
        1. 报警主链仍然以 MongoDB 写入为准；
        2. 通知失败不能影响报警保存；
        3. 这里不依赖 SQL 的 new_alarm 对象，只传 MongoDB alarm dict。
        """
        try:
            alarm_data = self._mongo_alarm_to_out(alarm_doc)

            # 优先兼容 upstream/main 里的 handle_alarm 通知方式
            handle_alarm = getattr(notification_service, "handle_alarm", None)
            if callable(handle_alarm):
                import json
                import os

                config_path = "data/system_config.json"
                recipients = []

                if os.path.exists(config_path):
                    with open(config_path, "r", encoding="utf-8") as f:
                        config = json.load(f)
                        recipients = config.get("notificationRecipients", [])

                if recipients:
                    alarm_level = alarm_data.get("severity") or "medium"
                    if alarm_level == "normal":
                        alarm_level = "low"
                    elif alarm_level == "high":
                        alarm_level = "severe"

                    result = handle_alarm(
                        alarm_level=alarm_level,
                        alarm_type=alarm_data.get("alarm_type"),
                        alarm_message=alarm_data.get("description") or "安全告警触发",
                        recipients=recipients,
                    )

                    if asyncio.iscoroutine(result):
                        try:
                            loop = asyncio.get_running_loop()
                            loop.create_task(result)
                        except RuntimeError:
                            asyncio.run(result)

                return

            # 兼容其他可能的方法名
            notify_func = None
            for method_name in [
                "create_alarm_notification",
                "send_alarm_notification",
                "notify_alarm",
                "create_notification",
            ]:
                func = getattr(notification_service, method_name, None)
                if callable(func):
                    notify_func = func
                    break

            if notify_func is None:
                logger.warning("notification_service has no compatible alarm notification method, skipped.")
                return

            result = notify_func(alarm_data)

            if asyncio.iscoroutine(result):
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(result)
                except RuntimeError:
                    asyncio.run(result)

        except Exception as e:
            logger.warning(f"Alarm notification failed, ignored: {str(e)}")
    
    def create_alarm(self, db: Session, alarm: AlarmCreate):
        logger.warning(f"ALARM TRIGGERED: Device {alarm.device_id}, Type {alarm.alarm_type}")

        # 1. 重复报警抑制 (1秒内完全相同的设备+类型+围栏报警视为重复)
        duplicate_window_seconds = 5
        one_second_ago = datetime.utcnow() - timedelta(seconds=duplicate_window_seconds)
        exists = self._alarm_collection().find_one({
            "device_id": str(alarm.device_id),
            "alarm_type": alarm.alarm_type,
            "fence_id": self._safe_int(alarm.fence_id),
            "timestamp": {"$gte": one_second_ago},
        })
        if exists:
            logger.info("Duplicate alarm suppressed")
            return self._mongo_alarm_to_out(exists)
        
        device = self._get_video_device_by_id(alarm.device_id)
        if not device:
            raise HTTPException(status_code=400, detail=f"Device not found: {alarm.device_id}")

        # 保留围栏/定位/项目真实业务语义，但不再依赖旧 SQL ORM
        alarm = self._apply_fence_business_fields(alarm)
        project_id = self._safe_int(alarm.project_id)

        next_id = int(get_next_sequence("alarm_record_id"))
        payload = {
            "id": next_id,
            "device_id": str(alarm.device_id),
            "fence_id": self._safe_int(alarm.fence_id),
            "project_id": project_id,
            "alarm_type": alarm.alarm_type,
            "severity": alarm.severity,
            "timestamp": datetime.utcnow(),
            "description": alarm.description,
            "status": alarm.status,
            "handled_at": None,
            "location": alarm.location,
            "recording_path": "",
            "recording_status": "pending",
            "recording_error": "",
            "alarm_image_path": "",
        }
        try:
            self._alarm_collection().insert_one(payload)
            saved = self._find_alarm_doc_by_id(next_id)

            logger.warning(f"SUCCESSFULLY SAVED ALARM: ID {next_id}")

            # 低风险保留上游通知功能：
            # 通知失败只记录 warning，不影响 MongoDB 报警保存和前端显示。
            self._notify_alarm_created(saved or payload)

            return self._mongo_alarm_to_out(saved or payload)

        except Exception as e:
            logger.error(f"DATABASE SAVE ERROR: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database save error: {str(e)}")
        
    def get_alarms(self, db: Session, skip: int = 0, limit: int = 100, project_id: int | None = None):
        query = {}
        if project_id is not None:
            query["project_id"] = project_id

        docs = list(
            self._alarm_collection()
            .find(query)
            .sort("timestamp", -1)
            .skip(max(0, int(skip)))
            .limit(max(1, int(limit)))
        )
        return [self._mongo_alarm_to_out(doc) for doc in docs]

    def update_alarm(self, db: Session, alarm_id: int, update_data: AlarmUpdate):
        db_alarm = self._find_alarm_doc_by_id(alarm_id)
        if not db_alarm:
            return None

        updates = {}

        if update_data.status:
            updates["status"] = update_data.status
            if update_data.status == "resolved":
                updates["handled_at"] = datetime.now()

        if update_data.description:
            updates["description"] = update_data.description

        if update_data.severity:
            updates["severity"] = update_data.severity

        self._update_alarm_fields(alarm_id, updates)
        updated = self._find_alarm_doc_by_id(alarm_id)
        return self._mongo_alarm_to_out(updated)

    def delete_alarm(self, db: Session, alarm_id: int):
        db_alarm = self._find_alarm_doc_by_id(alarm_id)
        if db_alarm:
            self._alarm_collection().delete_one({"id": int(alarm_id)})
            return True
        return False
