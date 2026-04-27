from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.call_schema import CallCreate, GroupCallSessionOut, TtsBatchOut, TtsSendRequest
from app.services.call_service import GroupCallService

router = APIRouter(prefix="/call", tags=["Group Call"])
service = GroupCallService()


@router.post("/initiate", response_model=GroupCallSessionOut)
def start_group_call(call_data: CallCreate, db: Session = Depends(get_db)):
    return service.initiate_call(db, call_data.initiator_id, call_data.member_ids)


@router.get("/{call_id}", response_model=GroupCallSessionOut)
def get_group_call(call_id: int, db: Session = Depends(get_db)):
    return service.get_call(db, call_id)


@router.get("", response_model=list[GroupCallSessionOut])
def list_group_calls(
    limit: int = Query(default=20, ge=1, le=100),
    active_only: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    return service.list_calls(db, limit=limit, active_only=active_only)


@router.post("/{call_id}/end", response_model=GroupCallSessionOut)
def end_group_call(call_id: int, db: Session = Depends(get_db)):
    return service.end_call(db, call_id)


@router.post("/tts/send", response_model=TtsBatchOut)
def send_group_tts(payload: TtsSendRequest):
    text = payload.text.strip()
    target_phones = [
        phone.strip()
        for phone in payload.target_phones
        if phone and phone.strip()
    ]

    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if not target_phones:
        raise HTTPException(status_code=400, detail="No target devices selected")

    return service.enqueue_tts(
        text=text,
        target_phones=target_phones,
        priority=payload.priority,
        max_retries=payload.max_retries,
        request_source=payload.request_source,
        operator=payload.operator,
    )


@router.get("/tts/batch/{batch_id}", response_model=TtsBatchOut)
def get_tts_batch(batch_id: str):
    batch = service.get_tts_batch(batch_id)
    if batch["requested_count"] == 0:
        raise HTTPException(status_code=404, detail="TTS batch not found")
    return batch


@router.get("/tts/batches", response_model=list[TtsBatchOut])
def list_tts_batches(limit: int = Query(default=20, ge=1, le=100)):
    return service.list_tts_batches(limit=limit)
