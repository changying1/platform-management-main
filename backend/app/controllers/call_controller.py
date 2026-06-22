import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from app.core.security import get_current_user
from app.schemas.call_schema import CallCreate, GroupCallSessionOut, TtsBatchOut, TtsSendRequest
from app.services.call_service import GroupCallService

router = APIRouter(prefix="/call", tags=["Group Call"])
service = GroupCallService()


@router.post("/initiate", response_model=GroupCallSessionOut)
def start_group_call(call_data: CallCreate, current_user: dict = Depends(get_current_user)):
    return service.initiate_call(call_data.initiator_id, call_data.member_ids, user=current_user)


@router.post("/voice-records")
async def save_voice_record(
    audio: UploadFile = File(...),
    transcript: str = Form(default=""),
    record_type: str = Form(default="group"),
    to_names: str = Form(default="[]"),
    target_phones: str = Form(default="[]"),
    duration: int = Form(default=1),
    batch_id: str | None = Form(default=None),
    operator: str | None = Form(default=None),
    current_user: dict = Depends(get_current_user),
):
    def parse_json_list(raw: str) -> list[str]:
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            return []
        if not isinstance(value, list):
            return []
        return [str(item) for item in value if item]

    return service.save_voice_record(
        audio_file=audio.file,
        original_filename=audio.filename or "",
        transcript=transcript,
        record_type=record_type,
        to_names=parse_json_list(to_names),
        target_phones=parse_json_list(target_phones),
        duration=duration,
        audio_mime_type=audio.content_type,
        batch_id=batch_id,
        operator=operator,
        user=current_user,
    )


@router.get("/voice-records")
def list_voice_records(
    limit: int = Query(default=100, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    return service.list_voice_records(limit=limit, user=current_user)


@router.get("/{call_id}", response_model=GroupCallSessionOut)
def get_group_call(call_id: int, current_user: dict = Depends(get_current_user)):
    return service.get_call(call_id, user=current_user)


@router.get("", response_model=list[GroupCallSessionOut])
def list_group_calls(
    limit: int = Query(default=20, ge=1, le=100),
    active_only: bool = Query(default=False),
    current_user: dict = Depends(get_current_user),
):
    return service.list_calls(limit=limit, active_only=active_only, user=current_user)


@router.post("/{call_id}/end", response_model=GroupCallSessionOut)
def end_group_call(call_id: int, current_user: dict = Depends(get_current_user)):
    return service.end_call(call_id, user=current_user)


@router.post("/tts/send", response_model=TtsBatchOut)
def send_group_tts(payload: TtsSendRequest, current_user: dict = Depends(get_current_user)):
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
        user=current_user,
    )


@router.get("/tts/batch/{batch_id}", response_model=TtsBatchOut)
def get_tts_batch(batch_id: str, current_user: dict = Depends(get_current_user)):
    batch = service.get_tts_batch(batch_id, user=current_user)
    if batch["requested_count"] == 0:
        raise HTTPException(status_code=404, detail="TTS batch not found")
    return batch


@router.get("/tts/batches", response_model=list[TtsBatchOut])
def list_tts_batches(
    limit: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    return service.list_tts_batches(limit=limit, user=current_user)

