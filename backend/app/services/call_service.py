import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.database import ensure_schema_compatibility
from app.models.group_call import GroupCallSession
from app.services.tts_queue_service import tts_queue_service
from app.utils.logger import get_logger

logger = get_logger("GroupCallService")

STATUS_ACTIVE = "ACTIVE"
STATUS_ENDED = "ENDED"


class GroupCallService:
    def _ensure_table(self, db: Session):
        GroupCallSession.__table__.create(bind=db.get_bind(), checkfirst=True)
        ensure_schema_compatibility()

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

    def _serialize_session(self, session: GroupCallSession) -> dict:
        raw_member_ids = (session.member_ids or "").split(",")
        member_ids = [int(item) for item in raw_member_ids if item.strip()]

        return {
            "id": session.id,
            "room_id": session.room_id,
            "initiator_id": session.initiator_id,
            "member_ids": member_ids,
            "start_time": session.start_time,
            "end_time": session.end_time,
            "status": session.status,
        }

    def initiate_call(self, db: Session, initiator_id: int, member_ids: list[int]) -> dict:
        self._ensure_table(db)

        normalized_members = self._normalize_member_ids(initiator_id, member_ids)
        if not normalized_members:
            raise HTTPException(status_code=400, detail="At least one valid group member is required")

        room_id = f"gc-{uuid.uuid4().hex[:12]}"
        session = GroupCallSession(
            room_id=room_id,
            initiator_id=int(initiator_id),
            member_ids=",".join(str(item) for item in normalized_members),
            status=STATUS_ACTIVE,
            start_time=datetime.utcnow(),
        )

        db.add(session)
        db.commit()
        db.refresh(session)

        logger.info(
            f"User {initiator_id} started group call {session.room_id} "
            f"with members {normalized_members}"
        )
        return self._serialize_session(session)

    def get_call(self, db: Session, call_id: int) -> dict:
        self._ensure_table(db)

        session = (
            db.query(GroupCallSession)
            .filter(GroupCallSession.id == call_id)
            .first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="Group call session not found")
        return self._serialize_session(session)

    def list_calls(self, db: Session, limit: int = 20, active_only: bool = False) -> list[dict]:
        self._ensure_table(db)

        query = db.query(GroupCallSession)
        if active_only:
            query = query.filter(GroupCallSession.status == STATUS_ACTIVE)

        sessions = (
            query
            .order_by(GroupCallSession.start_time.desc(), GroupCallSession.id.desc())
            .limit(limit)
            .all()
        )
        return [self._serialize_session(item) for item in sessions]

    def end_call(self, db: Session, call_id: int) -> dict:
        self._ensure_table(db)

        session = (
            db.query(GroupCallSession)
            .filter(GroupCallSession.id == call_id)
            .first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="Group call session not found")

        if session.status != STATUS_ENDED:
            session.status = STATUS_ENDED
            session.end_time = datetime.utcnow()
            db.commit()
            db.refresh(session)

        logger.info(f"Group call {session.room_id} ended")
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
