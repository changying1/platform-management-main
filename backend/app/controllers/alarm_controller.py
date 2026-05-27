from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.alarm_schema import AlarmOut, AlarmCreate, AlarmUpdate
from app.services.alarm_service import AlarmService
from app.core.database import get_next_sequence
from app.core.ws_manager import push_alarm_threadsafe
from datetime import datetime

router = APIRouter(prefix="/alarms", tags=["Alarm Records"])
service = AlarmService()


class AlarmTestRequest(BaseModel):
    severity: str = "medium"
    alarm_type: str = "system_settings_test"
    description: str | None = None

@router.get("/", response_model=list[AlarmOut])
def get_alarms(skip: int = 0, limit: int = 100, project_id: int | None = None, source_type: str | None = None, db: Session = Depends(get_db)):
    return service.get_alarms(db, skip, limit, project_id=project_id, source_type=source_type)

# @router.post("/", response_model=AlarmOut)
@router.post("/", response_model=AlarmOut)
def create_alarm(alarm: AlarmCreate, db: Session = Depends(get_db)):
    new_alarm = service.create_alarm(db, alarm)

    return new_alarm


@router.post("/test")
def create_test_alarm(payload: AlarmTestRequest):
    severity = payload.severity if payload.severity in {"low", "medium", "high", "severe"} else "medium"
    normalized_severity = "high" if severity == "severe" else severity
    next_id = int(get_next_sequence("alarm_record_id"))
    alarm_doc = {
        "id": next_id,
        "device_id": "settings-test",
        "fence_id": None,
        "project_id": None,
        "alarm_type": payload.alarm_type,
        "severity": normalized_severity,
        "timestamp": datetime.utcnow(),
        "description": payload.description or f"系统设置页面{severity}级告警测试",
        "status": "pending",
        "handled_at": None,
        "location": "系统设置/告警测试",
        "recording_path": "",
        "recording_status": "not_required",
        "recording_error": "",
        "alarm_image_path": "",
    }

    service._alarm_collection().insert_one(alarm_doc)
    saved = service._find_alarm_doc_by_id(next_id) or alarm_doc
    alarm_out = service._mongo_alarm_to_out(saved)
    service._notify_alarm_created(saved)
    push_alarm_threadsafe(alarm_out)

    return {"success": True, "alarm": alarm_out}

@router.put("/{alarm_id}", response_model=AlarmOut)
def update_alarm(alarm_id: int, alarm: AlarmUpdate, db: Session = Depends(get_db)):
    updated = service.update_alarm(db, alarm_id, alarm)
    if not updated:
        raise HTTPException(status_code=404, detail="Alarm not found")
    return updated

@router.delete("/{alarm_id}")
def delete_alarm(alarm_id: int, db: Session = Depends(get_db)):
    success = service.delete_alarm(db, alarm_id)
    if not success:
        raise HTTPException(status_code=404, detail="Alarm not found")
    return {"status": "success"}
