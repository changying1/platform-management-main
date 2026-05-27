import uuid
from datetime import datetime
from pathlib import Path
from typing import BinaryIO

from fastapi import HTTPException
from pymongo import DESCENDING, ReturnDocument

from app.core.database import get_mongo_collection, get_next_sequence
from app.services.tts_queue_service import tts_queue_service
from app.utils.logger import get_logger

logger = get_logger("GroupCallService")

STATUS_ACTIVE = "ACTIVE"
STATUS_ENDED = "ENDED"


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

    def initiate_call(self, initiator_id: int, member_ids: list[int]) -> dict:
        normalized_members = self._normalize_member_ids(initiator_id, member_ids)
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

    def get_call(self, call_id: int) -> dict:
        session = self.collection.find_one({"id": int(call_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Group call session not found")
        return self._serialize_session(session)

    def list_calls(self, limit: int = 20, active_only: bool = False) -> list[dict]:
        query = {}
        if active_only:
            query["status"] = STATUS_ACTIVE

        sessions = list(
            self.collection
            .find(query)
            .sort([("start_time", DESCENDING), ("id", DESCENDING)])
            .limit(limit)
        )
        return [self._serialize_session(item) for item in sessions]

    def end_call(self, call_id: int) -> dict:
        now = datetime.utcnow()
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
    ):
        logger.info(f"Queueing JT808 TTS to {len(target_phones)} target(s)")
        return tts_queue_service.enqueue_batch(
            text=text,
            target_phones=target_phones,
            priority=priority,
            max_retries=max_retries,
            request_source=request_source,
            operator=operator,
        )

    def get_tts_batch(self, batch_id: str):
        return tts_queue_service.get_batch(batch_id)

    def list_tts_batches(self, limit: int = 20):
        return tts_queue_service.list_batches(limit=limit)

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
    ) -> dict:
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
            "target_phones": [str(item) for item in target_phones if item],
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

    def list_voice_records(self, limit: int = 100) -> list[dict]:
        records = list(
            self.voice_record_collection
            .find({})
            .sort([("created_at", DESCENDING), ("id", DESCENDING)])
            .limit(limit)
        )
        return [self._serialize_voice_record(record) for record in records]
