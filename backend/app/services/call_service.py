import uuid
from datetime import datetime
from pathlib import Path
from typing import BinaryIO

from fastapi import HTTPException
from pymongo import DESCENDING, ReturnDocument

from app.core.data_scope import in_scope, is_hq
from app.core.database import get_mongo_collection, get_next_sequence
from app.services.tts_queue_service import (
    STATUS_ACKED,
    STATUS_FAILED,
    STATUS_QUEUED,
    STATUS_RETRY_WAIT,
    STATUS_SENDING,
    tts_queue_service,
)
from app.utils.logger import get_logger

logger = get_logger("GroupCallService")

STATUS_ACTIVE = "ACTIVE"
STATUS_ENDED = "ENDED"

DEVICE_SCOPE_KWARGS = {
    "project_fields": ("project_id",),
    "grid_fields": ("grid_id",),
    "team_fields": ("team_id",),
    "branch_fields": ("branch_id",),
    "company_fields": ("company", "department"),
    "project_name_fields": ("project",),
    "team_name_fields": ("team", "workTeam", "work_team", "install_location"),
}

TARGET_LOOKUP_FIELDS = (
    "id",
    "device_id",
    "device_code",
    "device_serial",
    "phone_num",
    "holderPhone",
    "stream_url",
    "terminal_id",
    "terminalId",
    "terminal_no",
    "terminalNo",
    "device_no",
    "deviceNo",
    "imei",
)


def _text(value) -> str:
    return str(value or "").strip()


def _target_variants(value) -> list:
    raw = _text(value)
    if not raw:
        return []

    variants = [raw]
    trimmed = raw.lstrip("0")
    if trimmed and trimmed != raw:
        variants.append(trimmed)

    for item in list(variants):
        if item.isdigit():
            variants.append(int(item))

    return list(dict.fromkeys(variants))


class GroupCallService:
    def __init__(self):
        self.collection = get_mongo_collection("group_calls")
        self.voice_record_collection = get_mongo_collection("voice_records")
        self.voice_record_dir = Path(__file__).resolve().parents[2] / "static" / "voice_records"

    def _normalize_member_ids(self, initiator_id: int, member_ids: list[int]) -> list[int]:
        normalized: list[int] = []
        seen = {initiator_id}

        for member_id in member_ids:
            if member_id is None:
                continue

            normalized_id = int(member_id)
            if normalized_id in seen:
                continue

            normalized.append(normalized_id)
            seen.add(normalized_id)

        return normalized

    def _serialize_session(self, session: dict) -> dict:
        return {
            "id": int(session.get("id")),
            "room_id": session.get("room_id", ""),
            "initiator_id": int(session.get("initiator_id", 0)),
            "member_ids": [
                int(item)
                for item in session.get("member_ids", [])
                if item is not None
            ],
            "start_time": session.get("start_time"),
            "end_time": session.get("end_time"),
            "status": session.get("status", STATUS_ACTIVE),
        }

    def _is_unrestricted_user(self, user: dict | None) -> bool:
        return not user or is_hq(user)

    def _find_device_for_target(self, target_phone: str | int | None) -> dict | None:
        variants = _target_variants(target_phone)
        if not variants:
            return None

        query = {"$or": [{field: {"$in": variants}} for field in TARGET_LOOKUP_FIELDS]}
        for collection_name in ("device", "sql_devices"):
            device = get_mongo_collection(collection_name).find_one(query)
            if device:
                return device
        return None

    def _target_in_scope(self, target_phone: str | int | None, user: dict | None) -> bool:
        if self._is_unrestricted_user(user):
            return True

        device = self._find_device_for_target(target_phone)
        return bool(device and in_scope(device, user, **DEVICE_SCOPE_KWARGS))

    def _ensure_targets_in_scope(self, target_phones: list[str], user: dict | None) -> list[str]:
        unique_phones: list[str] = []
        seen = set()
        for phone in target_phones:
            normalized = _text(phone)
            if normalized and normalized not in seen:
                unique_phones.append(normalized)
                seen.add(normalized)

        unauthorized = [
            phone
            for phone in unique_phones
            if not self._target_in_scope(phone, user)
        ]
        if unauthorized:
            preview = "、".join(unauthorized[:5])
            suffix = "等" if len(unauthorized) > 5 else ""
            raise HTTPException(status_code=403, detail=f"无权限操作终端 {preview}{suffix}")

        return unique_phones

    def _session_in_scope(self, session: dict | None, user: dict | None) -> bool:
        if not session:
            return False
        if self._is_unrestricted_user(user):
            return True
        return any(
            self._target_in_scope(member_id, user)
            for member_id in session.get("member_ids", [])
        )

    def _empty_batch_response(self, batch_id: str, source: dict | None = None) -> dict:
        source = source or {}
        return {
            "batch_id": batch_id,
            "text": source.get("text", ""),
            "request_source": source.get("request_source"),
            "operator": source.get("operator"),
            "created_at": source.get("created_at") or datetime.utcnow(),
            "requested_count": 0,
            "queued_count": 0,
            "sending_count": 0,
            "acked_count": 0,
            "failed_count": 0,
            "retry_wait_count": 0,
            "jobs": [],
        }

    def _filter_batch_for_user(self, batch: dict, user: dict | None) -> dict:
        if self._is_unrestricted_user(user):
            return batch

        jobs = [
            job
            for job in batch.get("jobs", [])
            if self._target_in_scope(job.get("device_phone"), user)
        ]
        if not jobs:
            return self._empty_batch_response(batch.get("batch_id", ""), batch)

        def count(status: str) -> int:
            return sum(1 for job in jobs if job.get("status") == status)

        return {
            **batch,
            "requested_count": len(jobs),
            "queued_count": count(STATUS_QUEUED),
            "sending_count": count(STATUS_SENDING),
            "acked_count": count(STATUS_ACKED),
            "failed_count": count(STATUS_FAILED),
            "retry_wait_count": count(STATUS_RETRY_WAIT),
            "jobs": jobs,
        }

    def _voice_record_in_scope(self, record: dict, user: dict | None) -> bool:
        if self._is_unrestricted_user(user):
            return True
        return any(
            self._target_in_scope(phone, user)
            for phone in record.get("target_phones", [])
        )

    def initiate_call(self, initiator_id: int, member_ids: list[int], user: dict | None = None) -> dict:
        normalized_members = self._normalize_member_ids(initiator_id, member_ids)
        normalized_members = [
            int(item)
            for item in self._ensure_targets_in_scope([str(member_id) for member_id in normalized_members], user)
        ]
        if not normalized_members:
            raise HTTPException(status_code=400, detail="At least one valid group member is required")

        now = datetime.utcnow()
        room_id = f"gc-{uuid.uuid4().hex[:12]}"
        session = {
            "id": int(get_next_sequence("group_call_id")),
            "room_id": room_id,
            "initiator_id": int(initiator_id),
            "member_ids": normalized_members,
            "status": STATUS_ACTIVE,
            "start_time": now,
            "end_time": None,
            "created_at": now,
            "updated_at": now,
        }

        self.collection.insert_one(session)

        logger.info(
            f"User {initiator_id} started group call {room_id} "
            f"with members {normalized_members}"
        )
        return self._serialize_session(session)

    def get_call(self, call_id: int, user: dict | None = None) -> dict:
        session = self.collection.find_one({"id": int(call_id)})
        if not session or not self._session_in_scope(session, user):
            raise HTTPException(status_code=404, detail="Group call session not found")
        return self._serialize_session(session)

    def list_calls(self, limit: int = 20, active_only: bool = False, user: dict | None = None) -> list[dict]:
        query = {}
        if active_only:
            query["status"] = STATUS_ACTIVE

        query_limit = limit if self._is_unrestricted_user(user) else max(limit * 10, 100)
        sessions = list(
            self.collection
            .find(query)
            .sort([("start_time", DESCENDING), ("id", DESCENDING)])
            .limit(query_limit)
        )
        return [
            self._serialize_session(item)
            for item in sessions
            if self._session_in_scope(item, user)
        ][:limit]

    def end_call(self, call_id: int, user: dict | None = None) -> dict:
        now = datetime.utcnow()
        existing = self.collection.find_one({"id": int(call_id)})
        if not existing or not self._session_in_scope(existing, user):
            raise HTTPException(status_code=404, detail="Group call session not found")

        session = self.collection.find_one_and_update(
            {"id": int(call_id)},
            {
                "$set": {
                    "status": STATUS_ENDED,
                    "end_time": now,
                    "updated_at": now,
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        if not session:
            raise HTTPException(status_code=404, detail="Group call session not found")

        logger.info(f"Group call {session.get('room_id')} ended")
        return self._serialize_session(session)

    def enqueue_tts(
        self,
        *,
        text: str,
        target_phones: list[str],
        priority: int = 100,
        max_retries: int = 3,
        request_source: str = "group_call",
        operator: str | None = None,
        user: dict | None = None,
    ):
        target_phones = self._ensure_targets_in_scope(target_phones, user)
        logger.info(f"Queueing JT808 TTS to {len(target_phones)} target(s)")
        return tts_queue_service.enqueue_batch(
            text=text,
            target_phones=target_phones,
            priority=priority,
            max_retries=max_retries,
            request_source=request_source,
            operator=operator,
        )

    def get_tts_batch(self, batch_id: str, user: dict | None = None):
        return self._filter_batch_for_user(tts_queue_service.get_batch(batch_id), user)

    def list_tts_batches(self, limit: int = 20, user: dict | None = None):
        query_limit = limit if self._is_unrestricted_user(user) else max(limit * 10, 100)
        batches = []
        for batch in tts_queue_service.list_batches(limit=query_limit):
            scoped_batch = self._filter_batch_for_user(batch, user)
            if scoped_batch["requested_count"] > 0:
                batches.append(scoped_batch)
            if len(batches) >= limit:
                break
        return batches

    def _serialize_voice_record(self, record: dict) -> dict:
        return {
            "id": int(record.get("id")),
            "type": record.get("type", "group"),
            "source": record.get("source", "group_call"),
            "from": record.get("from", "群组通话"),
            "from_role": record.get("from_role", "语音通话"),
            "to_names": record.get("to_names", []),
            "target_phones": record.get("target_phones", []),
            "transcript": record.get("transcript", ""),
            "audio_url": record.get("audio_url", ""),
            "audio_mime_type": record.get("audio_mime_type"),
            "duration": int(record.get("duration", 0)),
            "batch_id": record.get("batch_id"),
            "created_at": record.get("created_at"),
        }

    def save_voice_record(
        self,
        *,
        audio_file: BinaryIO,
        original_filename: str,
        transcript: str,
        record_type: str,
        to_names: list[str],
        target_phones: list[str],
        duration: int,
        audio_mime_type: str | None = None,
        batch_id: str | None = None,
        operator: str | None = None,
        user: dict | None = None,
    ) -> dict:
        target_phones = self._ensure_targets_in_scope(target_phones, user)
        self.voice_record_dir.mkdir(parents=True, exist_ok=True)

        suffix = Path(original_filename or "").suffix.lower()
        if suffix not in {".webm", ".ogg", ".mp3", ".wav", ".m4a"}:
            suffix = ".webm"

        now = datetime.utcnow()
        record_id = int(get_next_sequence("voice_record_id"))
        filename = f"voice_{record_id}_{uuid.uuid4().hex[:8]}{suffix}"
        file_path = self.voice_record_dir / filename

        with file_path.open("wb") as output:
            while True:
                chunk = audio_file.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)

        normalized_type = record_type if record_type in {"broadcast", "group", "private"} else "group"
        record = {
            "id": record_id,
            "type": normalized_type,
            "source": "group_call",
            "from": operator or "群组通话",
            "from_role": "语音通话",
            "to_names": [str(item) for item in to_names if item],
            "target_phones": target_phones,
            "transcript": transcript.strip(),
            "audio_url": f"/static/voice_records/{filename}",
            "audio_mime_type": audio_mime_type,
            "duration": max(int(duration or 0), 1),
            "batch_id": batch_id,
            "created_at": now,
            "updated_at": now,
        }

        self.voice_record_collection.insert_one(record)
        return self._serialize_voice_record(record)

    def list_voice_records(self, limit: int = 100, user: dict | None = None) -> list[dict]:
        query_limit = limit if self._is_unrestricted_user(user) else max(limit * 10, 100)
        records = list(
            self.voice_record_collection
            .find({})
            .sort([("created_at", DESCENDING), ("id", DESCENDING)])
            .limit(query_limit)
        )
        return [
            self._serialize_voice_record(record)
            for record in records
            if self._voice_record_in_scope(record, user)
        ][:limit]
